import { isPending, timestamp, type Pause, type Policy } from "./policy.ts";

export function pausedSessions(pauses: readonly Pause[], query = "") {
  const needle = query.trim().toLocaleLowerCase();
  return pauses.filter(isPending).filter(p => !needle ||
    `${p.title ?? "Untitled session"} ${p.provider} ${p.agentId} ${p.suspension ? "native subagents" : "interrupted turn"}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => {
      if ((a.phase === "attention") !== (b.phase === "attention")) return a.phase === "attention" ? -1 : 1;
      return (timestamp(a.anchorResetsAt) ?? Infinity) - (timestamp(b.anchorResetsAt) ?? Infinity) || a.pausedAt.localeCompare(b.pausedAt);
    });
}
export function pausePresentation(pause: Pause, policy: Policy, now = Date.now()) {
  const reset = timestamp(pause.anchorResetsAt);
  const resetLabel = pause.demo ? "Waiting for your test action" : reset === null ? "Reset time unavailable" : reset <= now
    ? "Reset due · waiting for fresh usage"
    : `Reset ${new Date(reset).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
  const state = pause.phase === "attention" ? "Needs attention" : pause.phase === "pausing" ? "Pausing"
    : pause.phase === "resuming" ? "Resuming" : pause.demo ? "Demo · resume when ready" : !policy.enabled ? "Guard off · continuation on hold"
    : !policy.autoResume ? "Automatic resume off" : "Will resume automatically after reset";
  return {
    title: pause.title?.trim() || "Untitled session", state, resetLabel,
    coverage: pause.phase === "attention" ? "Check session state" : pause.suspension ? "Includes native subagents" : pause.restartRecovery ? "Saved conversation · waiting after restart" : "Interrupted turn",
    actionLabel: pause.suspension ? "Release and turn off" : "Cancel continuation",
    actionHint: pause.suspension ? "Resume these workers now and exclude this session from protection."
      : "Leave this session for you to continue manually.",
  };
}
