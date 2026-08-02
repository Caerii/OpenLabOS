/** Tab ids, URL segments, and sidebar nav — single source of truth. */

import type { LabOSFeatureExperience, LabOSFeatureFlags } from "./api";
import type { NavGroup, NavItem } from "./components/ui/Sidebar";
import { advancedLabOSFeaturesEnabled, deriveLabOSExperience } from "./lib/labosExperience";

export const NAV_CONFIG = [
  {
    label: "Engineering",
    items: [{ id: "lab", segment: "lab", label: "Preview Lab", icon: "preview" }],
  },
  {
    label: "Overview",
    items: [{ id: "dashboard", segment: "dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "AI & Vision",
    items: [
      { id: "vision", segment: "vision", label: "AI Vision", icon: "vision" },
      { id: "copilot", segment: "copilot", label: "Live Copilot", icon: "copilot" },
      { id: "kitchen", segment: "kitchen", label: "Guided Run", icon: "kitchen" },
      { id: "labclaw", segment: "labclaw", label: "LabClaw", icon: "labclaw" },
    ],
  },
  {
    label: "Device",
    items: [
      { id: "mcu", segment: "mcu", label: "MCU Monitor", icon: "mcu" },
      { id: "preview", segment: "camera", label: "Live Camera", icon: "preview" },
      { id: "battery", segment: "battery", label: "Battery", icon: "battery" },
      { id: "audio", segment: "audio", label: "Audio", icon: "audio" },
      { id: "buttons", segment: "buttons", label: "Buttons", icon: "buttons" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "files", segment: "files", label: "Run Library", icon: "files" },
      { id: "apps", segment: "apps", label: "Apps", icon: "apps" },
      { id: "network", segment: "network", label: "Network", icon: "network" },
      { id: "labos", segment: "labos", label: "LabOS", icon: "labos" },
      { id: "shell", segment: "shell", label: "Shell", icon: "shell" },
      { id: "console", segment: "console", label: "Console", icon: "console" },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { id: "settings", segment: "settings", label: "Settings", icon: "settings" },
      { id: "restore", segment: "restore", label: "Restore", icon: "restore" },
      { id: "ota", segment: "ota", label: "OTA Update", icon: "ota" },
    ],
  },
] as const;

type NavEntry = (typeof NAV_CONFIG)[number]["items"][number];
export type Tab = NavEntry["id"];

const flatItems = NAV_CONFIG.flatMap((g) => [...g.items]);

export const TAB_TO_PATH_SEGMENT = Object.fromEntries(flatItems.map((i) => [i.id, i.segment])) as Record<Tab, string>;

const PATH_SEGMENT_TO_TAB = Object.fromEntries(
  flatItems.map((i) => [i.segment, i.id]),
) as Record<string, Tab>;

export const DEFAULT_TAB: Tab = "dashboard";

/** Base path where the legacy operator shell is mounted in apps/web. */
export const OPERATE_BASE = "/operate";

export const NAV_GROUPS: NavGroup[] = NAV_CONFIG.map((g) => ({
  label: g.label,
  items: g.items.map(
    ({ id, label, icon }): NavItem => ({ id, label, icon }),
  ),
}));

const OPERATOR_NAV_TABS = new Set<Tab>(["kitchen", "preview", "files"]);

export { advancedLabOSFeaturesEnabled };

export function navGroupsForFeatures(featureFlags?: LabOSFeatureFlags | null, serverExperience?: LabOSFeatureExperience | null): NavGroup[] {
  const experience = deriveLabOSExperience(featureFlags, serverExperience);
  if (experience.surfaces.engineeringNavigation) {
    return NAV_GROUPS.filter((group) => group.label !== "Engineering" || experience.surfaces.engineeringPerfLab);
  }

  return NAV_CONFIG.map((group) => ({
    label: group.label,
    items: group.items
      .filter(({ id }) => OPERATOR_NAV_TABS.has(id))
      .map(({ id, label, icon }): NavItem => ({ id, label: id === "files" ? "Runs" : label, icon })),
  })).filter((group) => group.items.length > 0);
}

export function isTabVisibleForFeatures(tab: Tab, featureFlags?: LabOSFeatureFlags | null, serverExperience?: LabOSFeatureExperience | null): boolean {
  const experience = deriveLabOSExperience(featureFlags, serverExperience);
  if (tab === "lab") return experience.surfaces.engineeringPerfLab;
  return experience.surfaces.engineeringNavigation || OPERATOR_NAV_TABS.has(tab);
}

export function defaultTabForFeatures(featureFlags?: LabOSFeatureFlags | null, serverExperience?: LabOSFeatureExperience | null): Tab {
  const experience = deriveLabOSExperience(featureFlags, serverExperience);
  return experience.surfaces.engineeringNavigation ? DEFAULT_TAB : "kitchen";
}

export function pathForTab(tab: Tab): string {
  return `${OPERATE_BASE}/${TAB_TO_PATH_SEGMENT[tab]}`;
}

/** First path segment after "/", e.g. "kitchen" → kitchen; "camera" → preview */
export function tabFromPathSegment(segment: string | undefined): Tab | null {
  if (!segment) return null;
  return PATH_SEGMENT_TO_TAB[segment] ?? null;
}

function isTab(id: string): id is Tab {
  return Object.prototype.hasOwnProperty.call(TAB_TO_PATH_SEGMENT, id);
}

/** Sidebar `NavItem.id` is the internal tab id (e.g. "preview" for Camera). */
export function hrefForSidebarNavId(id: string): string {
  return pathForTab(isTab(id) ? id : DEFAULT_TAB);
}
