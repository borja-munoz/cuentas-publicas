"""
Scraper AEAT — Recaudación tributaria agregada (1995–2024).

Fuente: Informes Anuales de Recaudación Tributaria (IART).
URL patrón: .../Informes_Anuales_de_Recaudacion_Tributaria/Ejercicio_{YYYY}/Cuadros_IART{YY}.xlsx

Cada fichero contiene varias hojas; la que nos interesa es la serie histórica
de recaudación neta por figura tributaria (IRPF, IVA, Sociedades, Especiales…).
"""

from __future__ import annotations

import io
import re
import time
from pathlib import Path

import duckdb
import pandas as pd
import requests
from rich.console import Console

from scraper.db import upsert
from scraper.transform.aeat import normalize

console = Console()

# URL base de los informes anuales de recaudación
_BASE_URL = (
    "https://sede.agenciatributaria.gob.es/static_files/AEAT/Estudios/"
    "Estadisticas/Informes_Estadisticos/Informes_Anuales_de_Recaudacion_Tributaria"
)

# Años disponibles en los informes IART (el informe de cada año recoge la serie
# histórica desde 1995, así que con descargar el más reciente bastaría; pero
# descargamos año a año para robustez e incrementalidad).
FIRST_YEAR = 2017   # ficheros IART individuales disponibles desde 2017
                     # (para 1995-2016 usamos el cuadro histórico del IART más reciente)
LAST_YEAR  = 2024


def _iart_url(year: int) -> str:
    yy = str(year)[2:]
    return f"{_BASE_URL}/Ejercicio_{year}/Cuadros_IART{yy}.xlsx"


def _download_xlsx(url: str, timeout: int = 30) -> bytes | None:
    """Descarga un fichero Excel. Devuelve None si no existe (404)."""
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.content
    except requests.RequestException as exc:
        console.print(f"  [yellow]Warning: {exc}[/yellow]")
        return None


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    years = [year] if year else list(range(FIRST_YEAR, LAST_YEAR + 1))

    # El IART más reciente incluye la serie histórica completa desde 1995.
    # Lo usamos para cubrir los años anteriores a FIRST_YEAR.
    if year is None:
        _load_historical_series(conn)

    for y in years:
        console.print(f"  AEAT IART {y}…")
        url = _iart_url(y)
        data = _download_xlsx(url)
        if data is None:
            console.print(f"    [yellow]No disponible: {url}[/yellow]")
            continue

        try:
            df = _parse_iart(data, y)
        except Exception as exc:
            console.print(f"    [red]Error parseando {y}: {exc}[/red]")
            continue

        if df.empty:
            console.print(f"    [yellow]Sin datos para {y}.[/yellow]")
            continue

        n = upsert(
            conn,
            "recaudacion_aeat",
            df,
            delete_where=f"year = {y}",
        )
        console.print(f"    {n} filas insertadas.")
        time.sleep(0.3)  # cortesía con el servidor


def _load_historical_series(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Descarga el IART más reciente y extrae la serie histórica 1995–2016
    (años sin fichero IART individual publicado).
    """
    for try_year in range(LAST_YEAR, LAST_YEAR - 3, -1):
        url = _iart_url(try_year)
        data = _download_xlsx(url)
        if data is None:
            continue
        try:
            df = _parse_iart_historical(data)
        except Exception:
            continue
        if df.empty:
            break
        # Solo insertamos los años < FIRST_YEAR
        df = df[df["year"] < FIRST_YEAR]
        if df.empty:
            break
        n = upsert(
            conn,
            "recaudacion_aeat",
            df,
            delete_where=f"year < {FIRST_YEAR}",
        )
        console.print(f"  Serie histórica 1995–{FIRST_YEAR - 1}: {n} filas.")
        break


# ---------------------------------------------------------------------------
# Parseo de ficheros Excel
# ---------------------------------------------------------------------------

# Nombres canónicos de impuestos que usamos en la base de datos
_TAX_MAP: dict[str, str] = {
    # IRPF — varios alias según versión del IART
    "impuesto sobre la renta de las personas físicas": "IRPF",
    "impuesto sobre la renta": "IRPF",
    "i. s/ renta personas físicas": "IRPF",
    "i.s/renta personas físicas": "IRPF",
    "irpf": "IRPF",
    # IVA
    "impuesto sobre el valor añadido": "IVA",
    "i. sobre el valor añadido": "IVA",
    "valor añadido": "IVA",
    "iva": "IVA",
    # Sociedades
    "impuesto sobre sociedades": "Sociedades",
    "i. sobre sociedades": "Sociedades",
    "i.s/sociedades": "Sociedades",
    # Especiales (no capturar "Impuesto sobre ... Especiales" genérico)
    "impuestos especiales": "Especiales",
    "ii.ee.": "Especiales",
    "ii. ee.": "Especiales",
    # Patrimonio
    "impuesto sobre el patrimonio": "Patrimonio",
    "patrimonio": "Patrimonio",
    # Aduanas / Tráfico exterior
    "tráfico exterior": "Aduanas",
    "derechos de importación": "Aduanas",
    "aduanas": "Aduanas",
    # No Residentes
    "impuesto sobre la renta de no residentes": "No Residentes",
    "no residentes": "No Residentes",
    # Tasas y otros
    "otros ingresos": "Otros",
    "tasas": "Otros",
    "otros impuestos": "Otros",
    "resto": "Otros",
}

# Etiquetas que se deben ignorar aunque contengan palabras clave de un impuesto
# (son subtotales/desgloses, no el total del impuesto)
_TAX_EXCLUDE: set[str] = {
    "retenciones del trabajo",
    "retenciones del capital",
    "retenciones sobre arrendamientos",
    "retenciones sobre fondos",
    "pagos fraccionados",
    "resultado de la declaración",
    "devoluciones de resultado",
    "liquidaciones practicadas",
    "asignación tributaria",
    "gravamen sobre loterías",
    "ingresos brutos",
    "devoluciones",
    "capítulo",
}


def _canonical_tax(raw: str) -> str | None:
    """Mapea una etiqueta cruda a un nombre canónico, o None si no reconocida.

    Ignora subtotales/desgloses definidos en _TAX_EXCLUDE aunque contengan
    palabras clave de un impuesto (ej. "Retenciones del trabajo" no es IRPF).
    Para claves cortas (≤4 chars) exige palabra completa para evitar falsos
    positivos ("iva" en "derivadas", etc.).
    """
    clean = str(raw).lower().strip().rstrip(":").split("(")[0].strip()
    # Excluir desgloses
    for excl in _TAX_EXCLUDE:
        if excl in clean:
            return None
    # Mapear al nombre canónico (clave más larga primero para evitar falsos positivos)
    for key in sorted(_TAX_MAP, key=len, reverse=True):
        if len(key) <= 4:
            # Exigir límite de palabra para claves cortas
            if re.search(r"\b" + re.escape(key) + r"\b", clean):
                return _TAX_MAP[key]
        elif key in clean:
            return _TAX_MAP[key]
    return None


def _matches_year(cell, year: int) -> bool:
    """Comprueba si una celda del Excel representa el año dado.

    Maneja valores como 2023.0 (float), "2023", "2023 (p)" (provisional).
    """
    s = str(cell).strip().split("(")[0].strip()  # quitar "(p)", "(1)", etc.
    try:
        return int(float(s)) == year
    except (ValueError, TypeError):
        return False


def _label_from_row(row) -> str:
    """Extrae la etiqueta de texto de una fila del Excel.

    Los IART tienen columna 0 vacía (NaN) y la etiqueta en la columna 1.
    """
    for col_idx in (1, 0):
        val = row.iloc[col_idx] if len(row) > col_idx else None
        if val is not None and pd.notna(val) and str(val).strip() not in ("nan", "NaN", ""):
            return str(val).strip()
    return ""


def _parse_iart(data: bytes, year: int) -> pd.DataFrame:
    """
    Extrae la recaudación anual (total, sin desglose mensual) del fichero IART
    correspondiente a `year`.

    Estrategia: priorizar la hoja de resumen de ingresos tributarios totales
    (normalmente '1.6' o '0'), buscando en ella la columna del año `year`.
    Devuelve un DataFrame con columnas:
        year, month (NULL), impuesto, importe_bruto, devoluciones, importe_neto
    """
    xl = pd.ExcelFile(io.BytesIO(data))
    # Prioritize summary sheets; '1.6' is "Ingresos Tributarios Totales" in modern IARTs
    priority = ["1.6", "0", "1"]
    sheet_order = priority + [s for s in xl.sheet_names if s not in priority]

    for sheet in sheet_order:
        if sheet not in xl.sheet_names:
            continue
        try:
            df = xl.parse(sheet, header=None)
        except Exception:
            continue

        result = _extract_from_sheet(df, year)
        if result:
            return _build_df(result, year)

    return pd.DataFrame()


def _build_df(records: list[dict], year: int) -> pd.DataFrame:
    out = pd.DataFrame(records)
    out["year"] = year
    out["month"] = 0  # 0 = total anual

    # Deduplicate: aggregate importe_neto (sum); for bruto/dev keep first non-null.
    # This handles multiple "Otros" rows and any other duplicates.
    agg = (
        out.groupby("impuesto", sort=False)
        .agg(
            year=("year", "first"),
            month=("month", "first"),
            importe_bruto=("importe_bruto", "first"),
            devoluciones=("devoluciones", "first"),
            importe_neto=("importe_neto", "sum"),
        )
        .reset_index()
    )
    # Ensure object dtype for string columns (DuckDB doesn't support StringDtype)
    agg["impuesto"] = agg["impuesto"].astype(object)
    return agg[["year", "month", "impuesto", "importe_bruto", "devoluciones", "importe_neto"]]


def _parse_iart_historical(data: bytes) -> pd.DataFrame:
    """
    Extrae la serie histórica (todos los años disponibles) de un fichero IART.
    Usa la misma hoja de resumen que _parse_iart pero extrae todas las columnas
    de años.
    """
    xl = pd.ExcelFile(io.BytesIO(data))
    priority = ["1.6", "0", "1"]
    sheet_order = priority + [s for s in xl.sheet_names if s not in priority]

    for sheet in sheet_order:
        if sheet not in xl.sheet_names:
            continue
        try:
            df = xl.parse(sheet, header=None)
        except Exception:
            continue

        records = _extract_historical_from_sheet(df)
        if records:
            out = pd.DataFrame(records)
            out["month"] = 0  # 0 = total anual
            # Deduplicate per (year, impuesto): sum importe_neto, keep first bruto/dev
            out = (
                out.groupby(["year", "impuesto"], sort=False)
                .agg(
                    month=("month", "first"),
                    importe_bruto=("importe_bruto", "first"),
                    devoluciones=("devoluciones", "first"),
                    importe_neto=("importe_neto", "sum"),
                )
                .reset_index()
            )
            out["impuesto"] = out["impuesto"].astype(object)
            return out[["year", "month", "impuesto", "importe_bruto", "devoluciones", "importe_neto"]]

    return pd.DataFrame()


def _find_year_row(df: pd.DataFrame) -> tuple[int, dict[int, int]] | tuple[None, None]:
    """Encuentra la fila con los encabezados de año y devuelve
    (índice_de_fila, {año: índice_columna}).

    Los IART tienen los años en fila 5 (approx.) como floats o strings.
    """
    year_pattern = re.compile(r"^(199\d|20[0-3]\d)$")
    for i, row in df.iterrows():
        year_cols: dict[int, int] = {}
        for j, cell in enumerate(row):
            s = str(cell).strip().split("(")[0].strip()
            try:
                y = int(float(s))
                if year_pattern.match(str(y)):
                    year_cols[y] = j
            except (ValueError, TypeError):
                pass
        if len(year_cols) >= 5:  # al menos 5 años distintos → es la fila de cabecera
            return i, year_cols
    return None, None


def _extract_from_sheet(df: pd.DataFrame, year: int) -> list[dict]:
    """
    Busca la columna del año `year` en la hoja y extrae importes por impuesto.
    También intenta extraer importe_bruto y devoluciones para IVA.
    """
    header_row, year_cols = _find_year_row(df)
    if header_row is None or year not in year_cols:
        return []

    year_col = year_cols[year]
    records: list[dict] = []
    last_canon: str | None = None
    iva_row: int | None = None

    for i in range(header_row + 1, min(header_row + 80, len(df))):
        row = df.iloc[i]
        label = _label_from_row(row)
        if not label:
            continue

        canon = _canonical_tax(label)
        if canon is not None:
            val = _safe_float(row.iloc[year_col])
            if val is None:
                continue
            records.append({
                "impuesto": canon,
                "importe_bruto": None,
                "devoluciones": None,
                "importe_neto": val,
            })
            last_canon = canon
            if canon == "IVA":
                iva_row = len(records) - 1
        elif iva_row is not None and last_canon == "IVA":
            # Capturar ingresos brutos y devoluciones de IVA de las filas siguientes
            lower = label.lower()
            val = _safe_float(row.iloc[year_col])
            if val is None:
                continue
            if "bruto" in lower:
                records[iva_row]["importe_bruto"] = val
            elif "devolucione" in lower:
                records[iva_row]["devoluciones"] = val
                last_canon = None  # ya hemos capturado bruto+dev, resetear contexto

    return records


def _extract_historical_from_sheet(df: pd.DataFrame) -> list[dict]:
    """
    Extrae múltiples años de una hoja con series históricas donde los años
    son columnas (formato IART 1.6: filas=impuestos, columnas=años).
    """
    header_row, year_cols = _find_year_row(df)
    if header_row is None or not year_cols:
        return []

    records: list[dict] = []
    last_canon: str | None = None
    iva_rows: dict[int, int] = {}  # year → índice en records

    for i in range(header_row + 1, min(header_row + 80, len(df))):
        row = df.iloc[i]
        label = _label_from_row(row)
        if not label:
            continue

        canon = _canonical_tax(label)
        if canon is not None:
            last_canon = canon
            for y, col in year_cols.items():
                val = _safe_float(row.iloc[col]) if col < len(row) else None
                if val is None:
                    continue
                rec = {
                    "year": y,
                    "impuesto": canon,
                    "importe_bruto": None,
                    "devoluciones": None,
                    "importe_neto": val,
                }
                if canon == "IVA":
                    iva_rows[y] = len(records)
                records.append(rec)
        elif last_canon == "IVA" and iva_rows:
            lower = label.lower()
            if "bruto" in lower or "devolucione" in lower:
                for y, col in year_cols.items():
                    val = _safe_float(row.iloc[col]) if col < len(row) else None
                    if val is None or y not in iva_rows:
                        continue
                    idx = iva_rows[y]
                    if "bruto" in lower:
                        records[idx]["importe_bruto"] = val
                    else:
                        records[idx]["devoluciones"] = val

    return records


def _safe_float(val) -> float | None:
    """Convierte un valor de celda Excel a float.

    Los valores numéricos de openpyxl llegan como Python float/int y se
    devuelven directamente.  Las cadenas en formato europeo (punto = miles,
    coma = decimal) se convierten antes de parsear.
    """
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return None if pd.isna(val) else float(val)
    # Cadena: puede venir en formato europeo "1.234,56"
    try:
        s = str(val).strip()
        # Si no hay coma, el punto es decimal (formato anglosajón)
        if "," not in s:
            return float(s)
        # Si hay coma, asumimos formato europeo: quitar puntos, cambiar coma
        return float(s.replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return None
