'use client';

import { ROOM_CODE_LENGTH, roomCodeSchema } from '@samvaad/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

/** Type a call's code read off the other phone, then answer on its page (D-022). */
export function JoinRoomForm() {
  const router = useRouter();
  const [typedRoomCode, setTypedRoomCode] = useState('');
  const [problemText, setProblemText] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parseResult = roomCodeSchema.safeParse(typedRoomCode);
    if (!parseResult.success) {
      setProblemText(parseResult.error.issues[0]?.message ?? 'Check the code.');
      return;
    }
    router.push(`/room/${parseResult.data}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={typedRoomCode}
          onChange={(event) => setTypedRoomCode(event.target.value)}
          maxLength={ROOM_CODE_LENGTH + 2}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="Have a code? Type it"
          aria-label="Call code"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-call-surface px-5 py-3 font-mono text-lg uppercase tracking-widest text-call-text placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal placeholder:text-call-muted focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-white/10 px-5 py-3 font-medium hover:bg-white/15"
        >
          Join
        </button>
      </div>
      {problemText && (
        <p role="alert" className="text-sm text-call-end">
          {problemText}
        </p>
      )}
    </form>
  );
}
