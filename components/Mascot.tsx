"use client";

import { motion } from "framer-motion";

export type MascotMood = "calm" | "cheer" | "concerned";

/**
 * ORCA mascot — soft hooded blob with a big white face. Ported 1:1 from the
 * BrainHack ORCA app (lib/Mascot.tsx) so the Authority Dashboard wears the
 * same brand creature in its top nav.
 *   calm      — slow breathing float, closed happy eyes
 *   cheer     — bouncier float, open eyes, bigger smile
 *   concerned — gentle float, open eyes, slight frown (elevated risk)
 */
export default function Mascot({
  size = 160,
  variant = "calm",
  animated = true,
}: {
  size?: number;
  variant?: MascotMood;
  animated?: boolean;
}) {
  const ink = "#1b1b1b";
  const body = "#5b9be8";
  const bodyShade = "#4f8bd6";
  const foot = "#eef4fd";
  const cheek = "#f4a0b4";

  const cheer = variant === "cheer";

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 180 170"
      role="img"
      aria-label="ORCA mascot"
      xmlns="http://www.w3.org/2000/svg"
      animate={
        !animated
          ? undefined
          : cheer
            ? { y: [0, -10, 0], rotate: [-3, 3, -3] }
            : { y: [0, -6, 0], rotate: [-2, 2, -2] }
      }
      transition={{ duration: cheer ? 1.6 : 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="90" cy="156" rx="46" ry="6" fill="#000" opacity="0.08" />

      {/* stub arms (behind the body) */}
      <ellipse cx="34" cy="104" rx="13" ry="16" fill={bodyShade} />
      <ellipse cx="146" cy="104" rx="13" ry="16" fill={bodyShade} />

      {/* rounded blue body / hood */}
      <ellipse cx="90" cy="90" rx="58" ry="60" fill={body} />

      {/* pale feet */}
      <ellipse cx="73" cy="150" rx="13" ry="9" fill={foot} />
      <ellipse cx="107" cy="150" rx="13" ry="9" fill={foot} />

      {/* white face */}
      <ellipse cx="90" cy="84" rx="43" ry="41" fill="#ffffff" />

      {/* cheeks */}
      <ellipse cx="60" cy="96" rx="7" ry="4.5" fill={cheek} opacity="0.8" />
      <ellipse cx="120" cy="96" rx="7" ry="4.5" fill={cheek} opacity="0.8" />

      {/* eyes */}
      {variant === "calm" ? (
        <>
          <path d="M64 84 Q70 78 76 84" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M104 84 Q110 78 116 84" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        </>
      ) : variant === "cheer" ? (
        <>
          <circle cx="70" cy="82" r="4" fill={ink} />
          <circle cx="110" cy="82" r="4" fill={ink} />
          <circle cx="71.4" cy="80.7" r="1.3" fill="#fff" />
          <circle cx="111.4" cy="80.7" r="1.3" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="70" cy="85" r="3.4" fill={ink} />
          <circle cx="110" cy="85" r="3.4" fill={ink} />
          <path d="M64 80 Q69 76 75 78" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M116 80 Q111 76 105 78" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* mouth */}
      {variant === "cheer" ? (
        <path d="M78 96 Q90 112 102 96" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      ) : variant === "concerned" ? (
        <path d="M82 101 Q86 97 90 101 Q94 105 98 101" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M81 98 Q90 107 99 98" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      )}
    </motion.svg>
  );
}
