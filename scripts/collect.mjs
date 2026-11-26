#!/usr/bin/env node
// 주최 기관·기업의 공개 페이지를 읽어 data/events.json을 안전하게 갱신합니다.
// - 중계·목록 사이트는 쓰지 않습니다. sources.json의 공식 페이지만 읽습니다.
// - 직접 확인해 넣은 항목(source !== '자동수집')은 건드리지 않습니다.
// - 상세 페이지를 읽는 소스는 발표일·참여대상·공식 응모처·단계별 방법까지 채웁니다.
// - 로그인·CAPTCHA 우회는 하지 않습니다. 실패한 소스는 그대로 두고 다음 소스로 넘어갑니다.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DATA = 'data/events.json';
const UA = { 'User-Agent': 'EventPickBot/1.0 (+official event collector; contact: hijun67@gmail.com)', 'Accept-Language': 'ko-KR,ko;q=0.9' };
const TIMEOUT = 15000;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
export const clean = (h = '') =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const norm = (s = '') => s.replace(/[\s\[\]\(\)·\-_,.!?~'"“”‘’]/g, '').toLowerCase();

/* ---------- 주최 구분 ---------- */
const CORP_RE = /(㈜|\(주\)|주식회사|자이|현대자동차|기아|삼성|LG|KT|SK|카카오|네이버|교보|예스24|무신사|쿠팡|배달의민족|스타벅스|투썸|메가박스|CGV|롯데|신세계|이마트|하나은행|국민은행|신한은행|우리은행|카카오뱅크|토스|동아일보|매경|한국경제|조선일보|중앙일보|한겨레|대원씨아이|밀리의서재|티켓베이|봉이|다이슨|아모레|오뚜기|농심|크라운|해태|롯데웰푸드|동서식품|빙그레|매일유업|제주항공|대한항공|아시아나)/;
const PUBLIC_RE = /(공사|공단|진흥원|연구원|연구소|재단|센터|박물관|미술관|도서관|대공원|시설관리|심사평가원|정보원|보험공단|연금공단|건강보험|산림복지|저작권위원회|진흥회|협회|조합|은행|증권|보험|대학교|병원|의료원)/;
const GOV_RE = /(정부|부$|청$|처$|위원회$|국회|법원|검찰|특별시|광역시|특별자치|자치도|자치시|[가-힣]+시$|[가-힣]+군$|[가-힣]+구$|[가-힣]+도$)/;
export function classify(organizer = '', fallback = '공공기관') {
  const name = organizer.replace(/\s+/g, ' ').trim();
  if (!name) return fallback;
  if (CORP_RE.test(name)) return '기업';
  if (PUBLIC_RE.test(name)) return '공공기관';
  if (GOV_RE.test(name)) return '정부·지자체';
  return fallback;
}

/* ---------- 공통 도우미 ---------- */
export function circledSteps(text = '') {
  const out = [];
  for (const m of String(text).matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]\s*([^①②③④⑤⑥⑦⑧⑨⑩]{2,70})/g)) {
    const t = m[1].replace(/[\s,·/]+$/, '').trim();
    if (t) out.push(t.slice(0, 70));
  }
  return out.slice(0, 6);
}
export function stepLines(text = '') {
  const out = [];
  for (const m of String(text).matchAll(/STEP\s*(\d+)\s*[.．:：)]?\s*([^:：]{2,80})/gi)) {
    const t = m[2].replace(/\s+/g, ' ').trim();
    if (t && !out.includes(t)) out.push(t.slice(0, 80));
  }
  return out.slice(0, 6);
}
export function winnerCount(prize = '') {
  const m = String(prize).match(/([\d,]{1,7})\s*명/);
  return m ? `${m[1]}명` : '';
}
/** '2026. 12. 7.(월) …' 또는 '12월 7일' → 'YYYY-MM-DD' (연도가 없으면 yearHint 사용) */
export function looseDate(str = '', yearHint = '') {
  const s = String(str);
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m && yearHint) return `${yearHint}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  return '';
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

const typeFromText = (t = '') => {
  const s = String(t);
  if (/퀴즈|퍼즐|초성|OX|룰렛|QUIZ/i.test(s)) return '퀴즈';
  if (/공모|작품|출품|제출|모집/i.test(s)) return '공모전';
  return '경품·이벤트';
};

/* ---------- 서울시 내 손안에 서울: 이벤트 ---------- */
export function parseSeoulEvent(html, source) {
  const out = [];
  for (const chunk of html.split('<div class="slide"').slice(1)) {
    const link = chunk.match(/href="(\/missions\/\d+)"[^>]*title="상세 정보 보기"/);
    const title = chunk.match(/<p class="tit">([\s\S]*?)<\/p>/);
    const period = chunk.match(/<span class="tit">이벤트기간<\/span><\/th>\s*<td><div class="cont">([\s\S]*?)<\/div>/);
    if (!link || !title) continue;
    const t = clean(title[1]);
    if (!t || /누리집|바로가기/.test(t)) continue;
    const p = clean(period ? period[1] : '').match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?(?:\s*\d{1,2}:\d{2})?\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (!p) continue;
    out.push({
      title: t,
      organizer: '서울특별시',
      start: `${p[1]}-${String(p[2]).padStart(2, '0')}-${String(p[3]).padStart(2, '0')}`,
      end: `${p[4]}-${String(p[5]).padStart(2, '0')}-${String(p[6]).padStart(2, '0')}`,
      type: typeFromText(t),
      category: source.category,
      url: 'https://mediahub.seoul.go.kr' + link[1],
      sourceLabel: '내 손안에 서울 이벤트',
      tags: ['서울특별시'],
      detail: true,
    });
  }
  return out;
}

/* ---------- 서울시 내 손안에 서울: 공모전 ---------- */
export function parseMediahub(html, source) {
  const out = [];
  for (const chunk of html.split('<div class="slide"').slice(1)) {
    const link = chunk.match(/href="(\/gongmo\/\d+)"/);
    const title = clean((chunk.match(/<p class="tit[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
    const date = (chunk.match(/<p class="date">([\s\S]*?)<\/p>/) || [])[1] || '';
    const m = clean(date).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\./);
    if (!link || !title || !m) continue;
    out.push({
      title,
      organizer: '서울특별시',
      start: `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`,
      end: `${m[4]}-${String(m[5]).padStart(2, '0')}-${String(m[6]).padStart(2, '0')}`,
      type: '공모전',
      category: source.category,
      url: 'https://mediahub.seoul.go.kr' + link[1],
      sourceLabel: '내 손안에 서울 공모전',
      tags: ['서울특별시', '공모전'],
      detail: true,
    });
  }
  return out;
}

/* ---------- 모두의 광장(소통24) 설문·투표 ---------- */
export function parseModu(html, source) {
  const out = [];
  for (const chunk of html.split('<li class="thm_card').slice(1)) {
    const link = chunk.match(/href="(\/front\/qustnrNew\/qustnrNewFrontView\.do\?[^"]+)"/);
    const period = chunk.match(/<p class="ac_period"><strong>(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})<\/strong>/);
    const title = clean((chunk.match(/<p class="ac_title">([\s\S]*?)<\/p>/) || [])[1] || '');
    const instt = clean((chunk.match(/<p class="ac_instt">([\s\S]*?)<\/p>/) || [])[1] || '');
    if (!link || !period || !title) continue;
    const bracket = title.match(/^【(.+?)】\s*(.*)$/);
    const t = bracket ? bracket[2] : title;
    if (!/퀴즈|이벤트|경품|추첨|선물|상품|응모|QUIZ|투표/i.test(t)) continue;
    const organizer = bracket ? bracket[1] : instt.split(' ')[0];
    out.push({
      title: t,
      organizer,
      start: period[1],
      end: period[2],
      prize: '원문 확인 (경품 유무는 설문마다 다름)',
      howTo: '모두의 광장에서 로그인 후 설문·투표 참여',
      type: /퀴즈|QUIZ/.test(title) ? '퀴즈' : '경품·이벤트',
      category: classify(organizer, source.category),
      url: 'https://modu.go.kr' + link[1].replace(/&amp;/g, '&'),
      sourceLabel: '모두의 광장 설문 목록',
      tags: [organizer].filter(Boolean),
    });
  }
  return out;
}

/* ---------- 한국관광공사 관광e배움터 ---------- */
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
      type: typeFromText(title),
      category: source.category,
      url: 'https://touredu.visitkorea.or.kr/home/support/promotions/prgs/' + m[2],
      sourceLabel: '관광e배움터 이벤트',
      tags: ['관광e배움터', '한국관광공사'],
    });
  }
  return out;
}

const PARSERS = { seoulEvent: parseSeoulEvent, mediahub: parseMediahub, modu: parseModu, touredu: parseTouredu };

/* ---------- 상세 페이지에서 구조화 정보 읽기 ---------- */
/** 서울시 상세 페이지: <th><span class="tit">라벨</span></th><td><div class="cont">값</div></td> */
export function seoulFields(html) {
  const fields = {};
  for (const m of html.matchAll(/<th scope="row"><span class="tit">([\s\S]*?)<\/span><\/th>\s*<td><div class="cont">([\s\S]*?)<\/div>/g)) {
    const label = clean(m[1]);
    if (label) fields[label] = clean(m[2]);
  }
  return fields;
}

/** 상세 페이지의 schema.org Event(JSON-LD)를 읽습니다. 없으면 빈 객체. */
export function seoulJsonLd(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1].trim());
      const node = j['@type'] === 'Event' ? j : (j['@graph'] || []).find((n) => n && n['@type'] === 'Event');
      if (node) return node;
    } catch { /* 다른 블록은 무시 */ }
  }
  return {};
}

/** STEP 문장을 다음 STEP 전까지만 남겨 정리합니다. */
export function tidySteps(text = '') {
  const out = [];
  const parts = String(text).split(/STEP\s*\d+\s*[.．:：)]?/i).slice(1);
  for (const p of parts) {
    let t = clean(p);
    t = t.split(/이벤트\s*상세\s*안내|참여\s*기간\s*[:：]|당첨자\s*발표\s*[:：]|이벤트\s*경품\s*[:：]/)[0];
    t = t.replace(/^[.\-·\s]+/, '').trim();
    if (t.length > 4) out.push(t.slice(0, 80));
  }
  return out.slice(0, 6);
}

const cutAt = (s = '', marks = ['○', '□', '※', '문의', '이벤트 명', '이벤트 기간', '참여 기간', 'STEP']) => {
  let t = s;
  for (const mk of marks) {
    const i = t.indexOf(mk);
    if (i > 0) t = t.slice(0, i);
  }
  return t.replace(/[.。,\s]+$/, '').trim();
};

export function enrichSeoul(raw = {}, html = '') {
  const ld = seoulJsonLd(html);
  const fields = seoulFields(html);
  const props = {};
  for (const p of ld.additionalProperty || []) if (p && p.name) props[p.name] = clean(String(p.value || ''));
  const get = (k) => props[k] || fields[k] || '';

  const full = clean(html);
  const start = Math.max(full.indexOf('이벤트 명 :'), full.indexOf('공모명 :'));
  const bodyEnd = full.indexOf('좋아요', start + 40);
  const body = clean(`${ld.description || ''} ${start > 0 ? full.slice(start, bodyEnd > start ? bodyEnd : start + 2600) : ''}`);

  const organizerRaw = String((ld.organizer && ld.organizer.name) || get('주최') || raw.organizer || '').replace(/\s+/g, ' ').trim();
  const parent = String((ld.organizer && ld.organizer.parentOrganization && ld.organizer.parentOrganization.name) || '').trim();
  const isDept = organizerRaw.length <= 16 && /(과|팀|담당관|부|실|국)$/.test(organizerRaw) && !/(연구원|공사|공단|재단|센터|박물관|미술관|도서관|병원|위원회)/.test(organizerRaw) && !(parent && organizerRaw.includes(parent));
  const organizer = isDept && parent && !organizerRaw.includes(parent) ? `${parent} ${organizerRaw}` : organizerRaw;
  const start2 = (ld.startDate || '').slice(0, 10) || raw.start;
  const end2 = (ld.endDate || '').slice(0, 10) || raw.end;
  const yearHint = (end2 || raw.end || '').slice(0, 4);

  const announceRaw = get('결과발표') || get('발표일') || '';
  let announceDate = looseDate(announceRaw, yearHint);
  if (!announceDate) {
    const m = body.match(/당첨자\s*발표\s*[:：]?\s*([^※※]{2,40})/);
    if (m) announceDate = looseDate(m[1], yearHint);
  }
  const target = get('참여대상') || get('응모대상') || (ld.audience && ld.audience.audienceType) || '';
  const site = (get('누리집') || '').trim();

  let prize = '';
  const prizeMatch = body.match(/이벤트\s*경품\s*[:：]\s*([^※○□]{2,70})/i) || body.match(/경품\s*(?:내역|안내)?\s*[:：]\s*([^※○□]{2,70})/i);
  if (prizeMatch) prize = cutAt(clean(prizeMatch[1]));
  if (!prize) {
    const award = body.match(/(?:총\s*상금|상금|시상\s*규모|시\s?상\s?규모|시상\s*내역|상격)\s*[:：]?\s*([^※○□]{2,90})/);
    if (award) prize = cutAt(clean(award[1]));
  }

  let steps = tidySteps(ld.description || body);
  if (steps.length < 2) steps = stepLines(body);
  if (steps.length < 2) {
    const circled = circledSteps(`${raw.howTo || ''} ${body}`);
    if (circled.length >= 2) steps = circled;
  }
  if (!steps.length) {
    const m = body.match(/(?:참여\s*방법|응모\s*방법|접수\s*방법)\s*[:：]?\s*([\s\S]{6,140}?)(?:※|유의|당첨|문의|$)/);
    if (m) steps = [cutAt(clean(m[1])).slice(0, 90)];
  }

  const cautionMatch = body.match(/유의\s?사항\s*[:：]?\s*([\s\S]{6,240}?)(?:좋아요|목록|관련 누리집|이벤트 상세|$)/);
  const cautions = cautionMatch ? clean(cautionMatch[1]).slice(0, 220) : '';

  const descFirst = clean(String(ld.description || '')).split(/(?<=[.!?])\s/)[0] || '';
  const howTo = steps.length ? steps.map((s, i) => `${'①②③④⑤⑥'[i] || ''} ${s}`.trim()).join(' ') : (raw.howTo && raw.howTo !== '원문 확인' ? raw.howTo : (target ? `참여 대상: ${target}` : descFirst.slice(0, 110)));

  return {
    ...raw,
    title: clean(String(ld.name || raw.title)) || raw.title,
    organizer: organizer || raw.organizer,
    category: classify(organizer || raw.organizer, raw.category),
    start: start2,
    end: end2,
    prize: prize || '원문 확인',
    howTo: howTo || '원문 안내 확인',
    steps,
    cautions,
    announceDate,
    announceNote: announceRaw ? clean(announceRaw).slice(0, 80) : '',
    target: target.slice(0, 120),
    url: site && site !== raw.url ? site : raw.url,
    sourceLabel: raw.sourceLabel,
    tags: [...new Set([...(raw.tags || []), organizer].filter(Boolean))].slice(0, 4),
  };
}

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
    announceDate: raw.announceDate || '',
    announceNote: raw.announceNote || '',
    winners: raw.winners || winnerCount(raw.prize || ''),
    prize: raw.prize || '원문 확인',
    howTo: raw.howTo || '원문 확인',
    steps: raw.steps || [],
    cautions: raw.cautions || '',
    target: raw.target || '',
    url: raw.url,
    tags: (raw.tags || []).filter(Boolean).slice(0, 4),
    note: '',
    verifiedAt: today,
    addedAt: new Date().toISOString(),
    source: '자동수집',
    sourceLabel: raw.sourceLabel || '공식 페이지',
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
    let items = parser(html, source);
    const limited = source.limit ? items.slice(0, source.limit) : items;
    if (source.detail) {
      const detailed = [];
      for (const item of limited) {
        const res = await get(item.url);
        if (res.ok) {
          detailed.push(enrichSeoul(item, res.html));
        } else {
          detailed.push(item);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      items = detailed;
    } else {
      items = limited;
    }
    fetched += items.length;
    okLabels.add(source.id);
    console.log(`- ${source.id}: ${items.length}건 (HTTP ${status}${source.detail ? ', 상세 포함' : ''})`);
    for (const raw of items) fresh.push({ ...toEntry(raw), sourceId: source.id });
  }

  const curatedTitles = new Set(curated.map((e) => norm(e.title)));
  const curatedKeys = new Set(curated.map((e) => `${norm(e.organizer)}|${e.end}`));
  const seen = new Set();
  const merged = [...curated];
  let added = 0;
  let updated = 0;

  const farLimit = new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
  for (const entry of fresh) {
    if (!entry.end || entry.end < today) continue;
    if (entry.end > farLimit) continue; // 출처의 오기(예: 2036년)나 상시 모집은 목록에서 뺍니다.
    if (curatedTitles.has(norm(entry.title))) continue;
    if (curatedKeys.has(`${norm(entry.organizer)}|${entry.end}`)) continue; // 직접 확인 항목과 주최·마감일이 겹치면 중복
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
