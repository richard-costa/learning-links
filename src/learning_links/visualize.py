from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .store import Store


class VisualizationError(Exception):
    pass


def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def to_dot(store: Store) -> str:
    lines = [
        "digraph learning_links {",
        '  rankdir="LR";',
        '  node [shape="box", style="rounded"];',
    ]
    for topic in store.list_topics():
        label = f"{topic.name}\\n[{topic.status}]"
        lines.append(f"  {_quote(topic.name)} [label={_quote(label)}];")
    for relationship in store.relationships():
        lines.append(
            f"  {_quote(relationship.supporting_topic.name)} -> "
            f"{_quote(relationship.topic.name)} [label={_quote(relationship.kind)}];"
        )
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_graph(store: Store, output: Path, format_name: str) -> Path:
    dot = shutil.which("dot")
    if dot is None:
        raise VisualizationError(
            "Graphviz 'dot' was not found. Install Graphviz or use 'learning-links dot' "
            "to export the DOT source."
        )

    output = Path(output)
    if output.parent != Path("."):
        output.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [dot, f"-T{format_name}", "-o", str(output)],
        input=to_dot(store),
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "Graphviz failed without an error message"
        raise VisualizationError(detail)
    return output
