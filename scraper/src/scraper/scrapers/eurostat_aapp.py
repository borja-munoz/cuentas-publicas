"""
Scraper AAPP SEC2010 — Cuentas consolidadas de las Administraciones Públicas españolas.

Fuentes:
  - Eurostat gov_10a_main (JSON-stat): ingresos y gastos AAPP, SEC2010, 1995–actual.
    https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_main
  - Eurostat nama_10_gdp (JSON-stat): PIB a precios corrientes, 1975–actual.
    https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp

Tablas destino: aapp_ingresos, aapp_gastos, pib_anual

Mapeo NA_ITEM → concepto canónico:
  Ingresos:
    TR              → total
    D2REC           → impuestos_produccion  (IVA, especiales, aranceles, etc.)
    D5REC           → impuestos_renta       (IRPF, Sociedades, etc.)
    D61REC          → cotizaciones          (cotizaciones sociales)
    D4REC           → rentas_propiedad      (dividendos, intereses cobrados, etc.)
    D7REC           → transferencias_corrientes  (UE, otras AAPP, etc.)
    D9REC           → transferencias_capital

  Gastos:
    TE              → total
    D1PAY           → remuneracion_empleados
    P2              → consumos_intermedios
    D3PAY           → subvenciones
    D41PAY          → intereses             (solo intereses, no toda renta de propiedad)
    D62PAY          → prestaciones_sociales  (pensiones, desempleo, etc.)
    D7PAY           → transferencias_corrientes
    D9PAY           → transferencias_capital
    P51G            → fbcf                  (formación bruta de capital fijo)
    B9              → saldo                 (capacidad/necesidad de financiación; negativo = déficit)
"""

from __future__ import annotations

import time

import duckdb
import requests
import pandas as pd
from rich.console import Console

from scraper.db import upsert

console = Console()

_API_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"

_SECTORS = ["S13", "S1311", "S1312", "S1313", "S1314"]

_SECTOR_NAMES = {
    "S13":   "Administraciones Públicas",
    "S1311": "Administración Central (Estado)",
    "S1312": "Administración Regional (CCAA)",
    "S1313": "Administración Local (CCLL)",
    "S1314": "Seguridad Social",
}

# NA_ITEM → (concepto canónico, nombre legible, tabla destino: 'ingresos' | 'gastos')
# Los códigos reales del dataset gov_10a_main usan sufijos REC (received) / PAY (paid).
_ITEM_MAP: dict[str, tuple[str, str, str]] = {
    # Ingresos
    "TR":    ("total",                     "Total ingresos",                      "ingresos"),
    "D2REC": ("impuestos_produccion",      "Impuestos sobre producción e importación", "ingresos"),
    "D5REC": ("impuestos_renta",           "Impuestos sobre renta y patrimonio",   "ingresos"),
    "D61REC":("cotizaciones",              "Cotizaciones sociales netas",          "ingresos"),
    "D4REC": ("rentas_propiedad",          "Rentas de la propiedad (ingresos)",    "ingresos"),
    "D7REC": ("transferencias_corrientes", "Transferencias corrientes recibidas",  "ingresos"),
    "D9REC": ("transferencias_capital",    "Transferencias de capital recibidas",  "ingresos"),
    # Gastos
    "TE":    ("total",                     "Total gastos",                         "gastos"),
    "D1PAY": ("remuneracion_empleados",    "Remuneración de asalariados",          "gastos"),
    "P2":    ("consumos_intermedios",      "Consumos intermedios",                 "gastos"),
    "D3PAY": ("subvenciones",              "Subvenciones",                         "gastos"),
    "D41PAY":("intereses",                 "Intereses",                            "gastos"),
    "D62PAY":("prestaciones_sociales",     "Prestaciones sociales (excl. especie)", "gastos"),
    "D7PAY": ("transferencias_corrientes", "Transferencias corrientes pagadas",    "gastos"),
    "D9PAY": ("transferencias_capital",    "Transferencias de capital pagadas",    "gastos"),
    "P51G":  ("fbcf",                      "Formación bruta de capital fijo",      "gastos"),
    "B9":    ("saldo",                     "Capacidad/necesidad de financiación",  "gastos"),
}

_ALL_ITEMS = list(_ITEM_MAP.keys())
_FIRST_YEAR = 1995


def _build_url(dataset: str, params: dict[str, str | list[str]]) -> str:
    parts = []
    for k, v in params.items():
        if isinstance(v, list):
            parts.extend(f"{k}={x}" for x in v)
        else:
            parts.append(f"{k}={v}")
    return f"{_API_BASE}{dataset}?" + "&".join(parts)


def _fetch_main(sector: str, timeout: int = 45) -> dict | None:
    """Descarga todos los NA_ITEMs de gov_10a_main para un sector."""
    url = _build_url("gov_10a_main", {
        "geo":             "ES",
        "unit":            "MIO_EUR",
        "sector":          sector,
        "na_item":         _ALL_ITEMS,
        "sinceTimePeriod": str(_FIRST_YEAR),
    })
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning gov_10a_main ({sector}): {exc}[/yellow]")
        return None


def _fetch_pib(timeout: int = 30) -> dict | None:
    """Descarga el PIB español de nama_10_gdp."""
    url = _build_url("nama_10_gdp", {
        "geo":             "ES",
        "na_item":         "B1GQ",
        "unit":            "CP_MEUR",
        "sinceTimePeriod": str(_FIRST_YEAR),
    })
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning nama_10_gdp: {exc}[/yellow]")
        return None


def _parse_jsonstat(data: dict, sector: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Parsea un JSON-stat de gov_10a_main para un sector.
    Devuelve (df_ingresos, df_gastos).

    El JSON-stat tiene dimensiones [freq, unit, na_item, sector, geo, time] pero
    al filtrar a un geo y sector concretos, las dimensiones activas son na_item + time.
    """
    dims   = data["id"]
    sizes  = data["size"]
    _raw   = data["value"]
    values: dict[int, float] = (
        {int(k): v for k, v in _raw.items()} if isinstance(_raw, dict)
        else {i: v for i, v in enumerate(_raw) if v is not None}
    )

    dim_meta = data["dimension"]
    dim_index: dict[str, dict[str, int]] = {}
    for d in dims:
        cat = dim_meta[d]["category"]
        dim_index[d] = cat["index"]

    # Calcular strides de derecha a izquierda
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    item_dim = dims.index("na_item")
    time_dim = dims.index("time")

    item_index = dim_index["na_item"]
    time_index = dim_index["time"]

    ingresos_rows: list[dict] = []
    gastos_rows:   list[dict] = []

    for na_item, item_pos in item_index.items():
        if na_item not in _ITEM_MAP:
            continue
        concepto, concepto_nom, tabla = _ITEM_MAP[na_item]

        for year_str, year_pos in time_index.items():
            flat_idx = item_pos * strides[item_dim] + year_pos * strides[time_dim]
            val = values.get(flat_idx)
            if val is None:
                continue
            try:
                year = int(year_str)
            except ValueError:
                continue

            row = {
                "year":         year,
                "subsector":    sector,
                "concepto":     concepto,
                "concepto_nom": concepto_nom,
                "importe":      float(val),
            }
            if tabla == "ingresos":
                ingresos_rows.append(row)
            else:
                gastos_rows.append(row)

    return pd.DataFrame(ingresos_rows), pd.DataFrame(gastos_rows)


def _parse_pib(data: dict) -> pd.DataFrame:
    """Parsea el JSON-stat de nama_10_gdp → DataFrame con columnas year, pib."""
    dims   = data["id"]
    sizes  = data["size"]
    _raw   = data["value"]
    values: dict[int, float] = (
        {int(k): v for k, v in _raw.items()} if isinstance(_raw, dict)
        else {i: v for i, v in enumerate(_raw) if v is not None}
    )

    time_dim   = dims.index("time")
    time_index = data["dimension"]["time"]["category"]["index"]
    strides    = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    rows = []
    for year_str, year_pos in time_index.items():
        flat_idx = year_pos * strides[time_dim]
        val = values.get(flat_idx)
        if val is None:
            continue
        try:
            year = int(year_str)
        except ValueError:
            continue
        rows.append({"year": year, "pib": float(val)})

    return pd.DataFrame(rows)


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga AAPP SEC2010 (ingresos + gastos + PIB) de Eurostat."""
    all_ingresos: list[pd.DataFrame] = []
    all_gastos:   list[pd.DataFrame] = []

    for sector in _SECTORS:
        console.print(f"  SEC2010 {sector} ({_SECTOR_NAMES[sector]})…")
        data = _fetch_main(sector)
        if data is None:
            console.print(f"    [yellow]Sin respuesta para {sector}.[/yellow]")
            time.sleep(0.5)
            continue

        try:
            df_ing, df_gas = _parse_jsonstat(data, sector)
        except Exception as exc:
            console.print(f"    [red]Error parseando {sector}: {exc}[/red]")
            time.sleep(0.5)
            continue

        if year is not None:
            df_ing = df_ing[df_ing["year"] == year]
            df_gas = df_gas[df_gas["year"] == year]

        if not df_ing.empty:
            all_ingresos.append(df_ing)
            console.print(f"    ingresos: {len(df_ing)} filas.")
        if not df_gas.empty:
            all_gastos.append(df_gas)
            console.print(f"    gastos:   {len(df_gas)} filas.")

        time.sleep(0.5)

    if all_ingresos:
        df_ing_total = pd.concat(all_ingresos, ignore_index=True)
        _cast_str_cols(df_ing_total)
        delete_ing = (
            f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
            if year is not None
            else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
        )
        n = upsert(conn, "aapp_ingresos", df_ing_total, delete_where=delete_ing)
        console.print(f"  [green]aapp_ingresos: {n} filas insertadas.[/green]")

    if all_gastos:
        df_gas_total = pd.concat(all_gastos, ignore_index=True)
        _cast_str_cols(df_gas_total)
        delete_gas = (
            f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
            if year is not None
            else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
        )
        n = upsert(conn, "aapp_gastos", df_gas_total, delete_where=delete_gas)
        console.print(f"  [green]aapp_gastos: {n} filas insertadas.[/green]")

    # PIB
    console.print("  PIB (Eurostat nama_10_gdp)…")
    pib_data = _fetch_pib()
    if pib_data is not None:
        try:
            df_pib = _parse_pib(pib_data)
            if year is not None:
                df_pib = df_pib[df_pib["year"] == year]
            if not df_pib.empty:
                delete_pib = f"year = {year}" if year is not None else "1=1"
                n = upsert(conn, "pib_anual", df_pib, delete_where=delete_pib)
                console.print(f"  [green]pib_anual: {n} filas insertadas.[/green]")
        except Exception as exc:
            console.print(f"  [red]Error parseando PIB: {exc}[/red]")
    else:
        console.print("  [yellow]Sin datos PIB.[/yellow]")


def _cast_str_cols(df: pd.DataFrame) -> None:
    for col in ["subsector", "concepto", "concepto_nom"]:
        if col in df.columns:
            df[col] = df[col].astype(object)
