import { describe, expect, test } from 'bun:test';
import {
  HEALTHY_UPLINK,
  RECOVERY_MILLISECONDS,
  SKIP_QUIET_FRAMES_BACKLOG_BYTES,
  shouldSkipQuietFrame,
  updateUplinkHealth,
  WEAK_CONNECTION_BACKLOG_BYTES,
} from './track-uplink-backlog';

describe('shouldSkipQuietFrame (D-024)', () => {
  test('everything is sent while the uplink keeps up', () => {
    expect(shouldSkipQuietFrame({ bufferedByteCount: 0, isQuiet: true })).toBe(false);
  });

  test('behind, quiet frames are skipped and speech is still sent', () => {
    const bufferedByteCount = SKIP_QUIET_FRAMES_BACKLOG_BYTES + 1;
    expect(shouldSkipQuietFrame({ bufferedByteCount, isQuiet: true })).toBe(true);
    expect(shouldSkipQuietFrame({ bufferedByteCount, isQuiet: false })).toBe(false);
  });
});

describe('updateUplinkHealth', () => {
  test('a second of stuck audio makes it weak', () => {
    const uplinkHealth = updateUplinkHealth(HEALTHY_UPLINK, {
      bufferedByteCount: WEAK_CONNECTION_BACKLOG_BYTES + 1,
      nowEpochMilliseconds: 0,
    });
    expect(uplinkHealth.isWeak).toBe(true);
  });

  test('it stays weak until the uplink has kept up for a while', () => {
    let uplinkHealth = updateUplinkHealth(HEALTHY_UPLINK, {
      bufferedByteCount: WEAK_CONNECTION_BACKLOG_BYTES + 1,
      nowEpochMilliseconds: 0,
    });
    uplinkHealth = updateUplinkHealth(uplinkHealth, {
      bufferedByteCount: 0,
      nowEpochMilliseconds: 1000,
    });
    expect(uplinkHealth.isWeak).toBe(true);
    uplinkHealth = updateUplinkHealth(uplinkHealth, {
      bufferedByteCount: 0,
      nowEpochMilliseconds: 1000 + RECOVERY_MILLISECONDS,
    });
    expect(uplinkHealth.isWeak).toBe(false);
  });

  test('a new backlog while recovering starts the wait again', () => {
    let uplinkHealth = updateUplinkHealth(HEALTHY_UPLINK, {
      bufferedByteCount: WEAK_CONNECTION_BACKLOG_BYTES + 1,
      nowEpochMilliseconds: 0,
    });
    uplinkHealth = updateUplinkHealth(uplinkHealth, {
      bufferedByteCount: 0,
      nowEpochMilliseconds: 1000,
    });
    uplinkHealth = updateUplinkHealth(uplinkHealth, {
      bufferedByteCount: WEAK_CONNECTION_BACKLOG_BYTES / 2,
      nowEpochMilliseconds: 2000,
    });
    uplinkHealth = updateUplinkHealth(uplinkHealth, {
      bufferedByteCount: 0,
      nowEpochMilliseconds: 1000 + RECOVERY_MILLISECONDS,
    });
    expect(uplinkHealth.isWeak).toBe(true);
  });
});
