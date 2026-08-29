# Provider Search Intent Evidence Design

## Status

Design approved in conversation for implementation review.

## Problem

Provider-neutral discovery currently treats a required step keyword as matched
only when the provider's place name or category metadata contains the keyword.
This rejects valid local-search results returned by an explicit keyword query.
For example, a place returned by `홍대입구 삼겹살` may not contain `삼겹살` in
its name or provider category, even though the provider returned it for that
query.

## Decision

For both Naver and Kakao, an explicit provider keyword-search result is a valid
secondary intent-matching signal. A required intent passes when either:

1. strict provider metadata evidence matches (place name or provider category),
   or
2. the place was returned by an explicit intent query whose search evidence
   contains the canonical intent term.

Strict metadata evidence remains the stronger signal for ranking and audit.
Search evidence does not bypass category compatibility, quality, exclusion,
duplicate, history, distance, or other existing gates.

Category-only queries such as `홍대입구 음식점` or `홍대입구 술집` do not satisfy
a required keyword intent.

## Scope and data flow

The same matching policy must be used at every provider-neutral boundary:

- step-scoped Naver and Kakao candidate-pool qualification;
- final AI candidate selection prompt and server-side selection validation;
- replacement candidate generation and replacement validation;
- locked/unlocked regeneration paths that reuse provider-neutral candidates.

The matcher should expose the evidence source (`provider_metadata` or
`provider_search`) so diagnostics and prompt construction can distinguish a
verified place fact from provider query relevance. Existing `matched` versus
`unmatched` qualification semantics remain compatible for callers.

## Guardrails

- Keep known incompatible categories excluded. Unknown provider categories
  remain eligible under the existing policy.
- Keep the drinks-step rule that allows meal-category places.
- Only intent-derived search evidence can satisfy an intent. A generic
  category query cannot.
- Prefer canonical-term query evidence for required intents. Broader search
  expansions may remain ranking evidence unless explicitly validated as an
  intent query signal.
- Do not claim adjective attributes such as `조용한` as verified facts. Those
  remain soft preferences; this design concerns explicit required intents.
- Preserve provider-neutral candidate-pool ownership and candidate IDs.

## Expected behavior

For a course with `삼겹살`, `조용한 카페`, and `칵테일`:

- `삼겹살` results from an explicit `삼겹살` query can pass intent matching
  without the word appearing in the place name or metadata, provided category
  compatibility passes.
- `조용한 카페` remains a soft cafe preference and uses the cafe-preserving
  search phrase.
- `칵테일` results from an explicit `칵테일` query can pass intent matching
  without exact name/category text, provided category compatibility passes.

## Observability

Step diagnostics should report counts split by evidence source:

- strict metadata intent matches;
- provider-search intent matches;
- category-incompatible candidates;
- intent-unmatched candidates;
- final selectable candidates.

This makes it possible to detect whether the relaxation increases valid recall
or admits irrelevant results without logging full user queries.

## Testing

Add regression coverage for both providers and every shared boundary:

1. explicit Naver intent query + no metadata keyword => selectable;
2. explicit Kakao intent query + no metadata keyword => selectable;
3. category-only query + no metadata keyword => not an intent match;
4. known incompatible category remains rejected;
5. strict metadata match remains accepted and ranked stronger;
6. prompt includes both evidence types without presenting search relevance as a
   verified place fact;
7. final course selection and replacement validation use the same result;
8. existing soft adjective and drinks-meal compatibility behavior remains.

## Rollout

Implement the policy in the shared provider-neutral matcher, update all
consumers and tests, run full validation, then deploy both
`recommend-date` and `provider-neutral-replacements`. Verify production logs
for the evidence-source counts before considering the change complete.
