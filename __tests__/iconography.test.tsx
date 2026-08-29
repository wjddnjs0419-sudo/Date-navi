import { APP_ICON_NAMES, AppIcon } from '../components/iconography';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppIcon', () => {
  it('exposes every shared product icon, including the custom Route icon', () => {
    expect(APP_ICON_NAMES).toEqual(expect.arrayContaining([
      'search', 'mapPin', 'calendar', 'heart', 'route', 'chevronLeft', 'chevronRight',
      'clock', 'wallet', 'walk', 'settings', 'user', 'image', 'sparkles', 'camera',
    ]));
  });

  it('keeps shared icons outlined unless a filled state is explicitly requested', () => {
    expect(AppIcon({ name: 'home' }).props.fill).toBe('none');
    expect(AppIcon({ name: 'heart', fill: '#F26B7A' }).props.fill).toBe('#F26B7A');
  });

  it('renders the frozen local SVG catalog without a Lucide runtime import', () => {
    const source = readFileSync(join(process.cwd(), 'components/iconography.tsx'), 'utf8');
    const catalog = JSON.parse(readFileSync(join(process.cwd(), 'assets/icons/app-icon-nodes.json'), 'utf8'));
    expect(source).not.toContain("from 'lucide-react-native'");
    expect(Object.keys(catalog)).toHaveLength(APP_ICON_NAMES.length - 1);
  });
});
