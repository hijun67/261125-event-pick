import {
  filterEvents, sortEvents, hotEvents, summarize, renderCard, renderRow, renderSpot, renderDetail,
  todayKST,
} from '/lib.mjs';

const LS = { theme: 'eventpick.theme.v1', view: 'eventpick.view.v1', saved: 'eventpick.saved.v1', done: 'eventpick.done.v1' };
const state = { q: '', category: '전체', entry: '전체', prize: '전체', status: '전체', sort: 'deadline', view: 'card' };
let events = [];
let saved = new Set();
let done = new Set();

const $ = (sel) => document.querySelector(sel);
const cardsEl = $('#cards');
const countEl = $('#result-count');
const emptyEl = $('#empty');
const errEl = $('#load-error');
const clearQ = $('#clear-q');
const dialog = $('#detail');
const detailBody = $('#detail-body');
const spotsEl = $('#spots');
const spotStrip = $('#spot-strip');

/* ---------- 저장값 ---------- */
function loadSet(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) {
    return new Set();
  }
}
function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) { /* 저장 불가 환경 무시 */ }
}
saved = loadSet(LS.saved);
done = loadSet(LS.done);

/* ---------- 테마 ---------- */
const themeBtn = $('#theme-toggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const dark = theme === 'dark';
  themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  themeBtn.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
  themeBtn.querySelector('.theme-icon').textContent = dark ? '☀️' : '🌙';
  themeBtn.querySelector('.theme-text').textContent = dark ? '라이트' : '다크';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0c0e13' : '#f4f0e6');
}
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(LS.theme, next); } catch (e) {}
});

/* ---------- 보기 전환 ---------- */
document.querySelectorAll('.vt-btn').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});
function setView(view) {
  state.view = view === 'list' ? 'list' : 'card';
  document.documentElement.setAttribute('data-view', state.view);
  document.querySelectorAll('.vt-btn').forEach((b) => {
    const on = b.dataset.view === state.view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  try { localStorage.setItem(LS.view, state.view); } catch (e) {}
  render();
}
setView(document.documentElement.getAttribute('data-view') === 'list' ? 'list' : 'card');

/* ---------- 렌더 ---------- */
function render() {
  const filtered = sortEvents(filterEvents(events, { ...state, saved, done }), state.sort);
  const opts = { saved, done };
  cardsEl.dataset.view = state.view;
  cardsEl.innerHTML = filtered.map((ev) => (state.view === 'list' ? renderRow(ev, opts) : renderCard(ev, opts))).join('');
  const mine = state.status === '내 찜·참여완료';
  countEl.innerHTML = `전체 <b>${events.length}</b>건 중 <b>${filtered.length}</b>건 표시${mine ? ` · 찜 ${saved.size} · 참여완료 ${done.size}` : ''}`;
  emptyEl.hidden = filtered.length !== 0;
  emptyEl.textContent = mine
    ? '아직 찜하거나 참여 완료로 표시한 이벤트가 없습니다. 카드의 ♡·✓ 버튼으로 기록해 두세요.'
    : '조건에 맞는 이벤트가 없습니다. 검색어나 필터를 바꿔 보세요.';
  renderSpots();
  renderStats();
}

function renderSpots() {
  const list = hotEvents(events).slice(0, 8);
  if (!list.length) { spotStrip.hidden = true; return; }
  spotStrip.hidden = false;
  spotsEl.innerHTML = list.map((ev) => renderSpot(ev)).join('');
}

function renderStats() {
  const s = summarize(events);
  const stats = document.querySelectorAll('.hero-stats .stat b');
  if (stats.length >= 4) {
    stats[0].textContent = String(s.total);
    stats[1].textContent = String(s.soon);
    stats[2].textContent = String(s.contest);
    stats[3].textContent = String(s.corp);
  }
}

/* ---------- 이벤트 처리 ---------- */
function bump(kind, id) {
  const set = kind === 'fav' ? saved : done;
  const key = kind === 'fav' ? LS.saved : LS.done;
  if (set.has(id)) set.delete(id); else set.add(id);
  saveSet(key, set);
  const ev = events.find((e) => e.id === id);
  if (ev && dialog.open) detailBody.innerHTML = renderDetail(ev, { saved, done });
  render();
}

document.addEventListener('click', (e) => {
  const openBtn = e.target.closest('[data-open]');
  if (openBtn) { openDetail(openBtn.dataset.open); return; }
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) { bump('fav', favBtn.dataset.fav); return; }
  const doneBtn = e.target.closest('[data-done]');
  if (doneBtn) { bump('done', doneBtn.dataset.done); return; }
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const url = copyBtn.dataset.copy;
    const after = () => { copyBtn.textContent = '복사됨'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(after, () => {});
    else after();
    return;
  }
  if (e.target === dialog) closeDetail();
});

function openDetail(id) {
  const ev = events.find((x) => x.id === id);
  if (!ev) return;
  detailBody.innerHTML = renderDetail(ev, { saved, done });
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
}

function closeDetail() {
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeDetail(); });
dialog.addEventListener('close', () => {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

/* ---------- 검색·필터 ---------- */
function update(kind, value) {
  state[kind] = value;
  if (kind === 'q') clearQ.hidden = !value;
  render();
}
$('#q').addEventListener('input', (e) => update('q', e.target.value));
clearQ.addEventListener('click', () => { $('#q').value = ''; update('q', ''); $('#q').focus(); });
$('#sort').addEventListener('change', (e) => update('sort', e.target.value));

document.querySelectorAll('.pills').forEach((group) => {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    group.querySelectorAll('.pill').forEach((b) => b.classList.toggle('is-on', b === btn));
    update(group.dataset.group, btn.dataset.value);
  });
});

$('#reset').addEventListener('click', () => {
  $('#q').value = '';
  $('#sort').value = 'deadline';
  clearQ.hidden = true;
  document.querySelectorAll('.pills').forEach((group) => {
    group.querySelectorAll('.pill').forEach((b) => b.classList.toggle('is-on', b.dataset.value === '전체'));
  });
  Object.assign(state, { q: '', category: '전체', entry: '전체', prize: '전체', status: '전체', sort: 'deadline' });
  render();
});

/* ---------- 시작 ---------- */
async function boot() {
  try {
    const res = await fetch('/data/events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const payload = await res.json();
    events = Array.isArray(payload) ? payload : payload.events;
    render();
    const hash = decodeURIComponent(location.hash.replace('#', ''));
    if (hash) openDetail(hash);
  } catch (err) {
    errEl.hidden = false;
    countEl.textContent = '목록을 불러오지 못했습니다';
    console.error('events load failed', err);
  }
}

boot().then(() => console.log(`이벤트픽 · 기준일 ${todayKST()} · 총 ${events.length}건`));
