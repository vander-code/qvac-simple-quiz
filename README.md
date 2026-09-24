# Simple Quiz App (QVAC)

A simple quiz with text questions and multiple-choice answers: instant feedback, a score, and a review of
what you missed. Play the built-in starter quiz, or paste your own notes (or type a topic) and an
**on-device AI writes a new quiz for you**. Generated quizzes are saved so you can replay them.

The AI runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source
AI SDK. No API key, no cloud service, and your notes never leave your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `completion` (with structured output via `responseFormat`), using the
`LLAMA_3_2_1B_INST_Q4_0` model.

## Install

You need [Node.js](https://nodejs.org) (current LTS) and about 1 GB of free disk space for the model.

```bash
git clone https://github.com/YOUR-USERNAME/qvac-simple-quiz.git
cd qvac-simple-quiz
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3008** in your browser.

The first start downloads the model. The starter quiz works while it loads.

## How it works

- The quiz (questions, scoring, review) is plain JavaScript in the browser. Saved quizzes live in your browser's local storage.
- To write one question, the page asks the local server, which calls QVAC's `completion` with a JSON schema (`responseFormat`). This forces the AI to reply with a question, four answers, the correct letter and a short explanation, so the quiz never breaks.
- The server checks each question (four different answers, nothing empty), shuffles the answers, and retries if something is wrong.
- Questions are written one at a time, and earlier questions are passed along so the AI doesn't repeat itself.
- Quizzes made **from your notes** are the most reliable, because the AI only uses the text you gave it. A small model can be wrong when it writes from a topic alone, so double-check those.
- The server listens on `127.0.0.1`, so only your own computer can reach it.

## License

MIT
