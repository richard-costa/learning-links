# learning-links

A small tool for building and visualizing prerequisite and helpful relationships between topics for self-directed learning.

The first version is intentionally manual:

- topics as nodes;
- `prerequisite` and `helpful` relationships as directed edges;
- manual creation, editing, and deletion;
- reverse lookup: “what does this topic support?”;
- a direct-support importance count;
- topic overview and isolated-topic detection;
- database reset;
- Graphviz visualization.

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
learning-links overview
learning-links important
learning-links graph --open
```

`link TOPIC SUPPORTING_TOPIC` means the second topic supports learning the first. Visualization edges therefore point from the supporting topic to the topic being learned.

By default data is stored in `learning-links.db`. Override it with `--db PATH` or `LEARNING_LINKS_DB`.

## Exploring the graph

Show a compact overview:

```bash
learning-links overview
```

Example:

```text
Topics: 3
Relationships: 2
Isolated: 0

TOPIC           STATUS   SUPPORTED BY  SUPPORTS
Compilers       planned             1         0
Formal Grammar  later               0         2
Parsing         planned             1         0
```

Find topics with no relationships:

```bash
learning-links isolated
```

An isolated topic is not automatically considered obsolete; it may simply be a topic you saved for later.

## Visualization

If Graphviz is installed:

```bash
learning-links graph
```

This creates `graph.svg` by default.

Open it immediately with your system's default viewer:

```bash
learning-links graph --open
```

Generate PNG instead:

```bash
learning-links graph --format png
```

Or choose the output path:

```bash
learning-links graph -o my-map.svg
```

The lower-level DOT export remains available:

```bash
learning-links dot -o graph.dot
```

If the `graph` command reports that `dot` is missing, install Graphviz using your operating system's package manager.

## Resetting the database

Delete all topics and relationships:

```bash
learning-links reset
```

The command asks for confirmation.

For scripts or disposable test databases:

```bash
learning-links reset --yes
```

## Commands

```text
learning-links add NAME [--url URL] [--status planned|learning|learned|later]
learning-links list
learning-links overview
learning-links isolated
learning-links edit NAME [--name NEW_NAME] [--url URL] [--status STATUS]
learning-links remove NAME
learning-links link TOPIC SUPPORTING_TOPIC --kind prerequisite|helpful
learning-links unlink TOPIC SUPPORTING_TOPIC
learning-links show NAME
learning-links important
learning-links reset [--yes]
learning-links graph [-o FILE] [--format svg|png] [--open]
learning-links dot [-o FILE]
```

## Roadmap

### v0.1 — Manual graph
- topics and typed learning relationships;
- CRUD commands;
- reverse lookup;
- direct-support importance count;
- topic overview;
- isolated-topic detection;
- safe database reset;
- direct Graphviz rendering and DOT export.

### v0.2 — Better exploration
- filtering by status and relationship kind;
- indirect dependency/support queries;
- basic cycle handling and graph diagnostics;
- improve visualization ergonomics beyond static Graphviz output.

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
