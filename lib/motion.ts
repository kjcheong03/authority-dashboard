/* ───────────────────────────────────────────────────────────────────────────
 * Shared motion language — one consistent reveal across every panel so streamed
 * data flows in as a single choreographed sequence (no abrupt pop-ins).
 * ─────────────────────────────────────────────────────────────────────────── */

import type { Transition, Variants } from "framer-motion";

// Soft, slightly-overshooting ease (easeOutExpo-ish) used everywhere.
export const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];

/** Standard item reveal: fade up. Spread onto any motion element. */
export const reveal = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.42, ease: EASE },
} as const;

/** Quieter reveal for dense / secondary rows (log lines, chips, timeline steps). */
export const revealSoft = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE },
} as const;

/** Container that staggers its motion children as they mount. */
export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.06 } },
};
