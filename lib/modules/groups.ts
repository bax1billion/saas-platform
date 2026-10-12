import { activeModules, type ModuleDef } from "./index";

/**
 * Sidebar sections for the module lineup: one per `ModuleDef.group` in
 * registry order (ungrouped modules fall under "Modules"). A product with a
 * handful of modules and no groups gets the single "Modules" section.
 * Built once at module scope; both shells read it.
 */
export const moduleGroups: [string, ModuleDef[]][] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, ModuleDef[]>();
  for (const m of activeModules) {
    const g = m.group ?? "Modules";
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)!.push(m);
  }
  return order.map((g) => [g, byGroup.get(g)!]);
})();
