import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_MODEL_VERSION, type DocumentModel } from '../../../lib/export/model';
import { countPages, renderPdf } from './pdf';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), 'fonts');

/** A fixture that exercises every block kind. */
export const fixture = (): DocumentModel => ({
  version: DOCUMENT_MODEL_VERSION,
  meta: {
    title: 'Incident report',
    subtitle: 'Harrowgate Cabinet and Millwork, 1420 Foundry Street',
    agencyName: 'Example Agency',
    recordLabel: 'Case 26-0412',
    dataDate: '2026-10-05T14:00:00.000Z',
    confirmedCount: 31,
    unconfirmedCount: 0,
    readinessPct: 72,
    openItems: 5,
    preparedBy: 'M. Torres, FM-114',
    templateName: 'Agency Standard (2024)',
    templateVersion: 'example-report@1',
  },
  sections: [
    {
      id: 'incident',
      number: '1',
      title: 'Overview',
      blocks: [
        { kind: 'fields', columns: 2, rows: [
          { label: 'FD case number', value: '26-0412' },
          { label: 'PD case number', value: '' },
          { label: 'Incident', value: 'Sep 11, 2026 02:47' },
          { label: 'Address', value: '1420 Foundry Street' },
        ] },
        { kind: 'paragraph', style: 'note', text: 'Readiness is a completeness measure, not a lock.' },
      ],
    },
    {
      id: 'people',
      number: '4',
      title: 'Person(s) involved',
      blocks: [
        { kind: 'table', columns: ['Role', 'Name', 'Phone', 'Interviewed'], widths: [1, 2, 1.2, 1.2], rows: [
          ['Occupant', 'Dana Whitlock', '555-0100', 'Sep 11, 2026'],
          ['Witness', 'Sam Okafor', '', ''],
        ] },
      ],
    },
    {
      id: 'narrative',
      number: '10',
      title: 'Narrative',
      blocks: [
        { kind: 'paragraph', text: 'I arrived at 03:05 and observed heavy smoke from the B side. '.repeat(12) },
        { kind: 'list', items: ['Water on at 02:54', 'Primary search complete 03:10', 'Fire under control 03:40'] },
      ],
    },
    {
      id: 'photos',
      number: 'A',
      title: 'Photo log',
      appendix: true,
      blocks: [
        { kind: 'figures', perPage: 4, items: [
          { id: 'm1', label: '1', caption: 'B side, arrival', detail: 'Photo, Sep 11 02:51, sha256 3f2a…', asset: { key: 'uploads/inv-1/one.png' } },
          { id: 'm2', label: '2', caption: 'Shop interior', asset: { key: 'uploads/inv-1/missing.jpg' } },
          { id: 'm3', label: '3', caption: 'Sketch, no file' },
        ] },
      ],
    },
    {
      id: 'na',
      number: 'B',
      title: 'Items marked not applicable',
      appendix: true,
      blocks: [{ kind: 'table', columns: ['Item', 'Reason'], widths: [1, 2], rows: [['Vehicle inspection', 'No vehicle involved']] }],
    },
  ],
});

// A 1x1 PNG so the figure path with real bytes is exercised.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

describe('renderPdf', () => {
  it('renders the fixture to a multi-page PDF and the same bytes twice', async () => {
    const assets = { images: new Map([['uploads/inv-1/one.png', png]]) };
    const a = await renderPdf(fixture(), assets, fontsDir);
    const b = await renderPdf(fixture(), assets, fontsDir);
    expect(a.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPages(a)).toBeGreaterThanOrEqual(3);
    expect(createHash('sha256').update(a).digest('hex')).toBe(createHash('sha256').update(b).digest('hex'));
    expect(a.toString('latin1')).toContain('Inter');
  }, 30_000);

  it('changes the bytes when the data changes, not when the clock does', async () => {
    const assets = { images: new Map<string, Buffer>() };
    const a = await renderPdf(fixture(), assets, fontsDir);
    const changed = fixture();
    changed.meta.confirmedCount = 32;
    const b = await renderPdf(changed, assets, fontsDir);
    expect(a.equals(b)).toBe(false);
  }, 30_000);
});
