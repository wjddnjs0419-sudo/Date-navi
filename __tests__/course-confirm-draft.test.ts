import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');
const candidates = readFileSync(join(__dirname, '../app/(tabs)/candidates.tsx'), 'utf8');
const pipelineContracts = readFileSync(join(__dirname, '../supabase/migrations/20260826130000_course_pipeline_contracts.sql'), 'utf8');

describe('course confirm stays a draft until saved or sent', () => {
  it('marks a just-confirmed course card as draft so it is not yet a candidate', () => {
    expect(src).toMatch(/status:\s*'draft'/);
  });

  it('promotes the card to active when the user saves or sends', () => {
    expect(src).toMatch(/status:\s*'active'/);
  });

  it('candidates only lists active cards, so draft (confirmed-but-unsaved) courses stay hidden', () => {
    expect(candidates).toMatch(/eq\(\s*'status',\s*'active'\s*\)/);
  });

  it('allows the confirmation RPC to create the card as draft atomically', () => {
    expect(pipelineContracts).toContain("'draft'");
    expect(pipelineContracts).toContain('recommendation_session_id, status');
    expect(pipelineContracts).toContain('date_cards_status_check');
  });
});
