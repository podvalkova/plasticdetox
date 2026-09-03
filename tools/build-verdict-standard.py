#!/usr/bin/env python3
"""
Regenerate the Verdict Standard ledger from brand-data.json.

The ledger is the public face of the rating rules: the prose half states the
standard, the table half lists every verdict the extension will assert on an
Amazon listing. The first edition was assembled by hand and drifted 287 rows
behind the data within a week, claiming 305 recommendations while the shipped
extension asserted 28. A page that says "this is what the extension will say
today" has to be generated from the same file the extension reads, on every
build, or it is fiction with a nice typeface.

Prose lives in tools/templates/verdict-standard.template.html and changes only
when the standard changes. This tool fills in the rows and the date.

Output: docs/verdict-standard.html. The same file is what gets republished to
the claude.ai artifact when Anya wants the shareable copy updated.

    python3 tools/build-verdict-standard.py
"""

import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
TEMPLATE = ROOT / "tools" / "templates" / "verdict-standard.template.html"
OUT = ROOT / "docs" / "verdict-standard.html"

FRONTS = ("formula", "materials", "legal", "testing")
MARK = {"pass": "p", "caution": "c", "fail": "f", "none": "n",
        "unassessed": "u", "unknown": "u", None: "u", "": "u"}


def main():
    brands = json.loads(DATA.read_text())
    rows = []
    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext") or {}
            fronts = e.get("fronts") or {}
            notes = e.get("frontNotes") or {}
            rows.append({
                "b": b["brand"],
                "p": p.get("name") or "",
                "c": p.get("cat") or b.get("category") or "",
                "v": e.get("verdict") or "unrated",
                "f": [MARK.get(fronts.get(k), "u") for k in FRONTS],
                "a": (p.get("asins") or [None])[0],
                "n": p.get("note") or "",
                "br": b.get("reason") or "",
                "lg": notes.get("legal") or "",
                "tn": notes.get("testing") or "",
                "w": e.get("why") or "",
                "d": e.get("dated") or "",
                "t": p.get("tradeoff") or "",
                "s": p.get("source") or b.get("article") or "",
            })

    html = TEMPLATE.read_text()
    for token in ("__ROWS_JSON__", "__DATE__"):
        if token not in html:
            raise SystemExit(f"template is missing {token}")
    # </script> inside a JSON string would end the block early; escape it the
    # way JSON allows.
    blob = json.dumps(rows, ensure_ascii=False,
                      separators=(",", ":")).replace("</", "<\\/")
    html = html.replace("__ROWS_JSON__", blob)
    html = html.replace("__DATE__", datetime.date.today().isoformat())

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    from collections import Counter
    tally = Counter(r["v"] for r in rows)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} rows "
          f"({', '.join(f'{k} {v}' for k, v in tally.most_common())})")


if __name__ == "__main__":
    sys.exit(main())
