/* ===== TokenQ shared core (used by index.html and owner.html) ===== */
const STORAGE_KEY = 'tokenq-salon-data-v2';
let DATA = null;

const DEFAULT_DATA = {
  settings: {
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
  },
  bookings: []
};

async function loadData() {
  try {
    const res = await window.storage.get(STORAGE_KEY, true);
    if (res && res.value) {
      DATA = JSON.parse(res.value);
      if (!DATA.settings.staff) DATA.settings.staff = [{ id: 'staff1', name: 'Owner (You)' }];
      if (!DATA.settings.ownerPin) DATA.settings.ownerPin = '';
      if (!DATA.settings.publicBookingLink) DATA.settings.publicBookingLink = '';
    } else {
      DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
      await seedDemo();
      await saveData();
    }
  } catch (e) {
    DATA = JSON.parse(JSON.stringify(DEFAULT_DATA));
    await seedDemo();
    await saveData();
  }
}

async function saveData() {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(DATA), true); }
  catch (e) { console.error('save failed', e); }
}

async function seedDemo() {
  const today = todayStr();
  const now = Date.now();
  const staffId = DATA.settings.staff[0].id;
  DATA.bookings = [
    { id: 'seed1', token: 1, name: 'Rohit Sharma', phone: '9876543210', services: ['haircut', 'shave'],
      date: today, slot: 'now', staffId: staffId, assignedStaffId: staffId,
      status: 'in-progress', createdAt: now - 6 * 60000, startedAt: now - 6 * 60000, amount: null },
    { id: 'seed2', token: 2, name: 'Vivek Patil', phone: '9876500001', services: ['haircut'],
      date: today, slot: 'now', staffId: 'any', assignedStaffId: null,
      status: 'waiting', createdAt: now - 2 * 60000, startedAt: null, amount: null }
  ];
}

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

/* estimate wait (minutes) if booking "now" for a given staff selection */
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
