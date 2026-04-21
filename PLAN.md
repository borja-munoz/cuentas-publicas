# Plan de Implementación — Cuentas Públicas

## Resumen de Fases

| Fase | Objetivo | Estado |
|------|----------|--------|
| 1 | Pipeline de datos Python | ✅ Completo |
| 2 | Base del frontend | ✅ Completo |
| 3 | Visualizaciones nacionales | ✅ Completo |
| 4 | Despliegue y CI/CD | ✅ Completo |
| 5 | Visualizaciones CCAA | ✅ Completo |
| 6 | Drill-down granular (gastos por función, impuestos por tipo) | ✅ Completo (6.3 IRPF tramos diferido) |
| 7 | Rediseño visual (paleta editorial + cabecera sticky) | ✅ Completo |
| 8 | Reorganización por ámbito (Estado / CCAA / SS; rutas + Comparativa integrada) | ✅ Completo (M8.3 AAPP diferido a F9) |
| 9 | Datos consolidados AAPP (IGAE SEC2010 + PIB) | ✅ Completo |
| 10 | Sección Deuda (stock, intereses, emisiones, tenedores) | ⏳ Pendiente |

> **Protocolo por fase** — cada fase abre con un milestone de **diseño en ARCHITECTURE.md** y cierra con un milestone de **verificación + cierre** (repasar entregables, actualizar ARCHITECTURE.md si hubo desviaciones, marcar la fase ✅). Ver `CLAUDE.md` → *Workflow por fase*.

### Dependencias entre fases

```
Fase 1 (Scraper) ───────────────────────────────► Fase 3 (requiere .duckdb real)
                  \                           └──► Fase 5 (requiere tablas CCAA)
                   ──► Fase 2.1–2.4 puede avanzar en paralelo con datos mock
Fase 2 ──► Fase 3 ──► Fase 4
                   └──► Fase 5 (requiere Fase 4 desplegada y Fase 1 con tablas CCAA)

Fase 7 (paleta + sticky) ──┐
                           ├──► Fase 8 (reorganización rutas)
Fase 9 (datos AAPP) ───────┤     (F8 necesita F9 para no dejar /aapp/* vacío)
Fase 10 (datos deuda) ─────┘
F9 y F10 pueden avanzar en paralelo con F7.
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
- [x] Dependencias instaladas: `tailwindcss @tailwindcss/vite`, `echarts echarts-for-react`, `@duckdb/duckdb-wasm`, `zustand`, `react-router-dom`, `d3-geo @types/d3-geo`, `d3-scale d3-color d3-scale-chromatic`
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
- [x] Diseño responsive: sidebar ya implementada con hamburger + backdrop + slide-in en móvil
- [x] Pantalla de carga inicial: `LoadingScreen` con tres puntos animados mientras DuckDB WASM inicializa y carga el `.duckdb`; se oculta cuando `DBInitializer` completa la primera query

---

## Fase 5: Visualizaciones CCAA ✅

**Objetivo:** Mapa coroplético interactivo de transferencias y presupuestos autonómicos. Requiere Fase 1 completa y Fase 4 desplegada.

### Milestone 5.1 — GeoJSON y componente ChoroplethMap ✅

- [x] Obtener y preparar GeoJSON de CCAA (`web/public/geo/ccaa.json`):
  - 19 features (17 CCAA + Ceuta + Melilla)
  - Anillos corregidos: d3-geo v3 requiere convención CW (clockwise) para el anillo exterior; los polígonos con área ≥ 2π sr (interpretados como complemento esférico) se invierten automáticamente en el pipeline de preparación
  - Sub-polígonos degenerados (< 6 puntos) eliminados para evitar área ≈ 4π
- [x] Implementar `src/components/charts/ChoroplethMap.tsx`:
  - **SVG puro con d3-geo** (sin react-simple-maps): `geoMercator().fitExtent(...)` desde la `FeatureCollection` cargada → proyección precisa y sin dependencias de terceros sobre el ciclo de vida de React
  - Canarias desplazada +4° longitud / +7° latitud en tiempo de carga (convencion IGN/INE) para situarla en el recuadro inferior izquierdo junto a la Península
  - Props: `data: Record<ccaa_cod, number>`, `colorScale`, `onSelect`, `selectedCcaa`, `formatValue`, `height`
  - Tooltip via `createPortal` (evita recorte por `overflow:hidden`); borde destacado en CCAA seleccionada
  - `ColorLegend` exportado como componente separado (gradiente horizontal con etiquetas min/max)

---

### Milestone 5.2 — Página Transferencias ✅

- [x] `src/db/queries/ccaa.ts`: `getTransferenciasPorCcaa(year, fuente)`, `getTransferenciasSerie(ccaa_cod, fuente)`, `getCcaaYears()`
  - Todos los valores en K€ en origen → divididos entre 1000 en query para obtener M€
  - `CAST(... AS DOUBLE)` aplicado para evitar bug DECIMAL×100 de DuckDB WASM
- [x] `src/pages/Transferencias/index.tsx`:
  - Año seleccionado gestionado **localmente** (no del store global) cargado desde `getCcaaYears()` → max disponible (2023); evita el desfase con el año global que puede ser 2025
  - Layout: grid 5 columnas — mapa (3/5) + tabla de ranking (2/5)
  - Toggle Plan / Ejecución integrado en la cabecera
  - Panel `LineChart` (total / corrientes / capital) al seleccionar una CCAA
  - Tabla de desglose corriente/capital al final de la página

---

### Milestone 5.3 — Página CCAA Overview ✅

- [x] `getCcaaResumen(year)`, `getCcaaGastosPorCapitulo(ccaa_cod, year)`, `getCcaaIngresosPorCapitulo(ccaa_cod, year)` en `ccaa.ts`
- [x] `src/pages/CCAA/index.tsx`:
  - Año local independiente del store global (mismo patrón que Transferencias)
  - Selector de variable del mapa: gastos ejecutados / gastos planificados / déficit
  - Panel de drill-down al seleccionar CCAA: `BarChart` agrupado (plan vs ejecución por capítulo), tanto gastos como ingresos
  - Tabla comparativa completa: ingresos plan/ejec, gastos plan/ejec, déficit

---

### Milestone 5.4 — Página CCAA Detalle ✅

- [x] `src/pages/CCAA/Detalle.tsx` (ruta `/ccaa/:cod`):
  - Año local independiente del store global; cargado desde `getCcaaYears()`
  - KPI cards: ingresos ejecutados, gastos ejecutados, saldo presupuestario (▲/▼), % ejecución del gasto
  - 3 tabs:
    - **Gastos**: BarChart horizontal agrupado (Plan/Ejecución) por capítulo + tabla con % ejecución; rojo si < 85%
    - **Ingresos**: mismo patrón; columna % s/total de ingresos ejecutados
    - **Plan vs. Ejecución**: BarChart vertical agrupado + tabla de desviación (M€ y %) con colores rojo/verde
  - Enlace "← Volver a CCAA" y nombres de CCAA enlazados desde el overview

---

---

## Fase 6: Drill-down Granular ✅

**Objetivo:** Añadir datos de mayor granularidad para explorar el detalle funcional del gasto y el detalle por tipo de los impuestos. Requiere Fase 4 desplegada. Los datos de esta fase se añaden al `.duckdb` existente como tablas nuevas.

---

### Milestone 6.1 — Gastos por función (clasificación funcional COFOG) ✅

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

**Implementado:** `scrapers/igae_cofog.py` (Eurostat API `gov_10a_exp`, 5 sectores S13/S1311–S1314), tabla `gastos_funcion`, queries `cofog.ts`, página `/gastos/funcion` con selector de sector y año, BarChart horizontal y LineChart histórico multi-COFOG.

---

### Milestone 6.2 — IVA por tipo impositivo ✅

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

**Implementado:** `scrapers/iva_tipos.py` (AEAT `modelo390.csv`, filtro `TIPOPER=0`), tabla `recaudacion_iva_tipo`, queries `iva_tipos.ts`, página `/ingresos/impuestos/iva` con BarChart base/cuota por tipo y LineChart histórico.

---

### Milestone 6.3 — IRPF por tramo de renta ⏸ Diferido

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

**Estado:** Diferido — no existe URL de descarga masiva del fichero de tramos IRPF en AEAT. Los datos se publican en una aplicación web interactiva (Anuario Estadístico AEAT) sin endpoint CSV/Excel exportable directamente. Se retomará si se identifica una fuente automatizable.

---

### Milestone 6.4 — Pensiones (detalle Seguridad Social) ✅

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

**Implementado:** `scrapers/pensiones.py` (mites.gob.es BEL PEN-3, SSL bypass), tabla `pensiones_ss`, queries `pensiones.ts`, página `/gastos/pensiones` con BarChart por tipo, tabla detalle, LineChart gasto total y LineChart pensión media.

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

## Fase 7: Rediseño visual ✅

**Objetivo:** Dar al sitio un aspecto más editorial (tipo NYT Upshot / Economist) y mover los controles de filtro a una cabecera sticky, de modo que la sidebar quede solo para navegación.

### Milestone 7.0 — Diseño en ARCHITECTURE.md ✅

- [x] Documentar en `ARCHITECTURE.md`:
  - Tokens de la nueva paleta (valores hex, uso semántico de cada rol: `accent`, `accentAlt`, `neutrals`, `bg`, `positive`/`negative`, `categoricalPalette`).
  - Contrato del componente `TopBar` + mecanismo `pageFilters` del store (qué controles muestra cada página).
  - Nuevo árbol de componentes del layout (`AppShell` sin selectores, `TopBar` sticky, sidebar solo navegación).

### Milestone 7.1 — Tokens de paleta editorial ✅

- [x] Crear `web/src/utils/colors.ts` con la paleta tokenizada.
- [x] Actualizar `--color-accent`, `--color-accent-dark` y añadir `--color-bg-paper`, `--color-accent-alt`, `--color-positive` en `web/src/index.css`.
- [x] Reemplazar todos los `#326891`, `#e07b39` y clases `blue-*` en charts, queries y páginas.
- [x] Verificación: `grep -r "326891\|e07b39\|blue-600\|blue-700" web/src/` → 0 coincidencias.

### Milestone 7.2 — Cabecera sticky ✅

- [x] Crear `web/src/components/layout/TopBar.tsx` con EntityToggle + YearSelector + ViewModeToggle condicional.
- [x] Refactor `AppShell.tsx`: sidebar solo con navegación; TopBar integrada sobre el `<main>`.
- [x] Añadir `pageFilters: { showViewMode }` + `setPageFilters` en `web/src/store/filters.ts`.
- [x] Páginas Ingresos, Gastos y Comparativa registran/limpian `showViewMode` vía `useEffect`.

### Milestone 7.3 — Cierre de fase ✅

- [x] Milestones 7.0–7.2 completados.
- [x] `grep` de residuos azules → 0 coincidencias.
- [x] `pnpm build` sin errores TypeScript.
- [x] ARCHITECTURE.md actualizado con diseño final (sin desviaciones relevantes).
- [x] Fase 7 marcada ✅ en resumen y cabecera.

---

## Fase 8: Reorganización por ámbito ✅

**Objetivo:** Pasar de la navegación actual "Ingresos/Gastos/Comparativa/..." a una estructura **por ámbito**: Estado / CCAA / SS. Plan vs Ejecución se integra como un 3er modo (`'comparativa'`) dentro de Ingresos y Gastos — la página `/comparativa` desaparece. AAPP consolidado diferido a F9.

**Desviaciones del diseño:** se optó por pasar `entity` como prop a las páginas en lugar de `scopeType` en el store; más simple y sin estado global innecesario. `ViewModeToggle` añade `showComparativa: boolean` a `pageFilters` para controlar si el 3er modo es visible.

### Milestone 8.0 — Actualizar ARCHITECTURE.md ✅

- [x] Diagrama de rutas en visión general actualizado.
- [x] Árbol de directorios: nuevas páginas Estado/, SS/, actualizar AppShell/TopBar.
- [x] Sección "Layout — TopBar sticky y arquitectura de ámbito": documenta scope-by-route, `entity` prop, sidebar agrupada, redirects.
- [x] `pageFilters` ampliado con `showComparativa`.

### Milestone 8.1 — Store y routing ✅

- [x] Eliminar `entityType` / `EntityType` / `setEntityType` del store.
- [x] `pageFilters` añade `showComparativa: boolean`.
- [x] `viewMode: 'plan' | 'ejecucion' | 'comparativa'` (sin cambio, ya existía).
- [x] Nuevo árbol de rutas en `App.tsx`: `/estado/*`, `/ss/*`, `/ccaa/*`.
- [x] Redirects: `/ingresos/*` → `/estado/ingresos/*`, `/gastos/*` → `/estado/gastos/*` o `/ss/gastos/*`, `/comparativa` → `/estado/gastos`, `/transferencias` → `/ccaa/transferencias`.
- [x] Sidebar agrupada por ámbito (Estado / Seguridad Social / CCAA) en `AppShell.tsx`.
- [x] `TopBar.tsx` sin entity toggle; solo `YearSelector` + `ViewModeToggle` condicional.
- [x] `ViewModeToggle.tsx` muestra 3 opciones si `pageFilters.showComparativa`, 2 si no.
- [x] `Gastos/index.tsx` y `Ingresos/index.tsx` refactorizados para aceptar `entity` prop.
- [x] `Inicio/index.tsx` hardcodea 'Estado' (AAPP dashboard diferido a F9).

### Milestone 8.2 — Integrar Comparativa dentro de Ingresos y Gastos ✅

- [x] Eliminar `pages/Comparativa/index.tsx` (reemplazada por `<Navigate>`).
- [x] `Gastos/index.tsx`: modo `viewMode='comparativa'` muestra grouped BarChart + tabla desviación + InsightsPanel + KPIs comparativos.
- [x] `Ingresos/index.tsx`: idem para ingresos; aviso si año sin ejecución.
- [x] `getIngresosComparativaPorCapitulo(year, entidad)` creada en `ingresos.ts`.
- [x] `pageFilters.showComparativa=true` activado por Gastos e Ingresos en su `useEffect`.

### Milestone 8.3 — Inicio AAPP ⏳ (diferido a F9)

- [ ] Reescribir `Inicio/index.tsx` con datos consolidados AAPP (requiere F9).

### Milestone 8.4 — Cierre de fase ✅

- [x] Build TypeScript sin errores.
- [x] Sin referencias a `entityType` en el código.
- [x] Redirects configurados para todas las rutas antiguas.
- [x] `ARCHITECTURE.md` actualizado con desviaciones.

---

## Fase 9: Datos consolidados AAPP (IGAE SEC2010) ✅

**Objetivo:** Incorporar las cuentas consolidadas de las Administraciones Públicas (SEC2010) y el PIB, para alimentar las páginas `/aapp/*` y los KPIs de Inicio y Deuda.

### Milestone 9.0 — Actualizar ARCHITECTURE.md ✅

- [x] Actualizar en `ARCHITECTURE.md` las secciones afectadas:
  - Esquema DuckDB: añadir tablas `aapp_ingresos`, `aapp_gastos`, `pib_anual` con columnas, claves y unidades.
  - Tabla "Fuentes de Datos": añadir Eurostat `gov_10a_main`, `nama_10_gdp`, IGAE Contabilidad Nacional.
  - Árbol de ficheros: añadir `scrapers/eurostat_aapp.py`, `queries/aapp.ts`, `pages/AAPP/`.
  - Nota sobre mapeo Eurostat NA_ITEM → `concepto` canónico y cobertura temporal.

### Milestone 9.1 — Scraper IGAE SEC2010 + PIB ✅

- [x] Fuente principal: **Eurostat `gov_10a_main`** (JSON-stat, SEC2010, cobertura 1995–actual; misma API REST que `gov_10a_exp` ya usada en `igae_cofog.py`).
- [x] PIB: **Eurostat `nama_10_gdp`** (precios corrientes, nacional, M€). Cargado en el mismo módulo.
- [x] Crear `scraper/src/scraper/scrapers/eurostat_aapp.py` siguiendo el patrón de `igae_cofog.py` (parseo JSON-stat con strides).
- [x] Registrar `eurostat_aapp` como fuente en `main.py`.

### Milestone 9.2 — Esquema de tablas ✅

- [x] Tablas `aapp_ingresos`, `aapp_gastos`, `pib_anual` añadidas a `scraper/src/scraper/db.py`.

### Milestone 9.3 — Páginas y queries AAPP ✅

- [x] `web/src/db/queries/aapp.ts`: `getAappIngresos(year, subsector)`, `getAappGastos(year, subsector)`, `getAappResumen(subsector)`, `getPibAnual()`.
- [x] `web/src/pages/AAPP/Ingresos.tsx`: BarChart horizontal por concepto, LineChart histórico multi-concepto, tabla con importe y % PIB.
- [x] `web/src/pages/AAPP/Gastos.tsx`: idem. InsightsPanel con gasto/PIB, prestaciones, intereses, saldo.
- [x] Rutas `/aapp/ingresos` y `/aapp/gastos` añadidas a `App.tsx`.
- [x] Grupo AAPP añadido al sidebar en `AppShell.tsx`.
- [x] `pages/Inicio/index.tsx` reescrito (M8.3): KPIs AAPP consolidados, LineChart ingresos vs gastos 1995–actual, tarjetas de acceso por ámbito.

### Milestone 9.4 — Cierre de fase ✅

- [x] Todos los milestones 9.0–9.3 completados.
- [x] TypeScript sin errores (`pnpm tsc` limpio).
- [x] Páginas `/aapp/ingresos` y `/aapp/gastos` implementadas con selector de subsector, InsightsPanel, KPIs, BarChart, tabla y LineChart histórico.
- [x] Inicio reescrito con datos AAPP consolidados (SEC2010) en lugar de datos del Estado.
- [x] Desviación respecto al plan: no se creó `AAPP/Deuda.tsx` placeholder (se implementará en F10). El scraper de IGAE Contabilidad Nacional como fuente complementaria se omitió (Eurostat cubre 1995–actual de forma suficiente).

---

## Fase 10: Sección Deuda ⏳

**Objetivo:** Añadir la tercera pata de las cuentas públicas: evolución del stock de deuda, ratio/PIB, intereses, emisiones brutas/netas del Tesoro y desglose por tenedores.

### Milestone 10.0 — Actualizar ARCHITECTURE.md ⏳

- [ ] Actualizar en `ARCHITECTURE.md` las secciones afectadas:
  - Esquema DuckDB: añadir tablas `deuda_pde`, `deuda_emisiones`, `deuda_tenedores`.
  - Tabla "Fuentes de Datos": añadir Eurostat `gov_10dd_edpt1`, BdE SPAM, BdE Tenedores, Tesoro emisiones.
  - Árbol de ficheros: añadir `scrapers/deuda.py`, `queries/deuda.ts`, `pages/*/Deuda.tsx`.

### Milestone 10.1 — Scraper y tablas ⏳

- [ ] Fuentes:
  - **Stock deuda PDE**: Eurostat `gov_10dd_edpt1` (anual, por subsector). Complemento: BdE Síntesis SPAM para serie trimestral.
  - **Intereses**: ya capturados en `aapp_gastos` con `concepto='intereses'` (F9) + IGAE capítulo 3 como referencia cruzada.
  - **Emisiones Tesoro**: datos.gob.es "Estrategia del Tesoro" o scraping del informe anual del Tesoro.
  - **Tenedores**: BdE — "Tenedores de deuda del Estado" (Excel mensual).
  - **PIB**: ya en `pib_anual` (F9).
- [ ] Crear `scraper/src/scraper/scrapers/deuda.py` con submódulos por fuente.
- [ ] Nuevas tablas:
  ```sql
  CREATE TABLE deuda_pde (
      year       INTEGER NOT NULL,
      subsector  VARCHAR NOT NULL,   -- 'S13','S1311','S1312','S1313','S1314'
      importe    DECIMAL(18,2),      -- M€
      PRIMARY KEY (year, subsector)
  );

  CREATE TABLE deuda_emisiones (
      year       INTEGER PRIMARY KEY,
      bruta      DECIMAL(18,2),      -- emisión bruta M€
      neta       DECIMAL(18,2),      -- neta (bruta - vencimientos)
      vida_media DECIMAL(6,2)        -- años
  );

  CREATE TABLE deuda_tenedores (
      year       INTEGER NOT NULL,
      month      INTEGER DEFAULT 0,  -- 0 = media anual
      categoria  VARCHAR NOT NULL,   -- 'residentes','no_residentes','bce','sector_privado',...
      importe    DECIMAL(18,2),      -- M€
      pct_total  DECIMAL(6,3),
      PRIMARY KEY (year, month, categoria)
  );
  ```

### Milestone 10.2 — Páginas Deuda por ámbito ⏳

- [ ] `web/src/pages/AAPP/Deuda.tsx`: evolución stock (1995–actual), ratio/PIB, área apilada por subsector, intereses (% PIB), tenedores (donut + evolución temporal).
- [ ] `web/src/pages/Estado/Deuda.tsx`: deuda `S1311` + emisiones brutas/netas del Tesoro + vida media + KPI "cuánto vence este año".
- [ ] `web/src/pages/CCAA/Deuda.tsx`: ranking CCAA por deuda/PIB autonómico, mapa coroplético (reutilizar `ChoroplethMap`).
- [ ] `web/src/pages/SS/Deuda.tsx`: deuda SS (pequeña, serie corta), con contexto sobre el fondo de reserva.
- [ ] `web/src/db/queries/deuda.ts`: queries correspondientes.
- [ ] InsightsPanel: ratio actual vs máximo histórico, carga de intereses vs gasto en educación, etc.

### Milestone 10.3 — Cierre de fase ⏳

- [ ] Repasar los `[ ]` de 10.0–10.2; todos marcados.
- [ ] Verificar en DuckDB que `deuda_pde`, `deuda_emisiones`, `deuda_tenedores` tienen filas esperadas.
- [ ] Ratio deuda/PIB del último año disponible cuadra con cifras oficiales (BdE/Eurostat).
- [ ] Las 4 páginas (`/aapp/deuda`, `/estado/deuda`, `/ccaa/deuda`, `/ss/deuda`) cargan con datos reales.
- [ ] Si hubo desviaciones del diseño, actualizar `ARCHITECTURE.md`.
- [ ] Marcar Fase 10 como ✅ en el resumen de fases y en la cabecera.

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
