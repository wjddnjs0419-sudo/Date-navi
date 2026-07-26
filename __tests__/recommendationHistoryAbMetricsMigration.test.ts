import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('recommendation history A/B metric migration', () => {
  const root = join(__dirname, '..');
  const migration = readFileSync(
    join(root, 'supabase/migrations/20260726100000_recommendation_history_ab_metrics.sql'),
    'utf8',
  );
  const canonical = readFileSync(join(root, 'docs/supabase-schema.sql'), 'utf8');

  it('derives a replacement event rank only from an attested response and never from the mutation payload', () => {
    expect(migration).toContain("v_response #>> ''{metadata,replacementCandidateRank}''");
    expect(migration).toContain("set_config(''app.recommendation_candidate_rank''");
    expect(migration).toContain("current_setting('app.recommendation_candidate_rank', true)");
    expect(migration).toContain("'place_replaced'");
    expect(migration).toContain("raise exception 'candidate rank injection failed'");
    expect(migration).toContain("raise exception 'event action injection failed'");
    expect(migration).toContain("raise exception 'metadata preservation injection failed'");
    expect(migration).toContain("raise exception 'replacement list attestation injection failed'");
    expect(migration).toContain("position('candidatelistattestationid' in lower(v_definition))");
    expect(migration).toContain("request_json ->> ''baseRequestId'' = v_session.request_id");
    expect(migration).toContain("coalesce(metadata, ''{}''::jsonb) || (v_response -> ''metadata'')");
    expect(migration).not.toContain("p_payload ->> 'candidateRank'");
    expect(canonical).toContain("app.recommendation_candidate_rank");
    expect(canonical).toContain("metadata preservation injection failed");
  });

  it.each([
    ['migration', migration],
    ['canonical schema', canonical],
  ])('every %s self-check marker appears in SQL the file actually injects', (_label, sql) => {
    const guardPattern = /position\('(.*?)' in lower\(v_definition\)\)/g;
    const markers = [...sql.matchAll(guardPattern)].map((match) => match[1]);
    expect(markers.length).toBeGreaterThan(0);
    const injectedOnly = sql.replace(guardPattern, '').toLowerCase();
    for (const marker of new Set(markers)) {
      expect(injectedOnly).toContain(marker.toLowerCase());
    }
  });
});
