"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: number | null;
  format: (value: number) => string;
  className?: string;
}

/** Exact current text with an optional whole-value update animation, not a digit reel. */
export function AnimatedValue({ value, format, className }: Props) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(value);
  const animation = useRef<Animation | null>(null);
  const valid = value !== null && Number.isFinite(value) ? value : null;
  const text = valid === null ? "—" : format(valid);

  useEffect(() => {
    const before = previous.current;
    previous.current = valid;
    animation.current?.cancel();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (
      before === null ||
      valid === null ||
      before === valid ||
      reduce.matches ||
      !node.current?.animate
    )
      return;
    animation.current = node.current.animate(
      [
        {
          opacity: 1,
          transform: `translateY(${valid > before ? 2 : -2}px)`,
        },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    const stop = () => {
      if (reduce.matches) animation.current?.cancel();
    };
    reduce.addEventListener("change", stop);
    return () => {
      animation.current?.cancel();
      reduce.removeEventListener("change", stop);
    };
  }, [valid]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={node} aria-hidden="true" className="dc-animated-value">
        {text}
      </span>
    </span>
  );
}
