import { aiGenerate } from './aiAdapter';

function sanitizeCode(raw: string): string {
  if (!raw) return '';
  const match = raw.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw.replace(/^```[a-zA-Z]*\s*/,'').replace(/\s*```$/,'').trim();
}

function normalizePlaywrightCode(code: string, scenario: string): string {
  let out = code;
  // Normalize common checkbox selectors from the-internet.herokuapp.com/checkboxes
  if (/checkbox/i.test(scenario) || /\/checkboxes/.test(code)) {
    out = out
      .replace(/#checkbox1/g, '#checkboxes input[type="checkbox"]:nth-of-type(1)')
      .replace(/#checkbox2/g, '#checkboxes input[type="checkbox"]:nth-of-type(2)')
      .replace(/#checkboxes\s*>\s*:nth-child\(\s*1\s*\)/g, '#checkboxes input[type="checkbox"]:nth-of-type(1)')
      .replace(/#checkboxes\s*>\s*:nth-child\(\s*2\s*\)/g, '#checkboxes input[type="checkbox"]:nth-of-type(2)');

    // Ensure an explicit wait after navigating to /checkboxes
    if (/goto\([^)]*\/checkboxes["']\)/.test(out) && !/waitForSelector\([^)]*#checkboxes input\[type=\"checkbox\"\]/.test(out)) {
      out = out.replace(
        /(await\s+page\.goto\([^)]*\/checkboxes["']\)\s*;)/,
        `$1\n  await page.waitForSelector('#checkboxes input[type="checkbox"]');`
      );
    }
  }
  return out;
}

export async function generateTest(scenario: string): Promise<string> {
  const prompt = `You are an assistant that writes Playwright tests in JavaScript (CommonJS).\nTarget site: https://the-internet.herokuapp.com\nScenario: ${scenario}\nProduce a single, executable Node.js test script using Playwright (chromium). Include required imports, clear steps, and console.log assertions. Keep it concise and only return code.`;

  const aiRaw = await aiGenerate(prompt);
  const aiOut = sanitizeCode(aiRaw);
  if (aiOut.includes('AI fallback') || !aiOut.trim()) {
    // fallback: generate a checkbox-focused test if scenario mentions checkbox
    if (/checkbox/i.test(scenario)) {
      return `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('https://the-internet.herokuapp.com/checkboxes');\n  const checkboxes = await page.$$('input[type=checkbox]');\n  if (checkboxes.length === 0) {\n    console.error('NO_CHECKBOXES');\n    await browser.close();\n    process.exit(1);\n  }\n  // Toggle first checkbox and assert it's checked\n  await checkboxes[0].check();\n  const checked = await checkboxes[0].isChecked();\n  console.log('CHECKED=' + checked);\n  await browser.close();\n})();`;
    }
    // generic fallback
    return `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('https://the-internet.herokuapp.com');\n  console.log('FALLBACK_TEST');\n  await browser.close();\n})();`;
  }
  return normalizePlaywrightCode(aiOut, scenario);
}
