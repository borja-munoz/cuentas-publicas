export const PALETTE = {
  accent:     '#B82A2A',  // rojo editorial — plan, primer dato, color de marca
  accentAlt:  '#C89B3C',  // ocre — ejecución, segundo dato
  accentDark: '#7a1a1a',  // rojo oscuro — hover, bordes activos
  positive:   '#1F7A3D',  // verde — superávit, tendencia favorable
  negative:   '#B82A2A',  // déficit, tendencia desfavorable (=accent)
  ink:        '#1a1a1a',
  inkMuted:   '#666666',
  inkFaint:   '#999999',
  rule:       '#e8e8e8',
  surface:    '#fafaf8',
  paper:      '#FAF7F2',
} as const

// Paleta categórica para series múltiples (gráficas con 3+ líneas o barras)
export const CATEGORICAL: readonly string[] = [
  '#B82A2A',
  '#C89B3C',
  '#5C6F7E',
  '#7E9E8B',
  '#8B6B7A',
  '#9A6B3C',
  '#4A7A8B',
  '#999999',
]
