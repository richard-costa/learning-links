import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from learning_links.config import load_environment


def test_loads_dotenv_without_overriding_exported_values():
    with tempfile.TemporaryDirectory() as directory:
        dotenv_path = Path(directory) / ".env"
        dotenv_path.write_text(
            "LEARNING_LINKS_DISABLE_AUTH=1\nDATABASE_URL=postgresql://dotenv/db\n",
            encoding="utf-8",
        )

        with patch.dict(
            os.environ,
            {"DATABASE_URL": "postgresql://environment/db"},
            clear=True,
        ):
            load_environment(dotenv_path)

            assert os.environ["LEARNING_LINKS_DISABLE_AUTH"] == "1"
            assert os.environ["DATABASE_URL"] == "postgresql://environment/db"