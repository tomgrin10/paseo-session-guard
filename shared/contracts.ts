import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { PauseSchema, PolicySchema } from "./policy.ts";

export const preferences = defineSettings({ id: "policy", scope: "host", version: 1, schema: PolicySchema });
export const statusRpc = defineRpc({
  name: "guard.status", input: z.object({}),
  output: z.object({
    checkedAt: z.string().nullable(), error: z.string().nullable(),
    pauses: z.array(PauseSchema), overrides: z.record(z.string(), z.boolean()),
    policy: PolicySchema,
    providers: z.array(z.object({ providerId: z.string(), usedPct: z.number().nullable(), resetsAt: z.string().nullable() })),
  }),
});
export const setProtectionRpc = defineRpc({
  name: "guard.protection", input: z.object({ agentId: z.string().min(1), enabled: z.boolean().nullable() }),
  output: z.object({ ok: z.boolean() }),
});
export const cancelResumeRpc = defineRpc({
  name: "guard.cancel", input: z.object({ agentId: z.string().min(1) }), output: z.object({ ok: z.boolean() }),
});
export const resumeNowRpc = defineRpc({
  name: "guard.resume-now", input: z.object({ agentId: z.string().min(1), pauseId: z.string().min(1) }),
  output: z.object({ ok: z.boolean() }),
});
export const dismissPauseRpc = defineRpc({
  name: "guard.dismiss-pause", input: z.object({ agentId: z.string().min(1), pauseId: z.string().min(1) }),
  output: z.object({ ok: z.boolean() }),
});
export const demoPauseRpc = defineRpc({
  name: "guard.demo-pause", input: z.object({ agentId: z.string().min(1) }), output: z.object({ ok: z.boolean() }),
});
export const restoreRestartedPausesRpc = defineRpc({
  name: "guard.restore-restarted-pauses", input: z.object({ pauseIds: z.array(z.string()).max(200) }), output: z.object({ restored: z.number() }),
});
// Obtains the host-owned IPC API; network clients cannot impersonate plugins.
export const runtimeRpc = defineRpc({ name: "guard.runtime", input: z.object({}), output: z.object({ ok: z.boolean() }) });
