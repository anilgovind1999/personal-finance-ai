import type { Account, Budget, Goal, Transaction } from '@/types';
import {
  accountBalances, byCard, byCategory, byMerchant, byPaymentMode, expensesOf, incomeOf,
  monthlySeries, summarise, totalOf, type DateRange,
} from '@/engine/analytics';
import { evaluateAll } from '@/engine/budget';
import { projectGoal } from '@/engine/forecast';
import { downloadBlob, formatMoney, monthLabel, round2, todayISO } from '@/lib/utils';

export type ReportKind =
  | 'monthly' | 'annual' | 'income' | 'savings' | 'cashflow'
  | 'category' | 'merchant' | 'creditcard' | 'budget';

export interface ReportContext {
  transactions: Transaction[];
  accounts: Account[];
  budgets: Budget[];
  goals: Goal[];
  range: DateRange;
  today: string;
}

export interface ReportTable {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface ReportDoc {
  title: string;
  subtitle: string;
  summary: Array<{ label: string; value: string }>;
  tables: ReportTable[];
}

const money = (n: number) => round2(n);

/** Builds the data for a report once; every export format renders the same doc. */
export function buildReport(kind: ReportKind, ctx: ReportContext): ReportDoc {
  const rows = ctx.transactions.filter((t) => t.date >= ctx.range.from && t.date <= ctx.range.to);
  const s = summarise(rows);
  const period = `${ctx.range.from} to ${ctx.range.to}`;

  const summary = [
    { label: 'Total income', value: formatMoney(s.income) },
    { label: 'Total expenses', value: formatMoney(s.expense) },
    { label: 'Net savings', value: formatMoney(s.net) },
    { label: 'Savings rate', value: `${s.savingsRate}%` },
    { label: 'Transactions', value: String(s.txnCount) },
    { label: 'Average per day', value: formatMoney(s.avgDaily) },
  ];

  switch (kind) {
    case 'monthly':
    case 'annual': {
      const series = monthlySeries(rows);
      return {
        title: kind === 'monthly' ? 'Monthly Expense Report' : 'Annual Expense Report',
        subtitle: period,
        summary,
        tables: [
          {
            title: 'Month summary',
            columns: ['Month', 'Income', 'Expenses', 'Net', 'Transactions'],
            rows: series.map((b) => [monthLabel(b.key), money(b.income), money(b.expense), money(b.net), b.count]),
          },
          categoryTable(rows),
          transactionTable(rows),
        ],
      };
    }

    case 'income': {
      const income = incomeOf(rows);
      return {
        title: 'Income Report',
        subtitle: period,
        summary: [
          { label: 'Total income', value: formatMoney(totalOf(income)) },
          { label: 'Entries', value: String(income.length) },
          { label: 'Sources', value: String(new Set(income.map((t) => t.merchant)).size) },
        ],
        tables: [
          {
            title: 'Income by category',
            columns: ['Category', 'Amount', 'Entries', 'Share %'],
            rows: sliceRows(income),
          },
          {
            title: 'Income entries',
            columns: ['Date', 'Source', 'Category', 'Subcategory', 'Mode', 'Amount'],
            rows: income
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((t) => [t.date, t.merchant, t.category, t.subcategory ?? '', t.paymentMode, money(t.amount)]),
          },
        ],
      };
    }

    case 'savings': {
      const series = monthlySeries(rows);
      return {
        title: 'Savings Report',
        subtitle: period,
        summary,
        tables: [
          {
            title: 'Monthly savings',
            columns: ['Month', 'Income', 'Expenses', 'Saved', 'Savings %'],
            rows: series.map((b) => [
              monthLabel(b.key), money(b.income), money(b.expense), money(b.net),
              b.income > 0 ? round2((b.net / b.income) * 100) : 0,
            ]),
          },
          {
            title: 'Goals',
            columns: ['Goal', 'Type', 'Target', 'Saved', 'Progress %', 'Expected completion'],
            rows: ctx.goals.map((g) => {
              const p = projectGoal(g, s.net, ctx.today);
              return [g.name, g.type, money(g.targetAmount), money(g.currentAmount), p.progress, p.expectedCompletion ?? '—'];
            }),
          },
        ],
      };
    }

    case 'cashflow': {
      const series = monthlySeries(rows);
      let running = 0;
      return {
        title: 'Cash Flow Report',
        subtitle: period,
        summary,
        tables: [
          {
            title: 'Cash flow by month',
            columns: ['Month', 'Inflow', 'Outflow', 'Net flow', 'Cumulative'],
            rows: series.map((b) => {
              running = round2(running + b.net);
              return [monthLabel(b.key), money(b.income), money(b.expense), money(b.net), running];
            }),
          },
          {
            title: 'Account positions',
            columns: ['Account', 'Bank', 'Type', 'Last 4', 'In', 'Out', 'Balance / Outstanding'],
            rows: accountBalances(ctx.accounts, ctx.transactions).map((b) => [
              b.account.cardName || b.account.accountName, b.account.bankName, b.account.accountType,
              `····${b.account.last4}`, money(b.credits), money(b.spend), money(b.balance),
            ]),
          },
        ],
      };
    }

    case 'category':
      return {
        title: 'Category Report',
        subtitle: period,
        summary,
        tables: [
          categoryTable(rows),
          {
            title: 'Subcategory detail',
            columns: ['Category', 'Subcategory', 'Amount', 'Entries'],
            rows: Object.entries(
              expensesOf(rows).reduce<Record<string, { amount: number; count: number }>>((acc, t) => {
                const key = `${t.category}||${t.subcategory ?? 'General'}`;
                acc[key] ||= { amount: 0, count: 0 };
                acc[key].amount += t.amount;
                acc[key].count += 1;
                return acc;
              }, {}),
            )
              .map(([key, v]) => {
                const [cat, sub] = key.split('||');
                return [cat, sub, money(v.amount), v.count] as Array<string | number>;
              })
              .sort((a, b) => Number(b[2]) - Number(a[2])),
          },
        ],
      };

    case 'merchant':
      return {
        title: 'Merchant Report',
        subtitle: period,
        summary,
        tables: [
          {
            title: 'Spend by merchant',
            columns: ['Merchant', 'Amount', 'Visits', 'Share %', 'Average'],
            rows: byMerchant(rows).map((m) => [m.name, money(m.value), m.count, m.share, round2(m.value / m.count)]),
          },
        ],
      };

    case 'creditcard': {
      const cards = ctx.accounts.filter((a) => a.accountType === 'Credit Card');
      const balances = accountBalances(ctx.accounts, ctx.transactions).filter((b) => b.account.accountType === 'Credit Card');
      return {
        title: 'Credit Card Report',
        subtitle: period,
        summary: [
          { label: 'Cards', value: String(cards.length) },
          { label: 'Total outstanding', value: formatMoney(balances.reduce((a, b) => a + b.outstanding, 0)) },
          { label: 'Total limit', value: formatMoney(cards.reduce((a, c) => a + (c.creditLimit ?? 0), 0)) },
        ],
        tables: [
          {
            title: 'Card positions',
            columns: ['Card', 'Bank', 'Last 4', 'Limit', 'Outstanding', 'Utilisation %', 'Statement day', 'Due day'],
            rows: balances.map((b) => [
              b.account.cardName || b.account.accountName, b.account.bankName, `····${b.account.last4}`,
              money(b.account.creditLimit ?? 0), money(b.outstanding), b.utilisation ?? 0,
              b.account.statementDay ?? '—', b.account.dueDay ?? '—',
            ]),
          },
          {
            title: 'Card-wise spend in period',
            columns: ['Card', 'Amount', 'Transactions', 'Share %'],
            rows: byCard(rows, ctx.accounts).map((c) => [c.name, money(c.value), c.count, c.share]),
          },
        ],
      };
    }

    case 'budget': {
      const statuses = evaluateAll(ctx.budgets, ctx.transactions, ctx.today);
      return {
        title: 'Budget Report',
        subtitle: `As of ${ctx.today}`,
        summary: [
          { label: 'Budgets tracked', value: String(statuses.length) },
          { label: 'Exceeded', value: String(statuses.filter((s2) => s2.utilisation >= 100).length) },
          { label: 'At risk (≥80%)', value: String(statuses.filter((s2) => s2.utilisation >= 80 && s2.utilisation < 100).length) },
        ],
        tables: [
          {
            title: 'Budget status',
            columns: ['Category', 'Period', 'Allocated', 'Spent', 'Remaining', 'Utilisation %', 'Projected', 'Status'],
            rows: statuses.map((s2) => [
              s2.budget.category === 'ALL' ? 'Overall' : s2.budget.category, s2.budget.period,
              money(s2.allocated), money(s2.spent), money(s2.remaining), s2.utilisation, money(s2.projected), s2.status,
            ]),
          },
        ],
      };
    }
  }
}

function sliceRows(rows: Transaction[]): Array<Array<string | number>> {
  const total = totalOf(rows);
  const groups: Record<string, { amount: number; count: number }> = {};
  for (const t of rows) {
    groups[t.category] ||= { amount: 0, count: 0 };
    groups[t.category].amount += t.amount;
    groups[t.category].count += 1;
  }
  return Object.entries(groups)
    .map(([name, v]) => [name, money(v.amount), v.count, total ? round2((v.amount / total) * 100) : 0] as Array<string | number>)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
}

function categoryTable(rows: Transaction[]): ReportTable {
  return {
    title: 'Spend by category',
    columns: ['Category', 'Amount', 'Transactions', 'Share %'],
    rows: byCategory(rows).map((c) => [c.name, money(c.value), c.count, c.share]),
  };
}

function transactionTable(rows: Transaction[]): ReportTable {
  return {
    title: 'All transactions',
    columns: ['Date', 'Type', 'Merchant', 'Category', 'Subcategory', 'Payment mode', 'Amount', 'Tags', 'Remarks'],
    rows: [...rows]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date, t.kind, t.merchant, t.category, t.subcategory ?? '', t.paymentMode,
        money(t.amount), t.tags.join(' '), t.remarks ?? '',
      ]),
  };
}

/** Payment-mode table, offered alongside every report as extra context. */
export function paymentModeTable(rows: Transaction[]): ReportTable {
  return {
    title: 'Spend by payment mode',
    columns: ['Payment mode', 'Amount', 'Transactions', 'Share %'],
    rows: byPaymentMode(rows).map((m) => [m.name, money(m.value), m.count, m.share]),
  };
}

/* ------------------------------- CSV ------------------------------- */

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCSV(doc: ReportDoc): string {
  const lines: string[] = [doc.title, doc.subtitle, ''];
  lines.push('Summary');
  for (const s of doc.summary) lines.push(`${csvCell(s.label)},${csvCell(s.value)}`);
  for (const table of doc.tables) {
    lines.push('', table.title, table.columns.map(csvCell).join(','));
    for (const row of table.rows) lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}

export async function downloadCSV(doc: ReportDoc, filename: string): Promise<void> {
  // The BOM keeps Excel happy with the rupee sign.
  await downloadBlob(new Blob(['﻿', reportToCSV(doc)], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Raw ledger export — one row per transaction, for spreadsheets and backups. */
export function transactionsToCSV(txns: Transaction[], accounts: Account[]): string {
  const header = [
    'Date', 'Type', 'Amount', 'Merchant', 'Category', 'Subcategory', 'Payment Mode',
    'Account', 'Bank', 'Last 4', 'Tags', 'Location', 'Remarks', 'Source', 'Created At',
  ];
  const lines = [header.join(',')];
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
    const acc = accounts.find((a) => a.id === t.accountId);
    lines.push(
      [
        t.date, t.kind, t.amount, t.merchant, t.category, t.subcategory ?? '', t.paymentMode,
        acc ? acc.cardName || acc.accountName : '', acc?.bankName ?? '', acc ? `····${acc.last4}` : '',
        t.tags.join(' '), t.location ?? '', t.remarks ?? '', t.source, t.createdAt,
      ].map(csvCell).join(','),
    );
  }
  return lines.join('\n');
}

/* ------------------------------ Excel ------------------------------ */

export async function downloadExcel(doc: ReportDoc, filename: string): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinSight — Personal Finance AI';
  wb.created = new Date();

  const summarySheet = wb.addWorksheet('Summary');
  summarySheet.addRow([doc.title]).font = { bold: true, size: 14 };
  summarySheet.addRow([doc.subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
  summarySheet.addRow([]);
  summarySheet.addRow(['Metric', 'Value']).font = { bold: true };
  for (const s of doc.summary) summarySheet.addRow([s.label, s.value]);
  summarySheet.getColumn(1).width = 26;
  summarySheet.getColumn(2).width = 22;

  for (const table of doc.tables) {
    // Sheet names cannot exceed 31 chars or contain []:*?/\
    const name = table.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
    const sheet = wb.addWorksheet(name);
    const header = sheet.addRow(table.columns);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });
    for (const row of table.rows) sheet.addRow(row);
    table.columns.forEach((c, i) => {
      const longest = Math.max(c.length, ...table.rows.map((r) => String(r[i] ?? '').length));
      sheet.getColumn(i + 1).width = Math.min(42, Math.max(12, longest + 2));
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  await downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}

/* ------------------------------- PDF ------------------------------- */

export async function downloadPDF(doc: ReportDoc, filename: string): Promise<void> {
  const { default: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();

  pdf.setFontSize(18);
  pdf.text(doc.title, 40, 52);
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text(doc.subtitle, 40, 70);
  pdf.text(`Generated ${todayISO()} · FinSight`, width - 40, 70, { align: 'right' });
  pdf.setTextColor(0);

  autoTable(pdf, {
    startY: 92,
    head: [['Summary', '']],
    body: doc.summary.map((s) => [s.label, s.value]),
    theme: 'plain',
    headStyles: { fontStyle: 'bold', fillColor: [239, 239, 239] },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 1: { halign: 'right' } },
  });

  for (const table of doc.tables) {
    const lastY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 92;
    autoTable(pdf, {
      startY: lastY + 26,
      head: [table.columns],
      // Very long tables are truncated so the PDF stays readable; Excel and CSV carry everything.
      body: table.rows.slice(0, 400).map((r) => r.map((c) => String(c))),
      theme: 'striped',
      headStyles: { fillColor: [42, 120, 214], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(table.title, 40, 34);
        pdf.setTextColor(0);
      },
    });
    if (table.rows.length > 400) {
      const y = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`${table.rows.length - 400} more rows — export to Excel or CSV for the full list.`, 40, y + 14);
      pdf.setTextColor(0);
    }
  }

  await downloadBlob(pdf.output('blob'), filename);
}
