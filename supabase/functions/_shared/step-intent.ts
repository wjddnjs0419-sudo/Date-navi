import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { normalizeRecommendationCategory } from './recommendation-category.ts';
import {
  STEP_INTENT_DICTIONARY,
  type StepIntentDictionaryEntry,
  type StepIntentType,
} from './step-intent-dictionary.ts';

export const STEP_INTENT_PARSER_VERSION = 'step-intent-rules-v1';

export type StepIntentStrength = 'required' | 'preferred';

export type ParsedStepIntent = {
  stepId: string;
  stepCategory: string;
  intentType: StepIntentType;
  canonicalTerm: string;
  /** [canonical, ...expansions] — 인덱스가 곧 expansionLevel(0/1/2). */
  kakaoSearchTerms: string[];
  strength: StepIntentStrength;
  displayLabel: { ko: string; en: string };
  /** 부정 마커(말고/빼고/not)로 걸린 intent. positive가 아니라 excludedIntents로 분리된다. */
  negated?: boolean;
};

export type ParsedStepIntents = {
  stepIntents: ParsedStepIntent[];
  excludedIntents: ParsedStepIntent[];
  parserVersion: string;
};

const REQUIRED_MARKERS_KO = /(?:무조건|반드시|꼭)/;
const REQUIRED_MARKERS_EN = /\b(?:only|must|has to be)\b/i;
/** 대상어 앞쪽에서 required 마커를 찾는 로컬 window(자소 단위). */
const REQUIRED_WINDOW = 14;

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();

type AliasMatch = { entry: StepIntentDictionaryEntry; index: number };

function findAliasMatch(text: string, entry: StepIntentDictionaryEntry): number {
  const koTerms = [entry.canonicalTerm, ...entry.koAliases];
  for (const term of koTerms) {
    const index = text.indexOf(normalize(term));
    if (index >= 0) return index;
  }
  for (const alias of entry.enAliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = pattern.exec(text);
    if (match) return match.index;
  }
  return -1;
}

function isRequiredAt(text: string, matchIndex: number): boolean {
  // required 마커(무조건/반드시/꼭/only/must/has to be)는 대상어 앞에 오는 게 일반적이라
  // 앞쪽 prefix만 본다. "삼겹살 말고 무조건 파스타"에서 삼겹살이 뒤 '무조건'을 잡는 오판을 막는다.
  const windowText = text.slice(Math.max(0, matchIndex - REQUIRED_WINDOW), matchIndex);
  return REQUIRED_MARKERS_KO.test(windowText) || REQUIRED_MARKERS_EN.test(windowText);
}

const NEGATION_MARKERS_KO = /(?:말고|말구|빼고|제외|아니)/;
const NEGATION_MARKERS_EN = /\b(?:not|except|no)\b/i;
const NEGATION_WINDOW = 10;

function isNegatedAt(text: string, matchIndex: number, canonicalLen: number): boolean {
  // 한국어 부정은 대상어 뒤에 온다("삼겹살 말고"), 영어 부정은 앞에 온다("not sushi").
  // 영어 마커를 뒤 창에서 보면 다음 단어의 부정어를 앞 단어가 가로채므로("pasta but not sushi"에서
  // pasta가 sushi의 not을 삼킴) 방향을 분리한다.
  const after = text.slice(matchIndex + canonicalLen, matchIndex + canonicalLen + NEGATION_WINDOW);
  const before = text.slice(Math.max(0, matchIndex - NEGATION_WINDOW), matchIndex);
  return NEGATION_MARKERS_KO.test(after) || NEGATION_MARKERS_EN.test(before);
}

export function parseStepIntents(request: RecommendationRequest): ParsedStepIntents {
  const raw = request.additionalRequest?.trim();
  if (!raw) return { stepIntents: [], excludedIntents: [], parserVersion: STEP_INTENT_PARSER_VERSION };
  const text = normalize(raw);

  // 사전 순회로 매칭 수집. 같은 canonical은 1회만.
  const matches: AliasMatch[] = [];
  for (const entry of STEP_INTENT_DICTIONARY) {
    const index = findAliasMatch(text, entry);
    if (index >= 0) matches.push({ entry, index });
  }
  matches.sort((a, b) => a.index - b.index);

  // locked 스텝은 선택 단계에서 lock으로 pin되어 intent가 무시되므로(유령 거부/무음 무시 방지)
  // 애초에 intent를 배정하지 않는다.
  const lockedStepIds = new Set((request.lockedSteps ?? []).map((lock) => lock.stepId));
  const usedStepIds = new Set<string>();
  const stepIntents: ParsedStepIntent[] = [];
  const excludedIntents: ParsedStepIntent[] = [];
  for (const { entry, index } of matches) {
    const negated = isNegatedAt(text, index, normalize(entry.canonicalTerm).length);
    // 부정 intent는 step을 점유하지 않으므로(제외는 이름/카테고리 기반) 사용 여부와 무관하게 수집한다.
    // positive는 아직 안 쓴 대상 category step이 있어야 바인딩된다.
    const matchingStep = request.courseSteps.find((candidate) => (
      !lockedStepIds.has(candidate.id)
      && (negated || !usedStepIds.has(candidate.id))
      && normalizeRecommendationCategory(candidate.category) === entry.targetCategory
    ));
    if (!matchingStep) continue; // 대상 category step 없음 → intent 미생성(Phase 2에서 unsupported로 노출)
    const intent: ParsedStepIntent = {
      stepId: matchingStep.id,
      stepCategory: entry.targetCategory,
      intentType: entry.intentType,
      canonicalTerm: entry.canonicalTerm,
      kakaoSearchTerms: [entry.canonicalTerm, ...entry.expansions].slice(0, 3),
      strength: isRequiredAt(text, index) ? 'required' : 'preferred',
      displayLabel: entry.displayLabel,
      ...(negated ? { negated: true } : {}),
    };
    if (negated) {
      excludedIntents.push(intent);
    } else {
      usedStepIds.add(matchingStep.id);
      stepIntents.push(intent);
    }
  }
  return { stepIntents, excludedIntents, parserVersion: STEP_INTENT_PARSER_VERSION };
}

/**
 * 핸들러가 부착한 resolvedStepIntents(규칙+AI 병합 결과)가 있으면 그걸, 없으면 규칙 파서를 쓴다.
 * 부착값은 빈 배열도 "이미 resolve됨"의 신호이므로 재파싱하지 않는다(null/undefined일 때만 폴백).
 */
export function effectiveStepIntents(
  request: RecommendationRequest & { resolvedStepIntents?: ParsedStepIntent[] },
): ParsedStepIntent[] {
  return request.resolvedStepIntents ?? parseStepIntents(request).stepIntents;
}

/** effectiveStepIntents의 부정 intent 대칭. resolvedExcludedIntents 우선, 없으면 규칙. */
export function effectiveExcludedIntents(
  request: RecommendationRequest & { resolvedExcludedIntents?: ParsedStepIntent[] },
): ParsedStepIntent[] {
  return request.resolvedExcludedIntents ?? parseStepIntents(request).excludedIntents;
}

type IntentEvidence = {
  phase?: string;
  canonicalTerm?: string;
};

type IntentMatchablePlace = {
  name: string;
  categoryName: string;
  matchedSearchEvidence: readonly IntentEvidence[];
};

/** 스펙 §12.2 required 충족 조건: exact 검색 evidence ∨ 이름 포함 ∨ 호환 상세 category. */
export function placeMatchesStepIntent(place: IntentMatchablePlace, intent: ParsedStepIntent): boolean {
  if (place.matchedSearchEvidence.some((evidence) => (
    evidence.phase === 'step_intent' && evidence.canonicalTerm === intent.canonicalTerm
  ))) return true;
  const entry = STEP_INTENT_DICTIONARY.find((candidate) => candidate.canonicalTerm === intent.canonicalTerm);
  const name = normalize(place.name);
  if (name.includes(normalize(intent.canonicalTerm))) return true;
  const categoryName = normalize(place.categoryName ?? '');
  return (entry?.compatibleCategoryNameKeywords ?? []).some((keyword) => categoryName.includes(normalize(keyword)));
}
