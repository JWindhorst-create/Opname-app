// Gedeelde Ideeënbus: één lijst in Cloudflare KV (binding IDEEENBUS).
// Toegang tot /api loopt via Cloudflare Access, net als de rest van het dashboard.
const KEY = 'lijst';
const SOORTEN = ['Toevoegen', 'Verbeteren', 'Fout'];
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = t => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function lees(env, req) {
  let l = await env.IDEEENBUS.get(KEY, 'json');
  if (!Array.isArray(l)) {
    l = [];
    try { const r = await env.ASSETS.fetch(new URL('/ideeenbus-start.json', req.url)); if (r.ok) l = await r.json(); } catch (e) {}
    await env.IDEEENBUS.put(KEY, JSON.stringify(l));
  }
  return l;
}

function schoon(x, door) {
  const t = String(x.t || '').trim().slice(0, 4000);
  if (!t) return null;
  return { id: x.id || nid(), t, s: SOORTEN.includes(x.s) ? x.s : 'Toevoegen', p: String(x.p || '').slice(0, 80),
    d: +x.d || Date.now(), k: !!x.k, ...(x.e ? { e: +x.e } : {}), door: x.door || door || '' };
}

export async function onRequestGet({ env, request }) {
  if (!env.IDEEENBUS) return j({ fout: 'Opslag (KV-binding IDEEENBUS) ontbreekt' }, 503);
  return j(await lees(env, request));
}

export async function onRequestPost({ env, request }) {
  if (!env.IDEEENBUS) return j({ fout: 'Opslag (KV-binding IDEEENBUS) ontbreekt' }, 503);
  let b; try { b = await request.json(); } catch (e) { return j({ fout: 'Ongeldige invoer' }, 400); }
  const door = request.headers.get('cf-access-authenticated-user-email') || '';
  let l = await lees(env, request);
  const bestaat = t => l.some(x => norm(x.t) === norm(t));
  if (b.op === 'add' || b.op === 'addMany') {
    for (const x of (b.op === 'add' ? [b.item] : (b.items || [])).reverse()) {
      const c = x && schoon(x, door); if (c && !bestaat(c.t)) l.unshift(c);
    }
  } else if (b.op === 'upd') {
    const x = l.find(y => y.id === b.id); if (!x) return j(l);
    if (typeof b.t === 'string' && b.t.trim()) x.t = b.t.trim().slice(0, 4000);
    if (SOORTEN.includes(b.s)) x.s = b.s;
    if (typeof b.k === 'boolean') x.k = b.k;
    if (b.t !== undefined || b.s !== undefined) x.e = Date.now();
  } else if (b.op === 'del') {
    l = l.filter(x => x.id !== b.id);
  } else if (b.op === 'clear') {
    l = l.filter(x => !x.k);
  } else return j({ fout: 'Onbekende actie' }, 400);
  await env.IDEEENBUS.put(KEY, JSON.stringify(l));
  return j(l);
}
