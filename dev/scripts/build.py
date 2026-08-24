#!/usr/bin/env python3
"""
build.py -- Stitch Canopy's HTML partials into index.html (no dependencies).

Replaces every include directive of the form

    <!--#include "src/partials/name.inc.html" -->

in index.template.html with the contents of that file (relative to the
project root), and writes the result to index.html. Includes are resolved
recursively, so a partial may itself contain includes.

Usage:
  python3 dev/scripts/build.py           # build once
  python3 dev/scripts/build.py --watch   # rebuild whenever an input changes

The --watch mode exists so editors like VSCodium + Live Server keep working:
edit a partial, this script restitches index.html, Live Server reloads.
"""
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATE = os.path.join(ROOT, "index.template.html")
OUTPUT = os.path.join(ROOT, "index.html")

INCLUDE_START = "<!--#include"
INCLUDE_END = "-->"


def resolve_includes(text, source):
    """Recursively expand <!--#include "..." --> directives in `text`."""
    out = []
    cursor = 0
    while True:
        start = text.find(INCLUDE_START, cursor)
        if start == -1:
            out.append(text[cursor:])
            break
        end = text.find(INCLUDE_END, start)
        if end == -1:
            raise SystemExit(f"{source}: unterminated include directive at offset {start}")
        out.append(text[cursor:start])
        match = re.search(r'"([^"]+)"', text[start + len(INCLUDE_START):end])
        if not match:
            raise SystemExit(f"{source}: malformed include {text[start:end]!r}; expected <!--#include \"path\" -->")
        directive = match.group(1)
        path = os.path.join(ROOT, directive)
        if not os.path.isfile(path):
            raise SystemExit(f"{source}: included file not found: {directive}")
        with open(path, "r", encoding="utf-8") as handle:
            included = handle.read()
        out.append(resolve_includes(included, directive))
        cursor = end + len(INCLUDE_END)
    return "".join(out)


def build():
    with open(TEMPLATE, "r", encoding="utf-8") as handle:
        template = handle.read()
    html = resolve_includes(template, "index.template.html")
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        handle.write(html)
    print(f"built index.html ({len(html)} bytes)")


def inputs():
    """Every file whose change should trigger a rebuild: the template plus
    whatever it transitively includes."""
    files = [TEMPLATE]
    index = 0
    while index < len(files):
        with open(files[index], "r", encoding="utf-8") as handle:
            text = handle.read()
        cursor = 0
        while True:
            start = text.find(INCLUDE_START, cursor)
            if start == -1:
                break
            end = text.find(INCLUDE_END, start)
            if end == -1:
                break
            directive = text[start + len(INCLUDE_START):end].strip().strip('"')
            path = os.path.join(ROOT, directive[1:-1])
            if os.path.isfile(path) and path not in files:
                files.append(path)
            cursor = end + len(INCLUDE_END)
        index += 1
    return files


def watch(poll_seconds=0.5):
    stamps = {path: os.stat(path).st_mtime for path in inputs()}
    print(f"watching {len(stamps)} file(s); Ctrl-C to stop")
    try:
        while True:
            time.sleep(poll_seconds)
            try:
                current = {path: os.stat(path).st_mtime for path in inputs()}
            except FileNotFoundError:
                continue
            if current != stamps:
                stamps = current
                try:
                    build()
                except SystemExit as error:
                    print(error, file=sys.stderr)
    except KeyboardInterrupt:
        print("stopped")


if __name__ == "__main__":
    if "--watch" in sys.argv[1:]:
        build()
        watch()
    else:
        build()
