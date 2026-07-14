import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 13 AI privacy controls', () => {
  const sql = readFileSync(join(__dirname, '../supabase/migrations/20260715120000_ai_privacy_retention.sql'), 'utf8').toLowerCase();
  it('stores versioned consent and purges raw AI/attestation data after 30 days', () => {
    expect(sql).toContain('create table if not exists public.ai_data_processing_consents');
    expect(sql).toContain('record_ai_data_processing_consent');
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain('recommendation_generation_attestations');
    expect(sql).toContain('ai_recommendation_logs');
    expect(sql).toContain('security definer');
  });
});
