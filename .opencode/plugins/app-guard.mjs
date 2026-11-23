// OpenCode V2 guard plugin (ADR 0008). Uses the shared worktree-role evaluator in scripts/agents/agent-hook.mjs.
import { evaluateOpenCodeShell, evaluateOpenCodeTool } from "../../scripts/agents/agent-hook.mjs";

export default {
  id: "app-guard",
  /** @param {import("../../scripts/agents/agent-hook.d.ts").OpenCodePluginContext} ctx */
  async setup(ctx) {
    const workdir = ctx.directory ?? ctx.cwd ?? process.cwd();
    await ctx.tool.hook("execute.before", async (event) => {
      evaluateOpenCodeTool(event, workdir);
    });
    if (ctx.shell?.hook) {
      await ctx.shell.hook("create.before", async (event) => {
        evaluateOpenCodeShell(event, workdir);
      });
    }
  },
};
