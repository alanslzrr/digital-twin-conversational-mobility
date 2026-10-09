import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationCaller } from "./evaluation-caller";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), runtime: vi.fn() }));
vi.mock("./evaluator-auth", () => ({ readIdentity: mocks.identity }));
vi.mock("./control-client", () => ({ runtimeControl: mocks.runtime }));
const principalId = "11111111-1111-4111-8111-111111111111";
const selectionId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  mocks.identity.mockResolvedValue({ principalId, label: "Fixture" });
  mocks.runtime.mockResolvedValue({ ok: true });
});
describe("trusted selection at EVE authentication", () => {
  it.each([
    ["/api/session", { message: "hello" }, undefined],
    [
      "/api/session/existing",
      { inputResponses: [{ id: "approval", value: true }] },
      "existing",
    ],
  ])(
    "validates selection for %s including continuations that skip onMessage",
    async (path, body, sessionId) => {
      const caller = await evaluationCaller(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "x-mobai-selection": selectionId },
          body: JSON.stringify(body),
        }),
      );
      expect(caller).toMatchObject({
        principalId,
        attributes: { mobaiSelectionId: selectionId },
      });
      expect(mocks.runtime).toHaveBeenCalledWith({
        action: "selection.validate",
        principalId,
        selectionId,
        ...(sessionId ? { sessionId } : {}),
      });
    },
  );
  it("does not authorize a selection without a session identity", async () => {
    mocks.identity.mockResolvedValue(null);
    expect(
      await evaluationCaller(
        new Request("http://localhost/api/session", {
          method: "POST",
          headers: { "x-mobai-selection": selectionId },
        }),
      ),
    ).toBeNull();
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it("does not gate reads, cancellation or previous-model compaction on a new payer", async () => {
    for (const path of [
      "/api/session/existing/cancel",
      "/api/session/existing/compact",
    ])
      expect(
        await evaluationCaller(
          new Request(`http://localhost${path}`, {
            method: "POST",
            headers: { "x-mobai-selection": selectionId },
          }),
        ),
      ).toMatchObject({ principalId, attributes: {} });
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it("fails closed when Core rejects a forged selection", async () => {
    mocks.runtime.mockRejectedValue(new Error("access_denied"));
    await expect(
      evaluationCaller(
        new Request("http://localhost/api/session/existing", {
          method: "POST",
          headers: { "x-mobai-selection": selectionId },
        }),
      ),
    ).rejects.toThrow("access_denied");
  });
});
