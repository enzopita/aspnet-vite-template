// OpenCode V2 guard plugin (ADR 0008). Auto-loaded from `.opencode/plugins/<name>/index.mjs` in OpenCode 2.2+.
import { resolve } from "node:path";
import { evaluateOpenCodeShell, evaluateOpenCodeTool } from "../../../scripts/agents/agent-hook.mjs";

const pluginWorktree = resolve(import.meta.dirname, "..", "..", "..");

export default {
  id: "app-guard",
  /** @param {import("../../../scripts/agents/agent-hook.d.ts").OpenCodePluginContext} ctx */
  async setup(ctx) {
    const baseDir = ctx.location?.directory ?? ctx.directory ?? ctx.worktree ?? ctx.cwd ?? pluginWorktree;
    await ctx.tool.hook("execute.before", async (event) => {
      const dir = event.location?.directory ?? event.directory ?? event.cwd ?? baseDir;
      evaluateOpenCodeTool(event, dir);
    });
    if (ctx.shell?.hook) {
      await ctx.shell.hook("create.before", async (event) => {
        const dir = event.location?.directory ?? event.directory ?? event.cwd ?? baseDir;
        evaluateOpenCodeShell(event, dir);
      });
    }
  },
};
