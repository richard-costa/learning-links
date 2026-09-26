#!/usr/bin/env python3
"""Load sample learning encounters for one broad subject."""

from __future__ import annotations

import argparse
import os
import shlex

from learning_links.config import load_environment
from learning_links.store import Store, TopicNotFound


EXAMPLES = {
    "physics": {
        "topics": [
            ("Classical Mechanics", "learning"),
            ("Differential Equations", "planned"),
            ("Linear Algebra", "learning"),
            ("Calculus", "learning"),
            ("Electromagnetism", "later"),
            ("Vector Calculus", "planned"),
        ],
        "encounters": [
            ("Classical Mechanics", "Differential Equations", "need", "Harmonic oscillator equations"),
            ("Classical Mechanics", "Linear Algebra", "revisit", "Normal modes and coupled systems"),
            ("Classical Mechanics", "Calculus", "revisit", "Variational arguments"),
            ("Electromagnetism", "Vector Calculus", "need", "Divergence and curl"),
            ("Electromagnetism", "Differential Equations", "revisit", "Field equations"),
        ],
    },
    "math": {
        "topics": [
            ("Linear Algebra", "learning"),
            ("Differential Equations", "planned"),
            ("Calculus", "learning"),
            ("Proof Techniques", "learning"),
            ("Topology", "later"),
            ("Numerical Methods", "planned"),
        ],
        "encounters": [
            ("Linear Algebra", "Differential Equations", "curious", "Linear systems of differential equations"),
            ("Differential Equations", "Numerical Methods", "need", "Approximate solutions"),
            ("Topology", "Proof Techniques", "revisit", "Proof structure"),
            ("Differential Equations", "Calculus", "revisit", "Integration techniques"),
        ],
    },
    "computer-science": {
        "topics": [
            ("Machine Learning", "learning"),
            ("Linear Algebra", "planned"),
            ("Probability", "planned"),
            ("Optimization", "planned"),
            ("Algorithms", "later"),
            ("Statistics", "later"),
        ],
        "encounters": [
            ("Machine Learning", "Linear Algebra", "revisit", "Matrix operations and eigendecompositions"),
            ("Machine Learning", "Probability", "need", "Probabilistic models"),
            ("Machine Learning", "Optimization", "need", "Training objectives"),
            ("Statistics", "Probability", "revisit", "Distributions and expectation"),
            ("Algorithms", "Optimization", "curious", "Optimization formulations"),
        ],
    },
    "linguistics": {
        "topics": [
            ("Phonetics", "learning"),
            ("Phonology", "planned"),
            ("Morphology", "planned"),
            ("Syntax", "planned"),
            ("Semantics", "later"),
            ("Statistics", "later"),
        ],
        "encounters": [
            ("Phonology", "Phonetics", "revisit", "Articulatory distinctions"),
            ("Morphology", "Phonology", "revisit", "Morphophonological alternations"),
            ("Syntax", "Morphology", "curious", "Interfaces between word and sentence structure"),
            ("Semantics", "Syntax", "revisit", "Compositional structure"),
            ("Phonetics", "Statistics", "need", "Acoustic measurements"),
        ],
    },
    "astronomy": {
        "topics": [
            ("Celestial Mechanics", "learning"),
            ("Differential Equations", "planned"),
            ("Linear Algebra", "planned"),
            ("Stellar Evolution", "planned"),
            ("Cosmology", "later"),
            ("Statistics", "learning"),
        ],
        "encounters": [
            ("Celestial Mechanics", "Differential Equations", "need", "Orbital dynamics"),
            ("Celestial Mechanics", "Linear Algebra", "revisit", "Coordinate transforms"),
            ("Stellar Evolution", "Differential Equations", "revisit", "Evolution equations"),
            ("Cosmology", "Statistics", "need", "Inference from observations"),
        ],
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Load sample learning encounters for one broad subject."
    )
    parser.add_argument("subject", choices=sorted(EXAMPLES))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the commands without changing the database",
    )
    args = parser.parse_args()
    example = EXAMPLES[args.subject]

    if args.dry_run:
        print(f"# Sample {args.subject} encounters. No database changes were made.")
        print_commands(example)
        return 0

    load_environment()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL is required; set it in the repository-root .env")

    added_topics = 0
    with Store(database_url) as store:
        for name, status in example["topics"]:
            try:
                store.get_topic(name)
            except TopicNotFound:
                store.add_topic(name, status=status)
                added_topics += 1

        for context, topic, reason, note in example["encounters"]:
            store.flag(context, topic, reason, note)

    print(
        f"Loaded {args.subject}: {added_topics} topic(s) added and "
        f"{len(example['encounters'])} encounter(s) created or updated."
    )
    return 0


def print_commands(example) -> None:
    for name, status in example["topics"]:
        print(f"learning-links add {shlex.quote(name)} --status {status}")
    print()
    for context, topic, reason, note in example["encounters"]:
        print(
            f"learning-links flag {shlex.quote(context)} {shlex.quote(topic)} "
            f"--reason {reason} --note {shlex.quote(note)}"
        )


if __name__ == "__main__":
    raise SystemExit(main())
