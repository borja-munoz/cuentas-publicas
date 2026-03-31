interface LoadingSkeletonProps {
  rows?: number
  className?: string
}

export default function LoadingSkeleton({ rows = 4, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${85 - i * 8}%` }} />
      ))}
    </div>
  )
}

export function ChartSkeleton({ className = '', height = 320 }: { className?: string; height?: number }) {
  return (
    <div className={`animate-pulse rounded bg-gray-100 ${className}`} style={{ height }} />
  )
}
