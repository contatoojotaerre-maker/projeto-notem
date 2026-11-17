// Runs before the page paints: device preference by default, manual choice remembered in this browser.
(function () {
  var saved = null
  try { saved = localStorage.getItem('notem-docs-tema') } catch (e) {}
  var light = saved ? saved === 'claro' : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
  if (light) document.documentElement.setAttribute('data-theme', 'light')
})()
