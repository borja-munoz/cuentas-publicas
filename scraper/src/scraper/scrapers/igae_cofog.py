"""
Scraper COFOG — Gasto por función de las AAPP españolas (2000–2023).

Fuente: Eurostat, dataset gov_10a_exp (Government expenditure by function COFOG).
API: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp

Sectores descargados:
  S13    → Administraciones Públicas (total)
  S1311  → Administración Central (Estado)
  S1312  → Administración Regional (CCAA)
  S1313  → Administración Local (CCLL)
  S1314  → Seguridad Social

Funciones COFOG (nivel 1, 10 divisiones):
  GF01 Servicios generales  GF02 Defensa  GF03 Orden público
  GF04 Economía             GF05 Medio ambiente  GF06 Vivienda
  GF07 Sanidad              GF08 Ocio/cultura    GF09 Educación
  GF10 Protección social

Valores: millones de euros (unit=MIO_EUR), gasto total (na_item=TE).
"""

from __future__ import annotations

import time

import duckdb
import requests
from rich.console import Console

from scraper.db import upsert
import pandas as pd

console = Console()

_API_BASE = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp"
)

_SECTORS = ["S13", "S1311", "S1312", "S1313", "S1314"]

_SECTOR_NAMES = {
    "S13":   "Administraciones Públicas",
    "S1311": "Administración Central",
    "S1312": "Administración Regional",
    "S1313": "Administración Local",
    "S1314": "Seguridad Social",
}

_COFOG_CODES = ["GF01", "GF02", "GF03", "GF04", "GF05", "GF06", "GF07", "GF08", "GF09", "GF10"]

_COFOG_NAMES = {
    "GF01": "Servicios generales",
    "GF02": "Defensa",
    "GF03": "Orden público y seguridad",
    "GF04": "Asuntos económicos",
    "GF05": "Medio ambiente",
    "GF06": "Vivienda y servicios comunitarios",
    "GF07": "Salud",
    "GF08": "Ocio, cultura y religión",
    "GF09": "Educación",
    "GF10": "Protección social",
}

_FIRST_YEAR = 2000
_LAST_YEAR  = 2023


def _fetch_sector(sector: str, timeout: int = 30) -> dict | None:
    """Descarga el JSON-stat de Eurostat para un sector y todos los COFOG."""
    params = {
        "geo":              "ES",
        "na_item":          "TE",
        "unit":             "MIO_EUR",
        "sector":           sector,
        "sinceTimePeriod":  str(_FIRST_YEAR),
        "untilTimePeriod":  str(_LAST_YEAR),
    }
    # Añadir todos los códigos COFOG de primer nivel
    url = _API_BASE + "?" + "&".join(
        f"cofog99={c}" for c in _COFOG_CODES
    ) + "&" + "&".join(f"{k}={v}" for k, v in params.items())

    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning Eurostat ({sector}): {exc}[/yellow]")
        return None


def _parse_jsonstat(data: dict, sector: str) -> pd.DataFrame:
    """
    Parsea la respuesta JSON-stat de Eurostat.

    La respuesta tiene dimensiones en el orden indicado por data['id'].
    Dimensiones esperadas: freq, unit, sector, cofog99, na_item, geo, time.
    Filtrando a un solo sector, un solo na_item y un solo geo, las dimensiones
    activas (tamaño > 1) son cofog99 y time.
    """
    dims = data["id"]          # lista ordenada de nombres de dimensión
    sizes = data["size"]       # tamaño de cada dimensión
    # JSON-stat value puede ser lista (con None) o dict {str_idx: valor} (sparse)
    _raw = data["value"]
    values: dict[int, float] = (
        {int(k): v for k, v in _raw.items()} if isinstance(_raw, dict)
        else {i: v for i, v in enumerate(_raw) if v is not None}
    )

    dim_meta = data["dimension"]

    # Construir índice → valor para cada dimensión
    dim_index: dict[str, dict[str, int]] = {}
    dim_label: dict[str, dict[str, str]] = {}
    for d in dims:
        cat = dim_meta[d]["category"]
        dim_index[d] = cat["index"]       # {código: posición_int}
        dim_label[d] = cat.get("label", {})

    # Calcular strides (paso de cada dimensión en el array plano)
    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    # Extraer índices de cofog99 y time
    cofog_dim = dims.index("cofog99")
    time_dim  = dims.index("time")

    cofog_index = dim_index["cofog99"]
    time_index  = dim_index["time"]

    # Para las dimensiones fijas (tamaño 1) su stride ya contribuye 0 offset
    records = []
    for cofog_cod, cofog_pos in cofog_index.items():
        if cofog_cod not in _COFOG_NAMES:
            continue
        for year_str, year_pos in time_index.items():
            # Calcular posición en el array plano asumiendo todas las otras
            # dimensiones tienen un solo valor (size=1) → su posición es 0
            flat_idx = cofog_pos * strides[cofog_dim] + year_pos * strides[time_dim]

            val = values.get(flat_idx)
            if val is None:
                continue

            try:
                year = int(year_str)
            except ValueError:
                continue

            records.append({
                "year":      year,
                "sector":    sector,
                "cofog_cod": cofog_cod,
                "cofog_nom": _COFOG_NAMES[cofog_cod],
                "importe":   float(val),
            })

    return pd.DataFrame(records)


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga gasto COFOG de Eurostat para todos los sectores españoles."""
    all_frames: list[pd.DataFrame] = []

    for sector in _SECTORS:
        console.print(f"  COFOG {sector} ({_SECTOR_NAMES[sector]})…")
        data = _fetch_sector(sector)
        if data is None:
            console.print(f"    [yellow]Sin respuesta para {sector}.[/yellow]")
            continue

        try:
            df = _parse_jsonstat(data, sector)
        except Exception as exc:
            console.print(f"    [red]Error parseando {sector}: {exc}[/red]")
            continue

        if df.empty:
            console.print(f"    [yellow]Sin datos para {sector}.[/yellow]")
            continue

        # Filtrar por año concreto si se pide
        if year is not None:
            df = df[df["year"] == year]

        all_frames.append(df)
        console.print(f"    {len(df)} filas.")
        time.sleep(0.5)  # cortesía con la API de Eurostat

    if not all_frames:
        console.print("  [yellow]No se obtuvieron datos COFOG.[/yellow]")
        return

    df_total = pd.concat(all_frames, ignore_index=True)
    df_total["sector"]    = df_total["sector"].astype(object)
    df_total["cofog_cod"] = df_total["cofog_cod"].astype(object)
    df_total["cofog_nom"] = df_total["cofog_nom"].astype(object)

    delete_clause = (
        f"year = {year} AND sector IN ({', '.join(repr(s) for s in _SECTORS)})"
        if year is not None
        else f"sector IN ({', '.join(repr(s) for s in _SECTORS)})"
    )

    n = upsert(conn, "gastos_funcion", df_total, delete_where=delete_clause)
    console.print(f"  [green]gastos_funcion: {n} filas insertadas.[/green]")
