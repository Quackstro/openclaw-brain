#!/usr/bin/env node

/**
 * Brain 2.0 — CLI entry point for Lobster pipeline steps.
 *
 * Thin wrapper that invokes cli-impl.ts via `npx tsx`.
 * Lobster calls `node cli.mjs <subcommand>` — this forwards
 * all args and stdin/stdout/stderr to the TypeScript implementation.
 *
 * Usage: node cli.mjs <subcommand> [options]
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const implPath = join(__dirname, "cli-impl.ts");

// Forward all args after "cli.mjs" to the TS implementation
const args = process.argv.slice(2);

const child = spawn("npx", ["tsx", implPath, ...args], {
  cwd: __dirname,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

// Forward stdin
if (!process.stdin.isTTY) {
  process.stdin.pipe(child.stdin);
} else {
  child.stdin.end();
}

// Forward stdout/stderr
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on("close", (code) => {
  process.exit(code ?? 0);
});
