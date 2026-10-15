import { describe, expect, it } from "vitest";
import {
  COLOR_PRESETS,
  contrastColor,
  customSymbolInner,
  customSymbolSvg,
  CUSTOM_SHAPES,
  FALLBACK_COLOR,
  isHexColor,
  normalizeGlyphText,
  PICTOGRAMS,
  safeColor,
  unknownSymbolSvg,
  validateCustomSymbol,
  type CustomSymbolInput,
} from "./custom-symbols";

describe("colour handling", () => {
  it("accepts only #RRGGBB", () => {
    expect(isHexColor("#D14A2E")).toBe(true);
    expect(isHexColor("#d14a2e")).toBe(true);
    for (const bad of ["D14A2E", "#D14A2", "#D14A2EE", "red", "#GGGGGG", "", null, 7]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });

  it("falls back to grey for anything invalid, and normalises case", () => {
    expect(safeColor("#d14a2e")).toBe("#D14A2E");
    expect(safeColor('"><script>')).toBe(FALLBACK_COLOR);
    expect(safeColor(undefined)).toBe(FALLBACK_COLOR);
  });

  it("chooses a legible glyph colour", () => {
    expect(contrastColor("#FFFFFF")).toBe("#101A2B");
    expect(contrastColor("#F2D024")).toBe("#101A2B"); // yellow -> dark
    expect(contrastColor("#101A2B")).toBe("#FFFFFF");
    expect(contrastColor("#2E6DA4")).toBe("#FFFFFF"); // blue -> light
    expect(contrastColor("not a colour")).toBe("#FFFFFF"); // grey fallback
  });

  it("every preset is a valid colour", () => {
    for (const c of COLOR_PRESETS) expect(isHexColor(c)).toBe(true);
  });
});

describe("normalizeGlyphText", () => {
  it("trims and limits to three characters", () => {
    expect(normalizeGlyphText("  FG  ")).toBe("FG");
    expect(normalizeGlyphText("ABCDEF")).toBe("ABC");
    expect(normalizeGlyphText(undefined)).toBe("");
  });

  it("counts an emoji as one character, not two halves", () => {
    expect(normalizeGlyphText("🔥🔥🔥🔥")).toBe("🔥🔥🔥");
    expect(Array.from(normalizeGlyphText("🔥A"))).toHaveLength(2);
  });
});

describe("customSymbolSvg", () => {
  it("draws every shape with glyph text", () => {
    for (const shape of CUSTOM_SHAPES) {
      const svg = customSymbolSvg({ shape, color: "#2E6DA4", glyphText: "FG" }, 32);
      expect(svg).toContain("<svg");
      expect(svg).toContain(">FG</text>");
      expect(svg).toContain('fill="#2E6DA4"');
    }
  });

  it("draws every pictogram, in a legible colour", () => {
    for (const p of PICTOGRAMS) {
      const svg = customSymbolSvg({ shape: "CIRCLE", color: "#F2D024", pictogram: p.key }, 32);
      expect(svg).toContain('color="#101A2B"');
      expect(svg).toContain("currentColor");
    }
  });

  it("a pictogram wins over glyph text", () => {
    const svg = customSymbolSvg({ shape: "SQUARE", color: "#2E6DA4", glyphText: "XX", pictogram: "drop" }, 32);
    expect(svg).not.toContain("<text");
  });

  it("escapes glyph text so it can never become markup", () => {
    const svg = customSymbolSvg({ shape: "CIRCLE", color: "#2E6DA4", glyphText: "<s>" }, 32);
    expect(svg).toContain("&lt;s&gt;");
    expect(svg).not.toContain("<s>");
  });

  it("neutralises hostile stored values", () => {
    const svg = customSymbolSvg(
      {
        shape: '"><script>alert(1)</script>',
        color: '"><script>alert(1)</script>',
        glyphText: '"><script>alert(1)</script>',
        pictogram: '"><script>alert(1)</script>',
      },
      32
    );
    expect(svg).not.toContain("<script");
    // Unknown shape -> circle, invalid colour -> grey.
    expect(svg).toContain("<circle");
    expect(svg).toContain(FALLBACK_COLOR);
  });

  it("draws a bare shape when there is no glyph at all", () => {
    const inner = customSymbolInner({ shape: "DIAMOND", color: "#D14A2E" });
    expect(inner).not.toContain("<text");
    expect(inner).not.toContain("<g ");
  });

  it("has a stand-in for a symbol that can't be found", () => {
    expect(unknownSymbolSvg(24)).toContain(">?</text>");
  });
});

describe("validateCustomSymbol", () => {
  const valid: CustomSymbolInput = {
    name: "Flood gate control",
    shape: "SQUARE",
    color: "#2E6DA4",
    glyphText: "FG",
    pictogram: null,
  };

  it("accepts a complete symbol", () => {
    expect(validateCustomSymbol(valid, [])).toEqual({});
  });

  it("accepts a pictogram instead of text", () => {
    expect(validateCustomSymbol({ ...valid, glyphText: "", pictogram: "waves" }, [])).toEqual({});
  });

  it("requires a name, within the length limit", () => {
    expect(validateCustomSymbol({ ...valid, name: "   " }, []).name).toBeTruthy();
    expect(validateCustomSymbol({ ...valid, name: "x".repeat(41) }, []).name).toBeTruthy();
    expect(validateCustomSymbol({ ...valid, name: "x".repeat(40) }, []).name).toBeUndefined();
  });

  it("rejects a name already in use, ignoring case and padding", () => {
    expect(validateCustomSymbol({ ...valid, name: "  gate, north " }, ["Gate, north"]).name).toBeTruthy();
    expect(validateCustomSymbol(valid, ["Gate, north"]).name).toBeUndefined();
  });

  it("requires a glyph: text or a pictogram", () => {
    expect(validateCustomSymbol({ ...valid, glyphText: "  " }, []).glyph).toBeTruthy();
    expect(validateCustomSymbol({ ...valid, glyphText: "", pictogram: "nope" }, []).glyph).toBeTruthy();
  });

  it("rejects a bad shape or colour", () => {
    expect(validateCustomSymbol({ ...valid, shape: "STAR" }, []).shape).toBeTruthy();
    expect(validateCustomSymbol({ ...valid, color: "blue" }, []).color).toBeTruthy();
  });
});
