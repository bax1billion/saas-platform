import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MODEL_VERSION,
  assetKeys,
  documentSummary,
  exportFileName,
  validateDocument,
  type DocumentModel,
} from "./model";

const base = (): DocumentModel => ({
  version: DOCUMENT_MODEL_VERSION,
  meta: {
    title: "Incident report",
    agencyName: "Example Agency",
    recordLabel: "Case 26-0412",
    dataDate: "2026-10-05T14:00:00.000Z",
    confirmedCount: 12,
    unconfirmedCount: 0,
    templateVersion: "example-report@1",
  },
  sections: [
    { id: "s1", title: "Overview", number: "1", blocks: [{ kind: "fields", rows: [{ label: "Address", value: "1420 Foundry Street" }] }] },
    {
      id: "a",
      title: "Photo log",
      number: "A",
      appendix: true,
      blocks: [
        {
          kind: "figures",
          perPage: 4,
          items: [
            { id: "m1", label: "1", asset: { key: "uploads/inv-1/a.jpg" } },
            { id: "m2", label: "2", asset: { key: "uploads/inv-1/a.jpg" } },
            { id: "m3", label: "3" },
          ],
        },
      ],
    },
  ],
});

describe("validateDocument", () => {
  it("accepts a complete document", () => {
    expect(validateDocument(base())).toEqual([]);
  });

  it("refuses an unconfirmed value in plain words", () => {
    const d = base();
    d.meta.unconfirmedCount = 1;
    expect(validateDocument(d)).toEqual(["1 suggested value is not confirmed. Nothing exports until every one is confirmed."]);
  });

  it("names every missing header field and duplicate section", () => {
    const d = base();
    d.meta.agencyName = "";
    d.meta.dataDate = "yesterday";
    d.sections.push({ ...d.sections[0] });
    const errors = validateDocument(d);
    expect(errors).toContain("The document names no agency.");
    expect(errors).toContain("The data date is missing or not a date.");
    expect(errors).toContain('Section id "s1" is used twice.');
  });

  it("refuses something that is not a document at all", () => {
    expect(validateDocument(null)).toEqual(["The document is empty."]);
    expect(validateDocument({ version: 2 })).toContain("Unknown document version 2.");
  });
});

describe("assets and names", () => {
  it("lists each stored object once, in order", () => {
    expect(assetKeys(base())).toEqual(["uploads/inv-1/a.jpg"]);
    expect(documentSummary(base())).toEqual({ sections: 2, blocks: 2, figures: 3, assets: 1 });
  });

  it("builds a stable file name from the header", () => {
    expect(exportFileName(base(), "pdf")).toBe("ExampleAgency-Case260412-IncidentReport-2026-10-05-v1.pdf");
  });
});
