/* ===== TokenQ shared core — now backed by Firebase Realtime Database ===== */

const firebaseConfig = {
  apiKey: "AIzaSyB084EcLFVtZymBMRx7J0TKUdKaeWpQs8o",
  authDomain: "tokenq-salon.firebaseapp.com",
  databaseURL: "https://tokenq-salon-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tokenq-salon",
  storageBucket: "tokenq-salon.firebasestorage.app",
  messagingSenderId: "584313999476",
  appId: "1:584313999476:web:7457c6e4fa2e98eeecc121"
};

const DEFAULT_SETTINGS = {
  salonName: 'Style Studio',
  ownerWhatsapp: '919999999999',
  upiId: '',
  ownerPin: '',
  publicBookingLink: '',
  services: [
    { id: 'haircut', name: 'Hair Cut', price: 150, duration: 30 },
    { id: 'shave', name: 'Shave', price: 100, duration: 20 },
    { id: 'facial', name: 'Facial', price: 500, duration: 45 },
    { id: 'color', name: 'Hair Colour', price: 800, duration: 60 },
    { id: 'massage', name: 'Head Massage', price: 200, duration: 20 },
    { id: 'trim', name: 'Beard Trim', price: 80, duration: 15 }
  ],
  staff: [
    { id: 'staff1', name: 'Owner (You)' }
  ]
};

let DATA = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), bookings: [] };
let db = null;
let _onChange = null;
let _settingsLoaded = false;
let _bookingsLoaded = false;

function ensureSettingsDefaults() {
  if (!DATA.settings) DATA.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!DATA.settings.staff) DATA.settings.staff = [{ id: 'staff1', name: 'Owner (You)' }];
  if (!DATA.settings.services) DATA.settings.services = DEFAULT_SETTINGS.services;
  if (DATA.settings.ownerPin === undefined) DATA.settings.ownerPin = '';
  if (DATA.settings.publicBookingLink === undefined) DATA.settings.publicBookingLink = '';
}

function isUserTyping() {
  const tag = document.activeElement ? document.activeElement.tagName : '';
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/* onReady(isFirstLoad) is called every time data changes in real time */
function initFirebase(onReady) {
  _onChange = onReady;
  if (!window.firebase) {
    console.error('Firebase SDK not loaded');
    ensureSettingsDefaults();
    onReady(true);
    return;
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();

  db.ref('settings').on('value', (snap) => {
    const val = snap.val();
    const firstLoad = !_settingsLoaded;
    _settingsLoaded = true;
    if (val) {
      DATA.settings = val;
      ensureSettingsDefaults();
    } else {
      DATA.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      db.ref('settings').set(DATA.settings);
    }
    if (firstLoad || !isUserTyping()) _onChange(firstLoad);
  }, (err) => {
    console.error('settings listener error', err);
  });

  db.ref('bookings').on('value', (snap) => {
    const val = snap.val();
    const firstLoad = !_bookingsLoaded;
    _bookingsLoaded = true;
    DATA.bookings = val ? Object.keys(val).map(k => val[k]) : [];
    if (firstLoad || !isUserTyping()) _onChange(firstLoad);
  }, (err) => {
    console.error('bookings listener error', err);
  });
}

async function writeSettings() {
  if (!db) return;
  try { await db.ref('settings').set(DATA.settings); }
  catch (e) { console.error('writeSettings failed', e); showToast('Could not save — check your internet connection'); }
}
async function writeBooking(booking) {
  if (!db) return;
  try { await db.ref('bookings/' + booking.id).set(booking); }
  catch (e) { console.error('writeBooking failed', e); showToast('Could not save booking — check your internet connection'); }
}

/* ---- date / formatting helpers ---- */
function todayStr(d) { const dt = d || new Date(); return dt.toISOString().slice(0, 10); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return todayStr(d); }
function fmtDateLabel(dateStr) {
  const t = todayStr(), tm = tomorrowStr();
  if (dateStr === t) return 'Today';
  if (dateStr === tm) return 'Tomorrow';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtMoney(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function svcById(id) { return DATA.settings.services.find(s => s.id === id); }
function staffById(id) { return DATA.settings.staff.find(s => s.id === id); }
function staffName(id) {
  if (id === 'any' || !id) return 'Any Available';
  const s = staffById(id); return s ? s.name : 'Unassigned';
}
function bookingSvcNames(b) { return b.services.map(id => svcById(id)?.name || id).join(', '); }
function bookingSvcTotal(b) { return b.services.reduce((s, id) => s + (svcById(id)?.price || 0), 0); }
function bookingSvcDuration(b) { return b.services.reduce((s, id) => s + (svcById(id)?.duration || 0), 0); }
function bookingsForDate(dateStr) { return DATA.bookings.filter(b => b.date === dateStr); }

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) { return; }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---- slot / availability engine ---- */
const SLOT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
function slotLabel(key, dateStr) {
  if (key === 'now') return (dateStr === todayStr()) ? 'Now' : 'Open';
  const h = parseInt(key.replace('h', ''), 10);
  return (h > 12 ? h - 12 : h) + ':00 ' + (h >= 12 ? 'PM' : 'AM');
}
function isStaffFreeAtSlot(staffId, dateStr, slotKey) {
  return !DATA.bookings.some(b =>
    b.date === dateStr && b.slot === slotKey && b.status !== 'done' &&
    (b.assignedStaffId === staffId || b.staffId === staffId)
  );
}
function buildSlots(dateStr, staffSel) {
  const isToday = dateStr === todayStr();
  const keys = isToday ? ['now', ...SLOT_HOURS.map(h => 'h' + h)] : SLOT_HOURS.map(h => 'h' + h);
  return keys.map(key => {
    let taken;
    if (staffSel === 'any') {
      taken = DATA.settings.staff.every(s => !isStaffFreeAtSlot(s.id, dateStr, key));
    } else {
      taken = !isStaffFreeAtSlot(staffSel, dateStr, key);
    }
    return { key, label: slotLabel(key, dateStr), now: key === 'now', taken };
  });
}

function estimateWaitMinutes(staffSel) {
  const dateStr = todayStr();
  const staffIds = staffSel === 'any' ? DATA.settings.staff.map(s => s.id) : [staffSel];
  const loads = staffIds.map(sid => {
    let mins = 0;
    const inProg = DATA.bookings.find(b => b.date === dateStr && b.status === 'in-progress' && b.assignedStaffId === sid);
    if (inProg) {
      const dur = bookingSvcDuration(inProg);
      const elapsed = Math.floor((Date.now() - inProg.startedAt) / 60000);
      mins += Math.max(dur - elapsed, 2);
    }
    const waiting = DATA.bookings.filter(b => b.date === dateStr && b.status === 'waiting' && b.slot === 'now' &&
      (b.assignedStaffId === sid || b.staffId === sid));
    waiting.sort((a, b) => a.createdAt - b.createdAt);
    waiting.forEach(b => { mins += bookingSvcDuration(b); });
    return mins;
  });
  return Math.min(...loads);
}

function staffLiveStatus(staffId) {
  const dateStr = todayStr();
  const inProg = DATA.bookings.find(b => b.date === dateStr && b.status === 'in-progress' && b.assignedStaffId === staffId);
  if (!inProg) {
    const waitingCount = DATA.bookings.filter(b => b.date === dateStr && b.status === 'waiting' &&
      (b.assignedStaffId === staffId || b.staffId === staffId)).length;
    return { busy: false, waitingCount };
  }
  const dur = bookingSvcDuration(inProg);
  return { busy: true, booking: inProg, duration: dur };
}

/* ---- client tracking / history ---- */
function activeBookingForPhone(phone) {
  return DATA.bookings.filter(b => b.phone === phone && b.status !== 'done')
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
function historyForPhone(phone) {
  return DATA.bookings.filter(b => b.phone === phone && b.status === 'done')
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}

/* ---- auto-assign: pick the oldest "Any Available" waiting booking for today ---- */
function nextAnyWaiting(dateStr) {
  return DATA.bookings.filter(b => b.date === dateStr && b.status === 'waiting' &&
    b.staffId === 'any' && !b.assignedStaffId)
    .sort((a, b) => a.createdAt - b.createdAt)[0] || null;
}
