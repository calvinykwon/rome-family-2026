const state = { trip: null, map: null, layer: null, selectedDayId: 'all' };

function kindClass(kind) {
  const k = (kind || '').toLowerCase();
  const keys = ['visit','pickup','audience','mass','meal','dinner','date','move','commute','walk','flight','travel','taxi','rest','sit','settle','home','pack','handoff','afternoon','optional','snack','seat','breakfast'];
  return keys.find((x) => k.includes(x)) || 'other';
}

function placeById(id) {
  if (!id || !state.trip) return null;
  if (id === 'prati') return state.trip.places.home;
  return state.trip.places.places.find((p) => p.id === id) || null;
}

async function load() {
  const res = await fetch('data/trip.json');
  state.trip = await res.json();
  document.getElementById('lede').textContent = `${state.trip.dates} · ${state.trip.party}`;
  renderConfirmed();
  renderOpen();
  renderTabs();
  initMap();
  renderDays();
  selectDay('all');
}

function renderConfirmed() {
  const a = state.trip.audience;
  const f = state.trip.flights;
  document.getElementById('confirmed-list').innerHTML = `
    <li><strong>Flights</strong> · ref ${f.ref}<br>${f.out}<br>${f.ret}</li>
    <li><strong>Papal General Audience</strong> · ${a.when}<br>
      Reservation <code>${a.reservation}</code> · ${a.tickets} tickets<br>
      Pickup: ${a.pickup}<br>${a.pickupWindows}</li>
    <li><strong>Home base plan</strong> · one Prati Airbnb near Ottaviano / Lepanto (not booked yet)</li>
  `;
}

function renderOpen() {
  document.getElementById('open-list').innerHTML = state.trip.open.map((x) => `<li>${x}</li>`).join('');
}

function renderTabs() {
  const tabs = document.getElementById('day-tabs');
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
  state.map = L.map('leaflet-map', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(state.map);
  state.layer = L.layerGroup().addTo(state.map);
  state.map.setView([41.9, 12.48], 13);
}

function selectDay(dayId) {
  state.selectedDayId = dayId;
  document.querySelectorAll('.day-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.day === dayId);
  });
  document.querySelectorAll('.day-panel').forEach((el) => {
    el.hidden = dayId !== 'all' && el.dataset.day !== dayId;
  });
  renderMap(dayId);
}

function placesForDay(dayId) {
  if (dayId === 'all') {
    const ids = new Set();
    state.trip.days.forEach((d) => (d.mapPlaceIds || []).forEach((id) => ids.add(id)));
    ids.add('prati');
    return [...ids].map(placeById).filter(Boolean);
  }
  const day = state.trip.days.find((d) => d.id === dayId);
  return (day?.mapPlaceIds || []).map(placeById).filter(Boolean);
}

function blocksForPlace(dayId, placeId) {
  const days = dayId === 'all' ? state.trip.days : state.trip.days.filter((d) => d.id === dayId);
  const out = [];
  days.forEach((d) => {
    d.blocks.forEach((b) => {
      if (b.placeId === placeId) out.push({ day: d.short, ...b });
    });
  });
  return out;
}

function renderMap(dayId) {
  state.layer.clearLayers();
  const places = placesForDay(dayId);
  const bounds = [];
  places.forEach((p) => {
    const blocks = blocksForPlace(dayId, p.id);
    const timeLine = blocks.slice(0, 4).map((b) => `${b.day ? b.day + ' · ' : ''}${b.time} · ${b.kind}`).join('<br>');
    const marker = L.marker([p.lat, p.lng]);
    marker.bindPopup(`
      <div class="popup">
        ${p.id === 'bronze-door' ? '<div class="badge">Ticket pickup</div>' : ''}
        ${blocks.some((b) => /audience/i.test(b.kind)) ? '<div class="badge">Confirmed audience</div>' : ''}
        <h4>${p.name}</h4>
        <p>${p.summary}</p>
        ${timeLine ? `<p><strong>When</strong><br>${timeLine}</p>` : ''}
        <p><a href="${p.url}" target="_blank" rel="noopener">More info</a></p>
      </div>
    `);
    marker.addTo(state.layer);
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  else state.map.setView([41.9, 12.48], 12);
  const caption = document.getElementById('map-caption');
  if (dayId === 'all') caption.textContent = `${places.length} places across the week · Prati home base included`;
  else {
    const day = state.trip.days.find((d) => d.id === dayId);
    caption.textContent = day ? `${day.title} · ${places.length} map pin${places.length === 1 ? '' : 's'}` : '';
  }
  setTimeout(() => state.map.invalidateSize(), 50);
}

function renderDays() {
  const root = document.getElementById('day-panels');
  root.innerHTML = state.trip.days.map((d) => {
    const rows = d.blocks.map((b) => {
      const place = placeById(b.placeId);
      const link = (b.links && b.links[0]) || place?.url;
      let what = escapeHtml(b.what);
      if (link) {
        what = `<a href="${link}" target="_blank" rel="noopener">${what}</a>`;
      }
      const pin = place ? `<button class="pin-link" data-focus="${place.id}" type="button">Show on map</button>` : '';
      return `<li class="block">
        <div class="time">${escapeHtml(b.time)}</div>
        <div><span class="kind ${kindClass(b.kind)}">${escapeHtml(b.kind)}</span></div>
        <div class="what">${what}${pin}</div>
      </li>`;
    }).join('');
    return `<article class="day-panel" id="${d.id}" data-day="${d.id}">
      <h3>${escapeHtml(d.title)}</h3>
      ${d.note ? `<p class="day-note">${escapeHtml(d.note)}</p>` : ''}
      <ul class="timeline">${rows}</ul>
    </article>`;
  }).join('');

  root.querySelectorAll('[data-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-focus');
      const dayId = btn.closest('.day-panel').dataset.day;
      selectDay(dayId);
      document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
      const p = placeById(id);
      if (!p) return;
      setTimeout(() => {
        state.map.setView([p.lat, p.lng], 16);
        state.layer.eachLayer((layer) => {
          if (layer.getLatLng && Math.abs(layer.getLatLng().lat - p.lat) < 0.0001) layer.openPopup();
        });
      }, 250);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

load().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:1rem;color:#a00">Failed to load trip data: ${err}</p>`);
});
