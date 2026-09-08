#!/usr/bin/env bash
# Is the database consistent with its own rules, right now?
#
# The rules are written down and implemented, and they were still not being
# followed, because nothing ran them. There is no CI here and validate-data was
# in no script, so the logic applied whenever a person remembered to type it.
# The database drifted quietly between those moments: 14 product rows carried no
# scorecard at all, and 57 products were being held back from the shop by
# evidence that had since arrived.
#
# Two questions, and they are different:
#
#   1. Does the stored data break a rule?           validate-data
#   2. Would running the rules change any verdict?  apply-product-rules, dry
#
# The second is the one that catches drift. A database can be internally valid
# and still be out of date with the evidence sitting next to it.
#
#     tools/check.sh          both questions, read only, exits non zero on a problem
#     tools/check.sh --fix    run the rules and the ceiling, then re-check
#
# Wire it in with:  git config core.hooksPath tools/hooks

set -u
cd "$(dirname "$0")/.."
fail=0

if [ "${1:-}" = "--fix" ]; then
  echo "==> applying the rules"
  python3 tools/apply-product-rules.py --write || exit 1
  python3 tools/enforce-scorecard.py --write || exit 1
  echo
fi

echo "==> 1. does the stored data break a rule?"
if python3 tools/validate-data.py > /tmp/pd-validate.log 2>&1; then
  tail -2 /tmp/pd-validate.log | sed 's/^/    /'
else
  grep '!!' /tmp/pd-validate.log | head -12 | sed 's/^/    /'
  echo "    ... $(grep -c '!!' /tmp/pd-validate.log) problems. tools/check.sh --fix, or fix by hand."
  fail=1
fi

echo
echo "==> 2. would running the rules change a verdict?"
before=$(python3 - <<'PY'
import json,hashlib
d=json.load(open('brand-data.json'))
v=[f"{b['brand']}|{p.get('name')}|{(p.get('ext') or {}).get('verdict')}"
   for b in d for p in (b.get('products') or [])]
print(hashlib.sha1("\n".join(sorted(v)).encode()).hexdigest())
PY
)
cp brand-data.json /tmp/pd-bd.json
python3 tools/apply-product-rules.py --write > /dev/null 2>&1
python3 tools/enforce-scorecard.py --write > /dev/null 2>&1
after=$(python3 - <<'PY'
import json,hashlib
d=json.load(open('brand-data.json'))
v=[f"{b['brand']}|{p.get('name')}|{(p.get('ext') or {}).get('verdict')}"
   for b in d for p in (b.get('products') or [])]
print(hashlib.sha1("\n".join(sorted(v)).encode()).hexdigest())
PY
)
if [ "$before" = "$after" ]; then
  echo "    no. every verdict already matches the evidence behind it."
  mv /tmp/pd-bd.json brand-data.json
else
  python3 - <<'PY'
import json
old=json.load(open('/tmp/pd-bd.json')); new=json.load(open('brand-data.json'))
r=lambda d:{(b['brand'],p.get('name')):(p.get('ext') or {}).get('verdict')
            for b in d for p in (b.get('products') or [])}
o,n=r(old),r(new)
moved=[(k,o[k],n[k]) for k in o if k in n and o[k]!=n[k]]
print(f"    yes, {len(moved)} verdicts are stale:")
for (br,nm),a,b in moved[:12]:
    print(f"      {br[:18]:<18} {str(nm)[:30]:<30} {str(a):<8} -> {b}")
if len(moved) > 12: print(f"      ... and {len(moved)-12} more")
PY
  mv /tmp/pd-bd.json brand-data.json
  echo "    run tools/check.sh --fix to apply them."
  fail=1
fi

echo
[ "$fail" = 0 ] && echo "clean." || echo "not clean."
exit $fail
