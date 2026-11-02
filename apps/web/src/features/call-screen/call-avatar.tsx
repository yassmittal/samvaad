type CallAvatarProps = {
  name: string;
  /** Your colour or theirs (D-022). */
  side: 'you' | 'them';
  /** Rings spreading out while the call rings or waits. */
  isRinging?: boolean;
};

/** A round initial, like a contact without a photo on a phone's call screen. */
export function CallAvatar({ name, side, isRinging = false }: CallAvatarProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase() || '?';
  const colorClassName = side === 'you' ? 'text-call-you' : 'text-call-them';
  return (
    <div className={`relative size-28 ${colorClassName}`}>
      {isRinging && (
        <>
          <span aria-hidden className="call-ripple" />
          <span aria-hidden className="call-ripple" />
          <span aria-hidden className="call-ripple" />
        </>
      )}
      <div
        aria-hidden
        className="relative flex size-full items-center justify-center rounded-full bg-current text-5xl font-medium"
      >
        <span className="text-call-background">{initial}</span>
      </div>
    </div>
  );
}
