#!/usr/bin/env python3
"""Load sample learning topics for one broad subject."""

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
            ("Vectors", "learned"),
            ("Calculus", "learning"),
            ("Newton's Laws", "planned"),
            ("Conservation of Energy", "planned"),
            ("Electromagnetism", "later"),
        ],
        "relationships": [
            ("Classical Mechanics", "Vectors", "prerequisite"),
            ("Classical Mechanics", "Calculus", "helpful"),
            ("Newton's Laws", "Classical Mechanics", "prerequisite"),
            ("Conservation of Energy", "Classical Mechanics", "helpful"),
            ("Electromagnetism", "Vectors", "prerequisite"),
        ],
    },
    "math": {
        "topics": [
            ("Set Theory", "learning"),
            ("Proof Techniques", "learning"),
            ("Linear Algebra", "planned"),
            ("Calculus", "planned"),
            ("Group Theory", "later"),
            ("Topology", "later"),
        ],
        "relationships": [
            ("Proof Techniques", "Set Theory", "helpful"),
            ("Linear Algebra", "Proof Techniques", "helpful"),
            ("Calculus", "Proof Techniques", "helpful"),
            ("Group Theory", "Proof Techniques", "prerequisite"),
            ("Topology", "Set Theory", "prerequisite"),
        ],
    },
    "computer-science": {
        "topics": [
            ("Discrete Mathematics", "learning"),
            ("Data Structures", "planned"),
            ("Algorithms", "planned"),
            ("Operating Systems", "later"),
            ("Computer Networks", "later"),
            ("Databases", "later"),
        ],
        "relationships": [
            ("Data Structures", "Discrete Mathematics", "helpful"),
            ("Algorithms", "Data Structures", "prerequisite"),
            ("Operating Systems", "Data Structures", "helpful"),
            ("Computer Networks", "Operating Systems", "helpful"),
            ("Databases", "Data Structures", "helpful"),
        ],
    },
    "linguistics": {
        "topics": [
            ("Phonetics", "learning"),
            ("Phonology", "planned"),
            ("Morphology", "planned"),
            ("Syntax", "planned"),
            ("Semantics", "later"),
            ("Language Acquisition", "later"),
        ],
        "relationships": [
            ("Phonology", "Phonetics", "prerequisite"),
            ("Morphology", "Phonology", "helpful"),
            ("Syntax", "Morphology", "helpful"),
            ("Semantics", "Syntax", "helpful"),
            ("Language Acquisition", "Phonetics", "helpful"),
        ],
    },
    "astronomy": {
        "topics": [
            ("Celestial Mechanics", "learning"),
            ("Stellar Evolution", "planned"),
            ("Exoplanets", "planned"),
            ("Galaxies", "later"),
            ("Cosmology", "later"),
            ("Observational Astronomy", "learning"),
        ],
        "relationships": [
            ("Stellar Evolution", "Observational Astronomy", "helpful"),
            ("Exoplanets", "Celestial Mechanics", "helpful"),
            ("Galaxies", "Stellar Evolution", "helpful"),
            ("Cosmology", "Galaxies", "prerequisite"),
            ("Cosmology", "Celestial Mechanics", "helpful"),
        ],
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Load sample learning topics for one broad subject."
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
        print(f"# Sample {args.subject} learning graph. No database changes were made.")
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

        for topic, supporting_topic, kind in example["relationships"]:
            store.link(topic, supporting_topic, kind)

    print(
        f"Loaded {args.subject}: {added_topics} topic(s) added and "
        f"{len(example['relationships'])} relationship(s) created or updated."
    )
    return 0


def print_commands(example) -> None:
    for name, status in example["topics"]:
        print(f"learning-links add {shlex.quote(name)} --status {status}")
    print()
    for topic, supporting_topic, kind in example["relationships"]:
        print(
            f"learning-links link {shlex.quote(topic)} "
            f"{shlex.quote(supporting_topic)} --kind {kind}"
        )


if __name__ == "__main__":
    raise SystemExit(main())