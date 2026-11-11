// @vitest-environment node
import { HEARING_CHECK, migrate } from '@clearly/core';
import { FIXTURES } from '@clearly/core/testing';
import fontDataUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?inline';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildResultsPdf, pdfFileName } from './pdf.ts';
import { PDF_COLOURS } from './pdfColours.ts';

function dataUrlBytes(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

describe('results PDF', () => {
  it('builds a one-page PDF with the self-hosted font, metadata and the chart', async () => {
    const record = migrate(HEARING_CHECK, FIXTURES['HearingCheck']?.[1]);
    const bytes = await buildResultsPdf(record, PDF_COLOURS, dataUrlBytes(fontDataUrl));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Clearly hearing chart');
    // The embedded font is ours, not a standard PDF font.
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw).toMatch(/\/BaseFont \/AtkinsonHyperlegibleNext-Regular/);
    expect(pdfFileName(record)).toBe('Clearly hearing chart 2026-11-09.pdf');
  });
});
