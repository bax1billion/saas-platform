"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { isOrgAdmin } from "@/lib/roles";
import { activeModules, getModuleByPath } from "@/lib/modules";
import { adminHomes } from "@/config/shell";
import { useFieldStationMode } from "@/lib/hooks/useFieldStationMode";
import { readShellPreference, subscribeShellPreference, writeShellPreference } from "@/lib/shell/preference-store";
import { adminHomeFor, doorFor, isAdminPath, offeredDoors, type ChosenDoor, type Door } from "@/lib/shell/door";

export type { Door } from "@/lib/shell/door";

const BASE_PATHS = activeModules.map((m) => m.basePath);
const readChoice = (): ChosenDoor | null => readShellPreference().door;
const readChoiceServer = (): ChosenDoor | null => null;

export interface DoorChoices {
  door: Door;
  setDoor: (d: Door) => void;
  /** Field and Station always; Admin for an Admin on a product with an Admin home. */
  offered: Door[];
  /** A non-Admin opened an Admin URL. */
  adminBlocked: boolean;
  adminHome: string | null;
  /** The member has picked Field or Station by hand. */
  hasChoice: boolean;
  resetDoor: () => void;
}

const Ctx = createContext<DoorChoices | null>(null);

/**
 * One door for the whole app (docs/shell.md, Doors). Wraps
 * `useFieldStationMode` for the pointer guess, remembers the member's own
 * choice through the shell preference store, and derives Admin from the
 * URL for any `/<basePath>/admin` path when the member is in the Admin
 * group. The door is presentation and grants nothing.
 */
export function DoorProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [pointer] = useFieldStationMode();
  const chosen = useSyncExternalStore(subscribeShellPreference, readChoice, readChoiceServer);
  const isAdmin = isOrgAdmin(user?.groups);
  const mod = getModuleByPath(pathname);
  const adminHome = adminHomeFor(mod?.id, adminHomes);
  const adminUrl = isAdminPath(pathname, BASE_PATHS);
  const { door, adminBlocked } = doorFor({ pointer, chosen, adminUrl, isAdmin });

  const setDoor = useCallback(
    (next: Door) => {
      if (next === "admin") {
        if (isAdmin && adminHome) router.push(adminHome);
        return;
      }
      writeShellPreference({ door: next });
      // Leaving Admin goes to the product home, as the old toggles did.
      if (adminUrl && mod) router.push(mod.basePath);
    },
    [isAdmin, adminHome, adminUrl, mod, router]
  );
  const resetDoor = useCallback(() => writeShellPreference({ door: null }), []);

  const value = useMemo<DoorChoices>(
    () => ({
      door,
      setDoor,
      offered: offeredDoors(isAdmin, adminHome),
      adminBlocked,
      adminHome,
      hasChoice: chosen !== null,
      resetDoor,
    }),
    [door, setDoor, isAdmin, adminHome, adminBlocked, chosen, resetDoor]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDoor(): [Door, (d: Door) => void] {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDoor must be used inside DoorProvider (app/(app)/layout.tsx)");
  return [c.door, c.setDoor];
}

export function useDoorChoices(): DoorChoices {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDoorChoices must be used inside DoorProvider (app/(app)/layout.tsx)");
  return c;
}
