/* ============================================================================
   PLAN ENGINE
   Takes quiz answers, returns a personalised, ranked, budget capped plan.
   Pure function, no DOM. Loaded by my-plan.html and testable in node.
   ============================================================================ */
(function (root) {

  function tierNum(t) {
    if (!t) return 2;
    var m = String(t).match(/^\$+/);
    return m ? m[0].length : 2;
  }

  function keyOf(p) { return p.cat + '|' + (p.sub || p.cat); }

  function ruleStages(rule) {
    return rule.stage === 'all' ? null : rule.stage.split(',');
  }

  /* answers = {
       rooms:      ['kitchen','bathroom', ...]
       stages:     ['expecting','baby', ...]      (empty if no kids)
       triggers:   { cook:true, coffee:false, ... }
       budget:     'essentials' | 'moderate' | 'thorough'
       concern:    'water' | 'kitchen' | ...
     } */
  function buildPlan(answers, PRODUCTS, RULES, BUDGETS, CONCERNS, TRIGGERS) {
    var budget  = BUDGETS.filter(function (b) { return b.id === answers.budget; })[0] || BUDGETS[1];
    var concern = CONCERNS.filter(function (c) { return c.id === answers.concern; })[0] || null;

    var rooms    = answers.rooms || [];
    var stages   = answers.stages || [];
    var triggers = answers.triggers || {};

    /* ---- 1. relevance filter, recording why each rule was dropped ---- */
    var kept = [], dropped = [];

    RULES.forEach(function (rule) {
      var rs = ruleStages(rule);

      if (rs) {
        var match = rs.some(function (s) { return stages.indexOf(s) !== -1; });
        if (!match) {
          dropped.push({ rule: rule, reason: stages.length ? 'stage' : 'nokids' });
          return;
        }
      }
      if (rule.needs && !triggers[rule.needs]) {
        dropped.push({ rule: rule, reason: 'trigger:' + rule.needs });
        return;
      }
      if (rule.room !== 'any' && rooms.indexOf(rule.room) === -1) {
        dropped.push({ rule: rule, reason: 'room:' + rule.room });
        return;
      }
      kept.push(rule);
    });

    /* ---- 2. score ---- */
    var scored = kept.map(function (rule) {
      var score = rule.rank;
      if (concern) {
        if (concern.boost && concern.boost[rule.room]) score += concern.boost[rule.room];
        if (concern.keys && concern.keys.indexOf(rule.key) !== -1) score += (concern.keyBoost || 0);
      }
      return { rule: rule, score: score };
    });

    scored.sort(function (a, b) {
      return b.score - a.score || a.rule.swap.localeCompare(b.rule.swap);
    });

    /* ---- 3. budget cut ---- */
    var included = [], deferred = [];
    scored.forEach(function (s) {
      if (included.length < budget.maxSwaps && s.score >= budget.minRank) included.push(s);
      else deferred.push(s);
    });

    /* ---- 4. attach products, cheapest passing option within the tier cap ---- */
    var byKey = {};
    PRODUCTS.forEach(function (p) {
      var k = keyOf(p);
      (byKey[k] = byKey[k] || []).push(p);
    });

    var shownCount = 0;

    included.forEach(function (s) {
      var pool = (byKey[s.rule.key] || []).slice();
      var afford = pool.filter(function (p) { return tierNum(p.tier) <= budget.tierCap; });
      // if nothing fits the cap, show the single cheapest so the swap is never empty
      if (!afford.length && pool.length) {
        afford = pool.slice().sort(function (a, b) { return tierNum(a.tier) - tierNum(b.tier); }).slice(0, 1);
        s.overBudget = true;
      }
      afford.sort(function (a, b) {
        if (!!b.top !== !!a.top) return b.top ? 1 : -1;      // editor's pick first
        return tierNum(a.tier) - tierNum(b.tier);            // then cheapest
      });
      var n = budget.id === 'essentials' ? 1 : (budget.id === 'moderate' ? 2 : 3);
      s.products = afford.slice(0, n);
      shownCount += s.products.length;
    });

    /* ---- 5. pace into months ---- */
    var perMonth = Math.max(3, Math.ceil(included.length / 3));
    included.forEach(function (s, i) { s.month = Math.min(3, Math.floor(i / perMonth) + 1); });

    var months = [1, 2, 3].map(function (m) {
      var items = included.filter(function (s) { return s.month === m; });
      return {
        month: m,
        items: items,
        cost: items.reduce(function (t, s) { return t + s.rule.est; }, 0)
      };
    }).filter(function (m) { return m.items.length; });

    /* ---- 6. exclusion breakdown, the part that makes this not a catalog ---- */
    var reasons = {};
    dropped.forEach(function (d) {
      var n = (byKey[d.rule.key] || []).length;
      var label;
      if (d.reason === 'nokids')            label = 'No children in the household';
      else if (d.reason === 'stage')        label = 'Outside your children’s ages';
      else if (d.reason.indexOf('room:') === 0) {
        var rid = d.reason.slice(5);
        var rl  = (root.PLAN_ROOMS || []).filter(function (r) { return r.id === rid; })[0];
        label = 'Room not selected: ' + (rl ? rl.label : rid);
      } else {
        var tid = d.reason.slice(8);
        var tl  = (TRIGGERS || []).filter(function (t) { return t.id === tid; })[0];
        label = 'Does not apply: ' + (tl ? tl.label.toLowerCase() : tid);
      }
      reasons[label] = (reasons[label] || 0) + n;
    });

    var excludedList = Object.keys(reasons)
      .map(function (k) { return { label: k, count: reasons[k] }; })
      .sort(function (a, b) { return b.count - a.count; });

    var totalExcluded = excludedList.reduce(function (t, r) { return t + r.count; }, 0);
    var deferredProducts = deferred.reduce(function (t, s) { return t + (byKey[s.rule.key] || []).length; }, 0);

    return {
      budget: budget,
      months: months,
      included: included,
      deferred: deferred,
      excluded: excludedList,
      counts: {
        catalog:    PRODUCTS.length,
        shown:      shownCount,
        swaps:      included.length,
        ruledOut:   totalExcluded,
        deferred:   deferredProducts,
        laterSwaps: deferred.length
      },
      cost: {
        total: included.reduce(function (t, s) { return t + s.rule.est; }, 0),
        free:  included.filter(function (s) { return s.rule.free; }).length
      }
    };
  }

  root.PlanEngine = { buildPlan: buildPlan, tierNum: tierNum, keyOf: keyOf };

})(typeof window !== 'undefined' ? window : global);
