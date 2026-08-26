# Support Agent retrieval service

This service keeps the GTE model and LanceDB local. It discovers the allowlisted Workers Core pages from Cloudflare's `llms.txt`, fetches their Markdown representations, chunks by headings, and stores normalized embeddings in a dated snapshot.

From the repository root, run the shared Bun scripts:

```powershell
bun run retrieval:ingest
bun run retrieval:dev
```

The SvelteKit server calls `POST /retrieve` and keeps the Groq key on the server side.
