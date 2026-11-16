# Phase 6.2 — Adaptive Assessment Core Engine

## 1. Architecture

```
(future UI) ─▶ assessmentClient.ts ──HTTP /api/assessment/*──▶ ai-service/assessment/
                                                                 ├─ routes.mjs     HTTP module (provider-independent)
                                                                 ├─ engine.mjs     PURE: selector + evidence + CEFR ladder
                                                                 ├─ scoring.mjs    answer checking + item sanitization (keys live here)
                                                                 ├─ sessions.mjs   file-backed authoritative session state
                                                                 └─ banks/*.json   item banks WITH canonical answers (server-only)
stores/assessments.ts   client mirror: history + results only (no keys, versioned v1)
src/services/assessmentItemSelector.ts · cefrEstimator.ts · assessmentScoring.ts
    → typed re-exports of engine.mjs (single implementation, vitest-tested)
```

**Single-source engine**: the pure algorithms live once in `ai-service/assessment/engine.mjs` (the server must run them authoritatively); `engine.d.mts` gives them full TypeScript typings so the `src/services` wrappers and vitest exercise the *same* code — no hand-kept port.

## 2. API contracts

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/assessment/start` | POST | `{skill, kind: placement\|skill-check, selfReportedLevel?}` → `{sessionId, item, progress}` |
| `/api/assessment/session/:id/next` | GET | Idempotent pending item fetch |
| `/api/assessment/session/:id/answer` | POST | `{itemId, answer, timeSpentMs?}` → `{correct, item (next), progress}` — itemId MUST equal the server-selected pending item |
| `/api/assessment/session/:id/pause` / `resume` | POST | Pause blocks answering; resume returns the same pending item |
| `/api/assessment/session/:id/complete` | POST | Force-complete (early completion ⇒ insufficient evidence) |
| `/api/assessment/session/:id/result` | GET | 409 until completed; then administered summaries + `SkillEstimateResult` |

Progress = `{answered, budget (18), done}`. Sessions survive service restarts (atomic JSON-per-session files in `ASSESSMENT_STATE_DIR`).

## 3. Server/client responsibilities & answer-key security

Server-only: item banks with `acceptedAnswers`/`correctIndex`, item selection, scoring, presentation shuffles, estimation. Client receives sanitized items: choice options included (part of the question), **correctIndex stripped, acceptedAnswers stripped, sentence-ordering segments and matching right-columns deterministically shuffled server-side** (seeded per session+item; the mapping stays server-side and answers are submitted in displayed indexes). Text-answer checking mirrors practice rules (normalization, 1-edit tolerance except grammar-correction, digit guard); number-WORD equivalence is NOT ported — banks must list "ten"/"10" variants explicitly (bank-authoring requirement for 6.3). Only the pending item may be answered; arbitrary/unknown item ids are 400s. Tests sweep every response for `acceptedAnswers|correctIndex|canonical answer text`.

**Security boundary (unchanged from Phase 4, stated honestly):** no authentication exists; origin allowlist + per-IP rate limit (60/min for assessment) + loopback bind behind nginx are abuse dampeners, not auth. Single-user deployment accepts this; multi-user REQUIRES real authentication in front of the gateway plus per-user session ownership checks (currently any client reaching the service could resume any session id it guessed — ids are UUIDv4, unguessable in practice, but that is obscurity, not authorization).

## 4. CEFR estimation & confidence

Transparent level ladder (`engine.mjs`), deliberately not IRT — items are hand-levelled and uncalibrated; implying psychometric precision would be dishonest. Rules: a level needs ≥6 answered items of ≥2 types to count; ≥70% holds it, <40% fails it, between = borderline; **untested/under-sampled levels are unknown, never failed**. Estimate = highest held level. Confidence: base 0.5, +0.1 each for ≥9 items / ≥3 types / failed level above (clear ceiling), −0.15 borderline above, −0.1 untested above ("floor, not ceiling" note), −0.1 near-boundary accuracy; clamped to [0.2, 0.8] — internal estimates never exceed 0.8. Insufficient evidence ⇒ `level: null` + `evidenceQuality: insufficient`, never a guess. Every result carries the "not a certified CEFR examination" note (both branches — a test caught the insufficient branch missing it).

**Interpreting confidence**: an ordinal heuristic, not a probability. 0.6–0.8 = consistent evidence with a tested ceiling; 0.4–0.6 = plausible but thin; ≤0.4 = barely better than the self-report.

## 5. Adaptive selection

Start at self-reported level (B1 documented fallback) · two-in-a-row correct/wrong steps up/down (clamped A1–C2) · least-answered-type-first at the current level for coverage · no repeats in-session · cross-session exposure (last 5 completed sessions per skill) avoided softly — exposed items return only when the fresh pool is empty · neighbour-level fallback when a level is exhausted (down before up) · all ties broken by item id → fully deterministic · terminates at the 18-item budget or bank exhaustion. AI generates nothing during scored assessments.

## 6. Session lifecycle

`active → paused ⇄ active → completed` (answer/pause only when active; resume only when paused; complete any time; everything 409s afterwards). Client store (`assessments.ts`, v1) mirrors history: answer summaries (itemId/level/type/correct/time) + final results, append-only, 50-session cap, per-item dedup; tested to contain nothing answer-key-shaped and to never touch SRS storage.

## 7. Future content-bank requirements (Phase 6.3)

Banks at `ASSESSMENT_BANKS_DIR/<skill>.json` as `{skill, items: AssessmentItem[]}`: unique stable ids, exactly ONE `cefrLevel` per item (no ranges), ≥2 item types per level, ≥8–10 items per level per skill for credible placement (budget 18 spans ~3 levels), digit/word numeric variants listed explicitly, listening items via `audioText` (TTS), reserved items never shown in practice modules. C1/C2 content must be authored — none exists anywhere yet.

## 8. Test coverage

- vitest `assessmentEngine.test.ts` (21): stepping, clamps, coverage, no-repeat, soft exposure, exhaustion fallback, budget termination, determinism, evidence verdicts (untested ≠ failed), ladder boundaries, confidence ordering + cap, insufficient evidence, quality grades.
- vitest `assessments.test.ts` (8): history, dedup, no-overwrite, resume detection, persistence, migration, key-shape sweep, SRS untouched.
- `npm run test:assessment` (8): full HTTP session, server-side scoring incl. shuffled ordering round-trip, pending-item enforcement, arbitrary-id rejection, malformed session ids, pause/resume/complete lifecycle, forced-early-completion ⇒ null level, key non-disclosure sweep on every response.
