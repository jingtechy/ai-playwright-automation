import fs from 'fs/promises';
import os from 'os';
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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-pw-'));
  const file = path.join(tmpDir, 'test.js');
  await fs.writeFile(file, code, 'utf8');
  // Ensure Playwright is installed in the host project; use npx to run node
  const cmd = `node ${file}`;
  const result = await execPromise(cmd, { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  // basic pass/fail: exit code 0 => pass
  const pass = result.code === 0;
  return { pass, stdout: result.stdout, stderr: result.stderr, code: result.code };
}
