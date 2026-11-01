# Deploy (manual)

No CI/CD — after pushing to `main`, SSH into the server and pull + rebuild by hand.

```sh
ssh <user>@<server>
cd /path/to/vocabulay-app   # adjust to the actual path on the server
git pull origin main
npm install                 # only needed if package.json/lockfile changed
npm run build                # vue-tsc -b && vite build -> dist/
```

`dist/` is what nginx serves as static files — no process to restart for
the main app. The TTS proxy (`tts-service/`) is a separate systemd service
(`english-upgrade-tts.service`) and only needs a restart if `tts-service/`
itself changed:

```sh
sudo systemctl restart english-upgrade-tts.service
```

## Why "file not found" / JSON.parse errors happen after a push

The three Oxford Word Skills courses reference audio/image/data files under
`public/` (served as static assets, not bundled by Vite). If `public/data`,
`public/audio`, or `public/images` aren't deployed yet but `manifest.json`
already is, the app tries to fetch a lesson file that 404s — nginx's HTML
error page isn't valid JSON, hence
`JSON.parse: unexpected character at line 1 column 1`.
`git pull` + `npm run build` on the server picks up everything in one shot
since they're all committed together now.
