# Cuentas Públicas

Sitio web educativo e interactivo para explorar los presupuestos públicos de España: ingresos tributarios, gastos por Ministerio y programa, ejecución presupuestaria y presupuestos de las Comunidades Autónomas.

> Documentación detallada: [ARCHITECTURE.md](ARCHITECTURE.md) — [PLAN.md](PLAN.md)

---

## ¿Qué incluye?

| Sección | Datos | Años |
|---------|-------|------|
| Inicio | Resumen ingresos vs gastos consolidados | 2005–2025 |
| Ingresos | Desglose por capítulo (impuestos, tasas, deuda...) | 2005–2025 |
| Impuestos | Recaudación AEAT: IRPF, IVA, Sociedades, Especiales | 1995–2024 |
| Gastos | Treemap por Ministerio/sección con drill-down a programas | 2005–2025 |
| Comparativa | Plan aprobado vs ejecución real por sección | 2009–2024 |
| Transferencias | Transferencias del Estado a cada CCAA (corrientes, capital, FCI, UE) | 2005–2025 |
| CCAA | Presupuesto consolidado de cada Comunidad Autónoma | 2002–2024 |

**Fuentes oficiales:** AEAT, IGAE, SEPG (Ministerio de Hacienda), INE

---

## Arquitectura

El sitio es completamente **estático** — no requiere servidor backend:

```
scrapers Python  →  cuentas-publicas.duckdb  →  GitHub Pages
                         (asset estático)          React + DuckDB WASM
```

- **Pipeline de datos** (`scraper/`): scripts Python que descargan datos de los portales oficiales y los normalizan en un fichero DuckDB.
- **Frontend** (`web/`): aplicación React que carga el fichero DuckDB en el navegador mediante DuckDB WASM y ejecuta las queries directamente en el cliente.
- **CI/CD** (`.github/workflows/`): GitHub Actions despliega el sitio en GitHub Pages y actualiza los datos mensualmente.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Base de datos | DuckDB (fichero estático) + DuckDB WASM (cliente) |
| Pipeline de datos | Python 3.12 + uv + pandas + openpyxl |
| Frontend | React 18 + TypeScript + Vite 5 |
| CSS | Tailwind CSS v4 |
| Gráficas | Apache ECharts + echarts-for-react |
| Mapa coroplético | react-simple-maps + d3-scale |
| Estado global | Zustand |
| Tablas | TanStack Table v8 |
| Despliegue | GitHub Pages |

---

## Desarrollo local

### Requisitos previos

- Python 3.12+ con [uv](https://docs.astral.sh/uv/)
- Node.js 20+
- DuckDB CLI (opcional, para inspeccionar la base de datos)

### 1. Generar la base de datos

```bash
cd scraper
uv sync
uv run python -m scraper run        # descarga y procesa todas las fuentes
uv run python -m scraper status     # muestra recuento de filas por tabla
```

El fichero `cuentas-publicas.duckdb` se genera en la raíz del proyecto. Cópialo al frontend:

```bash
cp cuentas-publicas.duckdb ../web/public/db/
```

Para actualizar solo una fuente o un año concreto:

```bash
uv run python -m scraper run --source aeat
uv run python -m scraper run --year 2024
```

### 2. Arrancar el frontend

```bash
cd web
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en el navegador.

> **Nota:** el primer acceso tarda ~2–3 segundos mientras DuckDB WASM se inicializa y descarga el fichero de base de datos.

### 3. Build de producción

```bash
cd web
npm run build       # genera web/dist/
npm run preview     # sirve el build localmente para verificar
```

---

## Estructura del repositorio

```
cuentas-publicas/
├── scraper/                    # Pipeline de datos Python
│   ├── pyproject.toml
│   └── src/scraper/
│       ├── main.py             # CLI principal
│       ├── db.py               # Schema DuckDB y helpers
│       ├── scrapers/           # Descarga por fuente
│       └── transform/          # Normalización de datos
│
├── web/                        # Frontend React
│   ├── public/
│   │   ├── db/                 # cuentas-publicas.duckdb (generado)
│   │   ├── geo/                # GeoJSON de CCAA españolas
│   │   └── coi-serviceworker.js
│   └── src/
│       ├── db/                 # Cliente DuckDB WASM + queries
│       ├── store/              # Estado global (Zustand)
│       ├── components/         # Gráficas, mapa, UI reutilizable
│       └── pages/              # Una carpeta por sección del sitio
│
├── .github/workflows/
│   ├── deploy.yml              # Build y despliegue a GitHub Pages
│   └── update-data.yml         # Actualización mensual de datos
│
├── ARCHITECTURE.md             # Diseño del sistema
└── PLAN.md                     # Hoja de ruta de implementación
```

---

## Fuentes de datos

| Fuente | Organismo | Portal |
|--------|-----------|--------|
| Recaudación tributaria | AEAT | [sede.agenciatributaria.gob.es](https://sede.agenciatributaria.gob.es) |
| Ejecución presupuestaria | IGAE | [igae.pap.hacienda.gob.es](https://www.igae.pap.hacienda.gob.es) |
| Plan PGE — Series históricas | SEPG | [sepg.pap.hacienda.gob.es](https://www.sepg.pap.hacienda.gob.es) |
| Presupuesto Seguridad Social | TGSS | [datos.gob.es](https://datos.gob.es) |
| Presupuestos CCAA | Mº Hacienda / IGAE | [igae.pap.hacienda.gob.es](https://www.igae.pap.hacienda.gob.es) |
| Población por CCAA | INE | [ine.es](https://www.ine.es) |

Todos los datos son públicos y de acceso libre. El scraper los descarga directamente de los portales oficiales sin necesidad de credenciales.

---

## Licencia

GNU General Public License v3 — ver [LICENSE](LICENSE).
