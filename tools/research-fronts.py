#!/usr/bin/env python3
"""
Draft the four fronts for brands that are missing them, using Claude with web search.

This does the same work as researching a brand by hand: search, read, decide a
verdict per front, write a note with a source. It writes drafts to a review
queue rather than into brand-data.json, because an unreviewed verdict about a
named brand shown at the point of purchase is exactly the claim we cannot
afford to get wrong.

    export ANTHROPIC_API_KEY=sk-ant-...
    pip install anthropic

    python3 tools/research-fronts.py --list              # what is missing, ranked
    python3 tools/research-fronts.py --limit 10          # draft 10 into the queue
    python3 tools/research-fronts.py --brand "Bugaboo"   # draft one
    python3 tools/research-fronts.py --approve           # merge approved drafts

Review flow: drafts land in data/front-drafts.json with "approved": false.
Flip the ones you agree with to true, then run --approve. Only those are merged,
and they are written with "authored": true so the classifier never overwrites
them.
"""

import argparse
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ASINS = ROOT / "extension" / "data" / "asin-map.json"
QUEUE = ROOT / "data" / "front-drafts.json"

FRONTS = ("formula", "packaging", "legal", "testing")
MODEL = "claude-opus-5"

FRONT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["formula", "packaging", "legal", "testing", "sources"],
    "properties": {
        **{
            f: {
                "type": "object",
                "additionalProperties": False,
                "required": ["status", "note"],
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pass", "caution", "fail", "unknown"],
                        "description": "unknown when research genuinely found nothing. Never guess.",
                    },
                    "note": {
                        "type": "string",
                        "description": "One or two sentences of specific fact. Empty when status is unknown.",
                    },
                },
            }
            for f in FRONTS
        },
        "sources": {"type": "array", "items": {"type": "string"}},
    },
}

SYSTEM = """You research consumer brands for Plastic Detox and decide a verdict on four fronts.

  formula    what the product is made of: ingredients, fibres, coatings, materials
  packaging  what it ships and sits in: bottle, liner, lid, wrapper, housing
  legal      recalls, class actions, lawsuits, regulatory action
  testing    third-party lab results and certifications

Rules that matter more than coverage:

1. Never invent a finding. If searching does not surface anything solid for a
   front, return status "unknown" with an empty note. An honest gap is fine; a
   confident guess about a named brand is not.
2. Reserve "fail" for something specific and documented: a filed suit, an issued
   recall, a published lab result, a disclosed hazardous material. Where the
   evidence is real but contested or partial, use "caution".
3. A settlement where the company admitted no wrongdoing, or a regulator looked
   and found no link, is a "caution" at most, never a "fail". Say so in the note.
4. Prefer primary sources: the regulator, the lab, the court filing, the
   company's own disclosure. Name the source and the year in the note.
5. Notes are spec-sheet plain. No marketing language, no adjectives doing work
   that a fact should do.
6. Absence of a recall is only a "pass" on the legal front if you actually
   looked and found none. Say "no recall or filed suit found" rather than
   implying a clean bill of health you did not verify."""


def prompt_for(brand):
    lines = [
        f"Brand: {brand['brand']}",
        f"Category: {brand.get('category', 'unknown')}",
        f"Our current verdict: {brand.get('stance', 'none')}",
    ]
    if brand.get("reason"):
        lines.append(f"What we have already written: {brand['reason']}")
    if brand.get("evidence"):
        lines.append(f"Evidence noted: {brand['evidence']}")
    missing = [f for f in FRONTS
               if (brand.get("fronts") or {}).get(f, {}).get("status", "unknown") == "unknown"]
    lines.append(f"\nFronts still blank: {', '.join(missing)}")
    lines.append(
        "\nSearch the web and return a verdict for all four fronts. For fronts we "
        "already have, confirm or correct them. Return unknown where you find nothing."
    )
    return "\n".join(lines)


def load_queue():
    if QUEUE.exists():
        return json.loads(QUEUE.read_text())
    return {}


def save_queue(q):
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE.write_text(json.dumps(q, indent=2, ensure_ascii=False) + "\n")


def missing_ranked(brands):
    """Brands with blank fronts, those visible on a mapped Amazon page first."""
    on_shelf = set()
    if ASINS.exists():
        on_shelf = {e.get("brandId") for e in json.loads(ASINS.read_text()).values()}
    rows = []
    for b in brands:
        fr = b.get("fronts") or {}
        if fr.get("authored"):
            continue
        blank = [f for f in FRONTS if (fr.get(f) or {}).get("status", "unknown") == "unknown"]
        if not blank:
            continue
        rows.append((b["id"] in on_shelf, len(blank), b))
    rows.sort(key=lambda t: (not t[0], -t[1], t[2]["brand"]))
    return [r[2] for r in rows]


def research(client, brand):
    resp = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": FRONT_SCHEMA}},
        messages=[{"role": "user", "content": prompt_for(brand)}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError(f"refused: {getattr(resp, 'stop_details', None)}")
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    usage = resp.usage
    return json.loads(text), {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
    }


def cmd_approve(brands):
    q = load_queue()
    merged = 0
    by_id = {b["id"]: b for b in brands}
    for bid, draft in q.items():
        if not draft.get("approved"):
            continue
        b = by_id.get(bid)
        if not b:
            continue
        fronts = {"authored": True}
        for f in FRONTS:
            # Approving a draft is the human review, so it graduates to origin
            # "human". Anything not approved never reaches brand-data.json.
            fronts[f] = {"status": draft[f]["status"], "note": draft[f]["note"],
                         "origin": "human"}
        b["fronts"] = fronts
        b["reviewed"] = True
        s = set(b.get("sources") or []); s.update(draft.get("sources") or [])
        b["sources"] = sorted(s)
        merged += 1
    DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
    print(f"merged {merged} approved drafts into brand-data.json")
    print("re-run tools/build-extension.py to publish")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="show what is missing, ranked")
    ap.add_argument("--limit", type=int, default=0, help="how many brands to draft")
    ap.add_argument("--brand", help="draft a single named brand")
    ap.add_argument("--approve", action="store_true", help="merge approved drafts")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())

    if args.approve:
        return cmd_approve(brands)

    todo = missing_ranked(brands)
    if args.brand:
        todo = [b for b in brands if b["brand"].lower() == args.brand.lower()]
        if not todo:
            raise SystemExit(f"no brand named {args.brand!r}")

    if args.list or (not args.limit and not args.brand):
        blank_cells = sum(
            1 for b in todo for f in FRONTS
            if (b.get("fronts") or {}).get(f, {}).get("status", "unknown") == "unknown"
        )
        print(f"{len(todo)} brands with blank fronts, {blank_cells} blank cells")
        print(f"at roughly $0.30 a brand that is about ${len(todo) * 0.30:,.0f} to draft all of them\n")
        for b in todo[:30]:
            blank = [f for f in FRONTS
                     if (b.get("fronts") or {}).get(f, {}).get("status", "unknown") == "unknown"]
            print(f"  [{b.get('stance','?'):7}] {b['brand']:<26} missing: {','.join(blank)}")
        print("\nrun with --limit N to draft the first N")
        return

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set")
    try:
        import anthropic
    except ImportError:
        raise SystemExit("pip install anthropic")

    client = anthropic.Anthropic()
    q = load_queue()
    spent_in = spent_out = 0
    batch = todo[: args.limit] if args.limit else todo

    for i, b in enumerate(batch, 1):
        if b["id"] in q and not q[b["id"]].get("approved"):
            print(f"  [{i}/{len(batch)}] {b['brand']}: already queued, skipping")
            continue
        try:
            draft, usage = research(client, b)
        except Exception as e:
            print(f"  [{i}/{len(batch)}] {b['brand']}: FAILED {e}")
            continue
        spent_in += usage["input_tokens"]; spent_out += usage["output_tokens"]
        draft["approved"] = False
        draft["brand"] = b["brand"]
        q[b["id"]] = draft
        save_queue(q)
        chips = " ".join(f"{f[:4]}:{draft[f]['status']}" for f in FRONTS)
        print(f"  [{i}/{len(batch)}] {b['brand']:<26} {chips}")

    cost = spent_in / 1e6 * 5 + spent_out / 1e6 * 25   # Opus 5 rates
    print(f"\ndrafted into {QUEUE.relative_to(ROOT)}")
    print(f"tokens: {spent_in:,} in / {spent_out:,} out  ~${cost:,.2f} (excludes web search fees)")
    print("review the file, set approved: true on the ones you accept, then --approve")


if __name__ == "__main__":
    sys.exit(main())
