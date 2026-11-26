#!/usr/bin/env node
// data/events.json → public/ 정적 사이트 (목록·상세 페이지·sitemap·robots)
import fs from 'node:fs';
import path from 'node:path';
import {
  dday, statusOf, ddayLabel, fmtPeriod, fmtDate, escapeHtml, entryTypeOf, prizeTypeOf, winnersOf, announceOf, stepsOf, summarize,
} from '../src/lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = (process.env.SITE_URL || 'https://event-pick.pages.dev').replace(/\/$/, '');
const today = process.env.TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const now = new Date(`${today}T09:00:00+09:00`);

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
const events = all
  .filter((e) => e.end && e.end >= today)
  .sort((a, b) => String(a.end).localeCompare(String(b.end)));
const stats = summarize(events, now);

const PUB = path.join(ROOT, 'public');
fs.rmSync(path.join(PUB, 'e'), { recursive: true, force: true });
fs.mkdirSync(path.join(PUB, 'data'), { recursive: true });
fs.mkdirSync(path.join(PUB, 'e'), { recursive: true });

/* 정적 자원 복사 */
for (const f of ['style.css', 'app.js', 'lib.mjs', 'favicon.svg']) {
  fs.copyFileSync(path.join(ROOT, 'src', f), path.join(PUB, f));
}

/* 목록 페이지 */
const jsonld = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: '이벤트픽',
      url: `${SITE}/`,
      description: '정부·공공기관·기업이 직접 공고한 경품 이벤트·퀴즈·공모전을 주최 공식 페이지로 연결하는 보드',
      inLanguage: 'ko-KR',
    },
    {
      '@type': 'ItemList',
      name: '진행 중인 경품 이벤트·퀴즈·공모전',
      numberOfItems: events.length,
      itemListElement: events.slice(0, 30).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.title,
        url: `${SITE}/e/${e.id}`,
      })),
    },
  ],
});

const indexTpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const index = indexTpl
  .replaceAll('{{SITE_URL}}', SITE)
  .replaceAll('{{COUNT}}', String(stats.total))
  .replaceAll('{{SOON}}', String(stats.soon))
  .replaceAll('{{CONTESTS}}', String(stats.contest))
  .replaceAll('{{CORP}}', String(stats.corp))
  .replaceAll('{{UPDATED}}', today)
  .replaceAll('{{JSONLD}}', jsonld.replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(PUB, 'index.html'), index);

/* 데이터 (브라우저가 읽는 목록) */
fs.writeFileSync(path.join(PUB, 'data/events.json'), JSON.stringify({
  updatedAt: today,
  basisDate: today,
  count: events.length,
  summary: stats,
  events: events.map((e) => ({
    ...e,
    entryType: entryTypeOf(e),
    prizeType: prizeTypeOf(e),
    winners: winnersOf(e),
    dday: dday(e.end, now),
    status: statusOf(e, now),
  })),
}, null, 1));

/* 상세 페이지 */
const head = (title, desc, canonical, ld) => `<!doctype html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="${canonical}" />
<meta name="theme-color" content="#f4f0e6" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/style.css" />
${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
</head>`;

const topbar = `<header class="topbar"><div class="topbar-inner"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">🎯</span><span class="brand-name">이벤트픽</span><span class="brand-sub">공식 원문 직행</span></a><div class="top-actions"><a class="vt-btn" href="/" style="text-decoration:none">← 전체 목록</a></div></div></header>`;

for (const e of events) {
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    ...(e.start ? { startDate: e.start } : {}),
    endDate: e.end,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    description: `${e.prize} — ${e.howTo}`,
    url: `${SITE}/e/${e.id}`,
    organizer: { '@type': 'Organization', name: e.organizer },
    inLanguage: 'ko-KR',
  }).replace(/</g, '\\u003c');

  const steps = stepsOf(e);
  const html = `${head(`${escapeHtml(e.title)} — ${escapeHtml(e.organizer)} ${escapeHtml(e.type)} | 이벤트픽`, escapeHtml(`${e.organizer} ${e.title} · 마감 ${fmtPeriod(e)} · ${e.prize}`), `${SITE}/e/${e.id}`, ld)}
<body>
${topbar}
<main class="detail-page">
  <a class="back" href="/">← 전체 목록</a>
  <h1>${escapeHtml(e.title)}</h1>
  <p class="meta">${escapeHtml(e.organizer)} · ${escapeHtml(e.category)} · ${escapeHtml(e.type)} · <strong>${escapeHtml(ddayLabel(e, now))}</strong></p>
  <div class="facts">
    <div><span>응모 기간</span><b>${escapeHtml(fmtPeriod(e) || '원문 확인')}</b></div>
    <div><span>당첨 인원</span><b>${escapeHtml(winnersOf(e) || '원문 확인')}</b></div>
    <div><span>발표일</span><b>${escapeHtml(announceOf(e) || '원문 공고 확인')}</b></div>
    <div><span>응모 형태</span><b>${escapeHtml(entryTypeOf(e))}</b></div>
    <div><span>경품 유형</span><b>${escapeHtml(prizeTypeOf(e) === '기타' ? '원문 확인' : prizeTypeOf(e))}</b></div>
    <div><span>참여 대상</span><b>${escapeHtml(e.target || '원문 확인')}</b></div>
  </div>
  <section class="prize-box"><h3>경품·시상</h3><p>${escapeHtml(e.prize || '원문 확인')}</p></section>
  <section class="step-box"><h3>단계별 응모 방법</h3>
    ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : `<p class="muted-line">${escapeHtml(e.howTo || '원문 안내를 확인하세요.')}</p>`}
  </section>
  ${e.cautions ? `<section class="caution-box"><h3>유의사항</h3><p>${escapeHtml(e.cautions)}</p></section>` : ''}
  <div class="detail-actions">
    <a class="btn btn-primary" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">주최 공식 원문 열기 ↗</a>
  </div>
  <p class="detail-note">경품·일정은 주최 측 사정으로 바뀔 수 있습니다. 응모 전 주최 공식 공고를 다시 확인하세요. 확인 ${escapeHtml(e.verifiedAt || today)} · ${escapeHtml(e.sourceLabel || '공식 페이지')}</p>
</main>
<footer class="site-foot"><div class="foot-inner"><p class="muted">수록 ${events.length}건 · 마지막 확인 ${today} · <a href="/about">소개·수집 원칙</a></p></div></footer>
</body>
</html>`;
  fs.writeFileSync(path.join(PUB, 'e', `${e.id}.html`), html);
}

/* 소개 페이지 */
const about = `${head('소개·수집 원칙 | 이벤트픽', '이벤트픽이 무엇을, 어디서, 어떻게 모아 확인하는지와 응모 전 확인 사항을 정리했습니다.', `${SITE}/about`)}
<body>
${topbar}
<main class="detail-page">
  <a class="back" href="/">← 전체 목록</a>
  <h1>소개·수집 원칙</h1>
  <div class="detail-list" style="display:grid;gap:10px;margin-top:18px">
    <div><dt>무엇인가요</dt><dd>정부 부처·지방자치단체·공공기관·기업이 <strong>직접 공고한</strong> 경품 이벤트·퀴즈·공모전을 한 보드에 모아, 마감 D-day·당첨 인원·발표일·단계별 응모 방법과 함께 보여 주는 사이트입니다.</dd></div>
    <div><dt>어디서 모으나요</dt><dd>주최 기관·기업의 공식 누리집과 공고만 읽습니다. 서울시 <em>내 손안에 서울</em>(이벤트·공모전), 행정안전부 <em>모두의 광장</em>, 한국관광공사 <em>관광e배움터</em>는 자동 수집하고, 기업 이벤트는 공식 페이지를 직접 열어 경품·응모 방법·발표일을 확인합니다. 이벤트 중계·목록 사이트는 수집 대상에서 제외하며, 링크도 달지 않습니다.</dd></div>
    <div><dt>링크는 어디로 가나요</dt><dd>모든 항목의 <strong>공식 원문</strong> 버튼은 주최가 운영하는 응모·공고 페이지로 바로 연결됩니다. 중계 페이지를 거치지 않습니다.</dd></div>
    <div><dt>무엇을 넣지 않나요</dt><dd>마감이 지난 이벤트, 확인하지 못한 경품·일정, 로그인·결제가 있어야만 내용을 볼 수 있는 항목은 넣지 않습니다. 경품 유무가 불분명한 항목은 ‘원문 확인’으로 표시합니다.</dd></div>
    <div><dt>찜·참여 완료는 어디에 저장되나요</dt><dd>이 브라우저의 <code>localStorage</code>에만 저장됩니다. 서버로 보내지 않고, 다른 기기와 동기화되지 않습니다.</dd></div>
    <div><dt>응모는 어디서 하나요</dt><dd>모든 응모·제출은 주최 공식 페이지에서 직접 합니다. 이 사이트는 응모를 대신하지 않고, 결제하거나 개인정보를 넘기지 않습니다.</dd></div>
    <div><dt>확인할 점</dt><dd>경품·마감일·참가 자격은 주최 측 사정으로 바뀔 수 있습니다. 응모 전 원문 공고에서 자격·제출 형식·개인정보 제공 항목을 다시 확인하세요.</dd></div>
  </div>
  <p class="detail-note">기준일 ${today} · 수록 ${events.length}건 · 문의: 사이트 운영자</p>
</main>
<footer class="site-foot"><div class="foot-inner"><p class="muted"><a href="/">전체 목록으로</a></p></div></footer>
</body></html>`;
fs.writeFileSync(path.join(PUB, 'about.html'), about);

/* 404 */
fs.writeFileSync(path.join(PUB, '404.html'), `<!doctype html>
<html lang="ko" data-theme="light"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>페이지를 찾을 수 없습니다 | 이벤트픽</title><link rel="stylesheet" href="/style.css" /></head>
<body>${topbar}
<main class="board"><p class="empty" style="padding-top:80px">요청한 페이지가 없습니다. 마감된 이벤트일 수 있습니다.<br /><a href="/">전체 목록으로 →</a></p></main></body></html>`);

/* sitemap · robots */
const urls = [`${SITE}/`, `${SITE}/about`, ...events.map((e) => `${SITE}/e/${e.id}`)];
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u, i) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>${i < 2 ? 'daily' : 'weekly'}</changefreq><priority>${i === 0 ? '1.0' : i === 1 ? '0.6' : '0.7'}</priority></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(PUB, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

/* Cloudflare Pages 설정 (정적 사이트, 클린 URL) */
fs.writeFileSync(path.join(PUB, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n\n/data/*\n  Cache-Control: public, max-age=300\n`);

console.log(`빌드 완료 — 이벤트 ${events.length}건(마감임박 ${stats.soon}건, 공모전 ${stats.contest}건) · 상세 페이지 ${events.length}개 · sitemap ${urls.length}개 URL`);
console.log(`기준일 ${today} · 사이트 ${SITE}`);
