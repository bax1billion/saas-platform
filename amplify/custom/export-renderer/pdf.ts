import React, { type ReactElement } from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { join } from 'node:path';
import type { Block, DocumentModel, DocumentSection, Figure } from '../../../lib/export/model';

/**
 * The PDF renderer: a document model in, bytes out (docs/spine-services-design.md
 * § 3). Deterministic by construction: the only inputs are the model, the
 * image bytes handed in, the bundled fonts and this file's version. The
 * PDF's creation and modification dates come from the model's data date,
 * never from the clock, so the same snapshot renders to the same bytes.
 *
 * Letter, 0.75 in margins, Inter throughout (bundled, no outside host),
 * a running header with the agency and the record, a footer with the data
 * date, the page number and the model's footer line. Appendices start on a
 * new page. Suggested values never reach here (validateDocument).
 */

export const RENDERER_VERSION = 'react-pdf@1.0.0';

export interface RenderAssets {
  /** Stored object key → image bytes (JPEG or PNG), already resized. */
  images: Map<string, Buffer>;
}

const h = React.createElement;

let fontsRegistered = '';
function registerFonts(fontsDir: string) {
  if (fontsRegistered === fontsDir) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: join(fontsDir, 'Inter-Regular.ttf') },
      { src: join(fontsDir, 'Inter-Bold.ttf'), fontWeight: 700 },
      { src: join(fontsDir, 'Inter-Italic.ttf'), fontStyle: 'italic' },
    ],
  });
  // No hyphenation: a dictionary would make line breaks depend on a
  // library version rather than the text.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = fontsDir;
}

const ink = '#101a2b';
const muted = '#5b6675';
const rule = '#d7dbe2';

const s = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 60, paddingHorizontal: 54, fontFamily: 'Inter', fontSize: 10, lineHeight: 1.4, color: ink },
  header: { position: 'absolute', top: 24, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: muted },
  footer: { position: 'absolute', bottom: 24, left: 54, right: 54, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: muted },
  coverAgency: { fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 28 },
  coverTitle: { fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginBottom: 6 },
  coverSubtitle: { fontSize: 14, color: muted, marginBottom: 24 },
  coverMeta: { marginTop: 12, borderTopWidth: 1, borderTopColor: rule, paddingTop: 12 },
  h1: { fontSize: 16, fontWeight: 700, marginTop: 14, marginBottom: 8 },
  h2: { fontSize: 12.5, fontWeight: 700, marginTop: 12, marginBottom: 5 },
  h3: { fontSize: 10.5, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  num: { color: muted, fontWeight: 400 },
  p: { marginBottom: 6 },
  note: { marginBottom: 6, fontStyle: 'italic', color: muted },
  mutedText: { color: muted },
  fieldsRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: rule, paddingVertical: 3 },
  fieldLabel: { width: '34%', color: muted, paddingRight: 6 },
  fieldValue: { width: '66%' },
  fieldsCols: { flexDirection: 'row', gap: 12 },
  fieldsCol: { width: '50%' },
  table: { marginBottom: 8, borderTopWidth: 1, borderTopColor: ink },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: rule },
  th: { fontWeight: 700, paddingVertical: 4, paddingRight: 6, fontSize: 9 },
  td: { paddingVertical: 3, paddingRight: 6, fontSize: 9 },
  li: { flexDirection: 'row', marginBottom: 2 },
  bullet: { width: 12 },
  figGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  figCard: { marginBottom: 12 },
  figBox: { borderWidth: 0.5, borderColor: rule, backgroundColor: '#f4f4f1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  figImg: { objectFit: 'contain', width: '100%', height: '100%' },
  figLabel: { fontWeight: 700, marginTop: 4, fontSize: 9 },
  figDetail: { color: muted, fontSize: 8 },
});

/** Figure box sizes per layout (points; the page body is 504 wide). */
const FIG = {
  2: { w: 504, h: 300, cols: 1 },
  4: { w: 246, h: 190, cols: 2 },
  6: { w: 246, h: 118, cols: 2 },
} as const;

function heading(level: 1 | 2 | 3, text: string, number?: string) {
  const style = level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
  return h(Text, { style }, number ? [h(Text, { key: 'n', style: s.num }, `${number}  `), text] : text);
}

function fields(rows: { label: string; value: string }[], columns: 1 | 2 = 1) {
  const row = (r: { label: string; value: string }, i: number) =>
    h(
      View,
      { key: i, style: s.fieldsRow, wrap: false },
      h(Text, { style: s.fieldLabel }, r.label),
      h(Text, { style: s.fieldValue }, r.value || ' ')
    );
  if (columns === 1 || rows.length < 4) return h(View, { style: s.p }, rows.map(row));
  const half = Math.ceil(rows.length / 2);
  return h(
    View,
    { style: [s.p, s.fieldsCols] },
    h(View, { style: s.fieldsCol }, rows.slice(0, half).map(row)),
    h(View, { style: s.fieldsCol }, rows.slice(half).map((r, i) => row(r, i + half)))
  );
}

function table(columns: string[], rows: string[][], widths?: number[]) {
  const total = widths?.reduce((a, b) => a + b, 0) ?? columns.length;
  const w = (i: number) => `${((widths?.[i] ?? 1) / total) * 100}%`;
  return h(
    View,
    { style: s.table },
    h(View, { style: s.tr, wrap: false }, columns.map((c, i) => h(Text, { key: i, style: [s.th, { width: w(i) }] }, c))),
    rows.map((r, ri) =>
      h(View, { key: ri, style: s.tr, wrap: false }, columns.map((_, i) => h(Text, { key: i, style: [s.td, { width: w(i) }] }, r[i] ?? '')))
    )
  );
}

function figures(perPage: 2 | 4 | 6, items: Figure[], assets: RenderAssets) {
  const box = FIG[perPage];
  return h(
    View,
    { style: s.figGrid },
    items.map((f) => {
      const bytes = f.asset ? assets.images.get(f.asset.key) : undefined;
      return h(
        View,
        { key: f.id, style: [s.figCard, { width: box.w }], wrap: false },
        h(
          View,
          { style: [s.figBox, { width: box.w, height: box.h }] },
          bytes ? h(Image, { src: bytes, style: s.figImg }) : h(Text, { style: s.figDetail }, f.asset ? 'Image unavailable' : 'No file on record')
        ),
        h(Text, { style: s.figLabel }, `${f.label}${f.caption ? `  ${f.caption}` : ''}`),
        f.detail ? h(Text, { style: s.figDetail }, f.detail) : null
      );
    })
  );
}

function block(b: Block, i: number, assets: RenderAssets): ReactElement | null {
  switch (b.kind) {
    case 'heading':
      return h(View, { key: i }, heading(b.level, b.text, b.number));
    case 'paragraph':
      return h(Text, { key: i, style: b.style === 'note' ? s.note : b.style === 'muted' ? [s.p, s.mutedText] : s.p }, b.text);
    case 'fields':
      return h(View, { key: i }, fields(b.rows, b.columns));
    case 'table':
      return h(View, { key: i }, table(b.columns, b.rows, b.widths));
    case 'list':
      return h(
        View,
        { key: i, style: s.p },
        b.items.map((t, j) => h(View, { key: j, style: s.li }, h(Text, { style: s.bullet }, '•'), h(Text, { style: { flex: 1 } }, t)))
      );
    case 'figures':
      return h(View, { key: i }, figures(b.perPage, b.items, assets));
    case 'pageBreak':
      return h(View, { key: i, break: true });
    default:
      return null;
  }
}

function section(sec: DocumentSection, assets: RenderAssets) {
  return h(
    View,
    { key: sec.id, break: sec.appendix === true },
    heading(1, sec.title, sec.number),
    sec.blocks.map((b, i) => block(b, i, assets))
  );
}

function chrome(doc: DocumentModel) {
  const day = doc.meta.dataDate.slice(0, 10);
  return [
    h(View, { key: 'hdr', style: s.header, fixed: true }, h(Text, null, doc.meta.agencyName), h(Text, null, doc.meta.recordLabel)),
    h(
      View,
      { key: 'ftr', style: s.footer, fixed: true },
      h(Text, null, `Data as of ${day}`),
      h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}` }),
      h(Text, null, doc.meta.footer ?? '')
    ),
  ];
}

function cover(doc: DocumentModel) {
  const m = doc.meta;
  const rows: { label: string; value: string }[] = [
    { label: 'Record', value: m.recordLabel },
    { label: 'Data as of', value: m.dataDate.replace('T', ' ').slice(0, 16) + ' UTC' },
    { label: 'Confirmed values', value: String(m.confirmedCount) },
  ];
  if (m.readinessPct !== undefined) rows.push({ label: 'Readiness', value: `${m.readinessPct}%${m.openItems !== undefined ? `, ${m.openItems} open item${m.openItems === 1 ? '' : 's'}` : ''}` });
  if (m.preparedBy) rows.push({ label: 'Prepared by', value: m.preparedBy });
  if (m.templateName) rows.push({ label: 'Template', value: m.templateName });
  return h(
    View,
    { key: 'cover' },
    h(Text, { style: s.coverAgency }, m.agencyName.toUpperCase()),
    h(Text, { style: s.coverTitle }, m.title),
    m.subtitle ? h(Text, { style: s.coverSubtitle }, m.subtitle) : null,
    h(View, { style: s.coverMeta }, fields(rows))
  );
}

export function buildDocument(doc: DocumentModel, assets: RenderAssets): ReactElement<DocumentProps> {
  const at = new Date(doc.meta.dataDate);
  const body = doc.sections.filter((x) => !x.appendix);
  const appendices = doc.sections.filter((x) => x.appendix);
  return h(
    Document as unknown as React.FunctionComponent<DocumentProps>,
    {
      title: `${doc.meta.recordLabel}: ${doc.meta.title}`,
      author: doc.meta.agencyName,
      producer: RENDERER_VERSION,
      creator: doc.meta.templateVersion,
      creationDate: at,
      modificationDate: at,
    },
    h(
      Page,
      { size: 'LETTER', style: s.page },
      ...chrome(doc),
      cover(doc),
      h(View, { break: true }),
      body.map((sec) => section(sec, assets)),
      appendices.map((sec) => section(sec, assets))
    )
  );
}

/** Render a validated document model to PDF bytes. */
export async function renderPdf(doc: DocumentModel, assets: RenderAssets, fontsDir: string): Promise<Buffer> {
  registerFonts(fontsDir);
  return renderToBuffer(buildDocument(doc, assets));
}

/** Pages in a rendered PDF (counts page objects; good enough for the job row). */
export function countPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const m = text.match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}
