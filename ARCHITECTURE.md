# Support Agent architecture

This document explains how the Support Agent is arranged, where each responsibility lives, and what happens when a user asks a question.

The project is a local-first portfolio demo for answering questions about a bounded set of Cloudflare Workers documentation. It has two separate runtime processes:

1. A SvelteKit application. It renders the interface, accepts questions, calls retrieval, calls Groq, and streams answers to the browser.
2. A Python FastAPI retrieval service. It loads a local embedding model and a local LanceDB table, then returns the passages closest to a question.

There is also a one-off ingestion process that builds or replaces the local document index. Ingestion is not part of the request path.

## The short version

The live question path looks like this:

```text
Browser
  |
  | POST /api/answer { question }
  v
SvelteKit server route
  |
  | POST /retrieve { question, limit: 4 }
  v
FastAPI retrieval service
  |
  | embed question -> vector search
  v
Local SentenceTransformer model + LanceDB table
  |
  | four closest passages
  v
SvelteKit server route
  |
  | retrieved passages become the only model context
  | Groq streams a grounded answer
  v
Browser
  |
  | validates citation markers, renders Markdown,
  | shows source cards and answer details
  v
Conversation UI
```

The index-building path is separate:

```text
Cloudflare workers/llms.txt
  -> allowlisted documentation URLs
  -> Markdown downloads
  -> heading-based passages
  -> normalized GTE embeddings
  -> LanceDB `passages` table
  -> `data/snapshots/latest.json`
```

## Repository map

```text
support-agent/
├── package.json                    Frontend commands and JavaScript dependencies
├── bun.lock                        Locked frontend dependency graph
├── .env.example                    Frontend environment variable template
├── CONTEXT.md                      Project glossary and product rules
├── ARCHITECTURE.md                 This document
├── svelte.config.ts                SvelteKit adapter configuration
├── vite.config.ts                  Vite and SvelteKit plugin configuration
├── tsconfig.json                   Strict TypeScript configuration
├── src/
│   ├── app.html                    HTML shell around the SvelteKit app
│   ├── app.d.ts                    SvelteKit application type declarations
│   ├── app.css                     Global layout, typography, themes, and responsive CSS
│   ├── lib/
│   │   ├── types.ts                Shared frontend response and message types
│   │   ├── demo-data.ts            Offline preview questions, answers, and citations
│   │   └── markdown.ts             Safe, small Markdown renderer for model output
│   └── routes/
│       ├── +layout.svelte          Imports global CSS and renders the route slot
│       ├── +page.ts                Disables SSR for the interactive page
│       ├── +page.svelte            Main interface and client-side conversation state
│       └── api/answer/+server.ts   Server-side retrieval, generation, and streaming route
└── services/
    └── retrieval/
        ├── README.md               Retrieval-specific run instructions
        ├── pyproject.toml          Python dependencies and console scripts
        ├── uv.lock                 Locked Python dependency graph
        ├── .env.example            Retrieval service configuration template
        ├── app/
        │   ├── settings.py         Environment-backed settings
        │   ├── ingest.py           Documentation discovery and index creation
        │   ├── retriever.py        Embedding model and LanceDB search wrapper
        │   └── main.py             FastAPI app and HTTP endpoints
        └── data/
            ├── lancedb/            Local vector database files
            └── snapshots/latest.json  Index metadata for the latest ingestion
```

The repository also contains generated or machine-managed directories such as `node_modules/`, `.svelte-kit/`, `.pnpm-store/`, `.uv-cache/`, and the Python virtual environment. They support local development but do not define the application architecture.

## The main concepts

The code uses a small set of important concepts.

### Corpus snapshot

The corpus is a local LanceDB table created by `services/retrieval/app/ingest.py`. The current checked-in snapshot metadata says it contains 577 passages from 44 Cloudflare Workers pages and was indexed on 26 Aug 2026.

The snapshot is intended to bound what the application can answer. The retrieval service searches this table only. It does not fetch Cloudflare documentation during a user request.

### Retrieved passage

A passage is one heading-based chunk of a downloaded documentation page. The retrieval service returns:

```text
id, title, section, content, url, score
```

The `id` is stable for the passage generated at a particular URL and passage position. The `score` is derived from LanceDB's distance value as `1 - distance`, then rounded to four decimal places.

### Citation

The server turns every retrieved passage into citation metadata. The browser displays that metadata as a source card with the page title, section, excerpt, URL, and score.

The generated answer refers to passages using markers such as `[1]` and `[2]`. The browser removes those markers from the visible answer after validating that they point to the retrieved citation list.

### Support message

The browser stores user and assistant messages in a Svelte 5 `$state` array. A message can contain its content, status, citations, follow-ups, and retrieval details. This state is in memory only. A page refresh starts a new conversation.

### Demo answer

The demo answer is a client-side fallback. It exists so the interface can be explored without a working retrieval service or Groq key. It is not produced by the live retrieval and generation pipeline.

## Frontend structure

### `src/app.html`

This is the outer HTML document generated by SvelteKit. It sets the document language, viewport, inline favicon, and SvelteKit body/head placeholders.

The body uses `data-sveltekit-preload-data="hover"`, which lets SvelteKit preload route data on link hover. The current page does not load server data, but the setting is still part of the document shell.

### `src/routes/+layout.svelte`

The layout imports `src/app.css` and renders `<slot />`. There are no shared layout components, navigation stores, or layout-level data loaders.

### `src/routes/+page.ts`

```ts
export const ssr = false;
```

This makes the page client-only. The browser owns the conversation state and streaming updates. The server still handles `/api/answer`, because the API route is a separate SvelteKit server endpoint.

### `src/routes/+page.svelte`

This is the main product surface. It contains both the page markup and the client-side question workflow.

The local state is:

| State | Meaning |
| --- | --- |
| `question` | Current contents of the textarea |
| `isSubmitting` | Blocks duplicate submissions and changes the send button to a spinner |
| `showDetails` | ID of the answer whose retrieval details are open, or `null` |
| `messages` | In-memory sequence of user and assistant messages |
| `composer` | Reference to the textarea so example selection can focus it |

The derived state is:

| Derived value | Rule |
| --- | --- |
| `canSubmit` | The trimmed question is non-empty and no request is active |
| `hasMessages` | The conversation contains at least one message |

The component uses Svelte 5 runes, including `$state` and `$derived`.

#### Initial view

When `messages` is empty, the page shows three example questions from `src/lib/demo-data.ts`. Clicking an example fills the textarea and focuses it. The current implementation does not submit the example automatically. The user must press Enter or click the send button.

Once a question is submitted, the starter grid disappears and the conversation view is rendered.

#### Submit flow in the browser

`submitQuestion()` does the following:

1. Trims the question and exits if it is empty or another request is active.
2. Clears the textarea and sets `isSubmitting` to `true`.
3. Adds a user message to `messages`.
4. Adds an empty assistant message with `status: 'streaming'`.
5. Waits for Svelte to update the DOM, then scrolls to `#conversation-end`.
6. Calls `getAnswer()`.
7. Handles either a real text stream or a complete `AnswerResponse` from the demo fallback.
8. Stores citations and retrieval details on the assistant message.
9. Marks the message complete, or replaces it with an error message if the request fails.
10. Clears the submitting state and scrolls to the bottom again.

The generated answer is streamed by reading the `ReadableStream` with a `ReadableStreamDefaultReader`. Each received chunk is decoded with `TextDecoder`, appended to the assistant message, and followed by `tick()` so the UI visibly updates while the model writes.

#### Citation validation in the browser

After the stream ends, the browser extracts citation markers with this pattern:

```text
\[(\d+)\]
```

It accepts the answer when it contains at least one marker and every marker is between 1 and the number of citations supplied in the response metadata. It also accepts an answer that contains one of the configured abstention phrases, such as "I couldn't verify" or "I don't have enough evidence".

If neither condition is true, the browser replaces the response with:

```text
I couldn't verify this answer against the indexed Workers documentation.
```

It also clears citations and follow-ups and marks the message as failed.

This check validates marker shape and range. It does not independently compare each factual sentence with the source excerpt, and it attaches all retrieved passages as source cards even when the answer cites only some of them.

#### Follow-up extraction

The server instructs Groq to finish with a line in this format:

```text
FOLLOW_UPS: question one || question two
```

The browser finds that line, splits it on `||`, trims each item, removes empty items, and keeps at most three. It removes the line before rendering the answer.

Clicking a follow-up calls `submitQuestion(followUp)`. It becomes a new user message and takes the same retrieval path as any other question. The current implementation does not send the previous answer as context with that new request.

#### Rendering the message list

User messages render as right-aligned articles labelled "You asked".

Assistant messages render as:

- a status heading showing `Writing`, `Offline`, or `Grounded`;
- Markdown answer content;
- source cards when citations exist;
- suggested follow-up buttons when follow-ups exist;
- a collapsed `Answer details` control for completed answers.

The details panel displays the indexed date string, number of retrieved passages, and score range returned by the server.

### `src/lib/types.ts`

This file contains the frontend data shapes.

`Citation` is the browser-facing source record. It has the passage ID, document title, section, excerpt, URL, and score.

`SupportMessage` is intentionally flexible because a message changes during its lifecycle. A new assistant message starts with streaming status and no citations. A completed message receives its answer metadata. A failed message may contain only an error string and status.

`AnswerResponse` represents a complete non-streaming response. The live endpoint usually returns a text stream plus metadata in a header, while the demo fallback returns this complete shape directly.

### `src/lib/demo-data.ts`

This file supplies the offline preview.

It defines:

- three example questions;
- three sample citations;
- a static indexed date of `25 Aug 2026`;
- direct answers for the exact example-question strings;
- a generic abstention-style response for other questions.

`getDemoAnswer()` is used whenever `fetch('/api/answer')` throws or returns a non-OK response. That means a missing Groq key or stopped retrieval process does not necessarily show the server's 503 message in the UI. The page falls back to the local preview instead.

### `src/lib/markdown.ts`

The model output is rendered with Svelte's `{@html ...}` block, so this helper is also a security boundary.

The renderer first escapes HTML-sensitive characters. It then supports the small Markdown subset needed by the prompt:

- paragraphs;
- headings from level 1 through level 3;
- ordered and unordered lists;
- fenced code blocks;
- inline code;
- bold and italic text.

It does not support links, images, tables, blockquotes, nested lists, or arbitrary HTML. Escaping happens before the renderer adds its own tags, which prevents model text from injecting arbitrary markup through the answer.

### `src/app.css`

The stylesheet is global and owns the visual system. It defines:

- the dark green base palette and lime accent;
- a light-mode override using `prefers-color-scheme: light`;
- the centered 1040px page shell;
- hero, starter cards, composer, conversation, source cards, follow-ups, and detail panels;
- streaming cursor, loading spinner, and rise animations;
- a mobile breakpoint at 760px.

The page uses a single-column reading layout on desktop. Example cards sit in a three-column grid and become horizontally scrollable cards on small screens. The footer and composer also collapse vertically on small screens.

## Server-side answer route

The live answer endpoint is `src/routes/api/answer/+server.ts`. Its public URL is:

```text
POST /api/answer
Content-Type: application/json

{ "question": "How do I deploy a Worker?" }
```

The route is the only place that holds the Groq integration. The browser never receives the Groq API key.

### Request validation

The route parses the request body and trims `body.question`.

- Missing or empty questions return HTTP 400 with `A question is required.`
- Missing `GROQ_API_KEY` returns HTTP 503 with `Groq is not configured.`

There is no explicit maximum length in this TypeScript route. The downstream retrieval service accepts questions from 2 through 1000 characters, so longer input will fail there and reach the browser fallback path.

### Retrieval call

The route reads `RETRIEVAL_API_URL` from SvelteKit's private runtime environment. It defaults to:

```text
http://127.0.0.1:8788
```

It sends:

```json
{
  "question": "...",
  "limit": 4
}
```

If the retrieval request cannot be made or returns a non-OK response, the route returns HTTP 503. The browser then uses the demo fallback because it treats all non-OK responses as preview mode.

### No-passage response

If retrieval returns an empty `passages` array, the route does not call Groq. It returns a complete JSON response saying that the question could not be verified against the indexed Workers Core documentation.

This is the clean abstention path for a question with no matching evidence.

### Prompt construction

For a non-empty result, the route numbers passages in retrieval order:

```text
[1] Page title / Section heading
Passage content

[2] Another page / Another section
Passage content
```

That combined text becomes the model's retrieved context. The model receives the user's question and this context in the prompt.

The system instruction tells the model to:

- answer only from retrieved passages;
- stay concise;
- avoid browsing, tools, and invented facts;
- end every factual sentence with one or more passage markers;
- abstain when the passages do not support the answer;
- finish with the exact `FOLLOW_UPS:` format;
- omit URLs from the generated text.

Groq is configured with the `openai/gpt-oss-120b` model and temperature `0.1`.

### Streaming response and metadata

The route calls `streamText()` from the Vercel AI SDK and returns `result.toTextStreamResponse()`.

The response body contains plain text chunks. The route also sends an `x-workers-metadata` header. Its value is base64-encoded JSON containing:

```json
{
  "citations": [
    {
      "id": "...",
      "title": "...",
      "section": "...",
      "excerpt": "first 360 characters of the passage",
      "url": "...",
      "score": 0.91
    }
  ],
  "indexedAt": "26 Aug 2026",
  "followUps": [],
  "retrievedCount": 4,
  "scoreRange": "0.91–0.74"
}
```

The `followUps` field is empty in this header because follow-ups are generated inside the text stream and extracted by the browser after the stream ends.

The server uses the retrieval response's `indexed_at` value for `indexedAt`. The current retrieval endpoint generates that value from the current request time. It does not read the `indexed_at` value from `data/snapshots/latest.json`. Therefore the UI's `Snapshot` detail currently shows the retrieval request date, not a verified snapshot version.

## Retrieval service

The retrieval service is a small FastAPI application under `services/retrieval/app/`.

### `settings.py`

`Settings` uses Pydantic Settings and reads the `.env` file located next to the retrieval service. The runtime requires the model, database, snapshot, host, and port values from that file. Only `INGEST_LIMIT` is optional.

| Setting | Required in `.env` | Used by |
| --- | --- | --- |
| `MODEL_NAME` | yes | SentenceTransformer loading and encoding |
| `DATABASE_PATH` | yes | LanceDB connection |
| `SNAPSHOT_PATH` | yes | Readiness check and ingestion metadata |
| `INGEST_LIMIT` | no | Optional passage truncation during ingestion |
| `HOST` | yes | Uvicorn bind address |
| `PORT` | yes | Uvicorn listen port |

The relative paths resolve from the process working directory. The root package scripts use `uv --directory services/retrieval`, so the normal commands resolve them beneath `services/retrieval/`.

### `retriever.py`

`Retriever` owns the live search dependencies:

1. It loads `SentenceTransformer(model_name, trust_remote_code=True)`.
2. It connects to LanceDB at the configured database path.
3. It opens the `passages` table.
4. It encodes a question with normalized embeddings.
5. It asks LanceDB for the requested number of nearest rows.
6. It maps rows into the `Passage` dataclass.

The model and table are created lazily by `get_retriever()` in `main.py`. `@lru_cache(maxsize=1)` keeps one loaded retriever for the process. The first request that reaches `/retrieve` pays the model-loading cost.

The search method defaults to four results. The HTTP endpoint allows between one and eight, and the SvelteKit route always requests four.

### `main.py`

The FastAPI app exposes two endpoints.

#### `GET /health`

This endpoint returns:

```json
{
  "ok": true,
  "ready": true,
  "snapshot": "data/snapshots/latest.json"
}
```

`ready` is true when both the configured LanceDB path and snapshot path exist. It does not load the embedding model or open the LanceDB table, so it confirms file presence rather than complete search readiness.

The frontend does not call `/health` today. The send button remains usable even when the retrieval service is stopped.

#### `POST /retrieve`

The request model requires:

| Field | Rule |
| --- | --- |
| `question` | String, minimum length 2, maximum length 1000 |
| `limit` | Integer from 1 through 8, default 4 |

The endpoint calls the cached retriever. Any retriever exception becomes HTTP 503 with `Retrieval service is not ready`.

On success, it returns:

```json
{
  "indexed_at": "26 Aug 2026",
  "passages": [
    {
      "id": "...",
      "title": "...",
      "section": "...",
      "content": "...",
      "url": "https://developers.cloudflare.com/...",
      "score": 0.91
    }
  ]
}
```

As noted above, `indexed_at` is formatted from `datetime.now(timezone.utc)` at request time. It is not loaded from the snapshot metadata file.

### `ingest.py`

Ingestion rebuilds the local corpus.

#### URL discovery

The process downloads:

```text
https://developers.cloudflare.com/workers/llms.txt
```

`discover_urls()` extracts Cloudflare developer URLs with a regular expression. It keeps URLs under these prefixes:

- `/workers/get-started/`
- `/workers/local-development/`
- `/workers/configuration/`
- `/workers/platform/limits/`
- `/workers/platform/pricing/`
- `/workers/reference/`
- `/workers/wrangler/commands/general/`
- `/workers/wrangler/configuration/`
- `/workers/wrangler/install-and-update/`

It removes a trailing `index.md`, excludes paths containing `/examples/`, `/tutorials/`, `/changelog/`, `/databases/`, or `/framework-guides/`, and de-duplicates the resulting URLs while preserving their order.

#### Markdown splitting

`split_markdown()` creates passages by heading boundaries.

- The document title starts as `Workers documentation` and changes when an H1 is found.
- The section starts as `Overview`.
- H2 and H3 headings flush the current buffer into a passage, then become the next section name.
- Blank lines are discarded.
- All other non-empty lines are kept in the passage content.

The splitter does not use token counts, character limits, semantic boundaries, or overlap. A large section remains one large passage.

#### Embedding and table creation

The ingestion model is the same configured SentenceTransformer model used for retrieval. Ingestion reduces `model.max_seq_length` to at most 512 and encodes passages in batches of eight with normalized embeddings.

Each LanceDB row contains the source fields, a short SHA-1-based ID, and the embedding vector:

```text
title, section, content, url, id, vector
```

The ID is the first 16 characters of the SHA-1 hash of `URL:number`, where `number` is the position of the passage in the flattened document list.

If `INGEST_LIMIT` is set, the code truncates the flattened passage list before embedding. It does not limit the number of URLs fetched.

Before creating the new table, ingestion drops the existing `passages` table if it exists. It then creates a fresh table and writes `data/snapshots/latest.json` with:

```json
{
  "indexed_at": "2026-08-26T06:49:16.450464+00:00",
  "pages": ["..."],
  "passages": 577
}
```

The current implementation does not save the downloaded raw Markdown, fetch timestamps per page, or content hashes, even though those details are described as part of the corpus snapshot in `CONTEXT.md`. The actual durable data is the LanceDB table plus the summary JSON file.

The table replacement is also not atomic. A failed run during replacement can leave the local index incomplete or unavailable.

## Configuration and secrets

There are two environment files with separate responsibilities.

### Root `.env`

The root environment is used by the SvelteKit application. The template contains:

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Server-only credential used to call Groq |
| `RETRIEVAL_API_URL` | Base URL for the Python retrieval service |

The Groq key is read through `$env/dynamic/private`, so it is not intended for client bundles.

### `services/retrieval/.env`

The retrieval service template contains the model, paths, and server settings listed in the `settings.py` table. It does not need the Groq key.

The default local setup uses:

```text
Frontend:  Vite/SvelteKit on its default dev port
Retrieval: 127.0.0.1:8788
```

The frontend talks to its own `/api/answer` route. The browser does not call port 8788 directly.

## Local development lifecycle

### First setup

The JavaScript dependencies are described by `package.json` and locked in `bun.lock`. The Python dependencies are described by `services/retrieval/pyproject.toml` and locked in `services/retrieval/uv.lock`.

The GTE model may need to be downloaded the first time `SentenceTransformer` starts. The retrieval database must already exist for search to work, which normally means running ingestion once.

### Build the index

From the repository root:

```powershell
bun run retrieval:ingest
```

That executes `app.ingest:main` from the `services/retrieval` directory through `uv`.

### Start the retrieval service

```powershell
bun run retrieval:dev
```

That imports `app.main.run()`, which starts Uvicorn on the configured host and port.

### Start the frontend

In another terminal:

```powershell
bun run dev
```

This runs `vite dev`. It does not start the Python service.

### Useful project commands

| Command | What it does |
| --- | --- |
| `bun run check` | Runs SvelteKit sync and `svelte-check` with strict TypeScript settings |
| `bun run build` | Creates the production SvelteKit/Vite build |
| `bun run preview` | Serves the production build locally |
| `bun run format` | Runs Prettier across the project |
| `bun run retrieval:ingest` | Rebuilds the local documentation index |
| `bun run retrieval:dev` | Starts FastAPI/Uvicorn on port 8788 by default |

There is currently no test script and no test directory in the repository. Type checking and the production build are the main automated checks exposed by `package.json`.

## End-to-end request walkthrough

Suppose the user asks, "How do I configure a route for a Worker?"

1. The textarea handler calls `submitQuestion()`.
2. The browser appends the question and an empty streaming assistant message.
3. `getAnswer()` sends JSON to `/api/answer` on the SvelteKit origin.
4. The server checks that the question is non-empty and that `GROQ_API_KEY` exists.
5. The server sends the question and `limit: 4` to `RETRIEVAL_API_URL/retrieve`.
6. FastAPI validates the question length.
7. The cached retriever encodes the question with GTE.
8. LanceDB searches the `passages` table and returns up to four nearest rows.
9. FastAPI maps each row into a passage response and adds a formatted date string.
10. The SvelteKit route turns the passages into numbered context blocks and citation metadata.
11. Groq receives the question and numbered passages, with instructions to cite each factual sentence and end with follow-ups.
12. The server begins sending model text to the browser as a plain-text stream.
13. The browser appends each chunk to the visible assistant message.
14. After the stream closes, the browser parses follow-ups and citation markers.
15. If markers are valid, the browser strips markers from displayed prose, attaches citation cards, and marks the message `complete`.
16. If markers are missing or out of range and the answer is not an abstention, the browser replaces it with a verification failure.

## Failure and fallback behavior

The failure behavior is split between the SvelteKit server and the browser.

| Situation | Server behavior | Browser behavior |
| --- | --- | --- |
| Empty question | HTTP 400 | `getAnswer()` falls back to demo only if called, but normal UI prevents submission |
| Missing Groq key | HTTP 503 | Uses local demo answer |
| Retrieval process stopped | HTTP 503 | Uses local demo answer |
| Retrieval returns no passages | JSON abstention | Displays the abstention as a completed response with no source cards |
| Groq stream has no valid citation markers | Stream completes | Replaces answer with a verification failure and marks it offline |
| Network or JSON parsing failure in the browser | No usable response | Uses local demo answer |

The demo fallback is helpful for product review, but it changes the meaning of what the user sees. A response shown in preview mode may look like a grounded answer while it was actually read from `demo-data.ts`. There is no visible mode indicator for that distinction.

## What is intentionally local and what is not

Local components:

- the SvelteKit conversation state;
- the Python process;
- the GTE embedding model cache;
- the LanceDB database;
- the corpus snapshot metadata;
- the demo answer data.

External calls:

- ingestion calls Cloudflare's `llms.txt` index and documentation pages;
- the live answer route calls Groq for generation.

The live user request does not call Cloudflare. It searches the already-ingested local table.

## Current implementation gaps and important caveats

These are the places where the current code is narrower than the product language in `CONTEXT.md`, or where a future maintainer could make a wrong assumption.

### Readiness is not connected to the UI

FastAPI exposes `/health`, but the SvelteKit page never calls it. The UI does not know whether the embedding model is loaded or whether the table can be opened before the user submits a question.

### The displayed snapshot date is not a snapshot identifier

Ingestion writes an ISO timestamp into `data/snapshots/latest.json`, but `/retrieve` reports the current date. The answer detail labelled `Snapshot` is therefore not enough to identify the data version that produced an answer.

### Conversation context is visual only

The page keeps earlier messages in the browser and renders them, but it sends only the current question to `/api/answer`. Follow-up questions are coherent only when their wording is independently understandable or when the model can answer from the newly retrieved passages.

### Demo mode is silent

The client falls back to static demo answers for any non-OK response from `/api/answer`. There is no badge or metadata field telling the reader that the displayed answer did not come from retrieval and Groq.

### Ingestion replaces the table in place

The existing table is dropped before the new table is created. There is no temporary table, atomic swap, rollback, or previous snapshot retention.

### Ingestion metadata is incomplete

The current JSON file records the page list and total passage count. It does not contain the raw Markdown, per-page fetch times, or content hashes described by the project glossary.

### Passage splitting is simple

Heading splitting is easy to understand, but it can create passages that are too large or too small for ideal retrieval. There is no overlap, token-aware chunking, reranking, hybrid search, or relevance threshold.

### Citation validation is structural, not semantic

The browser checks that markers point to positions in the returned list. It does not verify that marker `[1]` actually supports the sentence that uses it. The model prompt carries the semantic responsibility, with the browser providing a final format and range check.

## Where to make common changes

| Change | Start here |
| --- | --- |
| Change page layout or colors | `src/app.css` |
| Change visible copy or page sections | `src/routes/+page.svelte` |
| Change question submission behavior | `src/routes/+page.svelte`, especially `submitQuestion()` and `getAnswer()` |
| Change the live answer prompt or Groq model | `src/routes/api/answer/+server.ts` |
| Change retrieval count | `src/routes/api/answer/+server.ts`, the `limit: 4` request body |
| Change citation or message fields | `src/lib/types.ts` and both server/client consumers |
| Change offline preview behavior | `src/lib/demo-data.ts` and `getAnswer()` in `+page.svelte` |
| Change Markdown output support | `src/lib/markdown.ts` |
| Change allowed documentation categories | `services/retrieval/app/ingest.py`, `ALLOWED_PREFIXES` and `EXCLUDED_TERMS` |
| Change passage boundaries | `services/retrieval/app/ingest.py`, `split_markdown()` |
| Change embedding model or database paths | `services/retrieval/app/settings.py` and the retrieval `.env` |
| Change retrieval scoring or mapping | `services/retrieval/app/retriever.py` |
| Add or change retrieval endpoints | `services/retrieval/app/main.py` |
| Change ingestion output or table replacement | `services/retrieval/app/ingest.py` |
| Change local ports and startup binding | Root `.env` for the frontend URL, retrieval `.env` for `HOST` and `PORT` |

## A practical mental model for maintaining the app

Keep these boundaries in mind:

1. The browser owns presentation and temporary conversation state.
2. The SvelteKit endpoint owns secrets, retrieval orchestration, prompt construction, and streaming.
3. The Python service owns embeddings and vector search, but never answer generation.
4. The ingestion script owns the corpus boundary and database rebuild.
5. The LanceDB table owns searchable passage content and vectors.
6. The snapshot JSON describes the index at a high level, but the current request path does not use it to label answers.

If a change crosses one of these boundaries, update the data shape on both sides and check the fallback behavior. Most bugs in this app will come from a mismatch between the streamed text, the metadata header, and the browser's final message state, or from assuming that the static demo path has the same guarantees as the live path.
