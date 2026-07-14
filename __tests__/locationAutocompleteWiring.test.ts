import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('location autocomplete vertical slice wiring', () => {
  it('keeps Kakao autocomplete and authentication inside a local Edge Function', () => {
    const edgePath = join(root, 'supabase/functions/location-autocomplete/index.ts');
    expect(existsSync(edgePath)).toBe(true);
    if (!existsSync(edgePath)) return;

    const source = readFileSync(edgePath, 'utf8');
    expect(source).toContain("Deno.env.get('KAKAO_REST_API_KEY')");
    expect(source).toContain('userClient.auth.getUser()');
    expect(source).toContain('/v2/local/search/keyword.json');
    expect(source).toContain('/v2/local/search/address.json');
    expect(source).not.toContain('EXPO_PUBLIC_KAKAO');
  });

  it('uses the dedicated selector only in make_course and forwards the structured selection', () => {
    const course = readFileSync(join(root, 'app/mode-flow/course.tsx'), 'utf8');
    const feeling = readFileSync(join(root, 'app/mode-flow/feeling.tsx'), 'utf8');

    expect(course).toContain("from '../../components/recommendation/location-selector'");
    expect(course).toContain('<LocationSelector');
    expect(course).toContain('value={draft.location}');
    expect(course).toContain("dispatch({ type: 'setLocation', location })");
    expect(course).toContain('buildCourseInput({ draft, categoryLabels })');
    expect(feeling).not.toContain('LocationSelector');
  });
});
