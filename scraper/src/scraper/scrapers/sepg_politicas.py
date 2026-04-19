"""
Scraper SEPG — Gastos por política de gasto (clasificación funcional consolidada).

Fuente: SEPG, fichero "01 Presupuestos Generales del Estado Consolidados.xlsx".
        Hoja "141": Políticas de gasto (capítulos 1 a 8), serie histórica.

Las políticas de gasto son la clasificación funcional del presupuesto consolidado
del Estado: Pensiones, Defensa, Sanidad, Educación, Infraestructuras, etc.
Cada año se publican en el fichero consolidado que abarca todos los años previos
más el año actual/proyectado.

Cobertura: 2016–año actual (según el último fichero disponible).
"""

from __future__ import annotations

import io
import re
import time

import duckdb
import pandas as pd
import requests
from rich.console import Console

from scraper.db import upsert

console = Console()

_BASE_URL = (
    "https://www.sepg.pap.hacienda.gob.es/sitios/sepg/es-ES/Presupuestos/"
    "DocumentacionEstadisticas/Estadisticas/Documents"
)

_FILE_NAMES = [
    "01%20Presupuestos%20Generales%20del%20Estado%20Consolidados.xlsx",
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/octet-stream,*/*",
}

# Intentar el fichero más reciente primero
_FOLDERS_TO_TRY = ["2025-P", "2024-P", "2023", "2022", "2021"]

# Filas de totales/subtotales que se deben ignorar
_SKIP_ROWS = {
    "capítulos 1 a 8", "operaciones no financieras", "total presupuesto",
    "operaciones corrientes", "operaciones de capital", "operaciones financieras",
    "fuente:", "presupuestos generales del estado",
    "homogeneización justicia, sanidad, educación",
    "política 46 mº defensa",
    "proyectos militares (capítulo 8) mº industria",
    "inversión militar gp 464",
    "investigación civil",  # nota de homogeneización, no dato
}

_YEAR_RE = re.compile(r"^(20\d{2})(-P)?$")


def _download_consolidated(timeout: int = 30) -> bytes | None:
    for folder in _FOLDERS_TO_TRY:
        for fname in _FILE_NAMES:
            url = f"{_BASE_URL}/{folder}/{fname}"
            try:
                r = requests.get(url, headers=_HEADERS, timeout=timeout)
                if r.status_code == 200 and len(r.content) > 10_000:
                    console.print(f"    Fichero consolidado: {folder}/{fname}")
                    return r.content
            except requests.RequestException:
                pass
    return None


def _parse_sheet141(data: bytes) -> list[dict]:
    xl = pd.ExcelFile(io.BytesIO(data), engine="openpyxl")
    if "141" not in xl.sheet_names:
        console.print("  [yellow]Hoja 141 no encontrada.[/yellow]")
        return []

    df = xl.parse("141", header=None)

    # Buscar fila de cabecera con años
    header_row = None
    year_cols: dict[int, int] = {}
    for i, row in df.iterrows():
        cols: dict[int, int] = {}
        for j, cell in enumerate(row):
            s = str(cell).strip()
            m = _YEAR_RE.match(s)
            if m:
                y = int(m.group(1))
                # Preferir versión aprobada sobre proyecto (-P)
                is_draft = bool(m.group(2))
                if y not in cols or not is_draft:
                    cols[y] = j
            elif isinstance(cell, (int, float)) and not pd.isna(cell) and 2015 < cell < 2030:
                y = int(cell)
                if y not in cols:
                    cols[y] = j
        if len(cols) >= 4:
            header_row = i
            year_cols = cols
            break

    if header_row is None:
        console.print("  [yellow]No se encontró fila de cabecera en hoja 141.[/yellow]")
        return []

    records = []
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        politica = str(row.iloc[0]).strip()

        if not politica or politica.lower() in ("nan", "none", ""):
            continue

        # Ignorar subtotales y notas
        plow = politica.lower()
        if any(skip in plow for skip in _SKIP_ROWS):
            continue
        # Ignorar filas de notas (empieza con paréntesis, *, o es muy corta sin letra)
        if politica.startswith("(") or politica.startswith("*") or len(politica) < 4:
            continue

        for year, col in year_cols.items():
            val = row.iloc[col] if col < len(row) else None
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            try:
                importe = float(val)
            except (ValueError, TypeError):
                continue
            if importe <= 0:
                continue

            records.append({
                "year":        year,
                "politica_nom": politica.strip(),
                "importe":     round(importe, 4),
            })

    return records


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga y carga gastos por política de gasto (consolidado PGE)."""
    console.print("  Descargando fichero consolidado PGE…")

    data = _download_consolidated()
    if data is None:
        console.print("  [red]No se encontró el fichero consolidado.[/red]")
        return

    records = _parse_sheet141(data)
    if not records:
        console.print("  [yellow]Sin datos en hoja 141.[/yellow]")
        return

    df = pd.DataFrame(records)

    if year is not None:
        df = df[df["year"] == year]
        if df.empty:
            console.print(f"  [yellow]Sin datos para {year}.[/yellow]")
            return

    df["politica_nom"] = df["politica_nom"].astype(object)

    delete_clause = (
        f"year = {year}" if year is not None
        else f"year >= 2016"
    )

    n = upsert(conn, "gastos_politica", df, delete_where=delete_clause)
    console.print(f"  [green]gastos_politica: {n} filas insertadas.[/green]")
    time.sleep(0.3)
