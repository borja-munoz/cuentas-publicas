"""
Scraper Pensiones Contributivas SS — número, importe medio (mites.gob.es).

Fuente: Ministerio de Inclusión, Seguridad Social y Migraciones.
        Banco de Estadísticas Laborales (BEL) — serie PEN-3.

URL del Excel: https://www.mites.gob.es/estadisticas/bel/PEN/pen3.xls
(accesible desde pen3_top_EXCEL.htm → frameset → pen3.xls)

Estructura del fichero .xls (anual, desde 2016):
  Fila 13+: datos anuales
  Columna 0: año (e.g. "2023...........")
  Pares de columnas por clase de pensión:
    TOTAL, INCAPACIDAD PERMANENTE, JUBILACION, VIUDEDAD, ORFANDAD, FAVOR FAMILIAR
    Cada par: Número (miles) | Importe medio (€/mes)

importe_total (M€/año) se calcula: num_pensiones × pension_media × 12 / 1_000_000

El servidor usa certificado con CA intermedia no estándar; SSL verification desactivada.

Cobertura: 2016–presente (datos anuales).
"""

from __future__ import annotations

import io
import ssl
import urllib.request

import duckdb
import pandas as pd
from rich.console import Console

from scraper.db import upsert

console = Console()

_URL_XLS = "https://www.mites.gob.es/estadisticas/bel/PEN/pen3.xls"

# Tipos en el orden de columnas del fichero (saltando TOTAL, cols 1-2)
# TOTAL está en cols 1-2; después pares (num, media) por tipo
_TIPOS_COLS = [
    # (tipo_clave, col_num, col_media)
    ("incapacidad",    3,  4),
    ("jubilacion",     5,  6),
    ("viudedad",       7,  8),
    ("orfandad",       9, 10),
    ("favor_familiar", 11, 12),
]

_FIRST_YEAR = 2016


def _fetch_bytes(url: str) -> bytes:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; cuentas-publicas-scraper/1.0)"}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return resp.read()


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    console.print("  Descargando PEN-3 (pensiones por clase, Excel)…")

    try:
        raw = _fetch_bytes(_URL_XLS)
    except Exception as exc:
        console.print(f"  [red]Error descargando PEN-3 XLS: {exc}[/red]")
        return

    try:
        df = pd.read_excel(io.BytesIO(raw), header=None)
    except Exception as exc:
        console.print(f"  [red]Error leyendo Excel PEN-3: {exc}[/red]")
        return

    console.print(f"  Excel cargado: {df.shape[0]}×{df.shape[1]}")

    records = _parse(df, year)
    if not records:
        console.print("  [yellow]No se extrajeron registros.[/yellow]")
        return

    result = pd.DataFrame(records)
    result["tipo"] = result["tipo"].astype(object)

    delete_clause = f"year = {year}" if year is not None else f"year >= {_FIRST_YEAR}"
    n = upsert(conn, "pensiones_ss", result, delete_where=delete_clause)
    console.print(f"  [green]pensiones_ss: {n} filas insertadas.[/green]")


def _parse(df: pd.DataFrame, year_filter: int | None) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        # Identificar filas con año en columna 0
        cell = str(row.iloc[0])
        m = None
        import re
        m = re.search(r"((?:19|20)\d{2})", cell)
        if not m:
            continue
        # Ignorar filas de meses (ENE, FEB...) — solo queremos anuales
        if any(mes in cell.upper() for mes in
               ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
                "JUL", "AGO", "SEP", "OCT", "NOV", "DIC", "Q1", "Q2", "Q3", "Q4"]):
            continue
        year = int(m.group(1))
        if year < _FIRST_YEAR:
            continue
        if year_filter is not None and year != year_filter:
            continue

        for tipo, col_num, col_med in _TIPOS_COLS:
            try:
                num_miles = float(row.iloc[col_num])
                media = float(row.iloc[col_med])
            except (ValueError, TypeError, IndexError):
                continue

            if pd.isna(num_miles) or pd.isna(media):
                continue

            num_pensiones = int(round(num_miles * 1000))
            # importe_total en M€/año = pensiones × media €/mes × 12 meses / 1e6
            importe_total = num_pensiones * media * 12 / 1_000_000

            records.append({
                "year":          year,
                "tipo":          tipo,
                "num_pensiones": num_pensiones,
                "importe_total": round(importe_total, 2),
                "pension_media": round(media, 2),
            })

    return records
