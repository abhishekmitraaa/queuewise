import { motion } from "motion/react";
import { RotateCw, ServerOff, TriangleAlert } from "lucide-react";
import type { ApiError } from "../api/client";
import { humanField } from "../lib/format";
import { EASE_OUT } from "../lib/motion";

interface Props {
  error: ApiError;
  onRetry?: () => void;
  validationHint?: string;
}

export function StatusBanner({ error, onRetry, validationHint }: Props) {
  const offline = error.isOffline;
  const Icon = offline ? ServerOff : TriangleAlert;
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className={`rounded-2xl border px-4 py-3.5 text-sm ${offline ? "border-danger/40 bg-danger/8" : "border-caution/40 bg-caution/8"}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${offline ? "text-danger" : "text-caution"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{offline ? "Simulator backend unavailable" : error.message}</div>
          {offline && <div className="mt-0.5 text-ink-2">{error.message}</div>}
          {!offline && error.errors.length > 0 && (
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
    </motion.div>
  );
}
