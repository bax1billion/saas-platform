import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIELD_PRIMARY_PX, FIELD_TARGET_PX, FIELD_TEXT_PX, ICON_MIN_PX } from "./floors";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const rem = (token: string) => Number(new RegExp(`${token}:\\s*([\\d.]+)rem`).exec(css)?.[1]) * 16;

describe("map floors", () => {
  it("are the theme's Field tokens in pixels", () => {
    expect(rem("--text-field")).toBe(FIELD_TEXT_PX);
    expect(rem("--spacing-target")).toBe(FIELD_TARGET_PX);
    expect(rem("--spacing-primary")).toBe(FIELD_PRIMARY_PX);
  });

  it("never draw a symbol under half a tap target", () => {
    expect(ICON_MIN_PX).toBe(FIELD_TARGET_PX / 2);
  });
});
