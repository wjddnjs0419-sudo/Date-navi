import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

function dateCardInsertPayloads(path: string): string[] {
  return [...readSource(path).matchAll(
    /\.from\('date_cards'\)\.insert\(\{([\s\S]*?)\n\s*\}\);/g,
  )].map(match => match[1]);
}

describe('request/session persistence wiring', () => {
  it('attaches a newly created candidate-flow session before routing generated cards', () => {
    expect(readSource('app/mode-flow/generating.tsx')).toMatch(
      /result\s*=\s*attachRecommendationIdentity\(result,\s*\{\s*sessionId\s*\}\);/,
    );
  });

  it('writes identity in AI inserts while structured course confirmation avoids duplicate direct writes', () => {
    const payloads = [
      ...dateCardInsertPayloads('app/mode-flow/result.tsx'),
      ...dateCardInsertPayloads('app/mode-flow/course-result.tsx'),
      ...dateCardInsertPayloads('app/card/[id].tsx'),
      ...dateCardInsertPayloads('app/(tabs)/candidates.tsx'),
    ];
    const aiPayloads = payloads.filter(payload => /source:\s*'ai'/.test(payload));
    const manualPayloads = payloads.filter(payload => /source:\s*'manual'/.test(payload));

    expect(aiPayloads).toHaveLength(3);
    expect(manualPayloads).toHaveLength(0);
    expect(aiPayloads.every(payload => /\.\.\.writeRecommendationIdentity\(/.test(payload))).toBe(true);
    expect(readSource('app/mode-flow/course-result.tsx')).not.toContain(".from('date_cards').insert");
  });
});
