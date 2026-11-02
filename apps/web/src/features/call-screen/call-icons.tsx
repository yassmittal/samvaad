import type { ReactNode } from 'react';

/** Line icons for the call screen, drawn on a 24-unit grid with the current text colour. */
function LineIcon({
  children,
  className = 'size-6',
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const PHONE_PATH =
  'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z';

export function MicrophoneIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </LineIcon>
  );
}

export function MicrophoneOffIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="m2 2 20 20M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3" />
    </LineIcon>
  );
}

export function PhoneIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d={PHONE_PATH} />
    </LineIcon>
  );
}

/** The handset turned down: end the call. */
export function PhoneDownIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d={PHONE_PATH} transform="rotate(135 12 12)" />
    </LineIcon>
  );
}

export function TranscriptIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M8 6h13M8 12h13M8 18h9M3 6h.01M3 12h.01M3 18h.01" />
    </LineIcon>
  );
}

export function ContextIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M12 3 13.9 8.8 20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2Z" />
      <path d="M19 17v4M17 19h4" />
    </LineIcon>
  );
}

export function ShareIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
    </LineIcon>
  );
}

export function CloseIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </LineIcon>
  );
}

export function SpeakerIcon({ className }: { className?: string | undefined }) {
  return (
    <LineIcon className={className}>
      <path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </LineIcon>
  );
}
