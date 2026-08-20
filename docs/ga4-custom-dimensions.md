# Date Navi GA4 Custom Definitions

Analytics foundation implementation for 2026-08-20. Create these definitions in GA4 **Admin → Custom definitions** before building production explorations. All definitions are event-scoped and contain only bounded enums, booleans, or small integer counts.

## Built-in screen fields (do not create custom definitions)

| Parameter | Usage |
| --- | --- |
| `screen_name` | The standard parameter on Firebase `screen_view`; use GA4's Screen name dimension. |
| `screen_class` | The standard Firebase screen class parameter; always `DateNavi` in this release. |

## Register as event-scoped custom dimensions

Set each dimension's parameter name exactly as shown and use the String type. GA4 stores boolean parameter values as event parameter values; register them as String dimensions (`true` / `false`) for consistent reporting.

| Display name | Event parameter | Applies to | Values |
| --- | --- | --- | --- |
| Analytics mode | `mode` | recommendation request started/succeeded/failed, course saved | `make_course` |
| Onboarding skipped | `skipped` | onboarding completed | `true`, `false` |
| Has pinned place | `has_pinned_place` | recommendation request started | `true`, `false` |
| Has walking limit | `has_walking_limit` | recommendation request started | `true`, `false` |
| Has budget | `has_budget` | recommendation request started | `true`, `false` |
| Has duration | `has_duration` | recommendation request started | `true`, `false` |
| Has mood | `has_mood` | recommendation request started | `true`, `false` |
| Has additional request | `has_additional_request` | recommendation request started | `true`, `false` |
| Recommendation error code | `error_code` | recommendation request failed | approved finite error-code enum only |
| Recommendation failure stage | `failure_stage` | recommendation request failed | `course_build`, `response_schema`, `request_response_validation`, `stage_attestation` |
| Place selection context | `selection_context` | place selected | `course_pin`, `course_replace` |
| Regeneration scope | `scope` | course regenerate requested | `unlocked_steps` |
| Course title customized | `title_customized` | course saved | `true`, `false` |
| Proposal send method | `send_method` | proposal sent | `in_app` |
| Proposal source screen | `source_screen` | proposal sent | `course_recommendation_result` |

## Register as event-scoped custom metrics

Use **Standard** reporting and **Integer** unit for each metric.

| Display name | Event parameter | Applies to |
| --- | --- | --- |
| Recommendation step count | `step_count` | recommendation request started/succeeded, course regenerate requested, course saved |
| Recommendation card count | `card_count` | recommendation request succeeded |
| Locked step count | `locked_step_count` | course regenerate requested |

## Explicitly excluded data

Do not register or send identifiers, invite codes, free text, titles, messages, search terms, addresses, geographic coordinates, dates, request IDs, or place names. Firebase is the source of truth for anonymous and authenticated analytics; Supabase mirrors the same canonical event and parameters only for authenticated sessions.
