"""
Transferencias Estado → CCAA (derivadas de ccaa_ingresos).

No existe una fuente estática con el desglose por CCAA de los arts. 46/76 del
Estado. Como mejor proxy disponible se usan los capítulos 4 (corriente) y 7
(capital) de los ingresos liquidados de cada CCAA (fuente SGCIEF), que incluyen
tanto las transferencias del Estado como las del sistema de financiación.

Tablas requeridas: ccaa_ingresos (debe estar cargada antes).
Tabla destino: transferencias_ccaa.
"""

from __future__ import annotations

import duckdb
from rich.console import Console

from scraper.db import upsert

console = Console()


def run(conn: duckdb.DuckDBPyConnection, year: int | None = None) -> None:
    """Deriva transferencias a CCAA desde ccaa_ingresos (caps. 4 y 7)."""

    # Check if ccaa_ingresos has data
    count = conn.execute("SELECT COUNT(*) FROM ccaa_ingresos").fetchone()[0]
    if count == 0:
        console.print(
            "[yellow]ccaa_ingresos está vacía. Ejecuta primero: "
            "uv run python -m scraper run --source ccaa[/yellow]"
        )
        return

    year_filter = f"AND i.year = {year}" if year is not None else ""

    sql = f"""
    SELECT
        i.year,
        i.ccaa_cod,
        r.ccaa_nom,
        CASE i.capitulo
            WHEN 4 THEN 'corriente'
            WHEN 7 THEN 'capital'
        END AS tipo,
        i.fuente,
        i.importe
    FROM ccaa_ingresos i
    JOIN ccaa_ref r USING (ccaa_cod)
    WHERE i.capitulo IN (4, 7)
      AND i.importe IS NOT NULL
      {year_filter}
    """

    df = conn.execute(sql).df()
    if df.empty:
        console.print("[yellow]Sin datos de transferencias.[/yellow]")
        return

    df["ccaa_cod"] = df["ccaa_cod"].astype(object)
    df["ccaa_nom"] = df["ccaa_nom"].astype(object)
    df["tipo"] = df["tipo"].astype(object)
    df["fuente"] = df["fuente"].astype(object)

    year_clause = (
        f"year = {year}" if year is not None
        else f"year IN ({','.join(str(y) for y in sorted(df['year'].unique()))})"
    )
    n = upsert(
        conn,
        "transferencias_ccaa",
        df,
        delete_where=year_clause,
    )
    console.print(f"  → transferencias_ccaa: {n} filas.")
