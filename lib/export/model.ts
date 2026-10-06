/**
 * The document model: what sits between a product's data and a rendered
 * file (docs/spine-services-design.md § 3). A product builds one of these
 * from its own records; the renderers (PDF today, Word next) read only
 * this. Pure data, no DOM or Next imports, so the same module runs in the
 * browser, in a Lambda and in tests.
 *
 * Rules the model carries for every export (the founder's guide 12):
 *   - the agency header, the data date and the confirmed count print on
 *     the document (`meta`);
 *   - nothing unconfirmed exports: a model with `unconfirmedCount > 0`
 *     fails `validateDocument`, so no renderer ever sees one;
 *   - every figure names the stored object it came from (`asset`), never
 *     a copy of the bytes, so the manifest can list what was rendered.
 */

export const DOCUMENT_MODEL_VERSION = 1 as const;

export interface DocumentMeta {
  /** Document title, e.g. "Incident report". */
  title: string;
  subtitle?: string;
  /** The agency as it prints in the header (Brand Kit later). */
  agencyName: string;
  /** The record this document is about, e.g. "Case 26-0413". */
  recordLabel: string;
  /** ISO datetime the data was read. Printed as the data date and used as
   *  the file's creation and modification dates, so the bytes depend on
   *  the data, never on the clock. */
  dataDate: string;
  confirmedCount: number;
  unconfirmedCount: number;
  readinessPct?: number;
  openItems?: number;
  preparedBy?: string;
  templateName?: string;
  /** `<template id>@<version>`; stamped in the manifest. */
  templateVersion: string;
  /** Printed once, small, in the footer. */
  footer?: string;
}

export interface FieldRow {
  label: string;
  value: string;
}

export interface Figure {
  id: string;
  /** Short label, e.g. "2" or "2a". */
  label: string;
  caption?: string;
  /** One line under the caption: type, captured date, fingerprint. */
  detail?: string;
  /** The stored object to render. Absent for items with no file. */
  asset?: { key: string; contentType?: string };
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; number?: string }
  | { kind: "paragraph"; text: string; style?: "normal" | "note" | "muted" }
  | { kind: "fields"; rows: FieldRow[]; columns?: 1 | 2 }
  | { kind: "table"; columns: string[]; rows: string[][]; widths?: number[] }
  | { kind: "list"; items: string[] }
  | { kind: "figures"; perPage: 2 | 4 | 6; items: Figure[] }
  | { kind: "pageBreak" };

export interface DocumentSection {
  id: string;
  title: string;
  /** Outline number, e.g. "6" or "A". */
  number?: string;
  blocks: Block[];
  /** Appendices print after the body, each on a new page. */
  appendix?: boolean;
}

export interface DocumentModel {
  version: typeof DOCUMENT_MODEL_VERSION;
  meta: DocumentMeta;
  sections: DocumentSection[];
}

/** Every stored object a renderer must fetch, in document order, deduplicated. */
export function assetKeys(doc: DocumentModel): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.kind !== "figures") continue;
      for (const f of b.items) {
        if (f.asset && !seen.has(f.asset.key)) {
          seen.add(f.asset.key);
          out.push(f.asset.key);
        }
      }
    }
  }
  return out;
}

/**
 * The problems that make a document unexportable, in plain words. Empty
 * means render it. The unconfirmed gate lives here on purpose: a product
 * can forget to check, a renderer never can.
 */
export function validateDocument(doc: unknown): string[] {
  const errors: string[] = [];
  const d = doc as Partial<DocumentModel> | null;
  if (!d || typeof d !== "object") return ["The document is empty."];
  if (d.version !== DOCUMENT_MODEL_VERSION) errors.push(`Unknown document version ${String(d.version)}.`);
  const m = d.meta;
  if (!m) return [...errors, "The document has no header."];
  if (!m.title?.trim()) errors.push("The document has no title.");
  if (!m.agencyName?.trim()) errors.push("The document names no agency.");
  if (!m.recordLabel?.trim()) errors.push("The document names no record.");
  if (!m.dataDate || Number.isNaN(Date.parse(m.dataDate))) errors.push("The data date is missing or not a date.");
  if (!m.templateVersion?.trim()) errors.push("The template version is missing.");
  if (typeof m.unconfirmedCount !== "number" || m.unconfirmedCount < 0) {
    errors.push("The unconfirmed count is missing.");
  } else if (m.unconfirmedCount > 0) {
    errors.push(
      `${m.unconfirmedCount} suggested value${m.unconfirmedCount === 1 ? " is" : "s are"} not confirmed. Nothing exports until every one is confirmed.`
    );
  }
  if (!Array.isArray(d.sections) || d.sections.length === 0) errors.push("The document has no sections.");
  else {
    const ids = new Set<string>();
    d.sections.forEach((s, i) => {
      if (!s?.id) errors.push(`Section ${i + 1} has no id.`);
      else if (ids.has(s.id)) errors.push(`Section id "${s.id}" is used twice.`);
      else ids.add(s.id);
      if (!s?.title?.trim()) errors.push(`Section ${s?.id ?? i + 1} has no title.`);
      if (!Array.isArray(s?.blocks)) errors.push(`Section ${s?.id ?? i + 1} has no blocks.`);
    });
  }
  return errors;
}

/** A stable file name: `<Agency>-<Record>-<Document>-<data date>-v1.<ext>`. */
export function exportFileName(doc: DocumentModel, ext: "pdf" | "docx"): string {
  const part = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
      .slice(0, 40) || "Export";
  const day = doc.meta.dataDate.slice(0, 10);
  return `${part(doc.meta.agencyName)}-${part(doc.meta.recordLabel)}-${part(doc.meta.title)}-${day}-v1.${ext}`;
}

/** Counts the figures and text blocks, for logs and the manifest. */
export function documentSummary(doc: DocumentModel): { sections: number; blocks: number; figures: number; assets: number } {
  let blocks = 0;
  let figures = 0;
  for (const s of doc.sections) {
    blocks += s.blocks.length;
    for (const b of s.blocks) if (b.kind === "figures") figures += b.items.length;
  }
  return { sections: doc.sections.length, blocks, figures, assets: assetKeys(doc).length };
}
