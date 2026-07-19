// 데이터 전용 사전. 파서 로직과 분리(스펙 §8.1). 확장 시 이 파일에 엔트리만 추가한다.

export type StepIntentType = 'dish' | 'cuisine' | 'venue_subtype' | 'activity' | 'culture_subtype' | 'drink_type';
export type StepIntentTargetCategory = 'meal' | 'cafe' | 'culture' | 'walk' | 'drinks' | 'activity';

export type StepIntentDictionaryEntry = {
  canonicalTerm: string;
  intentType: StepIntentType;
  targetCategory: StepIntentTargetCategory;
  /** 카카오 확장 검색어. 최대 2개(스펙 §10.3). */
  expansions: readonly string[];
  /** 한국어 표기 변형(canonical 포함 불필요 — canonical은 항상 매칭). */
  koAliases: readonly string[];
  /** 영어 번역 + 로마자 변형. 전부 소문자(단어 경계 매칭). */
  enAliases: readonly string[];
  /** 카카오 상세 categoryName 호환 서브타입 allowlist(스펙 §12.2). */
  compatibleCategoryNameKeywords: readonly string[];
  displayLabel: { ko: string; en: string };
};

export const STEP_INTENT_DICTIONARY: readonly StepIntentDictionaryEntry[] = [
  {
    canonicalTerm: '삼겹살', intentType: 'dish', targetCategory: 'meal',
    expansions: ['돼지고기구이', '고기집'],
    koAliases: ['삼겹', '오겹살'],
    enAliases: ['korean pork belly', 'pork belly', 'samgyeopsal', 'samgyupsal', 'samgyopsal'],
    compatibleCategoryNameKeywords: ['삼겹살', '돼지고기구이', '육류,고기'],
    displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
  },
  {
    canonicalTerm: '파스타', intentType: 'dish', targetCategory: 'meal',
    expansions: ['이탈리안', '이탈리아음식'],
    koAliases: ['스파게티'],
    enAliases: ['pasta', 'spaghetti', 'italian food', 'italian restaurant'],
    compatibleCategoryNameKeywords: ['이탈리안', '파스타', '양식'],
    displayLabel: { ko: '파스타', en: 'Pasta' },
  },
  {
    canonicalTerm: '초밥', intentType: 'dish', targetCategory: 'meal',
    expansions: ['오마카세', '일식'],
    koAliases: ['스시', '오마카세'],
    enAliases: ['sushi', 'omakase'],
    compatibleCategoryNameKeywords: ['초밥', '일식', '스시'],
    displayLabel: { ko: '초밥', en: 'Sushi' },
  },
  {
    canonicalTerm: '떡볶이', intentType: 'dish', targetCategory: 'meal',
    expansions: ['분식'],
    koAliases: [],
    enAliases: ['tteokbokki', 'ddeokbokki', 'topokki', 'spicy rice cake'],
    compatibleCategoryNameKeywords: ['떡볶이', '분식'],
    displayLabel: { ko: '떡볶이', en: 'Tteokbokki' },
  },
  {
    canonicalTerm: '마라탕', intentType: 'dish', targetCategory: 'meal',
    expansions: ['중식'],
    koAliases: ['마라'],
    enAliases: ['malatang', 'mala soup', 'mala'],
    compatibleCategoryNameKeywords: ['마라탕', '중식'],
    displayLabel: { ko: '마라탕', en: 'Malatang' },
  },
  {
    canonicalTerm: '라멘', intentType: 'dish', targetCategory: 'meal',
    expansions: ['일본식라면', '일식'],
    koAliases: [],
    enAliases: ['ramen'],
    compatibleCategoryNameKeywords: ['라멘', '일식'],
    displayLabel: { ko: '라멘', en: 'Ramen' },
  },
  {
    canonicalTerm: '루프탑 카페', intentType: 'venue_subtype', targetCategory: 'cafe',
    expansions: ['루프탑', '옥상 카페'],
    koAliases: ['루프탑카페', '루프탑'],
    enAliases: ['rooftop cafe', 'rooftop coffee', 'rooftop'],
    compatibleCategoryNameKeywords: ['카페'],
    displayLabel: { ko: '루프탑 카페', en: 'Rooftop cafe' },
  },
  {
    canonicalTerm: '보드게임카페', intentType: 'venue_subtype', targetCategory: 'activity',
    expansions: ['보드게임'],
    koAliases: ['보드게임 카페', '보드게임'],
    enAliases: ['board game cafe', 'boardgame cafe'],
    compatibleCategoryNameKeywords: ['보드카페', '보드게임'],
    displayLabel: { ko: '보드게임카페', en: 'Board game cafe' },
  },
  {
    canonicalTerm: '방탈출', intentType: 'activity', targetCategory: 'activity',
    expansions: ['방탈출카페'],
    koAliases: [],
    enAliases: ['escape room', 'escape cafe'],
    compatibleCategoryNameKeywords: ['방탈출'],
    displayLabel: { ko: '방탈출', en: 'Escape room' },
  },
  {
    canonicalTerm: '볼링', intentType: 'activity', targetCategory: 'activity',
    expansions: ['볼링장'],
    koAliases: [],
    enAliases: ['bowling'],
    compatibleCategoryNameKeywords: ['볼링'],
    displayLabel: { ko: '볼링', en: 'Bowling' },
  },
  {
    canonicalTerm: '전시', intentType: 'culture_subtype', targetCategory: 'culture',
    expansions: ['전시회', '미술관'],
    koAliases: ['전시회'],
    enAliases: ['exhibition', 'art exhibition', 'gallery'],
    compatibleCategoryNameKeywords: ['전시', '미술관', '갤러리'],
    displayLabel: { ko: '전시', en: 'Exhibition' },
  },
  {
    canonicalTerm: '와인바', intentType: 'drink_type', targetCategory: 'drinks',
    expansions: ['와인'],
    koAliases: ['와인 바', '와인'],
    enAliases: ['wine bar', 'wine'],
    compatibleCategoryNameKeywords: ['와인바'],
    displayLabel: { ko: '와인바', en: 'Wine bar' },
  },
  {
    canonicalTerm: '칵테일바', intentType: 'drink_type', targetCategory: 'drinks',
    expansions: ['칵테일'],
    koAliases: ['칵테일 바', '칵테일'],
    enAliases: ['cocktail bar', 'cocktails', 'cocktail'],
    compatibleCategoryNameKeywords: ['칵테일바'],
    displayLabel: { ko: '칵테일바', en: 'Cocktail bar' },
  },
];
