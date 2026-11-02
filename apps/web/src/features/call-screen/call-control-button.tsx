import type { ReactNode } from 'react';

type CallControlTone = 'plain' | 'active' | 'end' | 'answer';

const TONE_CLASS_NAME = {
  plain: 'bg-white/10 text-call-text hover:bg-white/15',
  active: 'bg-call-text text-call-background hover:bg-white',
  end: 'bg-call-end text-white hover:brightness-110',
  answer: 'bg-call-answer text-white hover:brightness-110',
} as const satisfies Record<CallControlTone, string>;

type CallControlButtonProps = {
  label: string;
  icon: ReactNode;
  tone?: CallControlTone;
  /** The big Answer and End buttons on the ring screens. */
  isLarge?: boolean;
  isPressed?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
};

/** A round call button with its label underneath, like a phone's call screen (D-022). */
export function CallControlButton({
  label,
  icon,
  tone = 'plain',
  isLarge = false,
  isPressed,
  isDisabled = false,
  onClick,
}: CallControlButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        aria-label={label}
        aria-pressed={isPressed}
        className={`flex items-center justify-center rounded-full transition duration-200 active:scale-95 disabled:opacity-35 ${isLarge ? 'size-[4.5rem]' : 'size-14'} ${TONE_CLASS_NAME[tone]}`}
      >
        {icon}
      </button>
      <span aria-hidden className="text-xs text-call-muted">
        {label}
      </span>
    </div>
  );
}
