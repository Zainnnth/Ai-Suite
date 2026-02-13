# AI Suite CLI (Minimal, Controlled)

This is a lightweight CLI that can call OpenAI or Anthropic with controlled defaults.

## Install

```bash
npm i
```

## Configure

Create `.env` based on `.env.example` and set the keys you are permitted to use.

## Usage

```bash
node src/cli.js --provider openai --model gpt-4o --prompt "Summarize this."
node src/cli.js --provider anthropic --model claude-3-5-sonnet-2024-10-22 --prompt "Draft a short email."
```

Include a file explicitly:

```bash
node src/cli.js --provider openai --model gpt-4o --file .\\notes.txt --prompt "Summarize."
```

## Safety Defaults

 - CLI only (no server)
 - No web browsing
 - No automatic file upload
 - Allowlist of models
 - Keys only via environment variables
