import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
          <div className="max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow">
            <p className="text-4xl">⚠️</p>
            <h2 className="mt-4 text-xl font-bold text-gray-800">
              No se pudo cargar la base de datos
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              El motor de consultas (DuckDB WASM) no se ha podido inicializar. Comprueba tu conexión
              a internet o prueba con Chrome o Firefox actualizados.
            </p>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs text-gray-400">Detalle técnico</summary>
              <pre className="mt-2 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-600">
                {this.state.message}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
