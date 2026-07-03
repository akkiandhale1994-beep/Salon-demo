/* ===== TokenQ shared core (used by index.html and owner.html) ===== */
/* Multi-salon (SaaS) version — each salon's data lives at salons/{salonId} in Firebase */

const firebaseConfig = {
  apiKey: "AIzaSyB084EcLFVtZymBMRx7J0TKUdKaeWpQs8o",
  authDomain: "tokenq-salon.firebaseapp.com",
  databaseURL: "https://tokenq-salon-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tokenq-salon",
  storageBucket: "tokenq-salon.firebasestorage.app",
  messagingSenderId: "584313999476",
  appId: "1:584313999476:web:7457c6e4fa2e98eeecc121",
  measurementId: "G-EG8CXC4W0C"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let DATA = null;
let currentSalonId = null;
let dbRef = null;

const DEFAULT_DATA = {
  settings: {
    salonName: 'My Salon',
    ownerWhatsapp: '919999999999',
    upiId: '',
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
  },
  bookings: []
};

function getSalonIdFromURL() {
  const p = new URLSearchParams(window.location.search);
  return p.get('salon');
}

function setSalonId(id) {
  currentSalonId = id;
  dbRef = db.ref('salons/' + id);
}

function clientLinkForSalon(id) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/owner\.html$/, 'index.html');
  url.search = '?salon=' + id;
  url.hash = '';
  return url.toString();
}

function normalizeData() {
  if (!DATA.settings) DATA.settings = JSON.parse(JSON.stringify(DEFAULT_DATA.settings));
  if (!DATA.settings.staff) DATA.settings.staff = [{ id: 'staff1', name: 'Owner (You)' }];
  if (!DATA.settings.services) DATA.settings.services = JSON.parse(JSON.stringify(DEFAULT_DATA.settings.services));
  if (typeof DATA.settings.upiId !== 'string') DATA.settings.upiId = '';
  if (!Array.isArray(DATA.bookings)) {
    DATA.bookings = DATA.bookings ? Object.values(DATA.bookings) : [];
  }
}

async function loadData() {
  try {
    const snap = await dbRef.once('value');
    if (snap.exists()) {
      DATA = snap.val();
      normalizeData();
    } else {
      DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
      await saveData();
    }
  } catch (e) {
    console.error('loadData failed', e);
    if (!DATA) DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

async function saveData() {
  try { await dbRef.set(DATA); }
  catch (e) { console.error('save failed', e); showToast('Could not save — check internet connection'); }
}

/* Real-time sync: fires `callback` any time data changes on the server */
function startRealtimeSync(callback) {
  dbRef.on('value', (snap) => {
    if (!snap.exists()) return;
    DATA = snap.val();
    normalizeData();
    callback();
  });
}

/* ---- Owner auth helpers ---- */
function signUpOwner(email, password) { return auth.createUserWithEmailAndPassword(email, password); }
function loginOwner(email, password) { return auth.signInWithEmailAndPassword(email, password); }
function logoutOwner() { return auth.signOut(); }
function onAuthChange(cb) { auth.onAuthStateChanged(cb); }

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

function addServiceToBooking(bookingId, serviceId) {
  const b = DATA.bookings.find(x => x.id === bookingId);
  if (b && !b.services.includes(serviceId)) b.services.push(serviceId);
}

function paymentLink(b) {
  if (!DATA.settings.upiId) return '';
  return `upi://pay?pa=${encodeURIComponent(DATA.settings.upiId)}&pn=${encodeURIComponent(DATA.settings.salonName)}&am=${b.amount}&cu=INR&tn=${encodeURIComponent('Token ' + b.token)}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) { alert(msg); return; }
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
