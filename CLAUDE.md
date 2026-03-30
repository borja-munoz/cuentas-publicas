# CLAUDE.md — Cuentas Públicas

## Project

Static educational website to explore Spain's public budgets (revenues, expenditure, CCAA). No backend — a Python scraper builds a DuckDB file served as a static asset; the React frontend queries it in-browser via DuckDB WASM.

## Repository Layout

```
scraper/    Python data pipeline (uv, Python 3.12+)
web/        React + TypeScript frontend (Vite 5)
```

Full design: [ARCHITECTURE.md](ARCHITECTURE.md) — Implementation plan: [PLAN.md](PLAN.md)

## Scraper (`scraper/`)

- Run with `uv run python -m scraper run` from `scraper/`
- Output: `cuentas-publicas.duckdb` (copy to `web/public/db/` after build)
- Each source has a `scrapers/<source>.py` (download); transform modules exist for `aeat`, `igae`, `sepg` (shared by Estado + SS)
- Schema and upsert helpers in `db.py`; CLI entry point in `main.py`

## Frontend (`web/`)

- `npm run dev` to start; `npm run build` for production
- DuckDB WASM singleton in `src/db/client.ts` — all pages use `query<T>(sql)` from there
- Global filters (year, entity type, view mode) live in Zustand store: `src/store/filters.ts`
- All SQL queries prefixed with `cp.` (the attached DuckDB database alias)
- `coi-serviceworker.js` in `public/` is required for GitHub Pages (COOP/COEP headers)

## Key Conventions

- Language: Spanish (UI labels, variable names in domain code, comments)
- Every page follows: `PageHeader → ContextBox → InsightsPanel → chart → table → source note`
- `ContextBox`: static educational text (JSX, written per page)
- `InsightsPanel`: dynamic highlights computed from query results via `buildInsights()` functions
- Number formatting: `formatEur()` and `formatPct()` from `src/utils/format.ts`
- Chart wrappers (`BarChart`, `LineChart`, `TreemapChart`, `SunburstChart`) live in `src/components/charts/`
- `ChoroplethMap` (react-simple-maps + d3-scale) is used for CCAA pages — GeoJSON at `public/geo/ccaa.json`

## Data Sources

| Table | Source | Years |
|-------|--------|-------|
| `recaudacion_aeat` | AEAT Anuario Estadístico | 1995–2024 |
| `ingresos_plan` / `gastos_plan` | SEPG series históricas | 2005–2025 |
| `ingresos_ejecucion` / `gastos_ejecucion` | IGAE ejecución presupuestaria | 2015–2024 |
| `transferencias_ccaa` | Derived from `ccaa_ingresos` caps 4+7 (SGCIEF) | 2002–2023 |
| `ccaa_ingresos` / `ccaa_gastos` | Ministerio de Hacienda SGCIEF | 2002–2023 |
| `poblacion_ccaa` | INE Padrón Municipal | not yet loaded |

## Deployment

- GitHub Pages; base URL `/cuentas-publicas/` set in `vite.config.ts`
- `deploy.yml`: build on push to `main` → publish `web/dist/` to `gh-pages` branch
- `update-data.yml`: cron on 1st of each month → run scraper → commit `.duckdb` → redeploy
