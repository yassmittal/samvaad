'use client';

import type {
  ClientMessage,
  IceServer,
  WebrtcSessionDescription,
  WebrtcSignalServerMessage,
} from '@samvaad/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateLoudnessLevel } from '../call-screen/calculate-loudness-level';
import type { MicrophoneStatus } from '../microphone/use-microphone';
import { findPlaybackAudioOutput } from '../speech-output/playback-audio-output';
import {
  SILENT_VOICE_ACTIVITY,
  updateVoiceActivity,
  type VoiceActivity,
} from './update-voice-activity';

/** The other person's real voice plays this quietly, under the translation, when turned on (D-023, D-024). */
export const ORIGINAL_VOICE_VOLUME = 0.25;
const VOICE_ACTIVITY_CHECK_MILLISECONDS = 100;
const ANALYSER_FFT_SIZE = 512;

type WebrtcSignalClientMessage = Extract<ClientMessage, { type: 'webrtc_signal' }>;

type OriginalVoiceOptions = {
  /** The other participant while both are in the call and connected; `null` otherwise. */
  otherParticipantId: string | null;
  /** This phone joined second, so it makes the offer (D-023). */
  isOfferer: boolean;
  iceServers: IceServer[] | null;
  /** Changes when the microphone opens or closes, so the connection follows it. */
  microphoneStatus: MicrophoneStatus;
  findMicrophoneStream: () => MediaStream | null;
  /** Off while muted and while this phone speaks a translation, so nobody hears it back. */
  isSendingRealAudio: boolean;
  /** This phone is playing a translation: their real voice goes quiet under it (D-024). */
  isSpeakingTranslation: boolean;
  sendSignal: (message: WebrtcSignalClientMessage) => void;
  subscribeToSignals: (listener: (signal: WebrtcSignalServerMessage) => void) => () => void;
};

function toRtcIceServers(iceServers: readonly IceServer[]): RTCIceServer[] {
  return iceServers.map(({ urls, username, credential }) => ({
    urls,
    ...(username === undefined ? {} : { username }),
    ...(credential === undefined ? {} : { credential }),
  }));
}

function toSessionDescription(description: RTCSessionDescriptionInit): WebrtcSessionDescription {
  return { type: description.type === 'answer' ? 'answer' : 'offer', sdp: description.sdp ?? '' };
}

/**
 * The other person's real voice, peer to peer (D-023). The phone that joined second offers; a
 * new offer always starts a fresh connection, so a reconnect on either side simply sets it up
 * again. The voice plays through an `<audio>` element, inside what the browser's echo canceller
 * cancels, at `ORIGINAL_VOICE_VOLUME`. It starts off, and goes quiet while this phone plays a
 * translation (D-024). iOS ignores that volume, so there, once on, it plays at full volume.
 */
export function useOriginalVoice({
  otherParticipantId,
  isOfferer,
  iceServers,
  microphoneStatus,
  findMicrophoneStream,
  isSendingRealAudio,
  isSpeakingTranslation,
  sendSignal,
  subscribeToSignals,
}: OriginalVoiceOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isOriginalVoiceOn, setIsOriginalVoiceOn] = useState(false);
  const [isOtherPersonSpeaking, setIsOtherPersonSpeaking] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const remoteAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const sendTrackRef = useRef<MediaStreamTrack | null>(null);
  const isSendingRealAudioRef = useRef(isSendingRealAudio);
  isSendingRealAudioRef.current = isSendingRealAudio;
  // Silent while off, and under this phone's own translation (D-024).
  const isOriginalVoiceMuted = !isOriginalVoiceOn || isSpeakingTranslation;
  const isOriginalVoiceMutedRef = useRef(isOriginalVoiceMuted);
  isOriginalVoiceMutedRef.current = isOriginalVoiceMuted;
  const callbacksRef = useRef({ sendSignal, subscribeToSignals, findMicrophoneStream });
  callbacksRef.current = { sendSignal, subscribeToSignals, findMicrophoneStream };

  useEffect(() => {
    const microphoneTrack = callbacksRef.current.findMicrophoneStream()?.getAudioTracks()[0];
    if (
      otherParticipantId === null ||
      iceServers === null ||
      microphoneTrack === undefined ||
      microphoneStatus !== 'open' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      return;
    }
    const toParticipantId = otherParticipantId;
    const rtcIceServers = toRtcIceServers(iceServers);
    const { sendSignal: send, subscribeToSignals: subscribe } = callbacksRef.current;
    let peerConnection: RTCPeerConnection | null = null;
    let waitingCandidates: RTCIceCandidateInit[] = [];
    let isStopped = false;

    function playRemoteStream(remoteStream: MediaStream): void {
      const audioElement = audioElementRef.current ?? new Audio();
      audioElementRef.current = audioElement;
      audioElement.autoplay = true;
      audioElement.srcObject = remoteStream;
      audioElement.volume = ORIGINAL_VOICE_VOLUME;
      audioElement.muted = isOriginalVoiceMutedRef.current;
      audioElement.play().catch((error: unknown) => console.warn('original voice blocked', error));

      const playbackAudioOutput = findPlaybackAudioOutput();
      if (playbackAudioOutput !== null) {
        // Only measured, never played: the <audio> element plays it.
        const analyserNode = playbackAudioOutput.audioContext.createAnalyser();
        analyserNode.fftSize = ANALYSER_FFT_SIZE;
        playbackAudioOutput.audioContext
          .createMediaStreamSource(remoteStream)
          .connect(analyserNode);
        remoteAnalyserNodeRef.current = analyserNode;
      }
    }

    function closePeerConnection(): void {
      peerConnection?.close();
      peerConnection = null;
      sendTrackRef.current?.stop();
      sendTrackRef.current = null;
      waitingCandidates = [];
      setIsConnected(false);
    }

    function createPeerConnection(): RTCPeerConnection {
      closePeerConnection();
      const connection = new RTCPeerConnection({ iceServers: rtcIceServers });
      // A copy of the microphone, so muting the real voice leaves the transcription alone.
      const sendTrack = microphoneTrack?.clone() ?? null;
      if (sendTrack !== null) {
        sendTrack.enabled = isSendingRealAudioRef.current;
        connection.addTrack(sendTrack, new MediaStream([sendTrack]));
        sendTrackRef.current = sendTrack;
      }
      connection.onicecandidate = ({ candidate }) => {
        if (candidate !== null) {
          send({
            type: 'webrtc_signal',
            toParticipantId,
            candidate: {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            },
          });
        }
      };
      connection.ontrack = ({ streams, track }) => {
        playRemoteStream(streams[0] ?? new MediaStream([track]));
      };
      connection.onconnectionstatechange = () => {
        setIsConnected(connection.connectionState === 'connected');
      };
      peerConnection = connection;
      return connection;
    }

    async function addWaitingCandidates(connection: RTCPeerConnection): Promise<void> {
      for (const candidate of waitingCandidates.splice(0)) {
        await connection.addIceCandidate(candidate).catch(() => {});
      }
    }

    async function sendOffer(): Promise<void> {
      const connection = createPeerConnection();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      send({ type: 'webrtc_signal', toParticipantId, description: toSessionDescription(offer) });
    }

    async function handleSignal(signal: WebrtcSignalServerMessage): Promise<void> {
      if (isStopped || signal.fromParticipantId !== toParticipantId) {
        return;
      }
      if (signal.description?.type === 'offer') {
        // A new offer means the other phone started over, so this one does too.
        const connection = createPeerConnection();
        await connection.setRemoteDescription(signal.description);
        await addWaitingCandidates(connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        send({ type: 'webrtc_signal', toParticipantId, description: toSessionDescription(answer) });
        return;
      }
      if (signal.description?.type === 'answer') {
        if (peerConnection?.signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(signal.description);
          await addWaitingCandidates(peerConnection);
        }
        return;
      }
      if (signal.candidate !== undefined) {
        if (peerConnection?.remoteDescription) {
          await peerConnection.addIceCandidate(signal.candidate);
        } else {
          waitingCandidates.push(signal.candidate);
        }
      }
    }

    const unsubscribe = subscribe((signal) => {
      handleSignal(signal).catch((error: unknown) => console.warn('original voice signal', error));
    });
    if (isOfferer) {
      sendOffer().catch((error: unknown) => console.warn('original voice offer', error));
    }
    return () => {
      isStopped = true;
      unsubscribe();
      closePeerConnection();
      remoteAnalyserNodeRef.current = null;
      if (audioElementRef.current !== null) {
        audioElementRef.current.srcObject = null;
      }
    };
  }, [otherParticipantId, isOfferer, iceServers, microphoneStatus]);

  // Nobody hears their own translation come back, or a muted phone (D-023).
  useEffect(() => {
    if (sendTrackRef.current !== null) {
      sendTrackRef.current.enabled = isSendingRealAudio;
    }
  }, [isSendingRealAudio]);

  useEffect(() => {
    if (audioElementRef.current !== null) {
      audioElementRef.current.muted = isOriginalVoiceMuted;
    }
  }, [isOriginalVoiceMuted]);

  // Whether they are talking right now, for the orb (D-022), from their voice's loudness.
  useEffect(() => {
    if (!isConnected) {
      setIsOtherPersonSpeaking(false);
      return;
    }
    let voiceActivity: VoiceActivity = SILENT_VOICE_ACTIVITY;
    let samples = new Float32Array(ANALYSER_FFT_SIZE);
    const interval = setInterval(() => {
      const analyserNode = remoteAnalyserNodeRef.current;
      if (analyserNode === null) {
        return;
      }
      if (samples.length !== analyserNode.fftSize) {
        samples = new Float32Array(analyserNode.fftSize);
      }
      analyserNode.getFloatTimeDomainData(samples);
      voiceActivity = updateVoiceActivity(voiceActivity, {
        level: calculateLoudnessLevel(samples),
        nowEpochMilliseconds: Date.now(),
      });
      setIsOtherPersonSpeaking(voiceActivity.isActive);
    }, VOICE_ACTIVITY_CHECK_MILLISECONDS);
    return () => clearInterval(interval);
  }, [isConnected]);

  const toggleOriginalVoice = useCallback(() => {
    setIsOriginalVoiceOn((wasOn) => !wasOn);
  }, []);
  const findRemoteAnalyserNode = useCallback(() => remoteAnalyserNodeRef.current, []);

  return {
    /** The peer-to-peer audio is up; without it the call still works, translated only. */
    isConnected,
    isOriginalVoiceOn,
    isOtherPersonSpeaking,
    toggleOriginalVoice,
    findRemoteAnalyserNode,
  };
}
