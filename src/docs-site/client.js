// Interactions of the public documentation: theme, menu drawer, search, tabs, copy, table filter, "Nesta página".
(function () {
  var root = document.documentElement
  var base = root.getAttribute('data-base') || ''
  var store = {
    get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  }
  var $ = function (s, el) { return (el || document).querySelector(s) }
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)) }

  // Theme: follows the device until the reader chooses; the choice is remembered.
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
  function applyTheme(light) { if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme') }
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var light = root.getAttribute('data-theme') !== 'light'
      applyTheme(light); store.set('notem-docs-tema', light ? 'claro' : 'escuro')
    })
  })
  if (media && media.addEventListener) media.addEventListener('change', function (e) { if (!store.get('notem-docs-tema')) applyTheme(e.matches) })

  // Menu drawer on small screens.
  var nav = $('#docs-nav'), backdrop = $('[data-nav-close]'), toggle = $('[data-nav-toggle]')
  function setNav(open) {
    document.body.classList.toggle('docs-nav-open', open)
    if (backdrop) backdrop.hidden = !open
    if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu') }
  }
  if (toggle) toggle.addEventListener('click', function () { setNav(!document.body.classList.contains('docs-nav-open')) })
  if (backdrop) backdrop.addEventListener('click', function () { setNav(false) })
  var current = nav && $('[aria-current="page"]', nav)
  // Scroll only the sidebar (never the page) so the current item is visible.
  if (current && nav) nav.scrollTop = Math.max(0, current.offsetTop - nav.clientHeight / 2)

  // Copy buttons.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]'); if (!btn) return
    var code = btn.closest('.docs-code').querySelector('code')
    var done = function () { btn.textContent = 'Copiado'; setTimeout(function () { btn.textContent = 'Copiar' }, 1500) }
    if (navigator.clipboard) navigator.clipboard.writeText(code.innerText).then(done, function () { btn.textContent = 'Não foi possível copiar' })
  })

  // Tabs: the code language (cURL / JavaScript) is remembered across pages.
  function selectTab(group, label) {
    $$('[role=tab]', group).forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === label)) })
    $$('[role=tabpanel]', group).forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== label })
  }
  var lang = store.get('notem-docs-aba')
  $$('[data-tabs]').forEach(function (g) {
    if (lang && g.getAttribute('data-tabs') === 'codigo' && $('[data-tab="' + lang + '"]', g)) selectTab(g, lang)
    $$('[role=tab]', g).forEach(function (t) {
      t.addEventListener('click', function () {
        var label = t.getAttribute('data-tab')
        if (g.getAttribute('data-tabs') === 'codigo') {
          store.set('notem-docs-aba', label)
          $$('[data-tabs="codigo"]').forEach(function (o) { if ($('[data-tab="' + label + '"]', o)) selectTab(o, label) })
        } else selectTab(g, label)
      })
    })
  })

  // Table filter (rejections).
  $$('[data-filter-table]').forEach(function (input) {
    var table = document.getElementById(input.getAttribute('data-filter-table'))
    input.addEventListener('input', function () {
      var q = norm(input.value)
      $$('tbody tr', table).forEach(function (tr) { tr.hidden = q && norm(tr.textContent).indexOf(q) < 0 })
    })
  })

  // "Nesta página": highlights the section being read.
  var tocLinks = $$('.docs-toc-link')
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {}; tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a })
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { tocLinks.forEach(function (a) { a.removeAttribute('data-active') }); var a = byId[en.target.id]; if (a) a.setAttribute('data-active', 'true') } })
    }, { rootMargin: '-80px 0px -70% 0px' })
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) io.observe(h) })
  }

  // Search: index loaded only when the search opens.
  function norm(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
  var box = $('[data-search]'), input = $('[data-search-input]'), list = $('[data-search-results]'), empty = $('[data-search-empty]')
  var index = null, loading = null, active = 0, lastFocus = null
  function load() {
    if (index || loading) return loading
    loading = fetch(base + '/busca.json').then(function (r) { return r.json() }).then(function (d) {
      index = d.map(function (e) { return { e: e, t: norm(e.t), h: norm(e.h), x: norm(e.x) } }); return index
    })
    return loading
  }
  function escHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function render(q) {
    var terms = norm(q).split(/\s+/).filter(Boolean)
    list.innerHTML = ''; empty.hidden = true
    if (!terms.length || !index) return
    var hits = []
    index.forEach(function (it) {
      var score = 0
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], s = 0
        if (it.t.indexOf(t) >= 0) s += 6
        if (it.h.indexOf(t) >= 0) s += 4
        if (it.x.indexOf(t) >= 0) s += 1
        if (!s) return
        score += s
      }
      if (!it.e.h) score += 2
      hits.push({ s: score, e: it.e })
    })
    hits.sort(function (a, b) { return b.s - a.s })
    hits = hits.slice(0, 12)
    if (!hits.length) { empty.hidden = false; return }
    active = 0
    list.innerHTML = hits.map(function (h, i) {
      var e = h.e, x = e.x.length > 140 ? e.x.slice(0, 140) + '…' : e.x
      return '<li role="option" aria-selected="' + (i === 0) + '"><a href="' + escHtml(base + e.p) + '"><span class="docs-search-sec">' + escHtml(e.s) + '</span><strong>' + escHtml(e.t) + (e.h ? ' › ' + escHtml(e.h) : '') + '</strong><small>' + escHtml(x) + '</small></a></li>'
    }).join('')
  }
  function move(d) {
    var items = $$('li', list); if (!items.length) return
    active = (active + d + items.length) % items.length
    items.forEach(function (li, i) { li.setAttribute('aria-selected', String(i === active)) })
    items[active].scrollIntoView({ block: 'nearest' })
  }
  function open() {
    lastFocus = document.activeElement; box.hidden = false; document.body.classList.add('docs-search-active'); input.focus(); input.select()
    var p = load(); if (p) p.then(function () { render(input.value) })
  }
  function close() { box.hidden = true; document.body.classList.remove('docs-search-active'); if (lastFocus && lastFocus.focus) lastFocus.focus() }
  $$('[data-search-open]').forEach(function (b) { b.addEventListener('click', open) })
  $$('[data-search-close]').forEach(function (b) { b.addEventListener('click', close) })
  if (box) box.addEventListener('click', function (e) { if (e.target === box) close() })
  if (input) {
    input.addEventListener('input', function () { render(input.value) })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      else if (e.key === 'Enter') { var a = $('li[aria-selected="true"] a', list); if (a) { e.preventDefault(); location.href = a.getAttribute('href') } }
    })
  }
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')
    if (e.key === 'Escape') { if (box && !box.hidden) close(); else if (document.body.classList.contains('docs-nav-open')) setNav(false) }
    else if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { if (box && box.hidden) { e.preventDefault(); open() } }
  })
})()
