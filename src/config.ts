import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const root = process.cwd();

// Load defaults from .env.example (if present) but do not overwrite existing env vars
const examplePath = path.join(root, '.env.example');
if (fs.existsSync(examplePath)) {
  try {
    const parsed = dotenv.parse(fs.readFileSync(examplePath));
    for (const k of Object.keys(parsed)) {
      if (process.env[k] === undefined) process.env[k] = parsed[k];
    }
  } catch (e) {
    // ignore parse errors; proceed with other files
  }
}

// Load project .env (if present)
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export const config = {
  LOCAL_LLM_URL: process.env.LOCAL_LLM_URL ?? '',
  LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL ?? 'llama3.1:8b',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
};

export type Config = typeof config;
