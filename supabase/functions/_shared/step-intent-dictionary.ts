// 데이터 전용 사전. 파서 로직과 분리(스펙 §8.1). 확장 시 이 파일에 엔트리만 추가한다.

export type StepIntentType = 'dish' | 'cuisine' | 'venue_subtype' | 'activity' | 'culture_subtype' | 'drink_type';
export type StepIntentTargetCategory = 'meal' | 'cafe' | 'culture' | 'walk' | 'drinks' | 'activity';
export type StepIntentDomain = 'food' | 'cafe' | 'alcohol' | 'activity' | 'culture';

export type StepIntentDictionaryEntry = {
  canonicalTerm: string;
  aliases: readonly string[];
  searchExpansions: readonly string[];
  domain: StepIntentDomain;
  intentType: StepIntentType;
  targetCategory: StepIntentTargetCategory;
  /** 카카오 상세 categoryName 호환 서브타입 allowlist(스펙 §12.2). */
  categoryNameKeywords: readonly string[];
  displayLabel: { ko: string; en: string };
  /** Low-signal preference terms still resolve when explicitly tagged, but remain residual context for legacy free-text AI gating. */
  stripFromResidual?: boolean;
};

function activityEntry(
  canonicalTerm: string,
  en: string,
  searchExpansions: string[] = [],
  aliases: string[] = [],
): StepIntentDictionaryEntry {
  return {
    canonicalTerm, aliases, searchExpansions, domain: 'activity', intentType: 'activity', targetCategory: 'activity',
    categoryNameKeywords: [canonicalTerm], displayLabel: { ko: canonicalTerm, en },
  };
}

function cultureEntry(
  canonicalTerm: string,
  en: string,
  searchExpansions: string[] = [],
  aliases: string[] = [],
): StepIntentDictionaryEntry {
  return {
    canonicalTerm, aliases, searchExpansions, domain: 'culture', intentType: 'culture_subtype', targetCategory: 'culture',
    categoryNameKeywords: [canonicalTerm], displayLabel: { ko: canonicalTerm, en },
  };
}

export const STEP_INTENT_DICTIONARY: readonly StepIntentDictionaryEntry[] = [
  {
    canonicalTerm: '고기', intentType: 'cuisine', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['고기집', '삼겹살'], aliases: ['meat', 'meat restaurant'],
    categoryNameKeywords: ['고기', '삼겹살', '돼지고기'], displayLabel: { ko: '고기', en: 'Meat' },
  },
  {
    canonicalTerm: '한식', intentType: 'cuisine', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['한식당'], aliases: ['korean', 'korean food', 'korean restaurant'],
    categoryNameKeywords: ['한식'], displayLabel: { ko: '한식', en: 'Korean' },
  },
  {
    canonicalTerm: '일식', intentType: 'cuisine', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['일식당'], aliases: ['japanese', 'japanese food', 'japanese restaurant'],
    categoryNameKeywords: ['일식', '초밥', '라멘'], displayLabel: { ko: '일식', en: 'Japanese' },
  },
  {
    canonicalTerm: '양식', intentType: 'cuisine', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['이탈리안', '양식당'], aliases: ['western', 'western food', 'western restaurant'],
    categoryNameKeywords: ['양식', '이탈리안', '파스타'], displayLabel: { ko: '양식', en: 'Western' },
  },
  {
    canonicalTerm: '가볍게', intentType: 'cuisine', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['브런치', '샌드위치'], aliases: ['light', 'light meal', 'light food'],
    categoryNameKeywords: ['브런치', '샌드위치', '샐러드'], displayLabel: { ko: '가볍게', en: 'Light meal' },
  },
  {
    canonicalTerm: '조용한', intentType: 'venue_subtype', domain: 'cafe', targetCategory: 'cafe',
    searchExpansions: ['조용한 카페'], aliases: ['quiet', 'quiet cafe'], categoryNameKeywords: [],
    displayLabel: { ko: '조용한', en: 'Quiet' }, stripFromResidual: false,
  },
  {
    canonicalTerm: '감성적인', intentType: 'venue_subtype', domain: 'cafe', targetCategory: 'cafe',
    searchExpansions: ['감성 카페'], aliases: ['atmospheric', 'aesthetic cafe'], categoryNameKeywords: [],
    displayLabel: { ko: '감성적인', en: 'Atmospheric' }, stripFromResidual: false,
  },
  {
    canonicalTerm: '뷰 좋은', intentType: 'venue_subtype', domain: 'cafe', targetCategory: 'cafe',
    searchExpansions: ['뷰 좋은 카페'], aliases: ['good view', 'cafe with a view'], categoryNameKeywords: [],
    displayLabel: { ko: '뷰 좋은', en: 'Good view' }, stripFromResidual: false,
  },
  {
    canonicalTerm: '대화하기 좋은', intentType: 'venue_subtype', domain: 'cafe', targetCategory: 'cafe',
    searchExpansions: ['대화하기 좋은 카페'], aliases: ['good for conversation', 'conversation cafe'], categoryNameKeywords: [],
    displayLabel: { ko: '대화하기 좋은', en: 'Good for conversation' }, stripFromResidual: false,
  },
  {
    canonicalTerm: '골목 산책', intentType: 'venue_subtype', domain: 'culture', targetCategory: 'walk',
    searchExpansions: ['골목길 산책'], aliases: ['alley walk', 'alley'], categoryNameKeywords: ['골목', '골목길'],
    displayLabel: { ko: '골목 산책', en: 'Alley walk' },
  },
  {
    canonicalTerm: '야경 산책', intentType: 'venue_subtype', domain: 'culture', targetCategory: 'walk',
    searchExpansions: ['야경 명소'], aliases: ['night view walk', 'night view'], categoryNameKeywords: ['야경'],
    displayLabel: { ko: '야경 산책', en: 'Night-view walk' },
  },
  {
    canonicalTerm: '자연 산책', intentType: 'venue_subtype', domain: 'culture', targetCategory: 'walk',
    searchExpansions: ['자연 산책로'], aliases: ['nature walk', 'nature'], categoryNameKeywords: ['공원', '숲', '산책로'],
    displayLabel: { ko: '자연 산책', en: 'Nature walk' },
  },
  {
    canonicalTerm: '한강 산책', intentType: 'venue_subtype', domain: 'culture', targetCategory: 'walk',
    searchExpansions: ['한강공원'], aliases: ['riverside walk', 'riverside'], categoryNameKeywords: ['한강', '강변'],
    displayLabel: { ko: '한강 산책', en: 'Riverside walk' },
  },
  {
    canonicalTerm: '공원 산책', intentType: 'venue_subtype', domain: 'culture', targetCategory: 'walk',
    searchExpansions: ['공원'], aliases: ['park walk', 'park'], categoryNameKeywords: ['공원'],
    displayLabel: { ko: '공원 산책', en: 'Park walk' },
  },
  {
    canonicalTerm: '삼겹살', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['돼지고기구이', '고기집'],
    aliases: ['삼겹', '오겹살', 'korean pork belly', 'pork belly', 'samgyeopsal', 'samgyupsal', 'samgyopsal'],
    categoryNameKeywords: ['삼겹살'],
    displayLabel: { ko: '삼겹살', en: 'Samgyeopsal' },
  },
  {
    canonicalTerm: '파스타', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['이탈리안', '이탈리아음식'],
    aliases: ['스파게티', 'pasta', 'spaghetti', 'italian food', 'italian restaurant'],
    categoryNameKeywords: ['파스타', '스파게티'],
    displayLabel: { ko: '파스타', en: 'Pasta' },
  },
  {
    canonicalTerm: '초밥', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['오마카세', '일식'],
    aliases: ['스시', '오마카세', 'sushi', 'omakase'],
    categoryNameKeywords: ['초밥', '스시', '오마카세'],
    displayLabel: { ko: '초밥', en: 'Sushi' },
  },
  {
    canonicalTerm: '떡볶이', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['분식'],
    aliases: ['tteokbokki', 'ddeokbokki', 'topokki', 'spicy rice cake'],
    categoryNameKeywords: ['떡볶이', '분식'],
    displayLabel: { ko: '떡볶이', en: 'Tteokbokki' },
  },
  {
    canonicalTerm: '마라탕', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['중식'],
    aliases: ['마라', 'malatang', 'mala soup', 'mala'],
    categoryNameKeywords: ['마라탕'],
    displayLabel: { ko: '마라탕', en: 'Malatang' },
  },
  {
    canonicalTerm: '라멘', intentType: 'dish', domain: 'food', targetCategory: 'meal',
    searchExpansions: ['일본식라면', '일식'],
    aliases: ['ramen'],
    categoryNameKeywords: ['라멘', '일본식라면'],
    displayLabel: { ko: '라멘', en: 'Ramen' },
  },
  {
    canonicalTerm: '루프탑 카페', intentType: 'venue_subtype', domain: 'cafe', targetCategory: 'cafe',
    searchExpansions: ['루프탑', '옥상 카페'],
    aliases: ['루프탑카페', '루프탑', 'rooftop cafe', 'rooftop coffee', 'rooftop'],
    // 카카오 상세 카테고리는 루프탑 여부를 구분하지 못하고(모든 CE7이 '카페' 포함) evidence·이름으로만 판정한다.
    categoryNameKeywords: [],
    displayLabel: { ko: '루프탑 카페', en: 'Rooftop cafe' },
  },
  {
    canonicalTerm: '보드게임', intentType: 'venue_subtype', domain: 'activity', targetCategory: 'activity',
    searchExpansions: ['보드게임카페', '보드게임'],
    aliases: ['보드게임 카페', '보드게임카페', 'board game cafe', 'boardgame cafe'],
    categoryNameKeywords: ['보드카페', '보드게임'],
    displayLabel: { ko: '보드게임', en: 'Board game' },
  },
  {
    canonicalTerm: '방탈출', intentType: 'activity', domain: 'activity', targetCategory: 'activity',
    searchExpansions: ['방탈출카페'],
    aliases: ['escape room', 'escape cafe'],
    categoryNameKeywords: ['방탈출'],
    displayLabel: { ko: '방탈출', en: 'Escape room' },
  },
  {
    canonicalTerm: '볼링', intentType: 'activity', domain: 'activity', targetCategory: 'activity',
    searchExpansions: ['볼링장'],
    aliases: ['bowling'],
    categoryNameKeywords: ['볼링'],
    displayLabel: { ko: '볼링', en: 'Bowling' },
  },
  activityEntry('클라이밍', 'Climbing', ['클라이밍장'], ['클라이밍장']),
  activityEntry('실내 사격', 'Indoor shooting', ['실내사격장'], ['실내사격']),
  activityEntry('양궁', 'Archery', ['양궁장']),
  activityEntry('탁구', 'Table tennis', ['탁구장']),
  activityEntry('당구', 'Billiards', ['당구장']),
  activityEntry('롤러스케이트', 'Roller skating', ['롤러스케이트장']),
  activityEntry('아이스링크', 'Ice skating', ['아이스링크', '스케이트장'], ['스케이트장']),
  activityEntry('테니스', 'Tennis', ['테니스장']),
  activityEntry('배드민턴', 'Badminton', ['배드민턴장']),
  activityEntry('수영', 'Swimming', ['수영장']),
  activityEntry('서핑', 'Surfing', ['서핑 체험'], ['서핑장']),
  activityEntry('카약', 'Kayaking', ['카약 체험']),
  activityEntry('요트', 'Yachting', ['요트 체험']),
  activityEntry('낚시', 'Fishing', ['낚시 체험']),
  activityEntry('승마', 'Horse riding', ['승마 체험']),
  activityEntry('패러글라이딩', 'Paragliding', ['패러글라이딩 체험']),
  activityEntry('짚라인', 'Zipline', ['짚라인 체험']),
  activityEntry('레일바이크', 'Rail bike', ['레일바이크'], ['레일 바이크']),
  activityEntry('스키', 'Skiing', ['스키장']),
  activityEntry('눈썰매', 'Snow sledding', ['눈썰매장']),
  activityEntry('캠핑', 'Camping', ['캠핑장']),
  activityEntry('공방 체험', 'Craft workshop', ['공방', '원데이클래스'], ['공방체험']),
  activityEntry('도자기 체험', 'Pottery class', ['도자기 공방', '도예 체험'], ['도자기 만들기', '도자기 만들고', '도자기체험']),
  activityEntry('향수 만들기', 'Perfume making', ['향수 공방', '원데이클래스'], ['향수 만들기 체험']),
  activityEntry('반지 만들기', 'Ring making', ['반지 공방', '원데이클래스'], ['반지 만들기 체험']),
  activityEntry('쿠킹 클래스', 'Cooking class', ['요리 클래스', '원데이클래스'], ['쿠킹클래스']),
  activityEntry('원데이 클래스', 'One-day class', ['원데이클래스'], ['원데이클래스']),
  cultureEntry('미술관', 'Art museum', ['미술관', '갤러리'], ['그림 전시']),
  cultureEntry('박물관', 'Museum', ['박물관'], ['역사 박물관']),
  cultureEntry('갤러리', 'Gallery', ['갤러리', '전시관'], ['전시 갤러리']),
  cultureEntry('독립서점', 'Independent bookstore', ['독립서점'], ['독립 서점']),
  cultureEntry('도서관', 'Library', ['도서관'], ['라이브러리']),
  cultureEntry('공연장', 'Performance venue', ['공연장', '콘서트홀'], ['공연 보러']),
  cultureEntry('극장', 'Theater', ['극장', '연극'], ['연극 보러']),
  cultureEntry('영화관', 'Cinema', ['영화관'], ['영화 보러']),
  cultureEntry('아트센터', 'Art center', ['아트센터'], ['아트 센터']),
  cultureEntry('문화센터', 'Cultural center', ['문화센터'], ['문화 센터']),
  cultureEntry('복합문화공간', 'Multi-cultural space', ['복합문화공간'], ['복합 문화 공간']),
  cultureEntry('전시관', 'Exhibition hall', ['전시관', '갤러리'], ['전시 보러']),
  cultureEntry('역사관', 'History museum', ['역사관', '박물관'], ['역사 박물관']),
  cultureEntry('천문대', 'Observatory', ['천문대'], ['별 보러']),
  cultureEntry('식물원', 'Botanical garden', ['식물원'], ['식물 보러']),
  cultureEntry('수족관', 'Aquarium', ['수족관', '아쿠아리움'], ['아쿠아리움']),
  {
    canonicalTerm: '전시', intentType: 'culture_subtype', domain: 'culture', targetCategory: 'culture',
    searchExpansions: ['전시회', '미술관'],
    aliases: ['전시회', 'exhibition', 'art exhibition', 'gallery'],
    categoryNameKeywords: ['전시', '미술관', '갤러리'],
    displayLabel: { ko: '전시', en: 'Exhibition' },
  },
  // 장소명·구체 음료를 일반 음료보다 먼저 둔다. 파서는 첫 일치 위치를 쓰므로
  // "위스키바"가 "위스키"로, "수제맥주"가 "맥주"로 축약되지 않게 한다.
  {
    canonicalTerm: '내추럴와인', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['내추럴 와인'], aliases: ['내추럴 와인', 'natural wine'],
    categoryNameKeywords: ['내추럴와인', '와인바'], displayLabel: { ko: '내추럴와인', en: 'Natural wine' },
  },
  {
    canonicalTerm: '스파클링와인', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['스파클링 와인'], aliases: ['스파클링 와인', 'sparkling wine'],
    categoryNameKeywords: ['스파클링', '와인바'], displayLabel: { ko: '스파클링와인', en: 'Sparkling wine' },
  },
  {
    canonicalTerm: '수제맥주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['크래프트비어'], aliases: ['수제 맥주', '크래프트 맥주', 'craft beer'],
    categoryNameKeywords: ['수제맥주', '크래프트', '펍'], displayLabel: { ko: '수제맥주', en: 'Craft beer' },
  },
  {
    canonicalTerm: '생맥주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['드래프트 맥주'], aliases: ['생 맥주', 'draft beer', 'draught beer'],
    categoryNameKeywords: ['생맥주', '호프'], displayLabel: { ko: '생맥주', en: 'Draft beer' },
  },
  {
    canonicalTerm: '루프탑바', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['루프탑 바'], aliases: ['루프탑 바', 'rooftop bar'],
    categoryNameKeywords: [], displayLabel: { ko: '루프탑바', en: 'Rooftop bar' },
  },
  {
    canonicalTerm: '재즈바', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['재즈 바'], aliases: ['재즈 바', 'jazz bar'],
    categoryNameKeywords: ['재즈바'], displayLabel: { ko: '재즈바', en: 'Jazz bar' },
  },
  {
    canonicalTerm: '칵테일바', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['칵테일'], aliases: ['칵테일 바', 'cocktail bar'],
    categoryNameKeywords: ['칵테일바'], displayLabel: { ko: '칵테일바', en: 'Cocktail bar' },
  },
  {
    canonicalTerm: '위스키바', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['위스키 바'], aliases: ['위스키 바', 'whisky bar', 'whiskey bar'],
    categoryNameKeywords: ['위스키바'], displayLabel: { ko: '위스키바', en: 'Whisky bar' },
  },
  {
    canonicalTerm: '와인바', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['와인'], aliases: ['와인 바', 'wine bar'],
    categoryNameKeywords: ['와인바'], displayLabel: { ko: '와인바', en: 'Wine bar' },
  },
  {
    canonicalTerm: '이자카야', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['일본식 주점'], aliases: ['izakaya'],
    categoryNameKeywords: ['이자카야'], displayLabel: { ko: '이자카야', en: 'Izakaya' },
  },
  {
    canonicalTerm: '펍', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['pub'], aliases: ['pub'],
    categoryNameKeywords: ['펍'], displayLabel: { ko: '펍', en: 'Pub' },
  },
  {
    canonicalTerm: '포차', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['포장마차'], aliases: ['포장 마차', 'pocha'],
    categoryNameKeywords: ['포장마차'], displayLabel: { ko: '포차', en: 'Pocha' },
  },
  {
    canonicalTerm: '와인', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['와인바'], aliases: ['wine'],
    categoryNameKeywords: ['와인바'], displayLabel: { ko: '와인', en: 'Wine' },
  },
  {
    canonicalTerm: '샴페인', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['샴페인바'], aliases: ['champagne'],
    categoryNameKeywords: ['샴페인', '와인바'], displayLabel: { ko: '샴페인', en: 'Champagne' },
  },
  {
    canonicalTerm: '맥주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['호프'], aliases: ['beer'],
    categoryNameKeywords: ['맥주', '호프', '펍'], displayLabel: { ko: '맥주', en: 'Beer' },
  },
  {
    canonicalTerm: '칵테일', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['칵테일바'], aliases: ['cocktail', 'cocktails'],
    categoryNameKeywords: ['칵테일바'], displayLabel: { ko: '칵테일', en: 'Cocktail' },
  },
  {
    canonicalTerm: '위스키', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['위스키바'], aliases: ['whisky', 'whiskey'],
    categoryNameKeywords: ['위스키바'], displayLabel: { ko: '위스키', en: 'Whisky' },
  },
  {
    canonicalTerm: '하이볼', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['하이볼바'], aliases: ['highball'],
    categoryNameKeywords: ['하이볼'], displayLabel: { ko: '하이볼', en: 'Highball' },
  },
  {
    canonicalTerm: '사케', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['일본주'], aliases: ['sake'],
    categoryNameKeywords: ['사케', '이자카야'], displayLabel: { ko: '사케', en: 'Sake' },
  },
  {
    canonicalTerm: '소주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['소주집'], aliases: ['soju'],
    categoryNameKeywords: ['소주', '주점'], displayLabel: { ko: '소주', en: 'Soju' },
  },
  {
    canonicalTerm: '막걸리', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['막걸리집'], aliases: ['makgeolli'],
    categoryNameKeywords: ['막걸리', '전통주'], displayLabel: { ko: '막걸리', en: 'Makgeolli' },
  },
  {
    canonicalTerm: '전통주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['전통주점'], aliases: ['traditional korean liquor'],
    categoryNameKeywords: ['전통주'], displayLabel: { ko: '전통주', en: 'Traditional Korean liquor' },
  },
  {
    canonicalTerm: '청주', intentType: 'drink_type', domain: 'alcohol', targetCategory: 'drinks',
    searchExpansions: ['청주바'], aliases: ['cheongju'],
    categoryNameKeywords: ['청주', '전통주'], displayLabel: { ko: '청주', en: 'Cheongju' },
  },
];

export function assertStepIntentDictionary(entries: readonly StepIntentDictionaryEntry[]): void {
  const canonicals = new Set<string>();
  for (const entry of entries) {
    if (!entry.canonicalTerm.trim() || canonicals.has(entry.canonicalTerm)) {
      throw new Error('invalid step intent canonical');
    }
    if (entry.searchExpansions.length > 2) {
      throw new Error(`too many search expansions: ${entry.canonicalTerm}`);
    }
    canonicals.add(entry.canonicalTerm);
  }
}

assertStepIntentDictionary(STEP_INTENT_DICTIONARY);
