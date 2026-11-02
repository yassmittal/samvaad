'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConversationSocketStatus } from '@/lib/conversation-socket/conversation-socket-client';
import type { MicrophoneStatus } from '../microphone/use-microphone';

type CallMicrophoneOptions = {
  /** Both people are here and connected. */
  isInCall: boolean;
  isRecapOpen: boolean;
  socketStatus: ConversationSocketStatus;
  microphoneStatus: MicrophoneStatus;
  openMicrophoneCapture: () => Promise<boolean>;
  setMicrophoneOn: (isOn: boolean) => void;
};

/**
 * A call's open mic (D-022): no button to find. The capture opens in the Start or Answer tap;
 * audio goes to the API only while both people are in the call, connected, and not muted, so
 * nobody pays for Meta transcribing a phone talking to an empty room.
 */
export function useCallMicrophone({
  isInCall,
  isRecapOpen,
  socketStatus,
  microphoneStatus,
  openMicrophoneCapture,
  setMicrophoneOn,
}: CallMicrophoneOptions) {
  const [isMuted, setIsMuted] = useState(false);
  const isSocketOpen = socketStatus === 'open';

  useEffect(() => {
    setMicrophoneOn(
      isInCall && !isMuted && !isRecapOpen && isSocketOpen && microphoneStatus === 'open',
    );
  }, [isInCall, isMuted, isRecapOpen, isSocketOpen, microphoneStatus, setMicrophoneOn]);

  // The capture closes with the socket and at the end of a conversation. Reopen it when the
  // call goes on; Android and desktop allow it without a tap, iOS may need the Mute button.
  useEffect(() => {
    if (isSocketOpen && microphoneStatus === 'closed' && !isRecapOpen && !isMuted) {
      void openMicrophoneCapture();
    }
  }, [isSocketOpen, microphoneStatus, isRecapOpen, isMuted, openMicrophoneCapture]);

  const toggleMute = useCallback(() => {
    // A tap is also the chance to reopen a capture iOS wouldn't reopen on its own.
    if (microphoneStatus !== 'open') {
      setIsMuted(false);
      void openMicrophoneCapture();
      return;
    }
    setIsMuted((wasMuted) => !wasMuted);
  }, [microphoneStatus, openMicrophoneCapture]);

  return { isMuted: isMuted || microphoneStatus !== 'open', toggleMute };
}
