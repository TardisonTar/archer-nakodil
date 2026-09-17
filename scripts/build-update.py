#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

NON_DEPLOY_PREFIXES = (".github/", "scripts/", "docs/", "release-out/")
NON_DEPLOY_FILES = {"GITHUB-WORKFLOW.md", "REPOSITORY-STATUS.json", "README.md", ".gitignore"}


def git(*args: str, text: bool = True):
    return subprocess.check_output(["git", *args], text=text)


def deployable(path: str) -> bool:
    return path not in NON_DEPLOY_FILES and not any(path.startswith(p) for p in NON_DEPLOY_PREFIXES)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    ap.add_argument("--output", required=True)
    ns = ap.parse_args()

    diff = git("diff", "--name-status", "-M", ns.base, ns.head)
    add_or_update: list[str] = []
    deleted: list[str] = []
    skipped: list[str] = []

    for line in diff.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0]
        code = status[0]
        if code == "R" and len(parts) >= 3:
            old, new = parts[1], parts[2]
            if deployable(old):
                deleted.append(old)
            if deployable(new):
                add_or_update.append(new)
            else:
                skipped.append(new)
        elif code == "D" and len(parts) >= 2:
            path = parts[1]
            (deleted if deployable(path) else skipped).append(path)
        elif len(parts) >= 2:
            path = parts[1]
            (add_or_update if deployable(path) else skipped).append(path)

    add_or_update = sorted(set(add_or_update))
    deleted = sorted(set(deleted))
    skipped = sorted(set(skipped))
    out = Path(ns.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    manifest = {
        "schema": 1,
        "base": ns.base,
        "head": ns.head,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "files": add_or_update,
        "delete": deleted,
        "skipped_non_deploy": skipped,
    }

    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in add_or_update:
            content = git("show", f"{ns.head}:{path}", text=False)
            zf.writestr(path, content)
        if deleted:
            zf.writestr("DELETE.txt", "\n".join(deleted) + "\n")
        zf.writestr("PATCH-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    print(f"UPDATE: {out}")
    print(f"add/update: {len(add_or_update)}, delete: {len(deleted)}, skipped: {len(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
