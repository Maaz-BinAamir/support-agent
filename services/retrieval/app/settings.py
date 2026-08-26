from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

RETRIEVAL_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RETRIEVAL_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    model_name: str
    database_path: Path
    snapshot_path: Path
    ingest_limit: Optional[int] = None
    host: str
    port: int


settings = Settings()
