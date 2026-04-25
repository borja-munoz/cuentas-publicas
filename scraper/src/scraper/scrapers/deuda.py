"""
Scraper Deuda PDE — Stock de deuda pública española por subsector.

Fuentes:
  - Eurostat gov_10dd_edpt1 (JSON-stat): deuda bruta consolidada (Maastricht), M€.
  - Eurostat gov_10dd_ggd (JSON-stat): deuda por instrumento, vencimiento y acreedor.

Tablas destino: deuda_pde, deuda_instrumento, deuda_vencimiento, deuda_tenedores

Mapeos gov_10dd_ggd:
  na_item (instrumento):
    GD      → total (Gross debt)
    GD_F2   → depositos        (Currency and deposits)
    GD_F3   → letras           (Short-term debt securities — Letras del Tesoro)
    GD_F4   → bonos            (Long-term debt securities — Bonos y Obligaciones)
    F4      → prestamos        (Loans — Préstamos)

  maturity (vencimiento):
    Y_LE1   → ≤1 año
    Y1-5    → 1-5 años
    Y5-10   → 5-10 años
    Y10-30  → 10-30 años
    Y_GT30  → >30 años

  sector2 (acreedor/tenedor):
    S1_S2       → Total acreedores
    S1          → Residentes (total)
    S2          → No residentes
    S121        → Banco Central (BCE/BdE)
    S122_S123   → Otros bancos (inst. financieras monetarias)
    S14_S15     → Hogares y ISFLSH
"""

from __future__ import annotations

import time

import duckdb
import pandas as pd
import requests
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

_FIRST_YEAR_PDE = 1995
_FIRST_YEAR_GGD = 2000

# Instrumentos a extraer de gov_10dd_ggd (na_item → nombre canónico)
_INSTRUMENTO_MAP = {
    "GD_F2": "Depósitos",
    "GD_F3": "Letras del Tesoro (c.p.)",
    "GD_F4": "Bonos y Obligaciones (l.p.)",
    "F4":    "Préstamos",
}

# Vencimientos a extraer (maturity → nombre canónico)
_VENCIMIENTO_MAP = {
    "Y_LE1":  "≤1 año",
    "Y1-5":   "1-5 años",
    "Y5-10":  "5-10 años",
    "Y10-30": "10-30 años",
    "Y_GT30": ">30 años",
}

# Tenedores/acreedores (sector2 → nombre canónico)
_TENEDOR_MAP = {
    "S121":     "Banco Central (BCE/BdE)",
    "S122_S123":"Otros bancos",
    "S1":       "Residentes (total)",
    "S2":       "No residentes",
    "S14_S15":  "Hogares",
}


# ---------------------------------------------------------------------------
# Helpers compartidos
# ---------------------------------------------------------------------------

def _get(url: str, timeout: int = 60) -> dict | None:
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning {url[:80]}…: {exc}[/yellow]")
        return None


def _decode_jsonstat(data: dict) -> tuple[list[str], list[int], dict[str, dict[str, int]], dict[int, float]]:
    """Extrae dimensiones, strides, índices y valores de un JSON-stat."""
    dims  = data["id"]
    sizes = data["size"]
    _raw  = data["value"]
    values: dict[int, float] = (
        {int(k): v for k, v in _raw.items()} if isinstance(_raw, dict)
        else {i: v for i, v in enumerate(_raw) if v is not None}
    )
    dim_meta = data["dimension"]
    dim_index: dict[str, dict[str, int]] = {
        d: dim_meta[d]["category"]["index"] for d in dims
    }
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]
    return dims, strides, dim_index, values


def _flat_idx(dims: list[str], strides: list[int], dim_index: dict[str, dict[str, int]],
              **pos: str) -> int:
    """Calcula el índice plano dado un valor por dimensión."""
    idx = 0
    for dim, val in pos.items():
        d = dims.index(dim)
        idx += dim_index[dim][val] * strides[d]
    return idx


# ---------------------------------------------------------------------------
# gov_10dd_edpt1 — Stock bruto PDE
# ---------------------------------------------------------------------------

def _fetch_pde(sector: str) -> dict | None:
    url = (f"{_API_BASE}gov_10dd_edpt1?"
           f"geo=ES&na_item=GD&unit=MIO_EUR&sector={sector}"
           f"&sinceTimePeriod={_FIRST_YEAR_PDE}")
    return _get(url)


def _parse_pde(data: dict, sector: str) -> pd.DataFrame:
    dims, strides, dim_index, values = _decode_jsonstat(data)
    time_dim = dims.index("time")
    rows = []
    for year_str, year_pos in dim_index["time"].items():
        flat = year_pos * strides[time_dim]
        val = values.get(flat)
        if val is None:
            continue
        try:
            year = int(year_str)
        except ValueError:
            continue
        rows.append({"year": year, "subsector": sector, "importe": float(val)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# gov_10dd_ggd — Instrumento, Vencimiento, Tenedor (una sola petición por tipo)
# ---------------------------------------------------------------------------

def _fetch_ggd_instrumento() -> dict | None:
    items = "&".join(f"na_item={k}" for k in _INSTRUMENTO_MAP)
    url = (f"{_API_BASE}gov_10dd_ggd?"
           f"geo=ES&unit=MIO_EUR&{items}"
           f"&sector2=S1_S2&maturity=TOTAL"
           f"&sinceTimePeriod={_FIRST_YEAR_GGD}")
    return _get(url)


def _fetch_ggd_vencimiento() -> dict | None:
    mats = "&".join(f"maturity={k}" for k in _VENCIMIENTO_MAP)
    url = (f"{_API_BASE}gov_10dd_ggd?"
           f"geo=ES&unit=MIO_EUR&na_item=GD"
           f"&sector2=S1_S2&{mats}"
           f"&sinceTimePeriod={_FIRST_YEAR_GGD}")
    return _get(url)


def _fetch_ggd_tenedores() -> dict | None:
    sects = "&".join(f"sector2={k}" for k in _TENEDOR_MAP)
    url = (f"{_API_BASE}gov_10dd_ggd?"
           f"geo=ES&unit=MIO_EUR&na_item=GD"
           f"&{sects}&maturity=TOTAL"
           f"&sinceTimePeriod={_FIRST_YEAR_GGD}")
    return _get(url)


def _parse_ggd_instrumento(data: dict) -> pd.DataFrame:
    dims, strides, dim_index, values = _decode_jsonstat(data)
    rows = []
    for na_item, nom in _INSTRUMENTO_MAP.items():
        if na_item not in dim_index.get("na_item", {}):
            continue
        for sector in _SECTORS:
            if sector not in dim_index.get("sector", {}):
                continue
            for year_str, _ in dim_index["time"].items():
                try:
                    year = int(year_str)
                except ValueError:
                    continue
                flat = (dim_index["na_item"][na_item] * strides[dims.index("na_item")]
                        + dim_index["sector"][sector] * strides[dims.index("sector")]
                        + dim_index["time"][year_str] * strides[dims.index("time")])
                val = values.get(flat)
                if val is None:
                    continue
                rows.append({"year": year, "subsector": sector,
                             "instrumento": na_item, "instrumento_nom": nom,
                             "importe": float(val)})
    return pd.DataFrame(rows)


def _parse_ggd_vencimiento(data: dict) -> pd.DataFrame:
    dims, strides, dim_index, values = _decode_jsonstat(data)
    rows = []
    for mat, nom in _VENCIMIENTO_MAP.items():
        if mat not in dim_index.get("maturity", {}):
            continue
        for sector in _SECTORS:
            if sector not in dim_index.get("sector", {}):
                continue
            for year_str, _ in dim_index["time"].items():
                try:
                    year = int(year_str)
                except ValueError:
                    continue
                flat = (dim_index["maturity"][mat] * strides[dims.index("maturity")]
                        + dim_index["sector"][sector] * strides[dims.index("sector")]
                        + dim_index["time"][year_str] * strides[dims.index("time")])
                val = values.get(flat)
                if val is None:
                    continue
                rows.append({"year": year, "subsector": sector,
                             "vencimiento": mat, "vencimiento_nom": nom,
                             "importe": float(val)})
    return pd.DataFrame(rows)


def _parse_ggd_tenedores(data: dict) -> pd.DataFrame:
    dims, strides, dim_index, values = _decode_jsonstat(data)
    rows = []
    for s2, nom in _TENEDOR_MAP.items():
        if s2 not in dim_index.get("sector2", {}):
            continue
        for sector in _SECTORS:
            if sector not in dim_index.get("sector", {}):
                continue
            for year_str, _ in dim_index["time"].items():
                try:
                    year = int(year_str)
                except ValueError:
                    continue
                flat = (dim_index["sector2"][s2] * strides[dims.index("sector2")]
                        + dim_index["sector"][sector] * strides[dims.index("sector")]
                        + dim_index["time"][year_str] * strides[dims.index("time")])
                val = values.get(flat)
                if val is None:
                    continue
                rows.append({"year": year, "subsector": sector,
                             "tenedor": s2, "tenedor_nom": nom,
                             "importe": float(val)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# run()
# ---------------------------------------------------------------------------

def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga deuda PDE + instrumento + vencimiento + tenedores de Eurostat."""

    # --- Stock PDE (gov_10dd_edpt1) ---
    frames_pde: list[pd.DataFrame] = []
    for sector in _SECTORS:
        console.print(f"  Deuda PDE {sector} ({_SECTOR_NAMES[sector]})…")
        data = _fetch_pde(sector)
        if data is None:
            time.sleep(0.5)
            continue
        try:
            df = _parse_pde(data, sector)
        except Exception as exc:
            console.print(f"    [red]Error parseando PDE {sector}: {exc}[/red]")
            time.sleep(0.5)
            continue
        if year is not None:
            df = df[df["year"] == year]
        if not df.empty:
            frames_pde.append(df)
            console.print(f"    {len(df)} filas.")
        time.sleep(0.5)

    if frames_pde:
        df_pde = pd.concat(frames_pde, ignore_index=True)
        df_pde["subsector"] = df_pde["subsector"].astype(object)
        delete = (
            f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
            if year is not None
            else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
        )
        n = upsert(conn, "deuda_pde", df_pde, delete_where=delete)
        console.print(f"  [green]deuda_pde: {n} filas.[/green]")

    # --- Instrumento (gov_10dd_ggd) ---
    console.print("  Deuda por instrumento (gov_10dd_ggd)…")
    data_inst = _fetch_ggd_instrumento()
    time.sleep(0.5)
    if data_inst is not None:
        try:
            df_inst = _parse_ggd_instrumento(data_inst)
            if year is not None:
                df_inst = df_inst[df_inst["year"] == year]
            if not df_inst.empty:
                for col in ["subsector", "instrumento", "instrumento_nom"]:
                    df_inst[col] = df_inst[col].astype(object)
                delete_inst = (
                    f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                    if year is not None
                    else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                )
                n = upsert(conn, "deuda_instrumento", df_inst, delete_where=delete_inst)
                console.print(f"  [green]deuda_instrumento: {n} filas.[/green]")
        except Exception as exc:
            console.print(f"  [red]Error instrumento: {exc}[/red]")

    # --- Vencimiento (gov_10dd_ggd) ---
    console.print("  Deuda por vencimiento (gov_10dd_ggd)…")
    data_venc = _fetch_ggd_vencimiento()
    time.sleep(0.5)
    if data_venc is not None:
        try:
            df_venc = _parse_ggd_vencimiento(data_venc)
            if year is not None:
                df_venc = df_venc[df_venc["year"] == year]
            if not df_venc.empty:
                for col in ["subsector", "vencimiento", "vencimiento_nom"]:
                    df_venc[col] = df_venc[col].astype(object)
                delete_venc = (
                    f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                    if year is not None
                    else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                )
                n = upsert(conn, "deuda_vencimiento", df_venc, delete_where=delete_venc)
                console.print(f"  [green]deuda_vencimiento: {n} filas.[/green]")
        except Exception as exc:
            console.print(f"  [red]Error vencimiento: {exc}[/red]")

    # --- Tenedores (gov_10dd_ggd) ---
    console.print("  Deuda por tenedor/acreedor (gov_10dd_ggd)…")
    data_ten = _fetch_ggd_tenedores()
    time.sleep(0.5)
    if data_ten is not None:
        try:
            df_ten = _parse_ggd_tenedores(data_ten)
            if year is not None:
                df_ten = df_ten[df_ten["year"] == year]
            if not df_ten.empty:
                for col in ["subsector", "tenedor", "tenedor_nom"]:
                    df_ten[col] = df_ten[col].astype(object)
                delete_ten = (
                    f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                    if year is not None
                    else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
                )
                n = upsert(conn, "deuda_tenedores", df_ten, delete_where=delete_ten)
                console.print(f"  [green]deuda_tenedores: {n} filas.[/green]")
        except Exception as exc:
            console.print(f"  [red]Error tenedores: {exc}[/red]")
