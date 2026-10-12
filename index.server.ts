import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { homedir } from "node:os";
import { join } from "node:path";
import { preferences, statusRpc, setProtectionRpc, cancelResumeRpc, resumeNowRpc, dismissPauseRpc, demoPauseRpc, restoreRestartedPausesRpc, runtimeRpc } from "./shared/contracts.ts";
import { sessionWindow, usedPct } from "./shared/policy.ts";
import { Store } from "./server/store.ts";
import { WorkspaceLabels } from "./server/labels.ts";
import { Engine } from "./server/engine.ts";
import { LinuxProcessControl } from "./server/processes.ts";
import { timelinePublisher } from "./server/timeline.ts";
import { closeConnections, withDaemon } from "./server/daemon.ts";

export default function contribute(server: PluginServerContext) {
  let runtime: PaseoApi | null = null;
  server.handle(runtimeRpc, (_, context) => { runtime = context.paseo; return { ok: true }; });
  const publish = timelinePublisher(async () => {
    if (!runtime) await withDaemon(async client => {
      if (!client.invokePluginRpc) throw new Error("Plugin runtime API is unavailable.");
      await client.invokePluginRpc("paseo-session-guard", runtimeRpc.name, {});
    });
    if (!runtime) throw new Error("Plugin runtime API is unavailable.");
    return runtime;
  });
  const settings = server.registerSettings(preferences);
  const readPolicy = async () => {
    const result = await settings.read();
    if (result.status !== "ready") throw new Error("Session Guard settings are invalid.");
    return result.values;
  };
  const store = new Store(join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "plugin-data", "session-guard"));
  const engine = new Engine(store, readPolicy, withDaemon, Date.now, new LinuxProcessControl(), publish);
  const labels = new WorkspaceLabels(store, work => engine.exclusive(work), withDaemon, readPolicy);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let release: (() => Promise<void>) | null = null;
  let owner = false;
  let loadError: string | null = null;
  let running = false;
  const refresh = async () => {
    if (stopped || !owner || running) return;
    running = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    try { await engine.tick(); void engine.deliverTimeline(); void labels.refresh(); }
    finally {
      running = false;
      if (!stopped) {
        const seconds = await readPolicy().then(p => p.pollSeconds).catch(() => 15);
        if (!stopped) timer = setTimeout(() => void refresh(), seconds * 1000);
      }
    }
  };
  const ready = store.lock().then(async unlock => {
    release = unlock;
    if (stopped) return;
    await engine.recover(); owner = true; await refresh();
  }).catch(() => { loadError = "Session Guard could not start. Check saved state and ensure only one installation is running."; });
  const requireOwner = async () => {
    await ready;
    if (!owner || stopped) throw new Error(loadError ?? "Session Guard is stopping.");
  };
  server.handle(statusRpc, async (_, context) => {
    runtime = context.paseo;
    await ready;
    const state = await engine.exclusive(() => store.read());
    const policy = await readPolicy();
    return {
      checkedAt: engine.checkedAt, error: loadError ?? engine.error ?? engine.timelineError ?? labels.error,
      pauses: state.pauses, overrides: state.overrides, policy,
      providers: (engine.usage?.providers ?? []).map(provider => {
        const window = sessionWindow(provider, policy);
        return { providerId: provider.providerId, usedPct: window ? usedPct(window) : null, resetsAt: window?.resetsAt ?? null };
      }),
    };
  });
  server.handle(setProtectionRpc, async ({ agentId, enabled }) => {
    await requireOwner(); await engine.setProtection(agentId, enabled); void engine.deliverTimeline(); void labels.refresh(); void refresh(); return { ok: true };
  });
  server.handle(cancelResumeRpc, async ({ agentId }) => {
    await requireOwner(); await engine.cancelResume(agentId); void engine.deliverTimeline(); void labels.refresh(); return { ok: true };
  });
  server.handle(resumeNowRpc, async ({ agentId, pauseId }) => {
    await requireOwner(); await engine.resumeNow(agentId, pauseId); void engine.deliverTimeline(); void labels.refresh(); return { ok: true };
  });
  server.handle(dismissPauseRpc, async ({ agentId, pauseId }) => {
    await requireOwner(); await engine.dismissPause(agentId, pauseId); void engine.deliverTimeline(); void labels.refresh(); return { ok: true };
  });
  server.handle(demoPauseRpc, async ({ agentId }) => {
    await requireOwner(); await engine.pauseDemo(agentId); void engine.deliverTimeline(); void labels.refresh(); return { ok: true };
  });
  server.handle(restoreRestartedPausesRpc, async ({ pauseIds }) => {
    await requireOwner(); const restored = await engine.restoreRestartedPauses(pauseIds); void engine.deliverTimeline(); void labels.refresh(); void refresh(); return { restored };
  });
  const removeSettings = settings.subscribe(() => { void refresh(); });
  const removeTurnStarted = server.on("agent.turn_started", () => { void refresh(); });
  const removeTurnEnded = server.on("agent.turn_ended", event => {
    // Never await a governor tick inside a lifecycle hook: cancelAgent itself
    // causes turn_ended, and awaiting both would deadlock.
    if (owner && !stopped) void engine.turnEnded(event.agent.id, event.turnId, event.outcome.kind).catch(() => undefined);
    if (event.outcome.kind === "failed") engine.quotaFailure(event.agent.id, event.outcome.error.message, event.turnId);
    void refresh();
  });
  return async () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    removeSettings(); removeTurnStarted(); removeTurnEnded();
    const drain = engine.stop(); const drainLabels = labels.stop();
    await closeConnections(); await drain; await drainLabels; await ready;
    await release?.();
  };
}
