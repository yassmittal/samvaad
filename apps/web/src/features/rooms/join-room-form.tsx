'use client';

import { ROOM_CODE_LENGTH, roomCodeSchema } from '@samvaad/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

/** Type a room code read off the other phone, then pick a name and language on its page. */
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
          placeholder="Room code"
          aria-label="Room code"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-mono text-lg uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
        />
        <button
          type="submit"
          className="rounded-xl bg-stone-100 px-4 py-2.5 font-medium hover:bg-stone-200"
        >
          Join
        </button>
      </div>
      {problemText && (
        <p role="alert" className="text-sm text-rose-600">
          {problemText}
        </p>
      )}
    </form>
  );
}
