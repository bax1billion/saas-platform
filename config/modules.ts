/**
 * White-label module registry — the product's list of modules (products
 * within the product). Each entry's code lives in modules/<id>/; see
 * docs/modules.md for the authoring pattern.
 *
 * This file is downstream-owned: the foundation ships it empty and the
 * shell, marketing sections and entitlement helpers all read from it.
 */

import type { ModuleDef } from "@/lib/modules/types";

export const modules: ModuleDef[] = [];
