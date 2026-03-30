"""
Scraper SEPG — Series históricas de ingresos y gastos del Estado (2005–2025).

Fuente: Secretaría General de Presupuestos y Gastos (SEPG), Ministerio de Hacienda.
URL base: .../Estadisticas/Documents/{YEAR}/02 Presupuesto del Estado.xlsx

Cada fichero Excel contiene:
  - "21": Gastos por clasificación económica (capítulos), años en columnas
  - "23": Ingresos por clasificación económica (capítulos), años en columnas

Formato wide: años = columnas, capítulos = filas. Valores en millones de euros.
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
from scraper.transform.sepg import normalize_gastos, normalize_ingresos

console = Console()

_BASE_URL = (
    "https://www.sepg.pap.hacienda.gob.es/sitios/sepg/es-ES/Presupuestos/"
    "DocumentacionEstadisticas/Estadisticas/Documents"
)

# (año_presupuesto, carpeta)
# Los "-P" son proyectos de ley; si existe la versión aprobada, se usa esa.
_YEAR_FOLDERS: list[tuple[int, str]] = [
    (2014, "2014"),
    (2015, "2015"),
    (2016, "2016"),
    (2017, "2017"),
    (2018, "2018"),
    (2019, "2019"),
    (2021, "2021"),
    (2022, "2022"),
    (2023, "2023"),
    (2024, "2024-P"),
    (2025, "2025-P"),
]

_FILE_CANDIDATES = [
    "02%20Presupuesto%20del%20Estado.xlsx",
    "02%20Presupuestos%20del%20Estado.xlsx",
    "02%20Presupuesto%20Estado.xlsx",
]


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/octet-stream,*/*",
    "Referer": (
        "https://www.sepg.pap.hacienda.gob.es/sitios/sepg/es-ES/Presupuestos/"
        "DocumentacionEstadisticas/Estadisticas/Paginas/Estadisticas.aspx"
    ),
}


def _download_xlsx(folder: str, timeout: int = 30) -> bytes | None:
    for fname in _FILE_CANDIDATES:
        url = f"{_BASE_URL}/{folder}/{fname}"
        try:
            r = requests.get(url, headers=_HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r.content
            if r.status_code not in (404, 403):
                console.print(f"    [yellow]HTTP {r.status_code}: {url}[/yellow]")
        except requests.RequestException as exc:
            console.print(f"    [yellow]Warning: {exc}[/yellow]")
    return None


# ---------------------------------------------------------------------------
# Mapeo capítulo-etiqueta → número
# ---------------------------------------------------------------------------

_GASTOS_CHAPTERS: dict[str, int] = {
    "gastos de personal": 1,
    "gastos corrientes en bienes y servicios": 2,
    "gastos corrientes en bienes": 2,
    "gastos financieros": 3,
    "transferencias corrientes": 4,
    "fondo de contingencia": 5,
    "inversiones reales": 6,
    "transferencias de capital": 7,
    "activos financieros": 8,
    "pasivos financieros": 9,
}

_INGRESOS_CHAPTERS: dict[str, int] = {
    "impuestos directos": 1,
    "impuestos indirectos": 2,
    "tasas, precios y otros ingresos": 3,
    "tasas y otros ingresos": 3,
    "tasas": 3,
    "transferencias corrientes": 4,
    "ingresos patrimoniales": 5,
    "enajenación de inversiones reales": 6,
    "enajenación inversiones reales": 6,
    "enajenación": 6,
    "transferencias de capital": 7,
    "activos financieros": 8,
    "pasivos financieros": 9,
}

_SKIP_FRAGMENTS: set[str] = {
    "operaciones corrientes",
    "operaciones de capital",
    "operaciones no financieras",
    "operaciones financieras",
    "total",
    "capítulos",
    "clasificación económica",
    "millones de euros",
    "presupuesto del estado",
    "presupuestos del estado",
    "estadística",
}


def _label_to_chapter(label: str, chapter_map: dict[str, int]) -> int | None:
    clean = str(label).lower().strip().rstrip(":").split("(")[0].strip()
    if not clean or clean.startswith("*") or clean.startswith("(") or clean.isdigit():
        return None
    for frag in _SKIP_FRAGMENTS:
        if frag in clean:
            return None
    for key in sorted(chapter_map, key=len, reverse=True):
        if key in clean:
            return chapter_map[key]
    return None


_YEAR_RE = re.compile(r"^(200[5-9]|20[12]\d)(-P)?$")


def _find_header_row(df: pd.DataFrame) -> tuple[int, dict[int, int]] | tuple[None, None]:
    """Encuentra la fila con años como cabeceras de columna."""
    for i, row in df.iterrows():
        year_cols: dict[int, int] = {}
        is_draft: dict[int, bool] = {}
        for j, cell in enumerate(row):
            s = str(cell).strip()
            if _YEAR_RE.match(s):
                y = int(s.split("-")[0])
                draft = s.endswith("-P")
                if y not in year_cols or (not draft and is_draft.get(y, True)):
                    year_cols[y] = j
                    is_draft[y] = draft
            elif isinstance(cell, (int, float)) and not pd.isna(cell) and 2004 < cell < 2030:
                y = int(cell)
                if y not in year_cols:
                    year_cols[y] = j
                    is_draft[y] = False
        if len(year_cols) >= 3:
            return i, year_cols
    return None, None


def _parse_sheet(df: pd.DataFrame, chapter_map: dict[str, int]) -> list[dict]:
    header_row, year_cols = _find_header_row(df)
    if header_row is None:
        return []

    records = []
    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        label = ""
        for col_idx in (0, 1):
            val = row.iloc[col_idx] if len(row) > col_idx else None
            if val is not None and pd.notna(val):
                s = str(val).strip()
                if s and s.lower() not in ("nan", "none", ""):
                    label = s
                    break

        cap = _label_to_chapter(label, chapter_map)
        if cap is None:
            continue

        for year, col in year_cols.items():
            val = row.iloc[col] if col < len(row) else None
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue
            try:
                amount = float(val)
            except (ValueError, TypeError):
                continue

            records.append({
                "year": year,
                "entidad": "Estado",
                "capitulo": cap,
                "articulo": None,
                "concepto": None,
                "descripcion": label.strip(),
                "importe": amount,
            })

    return records


def _parse_file(data: bytes) -> tuple[list[dict], list[dict]]:
    xl = pd.ExcelFile(io.BytesIO(data))
    gastos: list[dict] = []
    ingresos: list[dict] = []

    gastos_sheets = [s for s in xl.sheet_names if re.match(r"^2\.?1$", str(s).strip())]
    for sheet in gastos_sheets:
        try:
            df = xl.parse(sheet, header=None)
            recs = _parse_sheet(df, _GASTOS_CHAPTERS)
            if recs:
                gastos = recs
                break
        except Exception as exc:
            console.print(f"    [yellow]Error hoja gastos {sheet}: {exc}[/yellow]")

    ingresos_sheets = [s for s in xl.sheet_names if re.match(r"^2\.?3$", str(s).strip())]
    for sheet in ingresos_sheets:
        try:
            df = xl.parse(sheet, header=None)
            recs = _parse_sheet(df, _INGRESOS_CHAPTERS)
            if recs:
                ingresos = recs
                break
        except Exception as exc:
            console.print(f"    [yellow]Error hoja ingresos {sheet}: {exc}[/yellow]")

    return gastos, ingresos


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga y carga los presupuestos del Estado (SEPG)."""
    # Acumular por año; el fichero más tardío prevalece (mayor año_archivo → más actualizado)
    gastos_by_year: dict[int, list[dict]] = {}
    ingresos_by_year: dict[int, list[dict]] = {}

    folders = _YEAR_FOLDERS if year is None else [
        (fy, f) for fy, f in _YEAR_FOLDERS if fy == year
    ]

    for _file_year, folder in folders:
        console.print(f"  SEPG {folder}…")
        data = _download_xlsx(folder)
        if data is None:
            console.print(f"    [yellow]No disponible: {folder}[/yellow]")
            continue

        try:
            gastos, ingresos = _parse_file(data)
        except Exception as exc:
            console.print(f"    [red]Error parseando {folder}: {exc}[/red]")
            continue

        if not gastos and not ingresos:
            console.print(f"    [yellow]Sin datos en {folder}.[/yellow]")
            continue

        for rec in gastos:
            gastos_by_year.setdefault(rec["year"], [])
            gastos_by_year[rec["year"]].append(rec)
        for rec in ingresos:
            ingresos_by_year.setdefault(rec["year"], [])
            ingresos_by_year[rec["year"]].append(rec)

        console.print(f"    {len(gastos)} gastos / {len(ingresos)} ingresos leídos.")
        time.sleep(0.3)

    if year is not None:
        gastos_by_year = {k: v for k, v in gastos_by_year.items() if k == year}
        ingresos_by_year = {k: v for k, v in ingresos_by_year.items() if k == year}

    if gastos_by_year:
        all_gastos = [rec for recs in gastos_by_year.values() for rec in recs]
        df_g = normalize_gastos(pd.DataFrame(all_gastos))
        if not df_g.empty:
            years_str = ",".join(str(y) for y in sorted(gastos_by_year))
            n = upsert(
                conn,
                "gastos_plan",
                df_g,
                delete_where=f"entidad = 'Estado' AND year IN ({years_str})",
            )
            console.print(f"  → gastos_plan: {n} filas.")

    if ingresos_by_year:
        all_ingresos = [rec for recs in ingresos_by_year.values() for rec in recs]
        df_i = normalize_ingresos(pd.DataFrame(all_ingresos))
        if not df_i.empty:
            years_str = ",".join(str(y) for y in sorted(ingresos_by_year))
            n = upsert(
                conn,
                "ingresos_plan",
                df_i,
                delete_where=f"entidad = 'Estado' AND year IN ({years_str})",
            )
            console.print(f"  → ingresos_plan: {n} filas.")
