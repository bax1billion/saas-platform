import { describe, expect, it } from "vitest";
import { interfaceKeys, missingColumns, modelColumns, stripCommentsAndStrings, tableRowMap } from "./schema-columns";

const SCHEMA = `
import { a } from '@aws-amplify/backend';

const READ_ALL = (allow) => [allow.groups(['Admin', 'Member', 'Viewer']).to(['read'])];

export const widgetModels = {
  WidgetKind: a.enum(['A', 'B']),

  /** A widget. { braces in a comment: ignored } */
  Widget: a
    .model({
      orgId: a.id().required(),
      // name: a commented-out column
      name: a.string().required(),
      tags: a.string().array(),
      status: a.ref('WidgetKind').authorization(READ_ALL),
      note: a.string(), /* trailing: comment */
      label: a.string().default('x: {y}'),
      organization: a.belongsTo('Organization', 'orgId'),
      sortDate: a.datetime().required(),
    })
    .secondaryIndexes((index) => [index('orgId').sortKeys(['sortDate']).queryField('widgetsByOrg')])
    .authorization((allow) => [allow.group('Admin').to(['create', 'read'])]),

  WidgetPart: a.model({
    orgId: a.id().required(),
    widgetId: a.id().required(),
    answersJson: a.json(),
  }).authorization((allow) => [allow.group('Admin')]),

  addWidget: a
    .mutation()
    .arguments({ name: a.string().required() })
    .returns(a.ref('Widget')),
};
`;

const ROWS = `
export interface WidgetRow {
  id: string;
  orgId: string;
  name: string;
  tags?: (string | null)[] | null;
  /** Null while pending. */
  status?: "A" | "B" | null;
  note?: string | null; // trailing comment with colon: here
  nested?: { inner: string; deeper: { x: number } } | null;
  sortDate: string;
}

export interface PartRow {
  id: string
  orgId: string
  widgetId: string
  answersJson: Record<string, unknown>
}

export interface WidgetTables {
  Widget: WidgetRow;
  WidgetPart: PartRow;
}

export type WidgetWrite =
  | { [K in keyof WidgetTables]: { op: "create"; table: K; row: WidgetTables[K] } }[keyof WidgetTables];
`;

describe("stripCommentsAndStrings", () => {
  it("drops comments and empties string literals", () => {
    expect(stripCommentsAndStrings(`a: 'x: {y}', // c: d\n/* e */ b: "z"`)).toBe(`a: "", \n b: ""`);
  });
});

describe("modelColumns", () => {
  const models = modelColumns(SCHEMA);

  it("finds every model, whatever the line break before .model", () => {
    expect([...models.keys()]).toEqual(["Widget", "WidgetPart"]);
  });

  it("lists the top-level fields only, ignoring comments, strings and chained calls", () => {
    expect([...models.get("Widget")!]).toEqual(["orgId", "name", "tags", "status", "note", "label", "organization", "sortDate"]);
    expect([...models.get("WidgetPart")!]).toEqual(["orgId", "widgetId", "answersJson"]);
  });
});

describe("interfaceKeys", () => {
  it("reads optional and required members, with or without semicolons, past nested object types", () => {
    expect([...interfaceKeys(ROWS, "WidgetRow")]).toEqual(["id", "orgId", "name", "tags", "status", "note", "nested", "sortDate"]);
    expect([...interfaceKeys(ROWS, "PartRow")]).toEqual(["id", "orgId", "widgetId", "answersJson"]);
  });

  it("names a missing interface", () => {
    expect(() => interfaceKeys(ROWS, "Nope")).toThrow(/Nope/);
  });
});

describe("tableRowMap", () => {
  it("maps each table to its row type", () => {
    expect([...tableRowMap(ROWS, "WidgetTables")]).toEqual([
      ["Widget", "WidgetRow"],
      ["WidgetPart", "PartRow"],
    ]);
  });
});

describe("missingColumns", () => {
  it("ignores the generated keys and names the rest that the model lacks", () => {
    expect(missingColumns(["id", "createdAt", "orgId", "colour"], new Set(["orgId"]))).toEqual(["colour"]);
    expect(missingColumns(["orgId"], undefined)).toEqual(["(model not found in schema)"]);
  });
});
