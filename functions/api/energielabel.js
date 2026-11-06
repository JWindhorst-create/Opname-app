// Laatst geregistreerde energielabel uit EP-Online (RVO Public API v5).
// De API-sleutel staat als geheim in Cloudflare: variabele EP_ONLINE_KEY (nooit in de code).
const j = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const zoek = (o, re) => { for (const k of Object.keys(o || {})) if (re.test(k) && o[k] != null && o[k] !== '') return o[k]; return null; };
const datum = v => { if (!v) return ''; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v); };

export async function onRequestGet({ env, request }) {
  const key = env.EP_ONLINE_KEY || env.EPONLINE_KEY || env.EP_ONLINE_API_KEY;
  if (!key) return j({ fout: 'Geen EP-Online API-sleutel ingesteld (EP_ONLINE_KEY)' }, 503);
  const q = new URL(request.url).searchParams;
  const vbo = (q.get('vbo') || '').replace(/\D/g, '');
  let url;
  if (vbo.length === 16) url = 'https://public.ep-online.nl/api/v5/PandEnergielabel/AdresseerbaarObject/' + vbo;
  else {
    const p = new URLSearchParams();
    const pc = (q.get('postcode') || '').replace(/\s/g, '').toUpperCase(), hn = (q.get('huisnummer') || '').replace(/\D/g, '');
    if (!/^\d{4}[A-Z]{2}$/.test(pc) || !hn) return j({ fout: 'Postcode en huisnummer nodig' }, 400);
    p.set('postcode', pc); p.set('huisnummer', hn);
    if (q.get('huisletter')) p.set('huisletter', q.get('huisletter'));
    if (q.get('toevoeging')) p.set('huisnummertoevoeging', q.get('toevoeging'));
    url = 'https://public.ep-online.nl/api/v5/PandEnergielabel/Adres?' + p;
  }
  let r;
  try { r = await fetch(url, { headers: { Authorization: key, accept: 'application/json' } }); }
  catch (e) { return j({ fout: 'EP-Online niet bereikbaar' }, 502); }
  if (r.status === 404 || r.status === 204) return j({ gevonden: false });
  if (r.status === 401 || r.status === 403) return j({ fout: 'EP-Online weigert de API-sleutel' }, 502);
  if (!r.ok) return j({ fout: 'EP-Online gaf fout ' + r.status }, 502);
  let d; try { d = await r.json(); } catch (e) { return j({ gevonden: false }); }
  const lijst = Array.isArray(d) ? d : (d ? [d] : []);
  if (!lijst.length) return j({ gevonden: false });
  // nieuwste registratie eerst
  lijst.sort((a, b) => String(zoek(b, /registratiedatum/i) || '').localeCompare(String(zoek(a, /registratiedatum/i) || '')));
  const x = lijst[0];
  const klasse = zoek(x, /^(labelletter|energieklasse|energielabel|label)$/i) || zoek(x, /energieklasse|labelletter/i);
  if (!klasse) return j({ gevonden: false });
  return j({
    gevonden: true,
    klasse: String(klasse),
    registratiedatum: datum(zoek(x, /registratiedatum/i)),
    geldigTot: datum(zoek(x, /geldig.?tot/i)),
    opnamedatum: datum(zoek(x, /opnamedatum/i)),
    soort: zoek(x, /soort.?opname|berekeningstype/i) || ''
  });
}
