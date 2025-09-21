import { aiGenerate } from './aiAdapter';

export async function generateTest(scenario: string): Promise<string> {
  const prompt = `You are an assistant that writes Playwright tests in JavaScript (CommonJS).\nTarget site: https://the-internet.herokuapp.com\nScenario: ${scenario}\nProduce a single, executable Node.js test script using Playwright (chromium). Include required imports, clear steps, and console.log assertions. Keep it concise and only return code.`;

  const aiOut = await aiGenerate(prompt);
  if (aiOut.includes('AI fallback') || !aiOut.trim()) {
    // fallback: generate a checkbox-focused test if scenario mentions checkbox
    if (/checkbox/i.test(scenario)) {
      return `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('https://the-internet.herokuapp.com/checkboxes');\n  const checkboxes = await page.$$('input[type=checkbox]');\n  if (checkboxes.length === 0) {\n    console.error('NO_CHECKBOXES');\n    await browser.close();\n    process.exit(1);\n  }\n  // Toggle first checkbox and assert it's checked\n  await checkboxes[0].check();\n  const checked = await checkboxes[0].isChecked();\n  console.log('CHECKED=' + checked);\n  await browser.close();\n})();`;
    }
    // generic fallback
    return `const { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('https://the-internet.herokuapp.com');\n  console.log('FALLBACK_TEST');\n  await browser.close();\n})();`;
  }
  return aiOut;
}
