#!/usr/bin/env node
// 공개 목록 페이지를 읽어 data/events.json을 안전하게 갱신합니다.
// - 직접 확인해 넣은 항목(source !== '자동수집')은 건드리지 않습니다.
// - 자동 수집 항목은 같은 id면 새 값으로 갱신하고, 마감이 지난 항목은 정리합니다.
// - 로그인·CAPTCHA 우회는 하지 않습니다. 실패한 소스는 그대로 두고 다음 소스로 넘어갑니다.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DATA = 'data/events.json';
const UA = { 'User-Agent': 'EventPickBot/1.0 (+public event collector; contact: hijun67@gmail.com)' };
const TIMEOUT = 15000;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const clean = (h = '') =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const norm = (s = '') => s.replace(/[\s\[\(\)·\-_,.!?~'"“”‘’]/g, '').toLowerCase();

// 주최 이름으로 주최 구분을 정합니다. (목록 소스는 구분을 주지 않는 경우가 많음)
const LOCAL_RE = /(특별시|광역시|특별자치시|특별자치도|자치도|자치시|특별자치|[가-힣]+시$|[가-힣]+군$|[가-힣]+구$|[가-힣]+도$)/;
const GOV_RE = /(정부|부$|청$|처$|국회|법원|검찰|기상청|산림청|농촌진흥청|행정안전부|보건복지부|교육부|과학기술정보통신부|문화체육관광부|환경부|고용노동부|국토교통부|해양수산부|식품의약품안전처|공정거래위원회|금융위원회|방송통신위원회|개인정보보호위원회|국가보훈부|외교부|법무부|국방부|기획재정부|산업통상자원부|중소벤처기업부|여성가족부|통일부|농림축산식품부)/;
const CORP_RE = /(㈜|\(주\)|주식회사|자이|현대자동차|기아|양지사|퓨리얼|재능TV|하퍼스바자|대한상공회의소|BMW|온작|이마트|롯데|신세계|삼성|LG|KT|SK|카카오|네이버|교보|예스24|무신사|오늘의집|밀리의서재|동아일보|대원씨아이|매경|한국경제|조선일보|중앙일보|한겨레|쿠팡|배달의민족|야놀자|여기어때|에어비앤비|스타벅스|투썸|메가|컴포즈|GS25|CU|세븐일레븐)/;
function classify(organizer = '', fallback = '공공기관') {
  const name = organizer.replace(/\s+/g, ' ').trim();
  if (CORP_RE.test(name)) return '기업';
  if (GOV_RE.test(name)) return '정부·지자체';
  if (LOCAL_RE.test(name)) return '정부·지자체';
  return fallback;
}


async function get(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: UA, signal: ac.signal });
    if (!res.ok) return { ok: false, status: res.status, html: '' };
    return { ok: true, status: res.status, html: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, html: '', error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

const typeFromForm = (form = '') => {
  const f = form.replace(/\s/g, '');
  if (/퀴즈|퍼즐/.test(f)) return '퀴즈';
  if (/공모/.test(f)) return '공모전';
  return '경품·이벤트';
};

/* 이벤트하우스: <div class='list_row'> … <div class='list_detail'> 블록 */
export function parseEventhouse(html, source) {
  const out = [];
  const chunks = html.split("<div class='list_row'").slice(1);
  for (const chunk of chunks) {
    const subject = chunk.match(/\[<strong>([\s\S]*?)<\/strong>\]\s*([\s\S]*?)<sup/);
    const period = chunk.match(/ㆍ응모기간<\/div>\s*<div class='td_rd'>\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    if (!subject || !period) continue;
    const organizer = clean(subject[1]);
    const title = clean(subject[2]).replace(/\s*이벤트!!$/,'').replace(/\s*경품$/,'').replace(/\s*!!$/,'');
    if (!title) continue;
    const prize = clean((chunk.match(/ㆍ경품내역<\/div>\s*<div class='td_r[^']*'[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
    const how = clean((chunk.match(/ㆍ응모방법<\/div>\s*<div class='td_rd'>([\s\S]*?)<\/div>/) || [])[1] || '');
    const form = clean((chunk.match(/ㆍ응모형태<\/div>\s*<div class='td_r[^']*'>([\s\S]*?)<\/div>/) || [])[1] || '');
    out.push({
      title,
      organizer,
      start: period[1],
      end: period[2],
      prize: prize || '원문 확인',
      howTo: how || '원문 확인',
      type: typeFromForm(form),
      category: classify(organizer, source.category),
      url: source.url,
      sourceLabel: '이벤트하우스 목록(원문은 주최 누리집)',
      tags: [organizer, typeFromForm(form)].filter(Boolean),
    });
  }
  return out;
}

/* 서울시 내 손안에 서울 공모전 목록 */
export function parseMediahub(html, source) {
  const out = [];
  const chunks = html.split('<div class="slide"').slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/href="(\/gongmo\/\d+)"/);
    const title = clean((chunk.match(/<p class="tit[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
    const date = (chunk.match(/<p class="date">([\s\S]*?)<\/p>/) || [])[1] || '';
    const m = clean(date).match(/(\d{4})\.(\d{2})\.(\d{2})\.\s*~\s*(\d{4})\.(\d{2})\.(\d{2})\./);
    if (!link || !title || !m) continue;
    out.push({
      title,
      organizer: '서울특별시',
      start: `${m[1]}-${m[2]}-${m[3]}`,
      end: `${m[4]}-${m[5]}-${m[6]}`,
      prize: '원문 공고 확인',
      howTo: '원문 공고의 접수 방법 확인',
      type: '공모전',
      category: source.category,
      url: 'https://mediahub.seoul.go.kr' + link[1],
      sourceLabel: '내 손안에 서울 공모전 목록',
      tags: ['서울특별시', '공모전'],
    });
  }
  return out;
}

/* 모두의 광장(소통24) 설문·투표 목록 */
export function parseModu(html, source) {
  const out = [];
  const chunks = html.split('<li class="thm_card').slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/href="(\/front\/qustnrNew\/qustnrNewFrontView\.do\?[^"]+)"/);
    const period = chunk.match(/<p class="ac_period"><strong>(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})<\/strong>/);
    const title = clean((chunk.match(/<p class="ac_title">([\s\S]*?)<\/p>/) || [])[1] || '');
    const instt = clean((chunk.match(/<p class="ac_instt">([\s\S]*?)<\/p>/) || [])[1] || '');
    if (!link || !period || !title) continue;
    const bracket = title.match(/^【(.+?)】\s*(.*)$/);
    const t = bracket ? bracket[2] : title;
    // 경품성 이벤트만 남기고 일반 정책 설문은 건너뜁니다.
    if (!/퀴즈|이벤트|경품|추첨|선물|상품|응모|QUIZ|투표/i.test(t)) continue;
    out.push({
      title: bracket ? bracket[2] : title,
      organizer: bracket ? bracket[1] : instt.split(' ')[0],
      start: period[1],
      end: period[2],
      prize: '원문 확인 (경품 유무는 설문마다 다름)',
      howTo: '모두의 광장에서 로그인 후 설문·투표 참여',
      type: /퀴즈|QUIZ/.test(title) ? '퀴즈' : '경품·이벤트',
      category: source.category,
      url: 'https://modu.go.kr' + link[1].replace(/&amp;/g, '&'),
      sourceLabel: '모두의 광장 설문 목록',
      tags: [bracket ? bracket[1] : instt].filter(Boolean),
    });
  }
  return out;
}

/* 한국관광공사 관광e배움터 이벤트 목록 */
export function parseTouredu(html, source) {
  const out = [];
  const re = /<a href="([^"]*\/home\/support\/promotions\/prgs\/(\d+)[^"]*)"[\s\S]{0,600}?<\/a>/g;
  for (const m of html.matchAll(re)) {
    const text = clean(m[0]);
    const title = text
      .replace(/^\[이벤트\]\s*/, '')
      .replace(/\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*~\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*$/, '')
      .trim();
    const period = text.match(/(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/);
    if (!title || !period) continue;
    out.push({
      title,
      organizer: '한국관광공사',
      start: period[1].replace(/\./g, '-'),
      end: period[2].replace(/\./g, '-'),
      prize: '원문 확인',
      howTo: '관광e배움터 이벤트 안내 확인',
      type: '경품·이벤트',
      category: source.category,
      url: 'https://touredu.visitkorea.or.kr/home/support/promotions/prgs/' + m[2],
      sourceLabel: '관광e배움터 이벤트 목록',
      tags: ['관광e배움터', '한국관광공사'],
    });
  }
  return out;
}

const PARSERS = { eventhouse: parseEventhouse, mediahub: parseMediahub, modu: parseModu, touredu: parseTouredu };

function toEntry(raw) {
  return {
    id: 'auto-' + sha(raw.url + '|' + raw.title),
    title: raw.title,
    organizer: raw.organizer || '주최 미상',
    category: raw.category,
    type: raw.type,
    start: raw.start || '',
    end: raw.end,
    endTime: '',
    prize: raw.prize || '원문 확인',
    howTo: raw.howTo || '원문 확인',
    url: raw.url,
    tags: (raw.tags || []).filter(Boolean).slice(0, 4),
    note: '',
    verifiedAt: today,
    addedAt: new Date().toISOString(),
    source: '자동수집',
    sourceLabel: raw.sourceLabel || '자동 수집',
  };
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const curated = db.filter((e) => e.source !== '자동수집');
  const prevAuto = new Map(db.filter((e) => e.source === '자동수집').map((e) => [e.id, e]));
  const config = JSON.parse(fs.readFileSync('sources.json', 'utf8'));

  let fetched = 0;
  const fresh = [];
  const okLabels = new Set();
  for (const source of config.sources) {
    const parser = PARSERS[source.kind];
    if (!parser) { console.warn(`- ${source.id}: 파서 없음(kind=${source.kind}), 건너뜀`); continue; }
    const { ok, status, html, error } = await get(source.url);
    if (!ok) { console.warn(`- ${source.id}: 요청 실패(${status || error}) — 기존 데이터 유지`); continue; }
    const items = parser(html, source);
    const limited = source.limit ? items.slice(0, source.limit) : items;
    fetched += limited.length;
    okLabels.add(source.id);
    console.log(`- ${source.id}: ${items.length}건 파싱 → ${limited.length}건 사용 (HTTP ${status})`);
    for (const raw of limited) fresh.push({ ...toEntry(raw), sourceId: source.id });
  }

  const curatedTitles = new Set(curated.map((e) => norm(e.title)));
  const curatedKeys = new Set(curated.map((e) => `${norm(e.organizer)}|${e.end}`));
  const seen = new Set();
  const merged = [...curated];
  let added = 0;
  let updated = 0;

  const farLimit = new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
  for (const entry of fresh) {
    if (entry.end < today) continue;
    if (entry.end > farLimit) continue; // 출처의 오기(예: 2036년)나 상시 모집은 목록에서 뺍니다.
    if (curatedTitles.has(norm(entry.title))) continue;
    if (curatedKeys.has(`${norm(entry.organizer)}|${entry.end}`)) continue; // 직접 확인 항목과 주최·마감일이 겹치면 중복으로 봄
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const old = prevAuto.get(entry.id);
    if (old) {
      merged.push({ ...old, ...entry, addedAt: old.addedAt || entry.addedAt });
      updated += 1;
    } else {
      merged.push(entry);
      added += 1;
    }
  }

  const before = db.length;
  // 수집에 성공한 소스의 자동 항목 중 이번 목록에 없는 것은 내려간 것으로 보고 뺍니다.
  const freshIds = new Set(fresh.map((e) => e.id));
  const alive = merged.filter((e) => e.end >= today && (e.source !== '자동수집' || !okLabels.has(e.sourceId) || freshIds.has(e.id)));
  alive.sort((a, b) => String(a.end).localeCompare(String(b.end)));

  fs.writeFileSync(DATA, JSON.stringify(alive, null, 2) + '\n');
  console.log(`수집 ${fetched}건 → 신규 ${added} · 갱신 ${updated} · 마감 지난 항목 정리 후 ${alive.length}건 (이전 ${before}건, 직접 확인 ${curated.length}건 유지)`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('수집 실패:', err);
    process.exitCode = 1;
  });
}
