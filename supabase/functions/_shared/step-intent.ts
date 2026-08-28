import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { normalizeRecommendationCategory } from './recommendation-category.ts';
import {
  type StepIntentDictionaryEntry,
  type StepIntentType,
} from './step-intent-dictionary.ts';
import { ALL_STEP_INTENT_DICTIONARY, getStepIntentDictionaryEntry } from './food-intent-dictionary.ts';

export const STEP_INTENT_PARSER_VERSION = 'step-intent-rules-v1';

export type StepIntentStrength = 'required' | 'preferred';

export type ParsedStepIntent = {
  stepId: string;
  stepCategory: string;
  intentType: StepIntentType;
  canonicalTerm: string;
  /** [canonical, ...searchExpansions] — 인덱스가 곧 expansionLevel(0/1/2). */
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
const REQUIRED_SUFFIX_WINDOW = 16;
const REQUIRED_SUFFIX_KO = /^(?:은|는|이|가|을|를|으로|로|도)?\s*(?:(?:꼭|반드시|무조건)\s*(?:먹|해야|할|포함)|(?:먹어야|먹을|포함되어야)\s*(?:해|함)|고정)/;
const REQUIRED_SUFFIX_EN = /^\s*(?:is\s+)?(?:a\s+)?must\b|^\s*(?:only|must|has\s+to\s+be)\b/i;

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();

type AliasMatch = { entry: StepIntentDictionaryEntry; index: number; matchedLength: number };

function findAliasMatches(text: string, entry: StepIntentDictionaryEntry): Omit<AliasMatch, 'entry'>[] {
  const matches: Omit<AliasMatch, 'entry'>[] = [];
  for (const alias of [entry.canonicalTerm, ...entry.aliases]) {
    const normalizedAlias = normalize(alias);
    if (!normalizedAlias) continue;
    if (/^[a-z0-9 ]+$/i.test(normalizedAlias)) {
      const pattern = new RegExp(`\\b${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        matches.push({ index: match.index, matchedLength: match[0].length });
      }
      continue;
    }
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const index = text.indexOf(normalizedAlias, fromIndex);
      if (index < 0) break;
      matches.push({ index, matchedLength: normalizedAlias.length });
      fromIndex = index + normalizedAlias.length;
    }
  }
  return matches;
}

function stableUnique(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

function isRequiredAt(
  text: string,
  matchIndex: number,
  canonicalLen: number,
  previousMatchEnd: number,
): boolean {
  // 앞 마커는 기존처럼 국소 window만 본다. 뒤 마커는 대상어 직후의 문법 형태만 허용해
  // "삼겹살 말고 무조건 파스타"의 무조건이 앞 음식으로 번지는 것을 막는다.
  const prefixStart = Math.max(
    0,
    matchIndex - REQUIRED_WINDOW,
    previousMatchEnd <= matchIndex ? previousMatchEnd : 0,
  );
  const prefix = text.slice(prefixStart, matchIndex);
  const suffix = text.slice(matchIndex + canonicalLen, matchIndex + canonicalLen + REQUIRED_SUFFIX_WINDOW);
  return REQUIRED_MARKERS_KO.test(prefix)
    || REQUIRED_MARKERS_EN.test(prefix)
    || REQUIRED_SUFFIX_KO.test(suffix)
    || REQUIRED_SUFFIX_EN.test(suffix);
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
  for (const entry of ALL_STEP_INTENT_DICTIONARY) {
    matches.push(...findAliasMatches(text, entry).map((match) => ({ entry, ...match })));
  }
  matches.sort((a, b) => a.index - b.index || b.matchedLength - a.matchedLength);
  // 같은 텍스트 span을 공유하는 더 일반적인 intent는 버린다. "수제맥주"와 "맥주"처럼
  // 중첩된 부정 intent를 함께 만들면 generic exclusion이 과도하게 확장된다.
  const nonOverlappingMatches: AliasMatch[] = [];
  for (const match of matches) {
    const matchEnd = match.index + match.matchedLength;
    const overlapsSelected = nonOverlappingMatches.some((selected) => (
      match.index < selected.index + selected.matchedLength && selected.index < matchEnd
    ));
    if (!overlapsSelected) nonOverlappingMatches.push(match);
  }

  // locked 스텝은 선택 단계에서 lock으로 pin되어 intent가 무시되므로(유령 거부/무음 무시 방지)
  // 애초에 intent를 배정하지 않는다.
  const lockedStepIds = new Set((request.lockedSteps ?? []).map((lock) => lock.stepId));
  const usedStepIds = new Set<string>();
  const stepIntents: ParsedStepIntent[] = [];
  const excludedIntents: ParsedStepIntent[] = [];
  let previousMatchEnd = 0;
  for (const { entry, index, matchedLength } of nonOverlappingMatches) {
    const negated = isNegatedAt(text, index, matchedLength);
    const required = isRequiredAt(text, index, matchedLength, previousMatchEnd);
    previousMatchEnd = Math.max(previousMatchEnd, index + matchedLength);
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
      kakaoSearchTerms: stableUnique([entry.canonicalTerm, ...entry.searchExpansions]).slice(0, 3),
      strength: required ? 'required' : 'preferred',
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
  expansionLevel?: 0 | 1 | 2;
};

type IntentMatchablePlace = {
  name: string;
  categoryName: string;
  matchedSearchEvidence: readonly IntentEvidence[];
};

const BROAD_STRICT_CATEGORY_KEYWORDS = new Set([
  '일식', '중식', '양식', '육류,고기', '분식', '와인바', '호프', '펍', '주점', '이자카야', '전통주',
].map(normalize));
const BROAD_STRICT_ALIASES = new Set([
  'italian food', 'italian restaurant', '루프탑', 'rooftop',
].map(normalize));

function isStrictNameTerm(term: string, entry: StepIntentDictionaryEntry | undefined): boolean {
  const normalizedTerm = normalize(term);
  return !BROAD_STRICT_ALIASES.has(normalizedTerm);
}

function isStrictCategoryKeyword(keyword: string, intent: ParsedStepIntent): boolean {
  const normalizedKeyword = normalize(keyword);
  return normalizedKeyword === normalize(intent.canonicalTerm) || !BROAD_STRICT_CATEGORY_KEYWORDS.has(normalizedKeyword);
}

function hasStrictIntentEvidence(place: IntentMatchablePlace, intent: ParsedStepIntent): boolean {
  // A provider returning a document for a keyword query is not proof that the
  // place itself matches that keyword. Search evidence is useful for ranking,
  // but strict eligibility must come from the provider metadata we actually
  // received for this place.
  const entry = getStepIntentDictionaryEntry(intent.canonicalTerm);
  const name = normalize(place.name);
  if ([intent.canonicalTerm, ...(entry?.aliases ?? [])]
    .some((term) => isStrictNameTerm(term, entry) && name.includes(normalize(term)))) return true;
  const categoryName = normalize(place.categoryName ?? '');
  return (entry?.categoryNameKeywords ?? []).some((keyword) => (
    isStrictCategoryKeyword(keyword, intent) && categoryName.includes(normalize(keyword))
  ));
}

/** Exact intent proof used by required gates; preferred expansion scoring is separate in recommendation-ranking. */
export function placeMatchesStepIntent(place: IntentMatchablePlace, intent: ParsedStepIntent): boolean {
  return hasStrictIntentEvidence(place, intent);
}

/** Separate hard-exclusion boundary so scoring rules cannot broaden this filter accidentally. */
export function placeMatchesExcludedStepIntent(place: IntentMatchablePlace, intent: ParsedStepIntent): boolean {
  return hasStrictIntentEvidence(place, intent);
}
