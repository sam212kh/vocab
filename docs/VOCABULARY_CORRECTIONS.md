# Vocabulary corrections — Phase 10.2

Date: 2026-11-24

## Placeholder synonym repair

`public/data/hard/batch-02.json` and `public/data/hard/batch-05.json` each contained
30 records whose synonyms were the literal placeholders `similar` and `related`.
Those values were not valid alternatives for any of the target verbs and came from
the content-generation/import pass that populated these two batches.

All 60 records were reviewed against the English headword, part of speech, Persian
meaning, and the authored examples. The placeholder pairs were replaced with two
context-appropriate English alternatives per entry. Polysemous entries retain
distinct senses where relevant (`decline`, `secure`, and `appreciate`); no Persian
translation overlap was used as evidence by itself.

Examples of repaired mappings:

| Headword | Meaning used in the lesson | Synonyms |
| --- | --- | --- |
| `accomplish` | achieve a goal | `achieve`, `complete` |
| `acknowledge` | admit or recognize | `admit`, `recognize` |
| `adapt` | become suitable to new conditions | `adjust`, `acclimatize` |
| `negotiate` | discuss to reach agreement | `bargain`, `reach an agreement` |
| `decline` | decrease or refuse | `decrease`, `refuse` |
| `secure` | obtain or protect | `obtain`, `protect` |
| `verify` | confirm correctness | `confirm`, `check` |

The source IDs, ordering, examples, Persian translations, and learner-progress keys
were preserved. A repository-wide scan now reports zero `similar`/`related`
placeholder records in these two files.

## Follow-up repository-wide repair

The same placeholder pair was also found in 35 entries across `hard/batch-06`,
`hard/batch-09`, `hard-v2/batch-02`, and `hard-v2/batch-09`. One additional
`relevant` record used `related` as a generic synonym, and Oxford's
`comparable` entry had only one synonym. These 37 records were corrected using
the same headword, part-of-speech, meaning, and example-context review. The
exact placeholder pair now occurs **zero** times under `public/data`.

## Cloze matching correction

The old Cloze implementation used a literal `\\bheadword\\b` regex. That excluded
multi-word expressions, punctuation variants, and inflected forms, while also
making punctuation/Unicode boundary behavior implicit. Matching now uses
`src/services/clozeMatching.ts`: Unicode letter/number boundaries, normalized
whitespace, apostrophes and hyphens, longest-phrase selection, and explicit
`clozeVariants` only. It does not stem words or accept arbitrary substrings.

## Validation

Run:

```sh
npm run report:cloze
```

The report distinguishes matched entries, entries needing an explicitly authored
inflection/spelling variant, and entries intentionally excluded because Oxford
headwords contain learner placeholders such as `sth`/`sb` or slash alternatives.

## Phase 10.3 corrections (independent QA pass)

Four independent reviewer passes (one per course group — English Upgrade; 504;
English Hard/Very Hard; the three Oxford Word Skills tiers) sampled ~153
words total (see `docs/PHASE10_3_LINGUISTIC_QA.md` for sampling methodology
and full findings) and confirmed 9 additional problems, all fixed in place:

| Word | File | Problem | Fix |
| --- | --- | --- | --- |
| `challenge` | `504/lesson-09.json` | `pos` said "noun" but an example used the verb sense | `pos` → "noun / verb" |
| `menace` | `504/lesson-10.json` | `pos` said "noun" but an example used the verb sense | `pos` → "noun / verb" |
| `frequent` | `504/lesson-11.json` | `pos` said "adjective" but an example/miniContext used the verb sense | `pos` → "adjective / verb" |
| `panic` | `504/lesson-19.json` | `pos` said "noun" but an example ("Don't panic") is verb | `pos` → "noun / verb" |
| `venture` | `504/lesson-26.json` | `pos` said "verb" but an example/miniContext used the noun sense | `pos` → "verb / noun" |
| `amateur` | `504/lesson-08.json` | predicative "looked a bit amateur" is not a standard collocation (that's "amateurish") | Rewrote the example to use `amateur` correctly as a noun |
| `disdain` | `hard-v2/batch-02.json` | `pos` "noun" (correct) contradicted a verb-use example and a miniContext claiming dual pos | Replaced the verb example with a noun-consistent one; trimmed the miniContext |
| `pull out` | `oxford/upper-advanced/unit-27.json` | example circularly misdescribed the vehicle-pulling-out sense | Rewrote: "The van pulled out of the side street without indicating." |
| `probe` | `oxford/upper-advanced/unit-56.json` | example was a bare dictionary definition, duplicated in miniContext, off-register for the unit | Rewrote: "Police have launched a probe into the missing funds." |
| `impose sth (on/upon sb)` | `oxford/upper-advanced/unit-45.json` | example omitted the `(on/upon sb)` complement that is the point of the headword | Rewrote: "The government has imposed strict new rules on businesses." |

4 further cases were judged genuinely ambiguous and were **not** auto-fixed —
see `docs/PHASE10_3_LINGUISTIC_QA.md` §"Needs Human Review" for `molest`
(dated sense vs. modern usage — a product/pedagogy decision), `bribe`
(declared pos "noun/verb" but only the noun sense is demonstrated), `rival`
(a prior "fix" was imprecisely justified but is functionally harmless), and
`care for sb` (uses the near-synonym "take care of" instead of the literal
headword).

All source IDs, `word`/`meaning`/`level`/`synonyms`/`clozeVariants` fields,
and lesson references were preserved; only the specific flagged
`pos`/`examples`/`miniContext` fields were edited.
