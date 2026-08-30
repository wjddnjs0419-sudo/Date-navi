import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const token = 'e'.repeat(64);

describe('Next.js course share fallback contract', () => {
  it('resolves a public course through the anon RPC and strips unknown DTO fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: '웹 코스',
        summary: '공개 설명',
        estimated_time: '총 2시간',
        estimated_budget: '3만원대',
        steps: [{ label: '카페', place_name: '공개 카페', candidateId: 'secret' }],
        couple_id: 'secret-couple',
      }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { fetchPublicCourse } = require('../web/lib/course-share') as typeof import('../web/lib/course-share');
      const course = await fetchPublicCourse(token);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/rpc/get_public_shared_course'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ apikey: expect.any(String) }),
          body: JSON.stringify({ p_share_token: token }),
          cache: 'no-store',
        }),
      );
      expect(course).toEqual({
        title: '웹 코스',
        summary: '공개 설명',
        estimated_time: '총 2시간',
        estimated_budget: '3만원대',
        steps: [{ label: '카페', place_name: '공개 카페' }],
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('treats invalid token and revoked/null resolver responses as the same missing course', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => null })
      .mockResolvedValueOnce({ ok: true, json: async () => null });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const { fetchPublicCourse } = require('../web/lib/course-share') as typeof import('../web/lib/course-share');
      expect(await fetchPublicCourse('not-a-token')).toBeNull();
      expect(await fetchPublicCourse(token)).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('has a route that uses notFound for the same missing result', () => {
    const source = readFileSync(resolve(root, 'web/app/course/[shareToken]/page.tsx'), 'utf8');

    expect(source).toContain('fetchPublicCourse');
    expect(source).toContain('notFound');
    expect(source).toContain('params');
    expect(source).not.toContain("from('date_cards')");
    expect(source).not.toContain('service_role');
  });

  it('keeps the Vercel web resolver self-contained within the web project root', () => {
    const source = readFileSync(resolve(root, 'web/lib/course-share.ts'), 'utf8');

    expect(source).not.toContain("../../lib/course-share");
    expect(source).toContain('function readText');
  });
});
