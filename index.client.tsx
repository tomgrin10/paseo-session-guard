import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributePills } from "./client/pills.ts";
import { guardPillIcons } from "./client/pill-icons.tsx";
import { GuardSettings } from "./client/settings.tsx";
import { PausedSessions } from "./client/paused.tsx";
import { GuardTimelineItem } from "./client/timeline.tsx";
import { TimelineDataSchema } from "./shared/timeline.ts";

export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({ id: "policy", title: "Session Guard", icon: "ShieldCheck", Component: props => <GuardSettings {...props} openOverview={() => client.openSurface("paused")} /> });
  const removeCommand = client.addCommandCenterItem({
    id: "guard-settings", title: "Session Guard: settings", icon: "ShieldCheck",
    keywords: ["quota", "limit", "reset", "pause", "resume", "protection"], context: "global",
    onSelect({ openSettings }) { openSettings("policy"); },
  });
  const removeSurface = client.addSurface("paused", props => <PausedSessions {...props} openSettings={() => client.openSettings("policy")} />);
  const removeSidebar = client.addSidebarItem({ id: "paused-sessions", title: "Paused sessions", icon: "Pause", surface: "paused" });
  const removeOverviewCommand = client.addCommandCenterItem({ id: "guard-paused", title: "Session Guard: paused sessions", icon: "Pause", keywords: ["quota", "waiting", "reset", "resume", "subagents"], context: "global", onSelect({ openSurface }) { openSurface("paused"); } });
  const removeTimeline = client.addTimelineRenderer({ kind: "quota-pause", version: 1, schema: TimelineDataSchema, Component: props => <GuardTimelineItem {...props} openOverview={() => client.openSurface("paused")} /> });
  const removePills = contributePills(client, guardPillIcons);
  return () => { removePills(); removeSettings(); removeCommand(); removeOverviewCommand(); removeSidebar(); removeSurface(); removeTimeline(); };
}
