import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { declaredNames, findCrossModuleRefs, references, stripComments } from "./schema-boundaries";

const root = join(__dirname, "..");
const modulesDir = join(root, "amplify", "data", "modules");

describe("schema boundary checker", () => {
  it("finds declared models, enums and custom types", () => {
    const text = `
  export const widgetModels = {
    WidgetKind: a.enum(['A', 'B']),
    Widget: a
      .model({ kind: a.ref('WidgetKind') }),
    WidgetSummary: a.customType({ n: a.integer() }),
  };`;
    expect([...declaredNames(text)]).toEqual(["WidgetKind", "Widget", "WidgetSummary"]);
  });

  it("ignores references inside comments", () => {
    const text = `
    // never belongsTo('Organization') here
    /* a.ref('SomethingElse') is only an example */
    Widget: a.model({ parent: a.belongsTo('Gadget', 'gadgetId') }),`;
    expect(references(text)).toEqual([{ kind: "belongsTo", target: "Gadget", line: 4 }]);
    expect(stripComments("x // y\n")).toBe("x     \n");
  });

  it("reports a reference to another module's model and allows core names", () => {
    const files = [
      {
        name: "widgets",
        text: `
  Widget: a.model({
    orgId: a.id().required(),
    tier: a.ref('SubscriptionTier'),
    gadget: a.belongsTo('Gadget', 'gadgetId'),
    parts: a.hasMany('WidgetPart', 'widgetId'),
  }),
  WidgetPart: a.model({ widgetId: a.id() }),`,
      },
    ];
    const bad = findCrossModuleRefs(files, new Set(["SubscriptionTier", "Organization"]));
    expect(bad).toEqual([{ file: "widgets", kind: "belongsTo", target: "Gadget", line: 5 }]);
  });
});

describe("amplify/data/modules", () => {
  // A product with no module schema files yet has nothing to check.
  it.skipIf(!existsSync(modulesDir))("never references another module's models (docs/data-coupling.md rule 3)", () => {
    const core = declaredNames(readFileSync(join(root, "amplify", "data", "resource.ts"), "utf8"));
    expect(core.size).toBeGreaterThan(5);
    const files = readdirSync(modulesDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => ({ name: f, text: readFileSync(join(modulesDir, f), "utf8") }));
    expect(files.length).toBeGreaterThan(0);
    const bad = findCrossModuleRefs(files, core);
    expect(
      bad.map((b) => `${b.file}:${b.line} ${b.kind}('${b.target}') is not declared in that file or in core`),
      "cross-module schema references"
    ).toEqual([]);
  });
});
