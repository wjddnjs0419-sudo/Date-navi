# Date Navi Web Repository Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing `web/` application into a clean `Date-navi-web` repository without changing the live Vercel production deployment or breaking any public route.

**Architecture:** Copy only the current Next.js application into a sibling repository and make its repository root the Next.js root. Establish route-contract tests and a Preview deployment before changing the existing Vercel Git integration; keep `Date-navi/web` untouched until the final cutover plan succeeds.

**Tech Stack:** Windows PowerShell, Git, GitHub CLI, Next.js 15 App Router, React 19, TypeScript 5.7, Playwright, Vercel CLI

**Spec:** `docs/superpowers/specs/2026-08-31-date-navi-web-separation-and-walking-routes-design.md`

## Global Constraints

- Work from Windows PowerShell and use sibling paths `Date-navi` and `Date-navi-web` with no spaces.
- Preserve `/`, `/invite`, `/course/[shareToken]`, `/support`, `/privacy`, `/api/og`, and `/.well-known/apple-app-site-association`.
- Do not delete or modify `Date-navi/web` in this plan.
- Do not change the existing Vercel Production Git connection, domain, or Root Directory in this plan.
- Never commit `.env.local`; commit only variable names in `.env.example`.
- The new repository contains no Expo, iOS, Android, Supabase migration, or mobile test files.

---

### Task 1: Capture the existing web baseline

**Files:**
- Create: `web/tests/public-route-contract.md`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: the existing nested `web/` application.
- Produces: a passing build and an explicit seven-route contract used after extraction.

- [ ] **Step 1: Install and verify the untouched application**

```powershell
cd Date-navi
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
```

Expected: all commands exit `0`; record any pre-existing failure before copying files.

- [ ] **Step 2: Write the route contract**

Create `web/tests/public-route-contract.md` with exactly:

```markdown
# Public route contract

- GET `/` returns 200.
- GET `/invite` returns 200.
- GET `/course/test-token` renders the shared-course not-found or course view without a server error.
- GET `/support` returns 200.
- GET `/privacy` returns 200.
- GET `/api/og` returns an image response for a valid query.
- GET `/.well-known/apple-app-site-association` returns JSON with the configured appID.
```

- [ ] **Step 3: Commit the baseline in the old repository branch**

```powershell
git add web/tests/public-route-contract.md
git commit -m "docs: record public web route contract"
```

### Task 2: Create the clean sibling repository

**Files:**
- Create: `../Date-navi-web/*` copied from `web/`
- Create: `../Date-navi-web/.env.example`
- Modify: `../Date-navi-web/next.config.mjs`
- Modify: `../Date-navi-web/README.md`

**Interfaces:**
- Consumes: `Date-navi/web` at the verified commit from Task 1.
- Produces: a standalone Next.js repository whose application root is the repository root.

- [ ] **Step 1: Copy the web tree without generated files or secrets**

```powershell
cd Date-navi
New-Item -ItemType Directory -Force ..\Date-navi-web | Out-Null
Get-ChildItem .\web -Force | Where-Object { $_.Name -notin @('node_modules', '.next', '.vercel', '.env.local') } | Copy-Item -Destination ..\Date-navi-web -Recurse -Force
cd ..\Date-navi-web
git init -b main
```

Expected: `package.json` is at `Date-navi-web\package.json`; `Test-Path .\node_modules` and `Test-Path .\.env.local` both return `False`.

- [ ] **Step 2: Remove nested-root-only tracing configuration**

Keep `images`, headers, redirects, and OG asset includes in `next.config.mjs`, but remove only the `outputFileTracingRoot` override that points above `web/`.

- [ ] **Step 3: Add the environment template**

Create `.env.example`:

```dotenv
SUPABASE_URL=
SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_ORIGIN=http://localhost:3000
NEXT_PUBLIC_APP_STORE_URL=
```

- [ ] **Step 4: Rewrite the README startup section**

Document these exact PowerShell commands:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Also state that `.env.local` is optional for static pages and required for shared-course and real recommendation data.

- [ ] **Step 5: Verify the standalone build**

```powershell
npm install
npm run typecheck
npm run build
```

Expected: all commands exit `0` with the Next.js root at `Date-navi-web`.

- [ ] **Step 6: Commit the extracted baseline**

```powershell
git add .
git commit -m "chore: extract Date Navi web app"
```

### Task 3: Automate the public route contract

**Files:**
- Create: `../Date-navi-web/playwright.config.ts`
- Create: `../Date-navi-web/tests/public-routes.spec.ts`
- Modify: `../Date-navi-web/package.json`

**Interfaces:**
- Consumes: the standalone Next.js build.
- Produces: `npm run test:e2e`, which starts production Next.js and verifies public routes.

- [ ] **Step 1: Install Playwright and add scripts**

```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add scripts: `"test:e2e": "playwright test"` and `"check": "npm run typecheck && npm run build && npm run test:e2e"`.

- [ ] **Step 2: Write the failing route tests**

```ts
import { expect, test } from '@playwright/test';

for (const path of ['/', '/invite', '/course/test-token', '/support', '/privacy']) {
  test(`${path} has no server error`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(500);
  });
}

test('AASA is JSON', async ({ request }) => {
  const response = await request.get('/.well-known/apple-app-site-association');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('application/json');
});

test('OG endpoint returns an image', async ({ request }) => {
  const response = await request.get('/api/og?title=Date%20Navi');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toMatch(/^image\//);
});
```

- [ ] **Step 3: Configure the production web server**

Set `webServer.command` to `npm run build && npm run start`, `url` to `http://127.0.0.1:3000`, and Chromium `baseURL` to the same URL in `playwright.config.ts`.

- [ ] **Step 4: Run and commit the contract tests**

```powershell
npm run test:e2e
git add package.json package-lock.json playwright.config.ts tests/public-routes.spec.ts
git commit -m "test: protect public web routes"
```

Expected: seven route checks pass.

### Task 4: Publish the repository and create a safe Preview

**Files:**
- Modify: GitHub repository `wjddnjs0419-sudo/Date-navi-web`
- Modify: local `.vercel/` link metadata only; it remains gitignored.

**Interfaces:**
- Consumes: the checked standalone repository.
- Produces: a GitHub repository and a Vercel Preview URL without a Production cutover.

- [ ] **Step 1: Authenticate GitHub and create the repository**

```powershell
gh auth status
gh repo create wjddnjs0419-sudo/Date-navi-web --public --source=. --remote=origin --push
```

Expected: `git remote -v` points to `wjddnjs0419-sudo/Date-navi-web` and `main` is pushed.

- [ ] **Step 2: Link the existing Vercel project without deploying Production**

```powershell
npx vercel link
npx vercel env pull .env.local --environment=development
$previewOutput = npx vercel --yes 2>&1
$previewUrl = ($previewOutput | Select-String -Pattern 'https://[^\s]+' -AllMatches).Matches.Value | Select-Object -Last 1
$previewUrl
```

During `vercel link`, select the existing project that owns `date-navi.vercel.app`. Do not create a new project. Expected: the last command returns a Preview URL and does not use `--prod`.

- [ ] **Step 3: Run the contract against Preview**

```powershell
$env:PLAYWRIGHT_BASE_URL = $previewUrl
npx playwright test
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Expected: `$previewUrl` starts with `https://` and all route tests pass on Preview. If it is empty, stop and inspect `$previewOutput`; do not continue to Production.

- [ ] **Step 4: Record the handoff**

Add the Preview URL and successful command output to the implementation PR. Leave Production, the domain, and `Date-navi/web` unchanged.
