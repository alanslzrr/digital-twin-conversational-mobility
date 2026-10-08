export const FLOW_STARTS = [0, 2_400, 4_800, 10_400, 12_800] as const;
export const FLOW_DURATION = 16_000;

export function flowPhase(elapsed: number) {
  const time = ((elapsed % FLOW_DURATION) + FLOW_DURATION) % FLOW_DURATION;
  const index = FLOW_STARTS.filter((start) => time >= start).length - 1;
  const end = FLOW_STARTS[index + 1] ?? FLOW_DURATION;
  const start = FLOW_STARTS[index] ?? 0;
  return { index, progress: (time - start) / (end - start) };
}

type Frame = (time: number) => void;
type Scheduler = {
  request: (frame: Frame) => number;
  cancel: (id: number) => void;
  now: () => number;
};

/** One visible-time clock, not simulated requests or measured performance. */
export function createFlowClock(
  scheduler: Scheduler,
  publish: (elapsed: number) => void,
) {
  let elapsed = 0;
  let previous = 0;
  let frame: number | null = null;
  let running = false;
  function tick(time: number) {
    if (!running) return;
    elapsed = (elapsed + Math.max(0, time - previous)) % FLOW_DURATION;
    previous = time;
    publish(elapsed);
    if (running) frame = scheduler.request(tick);
  }
  function pause() {
    running = false;
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
  }
  return {
    play() {
      if (running) return;
      running = true;
      previous = scheduler.now();
      frame = scheduler.request(tick);
    },
    pause,
    seek(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= FLOW_STARTS.length)
        return;
      pause();
      elapsed = FLOW_STARTS[index] ?? 0;
      publish(elapsed);
    },
    dispose: pause,
  };
}

/** A visual exchange, not request rates or measured timing. Edges 2/3 overlap. */
export function flowPacket(elapsed: number, edge: number, packet: number) {
  const phase = flowPhase(elapsed).index;
  const active =
    [
      [0, 4],
      [0, 1, 2, 3, 4],
      [1, 2, 3],
      [2, 3],
    ][edge]?.includes(phase) ?? false;
  const returning = edge === 0 ? phase === 4 : packet % 2 === 1;
  const travel = ((elapsed + packet * 390 + edge * 180) % 1_600) / 1_600;
  return {
    progress: returning ? 1 - travel : travel,
    returning,
    opacity: active ? Math.min(1, travel * 8, (1 - travel) * 8) : 0,
  };
}
