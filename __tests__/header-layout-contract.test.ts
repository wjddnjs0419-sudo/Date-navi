import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const ui = readFileSync(join(root, 'components/ui.tsx'), 'utf8');
const appFiles = require('node:fs')
  .readdirSync(join(root, 'app'), { recursive: true, withFileTypes: true })
  .filter((entry: { isFile: () => boolean; name: string }) => entry.isFile() && entry.name.endsWith('.tsx'))
  .map((entry: { parentPath?: string; path?: string; name: string }) => readFileSync(join(entry.parentPath ?? entry.path ?? '', entry.name), 'utf8'))
  .join('\n');

describe('shared header and screen-heading contract', () => {
  it('keeps navigation and screen-title responsibilities separate', () => {
    const headerBlock = ui.match(/export function Header\([\s\S]*?\n}\n\nexport function HeaderActions/)?.[0] ?? '';
    expect(headerBlock).not.toMatch(/title\??:/);
    expect(headerBlock).not.toMatch(/subtitle\??:/);
    expect(ui).toContain('export function ScreenHeading');
    expect(ui).toContain('marginTop: DS.layout.headerTitleOffset');
  });

  it('anchors right actions to the 20pt-inset header edge', () => {
    expect(ui).toContain("rightSlot: { position: 'absolute', right: 0");
    expect(ui).toContain('paddingHorizontal: DS.layout.pageInset');
    expect(ui).toContain('gap: DS.layout.headerActionGap');
  });

  it('places title accessories four points after the title while retaining a touch frame', () => {
    expect(ui).toContain('marginLeft: DS.layout.titleAccessoryGap');
    expect(ui).toContain('minWidth: DS.spacing.touch');
    expect(ui).toContain("alignItems: 'flex-start'");
  });

  it('does not allow app screens to put titles back inside Header', () => {
    expect(appFiles).not.toMatch(/<Header\s+(?:title|subtitle|titleNode|align)=/);
  });
});
