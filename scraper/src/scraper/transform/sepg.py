"""Transformaciones para datos SEPG (plan presupuestario del Estado)."""

from __future__ import annotations

import pandas as pd


def _base_normalize(df: pd.DataFrame, table_cols: list[str]) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["year"] = df["year"].astype(int)
    df["entidad"] = df["entidad"].astype(object)
    df["capitulo"] = df["capitulo"].astype(int)
    for col in ("articulo", "concepto"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
            df[col] = df[col].where(df[col].notna(), other=None)
            df[col] = df[col].astype(object)
    if "descripcion" in df.columns:
        df["descripcion"] = df["descripcion"].astype(object)
    df["importe"] = pd.to_numeric(df["importe"], errors="coerce")

    # Deduplicar: si hay varios valores para el mismo (year, entidad, capitulo),
    # conservar el más reciente (el último del DataFrame, que proviene del fichero más nuevo)
    key_cols = ["year", "entidad", "capitulo"]
    if "articulo" in df.columns:
        key_cols.append("articulo")
    if "concepto" in df.columns:
        key_cols.append("concepto")
    df = df.drop_duplicates(subset=key_cols, keep="last")

    return df[table_cols].reset_index(drop=True)


def normalize_gastos(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza el DataFrame de gastos_plan para carga en DuckDB."""
    for col in ("seccion_cod", "seccion_nom", "programa_cod", "programa_nom"):
        if col not in df.columns:
            df[col] = None
    cols = [
        "year", "entidad", "seccion_cod", "seccion_nom",
        "programa_cod", "programa_nom",
        "capitulo", "articulo", "concepto", "descripcion", "importe",
    ]
    return _base_normalize(df, cols)


def normalize_ingresos(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza el DataFrame de ingresos_plan para carga en DuckDB."""
    cols = ["year", "entidad", "capitulo", "articulo", "concepto", "descripcion", "importe"]
    return _base_normalize(df, cols)
