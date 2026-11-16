# Phase 3 — Core Learning Modules

## What was built

Six-skill platform on top of the existing vocabulary app. No existing feature removed or rewritten.

### Unified Exercise Engine
- `src/types/exercise.ts` — discriminated union of 11 exercise types (multiple-choice, fill-blank, translation, sentence-ordering, matching, short-answer, listening-comprehension, dictation, grammar-correction, reading-comprehension, writing-response).
- `src/services/exerciseEngine.ts` — pure `validateAnswer(exercise, answer)`; text answers reuse the typo-tolerant `textMatch.answersMatch` the vocabulary views already used. Writing constraints (min/max words, required elements) are the only automated writing checks — explicitly not a quality judgement.
- `src/components/exercise/ExercisePlayer.vue` — one shared renderer for all types; used by Grammar, Reading, Listening. Existing vocabulary views (Quiz/Cloze/Matching/…) intentionally untouched.

### Modules (all content under `public/data/<module>/`, never inside components)
| Module | Route | Content | Progress model |
|---|---|---|---|
| Grammar | `/grammar` | 7 topics (A1–B2), 42 exercises, Persian explanations | Topic-level SM-2 via existing `spacedRepetition.ts`; mastered = 3 consecutive passed sessions (pass ≥ 70%) |
| Reading | `/reading` | 3 passages (A2 dialogue, B1 article, B2 professional email) | performance events |
| Writing | `/writing` | 6 prompts (journal → technical) | submissions persisted in `writingHistory` store (versioned v1) |
| Listening | `/listening` | 3 activities (dictation, doctor dialogue, standup) | performance events |
| Guided Speaking | `/guided-speaking` | 3 topics (repeat + open steps) | repeat steps scored by transcript match; open answers recorded, never graded |

Honesty rules enforced in UI copy and code comments:
- Reading/Listening translations+transcripts hidden until after the attempt.
- Speaking scores labeled "transcript match", not phoneme-level pronunciation.
- Writing feedback limited to objective constraints; `WritingEvaluator` interface (`src/types/writing.ts`) is the provider-independent contract for the future AI service — no fake AI responses.

### Performance tracking
- `src/types/performance.ts` + `src/stores/performance.ts` (versioned v1, capped at 2000 events).
- All five module views record `PerformanceEvent`s (skill, activityId, lessonId, difficulty, result, errorCategories, confidence).
- Feeds observed summaries only; never writes CEFR levels, never touches verified assessments.

### Recommendations
`buildDailyRecommendation` priority order: ① due vocab reviews ② due grammar topics ③ repeated mistakes ④ weak skills (needs ≥10 observed events, accuracy < 70%) ⑤ uncovered goals ⑥ hard words. Budgeted against profile study duration; every activity carries its reason. Dashboard shows "Continue learning" CTA (top recommendation), full list, and recent mistakes.

### Navigation
Sidebar grouped: Dashboard/Daily Session · Skills (Grammar, Listening, Guided Speaking, Reading, Writing) · Vocabulary (all pre-existing views) · Me (Skill Levels, Profile). Nav scrolls; speech settings pinned at bottom.

## Cleanup
`src/data/` (373-file stale duplicate of `public/data/`, referenced by nothing) removed from git and disk. `public/data/` is the single runtime content source (also noted in README).

## Tests
`rtk proxy npx vitest run`: **91 passed / 15 files**. `npm run test:tts`: 5/5. `npm run build`: clean.

Notable: `tests/contentIntegrity.test.ts` validates every shipped exercise structurally AND feeds each exercise its own canonical answer through the engine — content/engine drift fails CI-style.

## Known limitations
- Content volume is deliberately small (quality-first starter curriculum); schema supports growth without code changes.
- Listening audio is TTS-generated (existing neural/system voices), not recorded native audio.
- Matching validation assumes pair order = answer key (right side shuffled for display only).
- No AI evaluation anywhere yet — Phase 4 scope.
- Speaking open answers produce no correctness signal by design.

## Next phase recommendation
Phase 4 (AI Tutoring): implement a provider adapter (mirroring `services/speech.ts`) and plug it into the already-defined `WritingEvaluator` interface first — writing feedback is the highest-value, lowest-risk AI integration, with conversation/roleplay after.
