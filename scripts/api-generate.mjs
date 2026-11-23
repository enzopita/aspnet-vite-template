#!/usr/bin/env node
// Runs Kubb API client generation followed by oxfmt, retrying briefly on Windows ERROR_USER_MAPPED_FILE (os error 1224).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const webDir = resolve(import.meta.dirname, "..", "web");

const kubb = spawnSync("pnpm exec kubb generate", {
  cwd: webDir,
  shell: true,
  stdio: "inherit",
  env: { ...process.env, KUBB_DISABLE_TELEMETRY: "1" },
});
if (kubb.status !== 0) process.exit(kubb.status ?? 1);

const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
const maxAttempts = 5;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const fmt = spawnSync("pnpm exec oxfmt src/lib/api/gen", {
    cwd: webDir,
    shell: true,
    encoding: "utf8",
  });

  if (fmt.status === 0) {
    if (fmt.stdout) process.stdout.write(fmt.stdout);
    if (fmt.stderr) process.stderr.write(fmt.stderr);
    process.exit(0);
  }

  const combined = `${fmt.stdout ?? ""}${fmt.stderr ?? ""}`;
  const isTransientWinMapLock = process.platform === "win32" && combined.includes("os error 1224");
  if (isTransientWinMapLock && attempt < maxAttempts) {
    Atomics.wait(sleepBuf, 0, 0, 300 * attempt);
    continue;
  }

  if (fmt.stdout) process.stdout.write(fmt.stdout);
  if (fmt.stderr) process.stderr.write(fmt.stderr);
  process.exit(fmt.status ?? 1);
}
