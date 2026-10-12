import { test } from "node:test";
import assert from "node:assert/strict";
import { contributePills, pillPresentation } from "../client/pills.ts";
import { PauseSchema, PolicySchema } from "../shared/policy.ts";
import type { PluginClientContext } from "@getpaseo/plugin/client";

test("pill describes manual continuation when automatic continuation is disabled", () => {
  const policy = PolicySchema.parse({ autoResume: false });
  assert.match(pillPresentation(policy, true, undefined).title, /continue manually/i);
  const pause = PauseSchema.parse({ id: "p", agentId: "a", provider: "claude", title: null, windowId: "five_hour", anchorResetsAt: null, pausedAt: "2026-10-06T00:00:00Z", lastUserMessageAt: null, turnId: null, phase: "waiting", note: null, settledAt: null });
  assert.match(pillPresentation(policy, true, pause).title, /automatic continuation is off/i);
  assert.match(pillPresentation({ ...policy, autoResume: true }, true, pause).title, /scheduled after reset/i);
});

test("agent observation, stable menu updates, opt-out, workspace moves, and teardown", async () => {
  const policy = PolicySchema.parse({});
  const status = { checkedAt: null, error: null, pauses: [], overrides: {} as Record<string, boolean>, policy, providers: [] };
  let observer: { snapshot(payload: unknown): void; update(event: unknown): void } | null = null;
  let releases = 0, removals = 0, updates = 0;
  const surfaces: string[] = [];
  const registered: { agentId: string; workspaceId: string; button: { behavior: { items: { id: string; behavior?: { onPress(): Promise<void> } }[] } } }[] = [];
  const context = {
    rpc: async (contract: { name: string }, input: { agentId?: string; enabled?: boolean | null }) => {
      if (contract.name === "guard.status") return structuredClone(status);
      if (input.enabled === null) delete status.overrides[input.agentId!];
      else if (input.enabled !== undefined) status.overrides[input.agentId!] = input.enabled;
      return { ok: true };
    },
    openSettings() {},
    openSurface(id: string) { surfaces.push(id); },
    paseo: { observeEvents() {}, agents: {
      list: async () => ({ subscription: { subscribe: (next: typeof observer) => { observer = next; return () => {}; }, release: async () => { releases++; } } }),
    } },
    addComposerPill: (contribution: typeof registered[number]) => {
      registered.push(contribution);
      return { update: (button: typeof contribution.button) => { updates++; contribution.button = button; }, remove: () => { removals++; } };
    },
  } as unknown as PluginClientContext;
  const cleanup = contributePills(context);
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  try {
    await settle();
    const next = observer!;
    const agent = { id: "a", status: "idle", workspaceId: "w" };
    next.snapshot({ entries: [{ agent }] });
    assert.equal(registered.length, 1);
    const before = registered[0].button;
    await before.behavior.items.find(item => item.id === "paused-sessions")!.behavior!.onPress();
    assert.deepEqual(surfaces, ["paused"]);
    next.update({ type: "agent_update", payload: { kind: "upsert", agent: { ...agent, title: "Changed" } } });
    assert.equal(updates, 0, "presentation polling must not remount an open menu");
    assert.equal(registered[0].button, before);
    await registered[0].button.behavior.items.find(item => item.id === "toggle")!.behavior!.onPress();
    assert.equal(status.overrides.a, false); assert.equal(updates, 1);
    next.update({ type: "agent_update", payload: { kind: "upsert", agent: { ...agent, workspaceId: "new" } } });
    assert.equal(removals, 1); assert.equal(registered.length, 2); assert.equal(registered[1].workspaceId, "new");
    next.update({ type: "agent_update", payload: { kind: "remove", agentId: "a" } });
    assert.equal(removals, 2);
  } finally { cleanup(); await settle(); }
  assert.equal(releases, 1);
});
