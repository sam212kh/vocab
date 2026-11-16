# Phase 8.1 — Active Production & Learning Quality

Journey sentence production used to be judged by `productionEvidence`: ≥ 4 words and a substring match on a target expression. That check cannot see grammar, word order, meaning or naturalness, and it counted every submission as independent. This phase adds a real sentence evaluator and makes evidence honest about *how* an answer came about.

## Where production is evaluated (audit)
| Place | How | Judges grammar/meaning? |
|---|---|---|
| Journey `sentence-construction` | **was** length + target substring; **now** AI evaluator, deterministic fallback | now yes (AI); fallback no |
| Writing module | AI `evaluate-writing` (whole texts) | yes, separate module, unchanged |
| Career interview answers | AI `interview-answer` | yes, unchanged |
| Real-Life "My Real Life" | AI `express` (generates, doesn't grade) | n/a |
| Conversation Tutor | AI corrections during chat | yes, unchanged |
| Exercise Engine (`translation`, `grammar-correction`, `fill-blank`) | accepted-answers diff (`answerDiff`) | no — unchanged by design |

## Evaluation contract — `sentence-evaluation-v1`
`POST /api/ai/evaluate-sentence`. The model reports per-dimension statuses (`ok | minor | problem | not-applicable`) for **grammar, meaning, vocabulary, wordOrder, naturalness, targetExpression, contextRelevance**, plus concrete `errors` (exact `fragment` from the learner text), one `correctedSentence`, Persian explanation, ≤ 3 `alternatives`, one `example`, one `nextPractice`.

Everything decision-like is **derived server-side** (`validateSentenceEvaluationResponse`), never model-asserted:
- `outcome`: `incomplete > meaning-changed > off-topic > needs-correction > unnatural > valid-alternative | correct` (`correct` only when the sentence equals a reference).
- `issues`, `passed`, `language{correct,natural}` vs `content{complete,meaningPreserved,relevant,targetUsed}` (language correctness separated from content quality), `matchesReference`.
- `passed` = complete, relevant, meaning-preserving, language-correct. Unnaturalness alone still passes (feedback, not failure).

Anti-invention rules: an error whose `fragment` is not in the learner's sentence is dropped; a dimension marked `problem` without a verified supporting error is downgraded to `minor`; an error under an `ok` dimension is dropped; target use is verified deterministically (whole-word, inflection tolerant — "everyday day" ≠ "every day") and target omission is capped at `minor` (never an error); a correction identical to the learner's text, or one that rewrites the sentence (Dice < 0.4 for language-only fixes), is rejected → one repair round → HTTP 502 `invalid-model-output`. Model-supplied `outcome/score/level` are ignored; `learnerSentence` is echoed from the request.

Prompt `sentence-evaluation-v1`: learner text, task and references are passed as one JSON-encoded data object (no delimiter breakout); the system prompt states the data-only rule, forbids CEFR levels/scores, and never requires a canonical sentence.

## Evidence model
`JourneyEvidenceRecord` gains optional `evaluator`, `assistance`, `attempt`, `outcome`, `issues` (no migration; older records read as unassisted/deterministic).
| assistance | meaning | independent | counts as correct |
|---|---|---|---|
| `none` | first attempt, no hint, no correction seen | yes | per evaluation |
| `hint` | hint shown first | no | per evaluation |
| `after-feedback` | retry after feedback | no | per evaluation |
| `copied-correction` | reproduces the correction the learner was shown (≥ 0.85 word overlap) | no | **never** |

Consequences: planner stage balance and roadmap count only **independent** production; effort credit for a copied correction is 1 point; only a learner's **first attempt** feeds shared skill statistics (retries are practice); the summary breaks production into unaided / hint / retried / copied and AI-evaluated vs basic-check-only. SM-2 is untouched. No evaluation writes to the learner profile or any CEFR estimate; typed production maps to non-speaking events only.

## Fallback behaviour
AI off, gateway down, timeout, or invalid model output → the answer stays in the box, **no** evidence/score is recorded, the UI offers *Retry AI feedback* or *Continue with a basic check*. The basic check is the old length + target-use check, labelled "not a grammar evaluation", stored with `evaluator: 'deterministic'`. Journeys never require AI.

## Learner feedback
Exact answer with highlighted fragments → one-line outcome → Language vs Content chips → ≤ 2 explained problems (English + Persian) → **Try again without the correction** / *Show natural correction* (the example appears with the correction). Max 3 attempts, then the correction is shown.

## Limitations
- Verdict quality depends on the model's per-dimension judgments; the server only enforces consistency/verifiability. A model that wrongly says "all ok" for a faulty sentence cannot be caught. Not tested against a real Ollama/cloud model.
- Persian «او» is gender-neutral; whether "he" vs "she" is a meaning change depends on the task, which for Journey's open prompts the model decides.
- Journey construction prompts reuse the Real-Life *speaking* instruction ("say it out loud"), a pre-existing content mismatch for a typed task.
- Copy detection is a word-overlap heuristic.
