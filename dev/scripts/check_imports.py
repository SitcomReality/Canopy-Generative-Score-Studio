#!/usr/bin/env python3
"""
check_imports.py -- Canopy import and layer-boundary checker (no dependencies).

Gates:
  1. Every relative import specifier in src/ resolves to a real file.
  2. Every named import refers to a symbol the target module actually exports.
  3. Boundary report: cross-layer imports vs the layer rules in AGENTS.md
     (mirrored in dev/docs/systemArchitecture.md §2). Informational only --
     exit code is unaffected.

Usage:
  python3 dev/scripts/check_imports.py

Exit code is non-zero if gate 1 or 2 fails.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")

# ---------------------------------------------------------------------------
# Layer rules (AGENTS.md / dev/docs/systemArchitecture.md §2). Layers not
# listed may import anything. ui/ may not reach into audio/ or state/;
# main.js is the composition root and may import everything.
# ---------------------------------------------------------------------------
ALLOWED = {
    "music": {"music"},
    "audio": {"music", "audio"},
    "state": {"music", "state"},
}

IMPORT_FROM_RE = re.compile(r"""\bimport\s*(\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s*from\s*['"]([^'"]+)['"]""")
SIDE_EFFECT_RE = re.compile(r"""\bimport\s*['"]([^'"]+)['"]""")
DYNAMIC_RE = re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)""")
EXPORT_DECL_RE = re.compile(
    r"\bexport\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)")
EXPORT_LIST_RE = re.compile(r"\bexport\s*\{([^}]*)\}(?!\s*from)")
EXPORT_DEFAULT_RE = re.compile(r"\bexport\s+default\b")

RESOLUTION_FAILURES = []
SYMBOL_FAILURES = []
BOUNDARY_REPORT = []


def module_files():
    found = []
    for base, _dirs, names in os.walk(SRC):
        for name in sorted(names):
            if name.endswith(".js"):
                found.append(os.path.join(base, name))
    return sorted(found)


def resolve(specifier, importer):
    """Resolve a relative import specifier to a file path (adds .js)."""
    path = os.path.normpath(os.path.join(os.path.dirname(importer), specifier))
    if os.path.isfile(path):
        return path
    if os.path.isfile(path + ".js"):
        return path + ".js"
    if os.path.isfile(os.path.join(path, "index.js")):
        return os.path.join(path, "index.js")
    return None


def exports_of(path, seen=None):
    """Set of exported names of `path`, following re-export chains."""
    seen = seen or set()
    if path in seen:
        return set()
    seen.add(path)
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    names = set(EXPORT_DECL_RE.findall(source))
    if EXPORT_DEFAULT_RE.search(source):
        names.add("default")
    for match in EXPORT_LIST_RE.finditer(source):
        for part in match.group(1).split(","):
            part = part.strip()
            if part:
                names.add(part.split()[-1])
    # Follow `export { x } from './y.js'` re-exports.
    for match in re.finditer(r"\bexport\s*(\{[^}]*\})\s*from\s*['\"]([^'\"]+)['\"]", source):
        target = resolve(match.group(2), path)
        if target:
            for part in match.group(1).split(","):
                part = part.strip()
                if part:
                    names.add(part.split()[-1])
            names |= exports_of(target, seen)
    return names


def layer_of(path):
    rel = os.path.relpath(path, SRC)
    parts = rel.split(os.sep)
    return parts[0] if len(parts) > 1 else "<root>"


def check_file(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    # Named/default imports, side-effect imports, and dynamic import() all
    # carry a relative-or-bare specifier.
    specifiers = [m.group(2) for m in IMPORT_FROM_RE.finditer(source)]
    specifiers += [m.group(1) for m in SIDE_EFFECT_RE.finditer(source)]
    specifiers += [m.group(1) for m in DYNAMIC_RE.finditer(source)]

    importer_layer = layer_of(path)
    for specifier in specifiers:
        if not specifier.startswith(".") or "${" in specifier:
            continue  # bare specifier by convention; interpolated ones are template-literal text
        target = resolve(specifier, path)
        if target is None:
            RESOLUTION_FAILURES.append(f"{os.path.relpath(path, ROOT)}: cannot resolve '{specifier}'")
            continue

        # Gate 3 (informational): boundary report.
        target_layer = layer_of(target)
        if importer_layer != target_layer:
            allowed = ALLOWED.get(importer_layer)
            violation = allowed is not None and target_layer not in allowed
            BOUNDARY_REPORT.append(
                f"{'VIOLATION' if violation else 'cross-layer'}: {os.path.relpath(path, ROOT)} ({importer_layer}) -> {target_layer}"
            )

        # Gate 2: named imports must exist on the target.
        for match in IMPORT_FROM_RE.finditer(source):
            if match.group(2) != specifier or not match.group(1).startswith("{"):
                continue
            target_exports = exports_of(target)
            for part in match.group(1)[1:-1].split(","):
                part = part.strip()
                if not part:
                    continue
                if " as " in part:
                    imported, local = [token.strip() for token in part.split(" as ", 1)]
                else:
                    imported = local = part
                if imported == "default":
                    continue  # default imports checked implicitly by gate 1
                if imported not in target_exports:
                    SYMBOL_FAILURES.append(
                        f"{os.path.relpath(path, ROOT)}: '{imported}' is not exported by '{specifier}'"
                    )


def main():
    files = module_files()
    for path in files:
        check_file(path)

    print(f"checked {len(files)} module(s) under src/")
    if BOUNDARY_REPORT:
        print("\nBoundary report (informational):")
        for line in sorted(set(BOUNDARY_REPORT)):
            print(f"  {line}")
        violations = [line for line in BOUNDARY_REPORT if line.startswith("VIOLATION")]
        if not violations:
            print("  no layer-rule violations")
    if RESOLUTION_FAILURES or SYMBOL_FAILURES:
        for line in RESOLUTION_FAILURES + SYMBOL_FAILURES:
            print(line, file=sys.stderr)
        sys.exit(1)
    print("all imports resolve; all named symbols exported")


if __name__ == "__main__":
    main()
