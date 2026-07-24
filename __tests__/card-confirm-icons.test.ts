import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 목업(06_card_confirm)엔 이모지 아이콘이 없다. StyleSeed lock도 lucide 단일 아이콘 패밀리를
// 요구하므로(STYLESEED.md) 날짜/시간/장소/준비물 행 아이콘을 이모지 대신 lucide로 교체한다.
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('card confirm screen icons', () => {
  const source = read('app/card/confirm.tsx');

  it('no longer renders emoji row icons', () => {
    expect(source).not.toContain('📅');
    expect(source).not.toContain('🕐');
    expect(source).not.toContain('📍');
    expect(source).not.toContain('🛍️');
    expect(source).not.toContain('⏱');
    expect(source).not.toContain('💰');
  });

  it('imports lucide icons for the row list', () => {
    expect(source).toMatch(/import \{[^}]*Calendar[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*MapPin[^}]*\} from 'lucide-react-native'/);
    expect(source).toMatch(/import \{[^}]*ShoppingBag[^}]*\} from 'lucide-react-native'/);
  });

  it('preserves the confirm save contract (status flip + confirmed fields)', () => {
    expect(source).toMatch(/async function commitSave\(\)[\s\S]*?status: 'confirmed'/);
    expect(source).toMatch(/confirmed_date: date\.trim\(\) \|\| null/);
  });

  it('confirms via a title sheet that persists the resolved title', () => {
    // 저장 버튼은 곧바로 저장하지 않고 제목 시트를 연다.
    expect(source).toMatch(/onPress=\{openTitleSheet\}/);
    // 최종 title은 resolveConfirmTitle로 정규화되어 update에 포함된다.
    expect(source).toMatch(/title: finalTitle/);
    expect(source).toMatch(/resolveConfirmTitle\(draftTitle, card\?\.title \?\? ''\)/);
  });

  it('preserves the cancel-plan delete contract', () => {
    expect(source).toMatch(/function handleCancelPlan\(\)[\s\S]*?from\('date_cards'\)\.delete\(\)/);
  });

  it('preserves the success-modal home redirect', () => {
    expect(source).toMatch(/onHide=\{[\s\S]*?router\.replace\('\/\(tabs\)\/'/);
  });

  it('renders the heading heart doodle and skyline mini illustration (목업 06 반복 누락 패턴)', () => {
    expect(source).toMatch(/headingBlock[\s\S]*?<HeartDoodle/);
    expect(source).toMatch(/<Illustration name="mini-skyline-route" width=\{MINI_ILLUSTRATION_WIDTH\}/);
  });

  it('uses pinkLight (not cream) for the row icon background', () => {
    expect(source).toMatch(/rowIconWrap:[\s\S]{0,80}backgroundColor: C\.pinkLight/);
    expect(source).not.toMatch(/rowIconWrap:[\s\S]{0,80}backgroundColor: C\.cream/);
  });
});
