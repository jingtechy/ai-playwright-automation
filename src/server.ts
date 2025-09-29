import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { generateTest } from './testGenerator';
import { runPlaywrightTest } from './runner';
import { aiSuggest } from './aiAdapter';
import { config } from './config';

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Simple config endpoint for client consumption
app.get('/config', (_req, res) => {
  res.json({ targetSite: config.TARGET_SITE });
});

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


const port = process.env.PORT || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
