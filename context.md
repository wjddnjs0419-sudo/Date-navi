# Date Planner Handoff Context

## Project Summary

Date Planner is a couple-focused date planning app. It lets users sign up or log in, link as a couple with a couple code, create date proposals, add candidate options, discuss options through comments or change requests, and confirm a final choice.

The app currently uses:

- Next.js 15
- React 19
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Realtime

The main feature is `date-planner`.

## Current Status

Supabase integration is working.

The app `.env` points to Supabase project:

- Project ref: `wqjguifsmtblgrhdfnji`
- Backend provider: `NEXT_PUBLIC_BACKEND_PROVIDER=supabase`

Do not expose or paste the actual anon key in handoff notes or logs.

The Supabase schema was applied through the Supabase CLI by executing the SQL file directly:

```bash
supabase db query --linked -f docs/supabase-schema.sql
```

The app can access all required tables through the anon REST path:

- `date_planner_profiles`
- `date_planner_couples`
- `date_planner_proposals`
- `date_planner_options`
- `date_planner_comments`
- `date_planner_ai_requests`

`npm run typecheck` passes.

## What Was Done

- Found the Date Planner app in the existing Next.js project.
- Checked the existing PDCA plan/design/gap state.
- Reduced implementation gaps from the original plan.
- Added or confirmed route pages for:
  - `/login`
  - `/signup`
  - `/link-couple`
  - `/proposals/new`
  - `/proposals/[proposalId]`
  - `/calendar`
  - `/profile`
- Implemented or confirmed proposal edit/delete behavior.
- Implemented or confirmed option update/delete behavior.
- Added or confirmed backend support for proposal, option, comment, couple, and auth flows.
- Added Supabase adapter logic.
- Kept mock backend support as fallback.
- Fixed Supabase URL handling so URLs with `/rest/v1` or `/auth/v1` do not break requests.
- Fixed the earlier runtime error:

```text
Invalid path specified in request URL
```

- Avoided conflict with existing Supabase `public.profiles` table by renaming app tables to `date_planner_*`.
- Fixed the earlier schema mismatch issue:

```text
column profiles.user_id does not exist
```

- Updated `docs/supabase-schema.sql` to use prefixed tables.
- Made the schema safer to rerun by dropping/recreating constraints and policies where needed.
- Initialized Supabase CLI project files.
- Created migration copy:

```text
supabase/migrations/20260520145219_date_planner_schema.sql
```

- Added `supabase/.temp/` to `.gitignore`.
- Confirmed login button is wired to `handleAuthSubmit`.
- Confirmed Supabase Auth endpoint responds normally. A test with invalid credentials returned:

```text
Invalid login credentials
```

This means the login button is not dead or disconnected.

## Important Files

- `src/app/page.tsx`
  - Renders the main `DatePlannerApp`.

- `src/app/login/page.tsx`
  - Opens `DatePlannerApp` on the profile/auth view.

- `src/app/signup/page.tsx`
  - Opens `DatePlannerApp` on the profile/auth view in signup mode.

- `src/features/date-planner/date-planner-app.tsx`
  - Main UI and workflow logic.
  - Includes login/signup, couple code, proposal, option, comment, calendar, and profile flows.

- `src/lib/backend/client.ts`
  - Chooses Supabase backend when `NEXT_PUBLIC_BACKEND_PROVIDER=supabase`.
  - Falls back to mock backend when Supabase env is missing or provider is mock.

- `src/lib/backend/supabase-client.ts`
  - Supabase backend adapter.
  - Uses app-specific `date_planner_*` tables.

- `src/lib/backend/mock-client.ts`
  - Local mock backend.

- `src/lib/backend/types.ts`
  - Shared backend/domain types.

- `docs/supabase-schema.sql`
  - Main Supabase schema file.
  - This is the SQL file that was executed successfully.

- `supabase/migrations/20260520145219_date_planner_schema.sql`
  - CLI migration copy of the schema.

- `.env.example`
  - Documents required env vars.

## Supabase Notes

The Supabase account had two projects:

- `yzbjvkifwinumytehxgf`
  - Global X Pass project.
  - Previously used by this app by mistake.

- `wqjguifsmtblgrhdfnji`
  - Project name: `Date-planner`
  - Current app target.
  - `.env` and Supabase CLI link point here.

Be careful not to apply SQL to one project while the app points to another. Date Planner should remain on `wqjguifsmtblgrhdfnji` unless intentionally migrating.

## CLI Notes

`supabase link` succeeded for the current app target.

`supabase db push` did not work cleanly because the remote project already has many migration history entries that are not present locally.

The error was about remote migration versions missing from the local migrations directory.

For now, schema application should use:

```bash
supabase db query --linked -f docs/supabase-schema.sql
```

This applies the SQL directly without trying to reconcile old remote migration history.

One follow-up verification query hit a temporary Supabase pooler/auth issue:

```text
SUPABASE_DB_PASSWORD
```

But the schema execution itself succeeded, and table access was verified through the app's anon key using Supabase JS.

## Environment Variables

Required for Supabase mode:

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://wqjguifsmtblgrhdfnji.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not include `/rest/v1` or `/auth/v1` in `NEXT_PUBLIC_SUPABASE_URL`.

Good:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://wqjguifsmtblgrhdfnji.supabase.co
```

Bad:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://wqjguifsmtblgrhdfnji.supabase.co/rest/v1
```

## Commands

Start the dev server:

```bash
npm run dev
```

Run typecheck:

```bash
npm run typecheck
```

List Supabase projects:

```bash
supabase projects list
```

Apply the schema directly:

```bash
supabase db query --linked -f docs/supabase-schema.sql
```

## Known Working Checks

- `npm run typecheck` passes.
- `/` returns HTTP 200.
- `/login` returns HTTP 200.
- `/signup` returns HTTP 200.
- Supabase Auth endpoint responds.
- Required `date_planner_*` tables are visible to the app through anon REST access.
- User reported signup/login flow succeeded after schema application.

## Remaining Work

- Run full browser QA:
  - `/signup`
  - login
  - create couple code
  - join couple code with second account
  - create proposal
  - add/edit/delete options
  - add comments/change requests
  - accept proposal
  - verify calendar view

- Test Realtime with two browser sessions or two accounts.

- Check Supabase Auth email confirmation settings:
  - If email confirmation is enabled, signup may require email verification before login.
  - If quick local testing is preferred, disable email confirmation temporarily in Supabase dashboard.

- Run or update PDCA gap analysis:

```bash
$pdca analyze date-planner
```

- Update `docs/03-analysis/date-planner.analysis.md` after QA.

- Consider adding a small QA checklist or automated tests for critical flows.

## PDCA Status

Feature: `date-planner`

Current phase:

```text
Check
```

Progress:

```text
[Plan] done -> [Design] done -> [Do] done -> [Check] in progress -> [Act] pending
```

Next recommended action:

```text
$pdca iterate date-planner
```
