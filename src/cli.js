#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_PROVIDERS = new Set(["openai", "anthropic"]);
const MODEL_ALLOWLIST = {
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini"
  ],
  anthropic: [
    "claude-3-5-sonnet-2024-10-22",
    "claude-3-5-haiku-2024-10-22",
    "claude-3-opus-20240229"
  ]
};

function printHelp() {
  const help = `
ai-suite-cli (safe defaults)

Usage:
  node src/cli.js --provider <openai|anthropic> --model <model> --prompt "..."
  node src/cli.js --provider openai --model gpt-4o --file ./path/to/file.txt --prompt "..."

Options:
  --provider         openai | anthropic
  --model            model name (must be in allowlist)
  --prompt           user prompt (string). If omitted, reads from stdin.
  --system           system prompt
  --file             include file content (explicit opt-in)
  --stream           stream output (default: true)
  --no-stream        disable streaming
  -h, --help         show help

Environment:
  OPENAI_API_KEY     required for openai
  ANTHROPIC_API_KEY  required for anthropic
`;
  console.log(help.trim());
}

function parseArgs(argv) {
  const args = { stream: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--no-stream") {
      args.stream = false;
      continue;
    }
    if (arg === "--stream") {
      args.stream = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      args[key] = value;
      i += 1;
      continue;
    }
    // Positional prompt fallback
    if (!args.prompt) {
      args.prompt = arg;
    }
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function readFileExplicit(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const stats = fs.statSync(resolved);
  const maxBytes = 1_000_000;
  if (stats.size > maxBytes) {
    throw new Error(`File too large (${stats.size} bytes). Limit is ${maxBytes} bytes.`);
  }
  return fs.readFileSync(resolved, "utf8");
}

function ensureAllowlist(provider, model) {
  if (!ALLOWED_PROVIDERS.has(provider)) {
    throw new Error(`Provider not allowed: ${provider}`);
  }
  const allowed = MODEL_ALLOWLIST[provider] || [];
  if (!allowed.includes(model)) {
    throw new Error(
      `Model not allowed for ${provider}. Allowed: ${allowed.join(", ")}`
    );
  }
}

function buildUserContent(prompt, fileContent, filePath) {
  if (!fileContent) return prompt;
  const header = `\n\n[File: ${filePath}]\n`;
  return `${prompt}${header}${fileContent}`;
}

async function runOpenAI({ model, system, user, stream }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const client = new OpenAI({ apiKey });

  if (stream) {
    const streamResp = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user }
      ]
    });
    for await (const part of streamResp) {
      const token = part.choices?.[0]?.delta?.content;
      if (token) process.stdout.write(token);
    }
    process.stdout.write("\n");
    return;
  }

  const resp = await client.chat.completions.create({
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: user }
    ]
  });
  const text = resp.choices?.[0]?.message?.content ?? "";
  process.stdout.write(text + "\n");
}

async function runAnthropic({ model, system, user, stream }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  if (stream) {
    const streamResp = await client.messages.create({
      model,
      stream: true,
      max_tokens: 1024,
      system: system || undefined,
      messages: [{ role: "user", content: user }]
    });
    for await (const event of streamResp) {
      if (event.type === "content_block_delta") {
        const token = event.delta?.text;
        if (token) process.stdout.write(token);
      }
    }
    process.stdout.write("\n");
    return;
  }

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system: system || undefined,
    messages: [{ role: "user", content: user }]
  });
  const text = resp.content?.[0]?.text ?? "";
  process.stdout.write(text + "\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const provider = args.provider;
  const model = args.model;
  if (!provider || !model) {
    printHelp();
    process.exit(1);
  }
  ensureAllowlist(provider, model);

  let prompt = args.prompt;
  if (!prompt) {
    prompt = await readStdin();
  }
  if (!prompt) {
    throw new Error("No prompt provided. Use --prompt or stdin.");
  }

  let fileContent = null;
  if (args.file) {
    fileContent = readFileExplicit(args.file);
  }
  const user = buildUserContent(prompt, fileContent, args.file);
  const system = args.system || "";
  const stream = args.stream !== false;

  if (provider === "openai") {
    await runOpenAI({ model, system, user, stream });
  } else if (provider === "anthropic") {
    await runAnthropic({ model, system, user, stream });
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
