/**
 * The CSV renderer for the export service (docs/spine-services-design.md
 * § 3, step E7): a document whose body is exactly one table renders as a
 * CSV file. Pure, so the renderer Lambda, a product's tests and the
 * browser produce the same bytes. The same document model that renders a
 * PDF renders here; the header fields (agency, data date, confirmed count)
 * are stamped in the job row, not in the file, because a payroll or
 * spreadsheet import wants rows and nothing else.
 */
import type { DocumentModel } from "./model";

/** One cell. Numbers print with two decimals so a file is byte-stable for
 *  the same data. Anything a spreadsheet could misread is quoted, and a
 *  leading formula character in text is neutralised (CSV injection). */
export function csvCell(v: string | number): string {
  const s = typeof v === "number" ? v.toFixed(2) : v;
  const safe = typeof v !== "number" && /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Columns then rows, LF line endings, a trailing newline. */
export function tableToCsv(columns: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

/** The document's one table as CSV. A document with no table, or more
 *  than one, is not a CSV export: the provider chose the wrong format. */
export function renderCsv(doc: DocumentModel): string {
  const tables = doc.sections.flatMap((s) => s.blocks.filter((b) => b.kind === "table"));
  if (tables.length !== 1) {
    throw new Error(`A CSV export needs exactly one table; this document has ${tables.length}.`);
  }
  return tableToCsv(tables[0].columns, tables[0].rows);
}
