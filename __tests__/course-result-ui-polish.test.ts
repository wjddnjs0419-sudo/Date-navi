import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/mode-flow/course-result.tsx'), 'utf8');

// 영어 라벨(Regenerate / Add place / Confirm course)이 길어지면 고정폭 버튼 두 개가
// confirm 버튼을 화면 밖으로 밀어냈다. 세 버튼 모두 flex로 나누고 좌우 패딩을 동일하게 둔다.
describe('course result footer button symmetry', () => {
  it('splits all three footer buttons with flex and equal horizontal padding', () => {
    const regenerate = source.match(/regenerateButton: \{([^}]*)\}/)?.[1] ?? '';
    const confirm = source.match(/confirmButton: \{([^}]*)\}/)?.[1] ?? '';
    expect(regenerate).toContain('flex: 1');
    expect(confirm).toContain('flex: 1');
    const pad = (styles: string) => styles.match(/paddingHorizontal: (\d+)/)?.[1];
    expect(pad(regenerate)).toBeDefined();
    expect(pad(regenerate)).toBe(pad(confirm));
  });

  it('renders the confirm button as plain text without a check icon', () => {
    const confirmButton = source.match(/testID="course-confirm"[\s\S]*?<\/TouchableOpacity>/)?.[0] ?? '';
    expect(confirmButton).not.toContain('<Check');
  });

  it('centers footer button labels so wrapped lines stay symmetric', () => {
    const regenerateText = source.match(/regenerateText: \{([^}]*)\}/)?.[1] ?? '';
    const confirmText = source.match(/confirmText: \{([^}]*)\}/)?.[1] ?? '';
    expect(regenerateText).toContain("textAlign: 'center'");
    expect(confirmText).toContain("textAlign: 'center'");
  });
});

// 교체 후보 목록이 타임라인 아래 인라인 패널로 껴 있어서 눈에 안 띄었다.
// step-action-sheet와 같은 바텀시트 모달(어두운 배경 + 우상단 X)로 띄운다.
describe('course result replacement bottom sheet', () => {
  it('renders replacement options inside a slide-up modal', () => {
    expect(source).toMatch(/<Modal[^>]*visible=\{!!replacementTargetId\}/s);
    expect(source).toMatch(/<Modal[^>]*animationType="slide"/s);
  });

  it('dims the area outside the sheet and closes on backdrop press', () => {
    expect(source).toMatch(/<Pressable[^>]*style=\{s\.replacementBackdrop\}[^>]*onPress=\{closeReplacementPanel\}/s);
    const backdrop = source.match(/replacementBackdrop: \{([^}]*)\}/)?.[1] ?? '';
    expect(backdrop).toContain('rgba');
  });

  it('keeps the existing X close button at the sheet top-right', () => {
    expect(source).toMatch(/onPress=\{closeReplacementPanel\} style=\{s\.replacementCloseButton\}>\s*<X/);
  });

  it('no longer renders the inline replacement panel in the scroll content', () => {
    expect(source).not.toContain('replacementPanel');
  });
});
