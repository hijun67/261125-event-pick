// 검색·필터·분류·D-day 계산과 카드/목록/상세 렌더링 — 브라우저(app.js)와 테스트(node)·빌드가 함께 씁니다.

export const CATEGORIES = ['정부·지자체', '공공기관', '기업'];
export const TYPES = ['경품·이벤트', '퀴즈', '공모전'];
export const ENTRY_TYPES = ['단순응모', '설문·투표', '퀴즈·퍼즐', '댓글·참여인증', '공모·제출'];
export const PRIZE_TYPES = ['상품권·페이', '기프티콘', '현물·전자기기', '상금·시상'];
export const STATUS_FILTERS = ['전체', '진행중', '마감임박', '내 찜·참여완료'];
export const CHANNELS = ['웹사이트·폼', '유튜브', '인스타그램', '블로그', '앱·기타'];
export const SCALES = ['~30명', '31~99명', '100명+'];
export const DIFFICULTIES = ['1분 간편', '퀴즈·설문', '인증·공모'];
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

/** 경품·당첨 인원 문구에서 총 당첨자 수를 읽습니다. '총 N명'이 있으면 그 값을, 없으면 표기된 인원을 모두 더합니다. */
export function winnerCount(ev = {}) {
  const prize = String(ev.prize || '');
  const total = prize.match(/총\s*([\d,]{1,7})\s*명/);
  if (total) return Number(total[1].replace(/,/g, ''));
  const marks = prize.match(/[\d,]{1,7}\s*명/g) || [];
  const sum = marks.reduce((acc, m) => acc + Number(m.replace(/[^\d]/g, '')), 0);
  return sum > 0 ? sum : NaN;
}

/** 당첨 규모 구간: ~30명 / 31~99명 / 100명+. 인원을 확인할 수 없으면 빈 문자열 */
export function scaleOf(ev = {}) {
  const n = winnerCount(ev);
  if (!Number.isFinite(n)) return '';
  if (n <= 30) return '~30명';
  if (n <= 99) return '31~99명';
  return '100명+';
}

/** 응모가 이뤄지는 채널. 자료에 channel이 있으면 그 값을 우선합니다. */
export function channelOf(ev = {}) {
  if (ev.channel && CHANNELS.includes(ev.channel)) return ev.channel;
  const text = `${ev.title || ''} ${ev.howTo || ''} ${(ev.steps || []).join(' ')} ${(ev.tags || []).join(' ')}`;
  if (/유튜브|youtube|채널\s*구독|영상\s*시청/i.test(text)) return '유튜브';
  if (/블로그|blog|포스팅/i.test(text)) return '블로그';
  if (/인스타|instagram|해시태그|릴스/i.test(text)) return '인스타그램';
  if (/앱|어플|애플리케이션|출석|룰렛|QR|전시장|매장|스탬프/i.test(text)) return '앱·기타';
  return '웹사이트·폼';
}

/** 참여 난이도: 1분 간편 / 퀴즈·설문 / 인증·공모. 자료에 difficulty가 있으면 그 값을 우선합니다. */
export function difficultyOf(ev = {}) {
  if (ev.difficulty && DIFFICULTIES.includes(ev.difficulty)) return ev.difficulty;
  const text = `${ev.title || ''} ${ev.howTo || ''} ${(ev.steps || []).join(' ')}`;
  if (/퀴즈|퍼즐|초성|정답|\bOX\b/i.test(text)) return '퀴즈·설문';
  if (/설문|투표|만족도|의견\s*조사|시민\s*조사/.test(text)) return '퀴즈·설문';
  if (ev.type === '공모전' || /공모|작품|출품|업로드|제출|영상\s*제작|구매|개통|가입|방문|예약|리뷰|후기|캡처|인증|스탬프/.test(text)) return '인증·공모';
  return '1분 간편';
}

/** 저장된 단계가 없으면 응모 방법의 화살표·번호 표기를 단계로 나눕니다. */
export function stepsOf(ev = {}) {
  if (Array.isArray(ev.steps) && ev.steps.length) return ev.steps.slice(0, 6);
  const how = String(ev.howTo || '');
  if (how.includes('→')) {
    const parts = how.split('→').map((x) => x.replace(/^[\s①-⑩\d.)]+/, '').trim()).filter((x) => x.length > 1);
    if (parts.length >= 2) return parts.slice(0, 6);
  }
  return [];
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
  const {
    category = '전체', entry = '전체', prize = '전체', status = '전체',
    channel = '전체', scale = '전체', difficulty = '전체',
  } = filters;
  const saved = filters.saved instanceof Set ? filters.saved : new Set(filters.saved || []);
  const done = filters.done instanceof Set ? filters.done : new Set(filters.done || []);
  return events.filter((ev) => {
    if (isExpired(ev, now)) return false;
    if (category !== '전체' && ev.category !== category) return false;
    if (entry !== '전체' && entryTypeOf(ev) !== entry) return false;
    if (prize !== '전체' && prizeTypeOf(ev) !== prize) return false;
    if (channel !== '전체' && channelOf(ev) !== channel) return false;
    if (scale !== '전체' && scaleOf(ev) !== scale) return false;
    if (difficulty !== '전체' && difficultyOf(ev) !== difficulty) return false;
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
    <a class="btn btn-primary btn-sm" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" aria-label="주최 공식 원문 열기">원문 ↗</a>
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
  const steps = stepsOf(ev);
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
    <div><span>응모 채널</span><b>${escapeHtml(channelOf(ev))}</b></div>
    <div><span>참여 난이도</span><b>${escapeHtml(difficultyOf(ev))}</b></div>
    <div><span>참여 대상</span><b>${escapeHtml(ev.target || '원문 공고 확인')}</b></div>
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
  <div class="detail-actions" role="group" aria-label="이벤트 빠른 실행">
    <a class="btn btn-primary btn-compact" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" aria-label="주최 공식 원문 새 창으로 열기">원문 <span aria-hidden="true">↗</span></a>
    <button type="button" class="act-btn" data-ics="${escapeHtml(ev.id)}" title="마감·발표일을 캘린더 파일(.ics)로 저장" aria-label="캘린더 일정 추가"><span aria-hidden="true">📅</span> 일정</button>
    <button type="button" class="act-btn" data-copy="${escapeHtml(ev.url)}" title="이벤트 링크 복사" aria-label="링크 복사"><span aria-hidden="true">🔗</span> 링크</button>
    <button type="button" class="act-btn fav${saved ? ' is-on' : ''}" data-fav="${escapeHtml(ev.id)}" aria-pressed="${saved ? 'true' : 'false'}" aria-label="찜하기"><span aria-hidden="true">${saved ? '♥' : '♡'}</span> ${saved ? '찜함' : '찜'}</button>
    <button type="button" class="act-btn done${done ? ' is-on' : ''}" data-done="${escapeHtml(ev.id)}" aria-pressed="${done ? 'true' : 'false'}" aria-label="참여 완료로 표시"><span aria-hidden="true">✓</span> ${done ? '완료' : '참여'}</button>
  </div>
  <p class="detail-note">${left >= 0 ? `마감까지 ${left}일 · ` : ''}경품·일정은 주최 측 사정으로 바뀔 수 있습니다. 응모 전 주최 공식 공고를 다시 확인하세요. 확인 ${escapeHtml(ev.verifiedAt || '')} · ${escapeHtml(ev.sourceLabel || '공식 페이지')}</p>
</div>`;
}

/* ---------- 캘린더(.ics) ---------- */
function icsEscape(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 'YYYY-MM-DD' + 'HH:MM'(KST) → UTC Date. 형식이 틀리면 null */
function kstToDate(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return null;
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(timeStr || '') ? timeStr : '09:00').split(':').map(Number);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm) - 9 * 60 * 60 * 1000);
}

const icsTime = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function foldIcs(line) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

/** 이벤트 하나를 마감일(+발표일) 일정으로 담은 .ics 문자열로 만듭니다. */
export function icsFor(ev = {}, now = new Date()) {
  const endTime = /^\d{2}:\d{2}$/.test(ev.endTime || '') ? ev.endTime : '18:00';
  const start = kstToDate(ev.end, endTime);
  if (!start) return '';
  const stamp = icsTime(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventPick//event-pick.pages.dev//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}-deadline@event-pick.pages.dev`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(new Date(start.getTime() + 30 * 60 * 1000))}`,
    `SUMMARY:${icsEscape(`[마감] ${ev.title || '경품 이벤트'}`)}`,
    `DESCRIPTION:${icsEscape([
      `${ev.organizer || ''} · ${ev.category || ''}`.trim(),
      `응모 마감 ${fmtDate(ev.end)} ${endTime}`,
      `경품 ${ev.prize || '원문 확인'}`,
      `원문 ${ev.url || ''}`,
    ].join('\n'))}`,
    `URL:${ev.url || ''}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`${ev.title || '이벤트'} 마감 2시간 전`)}`,
    'END:VALARM',
    'END:VEVENT',
  ];

  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.announceDate || '')) {
    const aStart = kstToDate(ev.announceDate, '10:00');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}-announce@event-pick.pages.dev`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(aStart)}`,
      `DTEND:${icsTime(new Date(aStart.getTime() + 30 * 60 * 1000))}`,
      `SUMMARY:${icsEscape(`[당첨 발표] ${ev.title || '경품 이벤트'}`)}`,
      `DESCRIPTION:${icsEscape(`${ev.organizer || ''} 당첨자 발표일 · 원문 ${ev.url || ''}`)}`,
      `URL:${ev.url || ''}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcs).join('\r\n')}\r\n`;
}
