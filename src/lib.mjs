// 검색·필터·정렬·D-day 계산과 카드 렌더링 — 브라우저(app.js)와 테스트(node)가 함께 씁니다.

export const CATEGORIES = ['정부·지자체', '공공기관', '기업'];
export const TYPES = ['경품·이벤트', '퀴즈', '공모전'];
export const STATUSES = ['진행중', '마감임박'];
export const SORTS = { deadline: '마감임박순', recent: '최신등록순' };

const DAY = 24 * 60 * 60 * 1000;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 'YYYY-MM-DD' → UTC 자정 타임스탬프(날짜 차이만 필요하므로 시간대 영향 없음) */
export function dayStamp(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NaN;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 기준 시각의 한국 날짜 'YYYY-MM-DD' */
export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 마감까지 남은 일수. 0이면 오늘 마감, 음수면 지난 이벤트 */
export function dday(end, now = new Date()) {
  if (!end) return NaN;
  return Math.round((dayStamp(end) - dayStamp(todayKST(now))) / DAY);
}

export function isExpired(ev, now = new Date()) {
  const left = dday(ev.end, now);
  return !Number.isFinite(left) || left < 0;
}

export function statusOf(ev, now = new Date()) {
  const left = dday(ev.end, now);
  if (!Number.isFinite(left) || left < 0) return '종료';
  if (left <= 7) return '마감임박';
  return '진행중';
}

export function ddayLabel(ev, now = new Date()) {
  const left = dday(ev.end, now);
  if (!Number.isFinite(left)) return '마감 미정';
  if (left < 0) return '종료';
  if (left === 0) return 'D-DAY';
  return `D-${left}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${Number(y)}.${Number(m)}.${Number(d)}`;
}

export function fmtPeriod(ev) {
  const end = fmtDate(ev.end) + (ev.endTime ? ` ${ev.endTime}` : '');
  if (!ev.start) return `~ ${end}`;
  return `${fmtDate(ev.start)} ~ ${end}`;
}

function haystack(ev) {
  return [ev.title, ev.organizer, ev.prize, ev.howTo, (ev.tags || []).join(' '), ev.category, ev.type].join(' ').toLowerCase();
}

export function filterEvents(events, filters = {}, now = new Date()) {
  const q = (filters.q || '').trim().toLowerCase();
  const { category = '전체', type = '전체', status = '전체' } = filters;
  return events.filter((ev) => {
    if (isExpired(ev, now)) return false;
    if (category !== '전체' && ev.category !== category) return false;
    if (type !== '전체' && ev.type !== type) return false;
    if (status === '마감임박' && dday(ev.end, now) > 7) return false;
    if (status === '진행중' && isExpired(ev, now)) return false;
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      const hay = haystack(ev);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function sortEvents(events, sort = 'deadline') {
  const list = [...events];
  if (sort === 'recent') {
    list.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) || String(a.end).localeCompare(String(b.end)));
  } else {
    list.sort((a, b) => String(a.end).localeCompare(String(b.end)) || String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
  }
  return list;
}

function badgeClass(ev, now) {
  const st = statusOf(ev, now);
  if (st === '마감임박') return 'badge badge-hot';
  if (st === '종료') return 'badge badge-done';
  return 'badge badge-live';
}

export function renderCard(ev, now = new Date()) {
  const tags = (ev.tags || []).slice(0, 4).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  const collected = ev.source === '자동수집' ? '<span class="chip chip-auto">자동수집</span>' : '<span class="chip chip-verified">공식 확인</span>';
  return `<article class="card" data-id="${escapeHtml(ev.id)}">
  <div class="card-top">
    <div class="chips">
      <span class="chip chip-cat">${escapeHtml(ev.category)}</span>
      <span class="chip chip-type">${escapeHtml(ev.type)}</span>
      ${collected}
    </div>
    <span class="${badgeClass(ev, now)}">${escapeHtml(ddayLabel(ev, now))}</span>
  </div>
  <h3 class="card-title"><button type="button" class="title-btn" data-open="${escapeHtml(ev.id)}">${escapeHtml(ev.title)}</button></h3>
  <p class="card-org">${escapeHtml(ev.organizer)}</p>
  <p class="card-prize"><span class="prize-label">경품·시상</span> ${escapeHtml(ev.prize)}</p>
  <p class="card-period">마감 ${escapeHtml(fmtPeriod(ev))}</p>
  <div class="tags">${tags}</div>
  <div class="card-actions">
    <button type="button" class="btn btn-ghost" data-open="${escapeHtml(ev.id)}">자세히 보기</button>
    <a class="btn btn-primary" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>
  </div>
</article>`;
}

export function renderDetail(ev, now = new Date()) {
  return `<div class="detail-head">
  <div class="chips">
    <span class="chip chip-cat">${escapeHtml(ev.category)}</span>
    <span class="chip chip-type">${escapeHtml(ev.type)}</span>
    <span class="${badgeClass(ev, now)}">${escapeHtml(ddayLabel(ev, now))}</span>
  </div>
  <h2 id="detail-title">${escapeHtml(ev.title)}</h2>
  <p class="detail-org">${escapeHtml(ev.organizer)}</p>
</div>
<dl class="detail-list">
  <div><dt>응모 기간</dt><dd>${escapeHtml(fmtPeriod(ev)) || '원문 확인'}</dd></div>
  <div><dt>경품·시상</dt><dd>${escapeHtml(ev.prize) || '원문 확인'}</dd></div>
  <div><dt>참여 방법</dt><dd>${escapeHtml(ev.howTo) || '원문 확인'}</dd></div>
  ${ev.note ? `<div><dt>알아 둘 점</dt><dd>${escapeHtml(ev.note)}</dd></div>` : ''}
  <div><dt>확인</dt><dd>${escapeHtml(ev.sourceLabel || '공식 페이지')} · ${escapeHtml(ev.verifiedAt || '')}</dd></div>
</dl>
<div class="detail-actions">
  <a class="btn btn-primary" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">원문 페이지에서 응모하기 ↗</a>
  <button type="button" class="btn btn-ghost" data-copy="${escapeHtml(ev.url)}">링크 복사</button>
</div>
<p class="detail-note">경품과 마감일은 주최 측 사정으로 바뀔 수 있습니다. 응모 전 원문 공고를 다시 확인하세요.</p>`;
}
