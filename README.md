# AI Playwright Test Generator and Runner

Generate end‑to‑end Playwright tests from natural‑language scenarios, edit them inline, and run them in one click. Works with local LLMs (Ollama or OpenAI‑compatible APIs) and optionally OpenAI as a fallback.

## Demo

![Demo of generating and running a test](./demo.gif)

*The UI: enter a scenario, generate code, optionally run immediately, view output and suggestions.*

## Features

- Natural‑language to code: Sends your scenario to an LLM and returns a runnable Playwright script (CommonJS).
- One‑click run: Execute the generated script directly from the web UI; view stdout/stderr and pass/fail.
- Inline editing: Modify the generated code before running; copy or download it.
- AI suggestions: Displays concise edge‑case ideas based on your scenario and code.
- Target site config: Choose the site under test via `TARGET_SITE`; link is shown in the UI.
- Persistent artifacts: Every run is saved under `ai-generate/` (git‑ignored) with a timestamped filename.

## Project Structure

```
public/                # Web UI (single HTML file)
src/
	server.ts           # Express server + API routes
	runner.ts           # Persists and runs generated scripts
	aiAdapter.ts        # LLM integration (local/OpenAI) with robust fallbacks
	testGenerator.ts    # Prompting + Playwright code normalization
	config.ts           # Env loading (.env + .env.example)
ai-generate/           # Generated test scripts (ignored by git)
```

## Prerequisites

- Node.js and npm installed.
- Playwright browsers installed for your platform.

## Setup

1) Install dependencies

```sh
npm install
```

2) Install Playwright browsers

```sh
npm run playwright:install
```

3) Configure environment (optional but recommended)

Copy `.env.example` to `.env` and adjust values as needed.

```sh
cp .env.example .env
```

Environment variables:

- `TARGET_SITE`        Base URL of the site under test (shown in the UI).
- `PORT`               Server port (default: `3000`).
- `LOCAL_LLM_URL`      Local LLM endpoint. Supports:
	- Ollama native: `http://localhost:11434/api/generate`
	- OpenAI chat: `http://localhost:1234/v1/chat/completions`
	- OpenAI completions: `http://localhost:1234/v1/completions`
- `LOCAL_LLM_MODEL`    Model name for your local LLM (e.g., `llama3.1:8b`).
- `OPENAI_API_KEY`     If set, uses OpenAI as a fallback.

Notes:

- The LLM adapter will try multiple shapes and 127.0.0.1 fallbacks automatically when `LOCAL_LLM_URL` points to a base host.
- If no LLM is reachable, a minimal rule‑based fallback script is returned.

## Local LLM Setup (Ollama example)

Default Ollama service address: `http://localhost:11434`  
Native generate endpoint: `http://localhost:11434/api/generate`  
OpenAI‑compatible endpoints (if enabled): `http://localhost:11434/v1/chat/completions` and `/v1/completions`

1. Install Ollama  
	```sh
	brew install ollama
	```
    After installation, sanity check:
    ```sh
	ollama --version
	``` 
2. Pull a model (pick one that fits your RAM/VRAM).  
	```sh
	ollama pull llama3.1:8b
	```
3. Test a quick prompt:  
	```sh
	ollama run llama3.1:8b "Say hi"
	```
4. Set your `.env` (or export vars):  
	```
	LOCAL_LLM_URL=http://localhost:11434/api/generate
	LOCAL_LLM_MODEL=llama3.1:8b
	```
5. Restart the dev server. The app will now first try the local model before any OpenAI fallback.

Health check (optional):
```sh
curl -sS http://localhost:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"llama3.1:8b","prompt":"test","stream":false}' | jq .response
```

If you prefer an OpenAI‑compatible local server (e.g. LM Studio), just point `LOCAL_LLM_URL` to its `/v1/chat/completions` (or `/v1/completions`) endpoint and use the UI’s listed model name in `LOCAL_LLM_MODEL`.

## Run

Dev mode (auto‑reload server):

```sh
npm run dev
```

Build + run:

```sh
npm run build
npm start
```

Open the UI: http://localhost:3000

## Using the Web UI

1) Enter a scenario (e.g., “Login and verify price”).
2) Click “Generate” to produce code, or “Generate & Run” to produce and execute.
3) Edit code if needed, then “Run”.
4) Use “Copy Code” or “Download Script” for reuse. Results and suggestions appear below.

## API Endpoints

- `POST /generate` → `{ scenario }` → `{ code, suggestions }`
- `POST /run` → `{ code }` → `{ pass, stdout, stderr, code, filePath }`
- `POST /generate-and-run` → `{ scenario }` → `{ code, suggestions, result }`
- `GET /config` → `{ targetSite }` for the UI link

Example request:

```sh
curl -sS -X POST http://localhost:3000/generate \
	-H 'Content-Type: application/json' \
	-d '{"scenario":"Login and add first item to cart"}'
```

## Notes on Generation

The normalization step aims to make scripts more stable by adding waits and scaffolding. It is generic and does not contain scenario‑specific logic. You can freely edit the generated test before running.

## Security

Generated scripts are executed locally on your machine. Review the code before running, especially if your LLM is remote or shared.

## License

See `LICENSE` for details.
