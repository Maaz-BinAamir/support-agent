import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import httpx
import lancedb
from sentence_transformers import SentenceTransformer

from .settings import settings

INDEX_URL = "https://developers.cloudflare.com/workers/llms.txt"
ALLOWED_PREFIXES = (
    "/workers/get-started/",
    "/workers/local-development/",
    "/workers/configuration/",
    "/workers/platform/limits/",
    "/workers/platform/pricing/",
    "/workers/reference/",
    "/workers/wrangler/commands/general/",
    "/workers/wrangler/configuration/",
    "/workers/wrangler/install-and-update/",
)
EXCLUDED_TERMS = ("/examples/", "/tutorials/", "/changelog/", "/databases/", "/framework-guides/")


def discover_urls(markdown_index: str) -> list[str]:
    urls = re.findall(r"https://developers\.cloudflare\.com([^ )]+)", markdown_index)
    selected: list[str] = []
    for path in urls:
        clean_path = path.removesuffix("index.md")
        if clean_path.startswith(ALLOWED_PREFIXES) and not any(term in clean_path for term in EXCLUDED_TERMS):
            selected.append(f"https://developers.cloudflare.com{clean_path}")
    return list(dict.fromkeys(selected))


def split_markdown(markdown: str, url: str) -> Iterable[dict[str, str]]:
    title = "Workers documentation"
    section = "Overview"
    buffer: list[str] = []
    for line in markdown.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
        if line.startswith("## ") or line.startswith("### "):
            if buffer:
                yield {"title": title, "section": section, "content": "\n".join(buffer).strip(), "url": url}
                buffer = []
            section = re.sub(r"^#+ ", "", line).strip()
        elif line.strip():
            buffer.append(line)
    if buffer:
        yield {"title": title, "section": section, "content": "\n".join(buffer).strip(), "url": url}


def main() -> None:
    with httpx.Client(timeout=30, follow_redirects=True, headers={"Accept": "text/markdown"}) as client:
        index = client.get(INDEX_URL).text
        urls = discover_urls(index)
        documents: list[dict[str, str]] = []
        for url in urls:
            markdown = client.get(url).text
            documents.extend(split_markdown(markdown, url))

    if settings.ingest_limit:
        documents = documents[: settings.ingest_limit]

    model = SentenceTransformer(settings.model_name, trust_remote_code=True)
    # Keep CPU ingestion practical while retaining enough context for passage retrieval.
    model.max_seq_length = min(model.max_seq_length, 512)
    rows: list[dict[str, object]] = []
    vectors = model.encode(
        [document["content"] for document in documents],
        normalize_embeddings=True,
        batch_size=8,
        show_progress_bar=True,
    )
    for number, (document, vector) in enumerate(zip(documents, vectors, strict=True)):
        content = document["content"]
        rows.append({
            **document,
            "id": hashlib.sha1(f'{document["url"]}:{number}'.encode()).hexdigest()[:16],
            "vector": vector.tolist(),
        })

    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    settings.snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    database = lancedb.connect(str(settings.database_path))
    if "passages" in database.table_names():
        database.drop_table("passages")
    database.create_table("passages", data=rows)
    settings.snapshot_path.write_text(
        json.dumps({"indexed_at": datetime.now(timezone.utc).isoformat(), "pages": urls, "passages": len(rows)}, indent=2),
        encoding="utf-8",
    )
    print(f"Indexed {len(rows)} passages from {len(urls)} pages")
