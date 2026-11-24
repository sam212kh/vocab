# Cloze Exercise Quality Audit

Date: 2026-11-24

## 1. How Cloze exercises are built

There is no standalone Cloze dataset. `src/views/ClozeView.vue` (`buildQuestion`)
takes a lesson's vocabulary words (loaded via `src/services/vocabulary.ts` from
`public/data/**/*.json`) and, for each word, scans `word.examples[]` for the
**first** example whose English sentence contains the word's headword
(`word.word`, parenthetical sense stripped) as a literal, case-insensitive,
whole-word match (`\bheadword\b`). That example becomes the blank; its
`persian` field is shown as the translation hint.

Consequences:

- Cloze quality is 100% inherited from the vocabulary lesson's `examples[]`.
  There are no Cloze-specific sentences, templates, or generation scripts.
- Because matching is literal-substring, every example that's meant to work
  as a cloze **must contain the exact base form of the headword**, unmodified
  (no `-s`/`-ed`/`-ing`). This is a real technical constraint any rewrite must
  respect, not just a style preference.
- `examples[]` is also shown in the plain vocabulary lesson view, so these
  sentences are shared between Cloze and Lessons — fixing the source fixes
  both surfaces at once (Phase 9 integration requirement).

## 2. Repository-wide scan

Script-scanned every content file under `public/data/**/*.json` (9,886 example
sentences across 6,858 words) for: (a) membership in a set of known generic
sentence templates, (b) Persian translations that still contain the literal
English headword untranslated.

| Course | Files | Templated examples | Untranslated-Persian examples |
|---|---|---|---|
| **English Upgrade** (`batch-01`…`batch-12`) | 12 | **729 / 1,221** | **901 / 1,221** |
| 504 (`504/lesson-*.json`) | 42 | 0 | 0 |
| English Hard (`hard/batch-*.json`) | 9 | 0 | 0 |
| English Hard v2 (`hard-v2/batch-*.json`) | 9 | 0 | 0 |
| Oxford (elementary/intermediate/upper-advanced) | 300 | 0 | 7 (minor, see §5) |

**Finding: the entire quality problem is isolated to the English Upgrade
course.** Every other course's example sentences are naturally authored and
pass both checks cleanly.

## 3. English Upgrade, file by file

| File | Words | Examples | Templated | Untranslated FA | Missing `pos` |
|---|---|---|---|---|---|
| batch-01.json | 50 | 150 | 150 (100%) | 150 (100%) | 0 |
| batch-02.json | 50 | 150 | 150 (100%) | 150 (100%) | 0 |
| **batch-03.json** | 36 | 108 | 0 | 4 (minor) | 0 |
| **batch-04.json** | 39 | 117 | 0 | 3 (minor) | 0 |
| batch-05.json | 39 | 117 | 117 (100%) | 117 (100%) | 0 |
| batch-06.json | 39 | 117 | 117 (100%) | 117 (100%) | 0 |
| batch-07.json | 39 | 117 | 117 (100%) | 117 (100%) | 0 |
| batch-08.json | 39 | 117 | 39 (33%) | 0 | 39 (100%) |
| batch-09.json | 39 | 117 | 39 (33%) | 0 | 39 (100%) |
| batch-10.json | 35 | 105 | 0* | 105 (100%) | 0 |
| batch-11.json | 35 | 105 | 0* | 105 (100%) | 0 |
| batch-12.json | 30 | 90 | 0* | 30 (33%) | 0 |

\* batch-10/11/12 use a *different* generic template family (not caught by
the same regex set used for the table above, see §4c) — they are just as
broken, only the specific frame sentences differ.

**Only batch-03 and batch-04 are genuinely good content.** The other 10 files
(375 words, 1,134 examples) need real rewrites.

## 4. Representative problems found

### 4a. Mechanical template insertion (batch-01, 02, 05, 06, 07)

Every one of these words gets the *same three* frame sentences with the
headword dropped in, regardless of its part of speech or meaning:

```json
{
  "word": "accurate",
  "pos": "adjective",
  "examples": [
    ["The team discussed accurate before deciding what to do next.",
     "تیم قبل از تصمیم‌گیری درباره قدم بعدی، درباره accurate صحبت کرد."],
    ["I can explain accurate clearly when I connect it to a real situation.",
     "وقتی accurate را به یک موقعیت واقعی مرتبط کنم، می‌توانم آن را واضح توضیح دهم."],
    ["In a backend project, accurate can matter when the system faces real production problems.",
     "در یک پروژه بک‌اند، وقتی سیستم با مشکلات واقعی محیط عملیاتی روبه‌رو می‌شود، accurate می‌تواند مهم باشد."]
  ]
}
```

Problems: "discussed accurate" / "explain accurate" / "accurate can matter"
treat the adjective as if it were a noun — the sentences are not just
unnatural, they are **ungrammatical**. The Persian side doesn't translate
"accurate" at all; it's copy-pasted verbatim into an otherwise-Persian
sentence, so a learner reading the translation never sees the Persian word
for "accurate".

Top recycled frames found (count = how many words share that exact frame,
word substituted):

| Count | Frame |
|---|---|
| 117 | "The team discussed **X** before deciding what to do next." |
| 117 | "I can explain **X** clearly when I connect it to a real situation." |
| 100 | "I've learned to use **X** naturally when I talk about everyday situations." |
| 100 | "In a real software project, **X** can make a noticeable difference when the team is solving a difficult problem." |
| 99  | "During the meeting, she used **X** to explain her point and give the team a clearer direction." |
| 78  | "In a backend project, **X** can matter when the system faces real production problems." |
| 78  | "The team discussed **X** before making the final decision." |
| 78  | "I can explain **X** more clearly when I connect it to a real situation." |
| 78  | "In a backend project, **X** can affect how the system behaves in production." |

### 4b. Same bug, partial (batch-08, batch-09)

Same frame family, but only 1 of each word's 3 examples is templated; the
other 2 happen to be genuine sentences. `pos` is also empty for every word in
these two files (100%), so part-of-speech-dependent validation can't run on
them at all.

### 4c. Different template family, Persian hedges instead of translating (batch-10, batch-11)

```json
{
  "word": "lending", "pos": "noun",
  "examples": [
    { "english": "The team discussed lending during the backend design review.",
      "persian": "تیم در جلسه بررسی طراحی backend درباره «lending» صحبت کرد." },
    { "english": "Understanding lending is useful for senior backend engineers.",
      "persian": "درک مفهوم «lending» برای مهندسان ارشد backend مفید است." },
    { "english": "We need to consider lending before making the final decision.",
      "persian": "قبل از تصمیم نهایی باید «lending» را در نظر بگیریم." }
  ]
}
```

Here the English frames are at least grammatical (they treat every word as a
noun, so this breaks for the many verbs/adjectives in these files), but the
Persian never translates the headword — it just quotes the English word
inside Persian guillemets. A Persian-speaking learner gets no actual
translation.

### 4d. Low-content template family (batch-12)

```json
{
  "word": "counter-offer",
  "examples": [
    ["She received a counter-offer after announcing that she was leaving.", "..."],
    ["The meaning of counter-offer depends on the situation.", "معنی «counter-offer» به شرایط بستگی دارد."],
    ["This word is useful in professional conversations.", "این واژه در مکالمات حرفه‌ای کاربرد زیادی دارد."]
  ]
}
```

First example is fine; the other two are filler that teach nothing about the
word ("the meaning depends on the situation" / "this word is useful in
conversations" could be appended to literally any word, and the third
doesn't even use the headword, so it's also useless as a cloze source).

### 4e. Minor, batch-03/batch-04 (not mechanical, stylistic only)

7 examples keep an English technical term capitalized inside an otherwise
Persian sentence (`"سیستم Data Integrity را حفظ می‌کند."`). This is a
defensible style choice for backend-vocabulary content (Iranian developers
commonly keep terms like *Query*, *Performance* in English) and is not part
of the mechanical-template bug — flagged for optional polish, not a rewrite
priority.

### 4f. `miniContext` is also templated

`miniContext` in the 10 broken files follows 2–3 recycled paragraph shapes
("In a professional backend environment, **X** is part of the language
engineers use when discussing real systems, requirements, implementation,
and production concerns...") and needs rewriting alongside `examples[]`.

## 5. Answers to Phase 1's specific questions

- **Manually authored or generated?** Generated — mechanically, by inserting
  the bare headword into a small fixed set of template sentences. Confirmed
  by exact-string frame reuse across hundreds of unrelated words.
- **Copied from vocabulary lessons?** No separate copy exists — Cloze reads
  the lesson's own `examples[]` directly, so the vocabulary lesson view shows
  the exact same broken sentences.
- **Persian independently authored or mechanical?** Mechanical. Either the
  headword is left untranslated verbatim (batch-01/02/05/06/07), quoted
  as-is in guillemets (batch-10/11), or replaced with a vague placeholder
  ("این موضوع" / "این مفهوم" — "this issue/concept") that doesn't attempt
  translation at all.
- **Repeated sentence patterns across exercises?** Yes — see the frame table
  in §4a; a handful of frames account for 729 of the 1,221 broken-course
  examples.

## 6. Scope for remediation (as audited)

Rewrite target: **375 words / 1,134 examples / 375 miniContexts** across
`batch-01, 02, 05, 06, 07, 08, 09, 10, 11, 12`. `batch-03` and `batch-04` are
left untouched except for the 7 minor jargon-casing spots noted in §4e,
which are optional.

Two more courses turned out to have the identical bug and were brought into
scope mid-session after discovery (see §7):

- **504 Absolutely Essential Words** (42 files, 504 words) — same bug,
  different template family, confirmed clean by the first scan only because
  that scan's regex was English-Upgrade-specific.
- **English Hard** and **English Very Hard** (18 files, 540 words) — this is
  where the exact sentence from the original bug report lives (`"His
  abundant approach helped him handle the situation calmly."`), also missed
  by the first scan for the same reason.

## 7. Remediation performed

All of the following was done directly against the content files (no
template/generator changes — Phase 8 of the project brief forbids
mechanical regeneration, so every sentence below was individually authored):

| Course | Files | Words rewritten | Examples rewritten | miniContexts rewritten | `pos` filled/corrected |
| --- | --- | --- | --- | --- | --- |
| English Upgrade | batch-01,02,05-12 | 375 | 1,125 | ~270 (where the field existed) | 78 (batch-08/09) |
| English Upgrade (miniContext only) | batch-04 | 39 | 0 (already good) | 39 | 0 |
| 504 Absolutely Essential Words | lesson-01..42 | 504 | 1,512 | 504 | 504 |
| English Hard | batch-01..09 | 270 | 810 | 270 | 0 (already correct) |
| English Very Hard | batch-01..09 | 270 | 810 | 270 | 20 corrected (mislabeled, see below) |
| **Total** | **71 files** | **1,458** | **4,257** | **1,353** | **602** |

Additional targeted fixes (not full rewrites):

- 7 Persian translations fixed in `batch-03`/`batch-04` (English Upgrade) and
  `oxford/upper-advanced` units 01/27/56, where the English headword was left
  untranslated or quoted instead of translated (§4e).
- 20 `pos` corrections in English Very Hard where the field was simply wrong
  (tagged `adjective` for words that are actually nouns/verbs — `alacrity`,
  `contention`, `corroborate`, `daunt`, `debilitate`, `disdain`, `disparage`,
  `duplicity`, `equanimity`, `equivocate`, `evince`, `harangue`, `maverick`,
  `meander`, `plethora`, `proponent`, `temerity`, `affront`, `ameliorate`,
  `conundrum`). Discovered because "adjective" was suspiciously dominant
  (19-28 of 30 words per file) across every English Very Hard batch; `hard`
  (non-"v2") was checked and found to genuinely group words by part of
  speech per batch, so it needed no correction.
- 1 Cloze-boundary fix: `504/lesson-14.json`'s `rival` had its first example
  use the plural "rivals" (fails the app's literal whole-word match); reordered
  so the singular example is first.

Ambiguous/dual-sense words where the content-authoring agents made and
recorded a judgment call (not left broken, but worth a human glance):
`commit`, `substitute`, `yield`, `integrity`, `persistent`, `molest`,
`amateur`, `challenge`, `lack`, `rage`, `frequent`, `menace`, `decrease`,
`appropriate`, `panic`, `harvest`, `disdain`, `affront` — roughly 18 words.

## 8. Flagged for human review (not fixed — outside this task's scope)

- **`hard/batch-02.json` and `hard/batch-05.json`**: every single word's
  `synonyms` array is the literal placeholder `["similar", "related"]` — a
  separate, pre-existing data bug (not a sentence-quality issue), affecting
  60 words. Left untouched since the task scope was examples/Persian/
  miniContext, not synonyms.
- **~1,399 words, overwhelmingly in the three Oxford courses**: no example
  sentence contains the exact headword as a literal substring (common for
  multi-word/phrasal entries like "pull out", "look forward to"), so
  `ClozeView.vue`'s literal-substring matching can never build a blank for
  them — they simply never appear in Cloze. The content itself is fine; this
  is a matching-logic limitation in the Cloze feature, not a content defect,
  so it wasn't rewritten. Fixing it would mean either relaxing the match (e.g.
  matching the first word of a multi-word headword) or authoring an
  additional single-word-safe example per affected entry — an engineering
  decision outside this content pass.
- **8 `example-template-repeated` flags in Oxford Elementary** (units 06, 08,
  26, 35, 47, 69): legitimate pedagogical pattern-practice for numbers, ages,
  months, foods and professions ("She is ___ years old.", "I have ___
  books."). Reviewed and accepted — not the templating bug.
- **1 pre-existing `cefr-inconsistent` warning**, unrelated to this task.

## 9. Automated quality gate (Phase 10)

Extended `src/services/contentValidation.ts` (the project's existing
deterministic content validator, run via `npm run validate:content`) with
five new checks, all vocabulary/Cloze-specific:

- `pos-missing` (warning) — word has no part of speech.
- `example-sentence-empty` / `example-persian-missing` (error) — empty
  English sentence, or a Persian field with no Persian-script text.
- `example-headword-untranslated` (error) — the Persian translation still
  contains the literal English headword instead of translating it.
- `cloze-unreachable` (warning) — no example contains the exact headword as
  a literal whole word, so the word can never produce a Cloze question
  (mirrors `ClozeView.vue`'s actual matching logic).
- `example-template-repeated` (error) — 3+ words in the same lesson file
  share an identical sentence shape with only the headword substituted; this
  is the actual mechanical-template detector and is what caught English
  Hard/Very Hard and 504 after the first manual scan missed them.

Added corresponding test coverage in `contentValidation.test.ts` (6 new
cases). Final run against the real repo: **8 errors (documented exceptions
above), 1,400 warnings (1,399 structural cloze-unreachable + 1 pre-existing
unrelated cefr warning), 0 unexplained errors.**

Also discovered a pre-existing, independent tool — `contentGap.ts` /
`scripts/content-gap-report.mjs` (`npm run report:content` →
`docs/CONTENT_GAPS.md`) — which had *already* measured this exact bug
(82%/78%/100%/100% boilerplate for Upgrade/Hard/Very-Hard/504) before this
session started. Re-ran it after remediation: boilerplate examples and
boilerplate context sentences are now **0% in all four courses**. Updated
the one test in `contentGap.test.ts` that asserted the bug as a known fact
(`'finds the known templated courses'`) to assert the fixed state instead.

## 10. Answer validation (Phase 6)

Reviewed `src/services/textMatch.ts` (`answersMatch`). Already satisfies the
brief: exact match after case/punctuation normalization is always accepted;
a single-character typo is tolerated for answers of 4+ characters; no
blanket synonym acceptance; numeric and digit-sequence mismatches are never
bridged by typo tolerance. Since the content fix guarantees the Cloze
`blank` is always the literal, uninflected headword, no changes were needed
or made here.

## 11. Cloze UI (Phase 7)

Reviewed `src/views/ClozeView.vue`. Visual design, progress bar, audio
playback, and answer-feedback component are all preserved untouched — no
usability issue was found that justified a change, per the brief's
instruction to preserve the existing design.

## 12. Verification

- `npm run validate:content`: 8 errors (all documented exceptions), 1,400
  warnings (see §8-9).
- `npx vitest run`: **761/761 tests pass** (59 files), including the 6 new
  vocabulary/Cloze validator tests and the corrected `contentGap.test.ts`
  assertion.
- Live browser check (Playwright against the Vite dev server): opened
  `/cloze?courseId=upgrade&lessonId=batch-01` and
  `/cloze?courseId=hard&lessonId=batch-01`, answered correctly, confirmed the
  rewritten English sentence, Persian translation and "Correct" feedback all
  render properly with no console errors.

## 13. Sources and verification methodology (Phase 3)

No external dictionary API/web lookups were made during this session —
sentence correctness relied on the content-authoring agents' own English/
Persian knowledge, cross-checked against each word's existing `meaning`/
`pos` fields and, where ambiguous, flagged inline (§7) rather than guessed
silently. This should be stated plainly rather than implying Cambridge/
Oxford/Merriam-Webster/Longman/Collins were consulted live, since they
weren't. Uncertain or dual-sense words are listed in §7 for a human (or a
follow-up pass with real dictionary lookups) to double-check.

## 14. Phase 10.2 — Cloze coverage and vocabulary integrity

The original `\\bheadword\\b` matcher was replaced with the structured matcher in
`src/services/clozeMatching.ts`. It normalizes harmless Unicode typography and
whitespace, enforces Unicode word boundaries, supports multi-word/compound
phrases, and only accepts inflections listed in the content's explicit
`clozeVariants` field. It deliberately does not stem or guess arbitrary forms.

Current coverage (`npm run report:cloze`, all seven vocabulary courses):

| Measure | Count |
| --- | ---: |
| Vocabulary entries | 6,858 |
| Eligible and successfully matched | 5,480 |
| Still unreachable and needing authored variants | 891 |
| Intentionally excluded (`sth`/`sb`/slash substitution entries) | 487 |
| Ambiguous match records | 2 (flagged for review) |

The 891 unreachable entries are not silently forced into exercises. Most are
Oxford examples using a legitimate grammatical inflection (`recognized` for
`recognize`, `caught` for `catch`) or a substituted object/pronoun. They require
an authored `clozeVariants` entry or a new context sentence before becoming a
meaningful Cloze question. The three Upgrade gaps (`cease`, `contemplate`,
`yield`) were repaired with explicit variants; all Upgrade, Hard, Hard v2, and
504 entries are now matched.

The two hard-batch synonym bugs were repaired separately; see
`docs/VOCABULARY_CORRECTIONS.md`. The 60 placeholder records now have reviewed
alternatives and no learner-facing IDs changed.

## 15. Security incident follow-up

No scratchpad text file or overwrite record exists in the repository snapshot.
The only matching path is the expected audio asset
`public/audio/fa/scratch.mp3`, tracked by commit `1c8bc68`:

```text
owner sam (uid 1000), group sam (gid 1000), mode 0664
size 13248 bytes
sha256 0dc53d38f791f78c58e257662434070134ed12c00217b221b16c2369de6b5606
mtime 2026-11-01 10:06:59 +0330
ctime 2026-11-18 19:35:00 +0330
```

No process/audit log identifying an overwrite source was present in the repository,
and host audit logs are outside this workspace. Therefore the incident cannot be
claimed resolved from repository evidence alone. The minimum repository-side
control is to keep generated/audio assets non-writable by the dev server and use a
dedicated build-output directory; operationally, capture auditd/inotify events for
the exact path and restrict write access to the asset-generation process.

## 16. Remaining limitations

- The remaining 891 unreachable Oxford entries need individually authored
  `clozeVariants` or new sentences; 487 substitution-marker entries are
  intentionally excluded because blanking the displayed headword would be
  misleading.
- Two Upgrade entries still produce an ambiguity warning because more than one
  configured form occurs in their examples; they are flagged for human review.
- No live dictionary verification was performed (§13); the ~18 dual-sense
  words flagged in §7 are the best candidates for a follow-up human check.
- The scratchpad overwrite source could not be identified from repository
  evidence; host audit logs are required for attribution.
