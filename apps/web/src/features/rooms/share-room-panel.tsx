'use client';

import { useEffect, useState } from 'react';
import { createRoomUrl } from './create-room-url';
import { QrCode } from './qr-code';

const COPIED_NOTICE_DURATION_MILLISECONDS = 2000;

/** How the other person gets in: scan the QR code, open the link, or type the code. */
export function ShareRoomPanel({ roomCode }: { roomCode: string }) {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // The origin is only known in the browser (a tunnel URL in development, D-010).
  useEffect(() => {
    setRoomUrl(createRoomUrl({ origin: window.location.origin, roomCode }));
    setCanShare(typeof navigator.share === 'function');
  }, [roomCode]);

  async function copyRoomUrl(): Promise<void> {
    if (!roomUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(roomUrl);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), COPIED_NOTICE_DURATION_MILLISECONDS);
    } catch (error) {
      console.warn('could not copy the room link', error);
    }
  }

  function shareRoomUrl(): void {
    if (roomUrl) {
      navigator.share({ title: 'Join my Samvaad room', url: roomUrl }).catch(() => {});
    }
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="w-48">
        {roomUrl ? (
          <QrCode text={roomUrl} label={`QR code for the link to room ${roomCode}`} />
        ) : (
          <div className="aspect-square w-full rounded-xl bg-stone-100" />
        )}
      </div>
      <p className="text-center text-sm text-stone-500">
        Scan with the other phone’s camera, or type this code on its home page:
      </p>
      <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-stone-900">{roomCode}</p>
      {roomUrl && <p className="break-all text-center text-xs text-stone-400">{roomUrl}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copyRoomUrl()}
          className="rounded-full bg-stone-100 px-4 py-1.5 text-sm font-medium hover:bg-stone-200"
        >
          {hasCopied ? 'Copied' : 'Copy link'}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={shareRoomUrl}
            className="rounded-full bg-stone-100 px-4 py-1.5 text-sm font-medium hover:bg-stone-200"
          >
            Share…
          </button>
        )}
      </div>
    </section>
  );
}
