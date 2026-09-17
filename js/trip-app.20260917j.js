const state = { trip: null, options: null, ops: null, map: null, layer: null, selectedDayId: 'all', optionFilter: 'all' };
const CACHE_BUST = '20260917j';

const OPTION_LABELS = {
  'easy-add-on': 'Easy add-on',
  'spare-day': 'Spare day',
  'split-group': 'Split group',
  'skip-with-baby': 'Probably skip with baby'
};

const OPTION_GROUPS = {
  cultural: {
    title: 'Cultural / civic',
    note: 'Non-pilgrimage stops to talk through. None of these replace Friday’s Forum or Sunday Mass.'
  },
  vatican: {
    title: 'Vatican extras',
    note: 'Not fully on the itinerary. The audience and basilica stay the core of Vatican day.'
  }
};

// Kinds that count as a real sequenced stop (sightseeing, pickup, meals at a named place).
// Transit, apartment breakfast, sits, and home-base chores do not get a number of their own.
const STOP_KIND_KEYS = [
  'visit', 'pickup', 'audience', 'mass', 'dinner', 'date', 'meal', 'lunch', 'arrive',
  'gelato', 'coffee', 'snack'
];

function kindClass(kind) {
  const k = (kind || '').toLowerCase();
  const keys = [
    'visit', 'pickup', 'audience', 'mass', 'meal', 'dinner', 'date', 'move',
    'commute', 'walk', 'flight', 'travel', 'taxi', 'rest', 'sit', 'settle',
    'home', 'pack', 'handoff', 'afternoon', 'optional', 'gelato', 'coffee', 'snack', 'seat', 'breakfast'
  ];
  return keys.find((x) => k.includes(x)) || 'other';
}

function isStopKind(kind) {
  const k = (kind || '').toLowerCase();
  return STOP_KIND_KEYS.some((x) => k.includes(x));
}

// Photo cards for major stops only. Commutes, sits, apartment chores stay compact.
const LANDMARK_PHOTO_KINDS = ['visit', 'pickup', 'audience', 'mass', 'arrive'];
const FOOD_PHOTO_KINDS = ['dinner', 'date', 'meal', 'lunch', 'gelato', 'coffee', 'snack'];

function shouldShowPhoto(block, place) {
  if (!place || !place.image) return false;
  const k = (block.kind || '').toLowerCase();
  const role = place.imageRole || 'landmark';
  const keys = role === 'food' ? FOOD_PHOTO_KINDS : LANDMARK_PHOTO_KINDS;
  return keys.some((x) => k.includes(x));
}

async function loadPlacesOverlay() {
  try {
    const res = await fetch(`data/places.json?v=${CACHE_BUST}`);
    if (!res.ok) return;
    const places = await res.json();
    if (!places) return;
    state.trip.places = {
      home: places.home || state.trip.places?.home,
      places: Array.isArray(places.places) ? places.places : state.trip.places?.places
    };
  } catch (err) {
    console.warn('Could not overlay places.json', err);
  }
}

const LABEL_MAX = 56;
const LABEL_SOFT_MAX = 80;

function cleanLabel(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
}

function stripLeadingLabel(text, label) {
  const t = String(text || '').trim();
  const l = String(label || '').trim();
  if (!t || !l) return t;
  if (t.toLowerCase().startsWith(l.toLowerCase())) {
    return t.slice(l.length).replace(/^[\s·,;:.—–-]+/, '').trim();
  }
  const escaped = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paren = new RegExp(`^${escaped}\\s*\\([^)]+\\)\\s*(?:·\\s*)?`, 'i');
  const m = t.match(paren);
  if (m) return t.slice(m[0].length).trim();
  return t;
}

function firstClauseSplit(text) {
  const m = String(text || '').match(/^(.{8,48}?),(\s+)([\s\S]+)$/);
  if (!m) return null;
  return { label: m[1].trim(), description: m[3].trim() };
}

function maybeShortenToPlaceName(label, description, place) {
  if (!place || !place.name) return { label, description };
  const name = place.name;
  if (!label.toLowerCase().startsWith(name.toLowerCase())) {
    return { label, description };
  }
  const rest = label.slice(name.length).trim();
  // Collapse "Pantheon (Santa Maria ad Martyres)", not "Spanish Steps & Trinità".
  if (!rest || /^\(.*\)$/.test(rest)) {
    const extra = rest.replace(/^\(|\)$/g, '').trim();
    let desc = description;
    if (extra) desc = desc ? `(${extra}) · ${desc}` : extra;
    return { label: name, description: desc };
  }
  return { label, description };
}

function placeNameAsLabelKind(kind) {
  const k = (kind || '').toLowerCase();
  if (/lunch|meal|arrive|breakfast|snack|gelato|coffee/.test(k)) return false;
  return /visit|pickup|audience|mass|date|dinner/.test(k);
}

/**
 * Derive a short column-3 label and a longer column-4 description from
 * existing block fields. Prefers structured title/notes when present;
 * otherwise splits `what` on a middot, sentence, or colon. Does not
 * invent times, prices, or bookings.
 */
function splitBlockCopy(block, place) {
  const structuredLabel = (block.label || block.title || block.short || '').trim();
  const structuredNotes = (block.notes || block.detail || block.description || '').trim();
  const what = (block.what || '').trim();

  function finish(label, description) {
    let lab = cleanLabel(label);
    let desc = (description || '').trim();
    const shortened = maybeShortenToPlaceName(lab, desc, place);
    lab = shortened.label;
    desc = shortened.description;
    if (structuredNotes) {
      if (!desc) desc = structuredNotes;
      else if (!desc.includes(structuredNotes)) desc = `${desc} ${structuredNotes}`.trim();
    }
    if (desc && cleanLabel(desc) === lab) desc = '';
    return { label: lab || what, description: desc };
  }

  if (structuredLabel) {
    let desc = structuredNotes;
    if (!desc && what && cleanLabel(what) !== cleanLabel(structuredLabel)) {
      const stripped = stripLeadingLabel(what, structuredLabel);
      desc = stripped && stripped !== what ? stripped : what;
    }
    return finish(structuredLabel, desc);
  }

  const parts = what.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const head = parts[0];
    const tail = parts.slice(1).join(' · ');
    if (head.length <= LABEL_MAX) return finish(head, tail);
    const clause = firstClauseSplit(head);
    if (clause) return finish(clause.label, [clause.description, tail].filter(Boolean).join(' · '));
    if (head.length <= LABEL_SOFT_MAX) return finish(head, tail);
  }

  const sentence = what.match(/^(.+?[.!?])(?:\s+|$)([\s\S]*)$/);
  if (sentence && sentence[2].trim()) {
    const head = sentence[1].trim();
    const tail = sentence[2].trim();
    if (head.length <= LABEL_MAX) return finish(head, tail);
    const clause = firstClauseSplit(head);
    if (clause) return finish(clause.label, [clause.description, tail].filter(Boolean).join(' '));
    if (head.length <= LABEL_SOFT_MAX) return finish(head, tail);
  }

  const colon = what.match(/^([^:]{3,56}):\s+([\s\S]+)$/);
  if (colon) return finish(colon[1], colon[2]);

  if (place && placeNameAsLabelKind(block.kind)) {
    const rest = stripLeadingLabel(what, place.name);
    return finish(place.name, rest || what);
  }

  if (what.length > LABEL_SOFT_MAX) {
    const clause = firstClauseSplit(what);
    if (clause) return finish(clause.label, clause.description);
  }

  return finish(what, '');
}

function placeById(id) {
  if (!id || !state.trip) return null;
  if (id === 'prati') return state.trip.places.home;
  return state.trip.places.places.find((p) => p.id === id) || null;
}

function showFatal(msg) {
  const existing = document.getElementById('fatal-banner');
  if (existing) {
    existing.textContent = msg;
    return;
  }
  const p = document.createElement('p');
  p.id = 'fatal-banner';
  p.setAttribute('role', 'alert');
  p.style.cssText = 'padding:1rem;margin:0;background:#fff1f2;color:#9f1239;font:600 15px/1.4 system-ui,sans-serif';
  p.textContent = msg;
  document.body.insertAdjacentElement('afterbegin', p);
}

function resolveMapContainer() {
  let el =
    document.getElementById('map-canvas') ||
    document.getElementById('leaflet-map') ||
    document.querySelector('[data-map-root]');

  if (el) return el;

  const section =
    document.getElementById('map-section') ||
    document.getElementById('map') ||
    document.querySelector('section.wrap');

  el = document.createElement('div');
  el.id = 'map-canvas';
  el.setAttribute('aria-label', 'Rome trip map');
  el.setAttribute('data-map-root', '1');
  el.style.minHeight = '420px';
  el.style.width = '100%';
  el.style.borderRadius = '14px';

  if (section) {
    const caption = document.getElementById('map-caption');
    if (caption && caption.parentNode === section) section.insertBefore(el, caption);
    else section.appendChild(el);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

async function load() {
  const res = await fetch(`data/trip.json?v=${CACHE_BUST}`);
  if (!res.ok) throw new Error(`Could not fetch trip.json (${res.status})`);
  state.trip = await res.json();
  await loadPlacesOverlay();

  const heading = document.querySelector('header.top h1');
  if (heading && state.trip.title) heading.textContent = state.trip.title;
  if (state.trip.title) document.title = state.trip.title;

  const lede = document.getElementById('lede');
  if (lede) lede.textContent = `${state.trip.dates} · ${state.trip.party}`;

  renderConfirmed();
  renderOpen();
  renderEatLikeRomans();
  renderTabs();
  renderDays();
  await loadOps();
  await loadOptions();

  if (typeof L === 'undefined') {
    const caption = document.getElementById('map-caption');
    if (caption) caption.textContent = 'Map library failed to load. Hard-refresh the page (Cmd-Shift-R).';
    showFatal('Map library failed to load. Hard-refresh the page (Cmd-Shift-R).');
    return;
  }

  try {
    initMap();
    selectDay('all');
  } catch (err) {
    console.error(err);
    showFatal(`Map failed to start: ${err && err.message ? err.message : err}`);
  }
}

async function loadOptions() {
  const root = document.getElementById('options-grid');
  try {
    const res = await fetch(`data/options.json?v=${CACHE_BUST}`);
    if (!res.ok) throw new Error(`Could not fetch options.json (${res.status})`);
    state.options = await res.json();
  } catch (err) {
    console.error(err);
    if (root) {
      root.innerHTML = '<p class="option-empty">Talk-through options could not load. Hard-refresh the page (Cmd-Shift-R).</p>';
    }
    return;
  }

  const kicker = document.getElementById('options-kicker');
  const title = document.getElementById('options-title');
  const intro = document.getElementById('options-intro');
  if (kicker && state.options.kicker) kicker.textContent = state.options.kicker;
  if (title && state.options.title) title.textContent = state.options.title;
  if (intro && state.options.intro) intro.textContent = state.options.intro;

  renderOptionFilters();
  renderOptions();
}

async function loadOps() {
  const opsRoot = document.getElementById('ops-grid');
  const annivRoot = document.getElementById('anniv-root');
  try {
    const res = await fetch(`data/ops.json?v=${CACHE_BUST}`);
    if (!res.ok) throw new Error(`Could not fetch ops.json (${res.status})`);
    state.ops = await res.json();
  } catch (err) {
    console.error(err);
    const fail = '<p class="option-empty">Trip ops could not load. Hard-refresh the page (Cmd-Shift-R).</p>';
    if (opsRoot) opsRoot.innerHTML = fail;
    if (annivRoot) annivRoot.innerHTML = fail;
    return;
  }
  renderTripOps();
  renderAnniversary();
}

function renderOpsItems(items) {
  return `<ul class="ops-list">${(items || []).map((item) => {
    if (typeof item === 'string') {
      return `<li>${escapeHtml(item)}</li>`;
    }
    const label = item.label ? `<strong>${escapeHtml(item.label)}</strong> · ` : '';
    let jump = '';
    if (item.href) {
      const external = /^(https?:|tel:|mailto:)/i.test(item.href);
      const href = external || item.href.startsWith('#') ? item.href : `#${item.href}`;
      const extra = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
      jump = ` <a href="${escapeHtml(href)}"${extra}>${escapeHtml(item.hrefLabel || 'See details')}</a>`;
    }
    return `<li>${label}${escapeHtml(item.text || '')}${jump}</li>`;
  }).join('')}</ul>`;
}

function renderTripOps() {
  const ops = state.ops && state.ops.tripOps;
  const root = document.getElementById('ops-grid');
  if (!ops || !root) return;

  const kicker = document.getElementById('ops-kicker');
  const title = document.getElementById('ops-title');
  const intro = document.getElementById('ops-intro');
  if (kicker && ops.kicker) kicker.textContent = ops.kicker;
  if (title && ops.title) title.textContent = ops.title;
  if (intro && ops.intro) intro.textContent = ops.intro;

  root.innerHTML = (ops.cards || []).map((card) => `
    <article class="ops-card" id="ops-${escapeHtml(card.id)}">
      <h3>${escapeHtml(card.title)}</h3>
      ${renderOpsItems(card.items)}
    </article>
  `).join('');
}

function restaurantLinks(rest) {
  const links = [...(rest.links || [])];
  if (rest.phone) {
    links.push({ href: `tel:${rest.phone.replace(/\s+/g, '')}`, label: rest.phone });
  }
  if (rest.email) {
    links.push({ href: `mailto:${rest.email}`, label: rest.email });
  }
  if (!links.length) return '';
  return `<div class="ops-actions">${links.map((l) => {
    const external = /^https?:/i.test(l.href);
    const extra = external ? ' target="_blank" rel="noopener"' : '';
    return `<a class="place-link" href="${escapeHtml(l.href)}"${extra}>${escapeHtml(l.label)}</a>`;
  }).join('')}</div>`;
}

function renderRestaurantCard(rest) {
  const tierClass = rest.tier === 'Primary' ? 'primary' : '';
  const rows = [
    rest.address,
    rest.blurb,
    rest.hours,
    rest.thursday,
    rest.price,
    rest.booking,
    rest.prefer,
    rest.taxi
  ].filter(Boolean);
  const cancel = rest.cancel
    ? `<p class="ops-callout alert">${escapeHtml(rest.cancel)}</p>`
    : '';
  return `<article class="ops-card" id="ops-${escapeHtml(rest.id)}">
    <div class="ops-badge-row">
      <span class="ops-badge ${tierClass}">${escapeHtml(rest.tier)}</span>
      <span class="ops-badge draft">Draft · nothing reserved</span>
    </div>
    <h3>${escapeHtml(rest.name)}</h3>
    <p class="ops-lead">${escapeHtml(rest.area || '')}</p>
    ${rows.map((line) => `<p class="ops-meta">${escapeHtml(line)}</p>`).join('')}
    ${cancel}
    ${restaurantLinks(rest)}
  </article>`;
}

function renderAnniversary() {
  const a = state.ops && state.ops.anniversary;
  const root = document.getElementById('anniv-root');
  if (!a || !root) return;

  const kicker = document.getElementById('anniv-kicker');
  const title = document.getElementById('anniv-title');
  const intro = document.getElementById('anniv-intro');
  if (kicker && a.kicker) kicker.textContent = a.kicker;
  if (title && a.title) title.textContent = a.title;
  if (intro && a.intro) intro.textContent = a.intro;

  const ctx = a.context || {};
  const dinner = a.dinner || {};
  const kids = a.kidsEvening || {};
  const framing = a.dayFraming || {};
  const dayJump = a.dayLink
    ? `<a class="ops-jump" href="#${escapeHtml(a.dayLink.href)}">${escapeHtml(a.dayLink.label)}</a>`
    : '';

  const contextCard = `<article class="ops-card">
    <div class="ops-badge-row">
      <span class="ops-badge draft">${escapeHtml(ctx.badge || 'Draft')}</span>
    </div>
    <h3>${escapeHtml(ctx.title || 'Context')}</h3>
    ${[ctx.party, ctx.plan, ctx.stay, ctx.status].filter(Boolean).map((line) =>
      `<p class="ops-meta">${escapeHtml(line)}</p>`
    ).join('')}
  </article>`;

  const dinnerHead = `<article class="ops-card">
    <h3>${escapeHtml(dinner.title || 'Dinner shortlist')}</h3>
    <p class="ops-lead">${escapeHtml(dinner.subtitle || '')}</p>
    ${dinner.bookingNote ? `<p class="ops-callout">${escapeHtml(dinner.bookingNote)}</p>` : ''}
  </article>`;

  const restaurants = `<div class="ops-grid-2">${(dinner.restaurants || []).map(renderRestaurantCard).join('')}</div>`;

  const kidsCard = `<article class="ops-card">
    <h3>${escapeHtml(kids.title || "Kids’ evening plan")}</h3>
    <p class="ops-lead">${escapeHtml(kids.subtitle || '')}</p>
    ${renderOpsItems(kids.items)}
  </article>`;

  const framingCard = `<article class="ops-card">
    <h3>${escapeHtml(framing.title || 'Day framing')}</h3>
    <p class="ops-meta">${escapeHtml(framing.text || '')}${dayJump ? ` · ${dayJump}` : ''}</p>
  </article>`;

  root.innerHTML = [contextCard, dinnerHead, restaurants, kidsCard, framingCard].join('');
}

function renderOptionFilters() {
  const tabs = document.getElementById('options-filters');
  if (!tabs || !state.options) return;
  const filters = state.options.filters || [{ id: 'all', label: 'All' }];
  tabs.innerHTML = '';
  filters.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'day-tab' + (state.optionFilter === f.id ? ' active' : '');
    b.type = 'button';
    b.dataset.filter = f.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', state.optionFilter === f.id ? 'true' : 'false');
    b.innerHTML = `<strong>${escapeHtml(f.label)}</strong>`;
    b.addEventListener('click', () => {
      state.optionFilter = f.id;
      renderOptionFilters();
      renderOptions();
    });
    tabs.appendChild(b);
  });
}

function optionMatchesFilter(item) {
  if (state.optionFilter === 'all') return true;
  return (item.labels || []).includes(state.optionFilter);
}

function renderOptions() {
  const root = document.getElementById('options-grid');
  if (!root || !state.options) return;
  const items = (state.options.items || []).filter(optionMatchesFilter);
  if (!items.length) {
    root.innerHTML = '<p class="option-empty">Nothing in this filter — try All.</p>';
    return;
  }

  const showGroups = state.optionFilter === 'all';
  let lastGroup = null;
  const chunks = [];
  items.forEach((item) => {
    if (showGroups && item.group && item.group !== lastGroup) {
      lastGroup = item.group;
      const g = OPTION_GROUPS[item.group];
      if (g) {
        chunks.push(`<div class="options-group">
          <h3>${escapeHtml(g.title)}</h3>
          <p>${escapeHtml(g.note)}</p>
        </div>`);
      }
    }
    const featured = item.featured && state.optionFilter === 'all';
    const badges = (item.labels || []).map((id) => {
      const label = OPTION_LABELS[id] || id;
      return `<span class="option-badge ${escapeHtml(id)}">${escapeHtml(label)}</span>`;
    }).join('');
    const callout = item.callout
      ? `<div class="option-callout">${escapeHtml(item.callout)}</div>`
      : '';
    const alt = item.imageAlt || item.name;
    const src = item.image
      ? `${escapeHtml(item.image)}?v=${CACHE_BUST}`
      : '';
    const photo = src
      ? `<img class="option-photo" src="${src}" alt="${escapeHtml(alt)}" loading="lazy">`
      : `<div class="option-photo-fallback">No freely licensed photo on file yet — placeholder.</div>`;
    const jump = item.jumpTo
      ? `<a href="#${escapeHtml(item.jumpTo)}">${escapeHtml(item.pairsWith || 'See that day')}</a>`
      : escapeHtml(item.pairsWith || '');
    const pair = item.pairsWith
      ? `<p class="option-pair"><strong>When</strong> · ${jump}</p>`
      : '';
    const credit = item.imageCredit
      ? `<p class="option-credit">${escapeHtml(item.imageCredit)}</p>`
      : '';
    chunks.push(`<article class="option-card${featured ? ' featured' : ''}" id="option-${escapeHtml(item.id)}" data-labels="${escapeHtml((item.labels || []).join(' '))}">
      <div class="option-photo-wrap">
        ${photo}
        <div class="option-badges">${badges}</div>
        ${callout}
      </div>
      <div class="option-body">
        <h3>${escapeHtml(item.name)}</h3>
        <p class="option-blurb">${escapeHtml(item.blurb)}</p>
        <p class="option-why"><strong>Why it’s optional</strong> · ${escapeHtml(item.whyOptional)}</p>
        ${pair}
        ${credit}
      </div>
    </article>`);
  });
  root.innerHTML = chunks.join('');

  root.querySelectorAll('img.option-photo').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'option-photo-fallback';
      fallback.textContent = 'No freely licensed photo on file yet — placeholder.';
      img.replaceWith(fallback);
    });
  });
}

function renderConfirmed() {
  const a = state.trip.audience;
  const f = state.trip.flights;
  const root = document.getElementById('confirmed-list');
  if (!root) return;
  root.innerHTML = `
    <li><strong>Flights</strong> · ref ${f.ref}<br>${f.out}<br>${f.ret}</li>
    <li><strong>Papal General Audience</strong> · ${a.when}<br>
      Reservation <code>${a.reservation}</code> · ${a.tickets} tickets<br>
      Pickup: ${a.pickup}<br>${a.pickupWindows}</li>
    <li><strong>Home base plan</strong> · one Prati Airbnb near Ottaviano / Lepanto (not booked yet)</li>
  `;
}

function renderOpen() {
  const root = document.getElementById('open-list');
  if (!root) return;
  root.innerHTML = state.trip.open.map((x) => `<li>${x}</li>`).join('');
}

function renderEatLikeRomans() {
  const eat = state.trip.eatLikeRomans;
  const intro = document.getElementById('eat-intro');
  const root = document.getElementById('eat-list');
  if (!eat) return;
  if (intro) intro.textContent = eat.intro || '';
  if (root) root.innerHTML = (eat.items || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
}

function renderTabs() {
  const tabs = document.getElementById('day-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'day-tab active';
  allBtn.type = 'button';
  allBtn.dataset.day = 'all';
  allBtn.innerHTML = `<strong>All stops</strong><span>Overview</span>`;
  allBtn.addEventListener('click', () => selectDay('all'));
  tabs.appendChild(allBtn);
  state.trip.days.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'day-tab';
    b.type = 'button';
    b.dataset.day = d.id;
    b.innerHTML = `<strong>${d.short}</strong><span>${d.label}</span>`;
    b.addEventListener('click', () => selectDay(d.id));
    tabs.appendChild(b);
  });
}

function initMap() {
  if (state.map) return;

  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `vendor/leaflet/images/marker-icon-2x.png?v=${CACHE_BUST}`,
    iconUrl: `vendor/leaflet/images/marker-icon.png?v=${CACHE_BUST}`,
    shadowUrl: `vendor/leaflet/images/marker-shadow.png?v=${CACHE_BUST}`
  });

  const container = resolveMapContainer();
  if (!(container instanceof HTMLElement)) {
    throw new Error('Map container element is missing from the page.');
  }

  // Ensure Leaflet can measure the box even if CSS failed to load.
  if (!container.style.minHeight) container.style.minHeight = '420px';
  if (!container.style.width) container.style.width = '100%';

  state.map = L.map(container, { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(state.map);
  state.layer = L.layerGroup().addTo(state.map);
  state.map.setView([41.9, 12.48], 13);
  setTimeout(() => state.map.invalidateSize(), 0);
}

function selectDay(dayId) {
  state.selectedDayId = dayId;
  document.querySelectorAll('.day-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.day === dayId);
  });
  document.querySelectorAll('.day-panel').forEach((el) => {
    el.hidden = dayId !== 'all' && el.dataset.day !== dayId;
  });
  if (state.map) renderMap(dayId);
}

function pinIdsForDay(dayId) {
  if (dayId === 'all') {
    const ids = [];
    const seen = new Set();
    state.trip.days.forEach((d) => {
      (d.mapPlaceIds || []).forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        ids.push(id);
      });
    });
    if (!seen.has('prati')) ids.push('prati');
    return ids;
  }
  const day = state.trip.days.find((d) => d.id === dayId);
  return [...(day?.mapPlaceIds || [])];
}

function placesForDay(dayId) {
  return pinIdsForDay(dayId).map(placeById).filter(Boolean);
}

function daysForView(dayId) {
  return dayId === 'all' ? state.trip.days : state.trip.days.filter((d) => d.id === dayId);
}

/**
 * Visit-order numbers for pins currently on the map.
 *
 * Day view: first appearance of each pinned place in that day's itinerary
 * blocks, preferring visit/pickup/audience/meal kinds over transit or
 * apartment blocks. One number per place per day.
 *
 * Overview ("All stops"): the same rule across the whole week, so a pin's
 * number is the order of its first real visit on the trip. Prati is a home
 * base reference, not a sightseeing stop, so it stays unnumbered.
 */
function sequenceNumbers(dayId) {
  const pinIds = pinIdsForDay(dayId);
  const pinSet = new Set(pinIds);
  const days = daysForView(dayId);
  const order = [];
  const seen = new Set();

  function consider(placeId) {
    if (!placeId || placeId === 'prati') return;
    if (!pinSet.has(placeId) || seen.has(placeId)) return;
    if (!placeById(placeId)) return;
    seen.add(placeId);
    order.push(placeId);
  }

  days.forEach((d) => {
    d.blocks.forEach((b) => {
      if (isStopKind(b.kind)) consider(b.placeId);
    });
  });
  days.forEach((d) => {
    d.blocks.forEach((b) => consider(b.placeId));
  });
  pinIds.forEach((id) => consider(id));

  const numbers = new Map();
  order.forEach((id, i) => numbers.set(id, i + 1));
  return numbers;
}

function markerIcon(place, number) {
  if (place.id === 'prati' && number == null) {
    return L.divIcon({
      className: 'map-pin-wrap',
      html: '<div class="map-pin map-pin-home" title="Home base">H</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });
  }
  const n = number == null ? '•' : String(number);
  const wide = n.length > 1;
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin${wide ? ' map-pin-wide' : ''}">${escapeHtml(n)}</div>`,
    iconSize: wide ? [36, 32] : [32, 32],
    iconAnchor: wide ? [18, 16] : [16, 16],
    popupAnchor: [0, -18]
  });
}

function blocksForPlace(dayId, placeId) {
  const days = daysForView(dayId);
  const out = [];
  days.forEach((d) => {
    d.blocks.forEach((b) => {
      if (b.placeId === placeId) out.push({ day: d.short, ...b });
    });
  });
  return out;
}

function renderMap(dayId) {
  if (!state.map || !state.layer) return;
  state.layer.clearLayers();
  const places = placesForDay(dayId);
  const numbers = sequenceNumbers(dayId);
  const bounds = [];
  places.forEach((p) => {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    const number = numbers.get(p.id);
    const blocks = blocksForPlace(dayId, p.id);
    const timeLine = blocks
      .slice(0, 4)
      .map((b) => `${b.day ? b.day + ' · ' : ''}${b.time} · ${b.kind}`)
      .join('<br>');
    const stopBadge =
      number != null
        ? `<div class="badge stop-badge">Stop ${number}</div>`
        : p.id === 'prati'
          ? '<div class="badge">Home base</div>'
          : '';
    const marker = L.marker([p.lat, p.lng], {
      icon: markerIcon(p, number),
      title: number != null ? `Stop ${number} · ${p.name}` : p.name,
      zIndexOffset: number != null ? 200 - number : 0
    });
    marker.placeId = p.id;
    marker.bindPopup(`
      <div class="popup">
        ${stopBadge}
        ${p.id === 'bronze-door' ? '<div class="badge">Ticket pickup</div>' : ''}
        ${blocks.some((b) => /audience/i.test(b.kind)) ? '<div class="badge">Confirmed audience</div>' : ''}
        <h4>${escapeHtml(p.name)}</h4>
        <p>${escapeHtml(p.summary || '')}</p>
        ${timeLine ? `<p><strong>When</strong><br>${timeLine}</p>` : ''}
        ${p.url ? `<p><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">More info</a></p>` : ''}
      </div>
    `);
    marker.addTo(state.layer);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  else state.map.setView([41.9, 12.48], 12);
  const caption = document.getElementById('map-caption');
  if (caption) {
    const numbered = [...numbers.values()].length;
    if (dayId === 'all') {
      caption.textContent = `${places.length} places · numbered 1–${numbered} by first visit this week · Prati home base unmarked`;
    } else {
      const day = state.trip.days.find((d) => d.id === dayId);
      if (!day) caption.textContent = '';
      else if (!places.length) caption.textContent = `${day.title} · no map pins this day`;
      else {
        const pinWord = places.length === 1 ? 'pin' : 'pins';
        caption.textContent = `${day.title} · ${places.length} map ${pinWord} numbered in visit order`;
      }
    }
  }
  setTimeout(() => state.map.invalidateSize(), 50);
}

function renderBlockRow(d, b, numbers) {
  const place = placeById(b.placeId);
  const { label, description } = splitBlockCopy(b, place);
  const urls = [];
  (b.links || []).forEach((u) => {
    if (u && !urls.includes(u)) urls.push(u);
  });
  // Fall back to the mapped place URL only when the block has no links of its own.
  if (!urls.length && place?.url) urls.push(place.url);
  const actions = urls.map(
    (url) =>
      `<a class="place-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(linkLabel(url))}</a>`
  );
  if (b.jumpTo) {
    actions.push(
      `<a class="place-link" href="#${escapeHtml(b.jumpTo)}">${escapeHtml(b.jumpLabel || 'See details')}</a>`
    );
  }
  if (place) {
    actions.push(
      `<button class="pin-link" data-focus="${escapeHtml(place.id)}" type="button">Show on map</button>`
    );
  }
  const actionHtml = actions.length
    ? `<div class="block-actions">${actions.join('')}</div>`
    : '';
  const detailHtml = description
    ? `<p class="detail-text">${escapeHtml(description)}</p>`
    : '';
  const timeHtml = `<div class="time">${escapeHtml(b.time)}</div>`;
  const kindHtml = `<div class="kind-cell"><span class="kind ${kindClass(b.kind)}">${escapeHtml(b.kind)}</span></div>`;
  const labelHtml = `<div class="label">${escapeHtml(label)}</div>`;
  const detailBlock = `<div class="detail">${detailHtml}${actionHtml}</div>`;

  if (!shouldShowPhoto(b, place)) {
    return `<li class="block">
        ${timeHtml}
        ${kindHtml}
        ${labelHtml}
        ${detailBlock}
      </li>`;
  }

  const src = `${escapeHtml(place.image)}?v=${CACHE_BUST}`;
  const alt = place.imageAlt || place.name || label;
  const credit = place.imageCredit
    ? `<p class="option-credit">${escapeHtml(place.imageCredit)}</p>`
    : '';
  const stopNum = numbers.get(place.id);
  const badge = stopNum != null
    ? `<div class="option-badges"><span class="option-badge stop-num">Stop ${stopNum}</span></div>`
    : '';

  return `<li class="block stop-card">
      <div class="stop-photo-wrap option-photo-wrap">
        <img class="stop-photo option-photo" src="${src}" alt="${escapeHtml(alt)}" loading="lazy">
        ${badge}
      </div>
      <div class="stop-body">
        <div class="stop-meta">
          ${timeHtml}
          ${kindHtml}
        </div>
        ${labelHtml}
        <div class="detail">${detailHtml}${actionHtml}${credit}</div>
      </div>
    </li>`;
}

function renderDays() {
  const root = document.getElementById('day-panels');
  if (!root) return;
  root.innerHTML = state.trip.days
    .map((d) => {
      const numbers = sequenceNumbers(d.id);
      const rows = d.blocks.map((b) => renderBlockRow(d, b, numbers)).join('');
      const related = d.related
        ? ` <a href="#${escapeHtml(d.related.href)}">${escapeHtml(d.related.label)}</a>`
        : '';
      const note = d.note || d.related
        ? `<p class="day-note">${d.note ? escapeHtml(d.note) : ''}${related}</p>`
        : '';
      return `<article class="day-panel" id="${escapeHtml(d.id)}" data-day="${escapeHtml(d.id)}">
      <h3>${escapeHtml(d.title)}</h3>
      ${note}
      <ul class="timeline">${rows}</ul>
    </article>`;
    })
    .join('');

  root.querySelectorAll('[data-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-focus');
      const dayId = btn.closest('.day-panel').dataset.day;
      selectDay(dayId);
      const mapSection = document.getElementById('map-section') || document.getElementById('map');
      if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth' });
      const p = placeById(id);
      if (!p || !state.map) return;
      setTimeout(() => {
        state.map.setView([p.lat, p.lng], 16);
        state.layer.eachLayer((layer) => {
          if (layer.placeId === id) layer.openPopup();
        });
      }, 250);
    });
  });

  root.querySelectorAll('img.stop-photo').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'option-photo-fallback';
      fallback.textContent = 'No freely licensed photo on file yet — placeholder.';
      img.replaceWith(fallback);
    });
  });
}

function linkLabel(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('despar') || u.includes('giulio+cesare+193') || u.includes('giulio%20cesare%20193')) {
    return 'Despar map';
  }
  if (u.includes('mercato') || u.includes('dell%27unit') || u.includes("dell'unit")) {
    return 'Market map';
  }
  if (/google\.[^/]*\/maps|maps\.app\.goo\.gl|maps\.google/i.test(u)) return 'Maps';
  return 'Official site';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function boot() {
  load().catch((err) => {
    console.error(err);
    showFatal(`Something failed while starting the page: ${err && err.message ? err.message : err}. Try a private window or Cmd-Shift-R.`);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
