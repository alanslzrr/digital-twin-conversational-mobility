"use client";

import { motion, useInView } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useLandingReducedMotion } from "./use-flow-clock";

const entrance = { y: [12, 0] };
const resting = { y: 0 };
/** Progressive enhancement: server-rendered content is never hidden. */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.12 });
  const reduced = useLandingReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={visible && !reduced ? entrance : resting}
      transition={{ duration: reduced ? 0 : 0.48, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
