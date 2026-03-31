# Plan de Implementación — Cuentas Públicas

## Resumen de Fases

| Fase | Objetivo | Estado |
|------|----------|--------|
| 1 | Pipeline de datos Python | ✅ Completo |
| 2 | Base del frontend | ✅ Completo |
| 3 | Visualizaciones nacionales | ✅ Completo |
| 4 | Despliegue y CI/CD | ✅ Completo |
| 5 | Visualizaciones CCAA | ⏳ Pendiente |
| 6 | Drill-down granular (gastos por función, impuestos por tipo) | ⏳ Pendiente |

### Dependencias entre fases

```
Fase 1 (Scraper) ───────────────────────────────► Fase 3 (requiere .duckdb real)
                  \                           └──► Fase 5 (requiere tablas CCAA)
                   ──► Fase 2.1–2.4 puede avanzar en paralelo con datos mock
Fase 2 ──► Fase 3 ──► Fase 4
                   └──► Fase 5 (requiere Fase 4 desplegada y Fase 1 con tablas CCAA)
```

---

## Fase 1: Pipeline de Datos Python ✅

**Objetivo:** Generar el fichero `cuentas-publicas.duckdb` con datos reales de todas las fuentes oficiales.

### Milestone 1.1 — Estructura del proyecto scraper ✅

- [x] Inicializar proyecto con `uv init scraper` (Python 3.12+)
- [x] Definir dependencias en `pyproject.toml`:
  - `requests` — descargas HTTP
  - `pandas` — manipulación de datos
  - `openpyxl` — lectura de ficheros Excel (.xlsx)
  - `duckdb` — escritura en base de datos
  - `rich` — logging estructurado en consola
  - `click` — CLI
  - `xlrd` — lectura de ficheros .xls antiguos (IGAE 2015)
- [x] Crear estructura de directorios: `src/scraper/scrapers/`, `src/scraper/transform/`
- [x] Implementar `db.py`:
  - `create_schema(conn)`: crea todas las tablas y vistas (idempotente con `IF NOT EXISTS`)
  - `upsert(conn, table, df, delete_where)`: helper con patrón DELETE+INSERT

---

### Milestone 1.2 — Scraper AEAT (recaudación tributaria 1995–2024) ✅

- [x] Implementar `scrapers/aeat.py`:
  - Ficheros IART individuales por año (2017–2024); serie histórica 1995–2016 en hoja "1.6" del último IART
- [x] Implementar `transform/aeat.py`:
  - Mapear etiquetas de impuestos a valores canónicos: `'IRPF'`, `'IVA'`, `'Sociedades'`, `'Especiales'`, `'Otros'`
  - `month = 0` como sentinel de total anual (NULL no permitido en PK DuckDB)
- [x] Escribir en tabla `recaudacion_aeat` con upsert (206 filas, 1995–2024)

---

### Milestone 1.3 — Scraper SEPG (plan presupuestario 2005–2025) ✅

- [x] Implementar `scrapers/sepg.py`:
  - Browser User-Agent requerido (servidor bloquea el UA de Python)
  - Formato wide: capítulos en filas, años en columnas; hoja "21" gastos, "23" ingresos
  - Regex `_YEAR_ANNOTATED_RE` para capturar cabeceras con anotación tipo `"2013 (*)"` (ficheros 2014+)
  - `_insert_prorroga_2020()`: copia datos de 2018 → 2020 sintéticamente (sin PGE aprobado ese año)
- [x] Implementar `transform/sepg.py`: `normalize_gastos()` y `normalize_ingresos()`
- [x] Escribir en tablas `ingresos_plan` y `gastos_plan` (171 + 160 filas, 2005–2025)
- [x] Cobertura: 2005–2025 incluidos 2013 (vía columna anotada en ficheros posteriores) y 2020 (prorroga 2018)

---

### Milestone 1.4 — Scraper IGAE (ejecución presupuestaria 2015–2024) ✅

- [x] Implementar `scrapers/igae.py`:
  - Ficheros "extracto diciembre" individuales por año (datos anuales acumulados)
  - 2009–2014 solo disponibles en PDF — cobertura real: 2015–2024
  - Fichero 2015 en formato `.xls` (requiere `xlrd`)
- [x] Implementar `transform/igae.py`: `entidad = 'Estado'`
- [x] Escribir en tablas `ingresos_ejecucion` y `gastos_ejecucion` (90 + 80 filas, 2015–2024)

> **Nota:** `gastos_ejecucion` almacena valores en **K€** (miles de euros). Las queries del frontend dividen por 1000 para convertir a M€.

---

### Milestone 1.5 — Scraper Seguridad Social ✅

- [x] Fuente: portal SEPG, fichero `03 Presupuesto de la Seguridad Social.xlsx`; hojas "31" gastos, "32" ingresos
- [x] Implementar `scrapers/seguridad_social.py`
- [x] Integrar con `ingresos_plan` y `gastos_plan` usando `entidad = 'SS'` (160 + 160 filas, 2005–2025)

---

### Milestone 1.6 — CLI, vistas y finalización del scraper ✅

- [x] CLI `click` en `main.py`: `run`, `run --source`, `run --year`, `status`
- [x] Vistas pre-calculadas en `db.py`: `v_gastos_plan_seccion`, `v_gastos_plan_capitulo`, `v_ingresos_plan_capitulo`, `v_transferencias_ccaa_total`, `v_ccaa_resumen`
- [x] Logging estructurado con `rich`

---

### Milestone 1.7 — Transferencias Estado → CCAA ✅

- [x] Implementar `scrapers/transferencias_ccaa.py`:
  - Fuente real: `ccaa_ingresos` (caps. 4 corriente + 7 capital) del portal SGCIEF Liquidaciones
  - Requiere que el scraper `ccaa` se ejecute primero
- [x] Escribir en tabla `transferencias_ccaa` (1.580 filas, 2002–2023)
- [ ] **Pendiente:** Tabla `poblacion_ccaa` con datos INE Padrón Municipal (necesaria para vistas per cápita)

---

### Milestone 1.8 — Scraper presupuestos CCAA (Ministerio de Hacienda) ✅

- [x] Fuente: portal SGCIEF `DescargaEconomicaDC.aspx?cdcdad={cod}&ano={year}`
  - Un fichero Excel por CCAA×año; 19 CCAA, 2002–2023
- [x] Implementar `scrapers/ccaa.py`: `fuente='plan'` ← Presupuesto Inicial; `fuente='ejecucion'` ← Obligaciones/Derechos Reconocidos Netos
- [x] Escribir en `ccaa_ingresos` y `ccaa_gastos` (7.110 + 7.092 filas, 2002–2023)

---

## Fase 2: Base del Frontend ✅

**Objetivo:** Aplicación React funcional con DuckDB WASM integrado, navegación y estado global operativos.

### Milestone 2.1 — Inicialización del proyecto ✅

- [x] Vite 5 + React 18 + TypeScript; gestor de paquetes: `pnpm`
- [x] Dependencias instaladas: `tailwindcss @tailwindcss/vite`, `echarts echarts-for-react`, `@duckdb/duckdb-wasm`, `zustand`, `react-router-dom`, `react-simple-maps`, `d3-scale d3-color d3-scale-chromatic`
- [x] `vite.config.ts`: `base: '/cuentas-publicas/'`, `optimizeDeps.exclude: ['@duckdb/duckdb-wasm']`, cabeceras COOP/COEP en dev server
- [x] `coi-serviceworker.js` en `web/public/`
- [x] `.duckdb` en `web/public/db/`

---

### Milestone 2.2 — Integración DuckDB WASM ✅

- [x] `src/db/client.ts`: singleton `getDB()` + helper `query<T>(sql)`
  - Base de datos adjunta como alias `cp` (→ `cp.<tabla>` en todas las queries)
- [x] Bug conocido: `DECIMAL(18,2)` serializado por DuckDB WASM `toJSON()` como entero ×100. **Fix:** `CAST(... AS DOUBLE)` en todas las queries.

---

### Milestone 2.3 — Estado global y routing ✅

- [x] Zustand store en `src/store/filters.ts`: `years`, `selectedYear`, `viewMode`, `entityType`
- [x] React Router v6: `/`, `/ingresos`, `/ingresos/impuestos`, `/gastos`, `/comparativa`
- [x] `AppShell.tsx`: sidebar con navegación, `YearSelector` y selector de entidad integrados
- [x] `YearSelector.tsx` y `ViewModeToggle.tsx`

---

### Milestone 2.4 — Componentes UI base ✅

- [x] `KpiCard.tsx`: estilo Economist — borde superior de acento, etiqueta uppercase, valor grande, tendencia ▲/▼
- [x] `LoadingSkeleton.tsx` con prop `height`
- [x] `ErrorBoundary.tsx`
- [x] `src/utils/format.ts`:
  - `formatEur(n)`: siempre **M€** con separador de miles (`useGrouping: true`); nunca B€
  - `formatPct(n)`: devuelve `string | null`; null si `|ratio| < 0,1%` (evita "+0,0%" espurio)
- [x] `InfoTooltip.tsx`: botón `i` circular con popover explicativo; toggle hover+clic; cierre al clic exterior

---

### Milestone 2.5 — Componentes educativos 🔄

- [x] `ContextBox.tsx`: caja de contexto con título y contenido JSX; borde izquierdo de acento
- [ ] `InsightsPanel.tsx`: panel de highlights dinámicos computados desde datos de la query
  - Interfaz `Insight { label, value, trend?, trendValue?, description }`
  - Las páginas actuales usan `KpiCard` para los highlights principales; InsightsPanel está pendiente de implementar

---

## Fase 3: Visualizaciones de Datos 🔄

**Objetivo:** Las páginas principales completamente funcionales con gráficas interactivas.

### Milestone 3.1 — Página Inicio (Dashboard) ✅

- [x] `src/db/queries/ingresos.ts`: `getResumenAnual(entidad)` para totales anuales ingresos + gastos
- [x] KPI cards: ingresos no financieros, gastos no financieros, saldo presupuestario (plan)
- [x] `LineChart.tsx` multi-serie: ingresos vs gastos, serie histórica 2005–2025
- [x] `ContextBox`: qué son los PGE, qué incluyen, diferencia plan/ejecución

---

### Milestone 3.2 — Página Ingresos ✅

- [x] `src/db/queries/ingresos.ts`: `getIngresosPorCapitulo`, `getTotalIngresosPorAnio`, `CAPITULO_INGRESOS`, `CAPITULO_INGRESOS_TOOLTIP`
- [x] `BarChart.tsx` horizontal por capítulo (año actual)
- [x] `LineChart.tsx` de evolución histórica total
- [x] Tabla con capítulo / descripción / importe / % del total
- [x] `InfoTooltip` en cada fila de la tabla explicando el capítulo
- [x] Enlace a `/ingresos/impuestos`

---

### Milestone 3.3 — Sub-página Impuestos (AEAT) ✅

- [x] `src/db/queries/aeat.ts`: `getRecaudacionHistorica`, `getRecaudacionAnio`, `getAniosAeat`, `IMPUESTO_COLORS`
- [x] `LineChart.tsx` multi-serie: IRPF, IVA, Sociedades, Especiales, Otros — 1995–2024
- [x] `BarChart.tsx` horizontal para el año seleccionado (fallback al último año AEAT si el seleccionado > 2024)
- [x] Tabla con impuesto / bruto / devoluciones / neto / % del total

---

### Milestone 3.4 — Página Gastos ✅ (simplificado)

- [x] `src/db/queries/gastos.ts`: `getGastosPorCapitulo`, `getGastosHistoricoPorCapitulo`, `CAPITULO_GASTOS`, `CAPITULO_GASTOS_TOOLTIP`
- [x] `BarChart.tsx` horizontal por capítulo operacional (1–7, excluye 8 y 9)
- [x] `LineChart.tsx` multi-serie por capítulo, evolución histórica
- [x] Tabla con capítulo / descripción / importe / % del gasto operacional
- [x] `InfoTooltip` en cada fila de la tabla
- [ ] **Pendiente:** `TreemapChart.tsx` con drill-down por sección (Ministerio) → programa → capítulo

> El treemap con drill-down orgánico (sección/programa) requiere que `gastos_plan` esté poblado con `seccion_cod` y `programa_cod`. Actualmente los datos SEPG solo tienen clasificación económica (capítulos). Se implementará cuando se disponga de datos orgánicos.

---

### Milestone 3.5 — Sub-página Programa ⏳

- [ ] Ruta `/gastos/:seccion` con tabla de programas y gráfico de barras
- Bloqueado por: datos de sección/programa no disponibles en la fuente actual

---

### Milestone 3.6 — Página Comparativa (Plan vs Ejecución) ✅

- [x] `getComparativaPorCapitulo(year, entidad)`: LEFT JOIN gastos_plan ↔ gastos_ejecucion
- [x] `BarChart.tsx` agrupado (Plan azul / Ejecución naranja) — solo visible para años 2015–2024
- [x] Tabla: capítulo / descripción / plan / ejecución / desviación € / % ejecución
- [x] `InfoTooltip` en cada fila
- [x] Aviso ámbar para años fuera del rango de ejecución disponible
- [x] KPI cards: gastos plan, gastos ejecutados, desviación, crédito no ejecutado

---

## Fase 4: Despliegue y Automatización ✅

**Objetivo:** Sitio publicado en GitHub Pages con pipeline CI/CD automatizado.

### Milestone 4.1 — Primera publicación en GitHub Pages ✅

- [x] `base: '/cuentas-publicas/'` en `vite.config.ts`
- [x] Crear `.github/workflows/deploy.yml`:
  - Node 22 (vía `.nvmrc`), pnpm latest, `pnpm install --frozen-lockfile && pnpm build`
  - Usa `actions/upload-pages-artifact` + `actions/deploy-pages` (API oficial de GitHub Pages)
  - Permisos: `pages: write`, `id-token: write`
- [x] GitHub Pages activado en la configuración del repo (fuente: GitHub Actions)

---

### Milestone 4.2 — Pipeline de actualización mensual ✅

- [x] Crear `.github/workflows/update-data.yml`:
  - Cron `0 6 1 * *` + `workflow_dispatch`
  - `astral-sh/setup-uv@v5` con Python 3.12
  - Commit automático del `.duckdb` actualizado con fecha `YYYY-MM`
  - Dispara `deploy.yml` vía `actions/github-script`

---

### Milestone 4.3 — Pulido final ✅

- [x] Meta tags SEO en `web/index.html`: `<meta description>`, Open Graph, Twitter Card, `<link rel="canonical">`
- [x] `.gitignore`: regla `!web/public/db/cuentas-publicas.duckdb` para incluir el fichero del frontend pese a la exclusión global de `*.duckdb`
- [ ] **Pendiente:** Diseño responsive (sidebar hamburguesa en móvil)
- [ ] **Pendiente:** Pantalla de carga inicial mientras DuckDB WASM se inicializa

---

## Fase 5: Visualizaciones CCAA ⏳

**Objetivo:** Mapa coroplético interactivo de transferencias y presupuestos autonómicos. Requiere Fase 1 completa y Fase 4 desplegada.

### Milestone 5.1 — GeoJSON y componente ChoroplethMap

- [ ] Obtener y preparar GeoJSON de CCAA (`web/public/geo/ccaa.json`, < 200 KB, Canarias en recuadro)
- [ ] Implementar `src/components/charts/ChoroplethMap.tsx`:
  - `react-simple-maps` + `d3-scale scaleSequential` + `d3-scale-chromatic`
  - Props: `data: Record<ccaa_cod, number>`, `domain`, `colorScheme`, `onSelect`, `selectedCcaa`, `tooltipFormatter`
  - Tooltip en hover; borde destacado en CCAA seleccionada; leyenda de gradiente

---

### Milestone 5.2 — Página Transferencias

- [ ] `src/db/queries/ccaa.ts`: `getTransferenciasPorCcaa(year, fuente)`, `getTransferenciasSerie(ccaa_cod, fuente)`
- [ ] `src/pages/Transferencias/index.tsx`:
  - Layout: mapa (izq.) + tabla TanStack (dcha.), sincronizados por selección de CCAA
  - Selector de variable: Total €, Per cápita, Corrientes, Capital, FCI, UE
  - `ViewModeToggle` Plan / Ejecución
  - Panel con `LineChart` histórico al seleccionar CCAA

---

### Milestone 5.3 — Página CCAA Overview

- [ ] `getCcaaResumen(year)`: ingresos, gastos, déficit, % ejecución por CCAA
- [ ] `src/pages/CCAA/index.tsx`: mapa + tabla TanStack; clic navega a `/ccaa/:id`

---

### Milestone 5.4 — Página CCAA Detalle

- [ ] `src/pages/CCAA/Detalle.tsx` (ruta `/ccaa/:id`):
  - KPI cards + tres tabs: Ingresos / Gastos / Comparativa
  - Mismo patrón visual que las páginas nacionales equivalentes

---

---

## Fase 6: Drill-down Granular ⏳

**Objetivo:** Añadir datos de mayor granularidad para explorar el detalle funcional del gasto y el detalle por tipo de los impuestos. Requiere Fase 4 desplegada. Los datos de esta fase se añaden al `.duckdb` existente como tablas nuevas.

---

### Milestone 6.1 — Gastos por función (clasificación funcional COFOG)

La clasificación económica por capítulos (fase 1) solo dice *qué tipo* de gasto es (personal, transferencias, inversión…). La clasificación **funcional** dice *para qué* se gasta: sanidad, educación, defensa, pensiones, etc.

**Fuentes:**
- **IGAE — Contabilidad Nacional**: publica el gasto de las AAPP según la clasificación COFOG (Classification of Functions of Government) en series anuales. Disponible en el portal de la IGAE y en Eurostat (`gov_10a_exp`).
- **SEPG — Clasificación por programas**: cada programa presupuestario tiene un código de política de gasto (`XX`) que mapea aproximadamente a funciones. Los ficheros de SEPG incluyen `programa_cod` y `programa_nom`; actualmente el scraper no los parsea (solo capítulos).
- **Seguridad Social**: el gasto en pensiones contributivas se puede extraer directamente de los ficheros SS ya descargados, a nivel de artículo (art. 10–19 = pensiones, art. 26 = desempleo…).

**Tablas nuevas:**
```sql
-- Gasto por función COFOG (IGAE, nivel 1 y 2)
CREATE TABLE gastos_funcion (
    year        INTEGER NOT NULL,
    entidad     VARCHAR NOT NULL,   -- 'AAPP','Estado','CCAA','CCLL','SS'
    cofog_cod   VARCHAR NOT NULL,   -- '01' Servicios generales, '02' Defensa, '03' Orden público,
                                    -- '04' Economía, '05' Medio ambiente, '06' Vivienda,
                                    -- '07' Sanidad, '08' Ocio/cultura, '09' Educación, '10' Protección social
    cofog_nom   VARCHAR NOT NULL,
    fuente      VARCHAR NOT NULL,   -- 'plan' | 'ejecucion'
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, entidad, cofog_cod, fuente)
);

-- Gasto por programa presupuestario (SEPG, clasificación orgánica + funcional)
CREATE TABLE gastos_programa (
    year          INTEGER NOT NULL,
    entidad       VARCHAR NOT NULL,
    seccion_cod   VARCHAR NOT NULL,
    seccion_nom   VARCHAR NOT NULL,
    politica_cod  VARCHAR NOT NULL,   -- 2 dígitos: '23' Servicios sociales, '31' Sanidad, etc.
    politica_nom  VARCHAR NOT NULL,
    programa_cod  VARCHAR NOT NULL,   -- 4+1 dígitos: '231A' Pensiones contributivas
    programa_nom  VARCHAR NOT NULL,
    capitulo      INTEGER NOT NULL,
    importe       DECIMAL(18,2),
    PRIMARY KEY (year, entidad, seccion_cod, programa_cod, capitulo)
);
```

**Scrapers a implementar:**
- `scrapers/igae_cofog.py`: descarga la tabla de gasto COFOG de la IGAE (portal Contabilidad Nacional o Eurostat API). Serie 2000–2024.
- `scrapers/sepg_programas.py`: ampliar el parseo de los ficheros SEPG para capturar también la columna `programa_cod` y `programa_nom` (actualmente ignoradas al leer solo capítulos). Esto desbloquea el drill-down Ministerio → Programa → Capítulo.

**Frontend — Página Gastos (drill-down):**
- `TreemapChart.tsx`: treemap ECharts con drill-down. Nivel 1: función COFOG o Ministerio. Nivel 2: programas. Nivel 3: capítulos económicos.
- Ruta `/gastos/:seccion`: detalle de un Ministerio con sus programas y el desglose económico de cada uno.
- Selector en la página Gastos: "Ver por función" (COFOG) / "Ver por Ministerio" (orgánico).

**Ejemplos de insights posibles:**
- Pensiones: `programa_cod LIKE '10%'` o COFOG `10.2` → cuánto del total va a pensiones contributivas
- Sanidad: COFOG `07` → transferencias del Estado al SNS
- Defensa: sección "14 Ministerio de Defensa" o COFOG `02`
- Educación: COFOG `09` → mayoritariamente transferencias a CCAA

---

### Milestone 6.2 — IVA por tipo impositivo

El IVA en España se aplica a tres tipos: **general (21%)**, **reducido (10%)** y **super-reducido (4%)**. La AEAT publica el desglose en el Anuario Estadístico (tabla de recaudación IVA por régimen y tipo).

**Fuente:** AEAT Anuario Estadístico — tabla "IVA: operaciones interiores por tipo impositivo". Disponible como Excel por año desde ~2010.

**Tabla nueva:**
```sql
CREATE TABLE recaudacion_iva_tipo (
    year        INTEGER NOT NULL,
    tipo        VARCHAR NOT NULL,   -- 'general' (21%), 'reducido' (10%), 'superreducido' (4%)
    base_imponible  DECIMAL(18,2),
    cuota_devengada DECIMAL(18,2),
    PRIMARY KEY (year, tipo)
);
```

**Scraper:** Ampliar `scrapers/aeat.py` o crear `scrapers/aeat_iva.py` para descargar la tabla de IVA por tipo.

**Frontend — Sub-página IVA:**
- Ruta `/ingresos/impuestos/iva` accesible desde la página de Impuestos.
- Gráfico de barras apiladas: cuota devengada por tipo a lo largo del tiempo.
- Insight: "Los bienes de primera necesidad (tipo 4%) representan el X% de la base imponible pero solo el Y% de la cuota, ilustrando el efecto redistributivo del sistema de tipos".

---

### Milestone 6.3 — IRPF por tramo de renta

La AEAT publica estadísticas de IRPF por tramo de base liquidable, que permiten ver la distribución de la carga fiscal entre rentas bajas, medias y altas.

**Fuente:** AEAT — "Estadísticas de los declarantes del IRPF" (publicación anual con datos del ejercicio anterior). Descarga Excel con tabla por tramos de renta.

**Tabla nueva:**
```sql
CREATE TABLE irpf_tramos (
    year              INTEGER NOT NULL,
    tramo_desde       DECIMAL(12,2),   -- límite inferior del tramo (€)
    tramo_hasta       DECIMAL(12,2),   -- límite superior (NULL = sin límite)
    num_declarantes   INTEGER,
    base_liquidable   DECIMAL(18,2),
    cuota_integra     DECIMAL(18,2),
    cuota_resultante  DECIMAL(18,2),   -- tras deducciones
    PRIMARY KEY (year, tramo_desde)
);
```

**Frontend — Sub-página IRPF:**
- Ruta `/ingresos/impuestos/irpf`.
- Gráfico de barras: número de declarantes y cuota media por tramo (año seleccionado).
- Gráfico de área: % de la recaudación total aportado por cada tramo.
- Insight: "El X% de los declarantes con rentas superiores a 60.000 € aportan el Y% de la recaudación total del IRPF".

---

### Milestone 6.4 — Pensiones (detalle Seguridad Social)

Los datos de SS ya están cargados a nivel de capítulo. La TGSS publica el detalle por tipo de pensión (jubilación, incapacidad, viudedad, orfandad) con número de pensionistas e importe medio.

**Fuente:** TGSS — "Estadística de pensiones contributivas" (portal datos.gob.es o descarga directa TGSS). Serie mensual y anual.

**Tabla nueva:**
```sql
CREATE TABLE pensiones_ss (
    year            INTEGER NOT NULL,
    month           INTEGER,          -- NULL = total anual
    tipo            VARCHAR NOT NULL, -- 'jubilacion','incapacidad','viudedad','orfandad','favor_familiar'
    regimen         VARCHAR,          -- 'general','autonomos','agrario', etc. (opcional)
    num_pensiones   INTEGER,
    importe_total   DECIMAL(18,2),    -- M€
    pension_media   DECIMAL(10,2),    -- €/mes
    PRIMARY KEY (year, COALESCE(month,0), tipo, COALESCE(regimen,''))
);
```

**Frontend — Sub-página Pensiones:**
- Ruta `/gastos/pensiones` (o desde la página de Gastos como enlace en el insight de cap. 4).
- KPI: pensión media, número de pensionistas, gasto total.
- Gráfico de línea: evolución de la pensión media y el número de pensionistas (1990–hoy).
- Gráfico de barras apiladas: distribución del gasto por tipo de pensión.

---

### Dependencias de la Fase 6

```
Fase 1 (datos base) ──► Fase 6.1 (amplía scrapers SEPG/IGAE)
                    ──► Fase 6.2–6.3 (amplía scraper AEAT)
                    ──► Fase 6.4 (nuevo scraper TGSS)
Fase 3 (páginas base) ──► Fase 6 (añade drill-down sobre páginas existentes)
Fase 4 (despliegue) ──► necesario antes de publicar Fase 6
```

---

## Notas de Implementación

| Tema | Decisión |
|------|----------|
| Unidades monetarias | Siempre **M€** (`formatEur`). Nunca B€ (ambiguo: billón = 10¹² en español) |
| DuckDB WASM decimal | `CAST(... AS DOUBLE)` en todas las queries para evitar ×100 en `toJSON()` |
| `gastos_ejecucion` | Valores en **K€**; dividir por 1000 en la query |
| 2020 sin PGE | Prorroga de 2018 insertada sintéticamente por `_insert_prorroga_2020()` en `sepg.py` |
| 2013 en SEPG | Datos en columna anotada `"2013 (*)"` de ficheros 2014+; capturado con `_YEAR_ANNOTATED_RE` |
| Años prorrogados | `ingresos_plan` es idéntico para 2023, 2024-P y 2025-P (presupuesto extendido) |
| AEAT vs Estado | AEAT recauda para todas las AAPP; Estado retiene ~50% tras distribución territorial a CCAA |
