/* ══════════════════════════════════════════════════════════
   VMS Insurance Monitor — helpers.js
   Non-module shared utilities: modals, formatting, toast.
   Must load BEFORE app.js (which is type="module"/deferred).
══════════════════════════════════════════════════════════ */

// ── Modal helpers ──────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeOverlay(e, id) { if (e.target.id === id) closeModal(id); }
window.openModal   = openModal;
window.closeModal  = closeModal;
window.closeOverlay = closeOverlay;

// ── Date formatter ─────────────────────────────────────────
function fmtDate(d) {
  if (!d || d === 'null') return '';
  const s = String(d);
  if (s.includes('00:00:00') || s.includes('T')) {
    const dt = new Date(s);
    if (isNaN(dt)) return s.substring(0, 10);
    return dt.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
  }
  return s.substring(0, 10);
}
window.fmtDate = fmtDate;

// ── Detail row builder ─────────────────────────────────────
function dr(label, val, cls = '') {
  if (!val || val === 'null' || val === 'undefined' || String(val).trim() === '') return '';
  return `<div class="detail-row">
    <span class="detail-label">${label}</span>
    <span class="detail-value${cls ? ' detail-' + cls : ''}">${val}</span>
  </div>`;
}
window.dr = dr;

// ── HTML escape helpers ────────────────────────────────────
function ea(s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function eh(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
window.ea = ea;
window.eh = eh;

// ── Toast notification ─────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
window.toast = toast;

// ── Escape key closes any open modal ──────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-record', 'modal-form', 'modal-import'].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.classList.contains('open')) closeModal(id);
    });
  }
});
