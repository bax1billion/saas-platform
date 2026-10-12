"use client";

import { useSyncExternalStore } from "react";
import {
  readShellPreference,
  SHELL_PREFERENCE_DEFAULT,
  subscribeShellPreference,
  type ShellPreference,
} from "./preference-store";

const readServer = () => SHELL_PREFERENCE_DEFAULT;

/** The member's shell preferences as a live value; needs no provider. */
export function useShellPreference(): ShellPreference {
  return useSyncExternalStore(subscribeShellPreference, readShellPreference, readServer);
}
