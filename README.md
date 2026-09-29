# English Upgrade

Vue 3 + TypeScript vocabulary learning application.

## Stack

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Tailwind CSS
- Web Speech API

## Features

- Courses and lazy-loaded lessons
- English/Persian vocabulary cards
- Examples and mini-context highlighting
- Text-to-speech
- Listen & Repeat
- Hard Words
- Active recall practice
- Multiple-choice quiz
- Speaking Practice with browser speech recognition
- Spaced review progress
- LocalStorage persistence

## Data

`public/data/manifest.json` is loaded first.

Lesson JSON files are loaded only when a lesson is opened or a practice/review flow needs them.

The repository currently contains:

- English Upgrade: 9 batches
- 504 Absolutely Essential Words: 42 lessons
- 874 vocabulary entries in the supplied data

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Browser notes

Speech recognition and Persian text-to-speech depend on browser/OS support and installed voices. Pronunciation scoring is transcript-based; it is not phoneme-level acoustic scoring.

## Storage keys

- `english-upgrade-hard-words`
- `english-upgrade-word-progress`

If migrating from an older development version with incompatible LocalStorage data, clear those two keys once.
