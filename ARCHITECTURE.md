# Arquitectura — Cuentas Públicas

## Visión General

`cuentas-publicas` es un sitio web **estático y educativo** para explorar los presupuestos públicos de España (ingresos y gastos). Cada página combina visualizaciones interactivas con texto explicativo contextual: definiciones de conceptos, metodología de los datos y destacados clave generados dinámicamente a partir de los propios datos. No requiere servidor backend: un pipeline de datos Python genera un fichero DuckDB que se sirve como asset estático, y el navegador lo consulta directamente mediante **DuckDB WASM**.

```
┌──────────────────────────────────────────┐      ┌───────────────────────────────────────────┐
│  PIPELINE DE DATOS (Python / CI)         │      │  NAVEGADOR (React + DuckDB WASM)          │
│                                          │      │                                           │
│  scrapers/                               │      │  App.tsx                                  │
│    aeat.py        ──┐                    │      │    ├── Inicio         (dashboard KPIs)    │
│    igae.py        ──┤                    │      │    ├── Ingresos       (por capítulo)       │
│    sepg.py        ──┼──► db.py ──► .duckdb ───►│    │     └── Impuestos (detalle AEAT)     │
│    ss.py          ──┤   (asset estático) │      │    ├── Gastos         (por capítulo)      │
│    transfer_ccaa.py─┤                    │      │    ├── Comparativa    (plan vs ejecución)  │
│    ccaa.py        ──┘                    │      │    ├── Transferencias (mapa — pendiente)   │
│                                          │      │    └── CCAA           (mapa — pendiente)   │
│  GitHub Actions                          │      │                                           │
│    → cron mensual: scraper + commit      │      │  DuckDB WASM (Web Worker)                 │
│    → trigger: redeploy a GitHub Pages    │      │                                           │
└──────────────────────────────────────────┘      └───────────────────────────────────────────┘
```

---

## Estructura del Repositorio

```
cuentas-publicas/
│
├── scraper/                              # Pipeline de datos (Python)
│   ├── pyproject.toml                    # Proyecto uv (Python 3.12+)
│   ├── uv.lock
│   └── src/scraper/
│       ├── __init__.py
│       ├── main.py                       # CLI: `uv run python -m scraper run [--year N] [--source X]`
│       ├── db.py                         # Schema DuckDB + helpers de escritura (upsert)
│       ├── scrapers/
│       │   ├── aeat.py                   # Recaudación AEAT (1995–2024)
│       │   ├── igae.py                   # Ejecución presupuestaria IGAE (2015–2024)
│       │   ├── sepg.py                   # Plan presupuestario SEPG (2005–2025)
│       │   ├── seguridad_social.py       # Presupuesto Seguridad Social (2005–2025)
│       │   ├── transferencias_ccaa.py    # Transferencias Estado → CCAA (derivadas de ccaa_ingresos)
│       │   └── ccaa.py                   # Presupuestos CCAA (Mº Hacienda SGCIEF, 2002–2023)
│       └── transform/
│           ├── aeat.py                   # Normalización datos AEAT
│           ├── igae.py                   # Normalización datos IGAE
│           └── sepg.py                   # Normalización datos SEPG (Estado + SS)
│
├── web/                                  # Frontend React
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .nvmrc                            # Node 22
│   ├── index.html                        # Meta tags SEO + coi-serviceworker
│   ├── public/
│   │   ├── coi-serviceworker.js          # Fix COOP/COEP para GitHub Pages (ver abajo)
│   │   ├── favicon.svg
│   │   ├── db/
│   │   │   └── cuentas-publicas.duckdb   # Generado por el scraper, servido estáticamente
│   │   └── geo/
│   │       └── ccaa.json                 # GeoJSON CCAA (para fase 5)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                       # Router + AppShell
│       ├── utils/
│       │   ├── format.ts                 # formatEur (siempre M€), formatPct, formatNum
│       │   └── insights.ts              # Interfaz Insight { label, value, trend, description }
│       ├── db/
│       │   ├── client.ts                 # Singleton DuckDB WASM (getDB, query<T>)
│       │   └── queries/
│       │       ├── ingresos.ts           # Queries ingresos + CAPITULO_INGRESOS_TOOLTIP
│       │       ├── gastos.ts             # Queries gastos + CAPITULO_GASTOS_TOOLTIP
│       │       └── aeat.ts              # Queries recaudación AEAT + IMPUESTO_COLORS
│       ├── store/
│       │   └── filters.ts               # Zustand: selectedYear, entityType, viewMode
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx          # Sidebar + YearSelector + EntitySelector
│       │   │   └── PageHeader.tsx        # Título + subtítulo de página
│       │   ├── filters/
│       │   │   ├── YearSelector.tsx
│       │   │   └── ViewModeToggle.tsx    # Plan / Ejecución
│       │   ├── charts/
│       │   │   ├── BarChart.tsx          # ECharts barras (simple, apiladas, agrupadas, horizontal)
│       │   │   └── LineChart.tsx         # ECharts líneas multi-serie (series temporales)
│       │   └── ui/
│       │       ├── KpiCard.tsx           # Tarjeta KPI (valor + variación ▲/▼, estilo Economist)
│       │       ├── LoadingSkeleton.tsx   # Placeholder animado + ChartSkeleton
│       │       ├── ErrorBoundary.tsx     # Mensaje si WASM no carga
│       │       ├── ContextBox.tsx        # Texto estático de contexto educativo
│       │       ├── InsightsPanel.tsx     # Grid de destacados dinámicos (Insight[])
│       │       └── InfoTooltip.tsx       # Botón "i" con popover explicativo (portal fixed)
│       └── pages/
│           ├── Inicio/index.tsx          # Dashboard: KPIs saldo + líneas ingresos vs gastos
│           ├── Ingresos/
│           │   ├── index.tsx             # Barras por capítulo + línea histórica + tabla
│           │   └── Impuestos.tsx         # Líneas IRPF/IVA/Sociedades (1995–2024) + tabla
│           ├── Gastos/index.tsx          # Barras por capítulo + líneas históricas + tabla
│           └── Comparativa/index.tsx     # Barras plan vs ejecución + tabla desviación
│
├── .github/
│   └── workflows/
│       ├── deploy.yml                    # Build pnpm + deploy a GitHub Pages (API oficial)
│       └── update-data.yml              # Cron 1º mes: scraper → commit .duckdb → redeploy
│
├── ARCHITECTURE.md                       # Este fichero
├── PLAN.md                               # Hoja de ruta de implementación
└── .gitignore                            # Excluye *.duckdb globalmente; incluye web/public/db/*.duckdb
```

---

## Fuentes de Datos

| Fuente | Organismo | Formato | Años | Granularidad |
|--------|-----------|---------|------|--------------|
| Anuario Estadístico Tributario | AEAT | Excel | 1995–2024 | Anual, por tipo de impuesto |
| Ejecución Presupuestaria | IGAE | Excel | 2015–2024 | Anual, clasificación económica (extracto diciembre) |
| Plan PGE — Series Históricas | SEPG | Excel | 2005–2025 | Anual, por capítulo |
| Presupuesto Seguridad Social | SEPG | Excel | 2005–2025 | Anual, por capítulo |
| Transferencias a CCAA | Mº Hacienda SGCIEF (derivado) | Derivado | 2002–2023 | Por CCAA, caps. 4 y 7 |
| Presupuestos CCAA (consolidado) | Mº Hacienda SGCIEF | Excel | 2002–2023 | Por CCAA, capítulo, plan y ejecución |

**Notas de descarga:**
- **AEAT**: ficheros IART por año (2017–2024); histórico 1995–2016 en hoja "1.6" del último IART. User-Agent estándar.
- **IGAE**: ficheros "extracto diciembre" por año. 2015–2024 (2009–2014 solo en PDF). El fichero 2015 es `.xls` (requiere `xlrd`). Valores en **K€** — las queries dividen entre 1000 para convertir a M€.
- **SEPG**: `02 Presupuesto del Estado.xlsx` y `03 Presupuesto de la Seguridad Social.xlsx` por carpeta de año. Browser User-Agent requerido. Formato wide (capítulos en filas, años en columnas). Cabeceras anotadas `"2013 (*)"` capturadas con regex específico.
- **2020**: sin PGE aprobado (prórroga de 2018). Se inserta sintéticamente copiando datos de 2018 en `_insert_prorroga_2020()`.
- **Transferencias CCAA**: el desglose por CCAA no está en ficheros SEPG. Se derivan de `ccaa_ingresos` (caps. 4 y 7 de los presupuestos liquidados de cada CCAA).
- **Presupuestos CCAA**: portal SGCIEF, formulario ASP.NET. Un Excel por CCAA×año. Cobertura 2002–2023.

---

## Esquema DuckDB

### Tablas principales

```sql
-- Recaudación tributaria detallada (AEAT)
CREATE TABLE recaudacion_aeat (
    year             INTEGER NOT NULL,
    month            INTEGER NOT NULL DEFAULT 0,  -- 0 = total anual
    impuesto         VARCHAR NOT NULL,   -- 'IRPF', 'IVA', 'Sociedades', 'Especiales', 'Otros'
    importe_bruto    DECIMAL(18,2),
    devoluciones     DECIMAL(18,2),
    importe_neto     DECIMAL(18,2),
    PRIMARY KEY (year, month, impuesto)
);

-- Plan de ingresos (SEPG + SS)
CREATE TABLE ingresos_plan (
    year         INTEGER NOT NULL,
    entidad      VARCHAR NOT NULL,   -- 'Estado', 'SS'
    capitulo     INTEGER NOT NULL,
    articulo     INTEGER,
    concepto     INTEGER,
    descripcion  VARCHAR,
    importe      DECIMAL(18,2),      -- M€
    PRIMARY KEY (year, entidad, capitulo, COALESCE(articulo, -1), COALESCE(concepto, -1))
);

-- Ejecución de ingresos (IGAE)
CREATE TABLE ingresos_ejecucion (
    year                    INTEGER NOT NULL,
    entidad                 VARCHAR NOT NULL,
    capitulo                INTEGER NOT NULL,
    articulo                INTEGER,
    concepto                INTEGER,
    descripcion             VARCHAR,
    derechos_reconocidos    DECIMAL(18,2),
    recaudacion_neta        DECIMAL(18,2),
    PRIMARY KEY (year, entidad, capitulo, COALESCE(articulo, -1), COALESCE(concepto, -1))
);

-- Plan de gastos (SEPG + SS)
CREATE TABLE gastos_plan (
    year          INTEGER NOT NULL,
    entidad       VARCHAR NOT NULL,
    seccion_cod   VARCHAR,
    seccion_nom   VARCHAR,
    programa_cod  VARCHAR,
    programa_nom  VARCHAR,
    capitulo      INTEGER NOT NULL,
    articulo      INTEGER,
    concepto      INTEGER,
    descripcion   VARCHAR,
    importe       DECIMAL(18,2),      -- M€
    PRIMARY KEY (year, entidad, COALESCE(seccion_cod, ''), COALESCE(programa_cod, ''),
                 capitulo, COALESCE(articulo, -1), COALESCE(concepto, -1))
);

-- Ejecución de gastos (IGAE)
CREATE TABLE gastos_ejecucion (
    year                       INTEGER NOT NULL,
    entidad                    VARCHAR NOT NULL,
    seccion_cod                VARCHAR,
    seccion_nom                VARCHAR,
    programa_cod               VARCHAR,
    programa_nom               VARCHAR,
    capitulo                   INTEGER NOT NULL,
    articulo                   INTEGER,
    concepto                   INTEGER,
    descripcion                VARCHAR,
    creditos_iniciales         DECIMAL(18,2),
    creditos_definitivos       DECIMAL(18,2),
    obligaciones_reconocidas   DECIMAL(18,2),  -- K€ (÷1000 en queries)
    pagos_ordenados            DECIMAL(18,2),
    PRIMARY KEY (year, entidad, COALESCE(seccion_cod, ''), COALESCE(programa_cod, ''),
                 capitulo, COALESCE(articulo, -1), COALESCE(concepto, -1))
);
```

### Tablas CCAA

```sql
CREATE TABLE ccaa_ref (
    ccaa_cod  VARCHAR PRIMARY KEY,
    ccaa_nom  VARCHAR NOT NULL,
    capital   VARCHAR
);

CREATE TABLE transferencias_ccaa (
    year      INTEGER NOT NULL,
    ccaa_cod  VARCHAR NOT NULL,
    ccaa_nom  VARCHAR NOT NULL,
    tipo      VARCHAR NOT NULL,   -- 'corriente' | 'capital' | 'fci' | 'ue'
    fuente    VARCHAR NOT NULL,   -- 'plan' | 'ejecucion'
    importe   DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, tipo, fuente)
);

CREATE TABLE ccaa_ingresos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);

CREATE TABLE ccaa_gastos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);
```

### Vistas pre-calculadas

```sql
CREATE VIEW v_gastos_plan_capitulo AS
SELECT year, entidad, seccion_cod, seccion_nom, capitulo, SUM(importe) AS importe
FROM gastos_plan WHERE articulo IS NULL GROUP BY ALL;

CREATE VIEW v_gastos_plan_seccion AS
SELECT year, entidad, seccion_cod, seccion_nom, SUM(importe) AS importe
FROM gastos_plan WHERE articulo IS NULL AND programa_cod IS NULL GROUP BY ALL;

CREATE VIEW v_ingresos_plan_capitulo AS
SELECT year, entidad, capitulo, descripcion, SUM(importe) AS importe
FROM ingresos_plan WHERE articulo IS NULL GROUP BY ALL;

CREATE VIEW v_transferencias_ccaa_total AS
SELECT year, ccaa_cod, ccaa_nom, fuente,
       SUM(importe)                                             AS total,
       SUM(CASE WHEN tipo='corriente' THEN importe ELSE 0 END) AS corriente,
       SUM(CASE WHEN tipo='capital'   THEN importe ELSE 0 END) AS capital,
       SUM(CASE WHEN tipo='fci'       THEN importe ELSE 0 END) AS fci,
       SUM(CASE WHEN tipo='ue'        THEN importe ELSE 0 END) AS ue
FROM transferencias_ccaa GROUP BY ALL;

CREATE VIEW v_ccaa_resumen AS
SELECT g.year, g.ccaa_cod, r.ccaa_nom,
       SUM(CASE WHEN g.fuente='plan'      THEN g.importe ELSE 0 END) AS gastos_plan,
       SUM(CASE WHEN g.fuente='ejecucion' THEN g.importe ELSE 0 END) AS gastos_ejec,
       i.ingresos_plan, i.ingresos_ejec
FROM ccaa_gastos g
JOIN (SELECT year, ccaa_cod,
             SUM(CASE WHEN fuente='plan'      THEN importe ELSE 0 END) AS ingresos_plan,
             SUM(CASE WHEN fuente='ejecucion' THEN importe ELSE 0 END) AS ingresos_ejec
      FROM ccaa_ingresos GROUP BY ALL) i USING (year, ccaa_cod)
JOIN ccaa_ref r USING (ccaa_cod)
GROUP BY ALL;
```

---

## Stack Tecnológico del Frontend

| Preocupación | Librería | Versión |
|---|---|---|
| Framework | React + TypeScript | 18 / 5 |
| Build tool | Vite | 8 |
| Gestor de paquetes | pnpm | latest |
| Node | — | 22 (`.nvmrc`) |
| CSS | Tailwind CSS | v4 (plugin Vite) |
| Gráficas | Apache ECharts + echarts-for-react | 5 |
| DB cliente | @duckdb/duckdb-wasm | latest |
| Estado global | Zustand | 4 |
| Routing | React Router | v6 |
| Mapa coroplético (fase 5) | react-simple-maps + d3-scale + d3-scale-chromatic | 3 |
| Headers fix | coi-serviceworker | — |

---

## Convenciones del Frontend

### Unidades monetarias

Todos los valores se muestran siempre en **M€** (millones de euros). Nunca se usan "B€" (ambiguo: en español "billón" = 10¹²).

```typescript
// src/utils/format.ts
formatEur(9495)   // → "9.495 M€"
formatEur(189005) // → "189.005 M€"
formatPct(0.045)  // → "+4,5%"
formatPct(0.0005) // → null  (suprime cambios triviales < 0,1%)
```

### Bug DuckDB WASM — DECIMAL(18,2)

`toJSON()` serializa `DECIMAL(18,2)` como entero × 100 (sin punto decimal). **Fix aplicado en todas las queries:** `CAST(SUM(importe) AS DOUBLE)`.

### Unidades en `gastos_ejecucion`

Los valores de `obligaciones_reconocidas` en `gastos_ejecucion` están en **K€**. Las queries dividen entre 1000: `SUM(obligaciones_reconocidas) / 1000.0`.

### InfoTooltip

Renderiza mediante `createPortal` en `document.body` con `position: fixed`, evitando recorte por `overflow: hidden/auto` de la tabla. La posición (arriba/abajo del botón) se calcula con `getBoundingClientRect()` en el momento de mostrar.

---

## Capa Educativa

Cada página implementa dos zonas de texto:

### `ContextBox` — Texto estático
Explica qué muestra la página y cómo leer los datos. Se escribe como JSX directamente en el archivo de la página.

### `InsightsPanel` — Destacados dinámicos
Grid de 3 columnas con tarjetas que muestran un valor numérico calculado, indicador de tendencia ▲/▼ y descripción narrativa. Los insights se calculan en el propio componente de página a partir de los datos ya cargados (sin llamadas adicionales a la DB).

```typescript
// src/utils/insights.ts
export interface Insight {
  label: string        // "Peso transf. corrientes (cap. 4)"
  value: string        // "58,3%"
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string  // "+2,1 pp vs 2022"
  description: string  // texto explicativo de 1–2 frases
}
```

**Insights implementados por página:**

| Página | Insights |
|--------|---------|
| Inicio | Saldo del año · Años en déficit de la serie · Mayor déficit histórico |
| Ingresos | Peso impuestos (cap 1+2) · Mayor fuente · Dependencia de deuda (cap 9) |
| Gastos | Peso transferencias corrientes (cap 4) · Variación YoY · Gasto en personal |
| Impuestos (AEAT) | Variación recaudación YoY · Ratio devoluciones IVA · Máximo histórico |
| Comparativa | Tasa de ejecución global · Crédito no ejecutado · Capítulo menos ejecutado |

### Layout estándar de página

```
PageHeader → ContextBox → InsightsPanel → KpiCards → Gráfico → Tabla → Nota de fuente
```

---

## GitHub Pages: Solución COOP/COEP

DuckDB WASM requiere `SharedArrayBuffer`, que el navegador solo permite con:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
GitHub Pages no permite configurar estas cabeceras. La solución es [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker): un service worker que intercepta las respuestas y añade las cabeceras en el cliente. Se registra antes de cualquier otro script en `index.html`.

---

## Pipeline CI/CD

```
push a main  ──► deploy.yml
                   ├── setup-node (v22) + pnpm
                   ├── pnpm install --frozen-lockfile
                   ├── pnpm build  →  web/dist/
                   ├── upload-pages-artifact
                   └── deploy-pages  →  GitHub Pages (API oficial)

cron: 0 6 1 * *  (1º de cada mes, 06:00 UTC)
    └──► update-data.yml
             ├── astral-sh/setup-uv (Python 3.12)
             ├── uv run python -m scraper run
             ├── cp cuentas-publicas.duckdb web/public/db/
             ├── git commit "chore: actualizar datos YYYY-MM"
             ├── git push
             └── workflow_dispatch → deploy.yml
```

**Nota:** `web/public/db/cuentas-publicas.duckdb` está excluido por `*.duckdb` en `.gitignore` pero re-incluido con `!web/public/db/cuentas-publicas.duckdb` para que el CI pueda hacer commit del fichero actualizado.
