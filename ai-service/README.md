# AI Gateway (ai-service)

Minimal zero-dependency Node service that gives the SPA access to AI writing
evaluation without exposing provider credentials. Mirrors the conventions of
`tts-service/` (loopback bind, env config, origin allowlist, rate limit,
`node --test` suite, systemd + nginx deployment).

## Endpoints

- `GET /api/ai/health` — liveness + default provider. No secrets, no internals.
- `GET /api/ai/providers` — per-provider `configured` / `available` state, allowed models, live health detail. Never returns credentials.
- `POST /api/ai/evaluate-writing` — the only operation. Body:

```json
{
  "text": "learner text (required)",
  "task": "the writing prompt instructions",
  "provider": "ollama | cloud (optional, defaults to AI_PROVIDER)",
  "model": "optional; must be in the server-side allowlist",
  "detail": "concise | standard | detailed",
  "explanationLanguage": "english | persian | bilingual",
  "allowFallback": false,
  "learner": {
    "nativeLanguage": "Persian",
    "selfReportedLevel": "B1",
    "levelSource": "self-reported",
    "recurringMistakes": ["tense", "articles"]
  }
}
```

Success: `{ evaluation, meta }` where `meta` carries `provider`, `model`,
`promptVersion`, `durationMs`, `fallbackUsed`, `warnings`. Errors are
structured `{ error, code?, provider? }` — never stack traces.

## Providers

- **ollama** — local; `OLLAMA_BASE_URL` + `OLLAMA_MODEL(S)`. Uses `/api/chat`
  with `format: "json"` when `OLLAMA_JSON_MODE=1`. Not every model handles
  JSON mode equally well — disable it per deployment if the chosen model
  degrades.
- **cloud** — any OpenAI-compatible chat-completions API
  (`CLOUD_API_BASE_URL`, `CLOUD_API_KEY`, `CLOUD_MODEL(S)`). The wire format
  is explicit (`CLOUD_WIRE_FORMAT=openai-chat`); APIs that deviate need a new
  adapter, not silent assumptions.

Clients may only request models listed in `OLLAMA_MODELS` / `CLOUD_MODELS`.

### Fallback — explicit, never silent

`AI_FALLBACK_PROVIDER` names the secondary provider. It is used only when
BOTH hold: the env var is set AND the client sent `allowFallback: true`.
The response then carries `meta.fallbackUsed: true` so the UI can tell the
learner their text went to the other provider. With fallback unset or not
allowed, the primary provider's failure is returned as-is.

## Output validation

Model output is untrusted. The gateway parses JSON (tolerating markdown
fences), then validates:

- hard-required: `overall`, `correctedVersion`, `naturalVersion`
- sentence items whose `original` is not actually in the submission are
  dropped (reported in `meta.warnings`)
- duplicate sentence items are dropped
- unknown categories coerce to `other`; unknown `kind` coerces to `style`
  (an unverified judgement is never upgraded to "error")
- arrays are capped (20 sentences, 5 vocabulary, 3 priorities, 4 exercises)
- oversized responses are rejected

One bounded repair round (`AI_MAX_REPAIR_ATTEMPTS`) re-prompts the model
with the validation errors. If still invalid: HTTP 502 `invalid-model-output`
and the learner's text is untouched client-side.

## Security model — read this honestly

- Credentials live only in the server environment. Nothing secret is ever in
  `VITE_*` variables or frontend assets.
- The service binds `127.0.0.1`; nginx is the only public path. Ollama stays
  on loopback and is never exposed directly.
- Protections: origin allowlist, per-IP rate limit (`X-Real-IP` from nginx),
  64KB body cap, submission length cap, request timeouts, graceful shutdown.
- **Limitation:** the app has no user authentication, and an origin header
  check is not authentication — any client that can reach the endpoint can
  spend evaluation quota. For a single-user deployment behind a personal
  domain this is an accepted risk, bounded by the rate limit and by the
  gateway exposing exactly one narrow operation. Multi-user deployment
  REQUIRES real authentication in front of this service; that is a future
  phase requirement, deliberately not faked here with a hardcoded shared
  secret in the SPA.
- Logs contain metadata only (sizes, durations, error codes) — no learner
  text, no credentials.

## Run locally

```sh
cp ai-service/.env.example ai-service/.env   # then edit; or export vars directly
OLLAMA_MODEL=qwen2.5:7b-instruct npm run start:ai
npm run test:ai
```

Vite dev proxies `/api/ai` to `http://127.0.0.1:8788` (see `vite.config.ts`),
so the SPA needs no extra config in development.

## Deploy

```sh
sudo cp ai-service/english-upgrade-ai.service.example /etc/systemd/system/english-upgrade-ai.service
sudo cp ai-service/.env.example /etc/english-upgrade-ai.env   # edit values; chmod 640, owned by the service user
# add ai-service/nginx-location.example.conf to the app's HTTPS server block
sudo systemctl daemon-reload && sudo systemctl enable --now english-upgrade-ai.service
curl https://your-app-hostname.example/api/ai/health
```
