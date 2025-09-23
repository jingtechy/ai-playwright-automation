import fetch from 'cross-fetch';
import { config } from './config';

const LOCAL_LLM_URL = config.LOCAL_LLM_URL;
const OPENAI_API_KEY = config.OPENAI_API_KEY;
const LOCAL_LLM_MODEL = (config as any).LOCAL_LLM_MODEL || 'local';

export async function aiGenerate(prompt: string): Promise<string> {
  // Try local LLM endpoint first
  if (LOCAL_LLM_URL) {
    const url = LOCAL_LLM_URL.replace(/\/$/, '');
    try {
      // Case 1: OpenAI-compatible endpoints
      if (/\/v1\/(chat\/completions|completions)$/.test(url)) {
        const isChat = /chat\/completions$/.test(url);
        console.log('[aiGenerate] Trying OpenAI-compatible local at:', url);
        const body = isChat
          ? { model: LOCAL_LLM_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.2 }
          : { model: LOCAL_LLM_MODEL, prompt, max_tokens: 1200, temperature: 0.2 };
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        let handled = false;
        if (r.ok) {
          const j: any = await r.json();
          const text = isChat ? j?.choices?.[0]?.message?.content : j?.choices?.[0]?.text;
          if (typeof text === 'string' && text.trim()) return text;
          console.warn('[aiGenerate] OpenAI-compatible returned unexpected/empty. Keys:', Object.keys(j || {}));
        } else {
          const errText = await r.text().catch(() => '');
          console.warn('[aiGenerate] OpenAI-compatible HTTP error:', r.status, r.statusText, errText);
        }
        // Fallbacks on same host: /v1/completions and Ollama native /api/generate (also try 127.0.0.1 variants)
        const base = url.replace(/\/v1\/(chat\/completions|completions)$/,'');
        const base127 = base.replace('://localhost', '://127.0.0.1');
        const fallbacks = [
          { u: base + '/v1/completions', kind: 'openai-completions' },
          { u: base + '/api/generate', kind: 'ollama' },
          { u: base127 + '/v1/completions', kind: 'openai-completions' },
          { u: base127 + '/api/generate', kind: 'ollama' }
        ];
        for (const f of fallbacks) {
          try {
            console.log('[aiGenerate] Fallback try:', f.u);
            if (f.kind === 'openai-completions') {
              const r2 = await fetch(f.u, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: LOCAL_LLM_MODEL, prompt, max_tokens: 1200, temperature: 0.2 })
              });
              if (r2.ok) {
                const j2: any = await r2.json();
                const text2 = j2?.choices?.[0]?.text;
                if (typeof text2 === 'string' && text2.trim()) return text2;
                console.warn('[aiGenerate] openai-completions fallback unexpected shape. Keys:', Object.keys(j2 || {}));
              } else {
                const errText2 = await r2.text().catch(() => '');
                console.warn('[aiGenerate] openai-completions fallback HTTP error:', r2.status, r2.statusText, errText2);
              }
            } else {
              const r2 = await fetch(f.u, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: LOCAL_LLM_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 1200 } })
              });
              if (r2.ok) {
                const j2: any = await r2.json();
                const text2 = j2?.response ?? j2?.text ?? j2?.generated_text;
                if (typeof text2 === 'string' && text2.trim()) return text2;
                console.warn('[aiGenerate] Ollama fallback returned unexpected shape. Keys:', Object.keys(j2 || {}));
              } else {
                const errText2 = await r2.text().catch(() => '');
                console.warn('[aiGenerate] Ollama fallback HTTP error:', r2.status, r2.statusText, errText2);
              }
            }
          } catch (err) {
            console.warn('[aiGenerate] Fallback try failed:', (err as Error)?.message);
          }
        }
      } else if (/\/api\/generate$/.test(url)) {
        // Case 2: Ollama native generate endpoint
        console.log('[aiGenerate] Trying Ollama generate at:', url);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: LOCAL_LLM_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 1200 } })
        });
        if (!r.ok) {
          console.warn('[aiGenerate] Ollama HTTP error:', r.status, r.statusText);
        } else {
          const j: any = await r.json();
          const text = j?.response ?? j?.text ?? j?.generated_text;
          if (typeof text === 'string' && text.trim()) return text;
          console.warn('[aiGenerate] Ollama returned unexpected shape. Keys:', Object.keys(j || {}));
        }
      } else {
        // Case 3: Base URL; try common candidates
        const base = url;
        const candidates: Array<{ url: string; kind: 'openai-chat' | 'openai-completions' | 'ollama' }> = [
          { url: base + '/v1/chat/completions', kind: 'openai-chat' },
          { url: base + '/v1/completions', kind: 'openai-completions' },
          { url: base + '/api/generate', kind: 'ollama' }
        ];
        for (const c of candidates) {
          try {
            console.log('[aiGenerate] Trying local LLM at:', c.url);
            if (c.kind === 'openai-chat') {
              const r = await fetch(c.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: LOCAL_LLM_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.2 })
              });
              if (!r.ok) { console.warn('[aiGenerate] HTTP error:', r.status, r.statusText); continue; }
              const j: any = await r.json();
              const text = j?.choices?.[0]?.message?.content;
              if (typeof text === 'string' && text.trim()) return text;
            } else if (c.kind === 'openai-completions') {
              const r = await fetch(c.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: LOCAL_LLM_MODEL, prompt, max_tokens: 1200, temperature: 0.2 })
              });
              if (!r.ok) { console.warn('[aiGenerate] HTTP error:', r.status, r.statusText); continue; }
              const j: any = await r.json();
              const text = j?.choices?.[0]?.text;
              if (typeof text === 'string' && text.trim()) return text;
            } else {
              const r = await fetch(c.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: LOCAL_LLM_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 1200 } })
              });
              if (!r.ok) { console.warn('[aiGenerate] HTTP error:', r.status, r.statusText); continue; }
              const j: any = await r.json();
              const text = j?.response ?? j?.text ?? j?.generated_text;
              if (typeof text === 'string' && text.trim()) return text;
            }
          } catch (err) {
            console.warn('[aiGenerate] Local LLM candidate failed:', (err as Error)?.message);
          }
        }
      }
    } catch (e) {
      console.warn('[aiGenerate] Local LLM call failed:', (e as Error)?.message);
      // fall through to OpenAI / fallback
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
