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
};

export type ParsedStepIntents = {
  stepIntents: ParsedStepIntent[];
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

export function parseStepIntents(request: RecommendationRequest): ParsedStepIntents {
  const raw = request.additionalRequest?.trim();
  if (!raw) return { stepIntents: [], parserVersion: STEP_INTENT_PARSER_VERSION };
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
  for (const { entry, index } of matches) {
    const step = request.courseSteps.find((candidate) => (
      !usedStepIds.has(candidate.id)
      && !lockedStepIds.has(candidate.id)
      && normalizeRecommendationCategory(candidate.category) === entry.targetCategory
    ));
    if (!step) continue; // 대상 category step 없음 → intent 미생성(Phase 2에서 unsupported로 노출)
    usedStepIds.add(step.id);
    stepIntents.push({
      stepId: step.id,
      stepCategory: entry.targetCategory,
      intentType: entry.intentType,
      canonicalTerm: entry.canonicalTerm,
      kakaoSearchTerms: [entry.canonicalTerm, ...entry.expansions].slice(0, 3),
      strength: isRequiredAt(text, index) ? 'required' : 'preferred',
      displayLabel: entry.displayLabel,
    });
  }
  return { stepIntents, parserVersion: STEP_INTENT_PARSER_VERSION };
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
