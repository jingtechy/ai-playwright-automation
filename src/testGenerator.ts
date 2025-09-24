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

function normalizePlaywrightCode(code: string, scenario: string): string {
  let out = code.trim();

  // 1. Strip surrounding code fences if they slipped through
  out = out.replace(/^```(?:[a-zA-Z]+)?\n?/, '').replace(/```$/,'').trim();

  // 2. Ensure required import
  if (!/require\(['"]playwright['"]\)/.test(out)) {
    out = `const { chromium } = require('playwright');\n` + out;
  }

  // 3. Ensure the script is wrapped in an async IIFE for top-level await usage
  if (!/\(async \(\) =>/.test(out)) {
    // If script already declares const browser/page, just wrap; else create skeleton
    if (/chromium\.launch\(/.test(out)) {
      out = `const { chromium } = require('playwright');\n(async () => {\n${indentBody(out)}\n})();`;
    } else {
      out = `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  ${out.split('\n').join('\n  ')}\n  await browser.close();\n})();`;
    }
  }

  // 4. Guarantee browser & page objects exist inside IIFE
  if (!/const\s+browser\s*=\s*await\s+chromium\.launch/.test(out)) {
    out = out.replace(/\(async \(\) => \{/, '(async () => {\n  const browser = await chromium.launch();');
  }
  if (!/const\s+page\s*=\s*await\s+browser\.newPage/.test(out)) {
    out = out.replace(/const\s+browser[^\n]*\n/, (m) => m + '  const page = await browser.newPage();\n');
  }
  if (!/await\s+browser\.close\(\)/.test(out)) {
    out = out.replace(/\}\)\(\);?\s*$/, '  await browser.close();\n})();');
  }

  // 5. Normalize relative goto paths to absolute using configured target site
  const base = config.TARGET_SITE.replace(/\/$/, '');
  out = out.replace(/await\s+page\.goto\(['"]\/(.+?)['"]\)/g, (_m, p1) => `await page.goto('${base}/${p1}')`);

  // 6. Add a wait for load if missing after first navigation
  out = out.replace(/(await\s+page\.goto\([^\n]+\);)(?![\s\S]*?waitForLoadState)/, '$1\n  await page.waitForLoadState("domcontentloaded");');

  // 7. Add waits before click/fill/select when direct interaction without prior waitForSelector
  out = addImplicitWaits(out);

  // 8. Standardize console logs for assertions: replace bare booleans with labeled outputs
  out = out.replace(/console\.log\((await\s+page\.isChecked\([^)]*\))\)/g, 'console.log("IS_CHECKED=" + ($1))');

  // 9. Deduplicate repeated imports or IIFE wrappers (basic cleanup)
  out = out.replace(/^(?:const { chromium } = require\('playwright'\);\n){2,}/, "const { chromium } = require('playwright');\n");

  // 10. Deduplicate multiple page declarations (keep context-based one if present)
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
    const clickMatch = line.match(/await\s+page\.(click|fill|check|uncheck|selectOption)\(([^)]+)\)/);
    if (clickMatch) {
      const selectorPart = clickMatch[2].split(',')[0].trim();
      // Only add wait if previous two lines do not already wait for this selector
      const prevWindow = newLines.slice(-2).join('\n');
      if (!new RegExp(`waitForSelector\\(${escapeRegExp(selectorPart)}`).test(prevWindow)) {
        newLines.push(`  await page.waitForSelector(${selectorPart});`);
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
    // generic fallback
    return `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('${config.TARGET_SITE}');\n  console.log('FALLBACK_TEST');\n  await browser.close();\n})();`;
  }
  return normalizePlaywrightCode(aiOut, scenario);
}
