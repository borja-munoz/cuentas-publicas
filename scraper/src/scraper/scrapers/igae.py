"""
Scraper IGAE — Ejecución presupuestaria del Estado (2015–2024).

Fuente: IGAE, Intervención General de la Administración del Estado.
URL: .../EjecucionPresupuestaria/Documents/EXTRACTO DICIEMBRE {YEAR} (EXCEL).xlsx

Cada fichero Excel mensual (usamos diciembre = cierre anual) contiene:
  - Hoja ingresos: "ING 002" (2016+) o "CEIS012" (2015)
    → Previsiones, Derechos reconocidos netos, Recaudación neta por capítulo
  - Hoja gastos capítulos: "GTOS 004" (2016+) o "EGS03" (2015)
    → Créditos definitivos, Obligaciones reconocidas netas, Pagos realizados

Valores en miles de euros (a diferencia del SEPG que usa millones).
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
from scraper.transform.igae import normalize_gastos, normalize_ingresos

console = Console()

_BASE = "https://www.igae.pap.hacienda.gob.es"
_DOC_PATH = (
    "/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/"
    "EjecucionPresupuestaria/Documents/"
)
_PAGE_PATH = (
    "/sitios/igae/es-ES/Contabilidad/ContabilidadPublica/CPE/"
    "EjecucionPresupuestaria/Paginas/imextractoejecucion{year}.aspx"
)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# Known December file paths (scraped from IGAE pages)
_DECEMBER_PATHS: dict[int, str] = {
    2015: "EXTRACTO%20PROVISIONAL%20DICIEMBRE%202015%20%28EXCEL%29.xls",
    2016: "EXTRACTO%20DICIEMBRE%20PROVISIONAL%202016%20%28EXCEL%29.xlsx",
    2017: "EXTRACTO%20DICIEMBRE%20PROVISIONAL%202017%20%28EXCEL%29.xlsx",
    2018: "EXTRACTO%20DICIEMBRE%202018%20%28EXCEL%29.xlsx",
    2019: "EXTRACTO%20DICIEMBRE%202019%20%28EXCEL%29.xlsx",
    2020: "EXTRACTO%20DICIEMBRE%202020%20%28EXCEL%29.xlsx",
    2021: "EXTRACTO%20DICIEMBRE%202021%20(EXCEL).xlsx",
    2022: "12-EXTRACTO%20DICIEMBRE%202022%20%28EXCEL%29.xlsx",
    2023: "EXTRACTO%20DICIEMBRE%202023.xlsx",
    2024: "EXTRACTO%20DICIEMBRE%202024%20%28EXCEL%29.xlsx",
}


def _url_for_year(year: int) -> str | None:
    path = _DECEMBER_PATHS.get(year)
    if path:
        return f"{_BASE}{_DOC_PATH}{path}"
    return None


def _download(url: str, timeout: int = 30) -> bytes | None:
    try:
        r = requests.get(url, headers=_HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.content
        console.print(f"    [yellow]HTTP {r.status_code}: {url.split('/')[-1][:50]}[/yellow]")
        return None
    except requests.RequestException as exc:
        console.print(f"    [yellow]Warning: {exc}[/yellow]")
        return None


# ---------------------------------------------------------------------------
# Mapeo de etiquetas → número de capítulo
# ---------------------------------------------------------------------------

_GASTOS_CHAPTERS: dict[str, int] = {
    "gastos de personal": 1,
    "gastos en bienes y servicios": 2,
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
    "tasas, precios": 3,
    "tasas y precios": 3,
    "tasas": 3,
    "transferencias corrientes": 4,
    "ingresos patrimoniales": 5,
    "enajenación": 6,
    "transferencias de capital": 7,
    "activos financieros": 8,
    "pasivos financieros": 9,
}

_SKIP_LABELS: set[str] = {
    "total operaciones corrientes",
    "total operaciones de capital",
    "total operaciones no financieras",
    "total operaciones financieras",
    "total fondo de contingencia",
    "totales",
    "total",
}


def _clean(label: str) -> str:
    return str(label).lower().strip().rstrip(":").split("(")[0].strip()


def _label_to_chapter(label: str, chapter_map: dict[str, int]) -> int | None:
    clean = _clean(label)
    if not clean or clean.startswith("*") or clean.isdigit():
        return None
    # Only accept chapter-level rows: must start with digit (e.g. "1. Gastos de personal")
    # This avoids matching detail sub-rows like "Otros impuestos directos y extinguidos"
    if not re.match(r"^\d", clean):
        return None
    # Remove leading chapter number like "1. " or "1 "
    clean_no_num = re.sub(r"^\d+\.\s*", "", clean)
    for skip in _SKIP_LABELS:
        if skip in clean_no_num:
            return None
    for key in sorted(chapter_map, key=len, reverse=True):
        if key in clean_no_num:
            return chapter_map[key]
    return None


def _find_year_col(df: pd.DataFrame, year: int) -> tuple[int, dict[str, int]] | tuple[None, None]:
    """Encuentra la fila de datos y las columnas relevantes para el año dado.

    Estrategia:
    1. Buscar la fila que contiene `year` (como int o float).
    2. En esa fila o la siguiente, mapear etiquetas de columna a índices.
    3. Devolver (primera_fila_datos, {col_name: col_idx}).
    """
    year_header_row = None
    year_col_start = None  # primera columna del bloque del año

    for i, row in df.iterrows():
        for j, cell in enumerate(row):
            s = str(cell).strip()
            try:
                if int(float(s)) == year:
                    year_header_row = i
                    year_col_start = j
                    break
            except (ValueError, TypeError):
                pass
        if year_header_row is not None:
            break

    if year_header_row is None:
        return None, None

    # Find where the next year block starts (to avoid scanning into it)
    year_row = df.iloc[year_header_row]
    next_year_col = len(year_row)  # default: scan to end
    for j in range(year_col_start + 1, len(year_row)):
        cell = year_row.iloc[j]
        try:
            val = int(float(str(cell).strip()))
            if 2000 <= val <= 2030 and val != year:
                next_year_col = j
                break
        except (ValueError, TypeError):
            pass

    # Look for column-label row: search up to 3 rows below the year header
    cols: dict[str, int] = {}
    col_label_row = None
    for offset in range(0, 4):
        ri = year_header_row + offset
        if ri >= len(df):
            break
        row = df.iloc[ri]
        found_in_row: dict[str, int] = {}
        # Scan only within this year's column block
        for j in range(year_col_start, min(next_year_col, len(row))):
            cell_text = str(row.iloc[j]).lower().replace("\n", " ")
            if "crédito" in cell_text or "credito" in cell_text:
                found_in_row["creditos_definitivos"] = j
            elif "obligacion" in cell_text or "obligación" in cell_text:
                found_in_row["obligaciones_reconocidas"] = j
            elif "pago" in cell_text:
                found_in_row["pagos_realizados"] = j
            elif "prevision" in cell_text or "previsión" in cell_text:
                found_in_row["previsiones"] = j
            elif "derecho" in cell_text:
                found_in_row["derechos_reconocidos"] = j
            elif "recaudaci" in cell_text:
                found_in_row["recaudacion_neta"] = j
        if len(found_in_row) >= 2:
            cols = found_in_row
            col_label_row = ri
            break

    if not cols:
        return None, None

    # Data starts after the last header row
    data_start = (col_label_row or year_header_row) + 1
    return data_start - 1, cols  # return year_header_row so caller uses data_start=header+1


def _safe_float(val) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return None if pd.isna(val) else float(val)
    s = str(val).strip().replace("\xa0", "").replace(" ", "")
    if not s or s == "-" or s.lower() in ("nan", "none"):
        return None
    try:
        return float(s.replace(".", "").replace(",", ".") if "," in s else s)
    except ValueError:
        return None


def _parse_gastos_sheet(df: pd.DataFrame, year: int) -> list[dict]:
    header_row, cols = _find_year_col(df, year)
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
        cap = _label_to_chapter(label, _GASTOS_CHAPTERS)
        if cap is None:
            continue

        rec = {
            "year": year,
            "entidad": "Estado",
            "seccion_cod": None,
            "seccion_nom": None,
            "programa_cod": None,
            "programa_nom": None,
            "capitulo": cap,
            "articulo": None,
            "concepto": None,
            "descripcion": label.strip(),
            "creditos_iniciales": None,
            "creditos_definitivos": _safe_float(row.iloc[cols["creditos_definitivos"]]) if "creditos_definitivos" in cols else None,
            "obligaciones_reconocidas": _safe_float(row.iloc[cols["obligaciones_reconocidas"]]) if "obligaciones_reconocidas" in cols else None,
            "pagos_ordenados": _safe_float(row.iloc[cols["pagos_realizados"]]) if "pagos_realizados" in cols else None,
        }
        records.append(rec)
    return records


def _parse_ingresos_sheet(df: pd.DataFrame, year: int) -> list[dict]:
    header_row, cols = _find_year_col(df, year)
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
        cap = _label_to_chapter(label, _INGRESOS_CHAPTERS)
        if cap is None:
            continue

        rec = {
            "year": year,
            "entidad": "Estado",
            "capitulo": cap,
            "articulo": None,
            "concepto": None,
            "descripcion": label.strip(),
            "derechos_reconocidos": _safe_float(row.iloc[cols["derechos_reconocidos"]]) if "derechos_reconocidos" in cols else None,
            "recaudacion_neta": _safe_float(row.iloc[cols["recaudacion_neta"]]) if "recaudacion_neta" in cols else None,
        }
        records.append(rec)
    return records


def _find_sheet(xl: pd.ExcelFile, keywords: list[str], exclude: list[str] | None = None) -> str | None:
    """Encuentra una hoja cuyo nombre contiene alguna de las keywords."""
    for sheet in xl.sheet_names:
        name = str(sheet).upper()
        if any(k in name for k in keywords):
            if exclude is None or not any(e in name for e in exclude):
                return sheet
    return None


def _parse_file(data: bytes, year: int) -> tuple[list[dict], list[dict]]:
    xl = pd.ExcelFile(io.BytesIO(data))

    # Gastos capítulos: "GTOS 004" (modern) or "EGS03" (2015)
    gastos_sheet = _find_sheet(xl, ["004", "EGS03"])
    gastos: list[dict] = []
    if gastos_sheet:
        df = xl.parse(gastos_sheet, header=None)
        gastos = _parse_gastos_sheet(df, year)

    # Ingresos: "ING 002" (modern) or "CEIS012" (2015)
    ingresos_sheet = _find_sheet(xl, ["ING", "CEIS0"])
    ingresos: list[dict] = []
    if ingresos_sheet:
        df = xl.parse(ingresos_sheet, header=None)
        ingresos = _parse_ingresos_sheet(df, year)

    return gastos, ingresos


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga y carga la ejecución presupuestaria del Estado (IGAE)."""
    years = [year] if year else list(_DECEMBER_PATHS.keys())

    for y in sorted(years):
        console.print(f"  IGAE ejecución {y}…")
        url = _url_for_year(y)
        if not url:
            console.print(f"    [yellow]Sin URL configurada para {y}.[/yellow]")
            continue

        data = _download(url)
        if data is None:
            console.print(f"    [yellow]No disponible: {y}[/yellow]")
            continue

        try:
            gastos, ingresos = _parse_file(data, y)
        except Exception as exc:
            console.print(f"    [red]Error parseando {y}: {exc}[/red]")
            continue

        if not gastos and not ingresos:
            console.print(f"    [yellow]Sin datos para {y}.[/yellow]")
            continue

        if gastos:
            df_g = normalize_gastos(pd.DataFrame(gastos))
            if not df_g.empty:
                n = upsert(
                    conn,
                    "gastos_ejecucion",
                    df_g,
                    delete_where=f"entidad = 'Estado' AND year = {y}",
                )
                console.print(f"    gastos_ejecucion: {n} filas.")

        if ingresos:
            df_i = normalize_ingresos(pd.DataFrame(ingresos))
            if not df_i.empty:
                n = upsert(
                    conn,
                    "ingresos_ejecucion",
                    df_i,
                    delete_where=f"entidad = 'Estado' AND year = {y}",
                )
                console.print(f"    ingresos_ejecucion: {n} filas.")

        time.sleep(0.3)
