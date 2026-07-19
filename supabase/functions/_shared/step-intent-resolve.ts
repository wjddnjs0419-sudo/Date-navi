import type { RecommendationRequest } from '../../../shared/recommendation/contracts.ts';
import { parseStepIntents, type ParsedStepIntent } from './step-intent.ts';
import { STEP_INTENT_DICTIONARY } from './step-intent-dictionary.ts';

export type StepIntentSource = 'none' | 'rule' | 'ai';

export type UnsupportedIntent = { term: string; reason: string };
export type IntentConflict = { description: string };

export type AiParseResult = {
  stepIntents: ParsedStepIntent[];
  unsupported: UnsupportedIntent[];
  conflicts: IntentConflict[];
};

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

/** 사전의 모든 alias(canonical/ko/en)를 텍스트에서 공백으로 치환해 매칭 스팬을 제거한다. */
function stripKnownTerms(text: string): string {
  let out = text;
  for (const entry of STEP_INTENT_DICTIONARY) {
    for (const term of [entry.canonicalTerm, ...entry.koAliases]) {
      out = out.split(normalize(term)).join(' ');
    }
    for (const alias of entry.enAliases) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(normalize(alias))}\\b`, 'gi'), ' ');
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
    return {
      source: 'ai',
      stepIntents: ai.stepIntents,
      excludedIntents: rule.excludedIntents,
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
