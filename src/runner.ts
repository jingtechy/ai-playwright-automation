import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

function execPromise(cmd: string, opts: any = {}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    exec(cmd, opts, (error, stdout, stderr) => {
      const sOut = typeof stdout === 'string' ? stdout : (stdout ? stdout.toString() : '');
      const sErr = typeof stderr === 'string' ? stderr : (stderr ? stderr.toString() : '');
      resolve({ stdout: sOut, stderr: sErr, code: error ? (error as any).code : 0 });
    });
  });
}

export async function runPlaywrightTest(code: string) {
  // Persist generated scripts under a single folder at project root
  const outDir = path.join(process.cwd(), 'ai-generate');
  await fs.mkdir(outDir, { recursive: true });
  const ts = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fname = `test-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${ts.getMilliseconds()}.js`;
  const file = path.join(outDir, fname);
  await fs.writeFile(file, code, 'utf8');
  // Ensure Playwright is installed in the host project
  const cmd = `node "${file}"`;
  const result = await execPromise(cmd, { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  if (/Cannot find module 'playwright'/.test(result.stderr || '')) {
    result.stderr += '\nHint: run `npm install` and `npm run playwright:install` in the project root.';
  }
  // basic pass/fail: exit code 0 => pass
  const pass = result.code === 0;
  return { pass, stdout: result.stdout, stderr: result.stderr, code: result.code, filePath: file };
}
