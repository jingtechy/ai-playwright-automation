import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { generateTest } from './testGenerator';
import { runPlaywrightTest } from './runner';
import { aiSuggest } from './aiAdapter';
import fetch from 'cross-fetch';

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/generate', async (req, res) => {
  const { scenario } = req.body;
  if (!scenario) return res.status(400).json({ error: 'scenario required' });
  const generated = await generateTest(scenario);
  const suggestions = await aiSuggest(scenario, generated);
  res.json({ code: generated, suggestions });
});

app.post('/run', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const match = code.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    const cleaned = match && match[1] ? match[1].trim() : code.replace(/^```[a-zA-Z]*\s*/,'').replace(/\s*```$/,'').trim();
    const result = await runPlaywrightTest(cleaned);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/generate-and-run', async (req, res) => {
  const { scenario } = req.body;
  if (!scenario) return res.status(400).json({ error: 'scenario required' });
  const generated = await generateTest(scenario);
  const suggestions = await aiSuggest(scenario, generated);
  try {
    const result = await runPlaywrightTest(generated);
    res.json({ code: generated, suggestions, result });
  } catch (err: any) {
    res.status(500).json({ error: String(err) });
  }
});

// Debug endpoint to probe local LLM connectivity from the server process
app.get('/debug/llm', async (_req, res) => {
  const base = (process.env.LOCAL_LLM_URL || '').replace(/\/$/, '');
  if (!base) return res.json({ error: 'LOCAL_LLM_URL not set' });
  const model = process.env.LOCAL_LLM_MODEL || 'llama3.1:8b';
  const isOpenAI = /\/v1\//.test(base);
  const hostBase = isOpenAI ? base.replace(/\/v1\/(chat\/completions|completions)$/,'') : base;
  const hostBase127 = hostBase.replace('://localhost', '://127.0.0.1');
  const endpoints: Array<{ url: string; kind: string; body: any }> = [];
  if (isOpenAI) {
    endpoints.push({ url: base, kind: 'openai-chat', body: { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 10 } });
  }
  endpoints.push({ url: hostBase + '/v1/completions', kind: 'openai-completions', body: { model, prompt: 'ping', max_tokens: 10 } });
  endpoints.push({ url: hostBase + '/api/generate', kind: 'ollama', body: { model, prompt: 'ping', stream: false } });
  endpoints.push({ url: hostBase127 + '/v1/completions', kind: 'openai-completions-127', body: { model, prompt: 'ping', max_tokens: 10 } });
  endpoints.push({ url: hostBase127 + '/api/generate', kind: 'ollama-127', body: { model, prompt: 'ping', stream: false } });

  const results = [] as any[];
  for (const e of endpoints) {
    try {
      const r = await fetch(e.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.body) });
      const text = await r.text();
      results.push({ url: e.url, kind: e.kind, status: r.status, ok: r.ok, snippet: text.slice(0, 300) });
    } catch (err: any) {
      results.push({ url: e.url, kind: e.kind, error: String(err) });
    }
  }
  res.json({ base: process.env.LOCAL_LLM_URL, model, results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
