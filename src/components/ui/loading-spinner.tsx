import { labelFor } from "@/lib/ui-labels";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className = "" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin border-2 border-blue-500 border-t-transparent rounded-full ${sizeClasses[size]}`} />
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ message, icon = "📭", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <p className="text-gray-500 text-sm mb-4">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  retry?: () => void;
}

export function ErrorState({ message, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">⚠️</span>
      <p className="text-red-400 text-sm mb-4">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
        >
          重试
        </button>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const statusStyles: Record<string, string> = {
    active: "bg-green-900/50 text-green-300",
    completed: "bg-green-900/50 text-green-300",
    success: "bg-green-900/50 text-green-300",
    running: "bg-blue-900/50 text-blue-300",
    pending: "bg-gray-800 text-gray-400",
    failed: "bg-red-900/50 text-red-300",
    error: "bg-red-900/50 text-red-300",
    disabled: "bg-gray-800 text-gray-500",
    warning: "bg-yellow-900/50 text-yellow-300",
    critical: "bg-red-900/50 text-red-300",
    info: "bg-blue-900/50 text-blue-300",
  };

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };

  return (
    <span className={`rounded ${statusStyles[status] || "bg-gray-800 text-gray-400"} ${sizeClasses[size]}`}>
      {labelFor(status)}
    </span>
  );
}

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function Card({ children, title, subtitle, action, className = "" }: CardProps) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-sm font-medium text-gray-300">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
