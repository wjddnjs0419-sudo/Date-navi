import type { AppLanguage } from './i18n';
import type { PlanIntent, PlaceType } from './intent';

// 카카오 로컬 검색 결과 1건 (edge function place-search가 반환하는 정규화 형태)
export type KakaoPlace = {
  placeId: string; // Kakao doc.id — 요청 간 안정 식별용 (Phase 0)
  name: string;
  category: string;
  address: string;
  url: string;
  x: string; // 경도(longitude)
  y: string; // 위도(latitude)
};

// FeelingInput.distance → 카카오 카테고리 검색 반경(m)
export function distanceToRadius(distance: string): number {
  switch (distance) {
    case 'near':
      return 1000;
    case 'far':
      return 5000;
    case 'any':
    default:
      return 3000;
  }
}

// 실제 장소 목록을 프롬프트에 주입할 텍스트 블록으로 변환.
// 장소가 없으면 빈 문자열 → 기존(장소 없는) 프롬프트와 동일하게 동작.
// focusLabel이 있으면(예: "카페") 카드 3개 모두 해당 카테고리로만 채우라는 지침을 덧붙인다.
export function formatPlacesBlock(places: KakaoPlace[], language: AppLanguage, focusLabel?: string): string {
  if (places.length === 0) return '';
  const lines = places.map(p => `- ${p.name} (${p.category}) · ${p.address} · ${p.url}`);
  if (language === 'en') {
    const focusRule = focusLabel
      ? `\n\nThe user specifically asked for "${focusLabel}". All 3 cards MUST use a place from this category — do not diversify into other categories.`
      : '';
    return `\n\n【Real nearby places】\n${lines.join('\n')}\n\nYou MUST build every recommendation using ONLY the real places in the list above. For each card, fill place_name, place_address, and map_url from the matching entry. Never invent a place that is not in this list.${focusRule}`;
  }
  const focusRule = focusLabel
    ? `\n\n사용자가 "${focusLabel}"를 콕 집어 요청했습니다. 카드 3개 모두 이 카테고리의 장소로만 채우세요 — 다른 카테고리로 다양화하지 마세요.`
    : '';
  return `\n\n【실제 주변 장소 목록】\n${lines.join('\n')}\n\n반드시 위 목록에 있는 실제 장소만 사용해 추천하세요. 각 카드의 place_name, place_address, map_url을 해당 장소 정보로 채우세요. 목록에 없는 장소를 지어내지 마세요.${focusRule}`;
}

export type PlaceFocus = { code?: string; query?: string; label: string };

// 자유 입력(freeText)에서 원하는 장소 카테고리를 감지 → place-search 검색 범위를 좁히는 데 사용.
// 배열 순서 = 매칭 우선순위(첫 매치 채택). "보드게임카페"처럼 복합어에 일반 카테고리 단어(카페)가
// 부분 문자열로 포함된 경우가 있어, 액티비티/스포츠 같은 복합 키워드를 일반 카테고리보다 먼저 검사한다.
const FOCUS_KEYWORD_MAP: { pattern: RegExp; focus: PlaceFocus }[] = [
  // 카카오 로컬에 전용 카테고리 코드가 없어 술집처럼 키워드 검색으로 처리.
  { pattern: /액티비티|방탈출|보드게임|클라이밍|VR|노래방|영화|볼링|피크닉/, focus: { query: '액티비티', label: '액티비티' } },
  { pattern: /스포츠|당구|골프|테니스|헬스|축구|야구|농구|배드민턴|수영|탁구/, focus: { query: '스포츠', label: '스포츠' } },
  { pattern: /카페|커피|디저트|베이커리/, focus: { code: 'CE7', label: '카페' } },
  { pattern: /맛집|음식점|식당|밥집/, focus: { code: 'FD6', label: '음식점' } },
  { pattern: /술집|이자카야|호프|포장마차/, focus: { query: '술집', label: '술집' } },
  { pattern: /전시|박물관|미술관|문화시설|공연/, focus: { code: 'CT1', label: '문화시설' } },
  { pattern: /관광|산책|공원|나들이|명소/, focus: { code: 'AT4', label: '관광명소' } },
];

export function detectPlaceFocus(freeText?: string): PlaceFocus | null {
  if (!freeText) return null;
  for (const { pattern, focus } of FOCUS_KEYWORD_MAP) {
    if (pattern.test(freeText)) return focus;
  }
  return null;
}

// Phase 2 — Intent를 place-search Adaptive Retrieval 요청(키워드 쿼리 + 카테고리 코드)으로 변환.
// bar/activity/sports는 전용 카테고리 코드가 없어 키워드 검색(searchQueries)으로만 처리한다.
export type RetrievalPlan = { keywordQueries: string[]; categoryCodes: string[] };

const PLACE_TYPE_CODE: Record<PlaceType, string | null> = {
  cafe: 'CE7',
  restaurant: 'FD6',
  culture: 'CT1',
  attraction: 'AT4',
  bar: null,
  activity: null,
  sports: null,
};

export function buildRetrievalPlan(intent: PlanIntent): RetrievalPlan {
  const keywordQueries = [...new Set(intent.searchQueries)];
  const categoryCodes = [
    ...new Set(intent.placeTypes.map(t => PLACE_TYPE_CODE[t]).filter((c): c is string => !!c)),
  ];
  return { keywordQueries, categoryCodes };
}
