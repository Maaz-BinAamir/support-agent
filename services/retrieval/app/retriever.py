from dataclasses import dataclass
from pathlib import Path
from typing import Any

import lancedb
from sentence_transformers import SentenceTransformer


@dataclass
class Passage:
    id: str
    title: str
    section: str
    content: str
    url: str
    score: float


class Retriever:
    def __init__(self, database_path: Path, model_name: str, table_name: str = "passages"):
        self.database_path = database_path
        self.model = SentenceTransformer(model_name, trust_remote_code=True)
        self.database = lancedb.connect(str(database_path))
        self.table = self.database.open_table(table_name)

    def search(self, question: str, limit: int = 4) -> list[Passage]:
        vector = self.model.encode(question, normalize_embeddings=True).tolist()
        rows: list[dict[str, Any]] = self.table.search(vector).limit(limit).to_list()
        return [
            Passage(
                id=row["id"],
                title=row["title"],
                section=row.get("section", ""),
                content=row["content"],
                url=row["url"],
                score=round(1 - float(row.get("_distance", 1)), 4),
            )
            for row in rows
        ]
