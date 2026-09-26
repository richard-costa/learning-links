from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .store import Store


class VisualizationError(Exception):
    pass


def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def to_dot(store: Store, name: str) -> str:
    topic = store.get_topic(name)
    came_up_in = store.came_up_in(name)
    flagged = store.flagged_from(name)

    lines = [
        "digraph learning_links {",
        '  rankdir="LR";',
        '  graph [pad="0.4", nodesep="0.45", ranksep="0.9"];',
        '  node [shape="box", style="rounded"];',
        f"  {_quote(topic.name)} [shape=doubleoctagon, label={_quote(topic.name)}];",
    ]
    for context, reason, _ in came_up_in:
        lines.append(
            f"  {_quote(context.name)} -> {_quote(topic.name)} "
            f"[label={_quote(reason)}];"
        )
    for other, reason, _ in flagged:
        lines.append(
            f"  {_quote(topic.name)} -> {_quote(other.name)} "
            f"[label={_quote(reason)}];"
        )
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_graph(store: Store, name: str, output: Path, format_name: str) -> Path:
    dot = shutil.which("dot")
    if dot is None:
        raise VisualizationError(
            "Graphviz 'dot' was not found. Install Graphviz or use 'learning-links dot TOPIC' "
            "to export the DOT source."
        )

    output = Path(output)
    if output.parent != Path("."):
        output.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [dot, f"-T{format_name}", "-o", str(output)],
        input=to_dot(store, name),
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "Graphviz failed without an error message"
        raise VisualizationError(detail)
    return output
