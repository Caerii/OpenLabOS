/** Sidebar: grouped nav + icons (Heroicons paths below). */

import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../../theme/ThemeProvider";
import { THEME_CSS_VARS } from "../../theme/themeVars";
import { StatusDot } from "./index";

const ICONS: Record<string, string> = {
  dashboard:  "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z",
  mcu:        "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5M4.5 15.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 4.5 8.25v9a2.25 2.25 0 0 0 2.25 2.25Z",
  files:      "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z",
  apps:       "M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z",
  network:    "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  settings:   "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z",
  shell:      "m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z",
  labos:      "M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5",
  restore:    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182",
  ota:        "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
  console:    "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155",
  preview:    "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z",
  battery:    "M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0 0 21 15.75v-6a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 9.75v6A2.25 2.25 0 0 0 3.75 18Z",
  audio:      "M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z",
  copilot:    "M12 18.75a6.75 6.75 0 0 0 6.75-6.75V9.75a6.75 6.75 0 0 0-13.5 0V12A6.75 6.75 0 0 0 12 18.75Zm0 0v2.25m-3 0h6M8.25 10.5h.008v.008H8.25V10.5Zm7.5 0h.008v.008h-.008V10.5Zm-5.25 3a3 3 0 0 0 3 0",
  buttons:    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  vision:     "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z",
  kitchen:    "M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5",
  /** Puzzle piece — modular OpenClaw skills */
  labclaw:    "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
};

export interface NavItem {
  id: string;
  label: string;
  icon?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  groups: NavGroup[];
  /** Map nav item id → route href (e.g. preview → /camera) */
  hrefForNavId: (id: string) => string;
  connected: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
}

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      className={`shrink-0 transition-colors ${active ? "text-highlight" : "text-subtle"}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function MobileNav({ groups, hrefForNavId }: Pick<SidebarProps, "groups" | "hrefForNavId">) {
  const priority = ["dashboard", "kitchen", "files", "preview", "copilot", "vision"];
  const allItems = groups.flatMap((group) => group.items);
  const items = priority
    .map((id) => allItems.find((item) => item.id === id))
    .filter((item): item is NavItem => !!item)
    .slice(0, 5);
  return (
    <nav className="labos-rail labos-rail--dock fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div
        className="grid gap-1 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={hrefForNavId(item.id)}
            className="labos-nav-link labos-nav-link--compact labos-focus justify-center"
          >
            {({ isActive }) => (
              <>
                <NavIcon name={item.icon || item.id} active={isActive} />
                <span className="max-w-full truncate">{item.label.replace("Dashboard", "Home").replace("Camera", "Cam")}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function Sidebar({
  groups,
  hrefForNavId,
  connected,
  collapsed = false,
  onToggleCollapsed,
  header,
  footer,
}: SidebarProps) {
  const { theme } = useTheme();
  const railBg = `rgb(${THEME_CSS_VARS[theme]["--surface-1"].replace(/\s+/g, ", ")})`;

  return (
    <aside
      className={`labos-rail labos-rail--vertical hidden md:flex sticky top-0 h-screen shrink-0 flex-col transition-[width] duration-200 ${collapsed ? "w-16" : "w-56"}`}
      style={{ backgroundColor: railBg }}
    >
      {/* Brand */}
      <div className={`border-b border-border/10 ${collapsed ? "px-2" : "px-4"} py-4`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="labos-brand-mark">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
            </svg>
          </div>
          <div className={collapsed ? "sr-only" : ""}>
            <div className="text-sm font-bold text-fg tracking-tight">LabOS</div>
            <div className="text-[10px] text-muted leading-none">Smart Glasses Dashboard</div>
          </div>
        </div>
        {/* Connection status */}
        <div className={`flex items-center gap-2 mt-3 ${collapsed ? "justify-center px-0" : "px-1"}`}>
          <StatusDot active={connected} pulse size="xs" />
          <span className={`text-[11px] text-muted ${collapsed ? "sr-only" : ""}`}>
            {connected ? "Device connected" : "Disconnected"}
          </span>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            className={`labos-btn labos-btn--secondary labos-btn--xs labos-focus mt-3 ${collapsed ? "mx-auto w-8 px-0" : "w-full"}`}
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>

      {header}

      {/* Nav groups */}
      <nav className={`flex-1 overflow-y-auto py-2 px-2 ${collapsed ? "space-y-2" : "space-y-4"}`}>
        {groups.map((group) => (
          <div key={group.label}>
            <div className={`labos-nav-group-label ${collapsed ? "sr-only" : ""}`}>
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const to = hrefForNavId(item.id);
                return (
                  <NavLink
                    key={item.id}
                    to={to}
                    end
                    title={collapsed ? item.label : undefined}
                    className={`labos-nav-link labos-focus ${collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5"}`}
                  >
                    {({ isActive }) => (
                      <>
                        <NavIcon name={item.icon || item.id} active={isActive} />
                        {!collapsed && item.label}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {footer}

      {/* Footer */}
      <div className={`border-t border-border/10 ${collapsed ? "px-2" : "px-4"} py-3`}>
        <div className={`text-[10px] text-subtle text-center ${collapsed ? "sr-only" : ""}`}>
          Smart Glasses
        </div>
      </div>
    </aside>
  );
}
