import { describe, expect, it } from "vitest";
import { operationName } from "./appsync-event";

describe("operationName", () => {
  it("reads fieldName from the top of the payload, as the generated request template sends it", () => {
    expect(operationName({ fieldName: "requestExport" })).toBe("requestExport");
  });

  it("still reads a direct resolver's info.fieldName", () => {
    expect(operationName({ info: { fieldName: "getExportDownload" } })).toBe("getExportDownload");
  });

  it("is empty, never a throw, when neither is present", () => {
    expect(operationName({})).toBe("");
    expect(operationName({ info: null })).toBe("");
  });
});
