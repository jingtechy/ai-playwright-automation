import { aiGenerate } from './aiAdapter';
import { config } from './config';

function sanitizeCode(raw: string): string {
  if (!raw) return '';
  const match = raw.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw.replace(/^```[a-zA-Z]*\s*/,'').replace(/\s*```$/,'').trim();
}

function normalizePlaywrightCode(code: string, _scenario: string): string {
  let out = code.trim();

  // Strip code fences
  out = out.replace(/^```(?:[a-zA-Z]+)?\n?/, '').replace(/```$/, '').trim();

  const hasChromiumImport = /require\(['"]playwright['"]\)/.test(out);
  const hasAssertImport = /require\(['"]assert['"]\)/.test(out);
  const hasIIFE = /\(async \(\) =>/.test(out);

  // Ensure imports (prepend once)
  if (!hasChromiumImport) out = `const { chromium } = require('playwright');\n` + out;
  if (!hasAssertImport) out = `const assert = require('assert');\n` + out;

  // Wrap if no IIFE present
  if (!hasIIFE) {
    const body = out;
    out = `const { chromium } = require('playwright');\n` +
          (hasAssertImport ? '' : `const assert = require('assert');\n`) +
          `\n(async () => {\n  const browser = await chromium.launch({ headless: false });\n  const context = await browser.newContext();\n  const page = await context.newPage();\n${indentBody(body)}\n  await browser.close();\n})();`;
  }

  // Guarantee browser launch has headless: false
  out = out.replace(/chromium\.launch\(\s*\)/g, 'chromium.launch({ headless: false })');
  if (!/chromium\.launch\([^)]*headless:\s*false/.test(out)) {
    out = out.replace(/chromium\.launch\(/, 'chromium.launch({ headless: false, ');
  }

  // Ensure context & page creation inside IIFE
  if (!/await\s+browser\.newContext\(/.test(out)) {
    out = out.replace(/const\s+browser[^\n]*\n/, m => m + '  const context = await browser.newContext();\n');
  }
  // Replace any browser.newPage() with context.newPage()
  out = out.replace(/await\s+browser\.newPage\(/g, 'await context.newPage(');
  if (!/const\s+page\s*=\s*await\s+context\.newPage\(/.test(out)) {
    out = out.replace(/const\s+context[^\n]*\n/, m => m + '  const page = await context.newPage();\n');
  }
  if (!/await\s+browser\.close\(\)/.test(out)) {
    out = out.replace(/\}\)\(\);?\s*$/, '  await browser.close();\n})();');
  }

  // Normalize relative goto paths
  const base = config.TARGET_SITE.replace(/\/$/, '');
  out = out.replace(/await\s+page\.goto\(['"]\/(.+?)['"]\)/g, (_m, p1) => `await page.goto('${base}/${p1}')`);

  // Insert initial load wait if none present anywhere
  out = out.replace(/(await\s+page\.goto\([^\n]+\);)(?![\s\S]*?waitForLoadState)/, '$1\n  await page.waitForLoadState("domcontentloaded");');
  out = out.replace(/waitForLoadState\((['"])networkidle0\1\)/g, 'waitForLoadState("networkidle")')
           .replace(/waitForLoadState\((['"])networkidle2\1\)/g, 'waitForLoadState("networkidle")');

  // Add waits before interactions & text reads
  out = addImplicitWaits(out);
  out = addTextReadWaits(out);

  // Standardize a simple isChecked console log pattern
  out = out.replace(/console\.log\((await\s+page\.isChecked\([^)]*\))\)/g, 'console.log("IS_CHECKED=" + ($1))');

  // Remove accidental duplicate import lines (small safety net)
  out = out.replace(/^(const \{ chromium \} = require\('playwright'\);\n)(?:const \{ chromium \} = require\('playwright'\);\n)+/m, '$1');
  out = out.replace(/^(const assert = require\('assert'\);\n)(?:const assert = require\('assert'\);\n)+/m, '$1');

  // Deduplicate multiple page declarations
  out = dedupePageDeclarations(out);

  return out.trim();
}

function indentBody(body: string): string {
  return body.split('\n').map(l => '  ' + l).join('\n');
}

function addImplicitWaits(code: string): string {
  const lines = code.split('\n');
  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = line.match(/await\s+page\.(click|fill|check|uncheck|selectOption)\(/);
    if (head) {
      const startIdx = line.indexOf(head[0]) + head[0].length;
      const selectorPart = extractFirstArgument(line, startIdx);
      if (selectorPart) {
        const prevWindow = newLines.slice(-3).join('\n');
        if (!new RegExp(`waitForSelector\\(${escapeRegExp(selectorPart)}`).test(prevWindow)) {
          newLines.push(`  await page.waitForSelector(${selectorPart});`);
        }
      }
    }
    newLines.push(line);
  }
  return newLines.join('\n');
}

// Extracts the first argument substring starting just after the opening '('
// Handles quotes, escapes, and nested parentheses like :nth-child(1)
function extractFirstArgument(line: string, startIdx: number): string | null {
  let argText = '';
  let inQuote: string | null = null;
  let escaped = false;
  let depth = 0;
  for (let j = startIdx; j < line.length; j++) {
    const ch = line[j];
    if (inQuote) {
      argText += ch;
      if (ch === inQuote && !escaped) inQuote = null;
      escaped = ch === '\\' && !escaped;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') { inQuote = ch; argText += ch; escaped = false; continue; }
    if (ch === '(') { depth++; argText += ch; continue; }
    if (ch === ')') { if (depth === 0) break; depth--; argText += ch; continue; }
    if (ch === ',' && depth === 0) break;
    argText += ch;
  }
  const first = argText.trim();
  return first ? first : null;
}

function addTextReadWaits(code: string): string {
  const lines = code.split('\n');
  const newLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = line.match(/await\s+page\.(textContent|innerText)\(/);
    if (head) {
      const startIdx = line.indexOf(head[0]) + head[0].length;
      const selectorPart = extractFirstArgument(line, startIdx);
      if (selectorPart) {
        const prevWindow = newLines.slice(-3).join('\n');
        if (!new RegExp(`waitForSelector\\(${escapeRegExp(selectorPart)}`).test(prevWindow)) {
          newLines.push(`  await page.waitForSelector(${selectorPart});`);
        }
      }
    }
    newLines.push(line);
  }
  return newLines.join('\n');
}

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`); }

function dedupePageDeclarations(code: string): string {
  const lines = code.split('\n');
  const pageDeclIndices: number[] = [];
  let contextPageIndex: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*const\s+page\s*=\s*await\s+browser\.newPage\(/.test(l)) {
      pageDeclIndices.push(i);
    } else if (/^\s*const\s+page\s*=\s*await\s+context\.newPage\(/.test(l)) {
      pageDeclIndices.push(i);
      contextPageIndex = i;
    }
  }
  if (pageDeclIndices.length <= 1) return code; // nothing to do
  const keepIndex = contextPageIndex !== null ? contextPageIndex : pageDeclIndices[0];
  const newLines = lines.filter((_, idx) => !(pageDeclIndices.includes(idx) && idx !== keepIndex));
  return newLines.join('\n');
}

// (Removed scenario-specific dropdown normalization to keep function generic.)

export async function generateTest(scenario: string): Promise<string> {
  const prompt = `You are an assistant that writes Playwright tests in JavaScript (CommonJS).\nTarget site: ${config.TARGET_SITE}\nScenario: ${scenario}\nProduce a single, executable Node.js test script using Playwright (chromium). Include required imports, clear steps, and console.log assertions. Keep it concise and only return code.`;

  const aiRaw = await aiGenerate(prompt);
  const aiOut = sanitizeCode(aiRaw);
  if (aiOut.includes('AI fallback') || !aiOut.trim()) {
    // generic fallback aligned with preferred style (visible browser + context)
    return `const { chromium } = require('playwright');\nconst assert = require('assert');\n(async () => {\n  const browser = await chromium.launch({ headless: false });\n  const context = await browser.newContext();\n  const page = await context.newPage();\n  await page.goto('${config.TARGET_SITE}');\n  await page.waitForLoadState("domcontentloaded");\n  console.log('FALLBACK_TEST');\n  await browser.close();\n})();`;
  }
  return normalizePlaywrightCode(aiOut, scenario);
}
