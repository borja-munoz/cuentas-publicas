# Arquitectura — Cuentas Públicas

## Visión General

`cuentas-publicas` es un sitio web **estático y educativo** para explorar los presupuestos públicos de España (ingresos y gastos). Cada página combina visualizaciones interactivas con texto explicativo contextual: definiciones de conceptos, metodología de los datos y destacados clave generados dinámicamente a partir de los propios datos. No requiere servidor backend: un pipeline de datos Python genera un fichero DuckDB que se sirve como asset estático, y el navegador lo consulta directamente mediante **DuckDB WASM**.

```
┌──────────────────────────────────────────┐      ┌───────────────────────────────────────────┐
│  PIPELINE DE DATOS (Python / CI)         │      │  NAVEGADOR (React + DuckDB WASM)          │
│                                          │      │                                           │
│  scrapers/                               │      │  App.tsx                                  │
│    aeat.py        ──┐                    │      │    ├── /                      (Inicio)    │
│    igae.py        ──┤                    │      │    ├── /aapp/ingresos  (AAPP SEC2010)     │
│    sepg.py        ──┼──► db.py ──► .duckdb ───►│    ├── /aapp/gastos   (AAPP SEC2010)     │
│    ss.py          ──┤   (asset estático) │      │    ├── /estado        (resumen Estado)    │
│    transfer_ccaa.py─┤                    │      │    ├── /estado/ingresos · /gastos         │
│    ccaa.py        ──┤                    │      │    ├── /ss            (resumen SS)         │
│    eurostat_aapp.py─┤                    │      │    ├── /ss/ingresos · /gastos             │
│    deuda.py       ──┘                    │      │    ├── /ccaa          (resumen CCAA)       │
│                                          │      │    ├── /ccaa/ingresos (transferencias)     │
│                                          │      │    ├── /ccaa/gastos   (mapa + drill-down)  │
│                                          │      │    ├── /ccaa/:cod     (detalle CCAA)       │
│                                          │      │    ├── /aapp/deuda   (deuda PDE AAPP)      │
│                                          │      │    ├── /estado/deuda · /ss/deuda           │
│                                          │      │    └── /ccaa/deuda   (deuda CCAA)          │
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
│       │   ├── ccaa.py                   # Presupuestos CCAA (Mº Hacienda SGCIEF, 2002–2023)
│       │   ├── eurostat_aapp.py           # AAPP SEC2010 (Eurostat gov_10a_main + nama_10_gdp)
│       │   └── deuda.py                  # Deuda PDE por subsector (Eurostat gov_10dd_edpt1)
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
│   │       └── ccaa.json                 # GeoJSON 19 CCAA; anillos CW corregidos; Canarias en pos. original
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                       # Router + AppShell
│       ├── utils/
│       │   ├── format.ts                 # formatEur (siempre M€), formatPct, formatNum
│       │   ├── colors.ts                 # Paleta editorial: PALETTE + CATEGORICAL
│       │   └── insights.ts              # Interfaz Insight { label, value, trend, description }
│       ├── db/
│       │   ├── client.ts                 # Singleton DuckDB WASM (getDB, query<T>)
│       │   └── queries/
│       │       ├── ingresos.ts           # Queries ingresos + CAPITULO_INGRESOS_TOOLTIP + getResumenAnualCompleto
│       │       ├── gastos.ts             # Queries gastos + CAPITULO_GASTOS_TOOLTIP
│       │       ├── aeat.ts              # Queries recaudación AEAT + IMPUESTO_COLORS
│       │       ├── ccaa.ts              # Queries CCAA: transferencias, resumen, getCcaaResumenHistorico
│       │       ├── aapp.ts              # Queries AAPP SEC2010: ingresos, gastos, PIB por subsector
│       │       ├── cofog.ts             # Queries gasto funcional COFOG + COFOG_NAMES/COLORS
│       │       ├── gastos_politica.ts   # Queries políticas de gasto PGE consolidado
│       │       ├── iva_tipos.ts         # Queries IVA por tipo impositivo
│       │       ├── pensiones.ts         # Queries pensiones contributivas SS
│       │       └── deuda.ts            # Queries deuda PDE por subsector (getDeudaHistorica, getDeudaAnual)
│       ├── store/
│       │   └── filters.ts               # Zustand: selectedYear, viewMode, pageFilters (sin entityType)
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx          # Sidebar (solo navegación, agrupada por ámbito) + TopBar
│       │   │   ├── TopBar.tsx            # Barra sticky: YearSelector + ViewModeToggle (sin EntityToggle)
│       │   │   └── PageHeader.tsx        # Título + subtítulo de página
│       │   ├── filters/
│       │   │   ├── YearSelector.tsx
│       │   │   └── ViewModeToggle.tsx    # Plan / Ejecución (por página)
│       │   ├── charts/
│       │   │   ├── BarChart.tsx          # ECharts barras (simple, apiladas, agrupadas, horizontal)
│       │   │   ├── LineChart.tsx         # ECharts líneas multi-serie (series temporales)
│       │   │   └── ChoroplethMap.tsx     # Mapa SVG puro d3-geo + ColorLegend (ver sección abajo)
│       │   └── ui/
│       │       ├── KpiCard.tsx           # Tarjeta KPI (valor + variación ▲/▼, estilo Economist)
│       │       ├── LoadingSkeleton.tsx   # Placeholder animado + ChartSkeleton
│       │       ├── ErrorBoundary.tsx     # Mensaje si WASM no carga
│       │       ├── ContextBox.tsx        # Texto estático de contexto educativo
│       │       ├── InsightsPanel.tsx     # Grid de destacados dinámicos (Insight[])
│       │       └── InfoTooltip.tsx       # Botón "i" con popover explicativo (portal fixed)
│       └── pages/
│           ├── Inicio/index.tsx          # Dashboard AAPP: KPIs ingresos/gastos/saldo + líneas históricas
│           ├── AAPP/
│           │   ├── Ingresos.tsx          # Ingresos AAPP SEC2010 por concepto + histórico + tabla
│           │   ├── Gastos.tsx            # Gastos AAPP SEC2010 por concepto + histórico + tabla
│           │   └── Deuda.tsx             # Deuda PDE: stock total + ratio PIB + breakdown subsectores
│           ├── Estado/
│           │   ├── index.tsx             # Resumen Estado: KPIs + LineChart histórico + tabla
│           │   ├── Deuda.tsx             # Deuda Estado (S1311): stock + ratio PIB + histórico
│           │   ├── Ingresos/
│           │   │   ├── index.tsx         # Por capítulo + plan vs ejec (entity='Estado' hardcodeado)
│           │   │   ├── Impuestos.tsx     # Líneas IRPF/IVA/Sociedades 1995–2024 + tabla (AEAT)
│           │   │   └── IvaTipos.tsx      # IVA por tipo impositivo (base + cuota)
│           │   └── Gastos/
│           │       ├── index.tsx         # Por capítulo + política de gasto + plan vs ejec
│           │       └── Funcion.tsx       # Gasto funcional COFOG sector S13 AAPP
│           ├── SS/
│           │   ├── index.tsx             # Resumen SS: KPIs + LineChart histórico + tabla
│           │   ├── Deuda.tsx             # Deuda SS (S1314): stock + ratio PIB + histórico
│           │   ├── Ingresos.tsx          # Por capítulo + plan vs ejec (entity='SS' hardcodeado)
│           │   └── Gastos/
│           │       ├── index.tsx         # Por capítulo + plan vs ejec (entity='SS'; sin vista política)
│           │       └── Pensiones.tsx     # Pensiones contributivas: barras, líneas, tabla
│           └── CCAA/
│               ├── index.tsx             # Resumen CCAA: KPIs + LineChart histórico + tabla todas CCAA
│               ├── Deuda.tsx             # Deuda CCAA (S1312): stock + ratio PIB + histórico
│               ├── Ingresos.tsx          # Transferencias Estado→CCAA: mapa + serie + tabla
│               ├── Gastos.tsx            # Gastos CCAA: mapa coroplético + drill-down por capítulo
│               └── Detalle.tsx           # Detalle CCAA: KPIs + tabs Gastos/Ingresos/Comparativa
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
| Gasto funcional COFOG | Eurostat `gov_10a_exp` | JSON-stat REST API | 1995–2023 | AAPP + 4 subsectores, 10 funciones COFOG |
| IVA por tipo impositivo | AEAT Modelo 390 | CSV estático | 2005–2022 | Nacional, 3 tipos (21%/10%/4%) |
| Pensiones contributivas | Mº Inclusión BEL PEN-3 | HTML table | 2000–2024 | 5 tipos de pensión, número e importe medio |
| Cuentas AAPP SEC2010 | Eurostat `gov_10a_main` | JSON-stat REST API | 1995–actual | 5 subsectores, ~9 conceptos ingresos + ~9 gastos |
| PIB a precios corrientes | Eurostat `nama_10_gdp` | JSON-stat REST API | 1975–actual | Nacional, M€ corrientes |
| Deuda PDE (stock) | Eurostat `gov_10dd_edpt1` | JSON-stat REST API | 1995–actual | 5 subsectores (S13/S1311/S1312/S1313/S1314), M€ |

- **AAPP SEC2010 (Eurostat gov_10a_main)**: misma API REST que `gov_10a_exp`. 5 peticiones (una por sector). Items de ingresos (TR, D2REC, D5REC, D61REC, D4REC, D7REC, D9REC) y gastos (TE, D1PAY, P2, D3PAY, D41PAY, D62PAY, D7PAY, D9PAY, P51G, B9) en la misma llamada por sector. Mapeo NA_ITEM → concepto canónico en `eurostat_aapp.py`. Cobertura ~1995–actual (último año publicado suele retrasarse 6–12 meses). Pausa 0,5s entre peticiones.
- **PIB (Eurostat nama_10_gdp)**: `na_item=B1GQ&unit=CP_MEUR&geo=ES`. Una sola petición. Cobertura 1975–actual.
- **Deuda PDE (Eurostat gov_10dd_edpt1)**: `na_item=GD&unit=MIO_EUR&geo=ES`. 5 peticiones (una por sector). Indicador Maastricht — deuda bruta consolidada del sector en M€. Cobertura ~1995–actual (retraso habitual 6–12 meses). Pausa 0,5s entre peticiones.

**Notas de descarga:**
- **AEAT**: ficheros IART por año (2017–2024); histórico 1995–2016 en hoja "1.6" del último IART. User-Agent estándar.
- **IGAE**: ficheros "extracto diciembre" por año. 2015–2024 (2009–2014 solo en PDF). El fichero 2015 es `.xls` (requiere `xlrd`). Valores en **K€** — las queries dividen entre 1000 para convertir a M€.
- **SEPG**: `02 Presupuesto del Estado.xlsx` y `03 Presupuesto de la Seguridad Social.xlsx` por carpeta de año. Browser User-Agent requerido. Formato wide (capítulos en filas, años en columnas). Cabeceras anotadas `"2013 (*)"` capturadas con regex específico.
- **2020**: sin PGE aprobado (prórroga de 2018). Se inserta sintéticamente copiando datos de 2018 en `_insert_prorroga_2020()`.
- **Transferencias CCAA**: el desglose por CCAA no está en ficheros SEPG. Se derivan de `ccaa_ingresos` (caps. 4 y 7 de los presupuestos liquidados de cada CCAA).
- **Presupuestos CCAA**: portal SGCIEF, formulario ASP.NET. Un Excel por CCAA×año. Cobertura 2002–2023.
- **COFOG (Eurostat)**: REST API JSON-stat en `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp`. Sin autenticación. 5 peticiones (una por sector). Pausa 0,5s entre peticiones. Cobertura ~1995–2023.
- **IVA tipos (AEAT)**: CSV estático `modelo390.csv`. Filtro `TIPOPER=0` (régimen general total). Agregado nacional sumando todas las CCAA. Columnas M390_1–6 = base/cuota por tipo (general, reducido, superreducido). Unidades en euros → dividir ÷1e6 para M€.
- **Pensiones (mites.gob.es)**: tabla HTML en BEL PEN-3. SSL verification deshabilitada (`ssl.CERT_NONE`) por certificado con CA no estándar.

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

-- Gasto funcional COFOG (Eurostat gov_10a_exp)
CREATE TABLE gastos_funcion (
    year       INTEGER NOT NULL,
    sector     VARCHAR NOT NULL,   -- 'S13' AAPP, 'S1311' Estado, 'S1312' CCAA, 'S1313' CCLL, 'S1314' SS
    cofog_cod  VARCHAR NOT NULL,   -- 'GF01'–'GF10'
    cofog_nom  VARCHAR NOT NULL,
    importe    DECIMAL(18,2),      -- M€ a precios corrientes
    PRIMARY KEY (year, sector, cofog_cod)
);

-- IVA por tipo impositivo (AEAT Modelo 390)
CREATE TABLE recaudacion_iva_tipo (
    year             INTEGER NOT NULL,
    tipo             VARCHAR NOT NULL,   -- 'general' (21%), 'reducido' (10%), 'superreducido' (4%)
    base_imponible   DECIMAL(18,2),      -- M€
    cuota_devengada  DECIMAL(18,2),      -- M€
    PRIMARY KEY (year, tipo)
);

-- Cuentas AAPP SEC2010 — ingresos consolidados (Eurostat gov_10a_main)
-- subsector: 'S13' AAPP, 'S1311' Estado, 'S1312' CCAA, 'S1313' CCLL, 'S1314' SS
-- concepto: 'total','impuestos_produccion','impuestos_renta','cotizaciones',
--           'rentas_propiedad','transferencias_corrientes','transferencias_capital'
CREATE TABLE aapp_ingresos (
    year         INTEGER NOT NULL,
    subsector    VARCHAR NOT NULL,
    concepto     VARCHAR NOT NULL,
    concepto_nom VARCHAR NOT NULL,
    importe      DECIMAL(18,2),      -- M€ a precios corrientes
    PRIMARY KEY (year, subsector, concepto)
);

-- Cuentas AAPP SEC2010 — gastos consolidados (Eurostat gov_10a_main)
-- concepto: 'total','remuneracion_empleados','consumos_intermedios','subvenciones',
--           'intereses','prestaciones_sociales','transferencias_corrientes',
--           'transferencias_capital','fbcf','saldo'
CREATE TABLE aapp_gastos (
    year         INTEGER NOT NULL,
    subsector    VARCHAR NOT NULL,
    concepto     VARCHAR NOT NULL,
    concepto_nom VARCHAR NOT NULL,
    importe      DECIMAL(18,2),
    PRIMARY KEY (year, subsector, concepto)
);

-- PIB a precios corrientes (Eurostat nama_10_gdp, na_item=B1GQ, unit=CP_MEUR)
CREATE TABLE pib_anual (
    year  INTEGER PRIMARY KEY,
    pib   DECIMAL(18,2)              -- M€ a precios corrientes
);

-- Pensiones contributivas SS (Mº Inclusión BEL PEN-3)
CREATE TABLE pensiones_ss (
    year           INTEGER NOT NULL,
    tipo           VARCHAR NOT NULL,   -- 'jubilacion', 'incapacidad', 'viudedad', 'orfandad', 'favor_familiar'
    num_pensiones  INTEGER,            -- número de pensiones en vigor
    importe_total  DECIMAL(18,2),      -- M€/año (importe mensual × 12)
    pension_media  DECIMAL(10,2),      -- €/mes
    PRIMARY KEY (year, tipo)
);

-- Deuda PDE (Procedimiento de Déficit Excesivo) por subsector (Eurostat gov_10dd_edpt1)
-- subsector: 'S13' AAPP, 'S1311' Estado, 'S1312' CCAA, 'S1313' CCLL, 'S1314' SS
-- Indicador: GD (Gross Debt) — deuda bruta consolidada en metodología Maastricht
CREATE TABLE deuda_pde (
    year      INTEGER NOT NULL,
    subsector VARCHAR NOT NULL,
    importe   DECIMAL(18,2),           -- M€ a precios corrientes
    PRIMARY KEY (year, subsector)
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
| Mapa coroplético | d3-geo + d3-scale + d3-scale-chromatic (SVG puro) | 3 |
| Headers fix | coi-serviceworker | — |

---

## Convenciones del Frontend

### Paleta de colores

Los tokens de color se centralizan en `src/utils/colors.ts` y se exponen como variables CSS en el bloque `@theme` de `src/index.css`. Nunca se usan valores hex hardcoded fuera de esos dos archivos.

| Rol | Variable CSS / token | Valor | Uso |
|-----|----------------------|-------|-----|
| Acento principal | `--color-accent` / `PALETTE.accent` | `#B82A2A` | Plan, primera serie, color de marca |
| Acento secundario | `--color-accent-alt` / `PALETTE.accentAlt` | `#C89B3C` | Ejecución, segunda serie |
| Acento oscuro | `--color-accent-dark` / `PALETTE.accentDark` | `#7a1a1a` | Hover, bordes activos |
| Positivo | `--color-positive` / `PALETTE.positive` | `#1F7A3D` | Superávit, tendencia favorable |
| Negativo | — / `PALETTE.negative` | `#B82A2A` | Déficit, tendencia desfavorable (= accent) |
| Fondo crema | `--color-bg-paper` / `PALETTE.paper` | `#FAF7F2` | Cards, ContextBox |

Para gráficas con 3+ series se usa el array `CATEGORICAL` (8 colores en orden, el primero es `accent`).

### Layout — TopBar sticky y arquitectura de ámbito

El ámbito (Estado / SS / CCAA) se encoda en la URL, **no** en el store global. No existe `entityType` en Zustand. Las páginas hardcodean la entidad como constante de módulo (no como prop):

```typescript
// pages/Estado/Ingresos/index.tsx
const entity = 'Estado'

// pages/SS/Ingresos.tsx
const entity = 'SS'
```

La sidebar se agrupa por ámbito. Los encabezados **Estado**, **Seguridad Social** y **CCAA** son `NavLink` que apuntan a sus páginas de resumen (`/estado`, `/ss`, `/ccaa`). Los enlaces de subpáginas usan `level: 1` (sangría 1rem, `text-xs`) o `level: 2` (sangría 2rem) para representar la jerarquía visual correcta. No hay toggle de entidad; la navegación es la fuente de verdad.

`TopBar.tsx` es una barra `sticky top-0` con solo `YearSelector` + `ViewModeToggle` condicional. Sin `EntityToggle`.

El store `filters.ts` expone `pageFilters: { showViewMode: boolean }` y `setPageFilters()`. Las páginas que necesitan el toggle Plan/Ejecución lo activan con:

```typescript
useEffect(() => {
  setPageFilters({ showViewMode: true })
  return () => setPageFilters({ showViewMode: false })
}, [setPageFilters])
```

Páginas con `showViewMode: true`: Estado/Ingresos, Estado/Gastos, SS/Ingresos, SS/Gastos.
Páginas sin toggle: Inicio, Estado (resumen), SS (resumen), CCAA (resumen), Impuestos AEAT, IVA, Gasto por función, Pensiones, CCAA/Ingresos, CCAA/Gastos.

**Redirects activos:** `/ingresos` → `/estado/ingresos`, `/gastos` → `/estado/gastos`, `/comparativa` → `/estado/gastos`, `/transferencias` → `/ccaa/ingresos`, `/ccaa/transferencias` → `/ccaa/ingresos`.

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

### Eurostat JSON-stat (gastos_funcion)

La API Eurostat `gov_10a_exp` devuelve JSON-stat: un array `value` plano indexado con strides por dimensión (`id`, `size`). El scraper calcula el índice flat como `sum(pos_dim × stride_dim)` con strides calculados de derecha a izquierda desde `size`. Se hacen 5 peticiones (una por sector), no 1 masiva, para evitar timeouts de la API.

### mites.gob.es SSL (pensiones_ss)

El servidor de mites.gob.es usa un certificado con CA no estándar. El scraper usa `urllib.request` con `ssl.CERT_NONE` (sin verificación). Esto es aceptable porque el destino es una fuente oficial pública de solo lectura.

### InfoTooltip

Renderiza mediante `createPortal` en `document.body` con `position: fixed`, evitando recorte por `overflow: hidden/auto` de la tabla. La posición (arriba/abajo del botón) se calcula con `getBoundingClientRect()` en el momento de mostrar.

### ChoroplethMap — Mapa SVG puro

`ChoroplethMap.tsx` usa **d3-geo directamente** (no react-simple-maps). Motivo: react-simple-maps no permite pasar una proyección d3 ya construida sin casts inseguros, lo que producía escala incorrecta.

**Pipeline de renderizado:**
1. Se carga `public/geo/ccaa.json` con `fetch` al montar el componente
2. Las coordenadas de Canarias (`ccaa_cod === 'CN'`) se desplazan `+4° longitud / +7° latitud` en el callback del fetch, antes de guardar en estado. Esto sitúa Canarias en un recuadro visible junto a la Península, siguiendo la convención IGN/INE.
3. `useMemo` construye `geoMercator().fitExtent([[20,20],[W-20,H-20]], geoData)` a partir de la `FeatureCollection` completa (Canarias ya desplazada incluida). Así los límites de la proyección abarcan todo el territorio visible.
4. Cada `<path>` SVG recibe `fill` calculado con `colorScale(data[ccaa_cod])` (d3-scale `scaleSequential`).
5. El tooltip usa `createPortal` sobre `document.body` para evitar recorte.

**Convención de anillos GeoJSON (winding):**
d3-geo v3 requiere anillos exteriores en sentido horario (CW) para la geometría esférica. El GeoJSON estándar es CCW. Los polígonos con winding incorrecto son interpretados como el complemento de la región (mundo menos España), lo que produce `geoArea ≈ 4π sr` y `fitExtent` calcula escala ≈ 82 en lugar de ≈ 1488. El fichero `ccaa.json` tiene los anillos ya corregidos.

**Datos CCAA — unidades y años:**
- `ccaa_gastos`, `ccaa_ingresos`, `transferencias_ccaa`: almacenan importes en **K€**. Todas las queries dividen entre 1000 para obtener M€.
- Cobertura temporal: 2002–2023. Las páginas CCAA mantienen su propio `selectedYear` local inicializado al máximo disponible (actualmente 2023), independiente del `selectedYear` global del store Zustand (que puede alcanzar 2025 por los datos de `gastos_plan`).

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
| IVA por tipo | Tipo efectivo medio · % base a tipo general/reducido · Cuota total · Tipo superreducido |
| Estado/Gastos (modo comparativa) | Tasa de ejecución global · Crédito no ejecutado · Capítulo menos ejecutado |
| Transferencias | Mayor receptora · Total nacional · % corrientes vs capital |
| CCAA Overview | CCAA con mayor gasto · Mayor déficit · Tasa de ejecución media |
| CCAA Detalle | — (KPI cards integrados en la cabecera; sin InsightsPanel) |
| Gasto por función | Mayor función COFOG · Estado de bienestar (GF10+GF07+GF09) · Total AAPP |
| Pensiones | Gasto jubilación · Pensiones viudedad · Total contributivas · Pensión media global |

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
