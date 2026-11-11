# TTS service

This Node.js service proxies Neural Voice synthesis. Three providers are supported:

- `google` — the unofficial endpoint behind Google Translate's "listen" button. No API key, best natural-sounding English voice of the three, but no SLA: Google can rate-limit or block it without notice. Fine for a single self-hosted instance with modest traffic; not for production at scale.
- `piper` — self-hosted, runs on your VPS with no API key, hosted quota, or per-character charge. Robotic compared to `google`, but has no external dependency.
- Azure Neural TTS — requires `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`.

Browser System Voice remains the fallback for all three.

Piper voice models are separate downloads. Review each model card and license before public or commercial use.

## Google provider

```env
TTS_PROVIDER=google
TTS_GOOGLE_LANG=en
FFMPEG_BIN=/usr/bin/ffmpeg
```

`FFMPEG_BIN` is only needed to apply a playback rate other than `1`; synthesis itself is returned as-is from Google. The frontend's configured voice id is accepted but ignored (this endpoint only selects by language, not by named voice), so `/api/tts/voices` just reports `en-US`.

## Install Piper on Ubuntu

```sh
sudo apt update
sudo apt install -y python3-venv ffmpeg
sudo mkdir -p /opt/piper/voices
sudo python3 -m venv /opt/piper/venv
sudo /opt/piper/venv/bin/pip install piper-tts
```

Download the voice with Piper's downloader. Passing `--download-dir` to the synthesis command does not download a model.

```sh
sudo /opt/piper/venv/bin/python -m piper.download_voices \
  --download-dir /opt/piper/voices \
  en_US-lessac-high en_US-ryan-high
```

Test it:

```sh
sudo /opt/piper/venv/bin/python -m piper \
  --data-dir /opt/piper/voices \
  --model en_US-lessac-medium \
  --output_file /tmp/piper-test.wav \
  -- "Hello, this is a pronunciation test."
```

The directory must contain:

```text
/opt/piper/voices/en_US-lessac-high.onnx
/opt/piper/voices/en_US-lessac-high.onnx.json
```

The service converts Piper WAV output to MP3 through FFmpeg before caching it.

For clearer pronunciation, prefer `en_US-lessac-high` or `en_US-ryan-high` over the medium model. Download both models and configure their `.onnx` paths in `TTS_PIPER_VOICES`; the app will then show both choices. Start with speech speed `0.9` for difficult words.

## Configuration

Use this free Piper configuration in the protected systemd environment file:

```env
TTS_PROVIDER=piper
TTS_HOST=127.0.0.1
TTS_PORT=8787
TTS_ALLOWED_ORIGINS=https://vocabulary.example.com

PIPER_BIN=/opt/piper/venv/bin/piper
FFMPEG_BIN=/usr/bin/ffmpeg
TTS_PIPER_VOICES=en_US-lessac-high=/opt/piper/voices/en_US-lessac-high.onnx,en_US-ryan-high=/opt/piper/voices/en_US-ryan-high.onnx

TTS_CACHE_DIR=/var/cache/english-upgrade-tts
TTS_CACHE_TTL_DAYS=180
TTS_MAX_CACHE_MB=2048
TTS_MAX_CHARS=1200
TTS_TIMEOUT_MS=12000
TTS_RATE_LIMIT_PER_MINUTE=30
```

`TTS_PIPER_VOICES` is a comma-separated `voice-name=model-path` list. Configure multiple voices to expose them in the app's Voice selector:

```env
TTS_PIPER_VOICES=en_US-lessac-medium=/opt/piper/voices/en_US-lessac-medium.onnx,en_US-ryan-high=/opt/piper/voices/en_US-ryan-high.onnx
```

The frontend loads configured voices from `GET /api/tts/voices`, remembers the selected voice, and uses it for normal playback, Listen & Repeat, and preload. The frontend defaults to `en_US-lessac-medium`; set `VITE_TTS_VOICES` only when the service endpoint is not available during development.

For local Vite development use:

```env
TTS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
```

Origins must match exactly, including scheme and port. A missing or stale origin causes `403 Origin is not allowed`. Restart the service after changing the environment file:

```sh
sudo systemctl daemon-reload
sudo systemctl restart english-upgrade-tts
```

## API

`POST /api/tts` accepts:

```json
{
  "text": "Hello, this is a pronunciation test.",
  "voice": "en_US-lessac-medium",
  "format": "mp3",
  "rate": 0.9
}
```

The service validates and normalizes text, limits its length, validates configured voices, escapes provider input, applies a request rate limit, and never logs submitted text. `rate` supports `0.5` through `1.5`. Piper maps it to `length_scale`.

Health and metrics:

```sh
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/metrics
curl http://127.0.0.1:8787/api/tts/voices
```

Audio is stored under a SHA-256 cache key containing text, voice, format, rate, and schema version. Writes are atomic, concurrent duplicate requests share one generation, stale files expire after 180 days by default, and cleanup enforces the size cap. ETags and conditional requests are supported.

## Ubuntu systemd deployment

Review `english-upgrade-tts.service.example` before installing it:

```sh
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin english-tts
sudo install -d -o english-tts -g english-tts -m 0750 /var/cache/english-upgrade-tts
sudo install -o root -g english-tts -m 0640 /path/to/english-upgrade-tts.env /etc/english-upgrade-tts.env
sudo install -o root -g root -m 0644 tts-service/english-upgrade-tts.service.example /etc/systemd/system/english-upgrade-tts.service
sudo systemctl daemon-reload
sudo systemctl enable --now english-upgrade-tts
```

Set `WorkingDirectory` and `ExecStart` to the actual repository path. Keep model files readable by `english-tts`; keep the environment file restricted. Put `nginx-location.example.conf` inside the existing HTTPS server block. The Node service stays loopback-only; do not open a firewall port.

## Tests and measurements

```sh
npm run test:tts
npm run build
```

The tests use a deterministic test provider and cover cache reuse, concurrent generation, voice-separated keys, validation, CORS, ETags, failures, and timeouts. They do not measure Piper CPU time or production latency.

Measure the VPS service:

```sh
curl -sS -o /dev/null -w 'uncached total=%{time_total}s first_byte=%{time_starttransfer}s\n' \
  -H 'Content-Type: application/json' \
  -d '{"text":"first uncached measurement","voice":"en_US-lessac-medium"}' \
  http://127.0.0.1:8787/api/tts

curl -sS -o /dev/null -w 'cached total=%{time_total}s first_byte=%{time_starttransfer}s\n' \
  -H 'Content-Type: application/json' \
  -d '{"text":"first uncached measurement","voice":"en_US-lessac-medium"}' \
  http://127.0.0.1:8787/api/tts
```

## Rollback

Stop and disable `english-upgrade-tts`, remove its Nginx locations after validating the configuration, and remove the frontend TTS proxy setting. Automatic mode falls back to browser speech when the service is unavailable. The cache contains reproducible audio and can be retained or removed independently.
