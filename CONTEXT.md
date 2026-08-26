# support agent

A portfolio demonstration of a support experience that answers questions from a bounded set of official company documents.

## Language

**Support agent**:
The application that retrieves official documents and gives document-grounded answers about one selected company's product.
_Avoid_: chatbot, assistant, bot

**Grounded answer**:
An answer whose factual claims are supported by retrieved official documents and cited to the reader. When the documents do not support an answer, the support agent declines rather than filling gaps with model knowledge.
_Avoid_: best-effort answer, model-knowledge answer

**Portfolio demo**:
A bounded, polished project built to demonstrate engineering judgment and product quality, rather than an official customer-support channel.
_Avoid_: production support service

**Workers Core**:
The selected Cloudflare Workers knowledge area: creating and deploying Workers, request handlers, bindings, environment variables, routes and domains, configuration, limits, logs, and common errors. It excludes separate Cloudflare products such as D1, KV, R2, Queues, Durable Objects, and Workers AI.
_Avoid_: all Cloudflare documentation, Cloudflare developer platform

**Corpus snapshot**:
A dated, immutable ingestion of the approved Workers Core documents. A snapshot is the only document set from which the support agent can answer in a given run.
_Avoid_: live documentation, current web

**Local-first deployment**:
The initial deployment mode in which the UI, retrieval service, vector database, and embedding API run on the developer's computer.
_Avoid_: hosted-first deployment

**Citation**:
An inspectable link between an answer claim and its supporting document passage. A citation includes the source page, section heading, excerpt, URL, and retrieval score.
_Avoid_: source link, references list

**RAG API**:
The local Python service that embeds queries and retrieves passages from the corpus snapshot for the SvelteKit server.
_Avoid_: embedding API, answer API

**Retrieved passage**:
A text segment selected from the active corpus snapshot to support a possible answer. It has a stable identifier that the RAG API resolves into a citation.
_Avoid_: document, source

**Suggested follow-up**:
An AI-generated next question that is relevant to the user's current question and answer. The support agent treats it as a new query and must retrieve evidence before answering it.
_Avoid_: prompt chip, related question

**Conversation context**:
The immediately preceding user question and support-agent answer, supplied with the current question to make a follow-up coherent. It is retained only in the local browser session.
_Avoid_: chat memory, conversation history

**Markdown ingestion**:
The process that discovers Workers Core pages from the official `llms.txt` index and downloads each allowlisted page in Markdown. The downloaded Markdown, URL, fetch time, and content hash form a corpus snapshot.
_Avoid_: HTML scraping, GitHub source ingestion

**Evaluation suite**:
The versioned set of 20 end-to-end questions used to assess a corpus snapshot: 12 answerable questions, 5 unsupported questions, and 3 difficult paraphrases.
_Avoid_: benchmark, test prompt collection

**Dense retrieval**:
The initial retrieval method that compares the local embedding of a question with embeddings of retrieved passages, without hybrid search or a reranker.
_Avoid_: hybrid retrieval, reranking

**Streamed answer**:
The Groq answer text streamed through the SvelteKit server to the interface. Once generation finishes, the server validates every citation identifier against the retrieved-passage set before exposing citations and suggested follow-ups.
_Avoid_: trusted stream, immediately cited answer

**Validation failure**:
A completed streamed answer that includes a missing or invalid citation identifier. The support agent replaces it with an abstention instead of presenting it as an answer.
_Avoid_: partial answer, uncited answer

**Support answer**:
A concise response that gives a direct answer followed by at most three source-supported steps or a small source-supported code or configuration block.
_Avoid_: tutorial, general advice

**Retrieval service**:
The local FastAPI application that loads GTE and LanceDB, provides health status, and returns retrieved passages. It does not generate answers or hold the Groq API key.
_Avoid_: backend, embedding server

**Readiness state**:
The visible status that reports whether the local embedding model and an active corpus snapshot are available before a user can send a question.
_Avoid_: loading spinner, generic error

**Answer details**:
A collapsed interface section that reveals the snapshot date, number of retrieved passages, and retrieval-score range for an answer.
_Avoid_: debug panel, metadata dump

**Support workspace**:
A single-column conversation interface for Workers Core questions. It shows the active snapshot in the header, inline citations and source cards in each completed answer, suggested follow-ups, and a collapsed Answer details section.
_Avoid_: dashboard, source rail

**Example question**:
A curated Workers Core question shown before the first query to demonstrate the corpus boundary and give the user a useful starting point. Selecting one submits it as an ordinary question.
_Avoid_: demo prompt, canned answer

**System theme**:
The interface follows the operating system's light or dark preference without offering a separate theme setting in v1.
_Avoid_: manual theme picker

**Source allowlist**:
The approved Workers Core documentation categories: Overview, Get started, Local development, selected Configuration pages, Platform limits and pricing, Reference, and core Wrangler guidance. It excludes examples, tutorials, changelog, databases, AI, framework guides, and separate Cloudflare products.
_Avoid_: all Workers docs, broad crawl

**Evidence boundary**:
The rule that a retrieved passage can support factual claims but cannot change the support agent's instructions, initiate tools, or supply citations outside the active retrieved-passage set.
_Avoid_: trusted prompt, document instructions
