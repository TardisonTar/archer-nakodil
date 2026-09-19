from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import re
import shutil

UA = {"User-Agent": "Archer-GitHub-Migration/1.0"}

def fetch(url: str, timeout: int = 45) -> bytes:
    req = Request(url, headers=UA)
    with urlopen(req, timeout=timeout) as r:
        if getattr(r, "status", 200) >= 400:
            raise RuntimeError(f"HTTP {r.status}: {url}")
        return r.read()

CREC_BASE = "https://cq593645.tw1.ru/crec/"
live = fetch(urljoin(CREC_BASE, "VERSION")).decode("utf-8", "replace").strip()
if live != "0.1.3.9":
    raise SystemExit(f"CREC live version mismatch: {live!r}")

crec = Path("svistok/crec")
if crec.exists():
    shutil.rmtree(crec)
crec.mkdir(parents=True)

text_paths = [
    ".htaccess", "PATCH-MANIFEST.json", "README.txt", "UPDATE-INFO.txt", "VERSION",
    "css/crec-magnifier.css", "css/crec-quantity.css", "css/crec-theme.css",
    "css/crec-ui-fixes.css", "css/styles.css", "data/catalog-meta.json",
    "data/catalog/01-e732f2a8f884.json", "data/catalog/02-ae5309b8339a.json",
    "data/catalog/03-f69c20b2360d.json", "data/catalog/04-0074c1ba151d.json",
    "data/catalog/05-6601435c0b28.json", "data/catalog/06-874b3a0fa152.json",
    "data/catalog/07-4b0d7efe157b.json", "data/catalog/08-4ad16ce81eeb.json",
    "data/catalog/09-87e071fec31c.json", "data/catalog/10-c736fec9eb42.json",
    "data/catalog/11-c65261a2e656.json", "data/catalog/12-92ae236669be.json",
    "data/catalog/13-1cd7bb98aeb3.json", "data/catalog/14-d449604c1e52.json",
    "data/catalog/15-e9c623c2b9ad.json", "data/catalog/16-74dede62084e.json",
    "data/catalog/17-d64f897ebbf7.json", "data/catalog/18-c73b5c74af26.json",
    "data/catalog/19-9595236c2472.json", "data/catalog/20-a362dde022dc.json",
    "data/catalog/21-a77aabb7761c.json", "data/catalog/22-5c23abcf133a.json",
    "data/catalog/23-a88062b85a46.json", "data/catalog/24-de86eb147b37.json",
    "data/catalog/25-ec220c6962a4.json", "data/catalog/26-5ef6982dfefc.json",
    "data/catalog/27-bd82d54afcbd.json", "data/catalog/28-0e4dafab322d.json",
    "data/catalog/29-b9388ff491b0.json", "data/catalog/30-95b8bc2dba92.json",
    "data/catalog/31-5f825791681d.json", "index.html", "js/app.js",
    "js/catalog-worker.js", "js/crec-magnifier.js", "js/crec-theme.js",
    "js/logo-animation.js", "manifest.json", "robots.txt", "service-worker.js", "sitemap.xml",
]

for rel in text_paths:
    data = fetch(urljoin(CREC_BASE, rel))
    dst = crec / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)

ref_re = re.compile(r"(?<![A-Za-z0-9_-])/?(images/[A-Za-z0-9._/-]+)")
refs = set()
for p in crec.rglob("*"):
    if not p.is_file():
        continue
    try:
        s = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for rel in ref_re.findall(s):
        if Path(rel).suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".avif"}:
            refs.add(rel)

refs.update({
    "images/hero/hero-connectors-ba1957412b.webp",
    "images/hero/hero-power-supply-f991c4102e.webp",
    "images/hero/hero-soldering-ac33507f55.webp",
    "images/misc/reference-aa2be5cac1.webp",
    "icon-192.png",
    "icon-512.png",
})

if len(refs) < 3200:
    raise SystemExit(f"CREC asset discovery too low: {len(refs)}")

errors = []

def fetch_asset(rel: str) -> int:
    data = fetch(urljoin(CREC_BASE, rel))
    dst = crec / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)
    return len(data)

total = 0
with ThreadPoolExecutor(max_workers=20) as ex:
    futures = {ex.submit(fetch_asset, rel): rel for rel in sorted(refs)}
    for i, future in enumerate(as_completed(futures), 1):
        rel = futures[future]
        try:
            total += future.result()
        except Exception as e:
            errors.append((rel, str(e)))
        if i % 250 == 0:
            print(f"CREC assets {i}/{len(futures)}")

if errors:
    for rel, err in errors[:30]:
        print("ERROR", rel, err)
    raise SystemExit(f"CREC asset failures: {len(errors)}")

print("CREC OK", live, "assets", len(refs), "bytes", total)

DOM_BASE = "https://cq593645.tw1.ru/dom/"
dom_paths = [
    "README.md", "VERSION.json", "assets/css/app.css", "assets/css/studio.css",
    "assets/js/model.js", "assets/js/studio.js", "assets/vendor/three.min.js", "index.html",
]
expected = {
    "index.html": "6c945b86ae5899faad00fe7305d54a36b5dd0c1c9ace86e9ebc3fcb92f6dd8d0",
    "assets/js/model.js": "ed91da05fc29d75fcf05d7ee377469516a45c2a9383a15b228891003868cc056",
    "assets/vendor/three.min.js": "170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa",
}

dom = Path("svistok/dom-svistka")
if dom.exists():
    shutil.rmtree(dom)
dom.mkdir(parents=True)

for rel in dom_paths:
    data = fetch(urljoin(DOM_BASE, rel))
    if rel in expected:
        got = hashlib.sha256(data).hexdigest()
        if got != expected[rel]:
            raise SystemExit(f"DOM hash mismatch {rel}: {got}")
    dst = dom / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)

print("DOM OK 0.0.9.0")
