"""
Scraper Deuda PDE — Stock de deuda pública española por subsector.

Fuente:
  - Eurostat gov_10dd_edpt1 (JSON-stat): deuda bruta consolidada (Maastricht), M€.
    https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt1

Tabla destino: deuda_pde

Mapeo:
  na_item=GD  →  Gross debt (deuda bruta consolidada, Procedimiento de Déficit Excesivo)
  unit=MIO_EUR
  sector: S13 | S1311 | S1312 | S1313 | S1314
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

_FIRST_YEAR = 1995


def _build_url(sector: str) -> str:
    params = [
        "geo=ES",
        "na_item=GD",
        "unit=MIO_EUR",
        f"sector={sector}",
        f"sinceTimePeriod={_FIRST_YEAR}",
    ]
    return f"{_API_BASE}gov_10dd_edpt1?" + "&".join(params)


def _fetch(sector: str, timeout: int = 45) -> dict | None:
    url = _build_url(sector)
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning gov_10dd_edpt1 ({sector}): {exc}[/yellow]")
        return None


def _parse(data: dict, sector: str) -> pd.DataFrame:
    """
    Parsea el JSON-stat de gov_10dd_edpt1 para un sector.
    Devuelve DataFrame con columnas: year, subsector, importe.
    """
    dims  = data["id"]
    sizes = data["size"]
    _raw  = data["value"]
    values: dict[int, float] = (
        {int(k): v for k, v in _raw.items()} if isinstance(_raw, dict)
        else {i: v for i, v in enumerate(_raw) if v is not None}
    )

    dim_meta  = data["dimension"]
    dim_index: dict[str, dict[str, int]] = {}
    for d in dims:
        cat = dim_meta[d]["category"]
        dim_index[d] = cat["index"]

    strides = [1] * len(dims)
    for i in range(len(dims) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    time_dim   = dims.index("time")
    time_index = dim_index["time"]

    rows: list[dict] = []
    for year_str, year_pos in time_index.items():
        flat_idx = year_pos * strides[time_dim]
        val = values.get(flat_idx)
        if val is None:
            continue
        try:
            year = int(year_str)
        except ValueError:
            continue
        rows.append({"year": year, "subsector": sector, "importe": float(val)})

    return pd.DataFrame(rows)


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga deuda PDE de Eurostat para los 5 subsectores."""
    frames: list[pd.DataFrame] = []

    for sector in _SECTORS:
        console.print(f"  Deuda PDE {sector} ({_SECTOR_NAMES[sector]})…")
        data = _fetch(sector)
        if data is None:
            console.print(f"    [yellow]Sin respuesta para {sector}.[/yellow]")
            time.sleep(0.5)
            continue

        try:
            df = _parse(data, sector)
        except Exception as exc:
            console.print(f"    [red]Error parseando {sector}: {exc}[/red]")
            time.sleep(0.5)
            continue

        if year is not None:
            df = df[df["year"] == year]

        if not df.empty:
            frames.append(df)
            console.print(f"    {len(df)} filas.")

        time.sleep(0.5)

    if not frames:
        console.print("  [yellow]Sin datos de deuda PDE.[/yellow]")
        return

    df_total = pd.concat(frames, ignore_index=True)
    for col in ["subsector"]:
        df_total[col] = df_total[col].astype(object)

    delete_where = (
        f"year = {year} AND subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
        if year is not None
        else f"subsector IN ({', '.join(repr(s) for s in _SECTORS)})"
    )
    n = upsert(conn, "deuda_pde", df_total, delete_where=delete_where)
    console.print(f"  [green]deuda_pde: {n} filas insertadas.[/green]")
