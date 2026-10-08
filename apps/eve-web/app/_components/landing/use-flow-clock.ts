"use client";

import { useMotionValue, useMotionValueEvent } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createFlowClock, flowPhase } from "./flow-clock";

const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(update: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function useLandingReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

export function useFlowClock() {
  const root = useRef<HTMLElement>(null);
  const elapsed = useMotionValue(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const reduced = useLandingReducedMotion();
  const clock = useMemo(
    () =>
      createFlowClock(
        {
          request: (frame) => window.requestAnimationFrame(frame),
          cancel: (id) => window.cancelAnimationFrame(id),
          now: () => performance.now(),
        },
        (time) => elapsed.set(time),
      ),
    [elapsed],
  );

  useMotionValueEvent(elapsed, "change", (time) =>
    setPhase(flowPhase(time).index),
  );
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.1 },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      clock.dispose();
    };
  }, [clock]);
  useEffect(() => {
    if (playing && inView && pageVisible && !reduced) clock.play();
    else clock.pause();
    return () => clock.pause();
  }, [clock, playing, inView, pageVisible, reduced]);

  return {
    root,
    elapsed,
    phase,
    playing,
    reduced,
    toggle: () => setPlaying((value) => !value),
    select: (index: number) => {
      setPlaying(false);
      clock.seek(index);
    },
  };
}
