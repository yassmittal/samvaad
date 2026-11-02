'use client';

import { useEffect, useState } from 'react';
import { createRoomUrl } from '../rooms/create-room-url';
import { QrCode } from '../rooms/qr-code';
import { ShareIcon } from './call-icons';

const COPIED_NOTICE_DURATION_MILLISECONDS = 2000;
const WHATSAPP_SHARE_URL = 'https://wa.me/';

function createInviteText(callerName: string): string {
  return `${callerName} is calling you on Samvaad. You'll hear each other in your own language. Tap to answer:`;
}

/**
 * How the other person gets the call (D-022): WhatsApp in one tap, the phone's share sheet, a
 * copied link, or the QR code and code for someone in the same room.
 */
export function ShareCallInvite({
  roomCode,
  callerName,
}: {
  roomCode: string;
  callerName: string;
}) {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // The origin is only known in the browser (a tunnel URL in development, D-010).
  useEffect(() => {
    setRoomUrl(createRoomUrl({ origin: window.location.origin, roomCode }));
    setCanShare(typeof navigator.share === 'function');
  }, [roomCode]);

  const inviteText = createInviteText(callerName);

  async function copyRoomUrl(): Promise<void> {
    if (roomUrl === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${inviteText} ${roomUrl}`);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), COPIED_NOTICE_DURATION_MILLISECONDS);
    } catch (error) {
      console.warn('could not copy the call link', error);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex w-full max-w-sm flex-col gap-2">
        <a
          href={
            roomUrl
              ? `${WHATSAPP_SHARE_URL}?text=${encodeURIComponent(`${inviteText} ${roomUrl}`)}`
              : undefined
          }
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-full bg-call-answer px-5 py-3.5 text-base font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
        >
          Send on WhatsApp
        </a>
        <div className="flex gap-2">
          {canShare && (
            <button
              type="button"
              onClick={() => {
                if (roomUrl) {
                  navigator
                    .share({ title: 'Samvaad call', text: inviteText, url: roomUrl })
                    .catch(() => {});
                }
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/15"
            >
              <ShareIcon className="size-4" /> Share
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyRoomUrl()}
            className="flex-1 rounded-full bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/15"
          >
            {hasCopied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
      <details className="group flex flex-col items-center">
        <summary className="cursor-pointer list-none text-sm text-call-muted underline-offset-4 hover:underline">
          Same room? Show a QR code
        </summary>
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="w-44 rounded-2xl bg-white p-3">
            {roomUrl ? (
              <QrCode text={roomUrl} label={`QR code for the link to call ${roomCode}`} />
            ) : (
              <div className="aspect-square w-full" />
            )}
          </div>
          <p className="font-mono text-2xl tracking-[0.3em]">{roomCode}</p>
        </div>
      </details>
    </div>
  );
}
