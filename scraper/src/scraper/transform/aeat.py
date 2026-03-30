"""Transformaciones para datos AEAT.

La normalización principal (mapeo de nombres de impuestos, cálculo de netos)
se realiza directamente en scrapers/aeat.py durante el parseo de los Excel.
Esta función se reserva para post-procesamiento adicional si fuera necesario.
"""

from __future__ import annotations

import pandas as pd


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Normalización post-parseo del DataFrame de recaudación AEAT.

    Actualmente aplica las siguientes transformaciones:
    - Asegura tipos correctos en cada columna
    - Elimina filas duplicadas por (year, month, impuesto), conservando la última

    Parámetros
    ----------
    df : DataFrame con columnas year, month, impuesto, importe_bruto,
         devoluciones, importe_neto

    Retorna
    -------
    DataFrame normalizado con las mismas columnas.
    """
    if df.empty:
        return df

    df = df.copy()

    # Tipos
    df["year"] = df["year"].astype(int)
    df["month"] = pd.to_numeric(df["month"], errors="coerce").astype("Int64")
    df["impuesto"] = df["impuesto"].astype(str)
    for col in ("importe_bruto", "devoluciones", "importe_neto"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Eliminar duplicados
    df = df.drop_duplicates(subset=["year", "month", "impuesto"], keep="last")

    return df.reset_index(drop=True)
