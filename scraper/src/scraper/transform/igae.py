"""Transformaciones para datos IGAE (ejecución presupuestaria)."""

from __future__ import annotations

import pandas as pd


def normalize_gastos(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["year"] = df["year"].astype(int)
    df["entidad"] = df["entidad"].astype(object)
    df["capitulo"] = df["capitulo"].astype(int)
    for col in ("seccion_cod", "seccion_nom", "programa_cod", "programa_nom", "descripcion"):
        df[col] = df[col].astype(object)
    for col in ("articulo", "concepto"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        df[col] = df[col].where(df[col].notna(), other=None).astype(object)
    for col in ("creditos_iniciales", "creditos_definitivos", "obligaciones_reconocidas", "pagos_ordenados"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.drop_duplicates(subset=["year", "entidad", "capitulo"], keep="last")
    cols = [
        "year", "entidad", "seccion_cod", "seccion_nom", "programa_cod", "programa_nom",
        "capitulo", "articulo", "concepto", "descripcion",
        "creditos_iniciales", "creditos_definitivos", "obligaciones_reconocidas", "pagos_ordenados",
    ]
    return df[cols].reset_index(drop=True)


def normalize_ingresos(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["year"] = df["year"].astype(int)
    df["entidad"] = df["entidad"].astype(object)
    df["capitulo"] = df["capitulo"].astype(int)
    for col in ("descripcion",):
        df[col] = df[col].astype(object)
    for col in ("articulo", "concepto"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        df[col] = df[col].where(df[col].notna(), other=None).astype(object)
    for col in ("derechos_reconocidos", "recaudacion_neta"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.drop_duplicates(subset=["year", "entidad", "capitulo"], keep="last")
    cols = ["year", "entidad", "capitulo", "articulo", "concepto", "descripcion",
            "derechos_reconocidos", "recaudacion_neta"]
    return df[cols].reset_index(drop=True)
