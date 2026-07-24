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

// 사용자가 직접 수정한 텍스트는 언어와 무관하게 그대로 보여야 하므로,
// content_i18n 의 모든 언어 블록에서 해당 필드를 커스텀 값으로 덮어쓴다.
// (localizeCardContent 가 원본 컬럼 위에 content_i18n 을 오버레이하기 때문)
export function overrideCardContent(
  contentI18n: unknown,
  fields: Partial<Record<LocalizableField, string>>,
): unknown {
  if (!contentI18n || typeof contentI18n !== 'object') return contentI18n;
  if (Object.keys(fields).length === 0) return contentI18n;
  const source = contentI18n as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  for (const [lang, block] of Object.entries(source)) {
    if (block && typeof block === 'object') out[lang] = { ...(block as Record<string, unknown>), ...fields };
  }
  return out;
}

export function overrideCardTitle(contentI18n: unknown, title: string): unknown {
  return overrideCardContent(contentI18n, { title });
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
