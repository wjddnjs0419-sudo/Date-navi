import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { parseStepIntents, type ParsedStepIntent, type StepIntentStrength } from './step-intent.ts';
import { normalizeRecommendationCategory } from './recommendation-category.ts';
import {
  type StepIntentType,
} from './step-intent-dictionary.ts';
import { ALL_STEP_INTENT_DICTIONARY, getStepIntentDictionaryEntry } from './food-intent-dictionary.ts';

export type StepIntentSource = 'none' | 'rule' | 'ai';

export type UnsupportedIntent = { term: string; reason: string };
export type IntentConflict = { description: string };

export type AiParseResult = {
  stepIntents: ParsedStepIntent[];
  excludedIntents?: ParsedStepIntent[];
  unsupported: UnsupportedIntent[];
  conflicts: IntentConflict[];
};

const INTENT_TYPES: readonly StepIntentType[] = ['dish', 'cuisine', 'venue_subtype', 'activity', 'culture_subtype', 'drink_type'];

/**
 * generate-ai(parse_step_intents)의 원출력을 ParsedStepIntent로 강제 변환한다.
 * targetCategory가 일치하는 첫 미사용·미잠금 course step에 바인딩(규칙 파서와 동일 원칙).
 * 바인딩할 step이 없는 항목은 unsupported로 옮긴다.
 */
export function coerceAiParseResult(raw: unknown, request: RecommendationRequest): AiParseResult {
  const root = (raw ?? {}) as Record<string, unknown>;
  const rawIntents = Array.isArray(root.stepIntents) ? root.stepIntents : [];
  const lockedStepIds = new Set((request.lockedSteps ?? []).map((lock) => lock.stepId));
  const usedStepIds = new Set<string>();
  const stepIntents: ParsedStepIntent[] = [];
  const excludedIntents: ParsedStepIntent[] = [];
  const unsupported: UnsupportedIntent[] = [];

  for (const item of rawIntents) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const canonicalTerm = typeof entry.canonicalTerm === 'string' ? entry.canonicalTerm.trim() : '';
    const targetCategory = typeof entry.targetCategory === 'string' ? entry.targetCategory : '';
    if (!canonicalTerm || !targetCategory) continue;
    const negated = entry.negated === true;
    const step = request.courseSteps.find((candidate) => (
      !lockedStepIds.has(candidate.id)
      && (negated || !usedStepIds.has(candidate.id))
      && normalizeRecommendationCategory(candidate.category) === targetCategory
    ));
    if (!step) {
      unsupported.push({ term: canonicalTerm, reason: `no ${targetCategory} step in course` });
      continue;
    }
    const dictionaryEntry = getStepIntentDictionaryEntry(canonicalTerm);
    const kakaoSearchTerms = Array.isArray(entry.kakaoSearchTerms)
      ? entry.kakaoSearchTerms.filter((term): term is string => typeof term === 'string').slice(0, 3)
      : [];
    const intent: ParsedStepIntent = {
      stepId: step.id,
      stepCategory: targetCategory,
      intentType: INTENT_TYPES.includes(entry.intentType as StepIntentType) ? entry.intentType as StepIntentType : 'dish',
      canonicalTerm,
      kakaoSearchTerms: kakaoSearchTerms.length > 0 ? kakaoSearchTerms : [canonicalTerm],
      strength: (entry.strength === 'required' ? 'required' : 'preferred') as StepIntentStrength,
      displayLabel: dictionaryEntry?.displayLabel ?? { ko: canonicalTerm, en: canonicalTerm },
      ...(negated ? { negated: true } : {}),
    };
    if (negated) {
      excludedIntents.push(intent);
    } else {
      usedStepIds.add(step.id);
      stepIntents.push(intent);
    }
  }

  const rawUnsupported = Array.isArray(root.unsupported) ? root.unsupported : [];
  for (const item of rawUnsupported) {
    const entry = (item ?? {}) as Record<string, unknown>;
    if (typeof entry.term === 'string' && typeof entry.reason === 'string') {
      unsupported.push({ term: entry.term, reason: entry.reason });
    }
  }
  const rawConflicts = Array.isArray(root.conflicts) ? root.conflicts : [];
  const conflicts: IntentConflict[] = rawConflicts
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((entry) => typeof entry.description === 'string')
    .map((entry) => ({ description: entry.description as string }));

  return { stepIntents, excludedIntents, unsupported, conflicts };
}

export type ResolvedStepIntents = {
  source: StepIntentSource;
  stepIntents: ParsedStepIntent[];
  excludedIntents: ParsedStepIntent[];
  unsupported: UnsupportedIntent[];
  conflicts: IntentConflict[];
  aiError?: boolean;
};

type ResolveDeps = {
  invokeAi?: (request: RecommendationRequest) => Promise<AiParseResult>;
};

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 도메인 불용어: 조사·동사·요청 상투어 + required/negation 마커. 잔여 신호에서 제외한다.
const GATE_STOPWORDS = new Set([
  '먹고', '먹', '싶어', '싶다', '싶고', '하고', '하고파', '가고', '가고싶어', '가고싶다', '좋겠어', '좋을', '좋겠다',
  '같아', '같아요', '거', '것', '곳', '데', '때', '있는', '있으면', '했으면', '분위기', '느낌', '가는',
  '데이트', '코스', '장소', '주변', '근처', '좀', '조금', '정도', '같은', '그리고', '또', '너무', '진짜',
  '무조건', '반드시', '꼭', '말고', '말구', '빼고', '제외', '아니', '아니면',
  'i', 'want', 'wanna', 'would', 'like', 'for', 'the', 'a', 'an', 'to', 'go', 'going', 'some', 'please',
  'and', 'or', 'but', 'dinner', 'lunch', 'date', 'place', 'somewhere', 'course', 'with', 'my', 'we', 'us', 'that',
]);

const isLatinAlias = (alias: string): boolean => /^[a-z0-9 ]+$/i.test(alias);

function removeDictionaryAlias(text: string, alias: string): string {
  const normalizedAlias = normalize(alias);
  return isLatinAlias(normalizedAlias)
    ? text.replace(new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`, 'gi'), ' ')
    : text.split(normalizedAlias).join(' ');
}

/** 사전의 모든 alias(canonical 포함)를 텍스트에서 공백으로 치환해 매칭 스팬을 제거한다. */
function stripKnownTerms(text: string): string {
  let out = text;
  for (const entry of ALL_STEP_INTENT_DICTIONARY) {
    for (const alias of [entry.canonicalTerm, ...entry.aliases]) {
      out = removeDictionaryAlias(out, alias);
    }
  }
  return out;
}

/**
 * 스펙 §8.2 고재현 게이트: 사전어 스팬 + 불용어 제거 후 content 토큰(한글 2자↑ / 라틴 3자↑)이
 * 하나라도 남으면 AI가 볼 뉘앙스(다중타깃·복합패러프레이즈·저신뢰·미등재어)가 있다고 본다.
 */
export function hasMeaningfulResidual(additionalRequest: string): boolean {
  const stripped = stripKnownTerms(normalize(additionalRequest));
  const tokens = stripped.split(/[\s.,!?~()'"·・…]+/).filter(Boolean);
  return tokens.some((token) => {
    if (GATE_STOPWORDS.has(token)) return false;
    if (/^[a-z]+$/.test(token)) return token.length >= 3;
    const hangul = token.replace(/[^가-힣]/g, '');
    return hangul.length >= 2 && !GATE_STOPWORDS.has(hangul);
  });
}

const intentIdentity = (intent: ParsedStepIntent): string => (
  `${normalize(intent.stepId)}:${normalize(intent.canonicalTerm)}`
);

/** 첫 결과(규칙 우선)를 보존하고, 중복 intent의 required 강도만 승격한다. */
function dedupeIntents(intents: ParsedStepIntent[]): ParsedStepIntent[] {
  const deduped = new Map<string, ParsedStepIntent>();
  for (const intent of intents) {
    const key = intentIdentity(intent);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, intent);
    } else if (existing.strength !== 'required' && intent.strength === 'required') {
      deduped.set(key, { ...existing, strength: 'required' });
    }
  }
  return [...deduped.values()];
}

/**
 * 사전 exact match를 보존하고 AI는 미등재/누락 intent만 보강한다.
 * 명시적 부정은 source와 stepId에 관계없이 같은 canonical positive보다 우선한다.
 */
export function mergeRuleAndAiIntents(
  ruleIntents: ParsedStepIntent[],
  aiIntents: ParsedStepIntent[],
  excludedIntents: ParsedStepIntent[],
): ParsedStepIntent[] {
  const excludedTerms = new Set(excludedIntents.map((intent) => normalize(intent.canonicalTerm)));
  return dedupeIntents([...ruleIntents, ...aiIntents])
    .filter((intent) => !excludedTerms.has(normalize(intent.canonicalTerm)));
}

export async function resolveStepIntents(
  request: RecommendationRequest,
  deps: ResolveDeps = {},
): Promise<ResolvedStepIntents> {
  const raw = request.additionalRequest?.trim();
  if (!raw) {
    return { source: 'none', stepIntents: [], excludedIntents: [], unsupported: [], conflicts: [] };
  }

  const rule = parseStepIntents(request);
  const ruleFound = rule.stepIntents.length > 0 || rule.excludedIntents.length > 0;
  const shouldTryAi = Boolean(deps.invokeAi) && hasMeaningfulResidual(raw);

  if (!shouldTryAi) {
    return {
      source: ruleFound ? 'rule' : 'none',
      stepIntents: rule.stepIntents,
      excludedIntents: rule.excludedIntents,
      unsupported: [],
      conflicts: [],
    };
  }

  try {
    const ai = await deps.invokeAi!(request);
    const excludedIntents = dedupeIntents([...rule.excludedIntents, ...(ai.excludedIntents ?? [])]);
    return {
      source: 'ai',
      stepIntents: mergeRuleAndAiIntents(rule.stepIntents, ai.stepIntents, excludedIntents),
      excludedIntents,
      unsupported: ai.unsupported ?? [],
      conflicts: ai.conflicts ?? [],
    };
  } catch {
    // AI 실패/타임아웃 → 규칙 결과로 graceful degrade.
    return {
      source: ruleFound ? 'rule' : 'none',
      stepIntents: rule.stepIntents,
      excludedIntents: rule.excludedIntents,
      unsupported: [],
      conflicts: [],
      aiError: true,
    };
  }
}
