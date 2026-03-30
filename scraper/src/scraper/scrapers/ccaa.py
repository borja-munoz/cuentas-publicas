"""
Scraper presupuestos CCAA — Mº Hacienda / SGCIEF.

Fuente: SGCIEF PublicacionLiquidaciones (2002–2023).
URL: DescargaEconomicaDC.aspx?cdcdad={SGCIEF_COD}&ano={YEAR}

Un fichero por CCAA × año; ingresos y gastos por capítulo.
Columnas disponibles: Presupuesto Inicial, Presupuesto Definitivo,
  Derechos Reconocidos Netos (ing) / Obligaciones Reconocidas Netas (gto),
  Ingresos Líquidos / Pagos Líquidos.

Se cargan dos filas por capítulo:
  fuente='plan'      → Presupuesto Inicial
  fuente='ejecucion' → Derechos/Obligaciones Reconocidos Netos
"""

from __future__ import annotations

import io
import re
import time
import xml.etree.ElementTree as ET
import zipfile

import duckdb
import requests
from rich.console import Console

from scraper.db import upsert
import pandas as pd

console = Console()

_BASE = (
    "https://serviciostelematicosext.hacienda.gob.es"
    "/SGCIEF/PublicacionLiquidaciones/aspx"
)
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# SGCIEF code → our ccaa_ref code
_CCAA_MAP: dict[str, str] = {
    "01": "AN",
    "02": "AR",
    "03": "AS",
    "04": "IB",
    "05": "CN",
    "06": "CB",
    "07": "CL",
    "08": "CM",
    "09": "CT",
    "10": "EX",
    "11": "GA",
    "12": "MD",
    "13": "MC",
    "14": "NC",
    "15": "PV",
    "16": "RI",
    "17": "VC",
    "18": "CE",
    "19": "ME",
}

_YEARS = list(range(2002, 2024))  # 2002–2023

_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

# Labels that appear in chapter rows (start with digit + dot)
_CAP_RE = re.compile(r"^(\d)\.\s+", re.UNICODE)
# Skip subtotal rows
_SKIP_LABELS = {
    "operaciones corrientes",
    "operaciones capital",
    "operaciones no financieras",
    "operaciones financieras",
    "total",
    "total  ingresos",
    "total  gastos",
}


def _parse_xlsx(data: bytes) -> tuple[list[dict], list[dict]]:
    """
    Parsea el fichero xlsx (con bugs en el XML) y extrae filas de ingresos y gastos.

    Devuelve (ingresos_rows, gastos_rows), cada una con claves:
      capitulo, descripcion, presupuesto_inicial, reconocido_neto
    """
    zf = zipfile.ZipFile(io.BytesIO(data))
    raw = zf.read("xl/worksheets/sheet1.xml").decode("utf-8", errors="replace")

    # Fix invalid col element (min=0 / max=0 is not valid in OOXML)
    raw = re.sub(r'<x:col\s+min="0"\s+max="0"[^/]*/>', "", raw)
    # Fix bad cell references like r="@9" → r="B9"
    raw = re.sub(r'\br="@(\d+)"', r'r="B\1"', raw)

    root = ET.fromstring(raw)
    sheetdata = root.find(f"{{{_NS}}}sheetData")
    if sheetdata is None:
        return [], []

    # Collect (row_number, [cell_values]) for non-empty rows
    rows: list[tuple[int, list[str]]] = []
    for row_el in sheetdata.findall(f"{{{_NS}}}row"):
        r_num = int(row_el.get("r", "0"))
        vals = []
        for c in row_el.findall(f"{{{_NS}}}c"):
            v = c.find(f"{{{_NS}}}v")
            vals.append(v.text.strip() if v is not None and v.text else "")
        if any(vals):
            rows.append((r_num, vals))

    # Identify ingresos / gastos section start rows
    ing_start = gas_start = None
    for r_num, vals in rows:
        label = vals[0].lower().strip()
        if "capítulos de ingresos" in label or "cap" in label and "ingreso" in label:
            ing_start = r_num
        if "capítulos de gastos" in label or "cap" in label and "gasto" in label:
            gas_start = r_num

    def _extract_section(start: int, end: int | None) -> list[dict]:
        result = []
        for r_num, vals in rows:
            if r_num <= start:
                continue
            if end is not None and r_num >= end:
                break
            label = vals[0].strip() if vals else ""
            m = _CAP_RE.match(label)
            if not m:
                continue
            cap = int(m.group(1))
            desc = label
            try:
                pres_ini = float(vals[1]) if len(vals) > 1 and vals[1] else None
                reconocido = float(vals[3]) if len(vals) > 3 and vals[3] else None
            except (ValueError, TypeError):
                pres_ini = reconocido = None
            result.append({
                "capitulo": cap,
                "descripcion": desc,
                "presupuesto_inicial": pres_ini,
                "reconocido_neto": reconocido,
            })
        return result

    ingresos = _extract_section(ing_start or 0, gas_start)
    gastos = _extract_section(gas_start or 0, None)
    return ingresos, gastos


def _download(sess: requests.Session, ccaa_cod: str, year: int) -> bytes | None:
    url = f"{_BASE}/DescargaEconomicaDC.aspx?cdcdad={ccaa_cod}&ano={year}"
    try:
        r = sess.get(url, timeout=30)
        if r.status_code == 200 and len(r.content) > 8000:
            return r.content
    except requests.RequestException:
        pass
    return None


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga y carga los presupuestos liquidados de las CCAA (2002–2023)."""

    sess = requests.Session()
    sess.headers.update(_HEADERS)
    # Establish session
    sess.get(f"{_BASE}/menuInicio.aspx", timeout=15)
    sess.get(f"{_BASE}/SelDescargaDC.aspx", timeout=15)

    years = [year] if year is not None else _YEARS
    ccaa_items = list(_CCAA_MAP.items())

    ing_rows: list[dict] = []
    gas_rows: list[dict] = []
    loaded_years: set[int] = set()

    for yr in years:
        yr_ing: list[dict] = []
        yr_gas: list[dict] = []
        ok = 0
        for sgcief_cod, ccaa_cod in ccaa_items:
            data = _download(sess, sgcief_cod, yr)
            if data is None:
                continue
            try:
                ing, gas = _parse_xlsx(data)
            except Exception as exc:
                console.print(f"    [yellow]Error {ccaa_cod} {yr}: {exc}[/yellow]")
                continue
            if not ing and not gas:
                continue
            ok += 1
            for rec in ing:
                yr_ing.append({
                    "year": yr,
                    "ccaa_cod": ccaa_cod,
                    "capitulo": rec["capitulo"],
                    "descripcion": rec["descripcion"],
                    "fuente": "plan",
                    "importe": rec["presupuesto_inicial"],
                })
                yr_ing.append({
                    "year": yr,
                    "ccaa_cod": ccaa_cod,
                    "capitulo": rec["capitulo"],
                    "descripcion": rec["descripcion"],
                    "fuente": "ejecucion",
                    "importe": rec["reconocido_neto"],
                })
            for rec in gas:
                yr_gas.append({
                    "year": yr,
                    "ccaa_cod": ccaa_cod,
                    "capitulo": rec["capitulo"],
                    "descripcion": rec["descripcion"],
                    "fuente": "plan",
                    "importe": rec["presupuesto_inicial"],
                })
                yr_gas.append({
                    "year": yr,
                    "ccaa_cod": ccaa_cod,
                    "capitulo": rec["capitulo"],
                    "descripcion": rec["descripcion"],
                    "fuente": "ejecucion",
                    "importe": rec["reconocido_neto"],
                })
            time.sleep(0.2)

        if ok:
            console.print(f"  {yr}: {ok} CCAA, {len(yr_ing)//2} ing-cap, {len(yr_gas)//2} gto-cap leídos.")
            ing_rows.extend(yr_ing)
            gas_rows.extend(yr_gas)
            loaded_years.add(yr)
        else:
            console.print(f"  {yr}: sin datos.")

    if not loaded_years:
        console.print("[yellow]Sin datos cargados.[/yellow]")
        return

    years_str = ",".join(str(y) for y in sorted(loaded_years))

    if ing_rows:
        df_i = pd.DataFrame(ing_rows)
        df_i["descripcion"] = df_i["descripcion"].astype(object)
        df_i["ccaa_cod"] = df_i["ccaa_cod"].astype(object)
        df_i["fuente"] = df_i["fuente"].astype(object)
        df_i = df_i.drop_duplicates(subset=["year", "ccaa_cod", "capitulo", "fuente"])
        n = upsert(
            conn,
            "ccaa_ingresos",
            df_i,
            delete_where=f"year IN ({years_str})",
        )
        console.print(f"  → ccaa_ingresos: {n} filas.")

    if gas_rows:
        df_g = pd.DataFrame(gas_rows)
        df_g["descripcion"] = df_g["descripcion"].astype(object)
        df_g["ccaa_cod"] = df_g["ccaa_cod"].astype(object)
        df_g["fuente"] = df_g["fuente"].astype(object)
        df_g = df_g.drop_duplicates(subset=["year", "ccaa_cod", "capitulo", "fuente"])
        n = upsert(
            conn,
            "ccaa_gastos",
            df_g,
            delete_where=f"year IN ({years_str})",
        )
        console.print(f"  → ccaa_gastos: {n} filas.")
