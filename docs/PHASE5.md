# Phase 5 — AI Conversation & Roleplay Tutor

## 1. Architecture

```
ConversationView (/conversation)
  ├─ MessageBubble (TTS replay · translate/explain/simplify on request · save expression · corrections)
  ├─ conversationService.ts     payload building, learner context, response mapping
  ├─ conversationEvidence.ts    pure performance-gating rules (tested)
  ├─ useSpeakingPractice        existing turn-based speech recognition (editable transcript)
  └─ speech.ts / SpeechButton   existing TTS
        │
  aiClient.ts ── /api/ai/chat · /api/ai/conversation-summary · /api/ai/assist
        │
  ai-service/ (SAME gateway as Phase 4 — no second backend)
        runGeneration(): shared provider-resolution + explicit-fallback + bounded-repair
        prompts: conversation-tutor-v1 · roleplay-tutor-v1 · conversation-summary-v1
        validation: chat/summary/assist request + response validators
```

Stores: `conversations` (v1: sessions+messages+summaries, 30-session / 200-message caps), `savedExpressions` (v1). Reused untouched: aiSettings, learnerProfile, mistakes, performance, sessionSettings, TTS, speech recognition.

## 2. Conversation experience

- 7 modes + roleplay; difficulty A1–C2 as **labels** (seeded from the self-reported level, never auto-assigned from accuracy); the prompt adapts sentence length/vocabulary/question complexity per level and says "simplify naturally, never condescendingly".
- 10 roleplay scenarios in `public/data/conversation/scenarios.json` (first meeting → salary negotiation, backend interview, Laravel architecture review), each with aiRole/learnerRole/objective/context/vocabulary/completionCriteria and a deterministic opening line. Integrity-tested. AI stays in character; breaks only when the learner asks for help.
- Feedback modes — enforced **server-side**, not just prompted: natural strips all corrections; gentle caps at 2 and drops style items; teacher caps at 5. Mode switchable mid-conversation. Corrections must quote the learner's last message verbatim or they're dropped (hallucination guard), deduplicated, categories/kinds coerced exactly like writing evaluation.
- Message actions (all on request, never automatic): Persian translation, explain, simplify, save expression — via `/api/ai/assist` (4 kinds, validated).

## 3. Voice

Turn-based only, honestly: record → Web Speech transcription → **editable transcript** → send. TTS play/replay per tutor message. No streaming, no phoneme scoring — transcription is labeled as such. Gated by the existing Speaking preference (`sessionSettings.speakingEnabled`): off → voice controls hidden with an explanatory note, text chat and TTS playback unaffected.

## 4. Summary

End-of-session `conversation-summary-v1`: overall (no CEFR), ≤3 strengths, ≤3 improvements, ≤5 key corrections, ≤5 useful expressions (savable with Persian meanings), one concrete next activity. Summary failure ends the session gracefully — the transcript is never lost.

## 5. Learning intelligence (the honesty contract)

`conversationEvidence.ts`, fully unit-tested:
- Speaking events **only** from voice input (recognizer confidence attached). Typed text never counts as speaking.
- Correctness events only when feedback mode B/C produced evidence; Mode A → zero events.
- Error corrections → incorrect grammar/vocabulary events with mapped categories; style suggestions never count as errors.
- Corrections feed the shared mistakes store (`sessionId:messageId` dedup — re-processing can't inflate counts), which feeds both the next AI request's context and the recommendation engine (reason wording now covers writing + conversation sources).
- Verified skill assessments untouched; weak-skill flagging still requires ≥10 observations.

## 6. Context & privacy

Gateway is stateless. Each turn sends the last 16 messages (server re-clamps) + minimal learner context (native language, interests, goals, ≤5 recurring error categories). Cross-session memory = recurring mistakes, saved expressions, stored summaries — never old transcripts. Deleting a session removes its messages and summary and unlinks its saved expressions. Cloud provider selection shows an explicit "your messages will be sent to the cloud API" notice; fallback requires the existing double opt-in and is announced per reply.

## 7. Testing

- `npm run test:ai` — **25/25** (chat validation, per-mode correction enforcement, hallucinated-correction drop, roleplay prompt version, summary caps, assist validation, provider failure + explicit fallback, plus all Phase 4 tests via the shared `runGeneration` refactor).
- `npm run test` — **165/165** expected (conversations store incl. migration + caps + delete, savedExpressions, evidence gating incl. "text creates no speaking events", scenario integrity, all Phase 2–4 regression).
- `npm run test:tts` — 5/5. Build clean.
- Voice paths are covered by mocked/unit tests only — real microphone/TTS behavior was not machine-verified; manual check recommended.

## 8. Known limitations

- Conversation quality tracks the chosen model; a 7B local model roleplays and corrects noticeably worse than a strong cloud model.
- Free-mode opening greeting costs one extra AI call when starting (roleplays open instantly from the scenario).
- The speaking event for a voice turn is recorded after the tutor reply returns; if the provider fails on that turn the spoken evidence is not recorded.
- Session "resume" reopens ended sessions read-only via View; an interrupted active session resumes fully.
- No conversation search; history is a flat recent list (30 sessions).

## 9. Phase 6 recommendation

Close the loop: placement/periodic assessment module feeding `SkillProfile.recordObserved/ recordVerified` (both entry points exist, still unused), so difficulty adaptation and recommendations can draw on measured levels instead of self-reported ones.
