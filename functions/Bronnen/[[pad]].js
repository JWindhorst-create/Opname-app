const r2Van = env => env.BRONNEN || env.Bronnen || env.bronnen || env.BRONNEN_R2;
const veiligeNaam = n => {
  n = String(n || '').split(/[\\/]/).pop().trim();
  if (!n || n.startsWith('.') || n.length > 200) return '';
  return n;
};
// Serveert Bronnen/<bestand> uit R2 (achter Cloudflare Access).
export async function onRequestGet({ env, params }) {
  const r2 = r2Van(env);
  let ruw = [].concat(params.pad || []).join('/');
  try { ruw = decodeURIComponent(ruw); } catch (e) {}
  const naam = veiligeNaam(ruw);
  if (!r2 || !naam) return new Response('Niet gevonden', { status: 404 });
  const o = await r2.get(naam);
  if (!o) return new Response('Niet gevonden', { status: 404 });
  const h = new Headers();
  o.writeHttpMetadata(h);
  if (!h.get('content-type')) h.set('content-type', naam.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  h.set('content-disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(naam));
  h.set('cache-control', 'private, max-age=300');
  h.set('etag', o.httpEtag);
  return new Response(o.body, { headers: h });
}
