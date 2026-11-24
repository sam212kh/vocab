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
