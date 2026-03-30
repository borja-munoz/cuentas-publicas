# scraper — Pipeline de datos para cuentas-publicas

Pipeline Python que descarga, normaliza y carga en DuckDB los datos de los presupuestos públicos de España.

## Requisitos

- Python 3.12+
- [uv](https://github.com/astral-sh/uv)

## Instalación

```bash
cd scraper
uv sync
```

## Uso

```bash
# Ejecutar todas las fuentes
uv run python -m scraper run

# Solo una fuente
uv run python -m scraper run --source aeat
uv run python -m scraper run --source sepg
uv run python -m scraper run --source igae
uv run python -m scraper run --source seguridad_social
uv run python -m scraper run --source transferencias_ccaa
uv run python -m scraper run --source ccaa

# Solo un año concreto
uv run python -m scraper run --source igae --year 2024

# Ver recuento de filas por tabla
uv run python -m scraper status
```

La base de datos se genera en la raíz del repositorio: `../cuentas-publicas.duckdb`.
Cópiala a `web/public/db/` para el frontend:

```bash
cp ../cuentas-publicas.duckdb ../web/public/db/
```

## Fuentes de datos

| Fuente | Módulo | Tablas destino | Años | Unidad |
|--------|--------|---------------|------|--------|
| AEAT Anuario Estadístico | `scrapers/aeat.py` | `recaudacion_aeat` | 1995–2024 | Miles de € |
| SEPG series históricas | `scrapers/sepg.py` | `gastos_plan`, `ingresos_plan` (entidad=Estado) | 2005–2025 | Millones de € |
| IGAE ejecución presupuestaria | `scrapers/igae.py` | `gastos_ejecucion`, `ingresos_ejecucion` | 2015–2024 | Miles de € |
| SEPG Seguridad Social | `scrapers/seguridad_social.py` | `gastos_plan`, `ingresos_plan` (entidad=SS) | 2005–2025 | Millones de € |
| Transferencias a CCAA | `scrapers/transferencias_ccaa.py` | `transferencias_ccaa` | 2002–2023 | Millones de € |
| Presupuestos CCAA | `scrapers/ccaa.py` | `ccaa_gastos`, `ccaa_ingresos` | 2002–2023 | Miles de € |

## Estructura

```
scraper/
├── pyproject.toml
└── src/scraper/
    ├── main.py          # CLI (click): comandos run y status
    ├── db.py            # Schema DuckDB + helpers de escritura (upsert)
    ├── scrapers/        # Descarga y parseo por fuente
    │   ├── aeat.py
    │   ├── sepg.py
    │   ├── igae.py
    │   ├── seguridad_social.py
    │   ├── transferencias_ccaa.py
    │   └── ccaa.py
    └── transform/       # Normalización (tipos, deduplicación)
        ├── aeat.py
        ├── sepg.py
        └── igae.py
```

## Schema DuckDB

Las tablas principales son:

- **`recaudacion_aeat`**: Recaudación tributaria AEAT por impuesto y año (`month=0` = total anual).
- **`ingresos_plan`** / **`gastos_plan`**: Plan presupuestario (SEPG) por capítulo económico. `entidad` ∈ {Estado, SS}.
- **`ingresos_ejecucion`** / **`gastos_ejecucion`**: Ejecución presupuestaria (IGAE) por capítulo económico.
- **`transferencias_ccaa`**: Transferencias del Estado a cada CCAA desglosadas por tipo.
- **`ccaa_ingresos`** / **`ccaa_gastos`**: Presupuesto (plan y ejecución) de cada CCAA por capítulo.
- **`ccaa_ref`**: Tabla de referencia con códigos y nombres de las 19 comunidades/ciudades autónomas.
- **`poblacion_ccaa`**: Población por CCAA y año (INE).

Vistas pre-calculadas para el frontend:
- `v_gastos_plan_capitulo`, `v_gastos_plan_seccion`, `v_ingresos_plan_capitulo`
- `v_transferencias_ccaa_total`, `v_ccaa_resumen`
