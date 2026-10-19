import { motion } from "motion/react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { Finding } from "../types";
import { EASE_OUT } from "../lib/motion";

interface Props {
  findings: Finding[];
  title?: string;
  intro?: string;
}

const STYLE = {
  positive: { icon: CircleCheck, color: "text-positive", chip: "bg-positive/12", label: "Within target" },
  caution: { icon: TriangleAlert, color: "text-caution", chip: "bg-caution/12", label: "Worth attention" },
  info: { icon: Info, color: "text-info", chip: "bg-info/12", label: "Observation" },
} as const;

export function FindingsPanel({ findings, title = "What the results mean", intro }: Props) {
  return (
    <section aria-labelledby="findings-title">
      <h3 id="findings-title" className="text-xl font-semibold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-3">
        {intro ?? "Written by fixed threshold rules from this run's measured values. Each statement lists the numbers it is based on."}
      </p>
      {findings.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No findings for this run.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {findings.map((f, i) => {
            const s = STYLE[f.category];
            const Icon = s.icon;
            return (
              <motion.li
                key={f.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: (i % 2) * 0.06, ease: EASE_OUT }}
                className="panel flex gap-3.5 p-4"
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${s.chip}`}>
                  <Icon size={16} className={s.color} aria-label={s.label} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{f.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{f.description}</p>
                  {f.evidence.length > 0 && (
                    <dl className="mt-3 flex flex-wrap gap-1.5">
                      {f.evidence.map((e, j) => (
                        <div key={j} className="flex gap-1.5 rounded-full bg-raised px-2.5 py-1 text-xs">
                          <dt className="text-ink-3">{e.label}</dt>
                          <dd className="num font-medium text-ink">{e.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
