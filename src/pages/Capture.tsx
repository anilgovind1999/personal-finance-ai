import { useMemo, useRef, useState } from 'react';
import type { Route } from '@/components/Shell';
import type { CaptureSource, ExtractionResult } from '@/types';
import { useStore } from '@/store/AppStore';
import { Badge, Button, Card, Segmented, cx } from '@/components/ui/Primitives';
import { IconCamera, IconMessage, IconSparkles } from '@/components/Icons';
import { confidenceBand, parseMessage, splitMessages } from '@/engine/parser';
import { extractReceiptFields, extractionFromReceipt, receiptSummary } from '@/engine/ocr/receipt';
import { formatINR } from '@/lib/utils';

const SOURCES: Array<{ value: CaptureSource; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'bank', label: 'Bank alert' },
  { value: 'upi', label: 'UPI' },
  { value: 'text', label: 'Typed note' },
];

const SAMPLES = [
  'Paid ₹250 for lunch',
  'Petrol filled for ₹2,000',
  'Bought groceries worth ₹1,850',
  'Movie tickets ₹700',
  'Paid EMI ₹12,500',
  'Paid ₹2,500 for fuel through HDFC Credit Card',
  'Rs.1,299.00 debited from A/c XX7788 on 11-03-26 to SWIGGY via UPI Ref 402913887766. Avl Bal Rs.42,118.90 -ICICI Bank',
  'Salary of Rs 95,000 credited to your HDFC account',
];

export function Capture({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const { state, captureText, captureExtraction, storeAttachment, toast } = useStore();
  const [tab, setTab] = useState<'message' | 'receipt'>('message');

  return (
    <div className="space-y-4">
      <Card
        title="AI expense capture"
        subtitle="Read a message or a receipt, then send the result for your approval"
        action={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[{ value: 'message', label: 'Message' }, { value: 'receipt', label: 'Receipt' }]}
          />
        }
      >
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/8 px-3 py-2.5">
          <IconSparkles width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Everything captured here goes to <strong className="text-ink">Pending Approval</strong> first.
            No AI-detected transaction reaches your ledger, dashboard or reports until you approve it.
          </p>
        </div>

        {tab === 'message' ? (
          <MessageCapture
            onQueue={(text, source) => captureText(text, source)}
            categories={state.categories.filter((c) => c.custom).map((c) => c.name)}
            onDone={(n) => {
              toast(`${n} item${n === 1 ? '' : 's'} sent for approval`);
              onNavigate('approvals');
            }}
          />
        ) : (
          <ReceiptCapture
            onQueue={(extraction, raw, attachmentId) =>
              captureExtraction(extraction, raw, 'receipt', attachmentId ? [attachmentId] : [])
            }
            storeAttachment={storeAttachment}
            onDone={() => {
              toast('Receipt sent for approval');
              onNavigate('approvals');
            }}
            onError={(m) => toast(m, 'error')}
          />
        )}
      </Card>
    </div>
  );
}

function MessageCapture({
  onQueue, onDone, categories,
}: {
  onQueue: (text: string, source: CaptureSource) => void;
  onDone: (count: number) => void;
  categories: string[];
}) {
  const [text, setText] = useState('');
  const [source, setSource] = useState<CaptureSource>('whatsapp');

  const lines = useMemo(() => splitMessages(text), [text]);
  const previews = useMemo(
    () => lines.map((l) => ({ text: l, result: parseMessage(l, { extraCategories: categories }) })),
    [lines, categories],
  );
  const usable = previews.filter((p) => p.result.amount.value !== null);

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Source</span>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              className={cx('rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
                source === s.value ? 'border-accent bg-accent/12 text-accent' : 'border-line bg-raised text-muted hover:text-ink')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Message text</span>
        <textarea
          className="input min-h-[130px] resize-y font-mono text-[13px] leading-relaxed"
          placeholder={'Paste one message per line, e.g.\nPaid ₹250 for lunch\nRs.2,000 debited for petrol via HDFC Credit Card'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <div>
        <span className="label">Try an example</span>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText((prev) => (prev ? `${prev}\n${s}` : s))}
              className="max-w-full truncate rounded-pill border border-line bg-raised px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {s.length > 46 ? `${s.slice(0, 46)}…` : s}
            </button>
          ))}
        </div>
      </div>

      {previews.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
            AI reading · {usable.length} of {previews.length} usable
          </p>
          {previews.map((p, i) => (
            <ExtractionPreview key={i} raw={p.text} result={p.result} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!usable.length}
          onClick={() => {
            usable.forEach((p) => onQueue(p.text, source));
            setText('');
            onDone(usable.length);
          }}
        >
          <IconMessage width={16} height={16} />
          Send {usable.length || ''} for approval
        </Button>
        {text && <Button variant="quiet" onClick={() => setText('')}>Clear</Button>}
      </div>
    </div>
  );
}

function ReceiptCapture({
  onQueue, onDone, onError, storeAttachment,
}: {
  onQueue: (extraction: ExtractionResult, raw: string, attachmentId?: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  storeAttachment: (file: File) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const fields = useMemo(() => (ocrText ? extractReceiptFields(ocrText) : null), [ocrText]);
  const result = useMemo(() => (ocrText ? extractionFromReceipt(ocrText) : null), [ocrText]);

  const runOcr = async (file: File) => {
    setBusy(true);
    setProgress(0);
    setPreview(URL.createObjectURL(file));
    try {
      const id = await storeAttachment(file);
      setAttachmentId(id);
      // Loaded lazily: the OCR bundle is large and only this screen needs it.
      const { default: Tesseract } = await import('tesseract.js');
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      setOcrText(data.text);
      if (!data.text.trim()) onError('No text could be read from that image');
    } catch {
      onError('Could not run OCR on this file. Type the details in manually instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <label
        className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed',
          'border-line bg-plane px-6 py-10 text-center transition-colors hover:border-accent')}
      >
        <IconCamera width={28} height={28} className="text-subtle" />
        <span className="text-sm font-semibold text-ink">Upload a bill, receipt or invoice</span>
        <span className="text-xs text-muted">The scanner reads the date, total, GST and merchant</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && void runOcr(e.target.files[0])}
        />
      </label>

      {busy && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Reading the receipt… {progress}%</p>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
            <div className="h-full rounded-pill bg-accent transition-[width]" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
        </div>
      )}

      {preview && !busy && (
        <img src={preview} alt="Uploaded receipt" className="max-h-56 w-full rounded-xl border border-line object-contain bg-plane" />
      )}

      {fields && result && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ReceiptField label="Total" value={fields.total !== null ? formatINR(fields.total) : '—'} />
            <ReceiptField label="Date" value={fields.date ?? 'Not found'} />
            <ReceiptField label="GST" value={fields.gst !== null ? formatINR(fields.gst) : '—'} />
            <ReceiptField label="Merchant" value={fields.merchant ?? 'Not found'} />
          </div>
          {receiptSummary(fields) && <p className="text-xs text-muted">{receiptSummary(fields)}</p>}
          <ExtractionPreview raw={ocrText.slice(0, 220)} result={result} />
          <details className="rounded-xl border border-line bg-plane p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Raw OCR text</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-subtle">{ocrText}</pre>
          </details>
          <Button
            variant="primary"
            disabled={result.amount.value === null}
            onClick={() => {
              onQueue(result, ocrText, attachmentId);
              setOcrText('');
              setPreview(null);
              setAttachmentId(undefined);
              if (inputRef.current) inputRef.current.value = '';
              onDone();
            }}
          >
            Send for approval
          </Button>
        </>
      )}
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-plane px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold tnum text-ink">{value}</p>
    </div>
  );
}

/** Shows what the engine read, field by field, with its confidence. */
export function ExtractionPreview({ raw, result }: { raw: string; result: ExtractionResult }) {
  const band = confidenceBand(result.confidence);
  const tone = band === 'high' ? 'good' : band === 'medium' ? 'warning' : 'critical';

  return (
    <div className="rounded-xl border border-line bg-plane p-3">
      <p className="mb-2 line-clamp-2 font-mono text-[11px] leading-relaxed text-subtle">{raw}</p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={tone}>{Math.round(result.confidence * 100)}% confidence</Badge>
        <Badge tone={result.kind === 'income' ? 'good' : 'neutral'}>{result.kind === 'income' ? 'Income' : 'Expense'}</Badge>
        {!result.isTransaction && <Badge tone="warning">Not a transaction</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        <FieldRow label="Amount" value={result.amount.value !== null ? formatINR(result.amount.value) : 'Not found'} confidence={result.amount.confidence} />
        <FieldRow label="Date" value={result.date.value} confidence={result.date.confidence} />
        <FieldRow label="Category" value={result.category.value} confidence={result.category.confidence} />
        <FieldRow label="Payment" value={result.paymentMode.value} confidence={result.paymentMode.confidence} />
        <FieldRow label="Merchant" value={result.merchant.value || '—'} confidence={result.merchant.confidence} />
        <FieldRow label="Bank" value={result.bank.value ?? '—'} confidence={result.bank.confidence} />
      </dl>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted">Why the AI read it this way</summary>
        <ul className="mt-1.5 space-y-1">
          {result.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-subtle">
              <span aria-hidden="true">·</span>
              {r}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function FieldRow({ label, value, confidence }: { label: string; value: string; confidence: number }) {
  const weak = confidence < 0.55;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className={cx('truncate text-xs font-semibold tnum', weak ? 'text-warning' : 'text-ink')} title={value}>
        {value}
        {weak && <span className="ml-1 font-normal text-subtle">· check</span>}
      </dd>
    </div>
  );
}
