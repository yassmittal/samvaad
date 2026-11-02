import type { UtteranceReceipt } from '@samvaad/shared';

const RECEIPT_LABELS = {
  translated: 'Translated',
  heard: 'Heard',
} as const satisfies Record<UtteranceReceipt, string>;

/** ✓ translated, ✓✓ heard on the other phone, as WhatsApp marks a message (D-022). */
export function ReceiptTicks({ receipt }: { receipt: UtteranceReceipt | null }) {
  if (receipt === null) {
    return null;
  }
  return (
    <span
      title={RECEIPT_LABELS[receipt]}
      className={`inline-flex items-center gap-1 text-xs ${receipt === 'heard' ? 'text-call-them' : 'text-call-muted'}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 16"
        className="h-3 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m1 8 4.5 4.5L14 4" />
        {receipt === 'heard' && <path d="m9 12.5.5.5L18 4.5" />}
      </svg>
      {RECEIPT_LABELS[receipt]}
    </span>
  );
}
