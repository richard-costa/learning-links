from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_environment(dotenv_path: Path | None = None) -> None:
    load_dotenv(dotenv_path or PROJECT_ROOT / ".env")