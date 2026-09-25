from __future__ import annotations

from .store import Store


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
