"""
Schema DuckDB y helpers de escritura para cuentas-publicas.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd
from rich.console import Console

console = Console()

DB_PATH = Path(__file__).parents[3] / "cuentas-publicas.duckdb"


def connect(db_path: Path = DB_PATH) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(db_path))


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_DDL = """
-- Tabla de referencia de CCAA (estática)
CREATE TABLE IF NOT EXISTS ccaa_ref (
    ccaa_cod  VARCHAR PRIMARY KEY,
    ccaa_nom  VARCHAR NOT NULL,
    capital   VARCHAR
);

-- Población por CCAA y año (INE Padrón Municipal)
CREATE TABLE IF NOT EXISTS poblacion_ccaa (
    year      INTEGER NOT NULL,
    ccaa_cod  VARCHAR NOT NULL,
    poblacion INTEGER NOT NULL,
    PRIMARY KEY (year, ccaa_cod)
);

-- Recaudación tributaria detallada (AEAT)
-- month: 0 = total anual; 1-12 = mes concreto
CREATE TABLE IF NOT EXISTS recaudacion_aeat (
    year            INTEGER  NOT NULL,
    month           INTEGER  NOT NULL DEFAULT 0,
    impuesto        VARCHAR  NOT NULL,
    importe_bruto   DECIMAL(18,2),
    devoluciones    DECIMAL(18,2),
    importe_neto    DECIMAL(18,2),
    PRIMARY KEY (year, month, impuesto)
);

-- Plan de ingresos (SEPG + SS)
-- capitulo: 1=Imp.directos 2=Imp.indirectos 3=Tasas 4=Transf.corrientes
--           5=Ingresos patrimoniales 6=Enajenación activos reales
--           7=Transf.capital 8=Activos financieros 9=Pasivos financieros
-- articulo/concepto NULL = fila de totales de ese capítulo/artículo
CREATE TABLE IF NOT EXISTS ingresos_plan (
    year        INTEGER NOT NULL,
    entidad     VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    articulo    INTEGER,
    concepto    INTEGER,
    descripcion VARCHAR,
    importe     DECIMAL(18,2)
);

-- Ejecución de ingresos (IGAE)
CREATE TABLE IF NOT EXISTS ingresos_ejecucion (
    year                    INTEGER NOT NULL,
    entidad                 VARCHAR NOT NULL,
    capitulo                INTEGER NOT NULL,
    articulo                INTEGER,
    concepto                INTEGER,
    descripcion             VARCHAR,
    derechos_reconocidos    DECIMAL(18,2),
    recaudacion_neta        DECIMAL(18,2)
);

-- Plan de gastos (SEPG + SS)
-- capitulo: 1=Personal 2=Bienes corrientes 3=Gastos financieros
--           4=Transf.corrientes 6=Inversiones reales 7=Transf.capital
--           8=Activos financieros 9=Pasivos financieros
CREATE TABLE IF NOT EXISTS gastos_plan (
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
    importe       DECIMAL(18,2)
);

-- Ejecución de gastos (IGAE)
CREATE TABLE IF NOT EXISTS gastos_ejecucion (
    year                        INTEGER NOT NULL,
    entidad                     VARCHAR NOT NULL,
    seccion_cod                 VARCHAR,
    seccion_nom                 VARCHAR,
    programa_cod                VARCHAR,
    programa_nom                VARCHAR,
    capitulo                    INTEGER NOT NULL,
    articulo                    INTEGER,
    concepto                    INTEGER,
    descripcion                 VARCHAR,
    creditos_iniciales          DECIMAL(18,2),
    creditos_definitivos        DECIMAL(18,2),
    obligaciones_reconocidas    DECIMAL(18,2),
    pagos_ordenados             DECIMAL(18,2)
);

-- Transferencias del Estado a cada CCAA (derivadas del PGE, arts. 46/76)
-- tipo: 'corriente' | 'capital' | 'fci' | 'ue'
-- fuente: 'plan' | 'ejecucion'
CREATE TABLE IF NOT EXISTS transferencias_ccaa (
    year      INTEGER NOT NULL,
    ccaa_cod  VARCHAR NOT NULL,
    ccaa_nom  VARCHAR NOT NULL,
    tipo      VARCHAR NOT NULL,
    fuente    VARCHAR NOT NULL,
    importe   DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, tipo, fuente)
);

-- Presupuesto de ingresos de cada CCAA (Mº Hacienda consolidado)
CREATE TABLE IF NOT EXISTS ccaa_ingresos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);

-- Presupuesto de gastos de cada CCAA (Mº Hacienda consolidado)
CREATE TABLE IF NOT EXISTS ccaa_gastos (
    year        INTEGER NOT NULL,
    ccaa_cod    VARCHAR NOT NULL,
    capitulo    INTEGER NOT NULL,
    descripcion VARCHAR,
    fuente      VARCHAR NOT NULL,
    importe     DECIMAL(18,2),
    PRIMARY KEY (year, ccaa_cod, capitulo, fuente)
);

-- Gasto por función COFOG (Eurostat gov_10a_exp, España)
-- sector: 'S13'=AAPP, 'S1311'=Estado, 'S1312'=CCAA, 'S1313'=CCLL, 'S1314'=SS
-- cofog_cod: 'GF01'...'GF10'  |  importe en M€
CREATE TABLE IF NOT EXISTS gastos_funcion (
    year       INTEGER NOT NULL,
    sector     VARCHAR NOT NULL,
    cofog_cod  VARCHAR NOT NULL,
    cofog_nom  VARCHAR NOT NULL,
    importe    DECIMAL(18,2),
    PRIMARY KEY (year, sector, cofog_cod)
);

-- Recaudación IVA por tipo impositivo (AEAT Modelo 390 agregado nacional)
-- tipo: 'general' (21%), 'reducido' (10%), 'superreducido' (4%)  |  M€
CREATE TABLE IF NOT EXISTS recaudacion_iva_tipo (
    year             INTEGER NOT NULL,
    tipo             VARCHAR NOT NULL,
    base_imponible   DECIMAL(18,2),
    cuota_devengada  DECIMAL(18,2),
    PRIMARY KEY (year, tipo)
);

-- Gastos por política de gasto PGE consolidado (SEPG, hoja 141)
-- Clasif. funcional: Pensiones, Defensa, Sanidad, Educación, etc.  |  M€
CREATE TABLE IF NOT EXISTS gastos_politica (
    year         INTEGER NOT NULL,
    politica_nom VARCHAR NOT NULL,
    importe      DECIMAL(18,2),
    PRIMARY KEY (year, politica_nom)
);

-- Cuentas AAPP SEC2010 — ingresos (Eurostat gov_10a_main, España)
-- subsector: 'S13'=AAPP, 'S1311'=Estado, 'S1312'=CCAA, 'S1313'=CCLL, 'S1314'=SS
-- concepto: 'total','impuestos_produccion','impuestos_renta','cotizaciones',
--           'rentas_propiedad','transferencias_corrientes','transferencias_capital'
CREATE TABLE IF NOT EXISTS aapp_ingresos (
    year         INTEGER NOT NULL,
    subsector    VARCHAR NOT NULL,
    concepto     VARCHAR NOT NULL,
    concepto_nom VARCHAR NOT NULL,
    importe      DECIMAL(18,2),
    PRIMARY KEY (year, subsector, concepto)
);

-- Cuentas AAPP SEC2010 — gastos (Eurostat gov_10a_main, España)
-- concepto: 'total','remuneracion_empleados','consumos_intermedios','subvenciones',
--           'intereses','prestaciones_sociales','transferencias_corrientes',
--           'transferencias_capital','fbcf','saldo'
CREATE TABLE IF NOT EXISTS aapp_gastos (
    year         INTEGER NOT NULL,
    subsector    VARCHAR NOT NULL,
    concepto     VARCHAR NOT NULL,
    concepto_nom VARCHAR NOT NULL,
    importe      DECIMAL(18,2),
    PRIMARY KEY (year, subsector, concepto)
);

-- PIB a precios corrientes (Eurostat nama_10_gdp, B1GQ, CP_MEUR)
CREATE TABLE IF NOT EXISTS pib_anual (
    year  INTEGER PRIMARY KEY,
    pib   DECIMAL(18,2)
);

-- Pensiones contributivas SS (mites.gob.es BEL PEN-3, serie anual)
-- tipo: 'jubilacion', 'incapacidad', 'viudedad', 'orfandad', 'favor_familiar'
-- importe_total: M€/mes  |  pension_media: €/mes
CREATE TABLE IF NOT EXISTS pensiones_ss (
    year           INTEGER NOT NULL,
    tipo           VARCHAR NOT NULL,
    num_pensiones  INTEGER,
    importe_total  DECIMAL(18,2),
    pension_media  DECIMAL(10,2),
    PRIMARY KEY (year, tipo)
);
"""

_VIEWS = """
-- Gastos plan a nivel capítulo por sección
CREATE OR REPLACE VIEW v_gastos_plan_capitulo AS
SELECT year, entidad, seccion_cod, seccion_nom, capitulo,
       SUM(importe) AS importe
FROM gastos_plan
WHERE articulo IS NULL
GROUP BY ALL;

-- Gastos plan a nivel sección (total)
CREATE OR REPLACE VIEW v_gastos_plan_seccion AS
SELECT year, entidad, seccion_cod, seccion_nom,
       SUM(importe) AS importe
FROM gastos_plan
WHERE articulo IS NULL AND programa_cod IS NULL
GROUP BY ALL;

-- Ingresos plan a nivel capítulo
CREATE OR REPLACE VIEW v_ingresos_plan_capitulo AS
SELECT year, entidad, capitulo, descripcion,
       SUM(importe) AS importe
FROM ingresos_plan
WHERE articulo IS NULL
GROUP BY ALL;

-- Totales de transferencias por CCAA y año
CREATE OR REPLACE VIEW v_transferencias_ccaa_total AS
SELECT year, ccaa_cod, ccaa_nom, fuente,
       SUM(importe)                                             AS total,
       SUM(CASE WHEN tipo = 'corriente' THEN importe ELSE 0 END) AS corriente,
       SUM(CASE WHEN tipo = 'capital'   THEN importe ELSE 0 END) AS capital,
       SUM(CASE WHEN tipo = 'fci'       THEN importe ELSE 0 END) AS fci,
       SUM(CASE WHEN tipo = 'ue'        THEN importe ELSE 0 END) AS ue
FROM transferencias_ccaa
GROUP BY ALL;

-- Resumen CCAA: ingresos + gastos por año
CREATE OR REPLACE VIEW v_ccaa_resumen AS
SELECT g.year, g.ccaa_cod, r.ccaa_nom,
       SUM(CASE WHEN g.fuente = 'plan'      THEN g.importe ELSE 0 END) AS gastos_plan,
       SUM(CASE WHEN g.fuente = 'ejecucion' THEN g.importe ELSE 0 END) AS gastos_ejec,
       i.ingresos_plan,
       i.ingresos_ejec
FROM ccaa_gastos g
JOIN (
    SELECT year, ccaa_cod,
           SUM(CASE WHEN fuente = 'plan'      THEN importe ELSE 0 END) AS ingresos_plan,
           SUM(CASE WHEN fuente = 'ejecucion' THEN importe ELSE 0 END) AS ingresos_ejec
    FROM ccaa_ingresos
    GROUP BY ALL
) i USING (year, ccaa_cod)
JOIN ccaa_ref r USING (ccaa_cod)
GROUP BY ALL;
"""

_CCAA_REF = [
    ("AN", "Andalucía",               "Sevilla"),
    ("AR", "Aragón",                  "Zaragoza"),
    ("AS", "Asturias",                "Oviedo"),
    ("IB", "Illes Balears",           "Palma"),
    ("CN", "Canarias",                "Las Palmas / S/C de Tenerife"),
    ("CB", "Cantabria",               "Santander"),
    ("CL", "Castilla y León",         "Valladolid"),
    ("CM", "Castilla-La Mancha",      "Toledo"),
    ("CT", "Catalunya",               "Barcelona"),
    ("VC", "Comunitat Valenciana",    "Valencia"),
    ("EX", "Extremadura",             "Mérida"),
    ("GA", "Galicia",                 "Santiago de Compostela"),
    ("MD", "Comunidad de Madrid",     "Madrid"),
    ("MC", "Región de Murcia",        "Murcia"),
    ("NC", "Comunidad Foral de Navarra", "Pamplona"),
    ("PV", "País Vasco",              "Vitoria-Gasteiz"),
    ("RI", "La Rioja",                "Logroño"),
    ("CE", "Ceuta",                   "Ceuta"),
    ("ME", "Melilla",                 "Melilla"),
]


def create_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(_DDL)
    conn.execute(_VIEWS)
    _seed_ccaa_ref(conn)
    console.print("[green]Schema creado correctamente.[/green]")


def _seed_ccaa_ref(conn: duckdb.DuckDBPyConnection) -> None:
    for cod, nom, capital in _CCAA_REF:
        conn.execute(
            "INSERT OR REPLACE INTO ccaa_ref VALUES (?, ?, ?)",
            [cod, nom, capital],
        )


# ---------------------------------------------------------------------------
# Helpers de escritura
# ---------------------------------------------------------------------------

def upsert(
    conn: duckdb.DuckDBPyConnection,
    table: str,
    df: pd.DataFrame,
    delete_where: str | None = None,
) -> int:
    """
    Inserta filas en `table` desde un DataFrame.

    Si se proporciona `delete_where` (ej. "year = 2023 AND entidad = 'Estado'"),
    elimina las filas coincidentes antes de insertar para evitar duplicados.

    Devuelve el número de filas insertadas.
    """
    if df.empty:
        return 0
    if delete_where:
        conn.execute(f"DELETE FROM {table} WHERE {delete_where}")
    conn.register("_insert_tmp", df)
    conn.execute(f"INSERT INTO {table} SELECT * FROM _insert_tmp")
    conn.unregister("_insert_tmp")
    return len(df)


def row_counts(conn: duckdb.DuckDBPyConnection) -> dict[str, int]:
    tables = conn.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'main' AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    ).fetchall()
    return {
        row[0]: conn.execute(f"SELECT COUNT(*) FROM {row[0]}").fetchone()[0]
        for row in tables
    }
