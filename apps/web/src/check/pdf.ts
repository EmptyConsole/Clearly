// The results PDF: the audiogram drawn as vectors, date, method, headphones, reliability and the
// disclaimer, in the self-hosted Atkinson Hyperlegible Next font. pdf-lib and fontkit load only
// when the person taps Save PDF.

import { BAND_FREQUENCIES_HZ, type HearingCheckRecord } from '@clearly/core';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { t, type MessageId } from '../copy/en.ts';
import { methodLabel } from './methodLabel.ts';
import { seriesFromAudiogram } from '../ui/audiogramData.ts';

/** PDF colours: the light-theme ear and text token values, as 0..1 RGB. */
export interface PdfColours {
  readonly text: readonly [number, number, number];
  readonly muted: readonly [number, number, number];
  readonly grid: readonly [number, number, number];
  readonly right: readonly [number, number, number];
  readonly left: readonly [number, number, number];
}

export async function buildResultsPdf(
  record: HearingCheckRecord,
  colours: PdfColours,
  fontBytes?: ArrayBuffer,
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb, degrees, LineCapStyle }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkitModule.default);
  const bytes = fontBytes ?? (await (await fetch(fontUrl)).arrayBuffer());
  const font = await doc.embedFont(bytes, { subset: true });
  doc.setTitle(t('pdf.title'));
  doc.setCreator(t('app.name'));
  doc.setProducer(t('app.name'));
  doc.setCreationDate(new Date(record.createdAt));

  const page = doc.addPage([595.28, 841.89]); // A4 in points
  const { width, height } = page.getSize();
  const margin = 56;
  const c = (v: readonly [number, number, number]) => rgb(v[0], v[1], v[2]);
  let y = height - margin;

  const text = (s: string, size: number, colour = colours.text) => {
    page.drawText(s, { x: margin, y, size, font, color: c(colour) });
    y -= size * 1.5;
  };
  const wrap = (s: string, size: number, maxWidth: number): string[] => {
    const words = s.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const date = new Date(record.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' });
  text(t('pdf.title'), 22);
  y -= 4;
  text(t('pdf.date', { date }), 12);
  text(t('pdf.method', { method: methodLabel(record.audiogram.method) }), 12);
  text(
    record.output === 'speakers'
      ? t('pdf.speakers')
      : t('pdf.headphones', { headphones: record.headphoneName }),
    12,
  );
  if (record.audiogram.reliability) {
    text(
      t('pdf.reliability', {
        reliability: t(`results.reliability.${record.audiogram.reliability}` as MessageId),
      }),
      12,
    );
  }
  y -= 12;

  // Audiogram: log frequency across, dB increasing downwards.
  const series = seriesFromAudiogram(record.audiogram);
  const values = [...series.left, ...series.right].map((p) => p.lossDb ?? 0);
  const maxDb = Math.max(80, Math.ceil((Math.max(...values) + 10) / 10) * 10);
  const minDb = -10;
  const box = { x: margin + 36, y: y - 300, w: width - 2 * margin - 36, h: 280 };
  const px = (hz: number) => box.x + (Math.log2(hz / 250) / Math.log2(32)) * box.w;
  const py = (db: number) => box.y + box.h - ((db - minDb) / (maxDb - minDb)) * box.h;
  for (let d = minDb; d <= maxDb; d += 10) {
    page.drawLine({
      start: { x: box.x, y: py(d) },
      end: { x: box.x + box.w, y: py(d) },
      thickness: d === 0 ? 1.2 : 0.5,
      color: c(colours.grid),
    });
    page.drawText(String(d), {
      x: box.x - 24,
      y: py(d) - 3,
      size: 8,
      font,
      color: c(colours.muted),
    });
  }
  for (const hz of BAND_FREQUENCIES_HZ) {
    page.drawLine({
      start: { x: px(hz), y: box.y },
      end: { x: px(hz), y: box.y + box.h },
      thickness: 0.5,
      color: c(colours.grid),
    });
    const label = hz >= 1000 ? `${hz / 1000}k` : String(hz);
    page.drawText(label, { x: px(hz) - 8, y: box.y - 14, size: 8, font, color: c(colours.muted) });
  }
  page.drawText(t('audiogram.axisFreq'), {
    x: box.x + box.w / 2 - 30,
    y: box.y - 30,
    size: 9,
    font,
    color: c(colours.text),
  });
  page.drawText(t('audiogram.axisLoss'), {
    x: box.x - 34,
    y: box.y + 40,
    size: 9,
    font,
    color: c(colours.text),
    rotate: degrees(90),
  });
  const drawEar = (ear: 'left' | 'right') => {
    const pts = series[ear].filter((p) => p.lossDb !== null);
    const colour = c(ear === 'right' ? colours.right : colours.left);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      page.drawLine({
        start: { x: px(a.hz), y: py(a.lossDb ?? 0) },
        end: { x: px(b.hz), y: py(b.lossDb ?? 0) },
        thickness: 1.2,
        color: colour,
        ...(ear === 'left' ? { dashArray: [4, 3] } : {}),
      });
    }
    for (const p of pts) {
      const x0 = px(p.hz);
      const y0 = py(p.lossDb ?? 0);
      if (ear === 'right') {
        page.drawCircle({ x: x0, y: y0, size: 5, borderColor: colour, borderWidth: 1.6 });
      } else {
        const s = 4.5;
        page.drawLine({
          start: { x: x0 - s, y: y0 - s },
          end: { x: x0 + s, y: y0 + s },
          thickness: 1.6,
          color: colour,
          lineCap: LineCapStyle.Round,
        });
        page.drawLine({
          start: { x: x0 - s, y: y0 + s },
          end: { x: x0 + s, y: y0 - s },
          thickness: 1.6,
          color: colour,
          lineCap: LineCapStyle.Round,
        });
      }
    }
  };
  drawEar('right');
  drawEar('left');
  y = box.y - 56;
  page.drawCircle({
    x: margin + 6,
    y: y + 4,
    size: 5,
    borderColor: c(colours.right),
    borderWidth: 1.6,
  });
  page.drawText(t('audiogram.right'), {
    x: margin + 16,
    y,
    size: 11,
    font,
    color: c(colours.text),
  });
  page.drawLine({
    start: { x: margin + 120, y },
    end: { x: margin + 129, y: y + 9 },
    thickness: 1.6,
    color: c(colours.left),
  });
  page.drawLine({
    start: { x: margin + 120, y: y + 9 },
    end: { x: margin + 129, y },
    thickness: 1.6,
    color: c(colours.left),
  });
  page.drawText(t('audiogram.left'), {
    x: margin + 136,
    y,
    size: 11,
    font,
    color: c(colours.text),
  });
  y -= 28;

  // Table of values.
  page.drawText(t('audiogram.tableCaption'), {
    x: margin,
    y,
    size: 10,
    font,
    color: c(colours.muted),
  });
  y -= 16;
  const cols = [margin, margin + 120, margin + 260];
  const row = (cells: string[], size = 10) => {
    cells.forEach((cell, i) => {
      page.drawText(cell, { x: cols[i] ?? margin, y, size, font, color: c(colours.text) });
    });
    y -= size * 1.5;
  };
  row([t('audiogram.colPitch'), t('audiogram.right'), t('audiogram.left')]);
  BAND_FREQUENCIES_HZ.forEach((hz, i) => {
    const cell = (p: (typeof series.left)[number] | undefined) =>
      !p || p.lossDb === null
        ? t('audiogram.notMeasured')
        : p.estimated
          ? t('audiogram.estimated', { n: Math.round(p.lossDb) })
          : String(Math.round(p.lossDb));
    row([String(hz), cell(series.right[i]), cell(series.left[i])]);
  });
  y -= 12;
  for (const line of wrap(t('pdf.disclaimer'), 10, width - 2 * margin)) {
    page.drawText(line, { x: margin, y, size: 10, font, color: c(colours.text) });
    y -= 15;
  }
  // Plain objects (no object streams) for the widest reader support.
  return doc.save({ useObjectStreams: false });
}

export function pdfFileName(record: HearingCheckRecord): string {
  return t('pdf.fileName', { date: record.createdAt.slice(0, 10) });
}
