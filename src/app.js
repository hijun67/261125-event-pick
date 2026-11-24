import { filterEvents, sortEvents, renderCard, renderDetail, todayKST } from '/lib.mjs';

const state = { q: '', category: '전체', type: '전체', status: '전체', sort: 'deadline' };
let events = [];

const $ = (sel) => document.querySelector(sel);
const cardsEl = $('#cards');
const countEl = $('#result-count');
const emptyEl = $('#empty');
const errEl = $('#load-error');
const clearQ = $('#clear-q');
const dialog = $('#detail');
const detailBody = $('#detail-body');

function update(kind, value) {
  state[kind] = value;
  if (kind === 'q') {
    clearQ.hidden = !value;
  }
  render();
}

function render() {
  const filtered = sortEvents(filterEvents(events, state), state.sort);
  cardsEl.innerHTML = filtered.map((ev) => renderCard(ev)).join('');
  countEl.innerHTML = `전체 <b>${events.length}</b>건 중 <b>${filtered.length}</b>건 표시`;
  emptyEl.hidden = filtered.length !== 0;
}

function openDetail(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  detailBody.innerHTML = renderDetail(ev);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
}

function closeDetail() {
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

document.addEventListener('click', (e) => {
  const openBtn = e.target.closest('[data-open]');
  if (openBtn) { openDetail(openBtn.dataset.open); return; }
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const url = copyBtn.dataset.copy;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { copyBtn.textContent = '복사됨'; }, () => {});
    return;
  }
  if (e.target === dialog) closeDetail();
});

dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDetail(); });
dialog.addEventListener('close', () => {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

$('#q').addEventListener('input', (e) => update('q', e.target.value));
clearQ.addEventListener('click', () => { $('#q').value = ''; update('q', ''); $('#q').focus(); });
$('#status').addEventListener('change', (e) => update('status', e.target.value));
$('#sort').addEventListener('change', (e) => update('sort', e.target.value));
$('#reset').addEventListener('click', () => {
  $('#q').value = '';
  $('#status').value = '전체';
  $('#sort').value = 'deadline';
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.category === '전체' || b.dataset.type === '전체'));
  Object.assign(state, { q: '', category: '전체', type: '전체', status: '전체', sort: 'deadline' });
  clearQ.hidden = true;
  render();
});

document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.category ? 'category' : 'type';
    const value = btn.dataset.category || btn.dataset.type;
    const group = btn.parentElement.querySelectorAll('.seg-btn');
    group.forEach((b) => b.classList.remove('is-on'));
    btn.classList.add('is-on');
    update(kind, value);
  });
});

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

console.log(`이벤트픽 · 기준일 ${todayKST()}`);
boot();
