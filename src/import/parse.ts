/**
 * Reading the file itself: delimited text into a table, and single cells into
 * the dates and amounts a ledger needs.
 *
 * Everything here is deliberately forgiving. An export from another app or a
 * bank's net-banking download is not a well-specified format — it is whatever
 * that vendor happened to emit — so these functions accept the shapes seen in
 * the wild and say clearly when they cannot, rather than guessing and being
 * quietly wrong about someone's money.
 */

export interface RawTable {
  headers: string[];
  rows: string[][];
}

/**
 * Splits delimited text into rows and cells.
 *
 * Handles quoted fields containing the delimiter or a newline, and doubled
 * quotes as an escaped quote, which is what every spreadsheet emits. The
 * delimiter is detected rather than assumed: European exports use semicolons,
 * and some banks use tabs.
 */
export function parseDelimited(text: string, delimiter?: string): RawTable {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const d = delimiter ?? sniffDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.trim() === '') {
      quoted = true;
    } else if (ch === d) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return tableFrom(rows);
}

/** Picks the delimiter that divides the first few lines most consistently. */
function sniffDelimiter(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 8);
  if (!lines.length) return ',';

  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) continue;
    // Consistency matters more than volume: a delimiter that splits every line
    // into the same number of cells is the real one.
    const mean = total / counts.length;
    const spread = counts.reduce((a, c) => a + Math.abs(c - mean), 0) / counts.length;
    const score = mean - spread * 2;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Finds the header row and drops the preamble above it.
 *
 * Bank statements almost never start with the table: there is an account
 * summary, an address, a couple of blank lines. The header is taken to be the
 * first row that has several non-empty cells and is followed by rows of the
 * same width.
 */
export function tableFrom(rows: string[][]): RawTable {
  const usable = rows.filter((r) => r.some((c) => c !== ''));
  if (!usable.length) return { headers: [], rows: [] };

  let headerAt = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(usable.length, 30); i++) {
    const cells = usable[i].filter((c) => c !== '');
    const next = usable[i + 1]?.filter((c) => c !== '').length ?? 0;
    if (cells.length < 2 || next < cells.length - 1) continue;

    // Width alone would happily pick the first data row, since it is just as
    // wide as the header above it. What separates a header is that its cells
    // are words: a row of dates and figures is the table, not its labels.
    const labels = cells.filter((c) => !looksLikeData(c)).length / cells.length;
    const score = cells.length + labels * 3;
    if (score > bestScore) {
      bestScore = score;
      headerAt = i;
    }
  }

  const headers = usable[headerAt].map((h) => h.trim());
  const body = usable.slice(headerAt + 1).filter((r) => r.some((c) => c !== ''));
  return { headers, rows: body };
}

/** A cell that reads as a value rather than a column name. */
function looksLikeData(cell: string): boolean {
  const c = cell.trim();
  if (!c) return true;
  if (/^[-+(]?[₹$€£]?[\d,]+\.?\d*\)?$/.test(c)) return true;
  return parseDateCell(c) !== null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function fourDigitYear(y: number): number {
  if (y >= 1000) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${dt.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Reads one date cell.
 *
 * `dayFirst` decides 03/04/2026, which is genuinely ambiguous in isolation.
 * The caller works it out for the column as a whole — see `detectDayFirst` —
 * because a column of dates almost always contains one unambiguous value, and
 * guessing per-cell would silently mix two conventions in one import.
 */
export function parseDateCell(value: string, dayFirst = true): string | null {
  const s = value.trim();
  if (!s) return null;

  // Excel serial dates arrive when a sheet cell was never formatted as a date.
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }

  // 2026-03-12, unambiguous by construction.
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // 12-Mar-2026, 12 March 26, Mar 12 2026.
  const named = s.match(/^(\d{1,2})[-\s/]*([a-z]{3,})[-\s/]*(\d{2,4})/i);
  if (named) {
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (m) return iso(fourDigitYear(Number(named[3])), m, Number(named[1]));
  }
  const namedFirst = s.match(/^([a-z]{3,})[-\s/]*(\d{1,2})[,\s-]*(\d{2,4})/i);
  if (namedFirst) {
    const m = MONTHS[namedFirst[1].slice(0, 3).toLowerCase()];
    if (m) return iso(fourDigitYear(Number(namedFirst[3])), m, Number(namedFirst[2]));
  }

  // 12/03/2026 or 03/12/2026 — the caller's convention decides.
  const numeric = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = fourDigitYear(Number(numeric[3]));
    // One of them can only be a day, whatever the convention says.
    if (a > 12) return iso(year, b, a);
    if (b > 12) return iso(year, a, b);
    return dayFirst ? iso(year, b, a) : iso(year, a, b);
  }

  return null;
}

/**
 * Works out whether a column of dates is day-first, by looking for a value
 * that can only be read one way.
 *
 * Defaults to day-first, which is the Indian and European convention and the
 * one every bank here uses. A column of purely ambiguous dates cannot be
 * settled by inspection, so the import screen says which reading it used and
 * lets it be switched.
 */
export function detectDayFirst(values: string[]): boolean {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) return true;
    if (Number(m[2]) > 12) return false;
  }
  return true;
}

/**
 * Reads one money cell, returning its magnitude and whether it was negative.
 *
 * Statements express "money out" in at least four ways — a minus sign, brackets,
 * a trailing Dr, or simply being in the withdrawal column — so the sign is
 * reported separately and the caller decides what it means.
 */
export function parseAmountCell(value: string): { amount: number; negative: boolean } | null {
  const s = value.trim();
  if (!s) return null;

  const bracketed = /^\(.*\)$/.test(s);
  // Dr/Cr must be a word: "Cr" in "Credit Card" is not a marker.
  const dr = /(^|[\s\d.])dr\.?$/i.test(s);
  const cr = /(^|[\s\d.])cr\.?$/i.test(s);

  const digits = s.replace(/[()]/g, '').replace(/(dr|cr)\.?$/i, '');
  // Strip currency symbols, codes and thousands separators, keeping one decimal point.
  const cleaned = digits.replace(/[₹$€£]|inr|rs\.?|usd|eur|gbp/gi, '').replace(/,/g, '').trim();
  if (!/^-?\+?\d*\.?\d+$/.test(cleaned.replace('+', ''))) return null;

  const n = Number(cleaned.replace('+', ''));
  if (!Number.isFinite(n)) return null;

  const negative = bracketed || dr || n < 0;
  if (cr && !bracketed) return { amount: Math.abs(n), negative: false };
  return { amount: Math.abs(n), negative };
}
