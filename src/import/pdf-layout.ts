import { tableFrom, type RawTable } from './parse';

/**
 * Rebuilding a table out of positioned text.
 *
 * A PDF has no rows and no columns. It has glyphs at coordinates, and a
 * statement only *looks* like a table because a human reads alignment as
 * structure. This does the same reading, geometrically: text at the same height
 * is one line, and text that lines up vertically down the page is one column.
 *
 * Kept separate from the PDF library so the hard part — the geometry — can be
 * tested directly, with the coordinates written out by hand, rather than only
 * through whole documents.
 */

export interface TextItem {
  text: string;
  /** Left edge, in PDF points from the left of the page. */
  x: number;
  /** Baseline, in points from the bottom of the page. */
  y: number;
  width: number;
  height: number;
}

/** Items whose baselines are within this fraction of a line height are one line. */
const LINE_TOLERANCE = 0.6;

/**
 * Groups items into visual lines by baseline.
 *
 * Superscripts and slightly different font sizes shift a baseline by a point or
 * two, so the tolerance scales with the text height rather than being fixed.
 */
export function groupLines(items: TextItem[]): TextItem[][] {
  const usable = items.filter((i) => i.text.trim() !== '');
  if (!usable.length) return [];

  const medianHeight = median(usable.map((i) => i.height).filter((h) => h > 0)) || 10;
  const tolerance = medianHeight * LINE_TOLERANCE;

  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  let current: TextItem[] = [];
  let anchor = Number.NaN;

  for (const item of sorted) {
    if (Number.isNaN(anchor) || Math.abs(item.y - anchor) <= tolerance) {
      if (Number.isNaN(anchor)) anchor = item.y;
      current.push(item);
    } else {
      lines.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      anchor = item.y;
    }
  }
  if (current.length) lines.push(current.sort((a, b) => a.x - b.x));
  return lines;
}

/**
 * Joins the glyph runs that landed in one column into a single string.
 *
 * A PDF emits text in whatever runs the producer felt like — a word, a kerning
 * pair, sometimes a single letter — so the runs mean nothing on their own. Only
 * the gaps do: wide enough and a space belongs there, otherwise the runs are
 * halves of one word.
 */
export function joinItems(items: TextItem[]): string {
  if (!items.length) return '';
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const height = median(sorted.map((i) => i.height).filter((h) => h > 0)) || 10;

  let text = sorted[0].text;
  let right = sorted[0].x + sorted[0].width;
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const gap = item.x - right;
    text += gap > height * 0.15 && !text.endsWith(' ') ? ` ${item.text}` : item.text;
    right = item.x + item.width;
  }
  return text.trim();
}

export interface Band {
  x0: number;
  x1: number;
  /** How many pieces of text landed here. */
  count: number;
}

/**
 * Works out where the columns are, from every piece of text on the page at once.
 *
 * One line cannot tell you: a row with an empty deposit column looks exactly
 * like a row with one fewer column. Across the whole page the columns show up
 * as vertical bands that text keeps landing in, and a row with a gap becomes a
 * row with an empty cell — which is the difference between money out and money
 * in.
 *
 * This deliberately works on the individual runs of text rather than on
 * gap-separated cells. Deciding where a column ends by the width of a gap is
 * guesswork that fails on tight layouts — in a real statement the gap between
 * "Date" and "Narration" is smaller than the gap between two words — whereas
 * text that lines up down the page is a column by definition.
 */
export function findColumns(lines: TextItem[][]): Band[] {
  // Only the table's own lines get a say. Every statement opens with an address,
  // an account number and a period, each a single wide run of text lying across
  // several columns at once; letting those vote merges the columns they cross.
  // A table row has at least three pieces of text on it, and a line of prose
  // almost never does.
  const structural = lines.filter((l) => l.length >= 3);
  const voting = structural.length >= 2 ? structural : lines;

  const extent = voting.flat().reduce(
    (acc, i) => ({ x0: Math.min(acc.x0, i.x), x1: Math.max(acc.x1, i.x + i.width) }),
    { x0: Infinity, x1: -Infinity },
  );
  // No single column may span half the table. This is the second line of defence
  // against a wide run bridging two columns: the widest legitimate column, a
  // narration, still leaves room for the date and the figures beside it.
  const maxWidth = (extent.x1 - extent.x0) * 0.5;

  const bands: Band[] = [];

  // Narrow runs first: they pin down tight bands before a wide one has the
  // chance to bridge two columns at once.
  const all = voting.flat().sort((a, b) => a.width - b.width);

  for (const item of all) {
    const span = { x0: item.x, x1: item.x + item.width };
    const hit = bands.find((b) => {
      if (overlap(b, span) <= 0.5 * Math.min(b.x1 - b.x0, span.x1 - span.x0)) return false;
      return Math.max(b.x1, span.x1) - Math.min(b.x0, span.x0) <= maxWidth;
    });
    if (hit) {
      hit.x0 = Math.min(hit.x0, span.x0);
      hit.x1 = Math.max(hit.x1, span.x1);
      hit.count++;
    } else {
      bands.push({ ...span, count: 1 });
    }
  }

  // Every band is kept, including ones only a title or a page number ever
  // touched. Dropping the rare ones is tempting and wrong: deposits are rarer
  // than withdrawals, so a "this column is too sparse to be real" rule discards
  // the deposit column on a page with one salary credit — and its figure would
  // then be assigned to the withdrawal column beside it, turning income into an
  // expense. A spurious extra column costs nothing by comparison: it stays
  // empty on every row and the mapping step marks it "don't import".
  return bands.sort((a, b) => a.x0 - b.x0);
}

function overlap(a: { x0: number; x1: number }, b: { x0: number; x1: number }): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
}

/** Places a line's text into the page's columns, leaving holes where a row is silent. */
function toRow(line: TextItem[], columns: Band[]): string[] {
  const buckets: TextItem[][] = columns.map(() => []);

  for (const item of line) {
    const span = { x0: item.x, x1: item.x + item.width };
    let best = 0;
    let bestOverlap = -1;
    columns.forEach((band, i) => {
      const o = overlap(band, span);
      // With no overlap anywhere, the nearest left edge decides.
      const score = o > 0 ? o : -Math.abs(band.x0 - span.x0) / 1000;
      if (score > bestOverlap) {
        bestOverlap = score;
        best = i;
      }
    });
    buckets[best].push(item);
  }

  return buckets.map(joinItems);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Turns one page's positioned text into rows of cells.
 *
 * Pages are laid out independently, so this runs per page; the caller stacks
 * the results and finds the header once across the lot, since a statement
 * repeats its header on every page and only the first one is wanted.
 */
export function pageToRows(items: TextItem[]): string[][] {
  const lines = groupLines(items).filter((l) => l.length);
  if (!lines.length) return [];
  const columns = findColumns(lines);
  if (columns.length < 2) return lines.map((l) => [joinItems(l)]);
  return lines.map((l) => toRow(l, columns));
}

/**
 * Stacks the pages of a statement into one table.
 *
 * The header repeats on every page, and each repeat is followed by more of the
 * same rows, so a naive read would scatter header lines through the data. They
 * are dropped by comparing against the header the first page established.
 */
export function pagesToTable(pages: string[][][]): RawTable {
  const stacked = pages.flat();
  const table = tableFrom(stacked);
  if (!table.headers.length) return table;

  const signature = table.headers.join('|').toLowerCase();
  return {
    headers: table.headers,
    rows: table.rows.filter((r) => r.join('|').toLowerCase() !== signature),
  };
}
