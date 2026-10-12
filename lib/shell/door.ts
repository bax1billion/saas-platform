/**
 * The door rule (docs/shell.md, Doors). Pure: no React, no Next, no product
 * names. `DoorProvider` renders it.
 *
 * Field and Station are the member's choice, else the pointer guess. Admin
 * is never stored: it is the URL (`/<basePath>/admin` or deeper) and only
 * for a member in the Admin group. The door is presentation; it grants
 * nothing. Writes are decided on the server by groups, entitlement steps
 * and record access.
 */
export type Door = "field" | "station" | "admin";
export type ChosenDoor = "field" | "station";

/** `/<basePath>/admin` or deeper, for any registered product. */
export function isAdminPath(pathname: string, basePaths: readonly string[]): boolean {
  const [first, second] = pathname.split("/").filter(Boolean);
  return !!first && second === "admin" && basePaths.includes(`/${first}`);
}

export interface DoorInput {
  pointer: ChosenDoor;
  chosen: ChosenDoor | null;
  adminUrl: boolean;
  isAdmin: boolean;
}

export interface DoorResult {
  door: Door;
  /** A non-Admin opened an Admin URL: the page says "Admins only", the door stays theirs. */
  adminBlocked: boolean;
}

export function doorFor({ pointer, chosen, adminUrl, isAdmin }: DoorInput): DoorResult {
  if (adminUrl && isAdmin) return { door: "admin", adminBlocked: false };
  return { door: chosen ?? pointer, adminBlocked: adminUrl && !isAdmin };
}

/** Admin needs the Admin group and a product that has an Admin home. */
export function offeredDoors(isAdmin: boolean, adminHome: string | null): Door[] {
  return isAdmin && adminHome ? ["field", "station", "admin"] : ["field", "station"];
}

export function adminHomeFor(moduleId: string | undefined, homes: Readonly<Record<string, string>>): string | null {
  return (moduleId && homes[moduleId]) || null;
}
