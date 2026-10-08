import { describe, expect, it } from "vitest";
import {
  createFlowClock,
  FLOW_DURATION,
  FLOW_STARTS,
  flowPacket,
  flowPhase,
} from "@/app/_components/landing/flow-clock";

function harness() {
  let now = 0;
  let id = 0;
  const frames = new Map<number, (time: number) => void>();
  const output: number[] = [];
  const clock = createFlowClock(
    {
      now: () => now,
      request: (callback) => {
        frames.set(++id, callback);
        return id;
      },
      cancel: (key) => {
        frames.delete(key);
      },
    },
    (time) => output.push(time),
  );
  return {
    clock,
    output,
    frames,
    advance(ms: number) {
      now += ms;
      const current = [...frames.values()];
      frames.clear();
      for (const callback of current) callback(now);
    },
  };
}
describe("landing illustration clock (no operational data)", () => {
  it("covers all five stages in a 16 second loop", () => {
    expect(FLOW_DURATION).toBe(16_000);
    expect(FLOW_STARTS.map((time) => flowPhase(time).index)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(flowPhase(15_999).index).toBe(4);
    expect(flowPhase(16_000)).toEqual({ index: 0, progress: 0 });
  });
  it("does not advance before play and schedules only one frame", () => {
    const h = harness();
    h.advance(1000);
    expect(h.output).toEqual([]);
    h.clock.play();
    h.clock.play();
    expect(h.frames.size).toBe(1);
    h.advance(4000);
    expect(h.output).toEqual([4000]);
    expect(h.frames.size).toBe(1);
  });
  it("pauses and resumes from elapsed visible time without catching up", () => {
    const h = harness();
    h.clock.play();
    h.advance(2500);
    h.clock.pause();
    expect(h.frames.size).toBe(0);
    h.advance(90_000);
    expect(h.output).toEqual([2500]);
    h.clock.play();
    h.advance(1500);
    expect(h.output).toEqual([2500, 4000]);
  });
  it("manual selection pauses and seeks to the chosen stage", () => {
    const h = harness();
    h.clock.play();
    h.advance(1000);
    h.clock.seek(3);
    expect(h.frames.size).toBe(0);
    expect(h.output.at(-1)).toBe(10400);
    h.advance(40000);
    expect(h.output.at(-1)).toBe(10400);
    h.clock.play();
    h.advance(1000);
    expect(h.output.at(-1)).toBe(11400);
  });
  it("rejects out of range and fractional stages", () => {
    const h = harness();
    for (const n of [-1, 5, 0.5, Number.NaN]) h.clock.seek(n);
    expect(h.output).toEqual([]);
  });
  it("wraps and disposes without a pending callback", () => {
    const h = harness();
    h.clock.play();
    h.advance(17000);
    expect(h.output).toEqual([1000]);
    h.clock.dispose();
    h.clock.dispose();
    h.advance(2000);
    expect(h.frames.size).toBe(0);
    expect(h.output).toEqual([1000]);
  });
  it("does not reschedule when disposed from a subscriber", () => {
    let callback: ((time: number) => void) | undefined;
    let requests = 0;
    const clock = createFlowClock(
      {
        now: () => 0,
        request: (frame) => {
          callback = frame;
          return ++requests;
        },
        cancel: () => {},
      },
      () => clock.dispose(),
    );
    clock.play();
    callback?.(1);
    expect(requests).toBe(1);
  });
});

describe("bidirectional illustrative exchanges", () => {
  it("overlaps stored evidence and planner work with outward and return packets", () => {
    expect(flowPhase(6400).index).toBe(2);
    for (const edge of [1, 2, 3]) {
      expect(flowPacket(6400, edge, 0).opacity).toBeGreaterThan(0);
      expect(flowPacket(6400, edge, 1).opacity).toBeGreaterThan(0);
      expect(flowPacket(6400, edge, 0).returning).toBe(false);
      expect(flowPacket(6400, edge, 1).returning).toBe(true);
    }
  });
  it("returns to the person through chat, without adding provider-to-browser edges", () => {
    expect(flowPacket(13000, 0, 0).returning).toBe(true);
    expect(flowPacket(1000, 0, 0).returning).toBe(false);
    expect(flowPacket(6400, 0, 0).opacity).toBe(0);
    expect(flowPacket(6400, 4, 0).opacity).toBe(0);
  });
});
