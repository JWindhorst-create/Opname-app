const r2Van = env => env.BRONNEN || env.Bronnen || env.bronnen || env.BRONNEN_R2;
const veiligeNaam = n => {
  n = String(n || '').split(/[\\/]/).pop().trim();
  if (!n || n.startsWith('.') || n.length > 200) return '';
  return n;
};
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
// GET: lijst van gedeelde bronnen. PUT ?naam=bestand.pdf: bestand toevoegen/vervangen.
export async function onRequestGet({ env }) {
  const r2 = r2Van(env);
  if (!r2) return j({ fout: 'Opslag (R2-binding BRONNEN) ontbreekt' }, 503);
  const uit = []; let cursor;
  do {
    const l = await r2.list({ cursor, include: ['customMetadata'] });
    for (const o of l.objects) uit.push({ naam: o.key, grootte: o.size, datum: o.uploaded, door: (o.customMetadata || {}).door || '' });
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  return j(uit);
}
export async function onRequestPut({ env, request }) {
  const r2 = r2Van(env);
  if (!r2) return j({ fout: 'Opslag (R2-binding BRONNEN) ontbreekt' }, 503);
  const naam = veiligeNaam(new URL(request.url).searchParams.get('naam'));
  if (!naam || !/\.pdf$/i.test(naam)) return j({ fout: 'Alleen PDF-bestanden' }, 400);
  const door = request.headers.get('cf-access-authenticated-user-email') || '';
  await r2.put(naam, request.body, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { door } });
  return j({ ok: true, naam });
}
