import assert from "node:assert/strict";
import test from "node:test";
import { validatePullRequest, verifyIssueLinks } from "./check-pr-policy.mjs";

const repository = "alanslzrr/digital-twin-conversational-mobility";
const body = `## Related issue
Closes #53
## Summary
Enforce PR governance.
## Motivation
Make release decisions explicit.
## Changes
Validate metadata only.
## Commit breakdown
abc1234 feat(ci): validate metadata.
## Validation
Offline tests passed.
## Risks and review notes
No deployment.
## Release decision
- [ ] Release required
- [x] No release required
Rationale: Documentation only.
`;

test("accepts complete issue-linked PR without a release", () => {
  assert.deepEqual(validatePullRequest(body, repository), {
    errors: [],
    issues: [53],
  });
});
test("accepts a full same-repository issue URL and a stable release version", () => {
  const text = body
    .replace("#53", `https://github.com/${repository}/issues/53`)
    .replace("[ ] Release required", "[x] Release required")
    .replace("[x] No release required", "[ ] No release required");
  assert.equal(
    validatePullRequest(
      `${text}\nTarget version: v0.1.0\nRelease notes: docs/releases/v0.1.0.md`,
      repository,
    ).errors.length,
    0,
  );
});
test("rejects absent and cross-repository issues", () => {
  for (const reference of [
    "#0",
    "other/project#53",
    "https://github.com/other/project/issues/53",
  ]) {
    assert.ok(
      validatePullRequest(body.replace("#53", reference), repository).errors
        .length,
    );
  }
});
test("requires exactly one release decision", () => {
  for (const text of [
    body.replace("[ ] Release required", "[x] Release required"),
    body.replace("[x] No release required", "[ ] No release required"),
  ]) {
    assert.ok(
      validatePullRequest(text, repository).errors.some((s) =>
        s.includes("exactly one"),
      ),
    );
  }
});
test("requires rationale, sections and a version for releases", () => {
  assert.ok(
    validatePullRequest(
      body.replace("Rationale: Documentation only.", "Rationale: TODO"),
      repository,
    ).errors.length,
  );
  assert.ok(
    validatePullRequest(body.replace("## Validation", "## Other"), repository)
      .errors.length,
  );
  const text = body
    .replace("[ ] Release required", "[x] Release required")
    .replace("[x] No release required", "[ ] No release required");
  assert.ok(
    validatePullRequest(text, repository).errors.some((s) =>
      s.includes("Target version"),
    ),
  );
});
test("ignores comments, fenced examples and block quotes as evidence", () => {
  for (const text of [
    `<!--\n${body}\n-->`,
    `\`\`\`md\n${body}\`\`\`\n`,
    body
      .split("\n")
      .map((s) => `> ${s}`)
      .join("\n"),
  ]) {
    assert.ok(validatePullRequest(text, repository).errors.length);
  }
});
test("rejects missing issues and PRs posing as issues", async () => {
  assert.equal(
    (
      await verifyIssueLinks([53], repository, async () => ({
        ok: true,
        json: async () => ({ number: 53 }),
      }))
    ).length,
    0,
  );
  assert.equal(
    (
      await verifyIssueLinks([53], repository, async () => ({
        ok: true,
        json: async () => ({ number: 53, pull_request: {} }),
      }))
    ).length,
    1,
  );
  assert.equal(
    (
      await verifyIssueLinks([53], repository, async () => ({
        ok: false,
        status: 404,
      }))
    ).length,
    1,
  );
});
