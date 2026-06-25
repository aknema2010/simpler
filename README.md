# Meditation Timer

A meditation timer PWA with healing sounds, binaural beats, and nature
ambience. All audio is synthesized live with the Web Audio API, so there are
no sound files and the app works fully offline once cached.

## Run it

It's a static site — serve the folder over HTTP and open `index.html`:

```bash
npx serve .
# or
python3 -m http.server
```

Then visit the printed URL (e.g. http://localhost:3000).

> **Note:** open it over `http://`, not by double-clicking the file
> (`file://`). Service workers and some browser features don't work from
> `file://`.

## Develop

The UI lives in `app.jsx` (React + JSX). It is compiled ahead of time to
plain JavaScript (`app.js`) that the browser runs directly — there is **no**
runtime Babel transpile step, which keeps startup fast and reliable.

After editing `app.jsx`, rebuild:

```bash
npm install   # first time only
npm run build # compiles app.jsx -> app.js
```

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, styles bootstrap, and load-failure fallback |
| `app.jsx` | React app source (edit this) |
| `app.js` | Compiled output (generated — do not edit by hand) |
| `build.mjs` | Compiles `app.jsx` → `app.js` |
| `manifest.json` | PWA manifest |
| `service-worker.js` | Offline app-shell caching (network-first navigation) |
| `vendor/` | React + ReactDOM UMD builds (vendored — no CDN needed) |
| `favicon.svg`, `icon-192.png`, `icon-512.png` | Icons |

React is vendored locally in `vendor/` so the app has **no runtime CDN
dependency** and works fully offline. To refresh those builds, run
`npm install` and copy `node_modules/react{,-dom}/umd/*.production.min.js`
into `vendor/`.

## Sounds

- **Binaural beats** — Delta / Theta / Alpha / Beta (use headphones).
- **Healing tones** — Solfeggio frequencies (396–852 Hz).
- **Nature ambience** — rain / ocean / wind.
- **Bells** mark the start and end of each session.
