# Support Agent

A local support desk for Cloudflare Workers. It answers from a dated snapshot of official docs, cites the passages it used, and abstains when the snapshot does not cover the question.

<p align="center">
  <img width="1920" height="1080" alt="Welcome screen" src="https://github.com/user-attachments/assets/ec053405-bcfa-48e9-80ae-f650e50927d1" />
  <br>
  <em>Welcome screen</em>
</p>

<p align="center">
  <img width="1920" height="1080" alt="Example query" src="https://github.com/user-attachments/assets/b2779afa-594e-471e-917d-b191f186fff1" />
  <br>
  <em>An example query</em>
</p>

## How it answers

```text
Browser
  →  POST /api/answer
SvelteKit
  →  POST /retrieve  (question, limit 4)
FastAPI + GTE + LanceDB
  →  numbered passages become the only model context
Groq streams a cited answer
  →  browser checks `[n]` markers, then renders sources
```

The live request does not fetch Cloudflare. Groq only sees the question and those passages. After the stream, the browser discards an answer whose citation markers are missing or out of range.

## Corpus

44 Workers pages, 577 heading-based passages, indexed 26 Aug 2026. Get started, local development, configuration, limits, pricing, reference, and core Wrangler. Not D1, KV, R2, Queues, Durable Objects, Workers AI, examples, or tutorials.

## Stack

| Layer | Tools |
| --- | --- |
| Interface | Svelte 5.56, SvelteKit 2.70, Vite 7, TypeScript 5.9, Bun 1.4 |
| Generation | Vercel AI SDK 5, Groq `openai/gpt-oss-120b` |
| Retrieval | FastAPI, Python 3.13, SentenceTransformers `Alibaba-NLP/gte-multilingual-base`, LanceDB |

## Run locally

[Bun](https://bun.sh) 1.4+, [uv](https://docs.astral.sh/uv/), Python 3.13+, and a [Groq API key](https://console.groq.com).

```bash
git clone https://github.com/Maaz-BinAamir/support-agent.git
cd support-agent
bun install
cp .env.example .env
cp services/retrieval/.env.example services/retrieval/.env
```

Put the Groq key in the root `.env`. First ingest downloads the GTE model and the allowlisted pages.

```bash
bun run retrieval:ingest
bun run retrieval:dev   
bun run dev             
```

If retrieval or Groq is down, the UI still loads with static answers for the three example questions. That is a preview, not a grounded run.

`ARCHITECTURE.md` has the full map. `CONTEXT.md` is the glossary.
