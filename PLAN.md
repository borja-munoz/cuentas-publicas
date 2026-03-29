# Plan de Implementación — Cuentas Públicas

## Resumen de Fases

| Fase | Objetivo | Entregable |
|------|----------|------------|
| 1 | Pipeline de datos Python | `cuentas-publicas.duckdb` con datos reales de todas las fuentes (incl. CCAA) |
| 2 | Base del frontend | App React con DuckDB WASM integrado, routing y estado global |
| 3 | Visualizaciones nacionales | Las 6 páginas del presupuesto nacional con gráficas interactivas |
| 4 | Despliegue y CI/CD | Sitio publicado en GitHub Pages con actualización mensual automática |
| 5 | Visualizaciones CCAA | Mapa coroplético de transferencias y presupuestos autonómicos |

### Dependencias entre fases

```
Fase 1 (Scraper) ───────────────────────────────► Fase 3 (requiere .duckdb real)
                  \                           └──► Fase 5 (requiere tablas CCAA)
                   ──► Fase 2.1–2.4 puede avanzar en paralelo con datos mock
Fase 2 ──► Fase 3 ──► Fase 4
                   └──► Fase 5 (requiere Fase 4 desplegada y Fase 1 con tablas CCAA)
```

---

## Fase 1: Pipeline de Datos Python

**Objetivo:** Generar el fichero `cuentas-publicas.duckdb` con datos reales de todas las fuentes oficiales.

### Milestone 1.1 — Estructura del proyecto scraper

- [ ] Inicializar proyecto con `uv init scraper` (Python 3.12+)
- [ ] Definir dependencias en `pyproject.toml`:
  - `requests` — descargas HTTP
  - `pandas` — manipulación de datos
  - `openpyxl` — lectura de ficheros Excel (.xlsx)
  - `duckdb` — escritura en base de datos
  - `tqdm` — barras de progreso
  - `rich` — logging estructurado en consola
  - `click` — CLI
- [ ] Crear estructura de directorios: `src/scraper/scrapers/`, `src/scraper/transform/`
- [ ] Implementar `db.py`:
  - `create_schema(conn)`: crea todas las tablas y vistas (idempotente con `IF NOT EXISTS`)
  - `upsert(conn, table, df)`: helper genérico de upsert con `INSERT OR REPLACE`

**Criterio de aceptación:** `python -m scraper --help` muestra el menú de comandos.

---

### Milestone 1.2 — Scraper AEAT (recaudación tributaria 1995–2024)

- [ ] Identificar y documentar URLs de descarga del Anuario Estadístico AEAT (sede electrónica)
- [ ] Implementar `scrapers/aeat.py`:
  - Descarga de ficheros Excel por año (1995–2024)
  - Soporte de descarga incremental (saltar años ya existentes en DB)
- [ ] Implementar `transform/aeat.py`:
  - Normalizar nombres de columnas
  - Mapear etiquetas de impuestos a valores canónicos: `'IRPF'`, `'IVA'`, `'Sociedades'`, `'Especiales'`, `'Otros'`
  - Separar importe bruto, devoluciones e importe neto
- [ ] Escribir en tabla `recaudacion_aeat` con upsert

**Verificación:**
```sql
SELECT year, impuesto, importe_neto
FROM cp.recaudacion_aeat
ORDER BY year, impuesto
LIMIT 30;
-- Debe mostrar datos desde 1995
```

---

### Milestone 1.3 — Scraper SEPG (plan presupuestario 2005–2025)

- [ ] Identificar URLs de series históricas consolidadas SEPG:
  - Fichero de ingresos consolidados (histórico)
  - Fichero de gastos por sección y programa (histórico)
- [ ] Implementar `scrapers/sepg.py`:
  - Descarga y parseo de Excel multi-hoja
  - Identificación automática de hojas relevantes por nombre
- [ ] Implementar `transform/sepg.py`:
  - Mapear clasificación económica (capítulos 1–9) a denominaciones estándar
  - Extraer y normalizar códigos y nombres de secciones y programas
  - Inferir campo `entidad` ('Estado', 'OO.AA.', 'Consolidado') a partir de la hoja o columna fuente
- [ ] Escribir en tablas `ingresos_plan` y `gastos_plan`

**Verificación:**
```sql
SELECT year, entidad, SUM(importe) AS total_gastos
FROM cp.gastos_plan
WHERE capitulo < 9 AND programa_cod IS NULL
GROUP BY year, entidad
ORDER BY year, entidad;
-- Total gastos consolidados 2024 debe ser ≈ 587.000 M€
```

---

### Milestone 1.4 — Scraper IGAE (ejecución presupuestaria 2009–2024)

- [ ] Identificar y documentar URLs de archivos ZIP IGAE por año para:
  - AGE (Administración General del Estado) — gastos e ingresos
  - Organismos Autónomos — gastos e ingresos
- [ ] Implementar `scrapers/igae.py`:
  - Descarga ZIP por año, extracción en directorio temporal
  - Parseo de cada Excel interno según clasificación (económica / orgánica)
- [ ] Implementar `transform/igae.py`:
  - Normalizar columnas de créditos, obligaciones y pagos
  - Unir AGE y OO.AA. con campo `entidad`
  - Alinear códigos de sección y programa con los de SEPG
- [ ] Escribir en tablas `ingresos_ejecucion` y `gastos_ejecucion`

**Verificación:**
```sql
SELECT year,
       SUM(obligaciones_reconocidas) AS gasto_ejecutado,
       SUM(creditos_definitivos)     AS credito_definitivo
FROM cp.gastos_ejecucion
WHERE entidad = 'Estado'
GROUP BY year ORDER BY year;
-- Comparar con cifras publicadas por IGAE para 2022 y 2023
```

---

### Milestone 1.5 — Scraper Seguridad Social

- [ ] Localizar datasets de Seguridad Social en datos.gob.es o portal TGSS:
  - Presupuesto de ingresos SS (plan)
  - Presupuesto de gastos SS (plan)
  - Ejecución presupuestaria SS (si disponible)
- [ ] Implementar `scrapers/seguridad_social.py` con descarga y parseo
- [ ] Integrar con tablas `ingresos_plan` y `gastos_plan` usando `entidad = 'SS'`

**Verificación:**
```sql
SELECT year, SUM(importe) FROM cp.gastos_plan
WHERE entidad = 'SS' GROUP BY year ORDER BY year;
-- Debe mostrar datos desde 2010
```

---

### Milestone 1.6 — CLI, vistas y finalización del scraper

- [ ] Completar `main.py` con CLI `click`:
  - `python -m scraper run` — ejecuta todos los scrapers
  - `python -m scraper run --source aeat` — solo AEAT
  - `python -m scraper run --year 2024` — solo el año indicado
  - `python -m scraper status` — muestra recuento de filas por tabla
- [ ] Crear vistas pre-calculadas en `db.py` (se ejecutan tras la carga completa):
  - `v_gastos_plan_seccion`, `v_gastos_plan_capitulo`, `v_ingresos_plan_capitulo`
- [ ] Logging estructurado con `rich`: fuente, año, filas insertadas/actualizadas
- [ ] Documentar uso en `scraper/README.md`
- [ ] Copiar `.duckdb` generado a `web/public/db/cuentas-publicas.duckdb`

---

### Milestone 1.7 — Scraper transferencias Estado → CCAA

- [ ] Identificar en los datos SEPG los artículos que corresponden a transferencias territoriales:
  - Artículo **46** (cap. 4): Transferencias corrientes a Comunidades Autónomas
  - Artículo **76** (cap. 7): Transferencias de capital a Comunidades Autónomas
  - Programas del **FCI** (Fondo de Compensación Interterritorial): identificar por código de programa
  - Fondos **UE** canalizados a CCAA: identificar por sección y programa
- [ ] Implementar `scrapers/transferencias_ccaa.py`:
  - Reutiliza los datos ya cargados en `gastos_plan` y `gastos_ejecucion` (sin nuevas descargas)
  - Filtra artículos 46 y 76 y desglosa por CCAA beneficiaria a nivel de concepto presupuestario
  - Clasifica cada fila en `tipo`: `'corriente'`, `'capital'`, `'fci'`, `'ue'`
- [ ] Incorporar tabla de población por CCAA (INE Padrón Municipal):
  - Descarga desde API JSON del INE: indicador de padrón municipal por CCAA, serie 2002–2024
  - Tabla `poblacion_ccaa (year, ccaa_cod, poblacion)`
- [ ] Escribir en tabla `transferencias_ccaa` y crear vista `v_transferencias_ccaa_total`

**Verificación:**
```sql
SELECT year, ccaa_nom, SUM(importe) AS total
FROM cp.transferencias_ccaa WHERE fuente='ejecucion'
GROUP BY year, ccaa_nom ORDER BY year, total DESC LIMIT 20;
-- Andalucía, Cataluña y Valencia deben aparecer entre los mayores receptores
```

---

### Milestone 1.8 — Scraper presupuestos CCAA (Ministerio de Hacienda consolidado)

- [ ] Localizar la publicación del Ministerio de Hacienda/IGAE: "Ejecución del Presupuesto de las Comunidades Autónomas" en el portal de Contabilidad de las CC.AA.
- [ ] Identificar URLs de descarga de series históricas de todas las CCAA (2002–2024)
- [ ] Implementar `scrapers/ccaa.py`:
  - Descarga Excel o ZIP con datos de las 19 comunidades/ciudades autónomas
  - Parseo de ingresos y gastos por capítulo para cada CCAA y año
- [ ] Implementar `transform/ccaa.py`:
  - Normalizar nombres de CCAA a tabla canónica de 19 códigos (17 CCAA + Ceuta + Melilla)
  - Separar filas de plan (`fuente='plan'`) y ejecución (`fuente='ejecucion'`)
  - Poblar tabla `ccaa_ref` con los 19 códigos, nombres y capitales
- [ ] Escribir en tablas `ccaa_ingresos`, `ccaa_gastos` y crear vista `v_ccaa_resumen`

**Verificación:**
```sql
SELECT year, ccaa_nom,
       SUM(CASE WHEN fuente='plan'      THEN importe END) AS gastos_plan,
       SUM(CASE WHEN fuente='ejecucion' THEN importe END) AS gastos_ejec
FROM cp.ccaa_gastos GROUP BY year, ccaa_nom ORDER BY year, ccaa_nom LIMIT 30;
```

---

## Fase 2: Base del Frontend

**Objetivo:** Aplicación React funcional con DuckDB WASM integrado, navegación y estado global operativos.

### Milestone 2.1 — Inicialización del proyecto

- [ ] `npm create vite@latest web -- --template react-ts`
- [ ] Instalar dependencias de producción:
  ```
  tailwindcss @tailwindcss/vite
  echarts echarts-for-react
  @duckdb/duckdb-wasm
  zustand
  react-router-dom
  @tanstack/react-table
  react-simple-maps
  d3-scale d3-color d3-scale-chromatic
  ```
- [ ] Configurar `vite.config.ts`:
  - `base: '/cuentas-publicas/'` (para GitHub Pages)
  - `optimizeDeps.exclude: ['@duckdb/duckdb-wasm']`
  - Cabeceras COOP/COEP en el dev server
- [ ] Configurar Tailwind CSS v4 (plugin Vite)
- [ ] Copiar `coi-serviceworker.js` a `web/public/`
- [ ] Copiar `.duckdb` generado a `web/public/db/`

**Criterio de aceptación:** `npm run dev` abre la app sin errores de compilación.

---

### Milestone 2.2 — Integración DuckDB WASM

- [ ] Implementar `src/db/client.ts` (ver arquitectura): singleton `getDB()` + helper `query<T>(sql)`
- [ ] Prueba de humo en `App.tsx`:
  ```typescript
  const count = await query('SELECT COUNT(*) AS n FROM cp.recaudacion_aeat');
  console.log(count); // [{ n: <número filas> }]
  ```
- [ ] Verificar funcionamiento en Chrome y Firefox
- [ ] Confirmar que `coi-serviceworker.js` se activa correctamente (revisar DevTools → Application → Service Workers)

---

### Milestone 2.3 — Estado global y routing

- [ ] Implementar Zustand store completo (`src/store/filters.ts`):
  - `years`, `selectedYear`, `compareYears`, `viewMode`, `entityType`
  - Acción `initYears`: carga años disponibles desde DB al arrancar la app
- [ ] Configurar React Router v6 con todas las rutas:
  `/`, `/ingresos`, `/ingresos/impuestos`, `/gastos`, `/gastos/:seccion`, `/comparativa`
- [ ] Implementar `AppShell.tsx`:
  - Sidebar fija con enlaces de navegación e íconos
  - Cabecera con título, selector de entidad (`EntityTypeSelector`) y selector de año (`YearSelector`)
  - Layout responsivo (sidebar colapsa en pantallas pequeñas)
- [ ] Implementar `YearSelector.tsx`: dropdown con años disponibles del store
- [ ] Implementar `ViewModeToggle.tsx`: toggle Plan / Ejecución (visible en páginas Ingresos, Gastos, Comparativa)

---

### Milestone 2.4 — Componentes UI base

- [ ] `KpiCard.tsx`: tarjeta con título, valor formateado en euros, variación porcentual YoY con flecha (▲/▼)
- [ ] `LoadingSkeleton.tsx`: rectángulos animados que imitan el layout de gráficas y KPIs
- [ ] `ErrorBoundary.tsx`: mensaje de error amigable si DuckDB WASM no carga
- [ ] Helpers de formato en `src/utils/format.ts`:
  - `formatEur(n)`: `123456789` → `"123.457 M€"` / `"1,2 B€"` según magnitud
  - `formatPct(n)`: `0.045` → `"+4,5%"` con signo y color verde/rojo

### Milestone 2.5 — Componentes educativos

- [ ] Definir interfaz `Insight` en `src/utils/insights.ts`:
  ```typescript
  interface Insight {
    label: string;        // "Recaudación IRPF"
    value: string;        // "109.163 M€"
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;  // "+8,3% vs 2022"
    description: string;  // texto explicativo de 1–2 frases
  }
  ```
- [ ] Implementar `ContextBox.tsx`:
  - Acepta `title` (string) y `children` (ReactNode)
  - Estilo: fondo neutro suave, borde izquierdo de acento, tipografía de cuerpo legible
  - Colapsable en móvil con "Leer más / Ocultar"
- [ ] Implementar `InsightsPanel.tsx`:
  - Recibe `insights: Insight[]` y `isLoading?: boolean`
  - Layout: fila horizontal de tarjetas en escritorio, lista vertical en móvil
  - Cada tarjeta: etiqueta + valor grande + indicador de tendencia (▲ verde / ▼ rojo / — neutro) + descripción
  - Muestra `LoadingSkeleton` mientras `isLoading=true`
- [ ] Establecer el **layout estándar de página** en `AppShell.tsx` o como componente `PageLayout.tsx`:
  `PageHeader → ContextBox → InsightsPanel → [visualización] → [tabla] → [nota de fuente]`

---

## Fase 3: Visualizaciones de Datos

**Objetivo:** Las cuatro páginas principales completamente funcionales con gráficas interactivas.

### Milestone 3.1 — Página Inicio (Dashboard)

- [ ] Implementar queries en `src/db/queries/ingresos.ts` y `gastos.ts` para totales anuales
- [ ] KPI cards (año seleccionado vs año anterior):
  - Total ingresos ejecutados / planificados
  - Total gastos ejecutados / planificados
  - Déficit / superávit
  - Variación % respecto al año anterior
- [ ] `BarChart.tsx` agrupado: ingresos vs gastos, toda la serie histórica disponible
  - Eje X: años; barras azul (ingresos) y naranja (gastos)
  - Tooltip con valores absolutos y diferencia
- [ ] Cambiar `entityType` en la cabecera actualiza todos los KPIs y el gráfico en tiempo real
- [ ] **Texto educativo:**
  - `ContextBox`: qué son los PGE, qué engloba cada entidad (Estado, OO.AA., SS, Consolidado), diferencia entre plan y ejecución, nota sobre los años con presupuesto prorrogado
  - `InsightsPanel` (dinámico): déficit/superávit del año seleccionado y comparación histórica; mayor y menor déficit de la serie; variación de ingresos y gastos YoY

**Criterio de aceptación:** Dashboard carga en < 3s (incluyendo init WASM + fetch .duckdb).

---

### Milestone 3.2 — Página Ingresos

- [ ] Query: ingresos por capítulo para el año y entidad seleccionados (plan o ejecución según `viewMode`)
- [ ] `BarChart.tsx` apilado: un segmento por capítulo, colores diferenciados
  - Capítulos: Impuestos directos, Impuestos indirectos, Tasas, Transferencias corrientes, Ingresos patrimoniales, Enajenación activos, Transferencias de capital, Activos financieros, Pasivos financieros
- [ ] Tabla TanStack debajo del gráfico:
  - Columnas: Capítulo | Descripción | Importe | % del total
  - Ordenable por importe
  - Fila de totales al pie
- [ ] Enlace "Ver detalle AEAT" visible cuando capítulos 1 y 2 están seleccionados
- [ ] **Texto educativo:**
  - `ContextBox`: qué significa cada capítulo de ingresos (1–9), qué son los pasivos financieros como ingreso (emisión de deuda), qué diferencia hay entre derechos reconocidos y recaudación neta
  - `InsightsPanel`: % que representan los impuestos (cap. 1+2) sobre el total; capítulo con mayor variación YoY; peso de los pasivos financieros (deuda) sobre el total (indicador de dependencia del endeudamiento)

---

### Milestone 3.3 — Sub-página Impuestos (AEAT)

- [ ] Implementar queries en `src/db/queries/aeat.ts`:
  - Serie histórica anual por tipo de impuesto (1995–2024)
  - Desglose bruto/devoluciones/neto para el año seleccionado
- [ ] `LineChart.tsx` multi-serie: IRPF, IVA, Sociedades, Especiales — evolución 1995–2024
  - Selector de impuestos para mostrar/ocultar series
  - Tooltip con valor absoluto y % del total de ese año
- [ ] `SunburstChart.tsx` para el año seleccionado:
  - Nivel 1: tipo de impuesto
  - Nivel 2: bruto / devoluciones / neto
- [ ] **Texto educativo:**
  - `ContextBox`: qué es cada impuesto (IRPF, IVA, Sociedades, Especiales), diferencia entre recaudación bruta y neta, qué son las devoluciones y por qué existen, qué es el ciclo económico y cómo afecta a la recaudación
  - `InsightsPanel`: impuesto con mayor crecimiento YoY; ratio devoluciones/bruto del IVA (indica ciclo económico); año de máxima recaudación total en la serie histórica; evolución desde la crisis de 2008 hasta hoy

---

### Milestone 3.4 — Página Gastos (Treemap + Drill-down)

- [ ] Query: gastos por sección para el año y entidad seleccionados (vista `v_gastos_plan_seccion`)
- [ ] `TreemapChart.tsx` con drill-down nativo ECharts:
  - Nivel 1: secciones (Ministerios/Organismos) — tamaño proporcional al importe
  - Nivel 2 (clic en sección): programas de esa sección
  - Nivel 3 (clic en programa): desglose por capítulo económico
  - Botón "Volver" en cada nivel
- [ ] Panel lateral al seleccionar una sección:
  - `LineChart.tsx` con evolución histórica del gasto de esa sección
  - Importe del año actual y variación vs año anterior
- [ ] `BarChart.tsx` horizontal debajo: top 10 secciones ordenadas por importe
  - Clic en barra navega a `/gastos/:seccion`
- [ ] **Texto educativo:**
  - `ContextBox`: qué es la clasificación orgánica (sección = Ministerio), qué es la clasificación económica (capítulos 1–9), cómo leer un treemap, diferencia entre gasto corriente e inversión
  - `InsightsPanel`: 3 secciones con mayor gasto y su % del total; sección con mayor crecimiento YoY; peso del gasto en Protección Social sobre el total

---

### Milestone 3.5 — Sub-página Programa (detalle de sección)

- [ ] Ruta `/gastos/:seccion` recibe `seccion_cod` como parámetro
- [ ] Cabecera: nombre de la sección + breadcrumb "Gastos > [Sección]"
- [ ] Tabla TanStack de programas:
  - Columnas: Código | Nombre | Importe plan | Importe ejecutado | Desviación %
  - Filtro de texto por nombre de programa
  - Ordenación por cualquier columna
- [ ] `BarChart.tsx` horizontal: programas de la sección ordenados por importe planificado
- [ ] Enlace "← Volver a Gastos"
- [ ] **Texto educativo:**
  - `ContextBox`: qué es un programa presupuestario, cómo se estructura (política de gasto → programa → subprograma), qué hace este Ministerio/sección concreta
  - `InsightsPanel`: programa con mayor importe; programa con mayor desviación plan/ejecución; % del gasto de esta sección sobre el total nacional

---

### Milestone 3.6 — Página Comparativa (Plan vs Ejecución)

- [ ] Selector de año único (el plan y la ejecución son siempre del mismo año)
- [ ] `BarChart.tsx` agrupado por sección:
  - Barra azul: importe planificado
  - Barra naranja: obligaciones reconocidas (ejecución)
  - Solo top 15 secciones por importe para legibilidad
- [ ] Tabla TanStack con todas las secciones:
  - Columnas: Sección | Plan (€) | Ejecución (€) | Desviación (€) | Desviación (%)
  - Ordenable por desviación (%) para identificar las secciones más desviadas
  - Formato condicional: desviación > 10% en rojo, < -10% en verde
- [ ] Filtro: slider "Mostrar solo secciones con desviación > X%" (0–50%)
- [ ] KPI cards de resumen: total planificado, total ejecutado, desviación global
- [ ] **Texto educativo:**
  - `ContextBox`: qué es la ejecución presupuestaria, por qué el gasto ejecutado difiere del planificado (transferencias pendientes, proyectos retrasados, créditos extraordinarios), qué son los créditos definitivos vs iniciales, qué significa una tasa de ejecución del 95%
  - `InsightsPanel`: tasa de ejecución global del año; sección con mayor y menor tasa de ejecución; importe total de crédito no ejecutado (=desperdicio presupuestario percibido)

---

## Fase 4: Despliegue y Automatización

**Objetivo:** Sitio publicado en GitHub Pages con pipeline CI/CD automatizado.

### Milestone 4.1 — Primera publicación en GitHub Pages

- [ ] Verificar `base: '/cuentas-publicas/'` en `vite.config.ts`
- [ ] Crear `.github/workflows/deploy.yml`:
  ```yaml
  on:
    push:
      branches: [main]
    workflow_dispatch:
  jobs:
    deploy:
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4 (Node 20)
        - run: cd web && npm ci && npm run build
        - uses: peaceiris/actions-gh-pages@v3
          with:
            github_token: ${{ secrets.GITHUB_TOKEN }}
            publish_dir: ./web/dist
  ```
- [ ] Activar GitHub Pages en la configuración del repo (fuente: rama `gh-pages`)
- [ ] Verificar que `coi-serviceworker.js` se registra correctamente en producción
- [ ] Verificar que DuckDB WASM carga y las gráficas renderizan en la URL de GitHub Pages

---

### Milestone 4.2 — Pipeline de actualización mensual

- [ ] Crear `.github/workflows/update-data.yml`:
  ```yaml
  on:
    schedule:
      - cron: '0 6 1 * *'   # 1º de cada mes a las 6:00 UTC
    workflow_dispatch:        # permite ejecución manual
  jobs:
    update:
      steps:
        - uses: actions/checkout@v4
        - uses: astral-sh/setup-uv@v3
        - run: cd scraper && uv run python -m scraper run
        - run: |
            cp scraper/cuentas-publicas.duckdb web/public/db/
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add web/public/db/cuentas-publicas.duckdb
            git diff --staged --quiet || git commit -m "chore: actualizar datos [skip ci]"
            git push
        - uses: actions/github-script@v7  # dispara deploy.yml
          with:
            script: |
              github.rest.actions.createWorkflowDispatch({...})
  ```
- [ ] Probar ejecución manual del workflow desde la pestaña Actions

---

### Milestone 4.3 — Pulido final

- [ ] Diseño **responsive**:
  - Sidebar colapsa a menú hamburguesa en pantallas < 768px
  - Gráficas redimensionan correctamente con `echarts-for-react` + `ResizeObserver`
- [ ] **Pantalla de carga inicial**: spinner o skeleton mientras DuckDB WASM se inicializa (~2–3s en primera visita)
- [ ] **Meta tags SEO** en `web/index.html`:
  - `<title>`, `<meta name="description">`, Open Graph tags
- [ ] `.gitignore` actualizado: excluir `web/public/db/*.duckdb` (fichero grande, gestionado por CI)
- [ ] `README.md` actualizado con:
  - Badge del estado del workflow de deploy
  - Instrucciones de desarrollo local (`scraper` + `web`)
  - Instrucciones de despliegue manual

---

---

## Fase 5: Visualizaciones CCAA

**Objetivo:** Mapa coroplético interactivo de transferencias del Estado a CCAA y exploración de presupuestos autonómicos. Requiere Fase 1 completa (milestones 1.7 y 1.8) y Fase 4 desplegada.

### Milestone 5.1 — GeoJSON y componente ChoroplethMap

- [ ] Obtener GeoJSON de CCAA españolas:
  - Fuente preferida: IGN (Instituto Geográfico Nacional) — cartografía oficial
  - Alternativa: Natural Earth admin-1
  - Verificar que incluye `ccaa_cod` (o nombre normalizable) en `properties` de cada feature
  - Reposicionar Canarias en recuadro: transformar coordenadas de las geometrías canarias en el fichero GeoJSON para situarlas en la esquina inferior izquierda (técnica estándar en mapas de España)
  - Guardar en `web/public/geo/ccaa.json` (simplificado para reducir tamaño, < 200 KB)
- [ ] Implementar `src/components/charts/ChoroplethMap.tsx`:
  ```typescript
  // Props
  interface ChoroplethMapProps {
    data: Record<string, number>;        // ccaa_cod → valor numérico
    domain: [number, number];            // [min, max] para escala de color
    colorScheme?: 'blues' | 'reds' | 'greens' | 'rdylgn';
    onSelect: (ccaaCod: string) => void;
    selectedCcaa: string | null;
    tooltipFormatter?: (val: number) => string;
  }
  ```
  - Usa `react-simple-maps`: `<ComposableMap>`, `<Geographies>`, `<Geography>`
  - Escala de color con `d3-scale` `scaleSequential` + `d3-scale-chromatic` `interpolateBlues`
  - Tooltip posicionado con `onMouseEnter` + estado local de posición
  - Leyenda de gradiente debajo del mapa con valores min/max formateados
  - Borde más grueso en la CCAA seleccionada

**Criterio de aceptación:** Mapa renderiza correctamente en local; hover muestra tooltip; clic llama a `onSelect`.

---

### Milestone 5.2 — Página Transferencias

- [ ] Implementar queries en `src/db/queries/ccaa.ts`:
  - `getTransferenciasPorCcaa(year, fuente)` → `Record<ccaa_cod, { total, corriente, capital, fci, ue }>`
  - `getTransferenciasSerie(ccaa_cod, fuente)` → array `{ year, total, corriente, capital, fci, ue }`
  - `getPoblacionCcaa(year)` → `Record<ccaa_cod, number>` (para calcular per cápita en frontend)
- [ ] Implementar `src/pages/Transferencias/index.tsx`:
  - Layout: mapa (izquierda 50%) + tabla TanStack (derecha 50%), sincronizados
  - Selector de variable del coroplético: Total €, Per cápita €/hab, Solo corrientes, Solo capital, FCI, UE
  - `ViewModeToggle` Plan / Ejecución
  - Tabla TanStack: CCAA | Total | Per cápita | Corrientes | Capital | FCI | UE — ordenable por cualquier columna; fila de la CCAA seleccionada resaltada
  - Panel expandible al seleccionar CCAA: `LineChart` con serie histórica de transferencias (total y desglose por tipo)
- [ ] Añadir enlace "Ver presupuesto →" en el panel que navega a `/ccaa/:id`
- [ ] **Texto educativo:**
  - `ContextBox`: qué es el Sistema de Financiación Autonómica, qué son las transferencias corrientes vs de capital, qué es el FCI y su objetivo constitucional (reducir desequilibrios territoriales), qué fondos UE se canalizan a las CCAA (FEDER, FSE)
  - `InsightsPanel`: CCAA con mayor transferencia per cápita; CCAA con mayor crecimiento de transferencias en la última década; diferencia entre la CCAA que más y menos recibe per cápita

**Criterio de aceptación:** Cambiar variable del coroplético actualiza colores del mapa y ordena la tabla por esa misma variable; clic en CCAA muestra panel con serie histórica.

---

### Milestone 5.3 — Página CCAA Overview

- [ ] Implementar queries adicionales en `src/db/queries/ccaa.ts`:
  - `getCcaaResumen(year)` → array con ingresos, gastos, déficit y % ejecución de cada CCAA
- [ ] Implementar `src/pages/CCAA/index.tsx`:
  - `ChoroplethMap` reutilizado con variable seleccionable: Gasto total, Ingreso total, Déficit, % ejecución
  - Tabla TanStack debajo (o a la derecha): CCAA | Ingresos plan | Ingresos ejec | Gastos plan | Gastos ejec | Déficit | % ejec
  - Clic en región del mapa o fila de tabla → navega a `/ccaa/:id`
  - `YearSelector` y `ViewModeToggle` globales aplican al mapa y la tabla
- [ ] **Texto educativo:**
  - `ContextBox`: qué competencias gestionan las CCAA (sanidad, educación, servicios sociales), por qué los presupuestos autonómicos son en conjunto similares en tamaño al del Estado, cómo se financia una CCAA (tributos cedidos + transferencias + deuda)
  - `InsightsPanel`: CCAA con mayor gasto per cápita; tasa de ejecución media de las CCAA; CCAA con mayor déficit absoluto y relativo

---

### Milestone 5.4 — Página CCAA Detalle

- [ ] Implementar `src/pages/CCAA/Detalle.tsx` (ruta `/ccaa/:id`):
  - Cabecera: nombre de la CCAA + año seleccionado + KPI cards (ingresos, gastos, déficit, variación YoY)
  - Tres tabs dentro de la misma página:
    - **Ingresos**: `BarChart` apilado por capítulo + tabla TanStack (mismo patrón que `/ingresos` nacional)
    - **Gastos**: `BarChart` apilado por capítulo + tabla TanStack (los datos del Ministerio no tienen desglose por sección/programa, solo por capítulo)
    - **Comparativa**: `BarChart` agrupado plan vs ejecución por capítulo + tabla desviación
  - Enlace a la página de Transferencias filtrada por esa CCAA: "← Ver transferencias recibidas"
  - Breadcrumb: "CCAA > [nombre]"
- [ ] Añadir `/ccaa` y `/ccaa/:id` al router en `App.tsx`
- [ ] Añadir sección "Comunidades Autónomas" en la sidebar de `AppShell.tsx` con enlaces a Transferencias y CCAA Overview
- [ ] **Texto educativo:**
  - `ContextBox` (personalizada por CCAA si es posible, o genérica): qué competencias tiene esta comunidad, cuáles son sus principales fuentes de ingreso, qué organismos gestionan sus presupuestos
  - `InsightsPanel`: gasto per cápita de esta CCAA vs media nacional; tasa de ejecución de esta CCAA vs media; principal capítulo de gasto y su % del total

---

## Checklist de Verificación Final

- [ ] `python -m scraper run` completa sin errores y genera `.duckdb` con datos de todas las fuentes, incluyendo tablas CCAA
- [ ] `duckdb cuentas-publicas.duckdb -c "SELECT year, SUM(importe_neto) FROM recaudacion_aeat GROUP BY year ORDER BY year"` muestra filas desde 1995
- [ ] `duckdb cuentas-publicas.duckdb -c "SELECT year, ccaa_nom, SUM(importe) FROM transferencias_ccaa WHERE fuente='ejecucion' GROUP BY ALL ORDER BY year, 3 DESC LIMIT 20"` muestra resultados coherentes
- [ ] `cd web && npm run dev` abre la app, DuckDB WASM carga, dashboard muestra KPIs y gráfica
- [ ] Clic en "Gastos" → treemap renderiza secciones → clic en sección → drill-down a programas
- [ ] Página Comparativa con año 2023: barras plan vs ejecución visibles, tabla con desviaciones
- [ ] Página Transferencias: mapa coroplético renderiza con colores diferenciados; clic en Andalucía → panel con serie histórica
- [ ] Página CCAA → clic en Cataluña → navega a `/ccaa/CT` → tabs Ingresos/Gastos/Comparativa funcionales
- [ ] Build de producción: `npm run build` sin warnings, `dist/` generado correctamente
- [ ] GitHub Pages: URL pública carga correctamente, service worker activo, no hay errores CORS
