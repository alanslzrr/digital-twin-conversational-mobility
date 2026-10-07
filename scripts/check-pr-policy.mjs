import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function prose(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^`{3}[^\n]*\n[\s\S]*?^`{3}[^\n]*$/gm, "")
    .replace(/^~{3}[^\n]*\n[\s\S]*?^~{3}[^\n]*$/gm, "")
    .replace(/^>.*$/gm, "");
}

function section(body, title) {
  const heading = new RegExp(`^## ${title}\\s*$`, "im");
  const match = heading.exec(body);
  if (!match) return "";
  return body
    .slice(match.index + match[0].length)
    .split(/^## /m)[0]
    .trim();
}

export function validatePullRequest(body, repository) {
  const errors = [];
  if (typeof body !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    return { errors: ["Invalid PR body or repository."], issues: [] };
  }
  const clean = prose(body);
  for (const title of [
    "Summary",
    "Motivation",
    "Changes",
    "Commit breakdown",
    "Validation",
    "Risks and review notes",
  ]) {
    const content = section(clean, title);
    if (!content || /^(?:TODO|TBD|\.\.\.)[.!]?$/i.test(content)) {
      errors.push(`Complete the ${title} section.`);
    }
  }
  const issues = [];
  for (const line of section(clean, "Related issue").split("\n")) {
    const match = /^(?:Closes|Fixes|Resolves|Refs)\s+(\S+)\s*$/i.exec(
      line.trim(),
    );
    if (!match) continue;
    const value = match[1];
    const prefix = `https://github.com/${repository}/issues/`;
    const number = value.startsWith(prefix)
      ? value.slice(prefix.length)
      : value.startsWith("#")
        ? value.slice(1)
        : "";
    if (/^[1-9]\d*$/.test(number) && Number.isSafeInteger(Number(number))) {
      issues.push(Number(number));
    }
  }
  if (!issues.length)
    errors.push(
      "Link a same-repository issue under Related issue using Closes #N or Refs #N.",
    );
  const release = section(clean, "Release decision");
  const required = /^- \[[xX]\] Release required\s*$/m.test(release);
  const skipped = /^- \[[xX]\] No release required\s*$/m.test(release);
  if (required === skipped) errors.push("Check exactly one release decision.");
  const rationale = /^Rationale:\s*(.+)$/m.exec(release)?.[1]?.trim();
  if (!rationale || /^(?:TODO|TBD|\.\.\.)[.!]?$/i.test(rationale)) {
    errors.push("Provide a release rationale.");
  }
  if (
    required &&
    !/^Target version: v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\s*$/m.test(
      release,
    )
  ) {
    errors.push(
      "Provide a stable SemVer Target version when a release is required.",
    );
  }
  if (
    required &&
    !/^Release notes:\s*(?:docs\/releases\/v[^\s]+\.md|https:\/\/github\.com\/[^\s]+)\s*$/m.test(
      release,
    )
  ) {
    errors.push("Link formal release notes when a release is required.");
  }
  return { errors, issues: [...new Set(issues)] };
}

export async function verifyIssueLinks(issues, repository, request) {
  const errors = [];
  for (const number of issues) {
    const response = await request(
      `https://api.github.com/repos/${repository}/issues/${number}`,
    );
    if (!response.ok) {
      errors.push(
        `Issue #${number} could not be verified (HTTP ${response.status}).`,
      );
      continue;
    }
    const issue = await response.json();
    if (issue.pull_request || issue.number !== number) {
      errors.push(`#${number} must refer to an issue, not a pull request.`);
    }
  }
  return errors;
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const repository = process.env.GITHUB_REPOSITORY;
  if (!event.pull_request || event.repository?.full_name !== repository) {
    throw new Error("Expected a pull request event for this repository.");
  }
  const result = validatePullRequest(event.pull_request.body ?? "", repository);
  if (!result.errors.length) {
    const token = process.env.GITHUB_TOKEN;
    if (!token)
      throw new Error(
        "Read-only GitHub token is required to verify issue references.",
      );
    result.errors.push(
      ...(await verifyIssueLinks(result.issues, repository, (url) =>
        fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: AbortSignal.timeout(10_000),
        }),
      )),
    );
  }
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log("PR sections, issue references and release decision verified.");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "PR policy check could not complete; inspect event format and GitHub API access.",
    );
    process.exitCode = 1;
  });
}
