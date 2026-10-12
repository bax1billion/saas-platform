import { describe, expect, it } from "vitest";
import { dataUrlBytes, fitImage, imagePdf, pdfText } from "./image-pdf";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("imagePdf", () => {
  const pdf = imagePdf({ jpeg, width: 1200, height: 800, title: "Map (view)", lines: ["Line one"], footer: ["Credits"] });
  const text = latin1(pdf);

  it("is a one-page PDF with the JPEG embedded byte for byte", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Count 1");
    expect(text).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
    expect(text).toContain("/Width 1200 /Height 800");
    expect(text).toContain(latin1(jpeg));
  });

  it("picks landscape for a wide image", () => {
    expect(text).toContain("/MediaBox [0 0 792 612]");
    expect(latin1(imagePdf({ jpeg, width: 400, height: 900, title: "t" }))).toContain("/MediaBox [0 0 612 792]");
  });

  it("writes a cross-reference table whose offsets point at each object", () => {
    const xrefAt = Number(text.slice(text.lastIndexOf("startxref") + 10).split("\n")[0]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const entries = text.slice(xrefAt).split("\n").slice(3, 10);
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("escapes the title and keeps stream lengths exact", () => {
    expect(text).toContain("(Map \\(view\\)) Tj");
    const m = /\/Length (\d+) >>\nstream\n/.exec(text.slice(text.indexOf("7 0 obj")))!;
    const start = text.indexOf("7 0 obj") + m.index + m[0].length;
    expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
  });
});

describe("helpers", () => {
  it("keeps text to printable ASCII and escapes PDF specials", () => {
    expect(pdfText("Café (2) \\ ok")).toBe("Caf? \\(2\\) \\\\ ok");
    expect(pdfText("10:00\u202fAM\u00a0\u2014 \u201cKnox\u201d")).toBe('10:00 AM - "Knox"');
  });

  it("fits an image inside a box without stretching it", () => {
    expect(fitImage({ width: 200, height: 100 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 50, width: 100, height: 50 });
  });

  it("decodes a base64 data URL", () => {
    expect(Array.from(dataUrlBytes("data:image/jpeg;base64,/9j/"))).toEqual([0xff, 0xd8, 0xff]);
  });
});
