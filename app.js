/* ══════════════════════════════════════════════════════════
   VMS Insurance Monitor — app.js
   Firebase + full application logic.
   Uses Firebase compat SDK (loaded via <script> in index.html).
   Works on file:// (local) AND GitHub Pages (https).
   Relies on helpers.js already having set window globals.
══════════════════════════════════════════════════════════ */

// Firebase compat SDK is loaded as plain <script> tags in index.html.
// window.firebase is available by the time this script runs.

const firebaseConfig = {
  apiKey:     "AIzaSyCmoO3iEpR1R4GzHK2Z21YfCVV9_VRoMJo",
  authDomain: "vehicle-maintenance-syst-4fb2e.firebaseapp.com",
  projectId:  "vehicle-maintenance-syst-4fb2e",
  appId:      "1:513108103014:web:7ade19f5a6e6bb3e7f42a7",
};

(function initApp() {
try {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  // Enable offline persistence on https only (file:// hangs with IndexedDB).
  if (location.protocol !== 'file:') {
    db.enablePersistence({ synchronizeTabs: false }).catch(() => { /* non-fatal */ });
  }

  // ── State ─────────────────────────────────────────────────
  // Must be declared before updateOnline() is called below.
  const S = {
    page: 'dashboard', records: [], editId: null, editMode: 'insurance',
    insFilter: 'All', ltoFilter: 'All',
    insSearch: '', ltoSearch: '',
    insView: 'table', ltoView: 'table',
    bldgRecords: [], bldgSearch: '', bldgView: 'table',
    editModeBldg: false
  };

  const MONTHS = ['All','JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

  // ── Online / Offline ──────────────────────────────────────
  let isOnline = navigator.onLine;
  function updateOnline() {
    isOnline = navigator.onLine;
    const dot    = document.getElementById('sb-status-dot');
    const txt    = document.getElementById('sb-status-text');
    const ban    = document.getElementById('offline-banner');
    const addBtn = document.getElementById('topbar-add-btn');
    const impBtn = document.getElementById('topbar-import-btn');
    if (isOnline) {
      dot.style.background  = 'var(--emerald)';
      dot.style.boxShadow   = '0 0 8px rgba(16,185,129,.6)';
      txt.textContent       = 'Connected';
      ban.classList.remove('show');
      if (addBtn) addBtn.style.display = (S.page === 'dashboard') ? 'none' : '';
      if (impBtn) impBtn.style.display = '';
    } else {
      dot.style.background  = 'var(--amber)';
      dot.style.boxShadow   = '0 0 8px rgba(245,158,11,.6)';
      txt.textContent       = 'Offline';
      ban.classList.add('show');
      if (addBtn) addBtn.style.display = 'none';
      if (impBtn) impBtn.style.display = 'none';
    }
  }
  window.addEventListener('online',  () => { updateOnline(); toast('Back online!', 'success'); });
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // ── Clock ─────────────────────────────────────────────────
  function updateTime() {
    const now = new Date();
    document.getElementById('topbar-time').textContent =
      now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    document.getElementById('sidebar-time').textContent =
      now.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
  }
  setInterval(updateTime, 1000);
  updateTime();

  // ── Navigation ────────────────────────────────────────────
  function switchPage(pg) {
    S.page = pg;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById(`page-${pg}`).classList.add('active');
    document.getElementById(`snav-${pg}`)?.classList.add('active');
    const titles = { dashboard:'Dashboard', insurance:'Insurance Records', lto:'LTO Registration', building:'Building Insurance' };
    document.getElementById('topbar-title').textContent = titles[pg] || pg;
    const addBtn = document.getElementById('topbar-add-btn');
    if (addBtn) addBtn.style.display = (pg === 'dashboard') ? 'none' : '';
    closeSidebar();
    if (pg === 'dashboard')  loadDashboard();
    else if (pg === 'insurance') loadInsurance();
    else if (pg === 'lto')       loadLTO();
    else if (pg === 'building')  loadBuilding();
  }
  window.switchPage    = switchPage;
  window.refreshCurrent = () => switchPage(S.page);

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
  window.toggleSidebar = toggleSidebar;
  window.closeSidebar  = closeSidebar;

  // ── Firestore helpers — vehicle_insurance ─────────────────
  const col = () => db.collection('vehicle_insurance');
  async function addRec(data)       { return await col().add(data); }
  async function updateRec(id,data) { return await col().doc(id).update(data); }
  async function deleteRec(id)      { return await col().doc(id).delete(); }

  // Real-time listener — vehicle_insurance
  let _insUnsub = null;
  function startInsListener() {
    if (_insUnsub) return;
    _insUnsub = col().onSnapshot(snap => {
      S.records = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      updateBadges();
      if (S.page === 'insurance') { loadInsurance(); }
      if (S.page === 'lto')       { loadLTO(); }
      if (S.page === 'dashboard') loadDashboard();
    }, err => console.warn('[Firestore] ins listener:', err));
  }

  // Keep getAll() as a one-shot fallback (used by dashboard first-load before listener fires)
  async function getAll() { return S.records; }

  // ── Firestore helpers — building_insurance (real-time) ────
  const bldgCol = () => db.collection('building_insurance');
  async function addBldgRec(data)       { return await bldgCol().add(data); }
  async function updateBldgRec(id,data) { return await bldgCol().doc(id).update(data); }
  async function deleteBldgRec(id)      { return await bldgCol().doc(id).delete(); }

  // Real-time listener — stays active for the session
  let _bldgUnsub = null;
  function startBldgListener() {
    if (_bldgUnsub) return;
    _bldgUnsub = bldgCol().onSnapshot(snap => {
      S.bldgRecords = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      updateBldgBadge();
      if (S.page === 'building') {
        renderBldgTable(); renderBldgCards();
        document.getElementById('bldg-count').textContent = filteredBldg().length;
      }
      if (S.page === 'dashboard') loadDashboard();
    }, err => console.warn('[Firestore] bldg listener:', err));
  }

  // ── Date helpers ──────────────────────────────────────────
  function normDateStr(s) { return s.replace(/\b([A-Z]{2,})\b/g, w => w.charAt(0) + w.slice(1).toLowerCase()); }
  function safeParse(s)   { const d = new Date(normDateStr(s.trim())); return isNaN(d) ? null : d; }

  function parseInsDate(dateStr) {
    if (!dateStr || dateStr === 'null') return null;
    const s = String(dateStr).trim();
    const toMatch = s.match(/^.+?\s+to\s+(.+)$/i);
    if (toMatch) { const d = safeParse(toMatch[1]); if (d) return d; }
    const dashMatch = s.match(/^.+?\s+[-–]\s+([A-Za-z].+)$/);
    if (dashMatch) { const d = safeParse(dashMatch[1]); if (d) return d; }
    const direct = safeParse(s); if (direct) return direct;
    const rm = s.match(/([A-Za-z]+)\s+\d+[-–]\s*(\d+),?\s*(\d{4})/);
    if (rm) { const d = safeParse(`${rm[1]} ${rm[2]}, ${rm[3]}`); if (d) return d; }
    const parts = s.replace(/[,\/]/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length >= 3) { const d = safeParse(parts.join(' ')); if (d) return d; }
    return null;
  }

  function toInputDate(d) {
    if (!d || isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function splitLegacyInsDate(str) {
    if (!str) return { from:'', to:'' };
    const s = String(str).trim();
    let pts = s.split(/\s+to\s+/i);
    if (pts.length < 2) pts = s.split(/\s+[-–]\s+/);
    if (pts.length === 2) {
      const df = safeParse(pts[0]), dt = safeParse(pts[1]);
      return { from: df ? toInputDate(df) : '', to: dt ? toInputDate(dt) : '' };
    }
    return { from:'', to:'' };
  }

  function getInsExpiry(i) { return i.insurance_date_to || i.insurance_date || null; }

  function insDateRangeDisplay(i) {
    if (i.insurance_date_from || i.insurance_date_to) {
      const from = i.insurance_date_from ? fmtDate(i.insurance_date_from) : '—';
      const to   = i.insurance_date_to   ? fmtDate(i.insurance_date_to)   : '—';
      return `${from} → ${to}`;
    }
    return i.insurance_date || i.insurance_month || '';
  }

  function insStatus(dateStr, warnDays = 14) {
    const d = parseInsDate(dateStr);
    if (!d) return { type:'unknown', days:null };
    const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
    const diff  = Math.round((d - today) / 86400000);
    if (diff < 0)        return { type:'expired', days: Math.abs(diff) };
    if (diff <= warnDays) return { type:'warning', days: diff };
    return { type:'ok', days: diff };
  }

  function endDateDisplay(dateStr) {
    if (!dateStr || dateStr === 'null') return null;
    const d = parseInsDate(dateStr);
    if (!d) return null;
    return d.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
  }

  // ── Status badge HTML ─────────────────────────────────────
  function statusBadge(type, days) {
    const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const svgX     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const svgWarn  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    if (type === 'expired') return `<span class="badge badge-red">${svgX} Expired ${days}d ago</span>`;
    if (type === 'warning') return `<span class="badge badge-amber">${svgWarn} Due in ${days === 0 ? 'Today' : days + 'd'}</span>`;
    if (type === 'ok')      return `<span class="badge badge-green">${svgCheck} Active — ${days}d left</span>`;
    return `<span class="badge badge-muted">Unknown</span>`;
  }

  // ── Alert row helper ──────────────────────────────────────
  function alertRow(i, statusObj, metaStr, onclick) {
    const s = statusObj;
    const colorCls  = s.type === 'expired' ? 'red' : s.type === 'warning' ? 'amber' : 'green';
    const daysLabel = s.type === 'expired' ? `Expired ${s.days}d ago` : s.days === 0 ? 'Due Today' : `Due in ${s.days}d`;
    return `<div class="alert-row ${colorCls}" onclick="${onclick}">
      <div class="alert-dot ${colorCls}"></div>
      <div class="alert-info">
        <div class="alert-name">${i.vehicle_name||'-'} <span style="font-family:var(--mono);font-size:9px;opacity:.6;font-weight:400">${i.plate_number||''}</span></div>
        <div class="alert-meta">${metaStr}</div>
      </div>
      <div class="alert-days ${colorCls}">${daysLabel}</div>
    </div>`;
  }

  // ════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════
  async function loadDashboard() {
    startInsListener();
    startBldgListener();
    const el = document.getElementById('dashboard-inner');
    el.innerHTML = `<div class="loading-state"><div class="spinner"></div><span style="font-size:12px;color:var(--text3)">Loading data…</span></div>`;
    updateBadges();

    const today    = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const insW      = S.records.map(i => ({ ...i, _is: insStatus(getInsExpiry(i), 14) }));
    const insExp    = insW.filter(i => i._is.type === 'expired').sort((a,b) => b._is.days - a._is.days);
    const insWarn   = insW.filter(i => i._is.type === 'warning').sort((a,b) => a._is.days - b._is.days);
    const insOk     = insW.filter(i => i._is.type === 'ok');
    const insUpcoming = insOk.slice().sort((a,b) => a._is.days - b._is.days).slice(0,5);

    const ltoW      = S.records.filter(i => i.registration_date || i.registration_month).map(i => ({ ...i, _ls: insStatus(i.registration_date, 7) }));
    const ltoExp    = ltoW.filter(i => i._ls.type === 'expired').sort((a,b) => b._ls.days - a._ls.days);
    const ltoWarn   = ltoW.filter(i => i._ls.type === 'warning').sort((a,b) => a._ls.days - b._ls.days);
    const ltoOk     = ltoW.filter(i => i._ls.type === 'ok');
    const ltoUpcoming = ltoOk.slice().sort((a,b) => a._ls.days - b._ls.days).slice(0,5);

    const bldgW     = S.bldgRecords.map(i => ({ ...i, _bs: insStatus(i.coverage_to, 7) }));
    const bldgExp   = bldgW.filter(i => i._bs.type === 'expired').sort((a,b) => b._bs.days - a._bs.days);
    const bldgWarn  = bldgW.filter(i => i._bs.type === 'warning').sort((a,b) => a._bs.days - b._bs.days);
    const bldgOk    = bldgW.filter(i => i._bs.type === 'ok');
    const bldgUpcoming = bldgOk.slice().sort((a,b) => a._bs.days - b._bs.days).slice(0,5);

    el.innerHTML = `
      <div class="dash-date-strip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        ${todayStr}
      </div>

      <div class="dash-grid">
        <!-- INSURANCE COL -->
        <div class="dash-col">
          <div class="dash-col-head">
            <div class="dash-col-icon ins">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div class="dash-col-head-text">
              <div class="dash-col-title">Insurance Status</div>
              <div class="dash-col-sub">GSIS vehicle insurance</div>
            </div>
            <button class="dash-col-btn" onclick="switchPage('insurance')">View all →</button>
          </div>
          <div class="dash-col-body">
            <div class="dash-stats-grid" id="ins-stats-row">
              <div class="dash-stat-card" id="ins-card-expired" onclick="toggleStatList('ins','expired')">
                <div class="dash-stat-num red">${insExp.length}</div>
                <div class="dash-stat-lbl">Expired</div>
              </div>
              <div class="dash-stat-card" id="ins-card-warning" onclick="toggleStatList('ins','warning')">
                <div class="dash-stat-num amber">${insWarn.length}</div>
                <div class="dash-stat-lbl">Due ≤14d</div>
              </div>
              <div class="dash-stat-card" id="ins-card-ok" onclick="toggleStatList('ins','ok')">
                <div class="dash-stat-num green">${insOk.length}</div>
                <div class="dash-stat-lbl">Active</div>
              </div>
              <div class="stat-listbox" id="ins-listbox" style="grid-column:1/-1"></div>
            </div>
            <div id="ins-attention-slot"></div>
            <div id="ins-upcoming-slot"></div>
          </div>
        </div>

        <!-- LTO COL -->
        <div class="dash-col">
          <div class="dash-col-head">
            <div class="dash-col-icon lto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
            </div>
            <div class="dash-col-head-text">
              <div class="dash-col-title">LTO Registration</div>
              <div class="dash-col-sub">Vehicle registration renewals</div>
            </div>
            <button class="dash-col-btn" onclick="switchPage('lto')">View all →</button>
          </div>
          <div class="dash-col-body">
            <div class="dash-stats-grid" id="lto-stats-row">
              <div class="dash-stat-card" id="lto-card-expired" onclick="toggleStatList('lto','expired')">
                <div class="dash-stat-num red">${ltoExp.length}</div>
                <div class="dash-stat-lbl">Expired</div>
              </div>
              <div class="dash-stat-card" id="lto-card-warning" onclick="toggleStatList('lto','warning')">
                <div class="dash-stat-num amber">${ltoWarn.length}</div>
                <div class="dash-stat-lbl">Due ≤7d</div>
              </div>
              <div class="dash-stat-card" id="lto-card-ok" onclick="toggleStatList('lto','ok')">
                <div class="dash-stat-num green">${ltoOk.length}</div>
                <div class="dash-stat-lbl">Active</div>
              </div>
              <div class="stat-listbox" id="lto-listbox" style="grid-column:1/-1"></div>
            </div>
            <div id="lto-attention-slot"></div>
            <div id="lto-upcoming-slot"></div>
          </div>
        </div>

        <!-- BUILDING COL -->
        <div class="dash-col">
          <div class="dash-col-head">
            <div class="dash-col-icon bldg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div class="dash-col-head-text">
              <div class="dash-col-title">Building Insurance</div>
              <div class="dash-col-sub">GSIS building coverage</div>
            </div>
            <button class="dash-col-btn" onclick="switchPage('building')">View all →</button>
          </div>
          <div class="dash-col-body">
            <div class="dash-stats-grid" id="bldg-stats-row">
              <div class="dash-stat-card" id="bldg-card-expired" onclick="toggleStatList('bldg','expired')">
                <div class="dash-stat-num red">${bldgExp.length}</div>
                <div class="dash-stat-lbl">Expired</div>
              </div>
              <div class="dash-stat-card" id="bldg-card-warning" onclick="toggleStatList('bldg','warning')">
                <div class="dash-stat-num amber">${bldgWarn.length}</div>
                <div class="dash-stat-lbl">Due ≤7d</div>
              </div>
              <div class="dash-stat-card" id="bldg-card-ok" onclick="toggleStatList('bldg','ok')">
                <div class="dash-stat-num green">${bldgOk.length}</div>
                <div class="dash-stat-lbl">Active</div>
              </div>
              <div class="stat-listbox" id="bldg-listbox" style="grid-column:1/-1"></div>
            </div>
            <div id="bldg-attention-slot"></div>
            <div id="bldg-upcoming-slot"></div>
          </div>
        </div>
      </div>`;

    // Build alert sections — Insurance
    let insAttentionHtml = '';
    if (insExp.length) {
      insAttentionHtml += `<div class="alert-section-label red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Expired (${insExp.length})</div>`;
      insAttentionHtml += insExp.map(i => alertRow(i, i._is, `${insDateRangeDisplay(i)} · Expires: ${endDateDisplay(getInsExpiry(i))||'—'}`, `showRecordModal('${i.id}','insurance')`)).join('');
    }
    if (insWarn.length) {
      insAttentionHtml += `<div class="alert-section-label amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>Due Soon (${insWarn.length})</div>`;
      insAttentionHtml += insWarn.map(i => alertRow(i, i._is, `${insDateRangeDisplay(i)} · Expires: ${endDateDisplay(getInsExpiry(i))||'—'}`, `showRecordModal('${i.id}','insurance')`)).join('');
    }
    if (!insExp.length && !insWarn.length) insAttentionHtml = `<div class="dash-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><p>No expired or near-expiry insurance</p></div>`;

    // LTO alerts
    let ltoAttentionHtml = '';
    if (ltoExp.length) {
      ltoAttentionHtml += `<div class="alert-section-label red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Expired (${ltoExp.length})</div>`;
      ltoAttentionHtml += ltoExp.map(i => alertRow(i, i._ls, `Reg. Date: ${fmtDate(i.registration_date)}`, `showRecordModal('${i.id}','lto')`)).join('');
    }
    if (ltoWarn.length) {
      ltoAttentionHtml += `<div class="alert-section-label amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>Due Soon (${ltoWarn.length})</div>`;
      ltoAttentionHtml += ltoWarn.map(i => alertRow(i, i._ls, `Reg. Date: ${fmtDate(i.registration_date)}`, `showRecordModal('${i.id}','lto')`)).join('');
    }
    if (!ltoExp.length && !ltoWarn.length) ltoAttentionHtml = `<div class="dash-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><p>No expired or near-expiry registrations</p></div>`;

    // Building alerts
    let bldgAttentionHtml = '';
    if (bldgExp.length) {
      bldgAttentionHtml += `<div class="alert-section-label red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Expired (${bldgExp.length})</div>`;
      bldgAttentionHtml += bldgExp.map(i => bldgAlertRow(i, i._bs)).join('');
    }
    if (bldgWarn.length) {
      bldgAttentionHtml += `<div class="alert-section-label amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>Due ≤7 days (${bldgWarn.length})</div>`;
      bldgAttentionHtml += bldgWarn.map(i => bldgAlertRow(i, i._bs)).join('');
    }
    if (!bldgExp.length && !bldgWarn.length) bldgAttentionHtml = `<div class="dash-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><p>All building coverage is current</p></div>`;

    const upLbl = `<div class="alert-section-label muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Upcoming Renewals</div>`;
    const insUpHtml  = insUpcoming.length  ? upLbl + insUpcoming.map(i  => alertRow(i, i._is, `${insDateRangeDisplay(i)} · Expires: ${endDateDisplay(getInsExpiry(i))||'—'}`, `showRecordModal('${i.id}','insurance')`)).join('') : '';
    const ltoUpHtml  = ltoUpcoming.length  ? upLbl + ltoUpcoming.map(i  => alertRow(i, i._ls, `Reg. Date: ${fmtDate(i.registration_date)}`, `showRecordModal('${i.id}','lto')`)).join('') : '';
    const bldgUpHtml = bldgUpcoming.length ? upLbl + bldgUpcoming.map(i => bldgAlertRow(i, i._bs)).join('') : '';

    document.getElementById('ins-attention-slot').innerHTML  = insAttentionHtml;
    document.getElementById('ins-upcoming-slot').innerHTML   = insUpHtml;
    document.getElementById('lto-attention-slot').innerHTML  = ltoAttentionHtml;
    document.getElementById('lto-upcoming-slot').innerHTML   = ltoUpHtml;
    document.getElementById('bldg-attention-slot').innerHTML = bldgAttentionHtml;
    document.getElementById('bldg-upcoming-slot').innerHTML  = bldgUpHtml;

    window._dashData = {
      insExp, insWarn, insOk: insOk.slice().sort((a,b) => a._is.days - b._is.days),
      ltoExp, ltoWarn, ltoOk: ltoOk.slice().sort((a,b) => a._ls.days - b._ls.days),
      bldgExp, bldgWarn, bldgOk: bldgOk.slice().sort((a,b) => a._bs.days - b._bs.days)
    };
  }

  // ── Stat listbox toggle ───────────────────────────────────
  function toggleStatList(col, type) {
    const lb   = document.getElementById(`${col}-listbox`);
    const cards = { expired:`${col}-card-expired`, warning:`${col}-card-warning`, ok:`${col}-card-ok` };
    const colorMap = { expired:'active-red', warning:'active-amber', ok:'active-green' };
    const data   = window._dashData || {};
    const isBldg = col === 'bldg', isMode = col === 'ins';
    let lists;
    if (isBldg)      lists = { expired:data.bldgExp||[], warning:data.bldgWarn||[], ok:data.bldgOk||[] };
    else if (isMode) lists = { expired:data.insExp||[],  warning:data.insWarn||[],  ok:data.insOk||[]  };
    else             lists = { expired:data.ltoExp||[],  warning:data.ltoWarn||[],  ok:data.ltoOk||[]  };
    const labels = { expired:'Expired', warning:'Due Soon', ok:'Active' };

    const alreadyOpen = lb.classList.contains('open') && lb.dataset.type === type;
    Object.values(cards).forEach(id => { const el = document.getElementById(id); if(el) el.className = 'dash-stat-card'; });
    lb.classList.remove('open');
    if (alreadyOpen) return;

    const activeCard = document.getElementById(cards[type]);
    if (activeCard) activeCard.classList.add(colorMap[type]);
    lb.dataset.type = type;

    const items = lists[type] || [];
    if (!items.length) { lb.classList.remove('open'); return; }

    const dayColors = { expired:'var(--red)', warning:'var(--amber)', ok:'var(--emerald)' };
    const rows = items.map(i => {
      const s = isBldg ? i._bs : isMode ? i._is : i._ls;
      const daysLabel = s.type === 'expired' ? `Expired ${s.days}d ago` : s.days === 0 ? 'Due Today' : `Due in ${s.days}d`;
      let meta, recMode;
      if (isBldg) {
        meta    = `${fmtDate(i.coverage_from)||'?'} → ${fmtDate(i.coverage_to)||'?'}`;
        recMode = 'building';
      } else if (isMode) {
        meta    = i.insurance_date_from || i.insurance_date_to
          ? `${fmtDate(i.insurance_date_from)||'?'} → ${fmtDate(i.insurance_date_to)||'?'}`
          : (i.insurance_date || i.insurance_month || '');
        recMode = 'insurance';
      } else {
        meta    = `Reg: ${fmtDate(i.registration_date)}`;
        recMode = 'lto';
      }
      const nameStr = isBldg ? (i.building_name||'-') : (i.vehicle_name||'-');
      const subStr  = isBldg ? '' : `<span>${i.plate_number||''}</span>`;
      return `<div class="stat-list-row" onclick="showRecordModal('${i.id}','${recMode}')">
        <div class="stat-list-left">
          <div class="stat-list-name">${nameStr} ${subStr}</div>
          <div class="stat-list-meta">${isBldg ? '' : (i.department||'') + ' · '}${meta}</div>
        </div>
        <div class="stat-list-days" style="color:${dayColors[type]}">${daysLabel}</div>
      </div>`;
    }).join('');

    lb.innerHTML = `<div class="stat-listbox-head">
      <span>${labels[type]} — ${items.length} record${items.length!==1?'s':''}</span>
      <button class="stat-listbox-close" onclick="toggleStatList('${col}','${type}')">✕</button>
    </div>
    <div class="stat-listbox-inner">${rows}</div>`;
    lb.classList.add('open');
  }
  window.toggleStatList = toggleStatList;

  function updateBadges() {
    document.getElementById('badge-insurance').textContent = S.records.length;
    const ltoCount = S.records.filter(i => i.registration_date || i.registration_month).length;
    document.getElementById('badge-lto').textContent = ltoCount;
    updateBldgBadge();
  }
  function updateBldgBadge() {
    const el = document.getElementById('badge-building');
    if (el) el.textContent = S.bldgRecords.length;
  }

  // ════════════════════════════════
  // VIEW TOGGLE
  // ════════════════════════════════
  function setInsView(v) {
    S.insView = v;
    document.getElementById('ins-view-table').classList.toggle('active', v === 'table');
    document.getElementById('ins-view-card').classList.toggle('active',  v === 'card');
    document.getElementById('ins-table-area').style.display = v === 'table' ? 'block' : 'none';
    document.getElementById('ins-cards').style.display      = v === 'card'  ? 'block' : 'none';
    if (v === 'card') renderInsCards(); else renderInsTable();
  }
  window.setInsView = setInsView;

  function setLtoView(v) {
    S.ltoView = v;
    document.getElementById('lto-view-table').classList.toggle('active', v === 'table');
    document.getElementById('lto-view-card').classList.toggle('active',  v === 'card');
    document.getElementById('lto-table-area').style.display = v === 'table' ? 'block' : 'none';
    document.getElementById('lto-cards').style.display      = v === 'card'  ? 'block' : 'none';
    if (v === 'card') renderLTOCards(); else renderLTOTable();
  }
  window.setLtoView = setLtoView;

  function setBldgView(v) {
    S.bldgView = v;
    document.getElementById('bldg-view-table').classList.toggle('active', v === 'table');
    document.getElementById('bldg-view-card').classList.toggle('active',  v === 'card');
    document.getElementById('bldg-table-area').style.display = v === 'table' ? 'block' : 'none';
    document.getElementById('bldg-cards').style.display      = v === 'card'  ? 'block' : 'none';
    if (v === 'card') renderBldgCards(); else renderBldgTable();
  }
  window.setBldgView = setBldgView;

  // ════════════════════════════════
  // INSURANCE PAGE
  // ════════════════════════════════
  async function loadInsurance() {
    startInsListener();
    document.getElementById('ins-table-area').innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    updateBadges();
    document.getElementById('ins-count').textContent = `${S.records.length}`;
    renderInsPills(); renderInsTable(); renderInsCards();
  }

  function renderInsPills() {
    document.getElementById('ins-pills').innerHTML = MONTHS.map(m => `
      <div class="pill ${m===S.insFilter?'active':''}" onclick="setInsFilter('${m}')">${m==='All'?'All':m.slice(0,3)}</div>`).join('');
  }
  window.setInsFilter = m => { S.insFilter = m; renderInsPills(); renderInsTable(); renderInsCards(); };

  function filteredIns() {
    const q = S.insSearch.toLowerCase();
    let list = S.records;
    if (S.insFilter !== 'All') list = list.filter(i => (i.insurance_month||'').toUpperCase() === S.insFilter);
    if (q) list = list.filter(i => [i.vehicle_name,i.plate_number,i.department,i.mv_file_no,i.insurance_month,i.remarks].join(' ').toLowerCase().includes(q));
    return list;
  }

  function filterInsurance() {
    S.insSearch = (document.getElementById('ins-search').value||'').toLowerCase();
    document.getElementById('ins-count').textContent = `${filteredIns().length}`;
    renderInsTable(); renderInsCards();
  }
  window.filterInsurance = filterInsurance;

  function renderInsTable() {
    const list = filteredIns();
    const el   = document.getElementById('ins-table-area');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p>No insurance records found</p></div>`;
      return;
    }
    const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:9px;height:9px"><polyline points="20 6 9 17 4 12"/></svg>`;
    const svgX     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:9px;height:9px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const svgWarn  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:9px;height:9px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th>Vehicle</th><th>Department</th>
        <th>Plate No.</th><th>Insurance Period</th><th>Expiry</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${list.map(i => {
          const s = insStatus(getInsExpiry(i), 14);
          const b = s.type==='expired' ? `<span class="badge badge-red">${svgX} Expired</span>`
                  : s.type==='warning' ? `<span class="badge badge-amber">${svgWarn} Due Soon</span>`
                  : `<span class="badge badge-green">${svgCheck} Active</span>`;
          return `<tr onclick="showRecordModal('${i.id}','insurance')">
            <td class="td-num">${i.item_no||'—'}</td>
            <td class="td-primary">${i.vehicle_name||'—'}</td>
            <td>${i.department?`<span class="badge badge-blue">${i.department}</span>`:'—'}</td>
            <td class="td-mono">${i.plate_number||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${insDateRangeDisplay(i)||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${endDateDisplay(getInsExpiry(i))||'—'}</td>
            <td>${b}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  function renderInsCards() {
    const list     = filteredIns();
    const svgShield = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const svgCal   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    document.getElementById('ins-cards').innerHTML = list.map((i, idx) => {
      const s    = insStatus(getInsExpiry(i), 14);
      const bTxt = s.type==='expired'?'Expired':s.type==='warning'?'Due Soon':'Active';
      const bCls = s.type==='expired'?'badge-red':s.type==='warning'?'badge-amber':'badge-green';
      return `<div class="m-card" style="animation-delay:${Math.min(idx,10)*.03}s" onclick="showRecordModal('${i.id}','insurance')">
        <div class="m-card-top">
          <div class="m-card-name">${i.vehicle_name||'—'}</div>
          <span class="badge badge-muted m-card-plate">${i.plate_number||'No Plate'}</span>
        </div>
        <div class="m-card-row">
          ${i.department?`<span class="badge badge-blue">${i.department}</span>`:''}
          <span class="badge ${bCls}">${bTxt}</span>
        </div>
        <div class="m-card-detail">${svgShield} ${i.insurance_month||'—'}</div>
        <div class="m-card-detail" style="margin-top:2px">${svgCal} ${insDateRangeDisplay(i)||'—'}</div>
      </div>`;
    }).join('');
  }

  // ════════════════════════════════
  // LTO PAGE
  // ════════════════════════════════
  async function loadLTO() {
    startInsListener();
    document.getElementById('lto-table-area').innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    updateBadges();
    const ltoList = S.records.filter(i => i.registration_date || i.registration_month);
    document.getElementById('lto-count').textContent = `${ltoList.length}`;
    renderLTOPills(); renderLTOTable(); renderLTOCards();
  }

  function renderLTOPills() {
    document.getElementById('lto-pills').innerHTML = MONTHS.map(m => `
      <div class="pill ${m===S.ltoFilter?'active':''}" onclick="setLTOFilter('${m}')">${m==='All'?'All':m.slice(0,3)}</div>`).join('');
  }
  window.setLTOFilter = m => { S.ltoFilter = m; renderLTOPills(); renderLTOTable(); renderLTOCards(); };

  function filteredLTO() {
    const q = S.ltoSearch.toLowerCase();
    let list = S.records.filter(i => i.registration_date || i.registration_month);
    if (S.ltoFilter !== 'All') list = list.filter(i => (i.registration_month||'').toUpperCase() === S.ltoFilter);
    if (q) list = list.filter(i => [i.vehicle_name,i.plate_number,i.department,i.mv_file_no,i.registration_month,i.remarks].join(' ').toLowerCase().includes(q));
    return list;
  }

  function filterLTO() {
    S.ltoSearch = (document.getElementById('lto-search').value||'').toLowerCase();
    document.getElementById('lto-count').textContent = `${filteredLTO().length}`;
    renderLTOTable(); renderLTOCards();
  }
  window.filterLTO = filterLTO;

  function renderLTOTable() {
    const list = filteredLTO();
    const el   = document.getElementById('lto-table-area');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><p>No LTO records found</p></div>`;
      return;
    }
    const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:9px;height:9px"><polyline points="20 6 9 17 4 12"/></svg>`;
    const svgX     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:9px;height:9px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const svgWarn  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:9px;height:9px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
    const svgMiss  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:9px;height:9px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th>Vehicle</th><th>Department</th>
        <th>Plate No.</th><th>Reg. Month</th><th>Reg. Date</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${list.map(i => {
          const s = i.registration_date ? insStatus(i.registration_date, 7) : { type:'missing', days:null };
          const b = s.type==='expired' ? `<span class="badge badge-red">${svgX} Expired</span>`
                  : s.type==='warning' ? `<span class="badge badge-amber">${svgWarn} Due Soon</span>`
                  : s.type==='missing' ? `<span class="badge badge-muted">${svgMiss} No Date</span>`
                  : `<span class="badge badge-green">${svgCheck} Active</span>`;
          const dateCell = i.registration_date ? fmtDate(i.registration_date) : `<span style="color:var(--amber);font-size:10px">— missing —</span>`;
          return `<tr onclick="showRecordModal('${i.id}','lto')" style="${s.type==='missing'?'background:rgba(245,158,11,.02)':''}">
            <td class="td-num">${i.item_no||'—'}</td>
            <td class="td-primary">${i.vehicle_name||'—'}</td>
            <td>${i.department?`<span class="badge badge-blue">${i.department}</span>`:'—'}</td>
            <td class="td-mono">${i.plate_number||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${i.registration_month||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${dateCell}</td>
            <td>${b}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  function renderLTOCards() {
    const list   = filteredLTO();
    const svgCal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    document.getElementById('lto-cards').innerHTML = list.map((i, idx) => {
      const s    = i.registration_date ? insStatus(i.registration_date, 7) : { type:'missing', days:null };
      const bTxt = s.type==='expired'?'Expired':s.type==='warning'?'Due Soon':s.type==='missing'?'No Date':'Active';
      const bCls = s.type==='expired'?'badge-red':s.type==='warning'?'badge-amber':s.type==='missing'?'badge-muted':'badge-green';
      return `<div class="m-card" style="animation-delay:${Math.min(idx,10)*.03}s" onclick="showRecordModal('${i.id}','lto')">
        <div class="m-card-top">
          <div class="m-card-name">${i.vehicle_name||'—'}</div>
          <span class="badge badge-muted m-card-plate">${i.plate_number||'No Plate'}</span>
        </div>
        <div class="m-card-row">
          ${i.department?`<span class="badge badge-blue">${i.department}</span>`:''}
          <span class="badge ${bCls}">${bTxt}</span>
        </div>
        <div class="m-card-detail">${svgCal} ${i.registration_date?fmtDate(i.registration_date):'<span style="color:var(--amber)">Date missing — tap to fix</span>'}</div>
      </div>`;
    }).join('');
  }

  // ════════════════════════════════
  // BUILDING INSURANCE PAGE
  // ════════════════════════════════

  function bldgAlertRow(i, statusObj) {
    const s         = statusObj;
    const colorCls  = s.type==='expired'?'red':s.type==='warning'?'amber':'green';
    const daysLabel = s.type==='expired'?`Expired ${s.days}d ago`:s.days===0?'Due Today':`Due in ${s.days}d`;
    const period    = `${fmtDate(i.coverage_from)||'?'} → ${fmtDate(i.coverage_to)||'?'}`;
    return `<div class="alert-row ${colorCls}" onclick="showRecordModal('${i.id}','building')">
      <div class="alert-dot ${colorCls}"></div>
      <div class="alert-info">
        <div class="alert-name">${i.building_name||'-'}</div>
        <div class="alert-meta">${period}</div>
      </div>
      <div class="alert-days ${colorCls}">${daysLabel}</div>
    </div>`;
  }

  function loadBuilding() {
    startBldgListener();
    updateBldgBadge();
    document.getElementById('bldg-count').textContent = filteredBldg().length;
    renderBldgTable();
    renderBldgCards();
  }

  function filteredBldg() {
    const q = S.bldgSearch.toLowerCase();
    let list = S.bldgRecords;
    if (q) list = list.filter(i => [i.building_name,i.coverage_from,i.coverage_to,i.remarks].join(' ').toLowerCase().includes(q));
    return list;
  }

  function filterBuilding() {
    S.bldgSearch = (document.getElementById('bldg-search').value||'').toLowerCase();
    document.getElementById('bldg-count').textContent = filteredBldg().length;
    renderBldgTable(); renderBldgCards();
  }
  window.filterBuilding = filterBuilding;

  function renderBldgTable() {
    const list = filteredBldg();
    const el   = document.getElementById('bldg-table-area');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><p>No building insurance records found. Import an XLSX to get started.</p></div>`;
      return;
    }
    const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:9px;height:9px"><polyline points="20 6 9 17 4 12"/></svg>`;
    const svgX     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:9px;height:9px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const svgWarn  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:9px;height:9px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th>Building Name</th>
        <th>Coverage From</th><th>Coverage To</th>
        <th>Days Left</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${list.map((i, idx) => {
          const s = insStatus(i.coverage_to, 7);
          const b = s.type==='expired' ? `<span class="badge badge-red">${svgX} Expired</span>`
                  : s.type==='warning' ? `<span class="badge badge-amber">${svgWarn} Due Soon</span>`
                  : `<span class="badge badge-green">${svgCheck} Active</span>`;
          const daysStr   = s.days !== null ? (s.type==='expired' ? `-${s.days}d` : `+${s.days}d`) : '—';
          const daysColor = s.type==='expired'?'var(--red)':s.type==='warning'?'var(--amber)':'var(--emerald)';
          return `<tr onclick="showRecordModal('${i.id}','building')">
            <td class="td-num">${idx+1}</td>
            <td class="td-primary">${i.building_name||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${fmtDate(i.coverage_from)||'—'}</td>
            <td style="color:var(--text3);font-size:11.5px">${fmtDate(i.coverage_to)||'—'}</td>
            <td class="td-mono" style="color:${daysColor}">${daysStr}</td>
            <td>${b}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  function renderBldgCards() {
    const list     = filteredBldg();
    const svgHouse = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
    document.getElementById('bldg-cards').innerHTML = list.map((i, idx) => {
      const s    = insStatus(i.coverage_to, 7);
      const bTxt = s.type==='expired'?'Expired':s.type==='warning'?'Due ≤7d':'Active';
      const bCls = s.type==='expired'?'badge-red':s.type==='warning'?'badge-amber':'badge-green';
      return `<div class="m-card" style="animation-delay:${Math.min(idx,10)*.03}s" onclick="showRecordModal('${i.id}','building')">
        <div class="m-card-top">
          <div class="m-card-name">${i.building_name||'—'}</div>
          <span class="badge ${bCls}">${bTxt}</span>
        </div>
        <div class="m-card-detail">${svgHouse} ${fmtDate(i.coverage_from)||'?'} → ${fmtDate(i.coverage_to)||'?'}</div>
        ${i.remarks?`<div class="m-card-detail" style="margin-top:4px;color:var(--text3)">${i.remarks}</div>`:''}
      </div>`;
    }).join('');
  }

  // ════════════════════════════════
  // RECORD DETAIL MODAL
  // ════════════════════════════════
  function showRecordModal(id, mode) {
    let i;
    if (mode === 'building') i = S.bldgRecords.find(x => x.id === id);
    else                     i = S.records.find(x => x.id === id);
    if (!i) return;

    const iconEl = document.getElementById('rec-modal-icon');
    if (mode === 'lto') {
      iconEl.className = 'modal-icon lto';
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`;
    } else if (mode === 'building') {
      iconEl.className = 'modal-icon bldg';
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    } else {
      iconEl.className = 'modal-icon ins';
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    }

    if (mode === 'building') {
      document.getElementById('rec-title').textContent = i.building_name || 'Building Record';
      const st = insStatus(i.coverage_to, 7);
      const sb = statusBadge(st.type, st.days);
      document.getElementById('rec-body').innerHTML = `
        <div class="v-hero">
          <div class="v-hero-icon-wrap bldg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div class="v-hero-right">
            <div class="v-hero-name">${i.building_name||'—'}</div>
            <div class="v-hero-badges">${sb}</div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">Coverage Period</div>
          ${dr('Coverage From', fmtDate(i.coverage_from))}
          ${dr('Coverage To',   fmtDate(i.coverage_to))}
          ${dr('Original Period', i.coverage_raw)}
          ${dr('Remarks', i.remarks)}
        </div>
        <div class="form-actions" style="padding-top:12px;border-top:1px solid var(--border);margin-top:8px">
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteBldg('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
          <button class="btn btn-default btn-sm" onclick="openEditBldgModal('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Record
          </button>
        </div>`;
      openModal('modal-record');
      return;
    }

    document.getElementById('rec-title').textContent = i.vehicle_name || 'Record';

    if (mode === 'insurance') {
      const st = insStatus(getInsExpiry(i), 14);
      const sb = statusBadge(st.type, st.days);
      document.getElementById('rec-body').innerHTML = `
        <div class="v-hero">
          <div class="v-hero-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="v-hero-right">
            <div class="v-hero-name">${i.vehicle_name||'—'}</div>
            <div class="v-hero-badges">
              <span class="badge badge-muted" style="font-family:var(--mono)">${i.plate_number||'No Plate'}</span>
              ${i.department?`<span class="badge badge-blue">${i.department}</span>`:''}
              ${sb}
            </div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Insurance Details
          </div>
          ${dr('Item No.', i.item_no)}
          ${dr('MV File No.', i.mv_file_no, 'mono')}
          ${dr('Insurance Month', i.insurance_month)}
          ${dr('From',         i.insurance_date_from ? fmtDate(i.insurance_date_from) : (i.insurance_date||null))}
          ${dr('Expiry Date',  i.insurance_date_to   ? fmtDate(i.insurance_date_to)   : endDateDisplay(i.insurance_date))}
          ${dr('Remarks', i.remarks)}
        </div>
        <div class="form-actions" style="padding-top:12px;border-top:1px solid var(--border);margin-top:8px">
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
          <button class="btn btn-default btn-sm" onclick="openEditModal('${id}','insurance')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Record
          </button>
        </div>`;
    } else {
      const st = insStatus(i.registration_date, 7);
      const sb = statusBadge(st.type === undefined || !i.registration_date ? 'unknown' : st.type, st.days);
      document.getElementById('rec-body').innerHTML = `
        <div class="v-hero">
          <div class="v-hero-icon-wrap lto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          </div>
          <div class="v-hero-right">
            <div class="v-hero-name">${i.vehicle_name||'—'}</div>
            <div class="v-hero-badges">
              <span class="badge badge-muted" style="font-family:var(--mono)">${i.plate_number||'No Plate'}</span>
              ${i.department?`<span class="badge badge-blue">${i.department}</span>`:''}
              ${sb}
            </div>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            LTO Registration Details
          </div>
          ${dr('Item No.', i.item_no)}
          ${dr('MV File No.', i.mv_file_no, 'mono')}
          ${dr('Registration Month', i.registration_month)}
          ${dr('Registration Date', fmtDate(i.registration_date) || '<span style="color:var(--amber);font-size:11px">Not set — click Edit to add</span>')}
          ${dr('Remarks', i.remarks)}
        </div>
        <div class="form-actions" style="padding-top:12px;border-top:1px solid var(--border);margin-top:8px">
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
          <button class="btn btn-default btn-sm" onclick="openEditModal('${id}','lto')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Record
          </button>
        </div>`;
    }
    openModal('modal-record');
  }
  window.showRecordModal = showRecordModal;

  // ════════════════════════════════
  // ADD / EDIT FORMS
  // ════════════════════════════════
  function openAddModal() {
    S.editId = null;
    if (S.page === 'building') {
      S.editModeBldg = true;
      document.getElementById('form-title').textContent = 'Add Building Insurance';
      document.getElementById('form-body').innerHTML    = bldgForm();
      openModal('modal-form');
      return;
    }
    S.editModeBldg = false;
    const mode = S.page === 'lto' ? 'lto' : 'insurance';
    S.editMode = mode;
    document.getElementById('form-title').textContent = mode==='lto' ? 'Add LTO Registration' : 'Add Insurance Record';
    document.getElementById('form-body').innerHTML    = mode==='lto' ? ltoForm() : iForm();
    openModal('modal-form');
  }
  window.openAddModal = openAddModal;

  function openEditBldgModal(id) {
    S.editId = id; S.editModeBldg = true;
    closeModal('modal-record');
    const i = S.bldgRecords.find(x => x.id === id) || {};
    document.getElementById('form-title').textContent = 'Edit Building Insurance';
    document.getElementById('form-body').innerHTML    = bldgForm(i);
    openModal('modal-form');
  }
  window.openEditBldgModal = openEditBldgModal;

  function bldgForm(i = {}) {
    return `<div class="form-grid" id="rform">
      ${fi('building_name', 'Building Name', i)}
      <div class="form-group form-full">
        <label>Coverage Period (From → To)</label>
        <div class="form-date-row">
          <input class="form-input" type="date" name="coverage_from" value="${ea(i.coverage_from||'')}">
          <div class="form-date-arrow">→</div>
          <input class="form-input" type="date" name="coverage_to" value="${ea(i.coverage_to||'')}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-default" onclick="closeModal('modal-form')">Cancel</button>
        <button class="btn btn-rose" onclick="saveBldgRecord()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Building Record
        </button>
      </div>
    </div>`;
  }

  async function saveBldgRecord() {
    if (!isOnline) { toast('You are offline. Cannot save changes.', 'error'); return; }
    const data = {};
    document.querySelectorAll('#rform [name]').forEach(el => data[el.name] = el.value || null);
    try {
      if (S.editId) {
        await updateBldgRec(S.editId, data);
        toast('Building record updated!', 'success');
      } else {
        await addBldgRec(data);
        toast('Building record added!', 'success');
      }
      S.editId = null; S.editModeBldg = false;
      closeModal('modal-form');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }
  window.saveBldgRecord = saveBldgRecord;

  async function confirmDeleteBldg(id) {
    if (!isOnline) { toast('You are offline. Cannot delete records.', 'error'); return; }
    if (!confirm('Delete this building record? This cannot be undone.')) return;
    try {
      await deleteBldgRec(id);
      toast('Building record deleted.', 'success');
      closeModal('modal-record');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }
  window.confirmDeleteBldg = confirmDeleteBldg;

  function openEditModal(id, mode) {
    S.editId = id; S.editMode = mode;
    closeModal('modal-record');
    const i = S.records.find(x => x.id === id);
    document.getElementById('form-title').textContent = mode==='lto' ? 'Edit LTO Registration' : 'Edit Insurance Record';
    document.getElementById('form-body').innerHTML    = mode==='lto' ? ltoForm(i) : iForm(i);
    openModal('modal-form');
  }
  window.openEditModal = openEditModal;

  function fi(name, label, v = {}, type = 'text') {
    return `<div class="form-group"><label>${label}</label><input class="form-input" type="${type}" name="${name}" value="${ea(v[name]||'')}" placeholder="${label}"></div>`;
  }
  function fta(name, label, v = {}) {
    return `<div class="form-group form-full"><label>${label}</label><textarea class="form-textarea" name="${name}" placeholder="${label}">${eh(v[name]||'')}</textarea></div>`;
  }

  function iForm(i = {}) {
    let fromVal = i.insurance_date_from || '';
    let toVal   = i.insurance_date_to   || '';
    if ((!fromVal || !toVal) && i.insurance_date) {
      const leg = splitLegacyInsDate(i.insurance_date);
      if (!fromVal) fromVal = leg.from;
      if (!toVal)   toVal   = leg.to;
    }
    return `<div class="form-grid" id="rform">
      ${fi('vehicle_name',    'Vehicle Name',    i)}
      ${fi('plate_number',    'Plate Number',    i)}
      ${fi('department',      'Department',      i)}
      ${fi('mv_file_no',      'MV File No.',     i)}
      ${fi('insurance_month', 'Insurance Month', i)}
      <div class="form-group form-full">
        <label>Insurance Period (From → Expiry)</label>
        <div class="form-date-row">
          <input class="form-input" type="date" name="insurance_date_from" value="${ea(fromVal)}">
          <div class="form-date-arrow">→</div>
          <input class="form-input" type="date" name="insurance_date_to" value="${ea(toVal)}">
        </div>
      </div>
      ${fta('remarks', 'Remarks', i)}
      <div class="form-actions">
        <button class="btn btn-default" onclick="closeModal('modal-form')">Cancel</button>
        <button class="btn btn-primary" onclick="saveRecord()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Record
        </button>
      </div>
    </div>`;
  }

  function ltoForm(i = {}) {
    let regDate = i.registration_date || '';
    if (regDate && regDate.includes('T')) regDate = regDate.substring(0, 10);
    if (regDate && regDate.includes(' ')) regDate = regDate.substring(0, 10);
    const iv = { ...i, registration_date: regDate };
    return `<div class="form-grid" id="rform">
      ${fi('vehicle_name',       'Vehicle Name',       iv)}
      ${fi('plate_number',       'Plate Number',       iv)}
      ${fi('department',         'Department',         iv)}
      ${fi('mv_file_no',         'MV File No.',        iv)}
      ${fi('registration_month', 'Registration Month', iv)}
      ${fi('registration_date',  'Registration Date',  iv, 'date')}
      ${fta('remarks', 'Remarks', iv)}
      <div class="form-actions">
        <button class="btn btn-default" onclick="closeModal('modal-form')">Cancel</button>
        <button class="btn btn-primary" onclick="saveRecord()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Record
        </button>
      </div>
    </div>`;
  }

  async function saveRecord() {
    if (!isOnline) { toast('You are offline. Cannot save changes.', 'error'); return; }
    const data = {};
    document.querySelectorAll('#rform [name]').forEach(el => data[el.name] = el.value);
    if (S.editId) {
      const existing = S.records.find(x => x.id === S.editId) || {};
      const clearableFields = ['registration_date','insurance_date_from','insurance_date_to','remarks'];
      Object.keys(data).forEach(k => {
        if (data[k] === '' || data[k] === null) {
          data[k] = clearableFields.includes(k) ? null : (existing[k] ?? null);
        }
      });
    } else {
      Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
    }
    try {
      if (S.editId) {
        await updateRec(S.editId, data);
        const idx = S.records.findIndex(x => x.id === S.editId);
        if (idx >= 0) S.records[idx] = { ...S.records[idx], ...data };
        toast('Record updated successfully!', 'success');
      } else {
        const ref = await addRec(data);
        S.records.push({ id: ref.id, ...data });
        toast('Record added successfully!', 'success');
      }
      closeModal('modal-form');
      refreshCurrent();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }
  window.saveRecord = saveRecord;

  async function confirmDelete(id) {
    if (!isOnline) { toast('You are offline. Cannot delete records.', 'error'); return; }
    if (!confirm('Delete this record? This action cannot be undone.')) return;
    try {
      await deleteRec(id);
      S.records = S.records.filter(x => x.id !== id);
      toast('Record deleted.', 'success');
      closeModal('modal-record');
      refreshCurrent();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }
  window.confirmDelete = confirmDelete;

  // ════════════════════════════════
  // XLSX IMPORTER — GENERIC DATA
  // ════════════════════════════════
  let _importRows    = [];
  let _importColumns = [];

  function openImportModal() { resetImport(); openModal('modal-import'); }
  window.openImportModal = openImportModal;

  function resetImport() {
    _importRows = []; _importColumns = [];
    document.getElementById('import-drop-label').textContent   = 'Click or drop XLSX file here';
    document.getElementById('import-columns-hint').textContent = 'Select a file to import data';
    document.getElementById('import-preview-area').style.display = 'none';
  }
  window.resetImport = resetImport;

  function parsePeriodCoverage(str) {
    if (!str) return { from:'', to:'' };
    const s = String(str).trim();
    const m = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m) {
      const df = new Date(m[1]), dt = new Date(m[2]);
      if (!isNaN(df) && !isNaN(dt)) return { from: toInputDate(df), to: toInputDate(dt) };
    }
    const leg = splitLegacyInsDate(s);
    return { from: leg.from, to: leg.to };
  }

  function handleImportFile(file) {
    if (!file) return;
    document.getElementById('import-drop-label').textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type:'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

        _importColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const hint     = document.getElementById('import-columns-hint');
        if (_importColumns.length > 0) hint.textContent = `Detected columns: ${_importColumns.join(', ')}`;

        _importRows = rows.filter(r => Object.values(r).some(v => v && String(v).trim()));
        if (!_importRows.length) { toast('No valid data rows found', 'error'); return; }
        showImportPreview();
      } catch(err) { toast('Error reading XLSX: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  }
  window.handleImportFile = handleImportFile;

  function showImportPreview() {
    const previewRows = _importRows.slice(0, 10);
    const moreStr     = _importRows.length > 10
      ? `<tr><td colspan="${_importColumns.length+1}" style="text-align:center;color:var(--text3);padding:8px 10px">…and ${_importRows.length-10} more rows</td></tr>` : '';
    const headerCells = _importColumns.map(col => `<th>${col}</th>`).join('');
    const bodyCells   = previewRows.map((r, idx) => {
      const cells = _importColumns.map(col => `<td>${String(r[col]||'').substring(0,50)}</td>`).join('');
      return `<tr><td>${idx+1}</td>${cells}</tr>`;
    }).join('');

    document.getElementById('import-preview').innerHTML = `
      <div class="import-preview-head">
        <span>Preview</span>
        <span style="color:var(--text3)">${_importRows.length} row${_importRows.length!==1?'s':''} detected</span>
      </div>
      <div class="import-preview-scroll">
        <table>
          <thead><tr><th>#</th>${headerCells}</tr></thead>
          <tbody>${bodyCells}${moreStr}</tbody>
        </table>
      </div>`;
    document.getElementById('import-row-count').textContent = `${_importRows.length} record${_importRows.length!==1?'s':''}`;
    document.getElementById('import-preview-area').style.display = 'block';
  }

  async function confirmImport() {
    if (!isOnline) { toast('You are offline. Cannot import.', 'error'); return; }
    if (!_importRows.length) { toast('No data to import.', 'error'); return; }
    const append = document.getElementById('import-append').checked;
    const btn    = document.getElementById('import-confirm-btn');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      if (!append) {
        const snap  = await bldgCol().get();
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      const chunkSize = 490;
      for (let c = 0; c < _importRows.length; c += chunkSize) {
        const chunk = _importRows.slice(c, c + chunkSize);
        const batch = db.batch();
        chunk.forEach(row => {
          const ref  = bldgCol().doc();
          const data = { ...row, imported_at: new Date().toISOString() };
          batch.set(ref, data);
        });
        await batch.commit();
      }
      toast(`Imported ${_importRows.length} records!`, 'success');
      closeModal('modal-import');
      resetImport();
    } catch(err) {
      toast('Import failed: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Import to Firestore';
    }
  }
  window.confirmImport = confirmImport;

  // Drag-and-drop support
  document.addEventListener('DOMContentLoaded', () => {
    const dz = document.getElementById('import-drop-zone');
    if (dz) {
      dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f) handleImportFile(f);
      });
    }
  });

  // Start real-time listeners and initial page
  startInsListener();
  startBldgListener();
  loadDashboard();

} catch(e) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#060D1A;color:#EF4444;font-family:sans-serif;text-align:center;padding:20px;">
    <div>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;opacity:.7"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Firebase Connection Failed</div>
      <div style="font-size:12px;color:#8FA5BF">Check credentials in app.js.<br>${e.message}</div>
    </div>
  </div>`;
}
})();
