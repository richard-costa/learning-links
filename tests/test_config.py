import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from learning_links.config import load_environment


class ConfigTests(unittest.TestCase):
    def test_loads_dotenv_without_overriding_exported_values(self):
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

                self.assertEqual(os.environ["LEARNING_LINKS_DISABLE_AUTH"], "1")
                self.assertEqual(os.environ["DATABASE_URL"], "postgresql://environment/db")


if __name__ == "__main__":
    unittest.main()