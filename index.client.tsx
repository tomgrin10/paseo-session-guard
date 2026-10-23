import { ScrollView } from "react-native";
import { contributeDisplay } from "./client/display";
import { withNavigation } from "./client/navigation";
import { withButtonVisibility } from "./client/button-visibility";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributePills } from "./client/pills.ts";
import { guardPillIcons } from "./client/pill-icons.tsx";
import { GuardSettings } from "./client/settings.tsx";
import { PausedSessions } from "./client/paused.tsx";
import { GuardTimelineItem } from "./client/timeline.tsx";
import { TimelineDataSchema } from "./shared/timeline.ts";

export default function contribute(host: PluginClientContext) {
  const visibility = withButtonVisibility(host);
  const client = visibility.client;
  const removeDisplay = contributeDisplay(client, { id: "paused-sessions", title: "Session Guard", icon: "ShieldCheck", surface: "paused" });
  const Settings = withNavigation((props) => <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}><GuardSettings {...props} openOverview={() => client.openSurface("paused")} /></ScrollView>, client, "paused", "policy");
  const removePolicySurface = client.addSurface("policy", Settings);
  const removeSettings = client.addSettingsScreen({ id: "policy", title: "Session Guard", icon: "ShieldCheck", Component: Settings });
  const removeCommand = client.addCommandCenterItem({
    id: "guard-settings", title: "Session Guard: settings", icon: "ShieldCheck",
    keywords: ["quota", "limit", "reset", "pause", "resume", "protection"], context: "global",
    onSelect({ openSurface }) { openSurface("policy"); },
  });
  const removeSurface = client.addSurface("paused", withNavigation(props => <PausedSessions {...props} openSettings={() => client.openSurface("policy")} />, client, "paused"));
  const removeSidebar = () => {};
  const removeOverviewCommand = client.addCommandCenterItem({ id: "guard-paused", title: "Session Guard: paused sessions", icon: "Pause", keywords: ["quota", "waiting", "reset", "resume", "subagents"], context: "global", onSelect({ openSurface }) { openSurface("paused"); } });
  const removeTimeline = client.addTimelineRenderer({ kind: "quota-pause", version: 1, schema: TimelineDataSchema, Component: props => <GuardTimelineItem {...props} openOverview={() => client.openSurface("paused")} /> });
  const removePills = contributePills(client, guardPillIcons);
  return () => { visibility.dispose(); removeDisplay(); removePolicySurface(); removePills(); removeSettings(); removeCommand(); removeOverviewCommand(); removeSidebar(); removeSurface(); removeTimeline(); };
}
