# Date-navi Design System Decision Record

Date: 2026-08-27  
Status: Decision draft — implementation has not started  
Scope: Product-wide mobile UI migration, based on the shipped Input and Quick Planning Loading surfaces plus the Figma Design System

## Purpose

Date-navi needs one visual baseline across every mobile screen. The purpose of this record is to separate decisions from implementation work so that screen-by-screen styling does not drift again.

The user owns all product decisions. This document records the decisions made during the five-question interview rounds. It is not permission to change code or mutate the Figma file until the user reviews and approves this document.

## 1. Canvas and color

### Canvas rules

- Normal product screens use `color/background/canvas` = `#FFF9FC`.
- White is a surface color, not the default page canvas.
- Home is a deliberate exception. It uses a diagonal gradient from `#FFF1F6` at the top-left to `#FFFFFF` at the bottom-right.
- Splash and full-screen loading surfaces use `#FFF1F6` when the screen is not using the Home gradient.
- Bucketlist and Card Detail remain full-white page exceptions. They must be represented by named canvas exception tokens rather than ad hoc white backgrounds.
- Card, input, selection, modal, and sheet surfaces use `#FFFFFF` as their surface token.

### Figma color tokens inspected

| Role | Token | Value |
|---|---|---|
| Canvas | `color/background/canvas` | `#FFF9FC` |
| Splash | `color/background/splash` | `#FFF1F6` |
| Surface | `color/background/surface` | `#FFFFFF` |
| Brand primary | `color/brand/primary` | `#F26B7A` |
| Brand deep | `color/brand/deep` | `#C24B57` |
| Brand subtle | `color/brand/subtle` | `#FFEEF0` |
| Brand border | `color/brand/border` | `#F2A8B0` |
| Brand selected | `color/brand/selected` | `#FFD3D9` |
| Text primary target | `color/text/primary` | `#3B2E2E` |
| Text secondary | `color/text/secondary` | `#8A7F76` |
| Text tertiary | `color/text/tertiary` | `#A89B92` |
| Text disabled | `color/text/disabled` | `#B8AEA6` |
| Border default | `color/border/default` | `#F2E0DC` |
| Border subtle | `color/border/subtle` | `#F2E7DC` |
| Error | `color/semantic/error` | `#FF4F6D` |

The Figma inspection returned `#3A2E2E` for the existing primary text variable, while the product decision is `#3B2E2E`. The migration target is one primary text value, `#3B2E2E`, with no near-duplicate primary/strong tokens. The Figma variable must be aligned during the approved design-system update.

### Button colors

- Primary: background `#F26B7A`, white text.
- Secondary: preserve the current filled treatment: background `#FFEEF0`, text `#C24B57`, no additional border unless a component-specific rule requires one.
- Text Action: transparent background, `#8A7F76` or the appropriate semantic text token.
- Destructive: transparent background, `#FF4F6D` text, only for irreversible or dangerous actions.

## 2. Spacing and Safe Area

### Spacing scale

General layout spacing is restricted to:

`4 / 8 / 12 / 16 / 24 / 32 / 40 / 48`

Role-specific values are not general spacing values:

- `20pt`: screen inset and header design inset.
- `44pt`: minimum touch target and icon-button frame.
- `56pt` and `60pt`: component dimensions such as controls or tab surfaces.
- Figma's `2 / 6 / 10 / 13` values are legacy or component-specific values and must not be used as general page spacing.

### Safe Area rule

Safe Area insets are separate from design spacing. The design token never includes the device's top or bottom inset.

The Input baseline is:

```tsx
<SafeAreaView>
  <ScrollView contentContainerStyle={{
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  }} />
</SafeAreaView>
```

This means physical distance from the device edge is `Safe Area inset + design padding`, not a single 20pt total.

- Course Input: top 20pt and bottom 20pt design padding, with Safe Area applied separately.
- Feeling Input: its current fixed footer's 32pt bottom padding is an inconsistency. It migrates to 20pt design padding plus Safe Area.
- A 32pt value remains valid for section separation, such as the gap between an Input intro block and its form content.
- Quick Planning Loading currently uses `paddingTop: 72` and `paddingBottom: 32` in its own non-Safe-Area component. The 72pt is a loading composition offset, not a page spacing token, and must be converted to a named loading-specific exception after visual verification.

### Current page-inset audit

The following screens currently use 20pt for their page-level horizontal content inset, or use it in the normal body layout. Internal card, chip, and modal padding is excluded.

- Home, Date Mode, Candidates, Memories, My page, and the Settings route rendering the same My page.
- Plans, Edit Profile, Notifications, and Delete Account.
- Card Confirm, Card Edit, Card Review, Memory New, Memory Edit, and Memory Detail.
- Share Send, Share Reaction, Share Mutual, Privacy, and Terms.
- Course Input, Feeling Input, Legacy Result normal content, Course Result normal content, and Quick Planning Loading's horizontal content inset.

Known non-20 exceptions are preserved until migration rules are applied:

- Login and all eight onboarding screens: 24pt body inset.
- Bucketlist: 20pt header inset, 24pt body inset; full-white canvas exception.
- Card Detail: 20pt header inset, 24pt body inset; full-white canvas exception.
- Place Search: 16pt header and list inset.
- Generating's generic state: 32pt state padding. Quick Planning Loading is a separate composition with top 72pt and bottom 32pt.
- Course Result loading/error states: 32pt centered state padding.

## 3. Typography

The app uses the platform system font fallback with the Figma typography scale and no screen-specific replacements.

| Style | Size / line height | Weight |
|---|---:|---|
| Display | 30 / 36 | Extra Bold |
| Hero | 26 / 34 | Bold |
| Screen title | 24 / 32 | Extra Bold |
| H1 | 22 / 30 | Bold |
| H2 | 19 / 26 | Bold |
| H3 | 15 / 20 | Bold |
| Body Large | 16 / 24 | Semi Bold |
| Body | 14 / 22 | Medium |
| Body Compact | 13 / 20 | Medium |
| Body Small | 12 / 18 | Medium |
| Caption | 11 / 16 | Medium |
| Button | 15 / 20 | Semi Bold |
| Button Compact | 13 / 18 | Bold |
| Badge | 10 / 12 | Semi Bold, 0.2px letter spacing |

English and Korean copy may wrap naturally. One-line truncation is not a global rule. Manual line breaks are allowed only when they are an intentional part of a designed copy composition, such as the Home hero.

## 4. Header and navigation

### Header structure

The header is a navigation row, not a title container:

1. Root screen: omit the Header only when no navigation controls are needed, as on Home. Candidates, Memories, and Settings/My page show the shared back Header. A navigation-row brand element such as the Home wordmark may use the left slot.
2. Standard child screen: 44×44 back frame, optional centered progress state, and optional right action.
3. Login, loading, and modal: no back action unless the specific flow explicitly requires one.

Header geometry follows the Input baseline:

- Safe Area is applied first.
- The header starts 20pt below the Safe Area's top edge.
- The leading edge is 20pt from the content edge.
- Back and action frames are 44×44pt.
- The right action group is anchored to the 20pt trailing inset. Multiple actions extend left from the rightmost action with an 8pt default gap or a named 16pt group gap.

The screen title is a separate `ScreenHeading` below the navigation Header:

- It starts 16pt below the 44pt navigation row and 20pt from the leading edge.
- A root title with no navigation row starts 20pt below the Safe Area.
- It uses Figma `screenTitle` (24/32 Extra Bold) and wraps naturally.
- A title-bound visual such as a heart starts 4pt after the title text. The Upcoming Date edit and Memory edit hearts follow this title-accessory rule; their remaining illustrations stay in the separate composition area. Interactive accessories preserve that visual gap and provide a 44×44pt touch target.
- The Candidate Detail love control is not a title-bound visual. It remains a standalone reaction action, aligned to the trailing edge of the card-title row with a 44×44pt touch target; the 4pt title-accessory gap does not apply.

The home Settings gear and the My page tab must resolve to the same My page screen and the same header/content design. They must not create two visually different Settings entry points.

Header actions appear only when they perform a direct action in the current context. No placeholder action slots are reserved.

### Bottom tab bar

- Applies consistently to Home, Date Mode, Candidates, Memories, and My page.
- Bar body height: 64pt, with the device bottom Safe Area added separately.
- Visual icon size: 24pt.
- Label style: Figma Caption, 11/16.
- Active icon and label: `#F26B7A`.
- Inactive icon and label: the appropriate Figma secondary/muted token.
- No active underline or active pill is added to the bottom tab bar.
- The tab bar has a 1pt top divider using the tab-bar border token.
- Detailed child screens hide the bottom tab bar.

Course Result, Memories, and Plans use segmented controls, not underline indicators. Their selected item keeps the existing filled-background treatment. Segmented controls and bottom-tab selection must remain separate components and state models.

## 5. Components and states

### Cards and surfaces

- Base content card: white surface, subtle border 1pt, radius 22pt, no shadow.
- Input and selection surface: white surface, default border 1pt, radius 16pt, no shadow.
- Selected default option: brand-subtle background, brand border 1.5pt.
- Semantic selections may use cream, lavender, gray, or other named semantic tones when the color carries meaning.
- Shadows are reserved for elements that genuinely float above the page: modal, popover, dropdown, or explicitly raised content.
- Bucketlist and Card Detail retain white page canvases as named exceptions; their cards still use surface tokens.

### Input states

- Default: `border/default`.
- Focused: brand primary border, 1.5pt.
- Error: semantic error border and error text.
- Disabled: disabled background and disabled text.
- Placeholder: tertiary/muted text token.
- Default field height: 52pt.
- Multiline field height: 112pt.
- Input radius: 16pt.
- Input horizontal padding: 12pt.
- Label-to-input gap: 8pt.
- Error-to-input gap: 4pt.

### Buttons and CTA placement

- Primary buttons use the existing full-width `BigButton` behavior.
- Secondary and Text Action buttons may use intrinsic/content width.
- A short screen uses a fixed bottom CTA footer.
- A long scrolling form places its CTA after the content.
- In both cases, the CTA's top relationship to the preceding content uses the same spacing token; no screen-specific arbitrary gap is allowed. The Input baseline is 16pt.
- The button's bottom design padding is separate from Safe Area.

### Interaction states

All interactive components use the same state model:

- `default`
- `pressed`
- `selected`
- `disabled`

Hover is not a mobile app state. Pressed uses `opacity: 0.88`. Pressed must not overwrite selected styling, and disabled must not be simulated only through opacity.

All touchable elements provide a minimum 44×44pt hit frame. Keyboard presentation must move or expose fixed CTAs without obstruction and restore the Input baseline when the keyboard dismisses.

### Modals and sheets

- White surface.
- Modal radius 24pt.
- Shared top handle where the pattern is a bottom sheet; centered dialogs do not render a handle.
- Shared scrim token.
- Shared header/action placement.
- Explicit close or action behavior; no inconsistent screen-specific back icon.

## 6. Icon and asset policy

Figma is the canonical icon catalog. The actual app icon inventory must be compared with the Figma Icons page before migration.

- Icons missing from Figma are sourced from Lucide, reviewed, and saved into Figma as components at the required 24pt and 18pt sizes.
- The production app uses the resulting SVG assets throughout.
- Direct screen-level Lucide imports are removed after the corresponding SVG asset is available.
- Existing app-specific route and illustration assets are not replaced by arbitrary substitutes. They are mapped to named Figma/app asset roles.
- The Figma route icon must be the canonical SVG asset; the current ad hoc route icon is not an acceptable final asset.

## 7. Progress and motion

### Progress Dots

- Course Input uses five dots and the existing `step / 5` count.
- Active state uses brand primary `#F26B7A`.
- Inactive state uses the Figma inactive/border token.
- The active visual shape and spacing follow the Figma Progress Dots component.
- Active, completed, and current-only behavior must be explicit component states.

Known defect: `ProgressDots` currently gives `dotCurrent` width but, when `variant="current-only"`, does not give it the brand color. This causes the active Input step to appear inactive. The implementation must explicitly resolve the current state to `brandPrimary`.

### Motion tokens

- Press: 120ms.
- Content transition: 200ms.
- Stage transition: 360ms.
- Progress transition: 400ms.
- Reduce Motion removes or minimizes nonessential animation.

Quick Planning Loading keeps the smooth progress interpolation and synchronized mascot/text transitions. Its 72pt top composition offset remains a named exception until the final visual pass confirms the Figma alignment.

## 8. Migration guardrails

The migration is complete only when:

- Every screen uses the common canvas, header, spacing, typography, button, card, input, modal, tab, and icon rules unless it is listed as a named exception.
- Raw padding, margin, gap, radius, color, font size, and weight values are removed or justified as a documented component dimension.
- The My page route and Home Settings route render the same design.
- The five-dot active color defect is fixed and covered by a component-level regression check.
- Screens are visually checked at the 390×844 baseline in Korean and English, including long copy and keyboard states.
- Full-screen exceptions and loading composition exceptions are documented in the token layer.
- The SVG icon inventory is complete and direct substitute icons are removed.

## Approval checkpoint

This is the design decision baseline for the migration. No implementation plan or code change should begin until the user confirms that this document accurately reflects the intended system.
