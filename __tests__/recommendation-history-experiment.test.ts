import {
  historyExperimentLogKey,
  persistedHistoryExperimentVariant,
  resolveHistoryExperiment,
} from '../shared/recommendation/history-experiment';

describe('history diversity experiment assignment', () => {
  it('uses a stable 64-bit opaque log correlation key', () => {
    expect(historyExperimentLogKey('session-a')).toMatch(/^[0-9a-f]{16}$/);
    expect(historyExperimentLogKey('session-a')).toBe(historyExperimentLogKey('session-a'));
    expect(historyExperimentLogKey('session-a')).not.toBe(historyExperimentLogKey('session-b'));
  });

  it('assigns a connected pair from its shared couple key without exposing either identifier', () => {
    const firstPartner = resolveHistoryExperiment({
      mode: 'ab50',
      coupleId: 'couple-shared-001',
      userId: 'user-first',
      historyLoadStatus: 'loaded',
    });
    const secondPartner = resolveHistoryExperiment({
      mode: 'ab50',
      coupleId: 'couple-shared-001',
      userId: 'user-second',
      historyLoadStatus: 'loaded',
    });

    expect(firstPartner).toEqual(secondPartner);
    expect(firstPartner).toMatchObject({
      assignmentUnit: 'couple',
      effectiveVariant: firstPartner.assignedVariant,
      historyLoad: 'loaded',
    });
    expect(JSON.stringify(firstPartner)).not.toContain('couple-shared-001');
    expect(JSON.stringify(firstPartner)).not.toContain('user-first');
    expect(JSON.stringify(firstPartner)).not.toContain('user-second');
  });

  it('uses an unlinked user key and keeps its AB assignment stable', () => {
    const first = resolveHistoryExperiment({
      mode: 'ab50',
      userId: 'unlinked-user-001',
      historyLoadStatus: 'loaded',
    });
    const retry = resolveHistoryExperiment({
      mode: 'ab50',
      userId: 'unlinked-user-001',
      historyLoadStatus: 'loaded',
    });

    expect(first).toEqual(retry);
    expect(first).toMatchObject({
      assignmentUnit: 'user',
      effectiveVariant: first.assignedVariant,
      historyLoad: 'loaded',
    });
    expect(JSON.stringify(first)).not.toContain('unlinked-user-001');
  });

  it('uses control without attempting history when disabled', () => {
    expect(resolveHistoryExperiment({
      mode: 'off',
      userId: 'user-disabled',
      historyLoadStatus: 'not_attempted',
    })).toEqual({
      assignedVariant: 'control',
      effectiveVariant: 'control',
      assignmentUnit: 'user',
      historyLoad: 'not_attempted',
    });
  });

  it('falls a treatment assignment back to control when its history load fails', () => {
    expect(resolveHistoryExperiment({
      mode: 'treatment',
      coupleId: 'couple-failed-load',
      userId: 'user-failed-load',
      historyLoadStatus: 'failed',
    })).toEqual({
      assignedVariant: 'treatment',
      effectiveVariant: 'control',
      assignmentUnit: 'couple',
      historyLoad: 'failed',
      fallbackReason: 'history_load_failed',
    });
  });

  it('preserves a session’s stored arm during regeneration', () => {
    expect(resolveHistoryExperiment({
      mode: 'ab50',
      coupleId: 'couple-newly-rehashed',
      userId: 'user-newly-rehashed',
      persistedAssignedVariant: 'treatment',
      historyLoadStatus: 'loaded',
    })).toMatchObject({
      assignedVariant: 'treatment',
      effectiveVariant: 'treatment',
      assignmentUnit: 'couple',
      historyLoad: 'loaded',
    });
  });

  it('accepts only a persisted server experiment arm and ignores arbitrary metadata', () => {
    expect(persistedHistoryExperimentVariant({
      historyExperiment: {
        name: 'history-diversity-v1', assignedVariant: 'treatment', effectiveVariant: 'treatment', assignmentUnit: 'user',
        historyLoad: 'loaded', recentHistoryExcludedCount: 0, recentCooldownRelaxed: false,
      },
    })).toBe('treatment');
    expect(persistedHistoryExperimentVariant({
      historyExperiment: { assignedVariant: 'client-picked-arm' },
    })).toBeUndefined();
  });
});
