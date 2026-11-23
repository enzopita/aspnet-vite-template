#!/usr/bin/env node
// Verifies that generated artifacts match their sources (ADR 0007). Run after regenerating them:
//   dotnet build src/App.Api      → web/openapi/app.json
//   pnpm --dir web api:generate      → web/src/lib/api/gen/
//   pnpm --dir web build             → web/src/app/route-tree.gen.ts
import { execFileSync } from "node:child_process";

const paths = ["web/openapi", "web/src/lib/api/gen", "web/src/app/route-tree.gen.ts"];

const run = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const changed = run(["status", "--porcelain", "--", ...paths]);

if (changed) {
  console.error("✖ Generated artifacts are out of date:\n");
  console.error(
    changed
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );
  console.error("\n  Regenerate (dotnet build src/App.Api && pnpm --dir web api:generate && pnpm --dir web build),");
  console.error("  review the diff and commit it. Never edit generated files by hand.\n");
  process.exit(1);
}
