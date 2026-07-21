import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ko, en } from '../locales';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

// 확정된 코스에서 Save를 누르면 저장 확인 모달이 뜬 뒤 홈으로 돌아가야 한다.
// 기존에는 saved=true로 버튼만 사라져 "Send to partner"만 남아 전송을 강제하는 흐름이었다.
describe('course result save returns home with a success modal', () => {
  const source = read('app/mode-flow/course-result.tsx');

  it('renders a SuccessModal after saving', () => {
    expect(source).toMatch(/import \{[^}]*SuccessModal[^}]*\} from '..\/..\/components\/ui'/);
    expect(source).toMatch(/<SuccessModal[\s\S]*?message=\{t\('modeFlow\.courseResult\.savedMessage'\)\}/);
  });

  it('navigates home when the success modal hides', () => {
    expect(source).toMatch(/onHide=\{[\s\S]*?router\.replace\('\/\(tabs\)\/'/);
  });

  it('shows the save error inline when the confirm mutation fails', () => {
    // applyMutation은 에러를 삼키므로 handleSave가 직접 mutation 결과를 다뤄야 한다.
    expect(source).toMatch(/async function handleSave\(\)[\s\S]*?mutateRecommendationSession\(/);
    expect(source).toMatch(/async function handleSave\(\)[\s\S]*?setErrorMsg\(t\('modeFlow\.courseResult\.saveError'\)\)/);
  });

  it('adds the saved message copy to both locales', () => {
    expect(typeof ko.modeFlow.courseResult.savedMessage).toBe('string');
    expect(typeof en.modeFlow.courseResult.savedMessage).toBe('string');
  });
});

// 후보 수정 화면의 Title 단일행 입력에서 lineHeight가 iOS 세로 중앙 정렬을 깨뜨렸다.
// 단일행 input에서는 lineHeight를 빼고 paddingVertical: 0으로 기본 패딩을 제거한다.
describe('edit candidate title input vertical centering', () => {
  const source = read('app/card/edit/[id].tsx');

  it('removes lineHeight from the single-line input style', () => {
    const input = source.match(/\n  input: \{([^}]*)\}/)?.[1] ?? '';
    expect(input).not.toContain('lineHeight');
    expect(input).toContain('paddingVertical: 0');
  });

  it('keeps multiline spacing via the multiline style', () => {
    const multiline = source.match(/inputMultiline: \{([^}]*)\}/)?.[1] ?? '';
    expect(multiline).toContain('lineHeight');
  });
});

// 상세 화면 우상단 ⋮ 아이콘 → 바로 아래 드롭다운 팝오버로 수정/삭제 제공 (3안).
describe('MoreMenu popover component', () => {
  const ui = read('components/ui.tsx');

  it('exports a MoreMenu trigger using the MoreVertical svg icon', () => {
    expect(ui).toMatch(/export function MoreMenu\(/);
    expect(ui).toMatch(/import \{[^}]*MoreVertical[^}]*\} from 'lucide-react-native'/);
    expect(ui).toMatch(/<MoreVertical/);
  });

  it('offers edit and delete rows with svg icons (no emoji)', () => {
    const menu = ui.match(/export function MoreMenu\([\s\S]*?\nconst moreS/)?.[0] ?? '';
    expect(menu).toContain('<Pencil');
    expect(menu).toContain('<Trash2');
    expect(menu).toMatch(/onEdit/);
    expect(menu).toMatch(/onDelete/);
  });

  it('closes when the backdrop is pressed', () => {
    const menu = ui.match(/export function MoreMenu\([\s\S]*?\nconst moreS/)?.[0] ?? '';
    expect(menu).toMatch(/<Pressable[^>]*onPress/s);
    expect(menu).toMatch(/<Modal[^>]*transparent/s);
  });

  it('keeps the menu open when tapping inside the menu box (non-button area)', () => {
    const menu = ui.match(/export function MoreMenu\([\s\S]*?\nconst moreS/)?.[0] ?? '';
    // 메뉴 상자 자체가 터치를 삼켜야 배경 Pressable로 새지 않는다.
    expect(menu).toMatch(/<Pressable[^>]*style=\{\[moreS\.menu/s);
  });

  it('adds edit/more-actions copy to both locales', () => {
    expect(typeof ko.common.edit).toBe('string');
    expect(typeof en.common.edit).toBe('string');
    expect(typeof ko.common.moreActions).toBe('string');
    expect(typeof en.common.moreActions).toBe('string');
  });
});

describe('candidate detail header exposes MoreMenu', () => {
  const source = read('app/card/[id].tsx');

  it('renders MoreMenu in the header instead of the empty spacer', () => {
    expect(source).toMatch(/import \{[^}]*MoreMenu[^}]*\} from '..\/..\/components\/ui'/);
    expect(source).toMatch(/<MoreMenu/);
  });

  it('routes edit to the card edit screen', () => {
    expect(source).toMatch(/onEdit=\{[\s\S]*?\/card\/edit\//);
  });

  it('confirms then deletes the card and goes back', () => {
    expect(source).toMatch(/candidates\.deleteAlertTitle/);
    expect(source).toMatch(/from\('date_cards'\)\.delete\(\)/);
  });
});

describe('memory detail header exposes MoreMenu', () => {
  const source = read('app/card/memory/[id].tsx');

  it('renders MoreMenu next to the back bar', () => {
    expect(source).toMatch(/import \{[^}]*MoreMenu[^}]*\} from '..\/..\/..\/components\/ui'/);
    expect(source).toMatch(/<MoreMenu/);
  });

  it('routes edit to the memory edit screen', () => {
    expect(source).toMatch(/onEdit=\{[\s\S]*?\/card\/memory\/edit\//);
  });

  it('confirms then deletes the memory', () => {
    expect(source).toMatch(/memories\.deleteAlertTitle/);
    expect(source).toMatch(/from\('date_memories'\)\.delete\(\)/);
  });
});

// 추억 상세에서 한줄평(Review)이 별도 섹션으로 분리돼 있던 것을 Comments로 통일한다.
// 한줄평이 있으면 댓글 목록 맨 위에 일반 댓글처럼(want again 태그 포함) 노출된다.
describe('memory detail merges the one-line review into comments', () => {
  const source = read('app/card/memory/[id].tsx');

  it('no longer renders a separate review section', () => {
    expect(source).not.toContain('reviewSectionLabel');
    expect(source).not.toContain('noReviewText');
  });

  it('shows the review as the first comment row when present', () => {
    // Comments 섹션 라벨 뒤에 review 기반 CommentRow가 먼저 온다.
    const commentsBlock = source.match(/commentsSectionLabel[\s\S]*?<\/ScrollView>/)?.[0] ?? '';
    expect(commentsBlock).toMatch(/memory\.review/);
    expect(commentsBlock).toMatch(/wantAgain=\{memory\.want_again\}/);
  });

  it('shows the empty state only when there is neither review nor comments', () => {
    expect(source).toMatch(/comments\.length === 0 && ![\s\S]{0,40}review/);
  });

  it('drops the orphaned review-section copy from both locales', () => {
    expect(ko.card.memory.reviewSectionLabel).toBeUndefined();
    expect(en.card.memory.reviewSectionLabel).toBeUndefined();
    expect(ko.card.memory.noReviewText).toBeUndefined();
    expect(en.card.memory.noReviewText).toBeUndefined();
  });
});
