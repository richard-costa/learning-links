from __future__ import annotations

import argparse
import getpass
import os
import sys
import webbrowser
from pathlib import Path

from .auth import hash_password
from .config import load_environment
from .store import VALID_REASONS, VALID_STATUSES, Store, StoreError
from .visualize import VisualizationError, render_graph, to_dot

load_environment()

DEFAULT_DATABASE_URL = os.environ.get("DATABASE_URL")


def build_parser():
    parser = argparse.ArgumentParser(prog="learning-links")
    parser.add_argument("--database-url", default=DEFAULT_DATABASE_URL)
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add")
    add.add_argument("name")
    add.add_argument("--url")
    add.add_argument("--status", choices=VALID_STATUSES, default="planned")

    sub.add_parser("list")
    sub.add_parser("overview")
    sub.add_parser("discover")
    sub.add_parser("isolated")

    edit = sub.add_parser("edit")
    edit.add_argument("name")
    edit.add_argument("--name", dest="new_name")
    edit.add_argument("--url")
    edit.add_argument("--status", choices=VALID_STATUSES)

    remove = sub.add_parser("remove")
    remove.add_argument("name")

    flag = sub.add_parser("flag", help="record a topic that came up while studying a context")
    flag.add_argument("context")
    flag.add_argument("topic")
    flag.add_argument("--reason", choices=VALID_REASONS, default="need")
    flag.add_argument("--note", default="")

    unflag = sub.add_parser("unflag")
    unflag.add_argument("context")
    unflag.add_argument("topic")

    show = sub.add_parser("show")
    show.add_argument("name")

    reset = sub.add_parser("reset")
    reset.add_argument("--yes", action="store_true", help="skip confirmation")

    dot = sub.add_parser("dot", help="export a local ego diagram as DOT")
    dot.add_argument("name")
    dot.add_argument("-o", "--output", type=Path)

    graph = sub.add_parser("graph", help="render a local ego diagram")
    graph.add_argument("name")
    graph.add_argument("-o", "--output", type=Path)
    graph.add_argument("--format", choices=("svg", "png"))
    graph.add_argument("--open", action="store_true", dest="open_graph")

    user_add = sub.add_parser("user-add", help="create an allowed web user")
    user_add.add_argument("email")

    sub.add_parser("user-list", help="list allowed web users")

    user_disable = sub.add_parser("user-disable", help="disable a web user")
    user_disable.add_argument("email")

    user_enable = sub.add_parser("user-enable", help="enable a web user")
    user_enable.add_argument("email")

    user_password = sub.add_parser("user-password", help="change a web user's password")
    user_password.add_argument("email")

    return parser


def require_database_url(args) -> str:
    if not args.database_url:
        raise StoreError("DATABASE_URL is required")
    return args.database_url


def prompt_password() -> str:
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Repeat password: ")
    if first != second:
        raise StoreError("passwords do not match")
    try:
        return hash_password(first)
    except ValueError as exc:
        raise StoreError(str(exc)) from exc


def _print_overview(store: Store):
    summaries = store.overview()
    topics, encounters = store.counts()
    isolated = sum(summary.isolated for summary in summaries)

    print(f"Topics: {topics}")
    print(f"Encounters: {encounters}")
    print(f"Isolated: {isolated}")

    if not summaries:
        return

    name_width = max(len("TOPIC"), *(len(s.topic.name) for s in summaries))
    status_width = max(len("STATUS"), *(len(s.topic.status) for s in summaries))

    print()
    print(f"{'TOPIC':<{name_width}}  {'STATUS':<{status_width}}  {'CAME UP IN':>10}  {'FLAGGED':>7}")
    for summary in summaries:
        print(
            f"{summary.topic.name:<{name_width}}  "
            f"{summary.topic.status:<{status_width}}  "
            f"{summary.came_up_in_count:>10}  "
            f"{summary.flagged_count:>7}"
        )


def _graph_options(args):
    format_name = args.format
    if format_name is None and args.output and args.output.suffix.lower() in (".svg", ".png"):
        format_name = args.output.suffix.lower()[1:]
    if format_name is None:
        format_name = "svg"

    output = args.output or Path(f"{args.name.lower().replace(' ', '-')}.{format_name}")
    return output, format_name


def _format_encounter(topic, reason: str, note: str) -> str:
    suffix = f" — {note}" if note else ""
    return f"  {topic.name} ({reason}){suffix}"


def run(args):
    database_url = require_database_url(args)

    with Store(database_url) as store:
        if args.command == "add":
            topic = store.add_topic(args.name, args.url, args.status)
            print(f"{topic.name} [{topic.status}]")
            return 0

        if args.command == "list":
            for topic in store.list_topics():
                print(f"{topic.name} [{topic.status}]")
            return 0

        if args.command == "overview":
            _print_overview(store)
            return 0

        if args.command == "discover":
            recurring = [(topic, count) for topic, count in store.recurring_topics() if count > 1]
            if not recurring:
                print("No recurring topics yet.")
            else:
                for topic, count in recurring:
                    print(f"{count:>3}  {topic.name}")
            return 0

        if args.command == "isolated":
            topics = store.isolated_topics()
            if not topics:
                print("No isolated topics.")
            else:
                for topic in topics:
                    print(f"{topic.name} [{topic.status}]")
            return 0

        if args.command == "edit":
            topic = store.edit_topic(
                args.name,
                new_name=args.new_name,
                url=args.url or None,
                status=args.status,
                set_url=args.url is not None,
            )
            print(f"{topic.name} [{topic.status}]")
            return 0

        if args.command == "remove":
            store.remove_topic(args.name)
            print(f"removed: {args.name}")
            return 0

        if args.command == "flag":
            encounter = store.flag(args.context, args.topic, args.reason, args.note)
            print(
                f"{encounter.context.name} -> {encounter.topic.name} "
                f"[{encounter.reason}]"
            )
            return 0

        if args.command == "unflag":
            print(
                "removed"
                if store.unflag(args.context, args.topic)
                else "encounter did not exist"
            )
            return 0

        if args.command == "show":
            topic = store.get_topic(args.name)
            contexts = store.came_up_in(args.name)
            flagged = store.flagged_from(args.name)

            print(f"{topic.name} [{topic.status}]")
            print("\nCame up in:")
            if contexts:
                for other, reason, note in contexts:
                    print(_format_encounter(other, reason, note))
            else:
                print("  —")

            print("\nFlagged while studying this:")
            if flagged:
                for other, reason, note in flagged:
                    print(_format_encounter(other, reason, note))
            else:
                print("  —")
            return 0

        if args.command == "reset":
            if not args.yes:
                answer = input("Delete all topics and encounters? [y/N] ").strip().lower()
                if answer not in ("y", "yes"):
                    print("cancelled")
                    return 1
            topics, encounters = store.reset()
            print(f"removed {topics} topics and {encounters} encounters")
            return 0

        if args.command == "dot":
            content = to_dot(store, args.name)
            if args.output:
                args.output.write_text(content, encoding="utf-8")
                print(args.output)
            else:
                print(content, end="")
            return 0

        if args.command == "graph":
            output, format_name = _graph_options(args)
            rendered = render_graph(store, args.name, output, format_name)
            print(rendered)
            if args.open_graph:
                webbrowser.open(rendered.resolve().as_uri())
            return 0

        if args.command == "user-add":
            user = store.add_user(args.email, prompt_password())
            print(f"added user: {user.email}")
            return 0

        if args.command == "user-list":
            for user in store.list_users():
                status = "active" if user.active else "disabled"
                print(f"{user.email} [{status}]")
            return 0

        if args.command == "user-disable":
            user = store.set_user_active(args.email, False)
            print(f"disabled: {user.email}")
            return 0

        if args.command == "user-enable":
            user = store.set_user_active(args.email, True)
            print(f"enabled: {user.email}")
            return 0

        if args.command == "user-password":
            user = store.set_user_password(args.email, prompt_password())
            print(f"password updated: {user.email}")
            return 0

    return 0


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except (StoreError, VisualizationError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
