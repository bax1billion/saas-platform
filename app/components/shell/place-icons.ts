import { Bell, CircleUser, House, LayoutDashboard, ListChecks, MessagesSquare, Radio, Search, Settings, type LucideIcon } from "lucide-react";

/** `config/shell.ts` names icons as strings so it stays React free; the frame maps them here. */
const ICONS: Record<string, LucideIcon> = { House, Radio, ListChecks, MessagesSquare, CircleUser, LayoutDashboard, Bell, Search, Settings };

export function placeIcon(name: string): LucideIcon {
  return ICONS[name] ?? CircleUser;
}
