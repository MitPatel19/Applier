"use client";

import * as React from "react";
import { MotionConfig, motion } from "motion/react";

/**
 * Fades content in as it scrolls into view. `reducedMotion="user"` makes motion skip the
 * translate for people who prefer reduced motion (only a quick opacity fade remains).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
}) {
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <MotionConfig reducedMotion="user">
      <Comp
        className={className}
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -12% 0px" }}
        transition={{ duration: 0.55, delay, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {children}
      </Comp>
    </MotionConfig>
  );
}
