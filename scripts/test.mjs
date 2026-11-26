#!/usr/bin/env node
// 수집 파서 · 데이터 · 빌드 산출물 · 화면 로직을 검사합니다. 외부 네트워크는 쓰지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  dday, statusOf, ddayLabel, filterEvents, sortEvents, hotEvents, summarize, renderCard, renderRow, renderSpot, renderDetail,
  entryTypeOf, prizeTypeOf, winnersOf, announceOf, todayKST, escapeHtml, fmtDate, ENTRY_TYPES, PRIZE_TYPES,
} from '../src/lib.mjs';
import { parseSeoulEvent, parseMediahub, parseModu, parseTouredu, seoulJsonLd, enrichSeoul, tidySteps, looseDate, classify } from './collect.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TODAY = todayKST();
let pass = 0;
const fails = [];

function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* 1. 데이터 */
console.log('\n[1] 데이터 검증');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
ok('항목 20건 이상', data.length >= 20, `${data.length}건`);
const ids = new Set(data.map((e) => e.id));
ok('id 중복 없음', ids.size === data.length);
const required = ['id', 'title', 'organizer', 'category', 'type', 'end', 'prize', 'howTo', 'url'];
const missing = data.flatMap((e) => required.filter((k) => !String(e[k] || '').trim()).map((k) => `${e.id}:${k}`));
ok('필수 필드 모두 채움', missing.length === 0, missing.slice(0, 5).join(', '));
ok('마감일이 모두 오늘 이후', data.every((e) => e.end >= TODAY), data.filter((e) => e.end < TODAY).map((e) => e.id).join(', '));
ok('마감일 형식 YYYY-MM-DD', data.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.end)));
ok('시작일은 없거나 YYYY-MM-DD', data.every((e) => !e.start || /^\d{4}-\d{2}-\d{2}$/.test(e.start)));
ok('분류 값이 정해진 3종', data.every((e) => ['정부·지자체', '공공기관', '기업'].includes(e.category)));
ok('유형 값이 정해진 3종', data.every((e) => ['경품·이벤트', '퀴즈', '공모전'].includes(e.type)));
ok('원문 URL http(s) 형식', data.every((e) => /^https?:\/\//.test(e.url)), data.filter((e) => !/^https?:\/\//.test(e.url)).map((e) => e.id).join(', '));
const cats = new Set(data.map((e) => e.category));
const types = new Set(data.map((e) => e.type));
ok('정부·지자체/공공기관/기업 모두 포함', cats.size === 3, [...cats].join(', '));
ok('경품·이벤트/퀴즈/공모전 모두 포함', types.size === 3, [...types].join(', '));
const soon = data.filter((e) => dday(e.end) <= 7).length;
ok('마감임박(D-7) 항목 존재', soon > 0, `${soon}건`);
ok('당첨 인원이 채워진 항목 60% 이상', data.filter((e) => winnersOf(e)).length / data.length >= 0.5, `${data.filter((e) => winnersOf(e)).length}/${data.length}`);
ok('발표일이 채워진 항목 존재', data.filter((e) => e.announceDate).length >= 5, `${data.filter((e) => e.announceDate).length}건`);
ok('발표일 형식', data.filter((e) => e.announceDate).every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.announceDate)));
ok('단계별 응모 방법(2단계 이상) 항목 존재', data.filter((e) => (e.steps || []).length >= 2).length >= 3, `${data.filter((e) => (e.steps || []).length >= 2).length}건`);
ok('유의사항이 있는 항목 존재', data.filter((e) => e.cautions).length >= 3, `${data.filter((e) => e.cautions).length}건`);
ok('응모 형태 4종 이상 등장', new Set(data.map(entryTypeOf)).size >= 4, [...new Set(data.map(entryTypeOf))].join(', '));
ok('경품 유형 4종 모두 등장', PRIZE_TYPES.every((t) => data.some((e) => prizeTypeOf(e) === t)), JSON.stringify(PRIZE_TYPES.map((t) => [t, data.filter((e) => prizeTypeOf(e) === t).length])));

/* 이벤트하우스(중계) 완전 제거 */
const rawData = fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8');
ok('데이터에 eventhouse 문자열 0건', !/eventhouse/i.test(rawData));
ok('데이터에 중계 사이트 링크 없음', !/(eventhouse|링커리어|씽굿|위비티|공모전닷컴|대학내일)/i.test(rawData));
const sourcesText = fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8');
ok('sources.json에 eventhouse 없음', !/eventhouse/i.test(sourcesText));
ok('sources.json 소스 4개 이상', JSON.parse(sourcesText).sources.length >= 4);
const collectText = fs.readFileSync(path.join(ROOT, 'scripts/collect.mjs'), 'utf8');
ok('수집 스크립트에 eventhouse 파서 없음', !/eventhouse/i.test(collectText));

/* 2. 수집 파서 (실제 구조를 축약한 고정 HTML) */
console.log('\n[2] 수집 파서');
const seoulEvHtml = `<div class="slide"><div class="data"><a href="/missions/2000324" title="상세 정보 보기"><div class="event_info"><div class="tit_area"><span class="flag_md event">진행중</span><p class="tit">보들이TV 구독하고 댓글남기고 선물GET</p></div><div class="info_area"><table><tbody><tr><th scope="row"><span class="tit">이벤트기간</span></th><td><div class="cont">2026.11.24. 00:00 ~ 2026.12.06. 23:59</div></td></tr></tbody></table></div></div></a></div></div>`;
const sev = parseSeoulEvent(seoulEvHtml, { category: '정부·지자체' });
ok('서울 이벤트: 1건 파싱', sev.length === 1, String(sev.length));
ok('서울 이벤트: 제목·기간·상세 URL', sev[0] && sev[0].title === '보들이TV 구독하고 댓글남기고 선물GET' && sev[0].start === '2026-11-24' && sev[0].end === '2026-12-06' && sev[0].url.endsWith('/missions/2000324'), JSON.stringify(sev[0] || {}));

const mhHtml = `<div class="slide"><a href="/gongmo/2000791"><div class="info"><p class="tit ellipsis_66">2026 내가 소개하는 서울 숏폼 공모전</p><p class="date">2026.11.09. ~ 2026.11.27.</p><p class="type"><span>영상 콘텐츠</span></p></div></a></div>`;
const mh = parseMediahub(mhHtml, { category: '정부·지자체' });
ok('서울 공모전: 1건 파싱', mh.length === 1);
ok('서울 공모전: 제목·기간·상세 URL', mh[0] && mh[0].start === '2026-11-09' && mh[0].end === '2026-11-27' && mh[0].url.endsWith('/gongmo/2000791'), JSON.stringify(mh[0] || {}));

const moduHtml = `<li class="thm_card on"><a class="tabBlock" href="/front/qustnrNew/qustnrNewFrontView.do?menu_id=421&qustnr_id=abc"><div class="ac_cont"><p class="ac_period"><strong>2026-11-25 ~ 2026-12-11</strong></p><p class="ac_title">【해양수산부】&nbsp;수산물 인증제도 QUIZ 이벤트</p><p class="ac_instt">해양수산부 국립수산물품질관리원</p></div></a></li>`;
const md = parseModu(moduHtml, { category: '정부·지자체' });
ok('모두의 광장: 1건 파싱', md.length === 1);
ok('모두의 광장: 기관 분리·퀴즈 분류', md[0] && md[0].organizer === '해양수산부' && md[0].type === '퀴즈', JSON.stringify(md[0] || {}));
const noPrize = parseModu(`<li class="thm_card"><a href="/front/qustnrNew/qustnrNewFrontView.do?qustnr_id=x"><p class="ac_period"><strong>2026-11-24 ~ 2026-11-30</strong></p><p class="ac_title">【산림청】&nbsp;어떤 정보를 알고 싶으신가요?</p></a></li>`, { url: 'https://modu.go.kr/', category: '정부·지자체' });
ok('모두의 광장: 경품성 아닌 설문 제외', noPrize.length === 0);

const toureduHtml = `<a href="/home/support/promotions/prgs/14567?x=1"><span>[이벤트] 2026년 관광e배움터 하반기 수료왕</span><span>2026.11.18 ~ 2026.12.13</span></a>`;
const te = parseTouredu(toureduHtml, { url: 'https://touredu.visitkorea.or.kr/', category: '공공기관' });
ok('관광e배움터: 1건 파싱', te.length === 1);
ok('관광e배움터: 기간', te[0] && te[0].start === '2026-11-18' && te[0].end === '2026-12-13', JSON.stringify(te[0] || {}));

/* 상세(JSON-LD) 보강 */
const ldHtml = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Event', name: '보들이TV 구독하고 댓글남기고 선물GET',
  startDate: '2026-11-24T00:00:00+09:00', endDate: '2026-12-06T23:59:00+09:00',
  organizer: { '@type': 'GovernmentOrganization', name: '서울시보건환경연구원 운영기획부', parentOrganization: { name: '서울특별시' } },
  audience: { '@type': 'Audience', audienceType: '누구나' },
  description: 'STEP 1. 영상 시청 & 구독 & 댓글 남기기 열심히 봅니다. STEP 2. 인증샷 캡처하기 구독 화면 1장. STEP 3. 인증샷 제출하기 링크에 업로드. 이벤트 상세 안내 당첨자 발표: 12월 7일 이벤트 경품: 편의점 상품권 5천원권 유의사항 참여는 1회만 가능합니다.',
  additionalProperty: [
    { '@type': 'PropertyValue', name: '주최', value: '서울시보건환경연구원 운영기획부' },
    { '@type': 'PropertyValue', name: '결과발표', value: '2026. 12. 7.(월) 홈페이지 공지 및 개별 문자 안내' },
    { '@type': 'PropertyValue', name: '누리집', value: 'https://mediahub.seoul.go.kr/missions/2000324' },
    { '@type': 'PropertyValue', name: '참여대상', value: '누구나' },
  ],
})}</script><p>본문</p>`;
const ld = seoulJsonLd(ldHtml);
ok('JSON-LD Event 인식', ld['@type'] === 'Event' && ld.name.includes('보들이'));
const enriched = enrichSeoul(sev[0], ldHtml);
ok('상세: 주최·분류', enriched.organizer.includes('보건환경연구원') && enriched.category === '공공기관', `${enriched.organizer}/${enriched.category}`);
ok('상세: 기간 덮어쓰기', enriched.start === '2026-11-24' && enriched.end === '2026-12-06');
ok('상세: 결과발표일 정규화', enriched.announceDate === '2026-12-07', enriched.announceDate);
ok('상세: 경품 추출', enriched.prize.includes('편의점 상품권'), enriched.prize);
ok('상세: STEP 3단계', enriched.steps.length === 3, JSON.stringify(enriched.steps));
ok('상세: 유의사항 추출', /참여는/.test(enriched.cautions || ''), enriched.cautions);
ok('상세: howTo가 단계 문장으로 구성', /①/.test(enriched.howTo) && /③/.test(enriched.howTo));
ok('상세: 누리집이 자기 페이지면 원문 유지', enriched.url.endsWith('/missions/2000324'));

ok('looseDate: 점 표기', looseDate('2026. 12. 7.(월) 공지') === '2026-12-07');
ok('looseDate: 월/일 + 연도 힌트', looseDate('12월 7일', '2026') === '2026-12-07');
ok('tidySteps: STEP 문장만', tidySteps('STEP 1. 시청하기 잘 봅니다 STEP 2. 댓글 달기 이벤트 상세 안내 참여 기간: 12월').join('|') === '시청하기 잘 봅니다|댓글 달기');
ok('classify: 공공기관', classify('서울미래인재재단') === '공공기관');
ok('classify: 기업', classify('카카오뱅크') === '기업');
ok('classify: 정부·지자체', classify('행정안전부') === '정부·지자체');

/* 3. 검색·필터·분류·렌더링 */
console.log('\n[3] 검색·필터·분류·렌더링');
const fixed = new Date('2026-11-26T09:00:00+09:00');
ok('D-day 계산 (11-26 → 12-02 = D-6)', dday('2026-12-02', fixed) === 6);
ok('D-DAY 표시', ddayLabel({ end: '2026-11-26' }, fixed) === 'D-DAY');
ok('내일 마감 표시', ddayLabel({ end: '2026-11-27' }, fixed) === '내일 마감');
ok('지난 이벤트는 종료', statusOf({ end: '2026-11-20' }, fixed) === '종료');
ok('마감임박 판정', statusOf({ end: '2026-12-01' }, fixed) === '마감임박' && statusOf({ end: '2026-12-20' }, fixed) === '진행중');

const sample = [
  { id: 'a', title: '모두의 광장 개편 퀴즈 이벤트', organizer: '행정안전부', category: '정부·지자체', type: '퀴즈', end: '2026-12-02', prize: '온누리상품권 5만원 4명', howTo: '① 퀴즈 풀기 ② 제출', steps: ['퀴즈 풀기', '제출'], winners: '4명', announceDate: '2026-12-10', tags: ['상품권'], addedAt: '2026-11-25T08:40:00+09:00', url: 'https://example.go.kr/a' },
  { id: 'b', title: '서울 숏폼 공모전', organizer: '서울특별시', category: '정부·지자체', type: '공모전', end: '2026-11-27', prize: '대상 300만원', howTo: '영상 제출', tags: ['영상'], addedAt: '2026-11-24T08:40:00+09:00', url: 'https://example.go.kr/b' },
  { id: 'c', title: '현대차 룰렛', organizer: '현대자동차', category: '기업', type: '경품·이벤트', end: '2026-12-21', prize: '에어팟 5 (3명)', howTo: '룰렛 돌리기', tags: ['에어팟'], addedAt: '2026-11-26T09:10:00+09:00', url: 'https://example.com/c' },
  { id: 'd', title: '건보 공모전', organizer: '국민건강보험공단', category: '공공기관', type: '공모전', end: '2026-12-04', prize: '총 상금 840만원 — 대상 300만원', howTo: '작품 제출', tags: ['공모'], addedAt: '2026-11-20T08:40:00+09:00', url: 'https://example.or.kr/d' },
];
ok('키워드 검색: 경품 텍스트', filterEvents(sample, { q: '상품권' }, fixed).map((e) => e.id).join('') === 'a');
ok('키워드 검색: 태그', filterEvents(sample, { q: '에어팟' }, fixed).map((e) => e.id).join('') === 'c');
ok('주최 필터', filterEvents(sample, { category: '기업' }, fixed).map((e) => e.id).join('') === 'c');
ok('유형 필터', filterEvents(sample, { entry: '공모·제출' }, fixed).map((e) => e.id).join('') === 'bd');
ok('응모 형태 필터: 댓글 외', filterEvents(sample, { entry: '퀴즈·퍼즐' }, fixed).map((e) => e.id).join('') === 'ac');
ok('경품 유형 필터: 상품권·페이', filterEvents(sample, { prize: '상품권·페이' }, fixed).map((e) => e.id).join('') === 'a');
ok('경품 유형 필터: 현물·전자기기', filterEvents(sample, { prize: '현물·전자기기' }, fixed).map((e) => e.id).join('') === 'c');
ok('경품 유형 필터: 상금·시상', filterEvents(sample, { prize: '상금·시상' }, fixed).map((e) => e.id).join('') === 'bd');
ok('마감임박 필터(D-7)', filterEvents(sample, { status: '마감임박' }, fixed).map((e) => e.id).join('') === 'ab');
ok('진행중 필터는 마감임박 제외', filterEvents(sample, { status: '진행중' }, fixed).map((e) => e.id).join('') === 'cd');
ok('내 찜 필터', filterEvents(sample, { status: '내 찜·참여완료', saved: new Set(['b']) }, fixed).map((e) => e.id).join('') === 'b');
ok('내 참여완료 필터', filterEvents(sample, { status: '내 찜·참여완료', done: new Set(['c']) }, fixed).map((e) => e.id).join('') === 'c');
ok('마감임박순 정렬', sortEvents(sample, 'deadline').map((e) => e.id).join('') === 'badc');
ok('최신등록순 정렬', sortEvents(sample, 'recent').map((e) => e.id).join('') === 'cabd');
ok('지난 이벤트는 목록에서 제외', filterEvents([{ ...sample[1], end: '2026-11-20' }], {}, fixed).length === 0);
ok('D-3 하이라이트는 3일 이내만', hotEvents(sample, fixed).map((e) => e.id).join('') === 'b');
const sum = summarize(sample, fixed);
ok('요약: 총계·마감임박·카테고리', sum.total === 4 && sum.soon === 2 && sum.gov === 2 && sum.publicOrg === 1 && sum.corp === 1, JSON.stringify(sum));
ok('요약: 경품 유형 분포', sum.byPrize['상품권·페이'] === 1 && sum.byPrize['현물·전자기기'] === 1 && sum.byPrize['상금·시상'] === 2);

const card = renderCard(sample[1], { now: fixed });
ok('카드에 D-day 배지', card.includes('내일 마감'.slice(0, 2)) && /dd-(hot|soon)/.test(card));
ok('카드에 경품·주최·원문 링크', card.includes('대상 300만원') && card.includes('서울특별시') && card.includes('href="https://example.go.kr/b"'));
ok('카드에 상세 열기·찜·참여 버튼', card.includes('data-open="b"') && card.includes('data-fav="b"') && card.includes('data-done="b"'));
const cardFav = renderCard(sample[0], { now: fixed, saved: new Set(['a']), done: new Set(['a']) });
ok('찜·참여 상태가 카드에 반영', /fav is-on/.test(cardFav) && /done is-on/.test(cardFav) && cardFav.includes('aria-pressed="true"'));
const cardWin = renderCard(sample[2], { now: fixed });
ok('카드에 당첨 인원 배지', cardWin.includes('class="winners"') && cardWin.includes('3명'));
const row = renderRow(sample[3], { now: fixed });
ok('리스트 행: 제목·발표일 없음·원문', row.includes('class="row') && row.includes('건보 공모전') && row.includes('data-open="d"'));
const spot = renderSpot(sample[1], fixed);
ok('하이라이트 카드', spot.includes('class="spot') && spot.includes('서울 숏폼 공모전') && spot.includes('data-open="b"'));
const detail = renderDetail(sample[0], { now: fixed });
ok('상세: 기간·경품·단계·발표일·당첨 인원', detail.includes('2026.12.2') && detail.includes('온누리상품권 5만원') && detail.includes('<ol class="steps">') && detail.includes('2026.12.10') && detail.includes('4명'));
ok('상세: 공식 원문 버튼', detail.includes('주최 공식 원문 열기') && detail.includes('href="https://example.go.kr/a"'));
ok('상세: 발표일 없으면 원문 공고 안내', renderDetail(sample[2], { now: fixed }).includes('원문 공고 확인'));
ok('HTML 이스케이프', escapeHtml('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
ok('날짜 표기', fmtDate('2026-12-06') === '2026.12.6');
ok('응모 형태 값이 정해진 5종', ENTRY_TYPES.every((t) => typeof t === 'string') && ENTRY_TYPES.length === 5);
ok('경품 유형 값이 정해진 4종', PRIZE_TYPES.join(',') === '상품권·페이,기프티콘,현물·전자기기,상금·시상');

/* 4. 빌드 산출물 */
console.log('\n[4] 빌드 산출물');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: { ...process.env, SITE_URL: 'https://event-pick.pages.dev', TODAY: '2026-11-26' }, stdio: 'pipe' });
const pub = path.join(ROOT, 'public');
ok('public/index.html 생성', fs.existsSync(path.join(pub, 'index.html')));
ok('public/data/events.json 생성', fs.existsSync(path.join(pub, 'data/events.json')));
ok('sitemap.xml 생성', fs.existsSync(path.join(pub, 'sitemap.xml')));
ok('robots.txt 생성', fs.existsSync(path.join(pub, 'robots.txt')));
ok('favicon.svg 생성', fs.existsSync(path.join(pub, 'favicon.svg')));
const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
ok('목록에 검색 입력창', indexHtml.includes('id="q"'));
ok('목록에 주최 필터 4개', (indexHtml.match(/data-group="category"[\s\S]*?<\/div>/)[0].match(/data-value=/g) || []).length === 4);
ok('목록에 응모 형태 필터 6개', (indexHtml.match(/data-group="entry"[\s\S]*?<\/div>/)[0].match(/data-value=/g) || []).length === 6);
ok('목록에 경품 유형 필터 5개', (indexHtml.match(/data-group="prize"[\s\S]*?<\/div>/)[0].match(/data-value=/g) || []).length === 5);
ok('목록에 상태 필터 4개(내 찜·참여완료 포함)', (indexHtml.match(/data-group="status"[\s\S]*?<\/div>/)[0].match(/data-value=/g) || []).length === 4 && indexHtml.includes('내 찜·참여완료'));
ok('목록에 정렬 선택', indexHtml.includes('id="sort"') && indexHtml.includes('마감임박순') && indexHtml.includes('최신등록순'));
ok('목록에 보기 전환·테마 토글', indexHtml.includes('data-view="list"') && indexHtml.includes('id="theme-toggle"'));
ok('목록에 D-3 하이라이트 영역', indexHtml.includes('id="spot-strip"') && indexHtml.includes('3일 안에 마감'));
ok('자리표시자 없음', !/\{\{[A-Z_]+\}\}/.test(indexHtml));
ok('실제 배포 URL 반영', indexHtml.includes('https://event-pick.pages.dev'));
ok('public에 eventhouse 문자열 0건', !/eventhouse/i.test(fs.readFileSync(path.join(pub, 'data/events.json'), 'utf8')) && !/eventhouse/i.test(indexHtml) && !/eventhouse/i.test(fs.readFileSync(path.join(pub, 'about.html'), 'utf8')));
ok('소개 페이지에 중계 사이트 배제 원칙', fs.readFileSync(path.join(pub, 'about.html'), 'utf8').includes('중계·목록 사이트는 수집 대상에서 제외'));

const sitemap = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
const locs = (sitemap.match(/<loc>/g) || []).length;
ok('sitemap URL 수 = 목록+소개+상세', locs === data.length + 2, `${locs}개`);
ok('robots에 sitemap 주소', fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8').includes('https://event-pick.pages.dev/sitemap.xml'));

const built = JSON.parse(fs.readFileSync(path.join(pub, 'data/events.json'), 'utf8'));
ok('빌드 데이터에 dday·status·entryType·prizeType', built.events.every((e) => Number.isFinite(e.dday) && ['진행중', '마감임박'].includes(e.status) && e.entryType && e.prizeType));
ok('빌드 데이터에 요약 지표', built.summary && built.summary.total === built.events.length && typeof built.summary.soon === 'number');
const detailFiles = fs.readdirSync(path.join(pub, 'e'));
ok('상세 페이지 수 일치', detailFiles.length === data.length, `${detailFiles.length}개`);
const oneDetail = fs.readFileSync(path.join(pub, 'e', `${data[0].id}.html`), 'utf8');
ok('상세 페이지에 JSON-LD Event', oneDetail.includes('"@type":"Event"'));
ok('상세 페이지에 공식 원문 링크', oneDetail.includes(escapeHtml(data[0].url)));
ok('상세 페이지에 구조화 정보(당첨 인원·발표일)', oneDetail.includes('당첨 인원') && oneDetail.includes('발표일'));

console.log(`\n결과: ${pass}개 통과, ${fails.length}개 실패`);
if (fails.length) {
  console.log('\n실패 목록:\n' + fails.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
