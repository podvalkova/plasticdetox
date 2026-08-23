#!/usr/bin/env python3
"""Brand Check consistency audit.

Standing rule: a brand rated careful or skip must not appear as a pick in the
store or in any article, unless brand-data.json carries a products[] row
marking that specific product good.

Run from the repo root:  python3 tools/brand-store-audit.py
Exit code 1 if any violation remains, so it can gate a commit.
"""
import json, re, sys, glob

MIN_TOK = 2
ROW_MATCH = 0.30   # share of a products[] row's tokens that must appear in the item name


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()


def toks(s):
    return [t for t in norm(s).split() if len(t) >= MIN_TOK]


def load_brands():
    brands = json.load(open('brand-data.json', encoding='utf-8'))
    for b in brands:
        b['_names'] = [norm(b['brand'])] + [norm(a) for a in b.get('aliases', [])]
    return brands


def match_brand(brands, name):
    """Longest brand name or alias appearing as whole words in the item name."""
    padded = ' ' + norm(name) + ' '
    best = None
    for b in brands:
        for cand in b['_names']:
            if len(cand) >= 3 and ' ' + cand + ' ' in padded:
                if best is None or len(cand) > best[1]:
                    best = (b, len(cand))
    return best[0] if best else None


def product_verdict(brand, item_name):
    """Verdict of the products[] row that best covers this item, if any."""
    item = set(toks(item_name))
    best = None
    for p in brand.get('products', []):
        row = toks(p['name'])
        if not row:
            continue
        overlap = sum(1 for t in row if t in item)
        ratio = overlap / len(row)
        if overlap and ratio >= ROW_MATCH and (best is None or overlap > best[0]):
            best = (overlap, p.get('verdict'))
    return best[1] if best else None


def store_items():
    """store.html holds the live array; data/store-products.js mirrors it."""
    for path in ('store.html', 'data/store-products.js'):
        try:
            t = open(path, encoding='utf-8').read()
        except FileNotFoundError:
            continue
        k = t.find('storeProducts = [')
        if k < 0:
            k = t.find('STORE_PRODUCTS = [')
        if k < 0:
            continue
        start = t.index('[', k)
        depth, i, quote, esc = 0, start, None, False
        while i < len(t):
            c = t[i]
            if quote:
                if esc:
                    esc = False
                elif c == '\\':
                    esc = True
                elif c == quote:
                    quote = None
            elif c in '"\'`':
                quote = c
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    i += 1
                    break
            i += 1
        for m in re.finditer(r'name:\s*"([^"]+)"', t[start:i]):
            yield path, m.group(1)


def article_items():
    for f in sorted(glob.glob('articles/*.html')):
        html = open(f, encoding='utf-8').read()
        for m in re.finditer(r'<h[34] class="product-card-name">(.*?)</h[34]>', html, re.S):
            yield f, re.sub('<[^>]+>', '', m.group(1)).strip()


def main():
    brands = load_brands()
    flagged, violations = 0, []
    for where, name in list(article_items()) + list(store_items()):
        b = match_brand(brands, name)
        if not b or b['stance'] not in ('careful', 'skip'):
            continue
        flagged += 1
        if product_verdict(b, name) != 'good':
            violations.append((where, b['brand'], b['stance'], name))

    print(f'flagged {flagged} | resolved {flagged - len(violations)} | violations {len(violations)}')
    for where, brand, stance, name in sorted(violations, key=lambda r: (r[1], r[3])):
        print(f'  [{stance:7}] {brand:20} {name[:40]:42} {where}')
    return 1 if violations else 0


if __name__ == '__main__':
    sys.exit(main())
