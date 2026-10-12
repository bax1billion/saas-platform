/**
 * A one-page PDF holding one JPEG and a few lines of text, built by hand:
 * no library, pure, no DOM, so it runs in the browser, a Lambda or a test.
 * For a snapshot (a map view, a signed page) until the shared export
 * service renders branded documents. Text uses the PDF's built-in
 * Helvetica, so it is limited to printable ASCII; anything else becomes "?".
 */
export interface ImagePdfInput {
  /** Baseline JPEG bytes (what canvas.toDataURL("image/jpeg") produces). */
  jpeg: Uint8Array;
  /** The image's size in pixels. */
  width: number;
  height: number;
  title: string;
  /** Short lines under the title. */
  lines?: string[];
  /** Small print under the image (credits, notices). */
  footer?: string[];
  /** Page size in points. Default US Letter, landscape when the image is wider than tall. */
  page?: { width: number; height: number };
}

const MARGIN = 36;

/** Escapes a PDF literal string and keeps it to printable ASCII. */
export function pdfText(s: string): string {
  return s
    // Locale dates use no-break and narrow no-break spaces; dashes and
    // quotes from typed text read fine as their ASCII cousins.
    .replace(/[\u00a0\u2000-\u200b\u202f]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** The image's box on the page: as large as fits, aspect kept, centred across. */
export function fitImage(img: { width: number; height: number }, box: { x: number; y: number; width: number; height: number }) {
  const scale = Math.min(box.width / img.width, box.height / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + box.height - height, width, height };
}

export function imagePdf(input: ImagePdfInput): Uint8Array {
  const page = input.page ?? (input.width >= input.height ? { width: 792, height: 612 } : { width: 612, height: 792 });
  const lines = input.lines ?? [];
  const footer = input.footer ?? [];

  const titleY = page.height - MARGIN - 14;
  const headerBottom = titleY - 6 - lines.length * 12;
  const footerTop = MARGIN + footer.length * 9 + 4;
  const img = fitImage(input, { x: MARGIN, y: footerTop, width: page.width - 2 * MARGIN, height: headerBottom - 8 - footerTop });

  const ops: string[] = [];
  ops.push(`BT /F2 14 Tf ${MARGIN} ${titleY.toFixed(2)} Td (${pdfText(input.title)}) Tj ET`);
  lines.forEach((l, i) => ops.push(`BT /F1 9 Tf ${MARGIN} ${(titleY - 16 - i * 12).toFixed(2)} Td (${pdfText(l)}) Tj ET`));
  ops.push(`q ${img.width.toFixed(2)} 0 0 ${img.height.toFixed(2)} ${img.x.toFixed(2)} ${img.y.toFixed(2)} cm /Im1 Do Q`);
  footer.forEach((l, i) => ops.push(`BT /F1 7 Tf ${MARGIN} ${(MARGIN + (footer.length - 1 - i) * 9).toFixed(2)} Td (${pdfText(l)}) Tj ET`));
  const content = ops.join("\n");

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    (Array.isArray(body) ? body : [body]).forEach(push);
    push("\nendobj\n");
  };

  // Header with a binary comment, so tools treat the file as binary.
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >>"
  );
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  object(6, [
    `<< /Type /XObject /Subtype /Image /Width ${input.width} /Height ${input.height} /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${input.jpeg.length} >>\nstream\n`,
    input.jpeg,
    "\nendstream",
  ]);
  const contentBytes = enc.encode(content);
  object(7, [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "\nendstream"]);

  const xref = length;
  push(`xref\n0 8\n0000000000 65535 f \n`);
  for (let n = 1; n <= 7; n += 1) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Bytes of a `data:` URL (base64), e.g. from canvas.toDataURL. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
