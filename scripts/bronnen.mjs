// Controle bronnen (KEGO-kennisbank, ISSO-nieuws, InstallQ BRL-documenten).
// Draait in GitHub Actions (geen CORS-beperking zoals in de browser) en schrijft bronnen.json,
// dat het dashboard inleest. Node 20+, geen extra pakketten.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const debug = [];
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'nl-NL,nl;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const t = await r.text();
  debug.push({ url, status: r.status, final: r.url, len: t.length, title: (t.match(/<title[^>]*>([^<]*)/i) || [])[1] || '' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' op ' + url);
  return { html: t, url: r.url };
}
const dec = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const abs = (h, base) => { try { return new URL(dec(h), base).href.split('#')[0]; } catch { return ''; } };
function links(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = abs(m[1], base); if (u) out.push({ u, t: dec(m[2]) });
  }
  return out;
}

// --- KEGO (Freshdesk-portaal) ---
async function kego() {
  const base = 'https://portaal.stichtingkego.nl/support/solutions';
  const root = await get(base);
  const arts = new Map(), folders = new Map();
  const take = (ls, fname) => ls.forEach(({ u, t: t0 }) => { let t = t0;
    const m = u.match(/\/support\/solutions\/articles\/(\d+)/); t = t.replace(/\s*(Gewijzigd|Gemaakt|Modified|Created) op .*$/i, '').trim(); if (!m || !t) return;
    if (/^(meer|bekijk alle|see all|view all)/i.test(t) && t.length < 25) return;
    if (!arts.has(m[1])) arts.set(m[1], { id: m[1], u: u.split('?')[0], t, folder: fname || '' });
  });
  const rl = links(root.html, root.url);
  rl.forEach(({ u, t }) => { const f = u.split('?')[0].replace(/\/page\/\d+$/, ''); if (/\/support\/solutions\/folders\/\d+$/.test(f) && !folders.has(f)) folders.set(f, t.replace(/\s*\(\d+\)\s*$/, '')); });
  take(rl, '');
  for (const [fu, fname] of folders) {
    let url = fu; const seen = new Set();
    for (let p = 0; p < 15 && url && !seen.has(url); p++) {
      seen.add(url); let d; try { d = await get(url); } catch { break; }
      const ls = links(d.html, d.url); take(ls, fname);
      url = ls.map(x => x.u).find(h => h.startsWith(fu + '/page/') && !seen.has(h)) || null;
    }
  }
  return { items: [...arts.values()], folders: folders.size };
}

// --- ISSO nieuws energieprestatie ---
async function isso() {
  const d = await get('https://isso.nl/nieuws-blogs/?category=7'), out = new Map();
  links(d.html, d.url).forEach(({ u, t }) => {
    if (!/\/nieuws-blogs\//.test(u) || /[?&]category=|\/nieuws-blogs\/?$/.test(u) || t.length < 8) return;
    if (!out.has(u)) out.set(u, { id: u, u, t });
  });
  return { items: [...out.values()] };
}

// --- InstallQ: BRL 9500/9501 en interpretatiebesluiten ---
async function installq() {
  const out = new Map(), done = new Set(), queue = [];
  const isDoc = (u, t) => /\.pdf(\?|$)/i.test(u) && !/brl.?6000/i.test(decodeURIComponent(u) + ' ' + t) && /95\d\d|interpretat|ccvd|kego|energieprestatie|nta.?8800/i.test(decodeURIComponent(u) + ' ' + t);
  const isPage = (u, t) => /^https?:\/\/(www\.)?installq\.nl\//i.test(u) && !/\.(pdf|jpe?g|png|docx?|xlsx?)(\?|$)/i.test(u) && /brl|9500|9501|energieprestatie|interpretat|epbd|ep-advis|schema|ccvd|documenten/i.test(decodeURIComponent(u) + ' ' + t);
  const start = ['https://installq.nl/', 'https://installq.nl/controllers/brl'];
  start.forEach(u => queue.push(u));
  while (queue.length && done.size < 25) {
    const url = queue.shift(); if (done.has(url)) continue; done.add(url);
    let d; try { d = await get(url); } catch { continue; }
    for (const { u, t } of links(d.html, d.url)) {
      if (isDoc(u, t)) { if (!out.has(u)) out.set(u, { id: u, u, t: (t && !/^(download|bekijk|lees meer|pdf)$/i.test(t)) ? t : decodeURIComponent(u.split('/').pop()).replace(/\.pdf.*$/i, '').replace(/[-_]+/g, ' ') }); }
      else if (isPage(u, t) && !done.has(u) && done.size + queue.length < 40) queue.push(u.split('#')[0]);
    }
  }
  return { items: [...out.values()], pages: [...done] };
}

const prev = existsSync('bronnen.json') ? JSON.parse(readFileSync('bronnen.json', 'utf8')) : {};
const res = { t: Date.now() };
for (const [k, f] of [['kego', kego], ['isso', isso], ['iq', installq]]) {
  try {
    const r = await f(); if (!r.items.length) throw new Error('geen items gevonden');
    res[k] = { ok: Date.now(), items: r.items, ...(r.pages ? { pages: r.pages } : {}) };
  } catch (e) {
    const p = prev[k] || {};
    res[k] = { ok: p.ok || 0, items: p.items || [], err: String(e.message || e), errAt: Date.now() };
  }
}
res.debug = debug.filter(x => x.status !== 200).slice(0, 30);
writeFileSync('bronnen.json', JSON.stringify(res));
console.log(Object.entries(res).filter(([k]) => k !== 'debug' && k !== 't').map(([k, v]) => k + ': ' + v.items.length + ' items' + (v.err ? ' (fout: ' + v.err + ')' : '')).join('\n'));
