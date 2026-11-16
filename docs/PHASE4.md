# Phase 4 — AI Tutor Core & Intelligent Writing Evaluation

## 1. Architecture

```
WritingView ─▶ WritingEvaluator (services/writingEvaluation.ts)
                  │  context: learnerProfile + aiSettings + recurring mistakes
                  ▼
            aiClient.ts  ──HTTP /api/ai──▶  ai-service/ (gateway, loopback)
                                              ├─ validation.mjs   request + model-output validation
                                              ├─ prompts.mjs      writing-evaluator-v1
                                              ├─ providers.mjs    registry ─▶ Ollama adapter
                                              │                            └▶ Cloud adapter (openai-chat)
                                              └─ config.mjs       env + startup validation
                  ▼
      WritingFeedback.vue ─▶ writingHistory (v2) · mistakes store · PerformanceEvents · recommendations
```

Provider logic never touches Vue components; the evaluator interface is skill-agnostic (future `SpeakingEvaluator` etc. reuse `aiClient` + the gateway with new prompt versions — no placeholder services were created).

## 2. AI Gateway (`ai-service/`)

Zero-dependency Node service mirroring `tts-service/` conventions. Endpoints: `GET /api/ai/health`, `GET /api/ai/providers`, `POST /api/ai/evaluate-writing`. Full request/response contract in `ai-service/README.md`.

## 3. Providers

- **Ollama**: `OLLAMA_BASE_URL`, `OLLAMA_MODEL(S)`, optional JSON mode (`OLLAMA_JSON_MODE`). Health = `/api/tags`. Errors mapped: connection refused → 503, timeout → 504, unknown model → 503 with the model name.
- **Cloud**: any OpenAI-compatible chat-completions API. `CLOUD_API_BASE_URL/KEY/MODEL(S)`, explicit `CLOUD_WIRE_FORMAT=openai-chat`. 401/403 → auth, 404 → model-unavailable, 429 → rate-limited.
- Clients may only request models in the server-side allowlist. Model/provider switching is pure configuration — `WritingEvaluator` is untouched.
- **Fallback is explicit**: needs both `AI_FALLBACK_PROVIDER` on the server AND `allowFallback:true` from the client (off by default in the UI, with a plain-language warning that text goes to the other provider). Responses carry `fallbackUsed`; the UI toasts it.

## 4. Writing evaluation contract

Frontend type `WritingEvaluation` (src/types/writing.ts): provider/model/promptVersion/durationMs/fallbackUsed + `overall`, `correctedVersion`, `naturalVersion`, 7 independent `dimensions`, `sentences[]` (verbatim original, corrected, category, **kind: error|style**, English + Persian explanations, example), `vocabulary[]`, `priorities[]` (≤3), `followUpExercises[]` (≤4, rendered through the existing ExercisePlayer). No numeric scores, no CEFR claims — labeled "AI teaching feedback — not a certified assessment" in the UI.

## 5. Validation (server, `validation.mjs`)

Model output is untrusted. Hard-required: overall/corrected/natural. Sentence items not found verbatim-ish in the submission are dropped (warned in `meta.warnings`); duplicates dropped; unknown categories → `other`; unknown kind → `style` (never upgraded to `error`); arrays capped; oversized responses rejected. One bounded repair re-prompt (`AI_MAX_REPAIR_ATTEMPTS=1`), then HTTP 502 `invalid-model-output`. The learner's text lives client-side and is never modified by any failure path.

## 6. Prompts

`ai-service/prompts.mjs`, version `writing-evaluator-v1`, assembled from separated blocks (system role / schema / detail level / explanation language / learner context / task). Learner context is minimal: native language, self-reported level (explicitly labeled unverified), ≤5 recurring confirmed-error categories. No history dumps, no unrelated personal data, no secrets.

## 7. Persistence

- `writingHistory` **v2** (migration from v1: `evaluation:null` → `evaluations:[]`; text untouched; covered by tests). Evaluations append — retries never overwrite. Stored per evaluation: provider, model, promptVersion, durationMs, full structured feedback. No raw model output stored.
- `aiSettings` v1 — preferences only; a test asserts the persisted blob contains nothing credential-shaped.
- `mistakes` v1 — normalized (category, kind) records with count/recency/submission links/examples; same-submission re-evaluations don't inflate counts.

## 8. Learning intelligence

Each evaluation records one `PerformanceEvent` (skill: writing, error categories mapped from confirmed errors only, result incorrect iff ≥1 actual error). Mistake store feeds (a) the next evaluation's prompt context, (b) `buildDailyRecommendation` — recurring confirmed errors (≥2 submissions) produce an explained Writing recommendation. Style suggestions never count as errors anywhere. SkillProfile verified assessments are untouched; no CEFR is derived from anything.

## 9. Security (honest summary)

Secrets server-side only (`/etc/english-upgrade-ai.env`), loopback bind, nginx-only exposure, origin allowlist, 10 req/min/IP, 64KB body cap, 8K-char submission cap, timeouts, structured errors without stack traces, metadata-only logs. **Known limitation:** no authentication exists; origin checks are not auth. Acceptable for the current single-user deployment; multi-user requires real auth in front of the gateway (future phase, deliberately not faked). Verified: no credential values in `dist/` (one env-var *name* appears in settings help text).

## 10. Deployment

`ai-service/README.md` + `.env.example` + `nginx-location.example.conf` + `english-upgrade-ai.service.example`. Dev: `npm run start:ai` (+ Ollama running); Vite proxies `/api/ai`. Config validated at startup — the service refuses to boot with incomplete provider config.

## 11. Testing

- `npm run test:ai` — 15 gateway tests (validation, size caps, origins, provider-error mapping, hallucinated-sentence dropping, enum coercion, bounded repair → 502, no-silent-fallback, explicit fallback, no secret exposure).
- `npm run test` — 114 vitest tests (all Phase 2/3 regression + aiClient, aiSettings, mistakes, writingEvaluation, history v1→v2 migration, recommendation integration).
- `npm run test:tts` — 5/5 unchanged. `npm run build` — clean.

## 12. Known limitations

- Evaluation quality depends on the chosen model; a 7B local model produces noticeably weaker feedback than a strong cloud model. The schema validation protects structure, not pedagogical quality.
- Sentence matching is normalized-substring based; heavy model paraphrasing of quoted sentences gets items dropped (visible in warnings) rather than mis-attributed.
- One evaluation = one performance event; the skill profile's "observed" level is still never auto-derived (needs repeated observations + a future explicit policy).
- Follow-up exercises are session-only (practiced from feedback, not persisted into the SRS).
- No streaming — long evaluations show a spinner, not progressive output.

## Addendum A — Numeric answer handling

`src/services/numbers.ts`: reusable number utilities — `numberToEnglishWords` / `numberToPersianWords` (cardinals + "point"-style decimals), `englishWordsToNumber` (strict cardinal parser), `normalizeNumbersInText` (sentence canonicalization: word-cardinals → digits, thousands separators stripped, decimal points preserved), `annotateNumbers` (extracts digit AND word-form numbers for display).

Conservative by design: only clean cardinals and "point" decimals convert. Year readings ("twenty twenty"), digit lists ("one three"), and `"five and ten"` lists are **not** merged into single cardinals; ordinals/dates/times/currencies are never auto-converted — content lists those as explicit `acceptedAnswers`.

Matching: `answersMatch(target, answer, { numberEquivalence })` — opt-in per exercise type in the engine (dictation, translation, short-answer). Fill-blank and grammar-correction stay strict (the written form may be the thing being tested). Different values never match: typo tolerance is blocked whenever the digit sequences of the two answers differ ("10 minutes" ≠ "12 minutes" even at edit distance 1). Original learner text and canonical answers are never modified — normalization happens only inside the comparison. After a dictation attempt, ExercisePlayer shows each number as digits — English words — Persian, with a reading note for decimals.

## Addendum B — Exact-answer display & evaluation fix

Root cause found during the "identical answer marked wrong" investigation: `answersMatch`'s 1-edit typo tolerance meant **grammar-correction accepted the uncorrected sentence** ("I saw **an** movie" is one edit from "I saw **a** movie") — and the result UI showed only the expected answer, hiding what the learner actually typed, which made near-miss answers look like false negatives. Fixes:

- `answersMatch` option `exact: true` (no tolerance) — applied to grammar-correction.
- Exact normalized equality always wins, checked before anything else.
- Digit-difference guard (Addendum A) closes the same hole for numbers.
- ExercisePlayer always shows **Your answer** (verbatim submitted) and **Correct answer** (canonical) as separate fields, for correct and incorrect results alike; matching exercises show the learner's actual pairing instead of a placeholder.
- Regression tests: exact accepted answers (±punctuation/case), uncorrected original stays wrong, received/expected independence, repeated validations are stateless, MC chosen-label display.

Also fixed: `ai-service/config.mjs` rejected port 0, so tests silently bound the real port 8788 — collided once a dev instance was running. Ports now allow 0 (ephemeral).

## 13. Recommended Phase 5

Conversation/roleplay tutor on the same gateway (new prompt family + a `/api/ai/chat` endpoint with the same provider registry), or AI grammar-exercise generation feeding the existing grammar module schema. Conversation first — highest learning value for the stated speaking/professional goals, and the provider layer needs zero changes.
