import type { JourneyRequest } from "@mobility/contracts";
import { expect, it } from "vitest";
import { journeyModePolicy } from "./routing";

it.each([
  {
    modes: ["TRANSIT"],
    policy: { allowTransit: true, allowWalkingOnly: false },
  },
  { modes: ["WALK"], policy: { allowTransit: false, allowWalkingOnly: true } },
  {
    modes: ["TRANSIT", "WALK"],
    policy: { allowTransit: true, allowWalkingOnly: true },
  },
  {
    modes: ["WALK", "TRANSIT", "WALK"],
    policy: { allowTransit: true, allowWalkingOnly: true },
  },
] satisfies { modes: JourneyRequest["modes"]; policy: object }[])(
  "resolves policy for $modes",
  ({ modes, policy }) => {
    expect(journeyModePolicy(modes)).toEqual(policy);
  },
);
it.each<{ modes: JourneyRequest["modes"] }>([
  { modes: [] },
  { modes: ["BIKE"] },
  { modes: ["CAR"] },
  { modes: ["TRANSIT", "BIKE"] },
])("does not silently drop unsupported modes $modes", ({ modes }) => {
  expect(journeyModePolicy(modes)).toBeNull();
});
