from datetime import datetime, timezone
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .retriever import Retriever
from .settings import settings

app = FastAPI(title="Support Agent retrieval service", version="0.1.0")


class RetrieveRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    limit: int = Field(default=4, ge=1, le=8)


@lru_cache(maxsize=1)
def get_retriever() -> Retriever:
    return Retriever(settings.database_path, settings.model_name)


@app.get("/health")
def health() -> dict[str, str | bool]:
    ready = settings.database_path.exists() and settings.snapshot_path.exists()
    return {
        "ok": True,
        "ready": ready,
        "snapshot": str(settings.snapshot_path) if ready else "missing",
    }


@app.post("/retrieve")
def retrieve(payload: RetrieveRequest) -> dict[str, object]:
    try:
        passages = get_retriever().search(payload.question, payload.limit)
    except Exception as exc:  # pragma: no cover - startup failures are surfaced to the UI
        raise HTTPException(status_code=503, detail="Retrieval service is not ready") from exc

    return {
        "indexed_at": datetime.now(timezone.utc).strftime("%d %b %Y"),
        "passages": [passage.__dict__ for passage in passages],
    }


def run() -> None:
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
