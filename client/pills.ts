import type { PluginButtonIcon, PluginClientContext } from "@getpaseo/plugin/client";
import { followAgents, type AgentList, type AgentUpdate } from "./agents.ts";
import { cancelResumeRpc, setProtectionRpc, statusRpc } from "../shared/contracts.ts";
import { isPending, protects, type Pause, type Policy } from "../shared/policy.ts";

export function pillPresentation(policy: Policy, enabled: boolean, pause: Pause | undefined) {
  if (!policy.enabled) return { label: "Guard off", title: "Session Guard is disabled on this host", icon: "ShieldOff" };
  if (!enabled) return { label: "Guard off", title: "This session is excluded from automatic quota protection", icon: "ShieldOff" };
  if (pause?.phase === "attention") return { label: "Check session", title: pause.note ?? "Check this session before continuing", icon: "TriangleAlert" };
  if (pause) {
    if (pause.demo) return { label: "Paused · demo", title: "This test session is paused. Try Resume now in its timeline; no provider quota was changed.", icon: "Pause" };
    const date = pause.anchorResetsAt ? new Date(pause.anchorResetsAt) : null;
    const time = date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    const resetDetail = date ? ` Expected reset ${date.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}.` : " Reset time is not available yet.";
    return { label: time ? `Paused · ${time}` : "Paused · awaiting reset", title: (policy.autoResume
      ? `Paused at the session limit${pause.suspension ? ", including native subagents" : ""}. Automatic continuation is scheduled after reset.`
      : pause.suspension ? "Session and native subagents are paused. Release and turn off to continue manually; automatic continuation is off."
      : "Paused at the session limit. Continue manually after reset; automatic continuation is off.") + resetDetail, icon: "Pause" };
  }
  return { label: "Session Guard", title: policy.autoResume
    ? `Pause at ${policy.thresholdPct}% session usage and continue after reset`
    : `Pause at ${policy.thresholdPct}% session usage; continue manually after reset`, icon: "ShieldCheck" };
}

export function contributePills(client: PluginClientContext, icons: Readonly<Record<string, PluginButtonIcon>> = {}) {
  let stopped = false;
  let running = false;
  let status: Awaited<ReturnType<typeof readStatus>> | null = null;
  const sessions = new Map<string, string>();
  const handles = new Map<string, { workspaceId: string; signature: string; registration: ReturnType<PluginClientContext["addComposerPill"]> }>();
  const readStatus = () => client.rpc(statusRpc, {});
  const refresh = async () => {
    if (stopped || running) return;
    running = true;
    try { const next = await readStatus(); if (!stopped) { status = next; reconcile(); } }
    catch { /* Keep the last confirmed presentation across a brief disconnect. */ }
    finally { running = false; }
  };
  function reconcile() {
    if (stopped || !status) return;
    for (const [id, handle] of handles) {
      if (sessions.get(id) !== handle.workspaceId) { handle.registration.remove(); handles.delete(id); }
    }
    for (const [agentId, workspaceId] of sessions) {
      const enabled = protects(status.policy, status.overrides, agentId);
      const pause = status.pauses.find(p => p.agentId === agentId && isPending(p));
      const presentation = pillPresentation(status.policy, enabled, pause);
      const signature = JSON.stringify([presentation, enabled, agentId in status.overrides, pause?.id]);
      const handle = handles.get(agentId);
      // Preserve the host menu while polling or receiving agent updates.
      // Replacing behavior on every read remounts an open adaptive menu.
      if (handle?.signature === signature) continue;
      const button = {
        ...presentation,
        icon: icons[presentation.icon] ?? presentation.icon,
        behavior: { kind: "menu" as const, items: [
          { kind: "item" as const, id: "toggle", title: enabled ? "Turn off for this session" : "Protect this session", icon: enabled ? "ShieldOff" : "ShieldCheck",
            behavior: { kind: "action" as const, onPress: async () => { await client.rpc(setProtectionRpc, { agentId, enabled: !enabled }); await refresh(); } } },
          { kind: "item" as const, id: "default", title: "Use host default", visible: agentId in status.overrides,
            behavior: { kind: "action" as const, onPress: async () => { await client.rpc(setProtectionRpc, { agentId, enabled: null }); await refresh(); } } },
          { kind: "item" as const, id: "cancel", title: pause?.suspension ? "Release and turn off for this session" : "Cancel automatic continuation", visible: !!pause,
            behavior: { kind: "action" as const, onPress: async () => { await client.rpc(cancelResumeRpc, { agentId }); await refresh(); } } },
          { kind: "separator" as const, id: "separator" },
          { kind: "item" as const, id: "paused-sessions", title: "All paused sessions", icon: "Pause",
            behavior: { kind: "action" as const, onPress: () => { client.openSurface("paused"); } } },
          { kind: "item" as const, id: "settings", title: "Session Guard settings", icon: "Settings",
            behavior: { kind: "action" as const, onPress: () => { client.openSettings("policy"); } } },
        ] },
      };
      if (handle) { handle.registration.update(button); handle.signature = signature; }
      else handles.set(agentId, { workspaceId, signature, registration: client.addComposerPill({ id: "guard", workspaceId, agentId, button }) });
    }
  }
  const place = (agent: { id?: string; status?: string; workspaceId?: string; archivedAt?: string | null }) => {
    if (!agent.id) return;
    if (agent.status === "closed" || agent.archivedAt || !agent.workspaceId) sessions.delete(agent.id);
    else sessions.set(agent.id, agent.workspaceId);
  };
  const snapshot = (list: AgentList) => { sessions.clear(); for (const entry of list.entries) place(entry.agent); reconcile(); };
  const update = (event: AgentUpdate) => {
    if (event.kind === "remove") sessions.delete(event.agentId);
    else place(event.agent);
    reconcile();
  };
  const unsubscribe = followAgents(client.paseo, { snapshot, update }, () => {
    const remove = client.paseo.agents.subscribe(update);
    void client.paseo.agents.list().then(snapshot).catch(() => undefined);
    return remove;
  });
  void refresh();
  const timer = setInterval(() => void refresh(), 5000);
  return () => {
    stopped = true; clearInterval(timer); unsubscribe();
    for (const handle of handles.values()) handle.registration.remove();
    handles.clear(); sessions.clear();
  };
}
