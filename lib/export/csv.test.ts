import { describe, expect, it } from "vitest";
import { csvCell, renderCsv, tableToCsv } from "./csv";
import type { DocumentModel } from "./model";

const doc = (blocks: DocumentModel["sections"][number]["blocks"]): DocumentModel => ({
  version: 1,
  meta: {
    title: "Rows",
    agencyName: "Agency",
    recordLabel: "Record",
    dataDate: "2026-10-01T00:00:00.000Z",
    confirmedCount: 1,
    unconfirmedCount: 0,
    templateVersion: "t@1",
  },
  sections: [{ id: "s", title: "S", blocks }],
});

describe("csv", () => {
  it("quotes what a spreadsheet could misread and neutralises a formula", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-4")).toBe("'-4");
    expect(csvCell(-4)).toBe("-4.00");
    expect(csvCell(24)).toBe("24.00");
  });

  it("renders the one table, byte-stable", () => {
    const d = doc([{ kind: "table", columns: ["a", "b"], rows: [["1", "x"], ["2", "y,z"]] }]);
    expect(renderCsv(d)).toBe('a,b\n1,x\n2,"y,z"\n');
    expect(renderCsv(d)).toBe(renderCsv(d));
    expect(tableToCsv(["n"], [[1.5]])).toBe("n\n1.50\n");
  });

  it("refuses a document without exactly one table", () => {
    expect(() => renderCsv(doc([{ kind: "paragraph", text: "no table" }]))).toThrow(/exactly one table/);
    expect(() =>
      renderCsv(doc([{ kind: "table", columns: ["a"], rows: [] }, { kind: "table", columns: ["b"], rows: [] }]))
    ).toThrow(/has 2/);
  });
});
