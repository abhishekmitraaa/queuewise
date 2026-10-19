import { useEffect, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type Variants } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

/** Parent/child variants for staggered reveals of newly arrived results. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
export const riseChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts up to a measured value when results arrive, so the eye registers the new
 * number. Uses a motion value (no React re-render per frame); static under reduced motion.
 */
export function AnimatedNumber({ value, format }: { value: number | null; format: (v: number | null) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce || value === null ? (value ?? 0) : 0);
  const text = useTransform(mv, (v) => format(value === null ? null : v));
  useEffect(() => {
    if (value === null) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span>{text}</motion.span>;
}
