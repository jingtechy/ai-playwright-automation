import fetch from 'cross-fetch';
import { config } from './config';

const LOCAL_LLM_URL = config.LOCAL_LLM_URL;
const OPENAI_API_KEY = config.OPENAI_API_KEY;

export async function aiGenerate(prompt: string): Promise<string> {
  // Try local LLM endpoint first (expects { prompt } -> { text })
  if (LOCAL_LLM_URL) {
    try {
      const r = await fetch(LOCAL_LLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const j = await r.json();
      if (j.text) return j.text;
    } catch (e) {
      // continue to fallback
    }
  }

  // Next try OpenAI if API key is available
  if (OPENAI_API_KEY) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1200
        })
      });
      const j = await r.json();
      return j.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      // fallback
    }
  }

  // Rule-based fallback: return a minimal Playwright test scaffolding
  return `/* AI fallback: no LLM available. Replace with LLM output if desired. */\n` +
    `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('https://the-internet.herokuapp.com');\n  console.log('FALLBACK_TEST');\n  await browser.close();\n})();`;
}

export async function aiSuggest(scenario: string, code: string): Promise<string[]> {
  const prompt = `You are a testing assistant. Given this scenario:\n${scenario}\nand this Playwright test:\n${code}\nProvide 5 concise edge-case or negative test ideas, one per line.`;
  const result = await aiGenerate(prompt);
  return result.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 10);
}
