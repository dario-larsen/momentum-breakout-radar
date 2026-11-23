// Breakout Radar — the dashboard. Renders window.RADAR (written by main.ts from the
// sealed snapshot) into a sortable, filterable board with a detail view per protocol.
// No network: every byte it shows comes from data.js beside this page.

(function () {
  'use strict';
  var R = window.RADAR;
  var root = document.getElementById('board');
  if (!R || !R.rows) {
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '<div class="wrap"><p class="empty">No radar data beside this page.</p></div>';
    return;
  }

  var state = {
    q: '',
    cat: 'all',
    chain: 'all',
    minTvl: 0,
    watchOnly: false,
    breakoutOnly: false,
    sortKey: 'implied',
    sortDir: -1,
    detail: null,
    base: R.model.base_multiple,
    weight: 1,
    sandboxOn: false,
  };

  // Hash routing, so a view can be linked: #detail=<slug>, #breakout, #cat=<category>.
  // A hash-opened detail renders first, so the linked view is what shows.
  var detailFirst = false;
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    var parts = h.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) { state.detail = v; detailFirst = true; }
      if (k === 'breakout') state.breakoutOnly = true;
      if (k === 'cat' && v) state.cat = v;
    }
  }
  readHash();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    var v = n.toFixed(1) + '%';
    return (n > 0 ? '+' : '') + v;
  }
  function pctClass(n) {
    if (n == null) return 'flat';
    return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  }
  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function isBreakout(r) {
    return (r.growth_pct != null && r.growth_pct >= 20) || (r.change_7d != null && r.change_7d >= 20);
  }
  function isWatch(r) {
    return R.watchlist && R.watchlist.indexOf(r.slug) >= 0;
  }

  // The sandbox re-prices a row from its stored factors: base multiple and momentum
  // weight are the two dials, everything else is the snapshot's own figure.
  function sandboxImplied(r) {
    var g = r.growth_pct != null ? r.growth_pct : 0;
    var momentum = 1 + (state.weight * g) / 100;
    return Math.max(1, Math.round(r.tvl_usd * state.base * momentum * (0.7 + 0.6 * r.velocity) * r.patience * r.sector_multiplier * r.spread_multiplier));
  }
  function shownImplied(r) {
    return state.sandboxOn ? sandboxImplied(r) : r.implied_value_usd;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !isWatch(r)) return false;
      if (state.breakoutOnly && !isBreakout(r)) return false;
      return true;
    });
    var key = state.sortKey;
    var dir = state.sortDir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = shownImplied(a); bv = shownImplied(b); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d == null ? -Infinity : a.change_7d; bv = b.change_7d == null ? -Infinity : b.change_7d; }
      else if (key === 'inflow') { av = a.weekly_inflow_usd; bv = b.weekly_inflow_usd; }
      else if (key === 'age') { av = a.age_days == null ? -1 : a.age_days; bv = b.age_days == null ? -1 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      if (av !== bv) return (av < bv ? -1 : 1) * dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  function momentumBadge(r) {
    if (isBreakout(r)) return '<span class="badge breakout">breakout</span>';
    if (r.growth_pct != null && r.growth_pct >= 5) return '<span class="badge hot">warming</span>';
    return '';
  }

  function rowHtml(r, pos) {
    var vel = Math.max(0, Math.min(1, r.velocity || 0));
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="selected"' : '') + '>' +
      '<td class="num">' + pos + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' + momentumBadge(r) +
      (isWatch(r) ? '<span class="badge watch">watchlist</span>' : '') +
      '<br><span class="slug">' + esc(r.slug) + '</span> <span class="cat">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.slice(0, 2).join(', ') || '—') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</span></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + money(r.weekly_inflow_usd) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num"><span class="meter"><i style="width:' + Math.round(vel * 100) + '%"></i></span>' + money(shownImplied(r)) + '</td>' +
      '</tr>';
  }

  function detailHtml(r) {
    var m = r;
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var factors = [
      ['Momentum', (m.momentum || 1).toFixed(2) + 'x', '7-day growth ' + pct(m.change_7d) + ' × momentum weight', Math.min(1, (m.momentum || 1) / 3)],
      ['Velocity', (m.velocity || 0).toFixed(2), money(m.weekly_inflow_usd) + ' of new TVL in the last week', Math.max(0, Math.min(1, m.velocity || 0))],
      ['Patience', (m.patience || 0).toFixed(2) + 'x', ageText(m.age_days) + ' listed with no token recorded', Math.max(0, Math.min(1, ((m.patience || 0.7) - 0.7) / 0.3))],
      ['Sector', (m.sector_multiplier || 1).toFixed(2) + 'x', 'its category’s median weekly growth', Math.max(0, Math.min(1, ((m.sector_multiplier || 1) - 0.9) / 0.4))],
      ['Spread', (m.spread_multiplier || 1).toFixed(2) + 'x', m.chains.length + ' chain' + (m.chains.length === 1 ? '' : 's') + ': ' + esc(m.chains.join(', ') || '—'), Math.max(0, Math.min(1, ((m.spread_multiplier || 1) - 1) / 0.2))],
      ['Implied value', money(m.implied_value_usd), 'TVL × 0.22 × momentum × velocity × patience × sector × spread', 1],
    ];
    var fh = factors.map(function (f) {
      return '<div class="factor"><b>' + f[1] + '</b><span>' + f[0] + ' — ' + f[2] + '</span><div class="bar"><i style="width:' + Math.round(f[3] * 100) + '%"></i></div></div>';
    }).join('');
    return '<section class="detail" id="detail"><button class="back" id="backBtn">← Back to the board</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="d-sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') +
      ' · TVL ' + moneyFull(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · listed ' + (r.listed_at || 'unknown') + '</p>' +
      '<div class="factors">' + fh + '</div>' +
      '<p class="math">Implied value ' + moneyFull(r.implied_value_usd) + ' = TVL ' + moneyFull(r.tvl_usd) + ' × 0.22 × momentum ' + (m.momentum || 1).toFixed(2) +
      ' × (0.7 + 0.6 × velocity ' + (m.velocity || 0).toFixed(2) + ') × patience ' + (m.patience || 0).toFixed(2) +
      ' × sector ' + (m.sector_multiplier || 1).toFixed(2) + ' × spread ' + (m.spread_multiplier || 1).toFixed(2) +
      '. The snapshot records no token for this protocol; that is the record, not a promise it has none.</p>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol></section>';
  }

  function render() {
    var rows = filteredRows();
    var cats = {};
    R.rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = true; });
    var catNames = Object.keys(cats).sort();
    var chains = {};
    R.rows.forEach(function (r) { r.chains.forEach(function (c) { chains[c] = true; }); });
    var chainNames = Object.keys(chains).sort();
    var topInflow = R.rows.slice().sort(function (a, b) { return b.weekly_inflow_usd - a.weekly_inflow_usd; }).slice(0, 5);
    var breakoutCount = R.rows.filter(isBreakout).length;
    var detailRow = state.detail ? R.rows.filter(function (r) { return r.slug === state.detail; })[0] : null;

    var h = '<div class="wrap">';
    // A hash-opened detail renders first, so the linked view is what shows without scrolling.
    if (detailFirst && detailRow) h += detailHtml(detailRow);
    h += '<header class="hero"><h1><span class="mark">Breakout</span> Radar</h1>' +
      '<p class="sub">Pre-token protocols ranked by the implied value of a token they have not issued yet. ' +
      'The radar watches for breakouts: TVL growing fast right now, while the snapshot records no token. ' +
      'A board row is a claim about value if the record stays as it is — never a prediction that a token is coming.</p></header>';
    h += '<div class="stats">' +
      '<div class="stat"><b>' + R.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + breakoutCount + '</b><span>breaking out (7d ≥ +20%)</span></div>' +
      '<div class="stat"><b>' + R.live_size + '</b><span>live tokens set aside</span></div>' +
      '<div class="stat"><b>' + esc(R.as_of) + '</b><span>snapshot date</span></div></div>';
    h += '<section class="model"><h2>How the value is priced — model ' + esc(R.model_version) + '</h2>' +
      '<p class="formula">implied = TVL × 0.22 × momentum × (0.7 + 0.6 × velocity) × patience × sector × spread</p>' +
      '<p><code>momentum</code> is 1 + the 7-day TVL change (clamped −50% to +200%). <code>velocity</code> saturates on the week’s new TVL dollars — $5M of weekly inflow scores 0.5. <code>patience</code> grows with the days listed with no token recorded. <code>sector</code> is the protocol’s category median growth, and <code>spread</code> rewards a multi-chain footprint. Every factor comes from the sealed snapshot; no protocol name is ever special-cased.</p></section>';
    h += '<section class="ticker"><h2>Biggest weekly inflows</h2><ol>' +
      topInflow.map(function (r) {
        return '<li><button data-detail="' + esc(r.slug) + '"><span class="t-name">' + esc(r.name) + '</span>' +
          '<span class="t-flow">+' + money(r.weekly_inflow_usd) + ' this week</span>' +
          '<span class="t-growth">' + pct(r.change_7d) + ' · TVL ' + money(r.tvl_usd) + '</span></button></li>';
      }).join('') + '</ol></section>';

    h += '<div class="controls">' +
      '<label>Search<input type="search" id="q" placeholder="Name or slug…" value="' + esc(state.q) + '"></label>' +
      '<label>Category<select id="cat"><option value="all">All categories</option>' +
      catNames.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Chain<select id="chain"><option value="all">All chains</option>' +
      chainNames.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Min TVL<select id="minTvl">' +
      [[0, 'Any size'], [5000000, '$5M+'], [50000000, '$50M+ (watchlist floor)'], [500000000, '$500M+'], [5000000000, '$5B+']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.minTvl === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>' +
      '<label class="check"><input type="checkbox" id="watchOnly"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<label class="check"><input type="checkbox" id="breakoutOnly"' + (state.breakoutOnly ? ' checked' : '') + '> Breakouts only</label>' +
      '<label>Sort by<select id="sort">' +
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['inflow', 'Weekly inflow'], ['age', 'Age']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.sortKey === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>' +
      '<button class="reset" id="resetBtn">Reset</button></div>';

    if (detailRow && !detailFirst) h += detailHtml(detailRow);
    h += '<p class="count">Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols' +
      (state.sandboxOn ? ' · sandbox pricing on (base ×' + state.base.toFixed(2) + ', momentum weight ×' + state.weight.toFixed(1) + ')' : '') + ' · click a row for its detail and farm plan.</p>';
    var sortBtn = function (key, label) {
      return '<button data-sort="' + key + '">' + label + (state.sortKey === key ? (state.sortDir === -1 ? ' ↓' : ' ↑') : '') + '</button>';
    };
    h += '<table class="board"><colgroup><col style="width:44px"><col><col style="width:92px"><col style="width:72px"><col style="width:112px"><col style="width:62px"><col style="width:168px"></colgroup><thead><tr><th class="num">#</th><th>Protocol</th><th class="num">' + sortBtn('tvl', 'TVL') + '</th>' +
      '<th class="num">' + sortBtn('growth', '7d') + '</th><th class="num">' + sortBtn('inflow', 'Inflow / wk') + '</th>' +
      '<th class="num">' + sortBtn('age', 'Age') + '</th><th class="num">' + sortBtn('implied', 'Implied') + '</th></tr></thead><tbody>';
    if (rows.length === 0) {
      h += '<tr><td colspan="7"><p class="empty">Nothing matches these filters. Loosen one and try again.</p></td></tr>';
    } else {
      h += rows.map(function (r, i) { return rowHtml(r, i + 1); }).join('');
    }
    h += '</tbody></table>';

    h += '<section class="live"><h2>Already trading — set aside</h2>' +
      '<p class="count" style="margin-top:4px">These protocols record a token, so the market already prices them. They are not farmable for a launch, and they never enter the ranked board.</p>' +
      '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Market cap</th></tr></thead><tbody>' +
      R.live.map(function (p) {
        return '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="slug">' + esc(p.slug) + '</span> <span class="cat">' + esc(p.category || 'Uncategorised') + '</span></td>' +
          '<td class="num">' + money(p.tvl_usd) + '</td><td class="num ' + pctClass(p.change_7d) + '">' + pct(p.change_7d) + '</td><td class="num">' + money(p.mcap_usd) + '</td></tr>';
      }).join('') + '</tbody></table></section>';

    h += '<section class="sandbox"><h2>Try the model yourself</h2>' +
      '<div class="row">' +
      '<label>Base multiple — TVL × <output id="baseOut">' + state.base.toFixed(2) + '</output><input type="range" id="baseRange" min="0.10" max="0.40" step="0.01" value="' + state.base + '"></label>' +
      '<label>Momentum weight — growth counts <output id="weightOut">×' + state.weight.toFixed(1) + '</output><input type="range" id="weightRange" min="0" max="2" step="0.1" value="' + state.weight + '"></label>' +
      '</div><p>Moving a dial re-prices every row from the same snapshot figures and re-sorts the board on this page. It changes nothing in the ranked board the program wrote — the model’s own dials are base ×0.22 and weight ×1.0.</p></section>';

    h += '<footer class="foot"><p>Source: the sealed snapshot, ' + esc(R.source) + '. “Records no token” is what the record says — a protocol on this board may still have a token its record does not carry.</p>' +
      '<p>Built with an uncensored model — superbot.gg runs the same kind of model that can help you win bounties like this one. Implied values are this radar’s own claims, never the exchange’s, and never a promise a token is coming.</p></footer>';
    h += '</div>';
    root.innerHTML = h;
    root.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; render(); });
    var minTvl = document.getElementById('minTvl');
    if (minTvl) minTvl.addEventListener('change', function () { state.minTvl = Number(minTvl.value); render(); });
    var watchOnly = document.getElementById('watchOnly');
    if (watchOnly) watchOnly.addEventListener('change', function () { state.watchOnly = watchOnly.checked; render(); });
    var breakoutOnly = document.getElementById('breakoutOnly');
    if (breakoutOnly) breakoutOnly.addEventListener('change', function () { state.breakoutOnly = breakoutOnly.checked; render(); });
    var sort = document.getElementById('sort');
    if (sort) sort.addEventListener('change', function () { state.sortKey = sort.value; state.sortDir = -1; render(); });
    var reset = document.getElementById('resetBtn');
    if (reset) reset.addEventListener('click', function () {
      state.q = ''; state.cat = 'all'; state.chain = 'all'; state.minTvl = 0;
      state.watchOnly = false; state.breakoutOnly = false; state.sortKey = 'implied'; state.sortDir = -1;
      state.detail = null; state.sandboxOn = false; state.base = R.model.base_multiple; state.weight = 1;
      detailFirst = false;
      render();
    });
    var back = document.getElementById('backBtn');
    if (back) back.addEventListener('click', function () { state.detail = null; detailFirst = false; render(); });
    var rows = root.querySelectorAll('tbody tr[data-slug]');
    rows.forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.detail = tr.getAttribute('data-slug');
        render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView();
      });
    });
    var tickers = root.querySelectorAll('[data-detail]');
    tickers.forEach(function (b) {
      b.addEventListener('click', function () { state.detail = b.getAttribute('data-detail'); render(); });
    });
    var sortBtns = root.querySelectorAll('[data-sort]');
    sortBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = -state.sortDir;
        else { state.sortKey = k; state.sortDir = -1; }
        render();
      });
    });
    var baseRange = document.getElementById('baseRange');
    if (baseRange) baseRange.addEventListener('input', function () {
      state.base = Number(baseRange.value); state.sandboxOn = true;
      document.getElementById('baseOut').textContent = state.base.toFixed(2);
      render();
    });
    var weightRange = document.getElementById('weightRange');
    if (weightRange) weightRange.addEventListener('input', function () {
      state.weight = Number(weightRange.value); state.sandboxOn = true;
      document.getElementById('weightOut').textContent = '×' + state.weight.toFixed(1);
      render();
    });
  }

  render();
})();
