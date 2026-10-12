"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { doorLabels, shellLabels, shellPlaces, textSizeLabels } from "@/config/shell";
import { canManageOrg } from "@/lib/roles";
import { writeShellPreference, type TextSize } from "@/lib/shell/preference-store";
import { useShellPreference } from "@/lib/shell/useShellPreference";
import { useAuth } from "../AuthContext";
import { useDoorChoices, type Door } from "../DoorContext";
import { useSidebar } from "./SidebarContext";

const ME_HREF = shellPlaces.find((p) => p.id === "me")?.href ?? "/me";

/**
 * The member's menu: the one door switch in the frame, text size, the
 * sidebar reset, Me, Organization, Billing (managers), Sign out. Every item
 * is a real action; nothing here only shows a message.
 */
export default function AvatarMenu() {
  const router = useRouter();
  const { user, handleSignOut } = useAuth();
  const { door, setDoor, offered, hasChoice, resetDoor } = useDoorChoices();
  const { manual, setManual } = useSidebar();
  const { textSize } = useShellPreference();
  const manager = canManageOrg(user?.groups);
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={shellLabels.account}
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initial}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel>{shellLabels.door}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={door} onValueChange={(v) => setDoor(v as Door)}>
          {offered.map((d) => (
            <DropdownMenuRadioItem key={d} value={d} className="min-h-10">
              {doorLabels[d]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {hasChoice && (
          <DropdownMenuItem className="min-h-10" onSelect={resetDoor}>
            {shellLabels.autoDoor}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />

        <DropdownMenuLabel>{shellLabels.textSize}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={textSize} onValueChange={(v) => writeShellPreference({ textSize: v as TextSize })}>
          {(Object.keys(textSizeLabels) as TextSize[]).map((t) => (
            <DropdownMenuRadioItem key={t} value={t} className="min-h-10">
              {textSizeLabels[t]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {manual !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-10" onSelect={() => setManual(null)}>
              <Check className="h-4 w-4 opacity-0" aria-hidden />
              {shellLabels.resetSidebar}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />

        <DropdownMenuItem className="min-h-10" onSelect={() => router.push(ME_HREF)}>
          Me
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10" onSelect={() => router.push("/settings")}>
          {shellLabels.organization}
        </DropdownMenuItem>
        {manager && (
          <DropdownMenuItem className="min-h-10" onSelect={() => router.push("/settings/billing")}>
            {shellLabels.billing}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10" onSelect={() => handleSignOut()}>
          {shellLabels.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
