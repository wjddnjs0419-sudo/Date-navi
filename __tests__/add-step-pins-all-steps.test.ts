import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('addVerifiedStep pins the full current course', () => {
  const screen = readFileSync(join(__dirname, '../app/mode-flow/course-result.tsx'), 'utf8');
  const addBody = screen.slice(
    screen.indexOf('async function addVerifiedStep'),
    screen.indexOf('async function handleSendToPartner'),
  );

  it('sends every current step as a pin so the server preserves existing places exactly', () => {
    // Pinning only locked steps let Haiku re-pick the unlocked existing steps in the
    // add re-search; the mutation RPC then rejected the drifted attestation with
    // constraint_violation ("저장 실패"). Pins carry each step's real locked flag,
    // which the Edge echoes back (AR fix), so the RPC lock checks still pass.
    expect(addBody).toContain('lockedSteps: snapshot.steps.map(toLockedStep)');
    expect(addBody).not.toContain('filter((step) => step.locked)');
  });
});
