#!/usr/bin/env node
// 수집 파서 · 데이터 · 빌드 산출물 · 화면 로직을 검사합니다. 외부 네트워크는 쓰지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dday, statusOf, ddayLabel, filterEvents, sortEvents, renderCard, renderDetail, todayKST, escapeHtml } from '../src/lib.mjs';
import { parseEventhouse, parseMediahub, parseModu, parseTouredu } from './collect.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const today = todayKST();
let pass = 0;
const fails = [];

function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* 1. 데이터 */
console.log('\n[1] 데이터 검증');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
ok('항목 15건 이상', data.length >= 15, `${data.length}건`);
const ids = new Set(data.map((e) => e.id));
ok('id 중복 없음', ids.size === data.length);
const required = ['id', 'title', 'organizer', 'category', 'type', 'end', 'prize', 'howTo', 'url'];
const missing = data.flatMap((e) => required.filter((k) => !String(e[k] || '').trim()).map((k) => `${e.id}:${k}`));
ok('필수 필드 모두 채움', missing.length === 0, missing.slice(0, 5).join(', '));
ok('마감일이 모두 오늘(2026-11-25) 이후', data.every((e) => e.end >= '2026-11-25'), data.filter((e) => e.end < '2026-11-25').map((e) => e.id).join(', '));
ok('마감일 형식 YYYY-MM-DD', data.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.end)));
ok('분류 값이 정해진 3종', data.every((e) => ['정부·지자체', '공공기관', '기업'].includes(e.category)));
ok('유형 값이 정해진 3종', data.every((e) => ['경품·이벤트', '퀴즈', '공모전'].includes(e.type)));
ok('원문 URL https 형식', data.every((e) => /^https?:\/\//.test(e.url)), data.filter((e) => !/^https?:\/\//.test(e.url)).map((e) => e.id).join(', '));
const cats = new Set(data.map((e) => e.category));
const types = new Set(data.map((e) => e.type));
ok('정부·지자체/공공기관/기업 모두 포함', cats.size === 3, [...cats].join(', '));
ok('경품·이벤트/퀴즈/공모전 모두 포함', types.size === 3, [...types].join(', '));
const soon = data.filter((e) => dday(e.end) <= 7).length;
ok('마감임박(D-7) 항목 존재', soon > 0, `${soon}건`);

/* 2. 수집 파서 (고정 HTML 조각) */
console.log('\n[2] 수집 파서');
const ehHtml = `<div class='list_row'><div class='list_no'>1</div><div class='list_cates'>설문/투표 </div><div class='list_subject'><img> [<strong>대구광역시</strong>] 폭염 대응 시민 의견조사하고 커피 받자 이벤트!! <sup>N</sup> <sup>100</sup></div><div class='list_day'>12/02</div></div><div class='list_detail'><div class='detail_td'><div class='td_left' >ㆍ주최회사</div><div class='td_r td_name_r'><a href='./fgo.php?fnum=1&go=1'>대구광역시 </a></div></div><div class='detail_td'><div class='td_left' >ㆍ응모형태</div><div class='td_r td_g'>설문/투표</div></div><div class='detail_td'><div class='td_left'>ㆍ경품내역</div><div class='td_r td_g'>커피 기프티콘-100명</div></div><div class='detail_td'><div class='td_left'>ㆍ응모기간</div><div class='td_rd'> 2026-11-20 ~ 2026-12-02 24 :00</div></div><div class='detail_td'><div class='td_left'>ㆍ응모방법</div><div class='td_rd'><font>① 폭염 대응 시민 의견조사 참여</font></div></div></div>`;
const eh = parseEventhouse(ehHtml, { url: 'https://www.eventhouse.kr/site/website.php', category: '공공기관' });
ok('이벤트하우스: 1건 파싱', eh.length === 1, String(eh.length));
ok('이벤트하우스: 주최·제목·기간·경품', eh[0] && eh[0].organizer === '대구광역시' && eh[0].title === '폭염 대응 시민 의견조사하고 커피 받자' && eh[0].end === '2026-12-02' && eh[0].prize.includes('커피'), JSON.stringify(eh[0] || {}));

const mhHtml = `<div class="slide"><a href="/gongmo/2000791"><div class="info"><p class="tit ellipsis_66">2026 내가 소개하는 서울 숏폼 공모전</p><p class="date">2026.11.09. ~ 2026.11.27.</p><p class="type"><span>영상 콘텐츠</span></p></div></a></div>`;
const mh = parseMediahub(mhHtml, { url: 'https://mediahub.seoul.go.kr/competition/competitionList.do', category: '정부·지자체' });
ok('서울 공모전: 1건 파싱', mh.length === 1);
ok('서울 공모전: 제목·기간·상세 URL', mh[0] && mh[0].start === '2026-11-09' && mh[0].end === '2026-11-27' && mh[0].url.endsWith('/gongmo/2000791'), JSON.stringify(mh[0] || {}));

const moduHtml = `<li class="thm_card on"><a class="tabBlock" href="/front/qustnrNew/qustnrNewFrontView.do?menu_id=421&qustnr_id=abc"><div class="ac_cont"><p class="ac_period"><strong>2026-11-25 ~ 2026-12-11</strong></p><p class="ac_title">【해양수산부】&nbsp;수산물 인증제도 QUIZ 이벤트</p><p class="ac_instt">해양수산부 국립수산물품질관리원</p></div></a></li>`;
const md = parseModu(moduHtml, { url: 'https://modu.go.kr/front/qustnrNew/qustnrNewList.do', category: '정부·지자체' });
ok('모두의 광장: 1건 파싱', md.length === 1);
ok('모두의 광장: 기관 분리·퀴즈 분류', md[0] && md[0].organizer === '해양수산부' && md[0].type === '퀴즈', JSON.stringify(md[0] || {}));
const noPrize = parseModu(`<li class="thm_card"><a href="/front/qustnrNew/qustnrNewFrontView.do?qustnr_id=x"><p class="ac_period"><strong>2026-11-24 ~ 2026-11-30</strong></p><p class="ac_title">【산림청】&nbsp;어떤 정보를 알고 싶으신가요?</p></a></li>`, { url: 'https://modu.go.kr/', category: '정부·지자체' });
ok('모두의 광장: 경품성 아닌 설문 제외', noPrize.length === 0);

const toureduHtml = `<a href="/home/support/promotions/prgs/14567?x=1"><span>[이벤트] 2026년 관광e배움터 하반기 수료왕</span><span>2026.11.18 ~ 2026.12.13</span></a>`;
const te = parseTouredu(toureduHtml, { url: 'https://touredu.visitkorea.or.kr/', category: '공공기관' });
ok('관광e배움터: 1건 파싱', te.length === 1);
ok('관광e배움터: 기간', te[0] && te[0].start === '2026-11-18' && te[0].end === '2026-12-13', JSON.stringify(te[0] || {}));

/* 3. 화면 로직 */
console.log('\n[3] 검색·필터·정렬·렌더링');
const fixed = new Date('2026-11-25T09:00:00+09:00');
ok('D-day 계산 (11-25 → 12-02 = D-7)', dday('2026-12-02', fixed) === 7);
ok('D-DAY 표시', ddayLabel({ end: '2026-11-25' }, fixed) === 'D-DAY');
ok('지난 이벤트는 종료', statusOf({ end: '2026-11-20' }, fixed) === '종료');
ok('마감임박 판정', statusOf({ end: '2026-12-01' }, fixed) === '마감임박' && statusOf({ end: '2026-12-20' }, fixed) === '진행중');

const sample = [
  { id: 'a', title: '모두의 광장 개편 이벤트', organizer: '행정안전부', category: '정부·지자체', type: '경품·이벤트', end: '2026-12-02', prize: '온누리상품권 5만원', howTo: '설문', tags: ['상품권'], addedAt: '2026-11-25T08:40:00+09:00', url: 'https://example.com/a' },
  { id: 'b', title: '서울 숏폼 공모전', organizer: '서울특별시', category: '정부·지자체', type: '공모전', end: '2026-11-27', prize: '대상 300만원', howTo: '영상 제출', tags: ['영상'], addedAt: '2026-11-24T08:40:00+09:00', url: 'https://example.com/b' },
  { id: 'c', title: '현대차 룰렛', organizer: '현대자동차', category: '기업', type: '퀴즈', end: '2026-12-21', prize: '에어팟 5', howTo: '퀴즈', tags: ['에어팟'], addedAt: '2026-11-25T09:10:00+09:00', url: 'https://example.com/c' },
];
ok('키워드 검색: 경품 텍스트', filterEvents(sample, { q: '상품권' }, fixed).map((e) => e.id).join('') === 'a');
ok('키워드 검색: 태그', filterEvents(sample, { q: '에어팟' }, fixed).map((e) => e.id).join('') === 'c');
ok('주최 필터', filterEvents(sample, { category: '기업' }, fixed).length === 1);
ok('유형 필터', filterEvents(sample, { type: '공모전' }, fixed).map((e) => e.id).join('') === 'b');
ok('마감임박 필터(D-7)', filterEvents(sample, { status: '마감임박' }, fixed).map((e) => e.id).join('') === 'ab');
ok('마감임박순 정렬', sortEvents(sample, 'deadline').map((e) => e.id).join('') === 'bac');
ok('최신등록순 정렬', sortEvents(sample, 'recent').map((e) => e.id).join('') === 'cab');
const expired = [{ ...sample[1], end: '2026-11-20' }];
ok('지난 이벤트는 목록에서 제외', filterEvents(expired, {}, fixed).length === 0);

const card = renderCard(sample[1], fixed);
ok('카드에 D-day 배지', card.includes('D-2') && card.includes('badge-hot'));
ok('카드에 경품·주최·원문 링크', card.includes('대상 300만원') && card.includes('서울특별시') && card.includes('href="https://example.com/b"'));
ok('카드에 상세 열기 버튼', card.includes('data-open="b"'));
const detail = renderDetail(sample[0], fixed);
ok('상세에 기간·경품·참여 방법·원문', detail.includes('2026.11.18') === false && detail.includes('온누리상품권 5만원') && detail.includes('설문') && detail.includes('원문 페이지에서 응모하기'));
ok('HTML 이스케이프', escapeHtml('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');

/* 4. 빌드 산출물 */
console.log('\n[4] 빌드 산출물');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_URL: 'https://event-pick.pages.dev', TODAY: '2026-11-25' }, stdio: 'pipe' });
const pub = path.join(ROOT, 'public');
ok('public/index.html 생성', fs.existsSync(path.join(pub, 'index.html')));
ok('public/data/events.json 생성', fs.existsSync(path.join(pub, 'data/events.json')));
ok('sitemap.xml 생성', fs.existsSync(path.join(pub, 'sitemap.xml')));
ok('robots.txt 생성', fs.existsSync(path.join(pub, 'robots.txt')));
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
ok('목록에 검색 입력창', indexHtml.includes('id="q"'));
ok('목록에 주최 필터 4개', (indexHtml.match(/data-category=/g) || []).length === 4);
ok('목록에 유형 필터 4개', (indexHtml.match(/data-type=/g) || []).length === 4);
ok('목록에 정렬 선택', indexHtml.includes('id="sort"') && indexHtml.includes('마감임박순') && indexHtml.includes('최신등록순'));
ok('목록에 상태 필터(D-7)', indexHtml.includes('마감임박 (D-7 이내)'));
ok('example.pages.dev 자리표시자 없음', !indexHtml.includes('example.pages.dev'));
ok('실제 배포 URL 반영', indexHtml.includes('https://event-pick.pages.dev'));

const sitemap = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
const locs = (sitemap.match(/<loc>/g) || []).length;
ok('sitemap URL 수 = 목록+소개+상세', locs === data.length + 2, `${locs}개`);
const robots = fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8');
ok('robots에 sitemap 주소', robots.includes('https://event-pick.pages.dev/sitemap.xml'));

const built = JSON.parse(fs.readFileSync(path.join(pub, 'data/events.json'), 'utf8'));
ok('빌드 데이터에 dday·status 계산', built.events.every((e) => Number.isFinite(e.dday) && ['진행중', '마감임박'].includes(e.status)));
const detailFiles = fs.readdirSync(path.join(pub, 'e'));
ok('상세 페이지 수 일치', detailFiles.length === data.length, `${detailFiles.length}개`);
const oneDetail = fs.readFileSync(path.join(pub, 'e', `${data[0].id}.html`), 'utf8');
ok('상세 페이지에 JSON-LD Event', oneDetail.includes('"@type":"Event"'));
ok('상세 페이지에 원문 링크', oneDetail.includes(escapeHtml(data[0].url)));

console.log(`\n결과: ${pass}개 통과, ${fails.length}개 실패`);
if (fails.length) {
  console.log('\n실패 목록:\n' + fails.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
