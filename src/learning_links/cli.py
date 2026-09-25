from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .store import Store, StoreError, VALID_KINDS, VALID_STATUSES
from .visualize import to_dot

DEFAULT_DB = os.environ.get("LEARNING_LINKS_DB", "learning-links.db")


def build_parser():
    p = argparse.ArgumentParser(prog="learning-links")
    p.add_argument("--db", default=DEFAULT_DB)
    sub = p.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add"); add.add_argument("name"); add.add_argument("--url"); add.add_argument("--status", choices=VALID_STATUSES, default="planned")
    sub.add_parser("list")
    edit = sub.add_parser("edit"); edit.add_argument("name"); edit.add_argument("--name", dest="new_name"); edit.add_argument("--url"); edit.add_argument("--status", choices=VALID_STATUSES)
    remove = sub.add_parser("remove"); remove.add_argument("name")
    link = sub.add_parser("link"); link.add_argument("topic"); link.add_argument("supporting_topic"); link.add_argument("--kind", choices=VALID_KINDS, required=True)
    unlink = sub.add_parser("unlink"); unlink.add_argument("topic"); unlink.add_argument("supporting_topic")
    show = sub.add_parser("show"); show.add_argument("name")
    sub.add_parser("important")
    dot = sub.add_parser("dot"); dot.add_argument("-o", "--output", type=Path)
    return p


def run(args):
    with Store(args.db) as store:
        if args.command == "add":
            t = store.add_topic(args.name, args.url, args.status); print(f"{t.name} [{t.status}]"); return 0
        if args.command == "list":
            for t in store.list_topics(): print(f"{t.name} [{t.status}]")
            return 0
        if args.command == "edit":
            t = store.edit_topic(args.name,new_name=args.new_name,url=args.url or None,status=args.status,set_url=args.url is not None); print(f"{t.name} [{t.status}]"); return 0
        if args.command == "remove":
            store.remove_topic(args.name); print(f"removed: {args.name}"); return 0
        if args.command == "link":
            r = store.link(args.topic,args.supporting_topic,args.kind); print(f"{r.supporting_topic.name} -[{r.kind}]-> {r.topic.name}"); return 0
        if args.command == "unlink":
            print("removed" if store.unlink(args.topic,args.supporting_topic) else "relationship did not exist"); return 0
        if args.command == "show":
            t = store.get_topic(args.name); print(f"{t.name} [{t.status}]")
            print("\nSupported by:")
            for other,kind in store.supported_by(args.name): print(f"  {other.name} ({kind})")
            if not store.supported_by(args.name): print("  —")
            print("\nSupports:")
            for other,kind in store.supports(args.name): print(f"  {other.name} ({kind})")
            if not store.supports(args.name): print("  —")
            return 0
        if args.command == "important":
            for t,n in store.importance(): print(f"{n:>3}  {t.name}")
            return 0
        if args.command == "dot":
            content = to_dot(store)
            if args.output: args.output.write_text(content, encoding="utf-8"); print(args.output)
            else: print(content, end="")
            return 0
    return 0


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except StoreError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
