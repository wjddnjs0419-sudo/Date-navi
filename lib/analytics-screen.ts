export type ScreenName =
  | 'auth_login'
  | 'onboarding_nickname'
  | 'onboarding_photo'
  | 'onboarding_anniversary'
  | 'onboarding_date_style'
  | 'onboarding_couple_choice'
  | 'couple_connect'
  | 'couple_connected'
  | 'onboarding_preferences'
  | 'home'
  | 'date_mode_picker'
  | 'candidates'
  | 'memories'
  | 'course_builder'
  | 'place_search'
  | 'recommendation_generating'
  | 'course_recommendation_result'
  | 'date_plans'
  | 'date_card_detail'
  | 'date_card_edit'
  | 'date_confirm'
  | 'date_review'
  | 'memory_create'
  | 'memory_detail'
  | 'memory_edit'
  | 'proposal_send'
  | 'proposal_reaction'
  | 'mutual_candidates'
  | 'settings'
  | 'profile_edit'
  | 'notifications'
  | 'account_delete'
  | 'legal_terms'
  | 'legal_privacy';

const SCREEN_BY_SEGMENTS: Record<string, ScreenName> = {
  '(auth)/index': 'auth_login',
  'onboarding/nickname': 'onboarding_nickname',
  'onboarding/photo': 'onboarding_photo',
  'onboarding/anniversary': 'onboarding_anniversary',
  'onboarding/type': 'onboarding_date_style',
  'onboarding/couple-choice': 'onboarding_couple_choice',
  'onboarding/couple-connect': 'couple_connect',
  'onboarding/connected': 'couple_connected',
  'onboarding/preferences': 'onboarding_preferences',
  '(tabs)/index': 'home',
  '(tabs)/mode': 'date_mode_picker',
  '(tabs)/candidates': 'candidates',
  '(tabs)/memories': 'memories',
  '(tabs)/account': 'settings',
  'mode-flow/course': 'course_builder',
  'mode-flow/place-search': 'place_search',
  'mode-flow/generating': 'recommendation_generating',
  'mode-flow/course-result': 'course_recommendation_result',
  'plans/index': 'date_plans',
  'card/[id]': 'date_card_detail',
  'card/edit/[id]': 'date_card_edit',
  'card/confirm': 'date_confirm',
  'card/review': 'date_review',
  'card/memory/new': 'memory_create',
  'card/memory/[id]': 'memory_detail',
  'card/memory/edit/[id]': 'memory_edit',
  'share/send': 'proposal_send',
  'share/reaction': 'proposal_reaction',
  'share/mutual': 'mutual_candidates',
  settings: 'settings',
  'account/edit-profile': 'profile_edit',
  'account/notifications': 'notifications',
  'account/delete-account': 'account_delete',
  'legal/terms': 'legal_terms',
  'legal/privacy': 'legal_privacy',
};

export function resolveScreenName(segments: readonly string[]): ScreenName | null {
  return SCREEN_BY_SEGMENTS[segments.join('/')] ?? null;
}
