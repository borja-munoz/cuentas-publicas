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
│    ss.py          ──┤   (asset estático) │      │    ├── Gastos         (treemap drill-down) │
│    transfer_ccaa.py─┤                    │      │    │     └── Programa (sección detalle)   │
│    ccaa.py        ──┘                    │      │    ├── Comparativa    (plan vs ejecución)  │
│                                          │      │    ├── Transferencias (mapa coroplético)   │
│  GitHub Actions                          │      │    └── CCAA           (mapa + detalle)     │
│    → cron mensual: scraper + commit      │      │                                           │
│    → trigger: redeploy a GitHub Pages    │      │  DuckDB WASM (Web Worker)                 │
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
│       ├── main.py                       # CLI: `python -m scraper run [--year N] [--source X]`
│       ├── db.py                         # Schema DuckDB + helpers de escritura (upsert)
│       ├── scrapers/
│       │   ├── aeat.py                   # Recaudación AEAT (1995–2024)
│       │   ├── igae.py                   # Ejecución presupuestaria IGAE (2009–2024)
│       │   ├── sepg.py                   # Plan presupuestario SEPG (2005–2025)
│       │   ├── seguridad_social.py       # Presupuesto Seguridad Social
│       │   ├── transferencias_ccaa.py    # Extrae transferencias a CCAA del PGE (arts. 46/76)
│       │   └── ccaa.py                   # Presupuestos CCAA (Mº Hacienda consolidado, 2002–2024)
│       └── transform/
│           ├── aeat.py                   # Normalización datos AEAT
│           ├── igae.py                   # Normalización datos IGAE
│           └── sepg.py                   # Normalización datos SEPG (Estado + SS)
│
├── web/                                  # Frontend React
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── coi-serviceworker.js          # Fix COOP/COEP para GitHub Pages (ver abajo)
│   │   └── db/
│   │       └── cuentas-publicas.duckdb   # Generado por el scraper, servido estáticamente
│   └── src/
│       ├── main.tsx                      # Monta App, registra service worker
│       ├── App.tsx                       # Router + AppShell
│       ├── utils/
│       │   ├── format.ts                 # formatEur, formatPct, formatNum
│       │   └── insights.ts              # Tipo Insight + helpers buildInsights por página
│       ├── db/
│       │   ├── client.ts                 # Singleton DuckDB WASM (getDB, query<T>)
│       │   └── queries/
│       │       ├── ingresos.ts           # Queries de ingresos (plan + ejecución)
│       │       ├── gastos.ts             # Queries de gastos (plan + ejecución)
│       │       └── aeat.ts              # Queries de recaudación AEAT
│       ├── store/
│       │   └── filters.ts               # Zustand: año seleccionado, entidad, viewMode
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx          # Sidebar + header principal
│       │   │   └── PageHeader.tsx        # Título de página + filtros globales
│       │   ├── filters/
│       │   │   ├── YearSelector.tsx      # Selector de año activo
│       │   │   └── ViewModeToggle.tsx    # Plan / Ejecución / Comparativa
│       │   ├── charts/
│       │   │   ├── BarChart.tsx          # Wrapper ECharts barras (simple + apiladas + agrupadas)
│       │   │   ├── LineChart.tsx         # Wrapper ECharts líneas (series temporales)
│       │   │   ├── TreemapChart.tsx      # Wrapper ECharts treemap con drill-down
│       │   │   ├── SunburstChart.tsx     # Wrapper ECharts sunburst (jerarquía)
│       │   │   └── ChoroplethMap.tsx     # Mapa SVG España coroplético (react-simple-maps + d3-scale)
│       │   └── ui/
│       │       ├── KpiCard.tsx           # Tarjeta KPI con valor + variación YoY
│       │       ├── LoadingSkeleton.tsx   # Placeholder animado durante carga WASM
│       │       ├── ErrorBoundary.tsx     # Mensaje si WASM no carga
│       │       ├── ContextBox.tsx        # Texto estático de contexto educativo
│       │       └── InsightsPanel.tsx     # Fila de destacados dinámicos (Insight[])
│       └── pages/
│           ├── Inicio/index.tsx          # Dashboard: KPIs + barras ingresos vs gastos
│           ├── Ingresos/
│           │   ├── index.tsx             # Barras apiladas por capítulo + tabla detalle
│           │   └── Impuestos.tsx         # Líneas IRPF/IVA/Sociedades + sunburst
│           ├── Gastos/
│           │   ├── index.tsx             # Treemap secciones + ranking top 10
│           │   └── Programa.tsx          # Drill-down: programas de una sección
│           ├── Comparativa/index.tsx     # Barras plan vs ejecución + tabla desviación
│           ├── Transferencias/index.tsx  # Mapa + tabla: transferencias Estado → CCAA
│           └── CCAA/
│               ├── index.tsx             # Mapa + tabla comparativa 17 CCAA
│               └── Detalle.tsx           # Presupuesto de una CCAA (tabs ingresos/gastos/comparativa)
│
├── .github/
│   └── workflows/
│       ├── update-data.yml               # Cron mensual: scraper + commit .duckdb
│       └── deploy.yml                    # Build web + push a gh-pages branch
│
├── web/public/geo/
│   └── ccaa.json                         # GeoJSON boundaries 17 CCAA + Ceuta + Melilla (IGN)
│
├── ARCHITECTURE.md                       # Este fichero
├── PLAN.md                               # Hoja de ruta de implementación
├── LICENSE
└── README.md
```

---

## Fuentes de Datos

| Fuente | Organismo | Formato | Años | Granularidad |
|--------|-----------|---------|------|--------------|
| Anuario Estadístico Tributario | AEAT | Excel/CSV | 1995–2024 | Anual/mensual, por tipo de impuesto |
| Ejecución Presupuestaria | IGAE | Excel | 2015–2024 | Anual, clasificación económica (extracto diciembre) |
| Plan PGE — Series Históricas | SEPG | Excel | 2005–2025 | Anual, por capítulo/sección/programa |
| Presupuesto Seguridad Social | SEPG | Excel | 2005–2025 | Anual, por capítulo |
| Transferencias a CCAA | Mº Hacienda SGCIEF (derivado) | Derivado | 2002–2023 | Por CCAA, caps. 4 (corriente) y 7 (capital) |
| Presupuestos CCAA (consolidado) | Mº Hacienda SGCIEF | Excel | 2002–2023 | Por CCAA, capítulo, plan y ejecución |
| Población por CCAA | INE | CSV / API | 2002–2024 | Padrón municipal anual por CCAA |

**Estrategia de descarga:**
- **AEAT**: descarga directa de ficheros Excel por año desde el anuario estadístico de la sede electrónica
- **IGAE**: ficheros "extracto diciembre" individuales por año (Excel con dos bloques de columnas año/año-anterior); cobertura 2015–2024 (2009–2014 solo en PDF)
- **SEPG**: un Excel por año (`02 Presupuesto del Estado.xlsx`, `03 Presupuesto de la Seguridad Social.xlsx`) desde el portal de estadísticas; formato wide (capítulos en filas, años en columnas)
- **Seguridad Social**: mismo portal y estructura SEPG; hoja "31" gastos, "32" ingresos
- **Transferencias a CCAA**: el desglose por CCAA de los artículos 46/76 no está disponible como fichero estático. Se derivan de `ccaa_ingresos`: capítulo 4 (corriente) y 7 (capital) de los presupuestos liquidados de cada CCAA. Los resultados se materializan en `transferencias_ccaa`.
- **Presupuestos CCAA**: portal SGCIEF PublicacionLiquidaciones del Ministerio de Hacienda. Formulario ASP.NET que genera un Excel por CCAA×año con ingresos y gastos por capítulo (plan y ejecución). Cobertura 2002–2023.
- **Población INE**: API JSON del INE (indicador de padrón municipal por CCAA) para calcular transferencias per cápita.

---

## Esquema DuckDB

### Tablas principales

```sql
-- Recaudación tributaria detallada (AEAT)
CREATE TABLE recaudacion_aeat (
    year             INTEGER NOT NULL,
    month            INTEGER NOT NULL DEFAULT 0,  -- 0 = total anual; 1-12 = mes
    impuesto         VARCHAR NOT NULL,   -- 'IRPF', 'IVA', 'Sociedades', 'Especiales', 'Otros'
    importe_bruto    DECIMAL(18,2),
    devoluciones     DECIMAL(18,2),
    importe_neto     DECIMAL(18,2),
    PRIMARY KEY (year, month, impuesto)
);

-- Plan de ingresos (SEPG + SS)
CREATE TABLE ingresos_plan (
    year         INTEGER NOT NULL,
    entidad      VARCHAR NOT NULL,   -- 'Estado', 'OO.AA.', 'SS', 'Consolidado'
    capitulo     INTEGER NOT NULL,   -- 1=Imp.directos  2=Imp.indirectos  3=Tasas y precios
                                     -- 4=Transf.corrientes  5=Ingresos patrimoniales
                                     -- 6=Enajenación activos reales  7=Transf.capital
                                     -- 8=Activos financieros  9=Pasivos financieros
    articulo     INTEGER,
    concepto     INTEGER,
    descripcion  VARCHAR,
    importe      DECIMAL(18,2),
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
    seccion_cod   VARCHAR,           -- Código sección (Ministerio/Organismo)
    seccion_nom   VARCHAR,
    programa_cod  VARCHAR,
    programa_nom  VARCHAR,
    capitulo      INTEGER NOT NULL,  -- 1=Personal  2=Bienes corrientes  3=Gastos financieros
                                     -- 4=Transf.corrientes  6=Inversiones reales
                                     -- 7=Transf.capital  8=Activos fin.  9=Pasivos fin.
    articulo      INTEGER,
    concepto      INTEGER,
    descripcion   VARCHAR,
    importe       DECIMAL(18,2),
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
    obligaciones_reconocidas   DECIMAL(18,2),
    pagos_ordenados            DECIMAL(18,2),
    PRIMARY KEY (year, entidad, COALESCE(seccion_cod, ''), COALESCE(programa_cod, ''),
                 capitulo, COALESCE(articulo, -1), COALESCE(concepto, -1))
);
```

### Tablas adicionales para CCAA

```sql
-- Tabla de referencia de CCAA (estática, cargada una vez)
CREATE TABLE ccaa_ref (
    ccaa_cod  VARCHAR PRIMARY KEY,  -- 'AN','AR','AS','IB','CN','CB','CL','CM','CT',
                                    -- 'VC','EX','GA','MD','MC','NC','PV','RI','CE','ME'
    ccaa_nom  VARCHAR NOT NULL,
    capital   VARCHAR
);

-- Población por CCAA y año (INE Padrón Municipal)
CREATE TABLE poblacion_ccaa (
    year      INTEGER NOT NULL,
    ccaa_cod  VARCHAR NOT NULL,
    poblacion INTEGER NOT NULL,
    PRIMARY KEY (year, ccaa_cod)
);

-- Transferencias del Estado a cada CCAA (materializadas desde gastos_plan/ejecucion)
CREATE TABLE transferencias_ccaa (
    year      INTEGER NOT NULL,
    ccaa_cod  VARCHAR NOT NULL,
    ccaa_nom  VARCHAR NOT NULL,
    tipo      VARCHAR NOT NULL,   -- 'corriente' | 'capital' | 'fci' | 'ue'
    fuente    VARCHAR NOT NULL,   -- 'plan' | 'ejecucion'
    importe   DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, tipo, fuente)
);

-- Presupuesto de ingresos de cada CCAA (Ministerio de Hacienda consolidado)
CREATE TABLE ccaa_ingresos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,   -- 'plan' | 'ejecucion'
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);

-- Presupuesto de gastos de cada CCAA (Ministerio de Hacienda consolidado)
CREATE TABLE ccaa_gastos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,   -- 'plan' | 'ejecucion'
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);
```

### Vistas pre-calculadas

Se materializan en el `.duckdb` tras la carga para acelerar queries en el navegador:

```sql
-- Gastos plan agregados a nivel capítulo por sección
CREATE VIEW v_gastos_plan_capitulo AS
SELECT year, entidad, seccion_cod, seccion_nom, capitulo, SUM(importe) AS importe
FROM gastos_plan WHERE articulo IS NULL
GROUP BY ALL;

-- Gastos plan agregados a nivel sección
CREATE VIEW v_gastos_plan_seccion AS
SELECT year, entidad, seccion_cod, seccion_nom, SUM(importe) AS importe
FROM gastos_plan WHERE articulo IS NULL AND programa_cod IS NULL
GROUP BY ALL;

-- Ingresos plan agregados a nivel capítulo
CREATE VIEW v_ingresos_plan_capitulo AS
SELECT year, entidad, capitulo, descripcion, SUM(importe) AS importe
FROM ingresos_plan WHERE articulo IS NULL
GROUP BY ALL;

-- Totales de transferencias por CCAA y año (para el mapa coroplético)
CREATE VIEW v_transferencias_ccaa_total AS
SELECT year, ccaa_cod, ccaa_nom, fuente,
       SUM(importe)                                               AS total,
       SUM(CASE WHEN tipo='corriente' THEN importe ELSE 0 END)   AS corriente,
       SUM(CASE WHEN tipo='capital'   THEN importe ELSE 0 END)   AS capital,
       SUM(CASE WHEN tipo='fci'       THEN importe ELSE 0 END)   AS fci,
       SUM(CASE WHEN tipo='ue'        THEN importe ELSE 0 END)   AS ue
FROM transferencias_ccaa GROUP BY ALL;

-- Resumen CCAA (ingresos + gastos plan y ejecución) por año, para el mapa de CCAA
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
| Build tool | Vite | 5 |
| CSS | Tailwind CSS | v4 |
| Gráficas | Apache ECharts + echarts-for-react | 5 |
| DB cliente | @duckdb/duckdb-wasm | latest |
| Estado global | Zustand | 4 |
| Routing | React Router | v6 |
| Tablas | TanStack Table | v8 |
| Mapa coroplético | react-simple-maps | 3 |
| Escala de color mapa | d3-scale + d3-color | 3 |
| GeoJSON CCAA | Fichero estático `public/geo/ccaa.json` | — |
| Headers fix | coi-serviceworker | latest |

---

## Cliente DuckDB WASM

El cliente es un **singleton** que inicializa DuckDB WASM una sola vez, descarga el fichero `.duckdb` del servidor y lo adjunta como base de datos de solo lectura.

```typescript
// src/db/client.ts
import * as duckdb from '@duckdb/duckdb-wasm';

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = initDB();
  return dbPromise;
}

async function initDB(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const res = await fetch(import.meta.env.BASE_URL + 'db/cuentas-publicas.duckdb');
  await db.registerFileBuffer('cp.duckdb', new Uint8Array(await res.arrayBuffer()));
  const conn = await db.connect();
  await conn.query("ATTACH 'cp.duckdb' AS cp (READ_ONLY)");
  await conn.close();
  return db;
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const db = await getDB();
  const conn = await db.connect();
  const result = await conn.query(sql);
  await conn.close();
  return result.toArray().map(r => r.toJSON()) as T[];
}
```

---

## Estado Global (Zustand)

```typescript
// src/store/filters.ts
interface FiltersState {
  years: number[];                             // Años disponibles (cargados de DB al inicio)
  selectedYear: number;                        // Año activo para vistas de un año
  compareYears: [number, number] | null;       // Para página Comparativa
  viewMode: 'plan' | 'ejecucion' | 'comparativa';
  entityType: 'consolidado' | 'estado' | 'ooaa' | 'ss';
  setSelectedYear: (y: number) => void;
  setCompareYears: (years: [number, number]) => void;
  setViewMode: (m: FiltersState['viewMode']) => void;
  setEntityType: (e: FiltersState['entityType']) => void;
  initYears: (ys: number[]) => void;
}
```

---

## Navegación y Páginas

| Ruta | Página | Visualizaciones principales |
|------|--------|-----------------------------|
| `/` | Inicio | KPI cards + barras agrupadas ingresos vs gastos (histórico) |
| `/ingresos` | Ingresos | Barras apiladas por capítulo + tabla TanStack |
| `/ingresos/impuestos` | Impuestos (AEAT) | Líneas IRPF/IVA/Sociedades (1995–2024) + sunburst año actual |
| `/gastos` | Gastos | Treemap secciones con drill-down + ranking top 10 |
| `/gastos/:seccion` | Detalle sección | Tabla programas + barras horizontales por programa |
| `/comparativa` | Comparativa | Barras plan vs ejecución + tabla desviación ordenable |
| `/transferencias` | Transferencias | Mapa coroplético CCAA + tabla vinculada + serie histórica |
| `/ccaa` | CCAA (overview) | Mapa coroplético + tabla comparativa 17 CCAA |
| `/ccaa/:id` | CCAA (detalle) | KPIs + tabs Ingresos / Gastos / Comparativa para una CCAA |

---

## Capa Educativa — Texto Explicativo por Página

Cada página tiene **dos zonas de texto** que se muestran junto a las visualizaciones:

### 1. `ContextBox` — Texto estático de contexto

Explica *qué* muestra la página y *cómo* leer los datos. Se escribe una vez y se mantiene manualmente. Contenido típico:

- Definición del concepto (qué es el IRPF, qué es un capítulo presupuestario, etc.)
- Qué clasificación se usa y por qué (orgánica, económica, funcional)
- Fuente de los datos y años disponibles
- Cómo interpretar el gráfico principal

**Implementación:** Componente `ContextBox.tsx` que acepta `children` (JSX). El texto de cada página se escribe directamente en el archivo de la página como JSX, sin CMS ni ficheros de texto externos.

```tsx
// Ejemplo en pages/Ingresos/Impuestos.tsx
<ContextBox title="¿Qué muestran estos datos?">
  <p>
    La <strong>Agencia Tributaria (AEAT)</strong> publica anualmente la recaudación
    real de cada figura tributaria. Los datos reflejan lo efectivamente cobrado
    (recaudación neta = ingresos brutos − devoluciones), no lo presupuestado.
  </p>
  <p>
    El <strong>IRPF</strong> (Impuesto sobre la Renta de las Personas Físicas) es el
    principal impuesto directo y grava las rentas del trabajo, el capital y las
    actividades económicas. Datos disponibles desde <strong>1995</strong>.
  </p>
</ContextBox>
```

---

### 2. `InsightsPanel` — Destacados dinámicos generados desde los datos

Muestra entre 3 y 5 "insights" clave calculados a partir de los resultados de las queries, actualizándose al cambiar el año o la entidad seleccionados. **No usa IA** — son plantillas con interpolación de valores reales.

**Implementación:** Función `buildInsights(data, year): Insight[]` co-ubicada con cada página. Devuelve un array de objetos `{ label, value, trend, description }` que `InsightsPanel.tsx` renderiza.

```typescript
// src/utils/insights.ts — tipos compartidos
export interface Insight {
  label: string;          // "Recaudación IRPF"
  value: string;          // "109.163 M€"
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;    // "+8,3% vs 2022"
  description: string;    // "El IRPF supone el 42% de la recaudación total..."
}
```

```tsx
// src/components/ui/InsightsPanel.tsx
interface InsightsPanelProps {
  insights: Insight[];
  isLoading?: boolean;
}
// Renderiza una fila horizontal de tarjetas con icono de tendencia (▲/▼)
// En móvil colapsa a lista vertical
```

**Ejemplos de insights por página:**

| Página | Ejemplo de insight generado |
|--------|-----------------------------|
| Inicio | "El déficit de 2023 fue −50.200 M€, el menor desde 2007" |
| Ingresos | "Los impuestos directos representan el 48% de los ingresos totales en 2023" |
| Impuestos (AEAT) | "El IVA creció un +12,4% en 2022 debido a la recuperación del consumo post-COVID" |
| Gastos | "Sanidad y Protección Social absorben el 61% del gasto consolidado en 2023" |
| Comparativa | "El Ministerio de Defensa ejecutó el 94,2% de su presupuesto, la tasa más alta entre las secciones principales" |
| Transferencias | "Andalucía recibió 12.450 M€ en transferencias corrientes en 2023, un 18% del total nacional" |
| CCAA Detalle | "El gasto per cápita de Madrid (4.823 €/hab) es un 15% inferior a la media autonómica" |

---

### Layout de página estándar

Todas las páginas siguen este orden vertical:

```
┌─────────────────────────────────────────────────┐
│  PageHeader (título + filtros globales)          │
├─────────────────────────────────────────────────┤
│  ContextBox (texto estático: qué son estos datos)│
├─────────────────────────────────────────────────┤
│  InsightsPanel (3–5 destacados dinámicos)        │
├─────────────────────────────────────────────────┤
│  Visualización principal (gráfico / mapa)        │
├─────────────────────────────────────────────────┤
│  Tabla detalle (TanStack Table, si aplica)       │
├─────────────────────────────────────────────────┤
│  Nota de fuente y metodología (pie de página)    │
└─────────────────────────────────────────────────┘
```

---

## Mapa Coroplético (react-simple-maps)

**Biblioteca elegida: react-simple-maps + d3-scale** (en lugar de deck.gl)

| Criterio | react-simple-maps (SVG) | deck.gl (WebGL) |
|---|---|---|
| Bundle size | ~50 KB | ~1.5 MB |
| Renderer | SVG / DOM — coherente con el resto de la app | WebGL — segunda capa de GPU |
| Choropléticos | ✅ Totalmente soportados con d3-scale | ✅ |
| Tooltip / click React | ✅ Nativo con `onMouseEnter`/`onClick` | Requiere callbacks WebGL |
| Soporte móvil | ✅ SVG se escala sin configuración | Requiere polyfills |
| 3D / tiles satélite | ✗ No necesario en este proyecto | ✅ (pero no se necesita aquí) |

**GeoJSON:** `web/public/geo/ccaa.json` — 17 CCAA + Ceuta + Melilla. Fuente: IGN (Instituto Geográfico Nacional). Las Islas Canarias se reposicionan en un recuadro mediante una transformación de coordenadas en el GeoJSON (técnica habitual en mapas de España).

**Componente `ChoroplethMap.tsx` (genérico, reutilizable):**

```typescript
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleSequential } from 'd3-scale';
import { interpolateBlues } from 'd3-scale-chromatic';

interface ChoroplethMapProps {
  data: Record<string, number>;          // ccaa_cod → valor numérico
  domain: [number, number];              // [min, max] del rango de valores
  onSelect: (ccaaCod: string) => void;
  selectedCcaa: string | null;
  tooltipFormatter?: (val: number) => string;
}

// Uso interno:
// const colorScale = scaleSequential(interpolateBlues).domain(domain);
// fill={colorScale(data[geo.properties.ccaa_cod] ?? 0)}
```

**Variables del coroplético** (selector en cada página):
- **Transferencias:** Total €, Per cápita (€/hab), Solo corrientes, Solo capital, FCI, Fondos UE
- **CCAA:** Gasto total, Ingreso total, Déficit/superávit, % ejecución presupuestaria

---

## GitHub Pages: Solución COOP/COEP

DuckDB WASM requiere `SharedArrayBuffer` (worker multihilo), que el navegador solo permite con:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages **no permite** configurar estas cabeceras HTTP. La solución estándar es [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker): un pequeño service worker que intercepta las respuestas y añade las cabeceras en el cliente. Es transparente para el usuario y solo recarga la página una vez tras el registro inicial.

```html
<!-- web/index.html — antes de cualquier otro script -->
<script src="coi-serviceworker.js"></script>
```

---

## Pipeline CI/CD

```
push a main
    └──► deploy.yml
             ├── cd web && npm ci && npm run build
             └── peaceiris/actions-gh-pages → publica web/dist/ en rama gh-pages

cron: 0 6 1 * *  (1º de cada mes)
    └──► update-data.yml
             ├── uv run python -m scraper run
             ├── git commit web/public/db/cuentas-publicas.duckdb
             └── workflow_dispatch → deploy.yml
```
