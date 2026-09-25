# learning-links

A small tool for building and visualizing prerequisite and helpful relationships between topics for self-directed learning.

The first version is intentionally manual:

- topics as nodes;
- `prerequisite` and `helpful` relationships as directed edges;
- manual creation, editing, and deletion;
- reverse lookup: “what does this topic support?”;
- a direct-support importance count;
- Graphviz DOT export.

Automatic discovery, Wikipedia integration, and LLM suggestions are deliberately out of scope for v0.1.

## Install

Requires Python 3.11+.

For bash/zsh:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
```

For fish:

```fish
python -m venv .venv
source .venv/bin/activate.fish
python -m pip install -e .
```

## Example

```bash
learning-links add "Parsing" --url "https://en.wikipedia.org/wiki/Parsing"
learning-links add "Formal Grammar" --status later
learning-links add "Compilers"

learning-links link "Parsing" "Formal Grammar" --kind helpful
learning-links link "Compilers" "Formal Grammar" --kind prerequisite

learning-links show "Formal Grammar"
learning-links important
learning-links dot -o graph.dot
```

`link TOPIC SUPPORTING_TOPIC` means the second topic supports learning the first. Visualization edges therefore point from the supporting topic to the topic being learned.

By default data is stored in `learning-links.db`. Override it with `--db PATH` or `LEARNING_LINKS_DB`.

## Commands

```text
learning-links add NAME [--url URL] [--status planned|learning|learned|later]
learning-links list
learning-links edit NAME [--name NEW_NAME] [--url URL] [--status STATUS]
learning-links remove NAME
learning-links link TOPIC SUPPORTING_TOPIC --kind prerequisite|helpful
learning-links unlink TOPIC SUPPORTING_TOPIC
learning-links show NAME
learning-links important
learning-links dot [-o FILE]
```

## Roadmap

### v0.1 — Manual graph
- topics and typed learning relationships;
- CRUD commands;
- reverse lookup;
- direct-support importance count;
- DOT export.

### v0.2 — Better exploration
- clearer graph visualization;
- filtering by status and relationship kind;
- indirect dependency/support queries;
- basic cycle handling and graph diagnostics.

### v0.3 — Automatic suggestions
- optional Wikipedia-based topic discovery;
- candidate relationship extraction;
- review/accept/reject workflow before changing the graph.

### v0.4 — LLM-assisted suggestions
- classify candidate links as `prerequisite`, `helpful`, or irrelevant;
- attach explanations/evidence to suggestions;
- keep all LLM-generated changes user-reviewable.

### Later
- richer importance metrics;
- learning-path generation;
- import/export formats;
- revisit a C implementation once the data model and behavior are stable.

## Tests

```bash
python -m unittest discover -s tests -v
```
