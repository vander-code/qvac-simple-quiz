// Simple Quiz App - the quiz itself runs in the browser. The AI question writer runs on YOUR machine
// with QVAC. Open http://localhost:3008 after starting.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const PORT = 3008;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = `You are a careful quiz writer for students.
You write clear, fair multiple-choice questions with exactly 4 answer choices and exactly one correct answer.
The wrong choices must be believable but clearly wrong. Keep every sentence short.`;

// The AI must answer in exactly this shape (QVAC "structured output"), so the quiz never breaks.
const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    a: { type: "string" }, b: { type: "string" }, c: { type: "string" }, d: { type: "string" },
    correct: { type: "string", enum: ["A", "B", "C", "D"] },
    explanation: { type: "string" },
  },
  required: ["question", "a", "b", "c", "d", "correct", "explanation"],
  additionalProperties: false,
};

// ---- Step 1: load the AI model (downloads the first time, then it's cached) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };

async function startModel() {
  try {
    status.message = "Loading the AI question writer (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0, // small and fast. A bigger model would write better questions.
      modelType: "llm",
      onProgress: (p) => {
        const value = typeof p === "number" ? p : p?.percentage;
        if (typeof value === "number") status.percent = Math.round(value);
      },
    });
    status.ready = true;
    status.message = "Question writer ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) {
    status.error = String(err?.message || err);
    console.error("Could not load model:", err);
  }
}

// ---- Step 2: ask the AI for ONE question, check it, and shuffle the answers ----
async function askAI(source, text, previous) {
  const material = source === "notes" ? `Use ONLY these notes:\n"""\n${text}\n"""` : `Topic: ${text}`;
  const avoid = previous.length ? `\nDo not repeat or copy these earlier questions:\n- ${previous.join("\n- ")}` : "";
  const history = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${material}${avoid}\n\nWrite ONE new multiple-choice question about this.` },
  ];

  // This is the QVAC call that runs the AI on-device, forced to answer in the schema above
  const run = completion({
    modelId, history, stream: true,
    responseFormat: { type: "json_schema", json_schema: { name: "QuizQuestion", schema: QUESTION_SCHEMA } },
  });
  let out = "";
  for await (const event of run.events) if (event.type === "contentDelta") out += event.text;
  return JSON.parse(out);
}

async function makeQuestion(source, text, previous) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const q = await askAI(source, text, previous);
      const options = [q.a, q.b, q.c, q.d].map((s) => String(s).trim());
      const distinct = new Set(options.map((s) => s.toLowerCase())).size === 4;
      if (!q.question.trim() || options.some((s) => !s || s.length > 200) || !distinct) continue; // bad question, try again

      const answer = options["ABCD".indexOf(q.correct)];
      for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
      return { question: q.question.trim(), options, answerIndex: options.indexOf(answer), explanation: String(q.explanation || "").trim() };
    } catch (err) { console.error("Question attempt failed:", err.message); }
  }
  return null;
}

// The AI can only write one question at a time, so requests line up
let chain = Promise.resolve();
function enqueue(job) { const p = chain.then(job); chain = p.catch(() => {}); return p; }

// ---- Step 3: a small web server ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 20000) { reject(new Error("Too big")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(await readFile(path.join(__dirname, "public", "index.html")));
  }
  if (req.method === "GET" && req.url === "/api/status") return json(res, 200, status);

  if (req.method === "POST" && req.url === "/api/question") {
    if (!status.ready) return json(res, 503, { error: "The question writer is not ready yet." });
    try {
      const body = JSON.parse(await readBody(req));
      const source = body.source === "notes" ? "notes" : "topic";
      const text = String(body.text || "").trim().slice(0, source === "notes" ? 2500 : 120);
      const previous = (Array.isArray(body.previous) ? body.previous : []).slice(0, 10).map((s) => String(s).slice(0, 200));
      if (!text) return json(res, 400, { error: "Nothing to write questions about." });

      const q = await enqueue(() => makeQuestion(source, text, previous));
      return q ? json(res, 200, q) : json(res, 502, { error: "The AI couldn't write a good question. Try again." });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: String(err?.message || err) });
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

// "127.0.0.1" means only YOUR computer can reach this app
server.listen(PORT, "127.0.0.1", () => console.log("Server running at http://localhost:" + PORT));
startModel();
