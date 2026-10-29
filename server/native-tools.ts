import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { registerAgentTools } from "./agent-tools.ts";
export function contributeAgentTools(server: PluginServerContext, read: (agentId: string) => Promise<unknown>) {
  return registerAgentTools(server, [defineAgentTool({
    name: "session_guard_status", description: "Read this agent's quota protection, pending resumption and provider reset times. Other agents' pauses and continuation text are excluded. Does not disable protection or resume a paused session.",
    input: z.object({}).strict(),
    async execute(_, { agent, signal }) { if (signal.aborted) throw new Error("Tool call cancelled."); const result = await read(agent.id); return { text: JSON.stringify(result), structuredContent: result }; },
  })]);
}
