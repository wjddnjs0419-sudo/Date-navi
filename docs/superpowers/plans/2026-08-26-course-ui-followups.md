# Course UI Follow-ups Implementation Plan

> **For agentic workers:** Execute the tasks inline with checkpoints after each UI area.

**Goal:** Align the iOS course input flow with the latest Figma screens while preserving the working course-generation contract.

**Architecture:** Keep `/mode-flow/course` and its five internal steps. Use a custom React Native bottom sheet for the date/time composition, an inline native iOS date picker where it fits, and React Native 30-minute time chips below it. Keep location selection and review composition in their existing screen components.

**Tech Stack:** Expo React Native, TypeScript, `@react-native-community/datetimepicker`, React Native `Modal`/`ScrollView`, Jest, Expo EAS.

**Spec:** Latest user screenshots and approved requirements in this conversation.

## Global Constraints

- Android behavior is out of scope; preserve the existing Android fallback.
- Keep the native date/time value as one `Date`/ISO value for request persistence.
- Keep dim backdrop and no close X on the time sheet.
- Keep generation request and Edge response contracts unchanged.
- Do not remove or rewrite unrelated user changes.

### Task 1: Location controls and recent cards

**Files:**
- Modify: `components/recommendation/location-selector.tsx`
- Modify: `constants/colors.ts`
- Modify: `locales/ko/location.json`, `locales/en/location.json`
- Test: `__tests__/location-selector.test.tsx`, `__tests__/locationSelector.test.tsx`

- [ ] Make the default current-location control white with `#8A8075` icon/text, while preserving its selected state.
- [ ] Remove the fixed popular-area data and section.
- [ ] Render loaded recent locations as full-width, vertically stacked cards with chevrons.
- [ ] Update tests to assert the default color, absence of popular content, vertical recent card test IDs, and card selection.

### Task 2: iOS hybrid date/time picker

**Files:**
- Modify: `components/recommendation/course-time-selector.tsx`
- Modify: `__tests__/course-screen.test.tsx`
- Test: `__tests__/course-time-selector.test.tsx` if needed

- [ ] Keep the dimmed custom sheet and apply action without an X button.
- [ ] On iOS, show an inline native date picker for the calendar portion.
- [ ] Render horizontally scrollable 30-minute chips below the calendar and merge chip changes into the same draft `Date`.
- [ ] Preserve quick shortcuts and ISO output, and keep Android’s existing native fallback untouched.
- [ ] Assert the inline date picker, horizontal time chips, dim backdrop, and apply action in tests.

### Task 3: Review screen 05 alignment

**Files:**
- Modify: `app/mode-flow/course.tsx`
- Modify: `locales/ko/course.json`, `locales/en/course.json` only if copy needs exact alignment
- Test: `__tests__/course-screen.test.tsx`, `__tests__/course-ui-scope.test.tsx`

- [ ] Match the Figma 05 hierarchy: title/subtitle spacing, review card inset, divider rhythm, muted value color, and pink edit labels.
- [ ] Keep category icons, location, time, mood rows, recommendation note, and generate CTA behavior unchanged.
- [ ] Add source-level or renderer assertions for the review layout contract without coupling tests to platform host-node duplication.

### Task 4: Verification and release candidate

**Files:**
- Modify: `RESULT.md`

- [ ] Run focused location/time/course tests.
- [ ] Run `npm run validate`, `npx expo export --platform web`, and `git diff --check`.
- [ ] Run the full Jest suite and record only unrelated pre-existing failures.
- [ ] Build a new iOS EAS production/TestFlight build after the UI changes; do not claim device QA until installed and tested.

