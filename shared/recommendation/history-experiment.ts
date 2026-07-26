import { historyExperimentMetadataSchema } from './schemas.ts';

export type HistoryExperimentMode = 'off' | 'ab50' | 'treatment';
export type HistoryExperimentVariant = 'control' | 'treatment';
export type HistoryExperimentLoadStatus = 'not_attempted' | 'loaded' | 'failed';

export type HistoryExperimentResolution = {
  assignedVariant: HistoryExperimentVariant;
  effectiveVariant: HistoryExperimentVariant;
  assignmentUnit: 'couple' | 'user';
  historyLoad: HistoryExperimentLoadStatus;
  fallbackReason?: 'history_load_failed';
};

export function persistedHistoryExperimentVariant(metadata: unknown): HistoryExperimentVariant | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const parsed = historyExperimentMetadataSchema.safeParse(
    (metadata as Record<string, unknown>).historyExperiment,
  );
  return parsed.success ? parsed.data.assignedVariant : undefined;
}

type ResolveHistoryExperimentInput = {
  mode: HistoryExperimentMode;
  coupleId?: string | null;
  userId: string;
  persistedAssignedVariant?: HistoryExperimentVariant;
  historyLoadStatus: HistoryExperimentLoadStatus;
};

const EXPERIMENT_KEY_PREFIX = 'history-diversity-v1:';

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** One-way correlation key for structured logs; never emit the source ID. */
export function historyExperimentLogKey(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of `history-diversity-log-v1:${value}`) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function isCoupleAssignment(coupleId: string | null | undefined): coupleId is string {
  return typeof coupleId === 'string' && coupleId.trim().length > 0;
}

export function resolveHistoryExperiment(input: ResolveHistoryExperimentInput): HistoryExperimentResolution {
  const assignmentUnit = isCoupleAssignment(input.coupleId) ? 'couple' : 'user';
  const assignmentKey = assignmentUnit === 'couple' ? input.coupleId : input.userId;
  const assignedVariant = input.mode === 'off'
    ? 'control'
    : input.persistedAssignedVariant
      ?? (input.mode === 'treatment'
        ? 'treatment'
        : stableHash(`${EXPERIMENT_KEY_PREFIX}${assignmentKey}`) % 2 === 0 ? 'control' : 'treatment');

  if (assignedVariant !== 'treatment') {
    return {
      assignedVariant,
      effectiveVariant: 'control',
      assignmentUnit,
      historyLoad: input.historyLoadStatus,
    };
  }

  if (input.historyLoadStatus === 'loaded') {
    return {
      assignedVariant,
      effectiveVariant: 'treatment',
      assignmentUnit,
      historyLoad: 'loaded',
    };
  }

  return {
    assignedVariant,
    effectiveVariant: 'control',
    assignmentUnit,
    historyLoad: input.historyLoadStatus,
    ...(input.historyLoadStatus === 'failed' ? { fallbackReason: 'history_load_failed' as const } : {}),
  };
}
