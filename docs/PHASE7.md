# Phase 7 — Daily Learning Journey

`/daily-journey` is the central daily experience: pick Quick (~5 min) / Standard (~18) / Extended (~40), get a personalized, coherent session of 2–6 micro-activities, finish with an honest summary. The dashboard leads with it; every existing module stays open.

## Architecture

```
JourneyView (/daily-journey)         start + roadmap → runner → summary; auto-resume from store
 ├─ journeyContent.ts                snapshot loader: vocabulary / grammar / real-life themes / listening / career — each source OPTIONAL
 ├─ journeyPlanner.ts   (PURE)       deterministic, explainable plan
 ├─ journeyEvidence.ts  (PURE)       stage classification, effort score, summary, PerformanceEvent mapping
 ├─ roadmap.ts          (PURE)       7 thematic stages, evidence + content-availability gating
 └─ stores/journey.ts   (versioned)  active session (resume), history (no-repeat memory), stage evidence
Reused untouched: wordProgress + spacedRepetition (SM-2), performance, mistakes, grammarProgress, ExercisePlayer, SpeechButton, speech recognition, Real-Life/Career/Conversation modules.
```

## Planner rules (documented, tested, deterministic: same input → same plan)

- **R1** Due SRS words first (retention before novelty), capped per length.
- **R2** One coherent daily **theme** = a Real-Life scenario: not recently completed; ties broken by overlap with due words, then manifest order. No theme → vocabulary/grammar-driven session with an explanatory note.
- **R3** Stage balance: recognition is a warm-up only; plans include recall (and production for Standard/Extended). A recognition-only plan is flagged in `notes`, never presented as balanced.
- **R4** Recurring mistakes / due grammar topics / weak skills (≥10 observations, <70%) bias toward grammar-in-context; each activity carries a plain-language `reason`.
- **R5** No-repeat: completed activity source ids, exercise ids and new words from the last 6 journeys are skipped. Skipped activities don't count as practiced.
- **R6** Speaking activities only when the Speaking preference is on. **R7** Empty/missing sources never throw. **R8** Extended **reserves** slots for roleplay/career hand-offs (a unit test caught optional grammar/dictation crowding them out).

## Learning-stage evidence model (the central change)

`PerformanceEvent` is stage-blind, so journeys write a separate versioned `journey` store whose records carry `stage` (recognition | recall | production | fluency), `independent`, `hintsUsed`, `modality` (selected | typed | voice) and `completeness`:

| Activity | Stage | Notes |
|---|---|---|
| Choose from options | recognition | never independent |
| Typed retrieval, no options | recall | hint → still recall but **not** "independent" |
| Learner-written sentence | production | "correct" = ≥4 words AND uses a target expression — it does **not** claim grammatical correctness |
| Spoken sentence | fluency | voice modality is the **only** way to evidence Speaking; transcript match ≠ pronunciation |

Journeys also emit ordinary PerformanceEvents (`performanceEventFor`) so skill summaries/recommendations keep working. **Typed evidence can never map to a speaking event** (unit-tested and browser-verified: a full typed journey left zero speaking records in both stores).

**Effort score** (replaces accuracy-style XP): recognition 1, recall 3, production/fluency 4 points; wrong attempts still earn ⌈⅓⌉ of that; hints subtract. Ten easy MC hits ≈ less than three independent recalls plus a sentence. **Response speed is never used.**

**SRS integration**: retrieval calls the existing `recordCorrect/recordWrong`; a hint-assisted success is scheduled as a miss (honest retention signal). No second scheduler; SM-2 reference values asserted unchanged.

## Roadmap

Everyday Foundations → Daily Communication → Natural Conversations → Social English → Professional Communication → Career & Interviews → Advanced Fluency. **Milestones, not CEFR.** A stage completes on demonstrated evidence (independent recalls, sentences built, spoken attempts, completed journeys) — hinted recalls don't count — never elapsed days. A stage whose content doesn't exist (Advanced Fluency) shows **content coming**, not a fake path. Nothing blocks any module.

## Verification actually run
- vitest **309/309** (35 files, after pre-commit stabilization fixes) incl. planner determinism/empty-content/length/no-repeat/stage-balance, evidence/roadmap, store resume/no-repeat/migration, SRS-unchanged regression.
- Browser (Chromium emulation, mobile 390px + desktop): full journey → summary, stages recall/production/recognition recorded, no speaking evidence from typed work, reload mid-journey → resume restores the same plan, all existing modules reachable.
- ai-service / assessment / tts suites and build: see final report.

## Known limitations
- Roleplay and Career activities are **hand-offs** into their own modules ("mark complete" is learner-confirmed — no fabricated evidence for work done elsewhere). Fluency evidence in-journey therefore comes only from voice speaking activity.
- Voice flows verified by logic only (headless Chromium has no recognizer); the speaking step degrades honestly to "read aloud, no evidence".
- Sentence production is checked for length + target-expression use only; grammatical quality needs the AI writing evaluator (not wired into journeys in v1 to keep sessions offline-capable).
- Roadmap thresholds are heuristic starting values, not calibrated.
- Daily theme uses Real-Life scenarios only (10); a larger scenario pool improves variety.

## Deployment / migration
No migration needed: new store key `english-upgrade-journey` (v1) is created on first use; existing keys untouched. Requires `public/data/real-life/` and `public/data/career/` deployed (journeys degrade gracefully if absent).

## Pre-deployment stabilization fixes
- **Real-Life deep links:** `/real-life?scenario=<id>&step=<see|learn|practice|speak|use>` is validated against the real manifest (`realLifeRoute.ts`). Unknown scenario → generic home; unknown/missing step → `see`; `done` is not a valid entry step. Works on refresh/direct link; closing the scenario clears the query so a refresh does not reopen it.
- **Real-Life speaking evidence:** `evaluateRealLifeSpeaking` reuses `checkPronunciation` and the shared `SPEAKING_PASS_SCORE` (80, also used by Guided Speaking). Only a voice transcript creates a speaking event; `correct` only at/above the threshold.
- **MessageBubble errors:** fixed code-keyed messages via `describeAIError` (`aiErrorMessages.ts`); `err.message` is never displayed.
