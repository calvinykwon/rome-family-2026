(function (global) {
  const CACHE_BUST = '20260917k';
  const FOOTER_TEXT =
    'Draft only · nothing booked except flights and the papal audience tickets · share with the travel group';

  const ANCHOR_FILE = {
    'trip-ops': 'ops.html',
    anniversary: 'ops.html',
    days: 'itinerary.html',
    'map-section': 'itinerary.html',
    map: 'itinerary.html',
    options: 'index.html'
  };

  function pageId() {
    return (document.body && document.body.dataset.page) || 'overview';
  }

  function pageFile(id) {
    const p = id || pageId();
    if (p === 'itinerary') return 'itinerary.html';
    if (p === 'ops') return 'ops.html';
    return 'index.html';
  }

  function fileForAnchor(id) {
    if (!id) return null;
    if (ANCHOR_FILE[id]) return ANCHOR_FILE[id];
    if (/^d\d{2}$/.test(id)) return 'itinerary.html';
    if (id.startsWith('ops-')) return 'ops.html';
    if (id.startsWith('option-')) return 'index.html';
    return null;
  }

  function hrefForAnchor(id) {
    const file = fileForAnchor(id) || pageFile();
    const hash = id ? `#${id}` : '';
    if (file === pageFile()) return hash || file;
    return `${file}${hash}`;
  }

  function redirectLegacyHash() {
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw) return;
    const file = fileForAnchor(raw);
    if (!file || file === pageFile()) return;
    location.replace(`${file}#${raw}`);
  }

  function navLink(href, id, label) {
    const current = pageId();
    const hash = String(location.hash || '').replace(/^#/, '');
    let isCurrent = current === id;
    if (id === 'anniversary') {
      isCurrent = current === 'ops' && hash === 'anniversary';
    } else if (id === 'ops') {
      isCurrent = current === 'ops' && hash !== 'anniversary';
    }
    const cls = isCurrent ? ' class="is-current"' : '';
    const aria = isCurrent ? ' aria-current="page"' : '';
    return `<a href="${href}" data-nav="${id}"${cls}${aria}>${label}</a>`;
  }

  function renderChrome() {
    const headerHost = document.getElementById('site-header');
    if (headerHost) {
      headerHost.outerHTML = `<header class="site-bar" id="site-header">
  <div class="wrap site-bar-inner">
    <a class="site-wordmark" href="index.html">2026 Family Trip: Rome</a>
    <nav class="site-nav" aria-label="Site">
      ${navLink('index.html', 'overview', 'Overview')}
      ${navLink('itinerary.html', 'itinerary', 'Itinerary')}
      ${navLink('ops.html', 'ops', 'Ops')}
      ${navLink('ops.html#anniversary', 'anniversary', 'Anniversary')}
    </nav>
  </div>
</header>`;
    }
    const footerHost = document.getElementById('site-footer');
    if (footerHost) {
      footerHost.outerHTML = `<footer class="wrap foot" id="site-footer">
  <p>${FOOTER_TEXT}</p>
</footer>`;
    }
  }

  function bootChrome() {
    redirectLegacyHash();
    renderChrome();
    window.addEventListener('hashchange', () => {
      redirectLegacyHash();
      renderChrome();
    });
  }

  global.RomeSite = {
    CACHE_BUST,
    pageId,
    pageFile,
    hrefForAnchor,
    fileForAnchor,
    bootChrome
  };

  if (document.getElementById('site-header') || document.readyState !== 'loading') {
    bootChrome();
  } else {
    document.addEventListener('DOMContentLoaded', bootChrome);
  }
})(window);
