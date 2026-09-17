#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "REPOSITORY-STATUS.json"
SKIP_DIRS = {".git", "release-out"}
EXTERNAL_SCHEMES = {"http", "https", "mailto", "tel", "data", "javascript"}
DEPLOYMENT_ONLY_PREFIXES = (
    "downloads/",
    "projects/crec/play/images/catalog/",
    "projects/crec/play/images/logo/",
)


class RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if value and key.lower() in {"href", "src"}:
                self.refs.append((key.lower(), value.strip()))


def is_deployment_only(path: str) -> bool:
    clean = path.lstrip("/")
    return any(clean.startswith(prefix) for prefix in DEPLOYMENT_ONLY_PREFIXES)


def resolve_local(source: Path, raw: str) -> Path | None:
    if not raw or raw.startswith("#") or raw.startswith("//"):
        return None
    parts = urlsplit(raw)
    if parts.scheme.lower() in EXTERNAL_SCHEMES or parts.netloc:
        return None
    path = unquote(parts.path)
    if not path:
        return None
    if is_deployment_only(path):
        return None
    if path.startswith("/"):
        target = ROOT / path.lstrip("/")
    else:
        target = source.parent / path
    if path.endswith("/"):
        target = target / "index.html"
    elif target.is_dir():
        target = target / "index.html"
    return target.resolve()


def strict_mode() -> bool:
    if not STATUS.exists():
        return False
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
    except Exception:
        return False
    return data.get("source_sync") == "complete"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Fail on missing local references regardless of migration status")
    parser.add_argument("--report-only", action="store_true", help="Never fail for missing local references")
    args = parser.parse_args()

    missing: list[tuple[str, str, str]] = []
    scanned = 0
    for html in sorted(ROOT.rglob("*.html")):
        if any(part in SKIP_DIRS for part in html.parts):
            continue
        scanned += 1
        parser_obj = RefParser()
        try:
            parser_obj.feed(html.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            print(f"ERROR non-UTF8 HTML: {html.relative_to(ROOT)}")
            return 2
        for kind, raw in parser_obj.refs:
            target = resolve_local(html, raw)
            if target is None:
                continue
            try:
                target.relative_to(ROOT.resolve())
            except ValueError:
                missing.append((str(html.relative_to(ROOT)), raw, "outside repository"))
                continue
            if not target.exists():
                missing.append((str(html.relative_to(ROOT)), raw, str(target.relative_to(ROOT))))

    print(f"HTML files scanned: {scanned}")
    print(f"Missing tracked local references: {len(missing)}")
    for source, raw, target in missing[:100]:
        print(f"MISSING {source}: {raw} -> {target}")
    if len(missing) > 100:
        print(f"... {len(missing)-100} more")

    enforce = args.strict or (strict_mode() and not args.report_only)
    if enforce and missing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
