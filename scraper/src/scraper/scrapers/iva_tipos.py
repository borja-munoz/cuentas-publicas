"""
Scraper IVA por tipo impositivo — base imponible y cuota devengada (AEAT).

Fuente: AEAT Anuario Estadístico — descarga masiva CSV del Modelo 390
        (Declaración resumen anual del IVA).

URL: https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/Estadisticas/
     Anuario_estadistico/Exportacion/modelo390.csv

Estructura del CSV (separador: ';'):
  EJER   — año del ejercicio
  CCAA   — código CCAA (0–19; usamos todos para sumar el total nacional)
  SECTOR — sector empresarial
  TIPOPER — tipo de operación (0=total régimen general, 1=grandes empresas, etc.)
  MODELO — siempre 390

  Campos clave del Modelo 390 (casillas de la declaración):
    M390_1  → Casilla 1:  Base imponible tipo general (21%)
    M390_2  → Casilla 2:  Cuota devengada tipo general (21%)
    M390_3  → Casilla 3:  Base imponible tipo reducido (10%)
    M390_4  → Casilla 4:  Cuota devengada tipo reducido (10%)
    M390_5  → Casilla 5:  Base imponible tipo superreducido (4%)
    M390_6  → Casilla 6:  Cuota devengada tipo superreducido (4%)

Estrategia: filtrar TIPOPER=0 (total declarado) y sumar todas las CCAA para
obtener el agregado nacional por año. Convertir euros → M€ dividiendo entre 1e6.

Cobertura: todos los años disponibles en el CSV (típicamente 2010–año actual).
"""

from __future__ import annotations

import io

import duckdb
import pandas as pd
import requests
from rich.console import Console

from scraper.db import upsert

console = Console()

_CSV_URL = (
    "https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/Estadisticas/"
    "Anuario_estadistico/Exportacion/modelo390.csv"
)

# Mapeo casilla → campo canónico
_TIPO_MAP = {
    "general":      ("M390_1", "M390_2"),   # base, cuota al 21%
    "reducido":     ("M390_3", "M390_4"),   # base, cuota al 10%
    "superreducido": ("M390_5", "M390_6"),  # base, cuota al 4%
}


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Descarga y procesa el CSV de Modelo 390 de la AEAT."""
    console.print("  Descargando modelo390.csv…")

    try:
        r = requests.get(_CSV_URL, timeout=60)
        r.raise_for_status()
        raw = r.content
    except requests.RequestException as exc:
        console.print(f"  [red]Error descargando modelo390.csv: {exc}[/red]")
        return

    try:
        df = pd.read_csv(io.BytesIO(raw), sep=";", dtype=str, low_memory=False)
    except Exception as exc:
        console.print(f"  [red]Error parseando CSV: {exc}[/red]")
        return

    # Normalizar columnas
    df.columns = [c.strip().upper() for c in df.columns]

    required = {"EJER", "CCAA", "TIPOPER", "M390_1", "M390_2", "M390_3", "M390_4", "M390_5", "M390_6"}
    missing = required - set(df.columns)
    if missing:
        console.print(f"  [red]Columnas no encontradas en modelo390.csv: {missing}[/red]")
        console.print(f"  Columnas disponibles: {list(df.columns)}")
        return

    # Convertir a numérico
    df["EJER"]   = pd.to_numeric(df["EJER"],   errors="coerce")
    df["CCAA"]   = pd.to_numeric(df["CCAA"],   errors="coerce")
    df["TIPOPER"]= pd.to_numeric(df["TIPOPER"], errors="coerce")

    for col in ["M390_1", "M390_2", "M390_3", "M390_4", "M390_5", "M390_6"]:
        df[col] = pd.to_numeric(df[col].str.replace(",", "."), errors="coerce")

    # Filtrar TIPOPER=0 (régimen general total; excluye desgloses por régimen)
    df = df[df["TIPOPER"] == 0].copy()

    if year is not None:
        df = df[df["EJER"] == year]

    if df.empty:
        console.print("  [yellow]Sin datos tras filtrado.[/yellow]")
        return

    # Agregar a nivel nacional (suma de todas las CCAA) por año
    agg = (
        df.groupby("EJER")[["M390_1", "M390_2", "M390_3", "M390_4", "M390_5", "M390_6"]]
        .sum()
        .reset_index()
    )

    records = []
    for _, row in agg.iterrows():
        y = int(row["EJER"])
        for tipo, (base_col, cuota_col) in _TIPO_MAP.items():
            base  = row[base_col]
            cuota = row[cuota_col]
            if pd.isna(base) and pd.isna(cuota):
                continue
            records.append({
                "year":            y,
                "tipo":            tipo,
                # Los valores en el CSV están en euros; convertir a M€
                "base_imponible":  base  / 1_000_000 if pd.notna(base)  else None,
                "cuota_devengada": cuota / 1_000_000 if pd.notna(cuota) else None,
            })

    if not records:
        console.print("  [yellow]No se generaron registros de IVA por tipo.[/yellow]")
        return

    result = pd.DataFrame(records)
    result["tipo"] = result["tipo"].astype(object)

    delete_clause = (
        f"year = {year}"
        if year is not None
        else "year IS NOT NULL"  # borrar todo
    )

    n = upsert(conn, "recaudacion_iva_tipo", result, delete_where=delete_clause)
    console.print(f"  [green]recaudacion_iva_tipo: {n} filas insertadas.[/green]")
