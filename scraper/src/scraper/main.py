"""
CLI principal del scraper de cuentas-publicas.

Uso:
    uv run python -m scraper run                  # todas las fuentes
    uv run python -m scraper run --source aeat    # solo AEAT
    uv run python -m scraper run --year 2024      # solo ese año
    uv run python -m scraper status               # recuento de filas por tabla
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from scraper.db import connect, create_schema, row_counts, DB_PATH

console = Console()

SOURCES = [
    "aeat", "sepg", "igae", "seguridad_social", "transferencias_ccaa", "ccaa",
    "cofog", "iva_tipos", "pensiones", "sepg_politicas", "eurostat_aapp", "deuda",
]


@click.group()
def cli() -> None:
    """Pipeline de datos para cuentas-publicas."""


@cli.command()
@click.option(
    "--source",
    type=click.Choice(SOURCES),
    default=None,
    help="Ejecutar solo esta fuente (por defecto: todas).",
)
@click.option(
    "--year",
    type=int,
    default=None,
    help="Procesar solo este año (si la fuente lo soporta).",
)
def run(source: str | None, year: int | None) -> None:
    """Descarga y normaliza datos en la base de datos DuckDB."""
    console.print(f"[bold]Base de datos:[/bold] {DB_PATH}")
    conn = connect()
    create_schema(conn)

    sources_to_run = [source] if source else SOURCES
    for src in sources_to_run:
        console.print(f"\n[bold cyan]→ {src}[/bold cyan]")
        try:
            _run_source(conn, src, year)
        except NotImplementedError:
            console.print(f"  [yellow]Pendiente de implementar.[/yellow]")
        except Exception as exc:
            console.print(f"  [red]Error: {exc}[/red]")
            raise

    conn.close()
    console.print("\n[bold green]Completado.[/bold green]")


@cli.command()
def status() -> None:
    """Muestra el número de filas por tabla en la base de datos."""
    conn = connect()
    counts = row_counts(conn)
    conn.close()

    table = Table(title=str(DB_PATH), show_lines=True)
    table.add_column("Tabla", style="cyan")
    table.add_column("Filas", justify="right", style="green")
    for name, count in counts.items():
        table.add_row(name, f"{count:,}")
    console.print(table)


def _run_source(conn, source: str, year: int | None) -> None:
    if source == "aeat":
        from scraper.scrapers.aeat import run as run_aeat
        run_aeat(conn, year=year)
    elif source == "sepg":
        from scraper.scrapers.sepg import run as run_sepg
        run_sepg(conn, year=year)
    elif source == "igae":
        from scraper.scrapers.igae import run as run_igae
        run_igae(conn, year=year)
    elif source == "seguridad_social":
        from scraper.scrapers.seguridad_social import run as run_ss
        run_ss(conn, year=year)
    elif source == "transferencias_ccaa":
        from scraper.scrapers.transferencias_ccaa import run as run_transf
        run_transf(conn, year=year)
    elif source == "ccaa":
        from scraper.scrapers.ccaa import run as run_ccaa
        run_ccaa(conn, year=year)
    elif source == "cofog":
        from scraper.scrapers.igae_cofog import run as run_cofog
        run_cofog(conn, year=year)
    elif source == "iva_tipos":
        from scraper.scrapers.iva_tipos import run as run_iva_tipos
        run_iva_tipos(conn, year=year)
    elif source == "pensiones":
        from scraper.scrapers.pensiones import run as run_pensiones
        run_pensiones(conn, year=year)
    elif source == "sepg_politicas":
        from scraper.scrapers.sepg_politicas import run as run_politicas
        run_politicas(conn, year=year)
    elif source == "eurostat_aapp":
        from scraper.scrapers.eurostat_aapp import run as run_sec2010
        run_sec2010(conn, year=year)
    elif source == "deuda":
        from scraper.scrapers.deuda import run as run_deuda
        run_deuda(conn, year=year)
    else:
        raise ValueError(f"Fuente desconocida: {source}")


if __name__ == "__main__":
    cli()
