import { RotateCw, ServerOff, TriangleAlert } from "lucide-react";
import type { ApiError } from "../api/client";
import { humanField } from "../lib/format";

interface Props {
  error: ApiError;
  onRetry?: () => void;
  validationHint?: string;
}

export function StatusBanner({ error, onRetry, validationHint }: Props) {
  if (error.isOffline) {
    return (
      <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
        <ServerOff size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">Simulator backend unavailable</div>
          <div className="text-ink-2">{error.message}</div>
        </div>
        {onRetry && (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            <RotateCw size={15} aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-lg border border-caution/50 bg-caution/10 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{error.message}</div>
          {error.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-ink-2">
              {error.errors.map((e, i) => (
                <li key={i}>
                  <span className="text-ink">{humanField(e.field)}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
          {validationHint && error.errors.length > 0 && <div className="mt-1.5 text-xs text-ink-3">{validationHint}</div>}
        </div>
        {onRetry && error.errors.length === 0 && (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            <RotateCw size={15} aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
