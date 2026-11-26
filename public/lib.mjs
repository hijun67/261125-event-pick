// 검색·필터·분류·D-day 계산과 카드/목록/상세 렌더링 — 브라우저(app.js)와 테스트(node)·빌드가 함께 씁니다.

export const CATEGORIES = ['정부·지자체', '공공기관', '기업'];
export const TYPES = ['경품·이벤트', '퀴즈', '공모전'];
export const ENTRY_TYPES = ['단순응모', '설문·투표', '퀴즈·퍼즐', '댓글·참여인증', '공모·제출'];
export const PRIZE_TYPES = ['상품권·페이', '기프티콘', '현물·전자기기', '상금·시상'];
export const STATUS_FILTERS = ['전체', '진행중', '마감임박', '내 찜·참여완료'];
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
  if (left === 1) return '내일 마감';
  return `D-${left}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${Number(y)}.${Number(m)}.${Number(d)}`;
}

export function fmtPeriod(ev) {
  if (!ev || !ev.end) return '';
  const end = fmtDate(ev.end);
  if (!ev.start) return `~ ${end}`;
  return `${fmtDate(ev.start)} ~ ${end}`;
}

/* ---------- 분류 ---------- */
export function entryTypeOf(ev = {}) {
  const type = ev.type || '';
  const text = `${ev.title || ''} ${ev.howTo || ''} ${(ev.steps || []).join(' ')} ${type}`;
  if (type === '공모전' || /공모|출품|작품\s*제출|접수/.test(`${ev.title || ''} ${type}`)) return '공모·제출';
  if (/퀴즈|퍼즐|초성|OX|룰렛|정답|QUIZ/i.test(text)) return '퀴즈·퍼즐';
  if (/설문|투표|만족도|의견\s*조사|시민\s*조사|서베이/.test(text)) return '설문·투표';
  if (/댓글|구독|인증|해시태그|SNS|공유|업로드|후기|리뷰|캡처|스탬프|방문/.test(text)) return '댓글·참여인증';
  return '단순응모';
}

export function prizeTypeOf(ev = {}) {
  const p = `${ev.prize || ''} ${ev.title || ''}`;
  if (/(총\s*상금|상금|시상|대상|최우수|우수상|금상|은상|동상|장려|입상|상격|프로젝트\s*인수)/.test(p)) return '상금·시상';
  if (/(상품권|온누리|문화상품권|페이|포인트|캐시|마일리지|원권|금액권)/.test(p)) return '상품권·페이';
  if (/(기프티콘|쿠폰|아메리카노|커피|치킨|음료|할인권|교환권)/.test(p)) return '기프티콘';
  if (/(에어팟|아이패드|아이폰|갤럭시|노트북|태블릿|워치|이어폰|스피커|텀블러|쿠션|굿즈|세트|제품|가전|화장품|도서|책|상품|로봇청소기|청소기|드라이기|자전거|골드바|캐리어|일력|달력)/.test(p)) return '현물·전자기기';
  return '기타';
}

/** 경품 문구에서 당첨 인원을 읽습니다. 여러 등수가 있으면 첫 표기만. */
export function winnersOf(ev = {}) {
  const total = String(ev.prize || '').match(/총\s*([\d,]{1,7})\s*명/);
  if (total) return `${total[1]}명`;
  if (ev.winners) return String(ev.winners);
  const m = String(ev.prize || '').match(/([\d,]{1,7})\s*명/);
  return m ? `${m[1]}명` : '';
}

export function announceOf(ev = {}) {
  return ev.announceDate ? fmtDate(ev.announceDate) : (ev.announceNote || '');
}

export function prizeTypeClass(type) {
  return { '상품권·페이': 'pt-voucher', '기프티콘': 'pt-gift', '현물·전자기기': 'pt-goods', '상금·시상': 'pt-cash' }[type] || 'pt-etc';
}

export function catClass(cat) {
  return { '정부·지자체': 'cat-gov', '공공기관': 'cat-public', '기업': 'cat-corp' }[cat] || 'cat-etc';
}

/* ---------- 검색·필터 ---------- */
function haystack(ev) {
  return [ev.title, ev.organizer, ev.prize, ev.howTo, (ev.steps || []).join(' '), (ev.tags || []).join(' '), ev.category, ev.type, entryTypeOf(ev), prizeTypeOf(ev)]
    .join(' ')
    .toLowerCase();
}

export function filterEvents(events, filters = {}, now = new Date()) {
  const q = (filters.q || '').trim().toLowerCase();
  const { category = '전체', entry = '전체', prize = '전체', status = '전체' } = filters;
  const saved = filters.saved instanceof Set ? filters.saved : new Set(filters.saved || []);
  const done = filters.done instanceof Set ? filters.done : new Set(filters.done || []);
  return events.filter((ev) => {
    if (isExpired(ev, now)) return false;
    if (category !== '전체' && ev.category !== category) return false;
    if (entry !== '전체' && entryTypeOf(ev) !== entry) return false;
    if (prize !== '전체' && prizeTypeOf(ev) !== prize) return false;
    if (status === '진행중' && dday(ev.end, now) <= 7) return false;
    if (status === '마감임박' && dday(ev.end, now) > 7) return false;
    if (status === '내 찜·참여완료' && !(saved.has(ev.id) || done.has(ev.id))) return false;
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

/** 마감 임박 하이라이트(D-3 이내) — 마감이 가까운 순 */
export function hotEvents(events, now = new Date(), days = 3) {
  return sortEvents(events.filter((ev) => {
    const left = dday(ev.end, now);
    return Number.isFinite(left) && left >= 0 && left <= days;
  }), 'deadline');
}

/** 요약 지표 */
export function summarize(events, now = new Date()) {
  const active = events.filter((ev) => !isExpired(ev, now));
  const soon = active.filter((ev) => dday(ev.end, now) <= 7);
  const byPrize = {};
  for (const t of PRIZE_TYPES) byPrize[t] = 0;
  for (const ev of active) {
    const t = prizeTypeOf(ev);
    if (byPrize[t] === undefined) byPrize[t] = 0;
    byPrize[t] += 1;
  }
  return {
    total: active.length,
    soon: soon.length,
    gov: active.filter((ev) => ev.category === '정부·지자체').length,
    publicOrg: active.filter((ev) => ev.category === '공공기관').length,
    corp: active.filter((ev) => ev.category === '기업').length,
    contest: active.filter((ev) => ev.type === '공모전').length,
    byPrize,
  };
}

/* ---------- 렌더링 ---------- */
const chips = (ev, now) => {
  const et = entryTypeOf(ev);
  const pt = prizeTypeOf(ev);
  return `<div class="chips">
    <span class="chip ${catClass(ev.category)}">${escapeHtml(ev.category)}</span>
    <span class="chip chip-entry">${escapeHtml(et)}</span>
    ${pt === '기타' ? '' : `<span class="chip chip-prize ${prizeTypeClass(pt)}">${escapeHtml(pt)}</span>`}
  </div>`;
};

const ddayChip = (ev, now) => {
  const st = statusOf(ev, now);
  const left = dday(ev.end, now);
  const cls = !Number.isFinite(left) ? 'dd-none' : left <= 3 ? 'dd-hot' : left <= 7 ? 'dd-soon' : 'dd-live';
  return `<span class="dday ${cls}">${escapeHtml(ddayLabel(ev, now))}</span>`;
};

const acts = (ev, saved, done) => `<div class="card-foot">
    <button type="button" class="icon-btn fav${saved ? ' is-on' : ''}" data-fav="${escapeHtml(ev.id)}" aria-pressed="${saved ? 'true' : 'false'}" title="찜하기" aria-label="찜하기">${saved ? '♥' : '♡'}</button>
    <button type="button" class="icon-btn done${done ? ' is-on' : ''}" data-done="${escapeHtml(ev.id)}" aria-pressed="${done ? 'true' : 'false'}" title="참여 완료" aria-label="참여 완료">✓</button>
    <button type="button" class="btn btn-ghost" data-open="${escapeHtml(ev.id)}">자세히</button>
    <a class="btn btn-primary" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">공식 원문 ↗</a>
  </div>`;

export function renderCard(ev, opts = {}) {
  const now = opts.now || new Date();
  const saved = opts.saved instanceof Set ? opts.saved.has(ev.id) : Boolean(opts.saved && opts.saved[ev.id]);
  const done = opts.done instanceof Set ? opts.done.has(ev.id) : Boolean(opts.done && opts.done[ev.id]);
  const pt = prizeTypeOf(ev);
  const winners = winnersOf(ev);
  const announce = announceOf(ev);
  return `<article class="card ${prizeTypeClass(pt)}" data-id="${escapeHtml(ev.id)}">
  <div class="card-top">
    <p class="card-org"><span class="dot ${catClass(ev.category)}" aria-hidden="true"></span>${escapeHtml(ev.organizer)}</p>
    ${ddayChip(ev, now)}
  </div>
  <h3 class="card-title"><button type="button" class="title-btn" data-open="${escapeHtml(ev.id)}">${escapeHtml(ev.title)}</button></h3>
  ${chips(ev, now)}
  <p class="card-prize"><span class="prize-label">경품</span><span class="prize-text">${escapeHtml(ev.prize || '원문 확인')}</span>${winners ? `<span class="winners">${escapeHtml(winners)}</span>` : ''}</p>
  <p class="card-meta">마감 ${escapeHtml(fmtDate(ev.end))}${announce ? ` · 발표 ${escapeHtml(announce)}` : ''}</p>
  ${acts(ev, saved, done)}
</article>`;
}

export function renderRow(ev, opts = {}) {
  const now = opts.now || new Date();
  const saved = opts.saved instanceof Set ? opts.saved.has(ev.id) : Boolean(opts.saved && opts.saved[ev.id]);
  const done = opts.done instanceof Set ? opts.done.has(ev.id) : Boolean(opts.done && opts.done[ev.id]);
  const pt = prizeTypeOf(ev);
  return `<article class="row ${prizeTypeClass(pt)}" data-id="${escapeHtml(ev.id)}">
  ${ddayChip(ev, now)}
  <div class="row-main">
    <h3 class="row-title"><button type="button" class="title-btn" data-open="${escapeHtml(ev.id)}">${escapeHtml(ev.title)}</button></h3>
    <p class="row-sub"><span class="dot ${catClass(ev.category)}" aria-hidden="true"></span>${escapeHtml(ev.organizer)} · ${escapeHtml(entryTypeOf(ev))} · 마감 ${escapeHtml(fmtDate(ev.end))}</p>
  </div>
  <p class="row-prize">${escapeHtml(ev.prize || '원문 확인')}</p>
  <div class="row-acts">
    <button type="button" class="icon-btn fav${saved ? ' is-on' : ''}" data-fav="${escapeHtml(ev.id)}" aria-pressed="${saved ? 'true' : 'false'}" aria-label="찜하기">${saved ? '♥' : '♡'}</button>
    <button type="button" class="icon-btn done${done ? ' is-on' : ''}" data-done="${escapeHtml(ev.id)}" aria-pressed="${done ? 'true' : 'false'}" aria-label="참여 완료">✓</button>
    <a class="btn btn-primary btn-sm" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">원문 ↗</a>
  </div>
</article>`;
}

export function renderSpot(ev, now = new Date()) {
  return `<article class="spot ${prizeTypeClass(prizeTypeOf(ev))}" data-id="${escapeHtml(ev.id)}">
  <div class="spot-top">${ddayChip(ev, now)}<span class="spot-org">${escapeHtml(ev.organizer)}</span></div>
  <h3 class="spot-title"><button type="button" class="title-btn" data-open="${escapeHtml(ev.id)}">${escapeHtml(ev.title)}</button></h3>
  <p class="spot-prize">${escapeHtml(ev.prize || '원문 확인')}</p>
  <p class="spot-meta">${escapeHtml(entryTypeOf(ev))} · 마감 ${escapeHtml(fmtDate(ev.end))}</p>
</article>`;
}

export function renderDetail(ev, opts = {}) {
  const now = opts.now || new Date();
  const saved = opts.saved instanceof Set ? opts.saved.has(ev.id) : Boolean(opts.saved && opts.saved[ev.id]);
  const done = opts.done instanceof Set ? opts.done.has(ev.id) : Boolean(opts.done && opts.done[ev.id]);
  const steps = ev.steps && ev.steps.length ? ev.steps : [];
  const winners = winnersOf(ev);
  const announce = announceOf(ev);
  const left = dday(ev.end, now);
  return `<div class="sheet ${prizeTypeClass(prizeTypeOf(ev))}">
  <div class="sheet-head">
    <div class="chips">
      <span class="chip ${catClass(ev.category)}">${escapeHtml(ev.category)}</span>
      <span class="chip chip-entry">${escapeHtml(entryTypeOf(ev))}</span>
      ${prizeTypeOf(ev) === '기타' ? '' : `<span class="chip chip-prize ${prizeTypeClass(prizeTypeOf(ev))}">${escapeHtml(prizeTypeOf(ev))}</span>`}
      ${ddayChip(ev, now)}
    </div>
    <h2 id="detail-title">${escapeHtml(ev.title)}</h2>
    <p class="sheet-org">${escapeHtml(ev.organizer)}</p>
  </div>
  <div class="facts">
    <div><span>응모 기간</span><b>${escapeHtml(fmtPeriod(ev) || '원문 확인')}</b></div>
    <div><span>당첨 인원</span><b>${escapeHtml(winners || '원문 확인')}</b></div>
    <div><span>발표일</span><b>${escapeHtml(announce || '원문 공고 확인')}</b></div>
    <div><span>응모 형태</span><b>${escapeHtml(entryTypeOf(ev))}</b></div>
    <div><span>경품 유형</span><b>${escapeHtml(prizeTypeOf(ev) === '기타' ? '원문 확인' : prizeTypeOf(ev))}</b></div>
    <div><span>참여 대상</span><b>${escapeHtml(ev.target || '제한 없음(원문 확인)')}</b></div>
  </div>
  <section class="prize-box">
    <h3>경품·시상</h3>
    <p>${escapeHtml(ev.prize || '원문 확인')}</p>
  </section>
  <section class="step-box">
    <h3>단계별 응모 방법</h3>
    ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : `<p class="muted-line">${escapeHtml(ev.howTo || '원문 안내를 확인하세요.')}</p>`}
  </section>
  ${ev.cautions ? `<section class="caution-box"><h3>유의사항</h3><p>${escapeHtml(ev.cautions)}</p></section>` : ''}
  <div class="detail-actions">
    <a class="btn btn-primary" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">주최 공식 원문 열기 ↗</a>
    <button type="button" class="btn btn-ghost" data-copy="${escapeHtml(ev.url)}">링크 복사</button>
  </div>
  <div class="detail-toggles">
    <button type="button" class="toggle-btn fav${saved ? ' is-on' : ''}" data-fav="${escapeHtml(ev.id)}" aria-pressed="${saved ? 'true' : 'false'}">${saved ? '♥ 찜함' : '♡ 찜하기'}</button>
    <button type="button" class="toggle-btn done${done ? ' is-on' : ''}" data-done="${escapeHtml(ev.id)}" aria-pressed="${done ? 'true' : 'false'}">${done ? '✓ 참여 완료' : '참여 완료로 표시'}</button>
  </div>
  <p class="detail-note">${left >= 0 ? `마감까지 ${left}일 · ` : ''}경품·일정은 주최 측 사정으로 바뀔 수 있습니다. 응모 전 주최 공식 공고를 다시 확인하세요. 확인 ${escapeHtml(ev.verifiedAt || '')} · ${escapeHtml(ev.sourceLabel || '공식 페이지')}</p>
</div>`;
}
