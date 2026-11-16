# Premium learning UI — Learn vs Practice

## Audit (before)
- Learn = `LessonView` → one `WordCard` per word, stacked (50-word lesson = 50 identical cards). Each card carried up to 5+ 🔊 buttons (word, Persian meaning, every example, mini-context), an emoji, a ⭐, and a click-outside popover that could overflow narrow screens.
- Book-page images (230–575 KB each) loaded eagerly above the words.
- Practice shared Learn's white-card / black-button language; ExercisePlayer used emoji result marks.
- Real-Life scenarios were emoji icons; its Learn step repeated the stacked-card pattern.
- No design tokens; everything was `gray-*` + `bg-black`.

## Two modes, two languages
| | LEARN | PRACTICE |
|---|---|---|
| Surface | warm paper `#faf8f3`, serif display type | cool workspace `#f3f5fa`, sans |
| Accent | teal | indigo |
| Behaviour | explanation first, everything visible, free navigation both ways, audio on demand, no scoring/timers/inputs | task first, answer hidden until Check, feedback after, outcome-coloured progress, one task at a time |
Tokens live in `src/style.css` (`@theme`). No external fonts/CDN; type resolves to system faces.

## Components (`src/components/learn`, `art`, `practice`)
`LearnStage` (composition) · `LessonHeader` · `LessonProgress` · `ExpressionPresentation` · `AudioPlayer` · `ContextualExample` · `UsageNote` · `VocabularyPopover` · `LessonNavigation` · `LearningIllustration` · `PracticeProgress` · `AppIcon`.
`LearnStage` serves vocabulary lessons **and** the Real-Life Learn step through the `LearnItem` adapter (`services/learnItems.ts`, unit-tested).

## Reused, not rebuilt
TTS/speech settings (`speakAsync`, saved rate, Persian pre-recorded audio) · Hard Words store (vocabulary Save) · saved-expressions store (Real-Life Save) · SM-2 (`recordCorrect/recordWrong`, unchanged) · `answersMatch` · `ExercisePlayer` logic (restyled only) · all routes. Optional `?w=<n>` on a lesson URL resumes a position; invalid values fall back to the first expression.

## Illustrations
Inline SVG (no files, no CDN): 10 scenario scenes (one per Real-Life scenario) plus a deterministic abstract cover seeded by lesson id. Oxford book pages load only on "Book page".

## Known limits
- Vocabulary lesson data has no usage notes / common-mistake fields, so those sections appear only where content exists (Real-Life `note`). The `LearnItem` model and `UsageNote` support them when authored.
- Many vocabulary example sentences are templated; the UI can't fix content quality.
- Persian type uses system faces (Vazirmatn/Noto if installed, else Tahoma/Segoe UI); no font file is bundled.
- Not redesigned: Dashboard, Cloze/Matching/Quiz/Listen views, Journey/Career shells, sidebar.

---

# Product-wide unification (Phase 8.3)

## Design system (`src/style.css`)
- **Modes** via `data-mode` (set per route by `router/modes.ts`): `overview` navy · `learn` teal · `practice` indigo · `career` bronze. Semantic utilities (`bg-accent`, `text-accent-ink`, `ring-accent/30`, `bg-accent-soft`, `bg-surface`) resolve to the section's identity, so a screen never hard-codes a colour.
- **Neutrals/status remapped globally**: legacy `gray-*`/`black`/green/red/amber/blue now resolve to the ink scale and refined status tones; shadows softened. Every old utility class inherits the new look.
- **Components** (`@utility`): `btn`, `btn-primary|secondary|ghost`, `btn-lg`, `field`, `chip`, `choice(-correct|-wrong|-selected)`, `surface`, `eyebrow`, `label`, `skeleton`.
- **Shared Vue pieces**: `PageHeader`, `StateBlock` (loading/empty/error), `BottomSheet` (the one dialog pattern), `AppIcon` (≈45 SVG icons, no emoji), `ActivityPage`, `LessonPicker`, `ActivityBar`, `ActivityResult`, `AnswerFeedback`, `ItemList`, `ExerciseSession`, `LearningIllustration`.
- **Type**: serif display (Learn/Dashboard/Journey/Courses), sans (Practice/Career), one base `h1`, Persian via `.fa-text` (RTL, 1.9 leading). **Touch**: on coarse pointers every control in `main` is ≥ 44px.
- **Navigation**: sidebar grouped Today / Learn / Practice / Speak & write / Career / Me with per-section colour, SVG icons, `aria-current`, active item scrolled into view, voice settings collapsed, scroll-locked mobile drawer; route-aware document titles; scroll restoration that waits for async lists; skip link and focus-to-content on in-app navigation; a real Not Found screen.

## Route inventory (final state)
| Route | Mode | Final state |
|---|---|---|
| `/` Dashboard | overview | **Rewritten**: journey hero + resume, due reviews, continue lesson (new `learningPosition` bookmark), recommendation, progress, activity feed |
| `/daily-journey` | overview → practice while running | **Redesigned**: intro with stage flow, timeline roadmap, activity stepper + stage tags, stat-tile summary (planner/evidence untouched) |
| `/session`, `/review`, `/hard-words`, `/listen-repeat`, `/speaking-practice`, `/guided-speaking`, `/writing` | practice | **Migrated** (accent, buttons, controls, headings, icons, empty states); layouts not restructured |
| `/quiz`, `/cloze`, `/matching`, `/listen-guess` | practice | **Redesigned** on shared activity components |
| `/grammar`, `/reading`, `/listening` | practice | **Redesigned** (grouped lists, editorial reading/explanation panes, shared exercise session/result) |
| `/practice` | practice | Redesigned previously (8.2) |
| `/lessons`, `/courses/:id` | learn | **Rewritten**: cover cards, progress from the existing store, filter, no book-page thumbnails |
| `/courses/:id/lessons/:id` | learn | Redesigned previously (8.2) |
| `/real-life` | learn / practice per step | 8.2 + step-bar and practice steps in Practice mode |
| `/career-english` | career | **Migrated + icon badges**; STAR builder, questions and mock interview keep their logic (language vs content feedback unchanged) |
| `/conversation` | practice | **Migrated** (bubbles/corrections/voice control restyled, mic icon); setup grid not restructured |
| `/skills`, `/profile`, `/ai-settings` | overview | **Migrated** (controls, headings, touch targets) |
| `*` | overview | **New** Not Found screen |

## Content coverage (6,858 vocabulary entries, 7 courses)
| Course | Words | Examples | Examples templated* | Mini-context templated | Synonyms | Usage notes | Common mistakes |
|---|---|---|---|---|---|---|---|
| English Upgrade | 470 | 3 each | 82% | 37% (varied openings) | 79% | 0 | 0 |
| English Hard | 270 | 3 each | 100% | **100% (one template)** | 100% | 0 | 0 |
| English Very Hard | 270 | 3 each | 100% | **100%** | 100% | 0 | 0 |
| 504 Essential | 504 | 3 each | 100% | **100%** | 0% | 0 | 0 |
| Oxford Elementary | 1,958 | 1 each | 3% | 1% | 9% | 0 | 0 |
| Oxford Intermediate | 1,444 | 1 each | 2% | 1% | 14% | 0 | 0 |
| Oxford Upper/Adv. | 1,942 | 1 each | 2% | 2% | 11% | 0 | 0 |
\*share of examples whose first four words belong to the 10 most common sentence frames.
Real-Life: 96 expressions, 96 examples, 25 with a usage note. No vocabulary entry anywhere has a usage note or common-mistake record, so those Learn sections render only for Real-Life.

**Recommended staged enrichment** (human-reviewed; nothing generated blindly):
1. **Replace the templated content first** (Hard, Very Hard, 504: 1,044 words whose context is one fixed sentence; Upgrade's examples): author varied, real sentences. It is the largest quality gap and needs no new fields.
2. **Add `usage` / `mistakes` fields (already supported by `LearnItem`/`UsageNote`) to the highest-frequency, highest-confusion words** in the Oxford courses (genuine examples already exist): start with ~100 words, ranked by SRS misses from real use.
3. **Real-Life notes**: extend from 25/96 to all 96 (smallest, fastest win).
4. **Extend Oxford examples to ≥ 2 per word**, then Persian-learner "false friend" notes.
5. Tooling: a lint that fails CI when a course exceeds a templating threshold; AI-drafted notes only through the existing gateway with a review queue.

## Persian typography
Installed locally: Noto Sans/Naskh/Kufi Arabic. License verified from the package metadata (`fonts-noto-core` copyright, `Files: *` → **SIL OFL-1.1**, Google). Vazirmatn (named first in the stack) is **not installed here and its license was not verifiable offline**, so it is not recommended yet. **Recommendation:** if a bundled font is wanted, ship **Noto Sans Arabic**, *subset to the Persian/Arabic block + ZWNJ and converted to woff2*, regular + bold, with the OFL text alongside. The unsubsetted TTF is 238 KB; the subset size was **not measured** (no `fonttools` in this environment), so decide after measuring. Not bundled in this phase: current system stack degrades to Tahoma/Segoe UI.

## Known remaining inconsistencies
- The "migrated" screens share colour, buttons, controls, headings and icons, but their *layouts* (long forms, bordered card stacks in Writing/Profile/Review/Session/Conversation setup/Career inner screens) are not restructured.
- Journey activity bodies and several Career/Conversation sub-screens still use their original layouts.
- `ExercisePlayer` takes its accent from the page mode (indigo in Practice, teal under Real-Life Learn).
- Lesson covers are abstract seeded art, not topic illustrations (only Real-Life has scenario scenes).
