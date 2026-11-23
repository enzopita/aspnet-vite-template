// Type definitions for unified harness lifecycle adapters (ADR 0008). Checked via web/tsconfig.scripts.json.

export type AgentRole = "orchestrator" | "executor" | "reviewer";
export type HookEventName = "session-start" | "pre-tool" | "post-tool" | "stop";
export type HarnessName = "claude" | "antigravity" | "opencode";
export type HookDecision = "allow" | "deny";

export interface TaskMeta {
  id: string;
  title: string;
  status: string;
  allow?: string | string[];
  unlock?: string | string[];
  scope?: string;
}

export interface TaskSpec {
  file: string;
  meta: TaskMeta;
  body: string;
  frontmatter: string;
}

export interface ClaudeSessionStartEvent {
  hook_event_name: "SessionStart";
  cwd?: string;
  session_id?: string;
  source?: string;
}

export interface ClaudePreToolEvent {
  hook_event_name: "PreToolUse";
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

export interface ClaudePostToolEvent {
  hook_event_name: "PostToolUse";
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  cwd?: string;
}

export interface ClaudeStopEvent {
  hook_event_name: "Stop";
  stop_hook_active?: boolean;
  background_tasks_running?: boolean;
  cwd?: string;
}

export type ClaudeEventInput =
  | ClaudeSessionStartEvent
  | ClaudePreToolEvent
  | ClaudePostToolEvent
  | ClaudeStopEvent;

export interface AntigravityToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface AntigravitySessionStartEvent {
  hookEventName: "SessionStart";
  cwd?: string;
  workspacePaths?: string[];
  modelName?: string;
}

export interface AntigravityPreToolEvent {
  hookEventName: "PreToolUse";
  toolCall?: AntigravityToolCall;
  stepIdx?: number;
  cwd?: string;
  workspacePaths?: string[];
}

export interface AntigravityPostToolEvent {
  hookEventName: "PostToolUse";
  toolCall?: AntigravityToolCall;
  stepIdx?: number;
  error?: string;
  cwd?: string;
  workspacePaths?: string[];
}

export interface AntigravityStopEvent {
  hookEventName: "Stop";
  executionNum?: number;
  continuationActive?: boolean;
  terminationReason?: string;
  fullyIdle?: boolean;
  error?: string;
  cwd?: string;
  workspacePaths?: string[];
}

export type AntigravityEventInput =
  | AntigravitySessionStartEvent
  | AntigravityPreToolEvent
  | AntigravityPostToolEvent
  | AntigravityStopEvent;

export interface OpenCodeToolBeforeEvent {
  tool: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  sessionID?: string;
  callID?: string;
}

export interface OpenCodeShellBeforeEvent {
  command: string;
  cwd?: string;
}

export interface OpenCodePluginContext {
  directory?: string;
  cwd?: string;
  tool: {
    hook(event: "execute.before" | "execute.after", handler: (event: OpenCodeToolBeforeEvent) => Promise<void> | void): Promise<void> | void;
  };
  shell?: {
    hook(event: "create.before", handler: (event: OpenCodeShellBeforeEvent) => Promise<void> | void): Promise<void> | void;
  };
}

export interface NormalizedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface PreToolResult {
  decision: HookDecision;
  reason?: string;
}

export interface StopResult {
  blocked: boolean;
  reason?: string;
}

export interface ClaudeSessionStartOutput {
  hookSpecificOutput?: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export interface ClaudePreToolOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: HookDecision;
    permissionDecisionReason?: string;
  };
}

export interface ClaudePostToolOutput {
  hookSpecificOutput?: {
    hookEventName: "PostToolUse";
    additionalContext: string;
  };
}

export interface ClaudeStopOutput {
  decision?: "block";
  reason?: string;
}

export type ClaudeHookOutput =
  | ClaudeSessionStartOutput
  | ClaudePreToolOutput
  | ClaudePostToolOutput
  | ClaudeStopOutput;

export interface AntigravitySessionStartOutput {
  injectSteps: { systemMessage: { systemMessage: string } }[];
}

export interface AntigravityPreToolOutput {
  decision: HookDecision;
  reason?: string;
}

export interface AntigravityStopOutput {
  decision?: "continue";
  reason?: string;
}

export type AntigravityHookOutput =
  | AntigravitySessionStartOutput
  | AntigravityPreToolOutput
  | AntigravityStopOutput
  | Record<string, never>;
