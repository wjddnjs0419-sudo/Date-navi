import type { AppLanguage } from './i18n';

// date_cards.content_i18n — 서버(recommendation 파이프라인)가 카드 확정 시 ko/en 텍스트를
// 함께 저장한다. 뷰어(본인 또는 파트너)의 앱 언어에 맞는 텍스트를 덮어써서 반환한다.
// 컬럼이 없거나(레거시 카드) 형식이 어긋나면 저장된 원본 텍스트를 그대로 쓴다.

const LOCALIZABLE_FIELDS = ['title', 'summary', 'why_recommended'] as const;
type LocalizableField = (typeof LOCALIZABLE_FIELDS)[number];

type LocalizableCard = Partial<Record<LocalizableField, string | null>> & {
  content_i18n?: unknown;
};

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function localizeCardContent<T extends LocalizableCard>(card: T, language: AppLanguage): T {
  const block = (card.content_i18n as Record<string, unknown> | null | undefined)?.[language];
  if (!block || typeof block !== 'object') return card;
  const texts = block as Record<string, unknown>;
  const overlay: Partial<Record<LocalizableField, string>> = {};
  for (const field of LOCALIZABLE_FIELDS) {
    const text = textOrNull(texts[field]);
    if (text !== null) overlay[field] = text;
  }
  if (Object.keys(overlay).length === 0) return card;
  return { ...card, ...overlay };
}
