# Localized Step Tags Design

## Goal

Make shipped course-step tags follow the app language while preserving reliable Korean Kakao search terms. Keep personal tags account-scoped, and prevent an unverified custom tag from polluting the reusable personal catalog.

## Tag model

Each shipped tag has a stable Korean canonical value and localized labels.

- The editor renders `label.ko` or `label.en` for the active app language.
- Selecting a shipped tag stores its canonical Korean value in `intentTags`.
- The Edge resolver maps that value to the existing dictionary entry and uses its Korean Kakao search terms.
- Hiding a shipped tag uses its canonical value, so a hidden tag remains hidden after a language switch.

Known personal tags that match a dictionary alias are displayed with the active-language dictionary label. Unknown personal tags retain the exact text entered by the user.

## Language switching

The personal tag catalog hook accepts the current language. Suggestions are derived from the same account-backed personal and hidden rows, then re-rendered whenever the language changes; no migration or duplicate database rows are created.

The selected tag remains its canonical stored value. Its chip label is localized on the next render.

## Custom tags

Direct input remains optional and accepts a non-empty tag of at most 40 characters.

- A dictionary alias entered in either language canonicalizes to the matching Korean search value and is persisted normally.
- An unknown tag is used once for the current recommendation request but is not persisted immediately.
- The client receives the request's verified search evidence. If the custom tag has no matching Kakao result, show an inline "check the search term" notice and do not save it to the personal catalog.
- If it has verified evidence, persist the original custom text as a personal tag.

The selected unknown tag stays visible for the current draft even when it is not saved.

## Tests

- Korean and English shipped labels map to the same canonical request tag and Kakao search term.
- Changing language changes labels without refetching or duplicating personal rows.
- Hidden defaults stay hidden across a language change.
- A recognized English custom tag canonicalizes before persistence.
- An unknown custom tag with no verified Kakao evidence is not persisted and shows a notice.
