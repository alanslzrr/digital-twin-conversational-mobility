import { expect, it } from "vitest";
import {
  canonicalLocalEvaluationUrl,
  evaluationLoginError,
} from "./evaluation-login";

it("points localhost users to the canonical origin without forwarding their session URL", () => {
  expect(
    canonicalLocalEvaluationUrl(
      "http://localhost:3000/s/private-session?key=private",
    ),
  ).toBe("http://127.0.0.1:3000/evaluation");
  expect(
    canonicalLocalEvaluationUrl("http://127.0.0.1:3000/evaluation"),
  ).toBeNull();
});
it("does not rewrite remote or independently configured origins", () => {
  expect(
    canonicalLocalEvaluationUrl("https://example.com/evaluation"),
  ).toBeNull();
  expect(
    canonicalLocalEvaluationUrl("http://localhost:3010/evaluation"),
  ).toBeNull();
});
it("distinguishes origin, rate limit, service outage and credentials", () => {
  expect(evaluationLoginError(403)).toContain("Origen");
  expect(evaluationLoginError(429)).toContain("Límite");
  expect(evaluationLoginError(503)).toContain("temporalmente");
  expect(evaluationLoginError(401)).toContain("credenciales");
});
