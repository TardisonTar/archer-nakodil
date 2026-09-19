from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
import hashlib
import shutil

BASE = "https://archer-nakodil.ru/"
UA = {"User-Agent": "Archer-GitHub-Migration/1.0"}
manifest = Path(".bootstrap/stable-expected.tsv")

def fetch(url, timeout=30):
    req = Request(url, headers=UA)
    with urlopen(req, timeout=timeout) as r:
        if getattr(r, "status", 200) >= 400:
            raise RuntimeError(f"HTTP {r.status}")
        return r.read()

# Clear only the source areas being rebuilt. Keep PC README separately.
for d in [Path("stable/portal"), Path("stable/games/site")]:
    if d.exists():
        shutil.rmtree(d)

matches=[]
mismatches=[]
for line in manifest.read_text(encoding="utf-8").splitlines():
    expected_sha, expected_size, rel = line.split("\t", 2)
    if rel == "games/pc/README.md":
        continue
    if rel.startswith("portal/"):
        remote = rel[len("portal/"):]
    elif rel.startswith("games/site/"):
        remote = "games/" + rel[len("games/site/"):]
    else:
        remote = rel
    # Empty intentionally-local markers are not expected to be public web resources.
    if expected_size == "0":
        dst=Path("stable")/rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes(b"")
        matches.append((rel,"local-empty"))
        continue
    try:
        data=fetch(urljoin(BASE, remote))
        got=hashlib.sha256(data).hexdigest()
        size=len(data)
        if got != expected_sha or size != int(expected_size):
            mismatches.append((rel, expected_sha, expected_size, got, str(size), "MISMATCH"))
            continue
        dst=Path("stable")/rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes(data)
        matches.append((rel,"web-exact"))
    except Exception as e:
        mismatches.append((rel, expected_sha, expected_size, "-", "-", f"FETCH:{e}"))

report=Path(".bootstrap/stable-import-report.tsv")
report.write_text(
    "status\tpath\tdetail\n"+
    "".join(f"MATCH\t{p}\t{src}\n" for p,src in matches)+
    "".join(f"MISS\t{p}\texpected={es}:{ez}; got={gs}:{gz}; {why}\n" for p,es,ez,gs,gz,why in mismatches),
    encoding="utf-8"
)
print(f"Exact matches: {len(matches)}; mismatches: {len(mismatches)}")
for row in mismatches:
    print("MISS", *row)
