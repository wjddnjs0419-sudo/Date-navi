import { readFileSync } from 'node:fs';
import { historyExperimentLogKey } from '../shared/recommendation/history-experiment';

type Variant = 'control' | 'treatment';
type Arm = 'assigned' | 'effective';

type ExperimentMetadata = {
  name: 'history-diversity-v1';
  assignedVariant: Variant;
  effectiveVariant: Variant;
  assignmentUnit: 'couple' | 'user';
  historyLoad: 'not_attempted' | 'loaded' | 'failed';
  fallbackReason?: 'history_load_failed';
  recentHistoryExcludedCount: number;
  recentCooldownRelaxed: boolean;
};

type EvaluationSession = {
  id: string;
  ownerUserId: string;
  coupleId: string | null;
  createdAt: string;
  originalRequest: { location?: { latitude?: number; longitude?: number } };
  metadata: { historyExperiment?: ExperimentMetadata };
  steps: Array<{ originalKakaoPlaceId: string | null }>;
};

type EvaluationEvent = {
  sessionId: string;
  eventType: string;
  candidateRank?: number | null;
};

type TerminalLog = {
  event: 'recommend_date_history_outcome' | 'replacement_candidates_served';
  assignedVariant: Variant;
  effectiveVariant: Variant;
  outcome?: string;
  topThreeRepeatCount?: number;
  poolSize?: number;
  empty?: boolean;
  sessionKey?: string;
  /** Emitted by the Edge whenever the experiment was resolved for the request (mode !== off). */
  experimentActive?: boolean;
};

export type RecommendationHistoryAbInput = {
  sessions: EvaluationSession[];
  events: EvaluationEvent[];
  terminalLogs: TerminalLog[];
};

export type Rate = { numerator: number; denominator: number; value: number | null };

export type ArmReport = {
  assignmentUnitCount: number;
  sessionCount: number;
  sameAreaRepeatRate: Rate;
  recentHistoryExcludedCount: Rate;
  recentCooldownRelaxedRate: Rate;
  loaderFallbackRate: Rate;
  replacementTop3RepeatRate: Rate;
  replacementTop3PickRate: Rate;
  replacementEmptyRate: Rate;
  courseGenerationFailureRate: Rate;
};

export type RecommendationHistoryAbReport = {
  assigned: Record<Variant, ArmReport>;
  effective: Record<Variant, ArmReport>;
};

const emptyRate = (): Rate => ({ numerator: 0, denominator: 0, value: null });
const rate = (numerator: number, denominator: number): Rate => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : numerator / denominator,
});

const emptyReport = (): ArmReport => ({
  assignmentUnitCount: 0,
  sessionCount: 0,
  sameAreaRepeatRate: emptyRate(),
  recentHistoryExcludedCount: emptyRate(),
  recentCooldownRelaxedRate: emptyRate(),
  loaderFallbackRate: emptyRate(),
  replacementTop3RepeatRate: emptyRate(),
  replacementTop3PickRate: emptyRate(),
  replacementEmptyRate: emptyRate(),
  courseGenerationFailureRate: emptyRate(),
});

const coordinate = (session: EvaluationSession) => {
  const location = session.originalRequest.location;
  return typeof location?.latitude === 'number' && Number.isFinite(location.latitude)
    && typeof location.longitude === 'number' && Number.isFinite(location.longitude)
    ? { latitude: location.latitude, longitude: location.longitude }
    : undefined;
};

const distanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
};

const experiment = (session: EvaluationSession): ExperimentMetadata | undefined => {
  const value = session.metadata?.historyExperiment;
  return value && (value.assignedVariant === 'control' || value.assignedVariant === 'treatment')
    && (value.effectiveVariant === 'control' || value.effectiveVariant === 'treatment')
    && (value.assignmentUnit === 'couple' || value.assignmentUnit === 'user')
    ? value
    : undefined;
};

const unitKey = (session: EvaluationSession, metadata: ExperimentMetadata) => (
  metadata.assignmentUnit === 'couple' && session.coupleId ? `couple:${session.coupleId}` : `user:${session.ownerUserId}`
);

function sameAreaRepeatByUnit(sessions: EvaluationSession[], metadataById: Map<string, ExperimentMetadata>): Map<string, Rate> {
  const grouped = new Map<string, EvaluationSession[]>();
  for (const session of sessions) {
    const metadata = metadataById.get(session.id);
    if (!metadata || !coordinate(session)) continue;
    const key = unitKey(session, metadata);
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }
  const results = new Map<string, Rate>();
  for (const [key, group] of grouped) {
    const ordered = [...group].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
    let repeatCount = 0;
    let eligibleCount = 0;
    ordered.forEach((current, index) => {
      const currentLocation = coordinate(current)!;
      const priorSameArea = ordered.slice(0, index).reverse()
        .filter((prior) => distanceMeters(currentLocation, coordinate(prior)!) <= 2_000)
        .slice(0, 2);
      // A two-session lookback is only meaningful once both reference sessions exist.
      if (priorSameArea.length !== 2) return;
      const priorPlaceIds = new Set(priorSameArea.flatMap((session) => session.steps
        .map((step) => step.originalKakaoPlaceId).filter((id): id is string => Boolean(id))));
      const repeats = current.steps.some((step) => step.originalKakaoPlaceId !== null && priorPlaceIds.has(step.originalKakaoPlaceId));
      eligibleCount += 1;
      if (repeats) repeatCount += 1;
    });
    results.set(key, rate(repeatCount, eligibleCount));
  }
  return results;
}

function averageUnitRates(rates: Iterable<Rate>): Rate {
  const eligible = [...rates].filter((entry) => entry.value !== null);
  if (eligible.length === 0) return emptyRate();
  const numerator = eligible.reduce((sum, entry) => sum + entry.value!, 0);
  return { numerator, denominator: eligible.length, value: numerator / eligible.length };
}

function reportForArm(
  arm: Arm,
  variant: Variant,
  input: RecommendationHistoryAbInput,
  metadataById: Map<string, ExperimentMetadata>,
  sameAreaByUnit: Map<string, Rate>,
): ArmReport {
  const sessions = input.sessions.filter((session) => metadataById.get(session.id)?.[`${arm}Variant`] === variant);
  const unitRates = new Map<string, Rate>();
  for (const session of sessions) {
    const metadata = metadataById.get(session.id)!;
    const key = unitKey(session, metadata);
    if (!unitRates.has(key)) unitRates.set(key, sameAreaByUnit.get(key) ?? emptyRate());
  }
  const sessionIds = new Set(sessions.map((session) => session.id));
  const replacementEvents = input.events.filter((event) => (
    event.eventType === 'place_replaced' && sessionIds.has(event.sessionId) && Number.isInteger(event.candidateRank) && (event.candidateRank ?? 0) > 0
  ));
  const sessionKeys = new Set(sessions.map((session) => historyExperimentLogKey(session.id)));
  const matchesSessionKey = (entry: TerminalLog) => (
    typeof entry.sessionKey === 'string' && sessionKeys.has(entry.sessionKey)
  );
  const replacementLogs = input.terminalLogs.filter((entry) => (
    entry.event === 'replacement_candidates_served' && entry[`${arm}Variant`] === variant && matchesSessionKey(entry)
  ));
  // 최초 생성 실패는 세션 row가 없어 sessionKey join이 불가능하므로,
  // experiment-active marker가 붙은 로그는 arm 기준으로 직접 집계한다.
  const generationLogs = input.terminalLogs.filter((entry) => (
    entry.event === 'recommend_date_history_outcome' && entry[`${arm}Variant`] === variant
    && (entry.experimentActive === true || matchesSessionKey(entry))
  ));
  const replacementCandidateCount = replacementLogs.reduce((sum, entry) => sum + Math.min(3, Math.max(0, entry.poolSize ?? 3)), 0);

  return {
    assignmentUnitCount: unitRates.size,
    sessionCount: sessions.length,
    sameAreaRepeatRate: averageUnitRates(unitRates.values()),
    recentHistoryExcludedCount: rate(
      sessions.reduce((sum, session) => sum + metadataById.get(session.id)!.recentHistoryExcludedCount, 0),
      sessions.length,
    ),
    recentCooldownRelaxedRate: rate(
      sessions.filter((session) => metadataById.get(session.id)!.recentCooldownRelaxed).length,
      sessions.length,
    ),
    loaderFallbackRate: rate(
      sessions.filter((session) => metadataById.get(session.id)!.historyLoad === 'failed').length,
      sessions.length,
    ),
    replacementTop3RepeatRate: rate(
      replacementLogs.reduce((sum, entry) => sum + Math.max(0, entry.topThreeRepeatCount ?? 0), 0),
      replacementCandidateCount,
    ),
    replacementTop3PickRate: rate(
      replacementEvents.filter((event) => (event.candidateRank ?? 99) <= 3).length,
      replacementEvents.length,
    ),
    replacementEmptyRate: rate(replacementLogs.filter((entry) => entry.empty).length, replacementLogs.length),
    courseGenerationFailureRate: rate(
      generationLogs.filter((entry) => entry.outcome !== 'success').length,
      generationLogs.length,
    ),
  };
}

export function analyzeRecommendationHistoryAb(input: RecommendationHistoryAbInput): RecommendationHistoryAbReport {
  const metadataById = new Map(input.sessions.flatMap((session) => {
    const metadata = experiment(session);
    return metadata ? [[session.id, metadata] as const] : [];
  }));
  const eligibleSessions = input.sessions.filter((session) => metadataById.has(session.id));
  const sameAreaByUnit = sameAreaRepeatByUnit(eligibleSessions, metadataById);
  return {
    assigned: {
      control: reportForArm('assigned', 'control', input, metadataById, sameAreaByUnit),
      treatment: reportForArm('assigned', 'treatment', input, metadataById, sameAreaByUnit),
    },
    effective: {
      control: reportForArm('effective', 'control', input, metadataById, sameAreaByUnit),
      treatment: reportForArm('effective', 'treatment', input, metadataById, sameAreaByUnit),
    },
  };
}

function main() {
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
  if (!inputArg) throw new Error('Usage: tsx scripts/eval-recommendation-history-ab.ts --input=export.json');
  const input = JSON.parse(readFileSync(inputArg.slice('--input='.length), 'utf8')) as RecommendationHistoryAbInput;
  console.log(JSON.stringify(analyzeRecommendationHistoryAb(input), null, 2));
}

if (process.argv[1]?.endsWith('eval-recommendation-history-ab.ts')) main();
