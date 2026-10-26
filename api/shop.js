const DB = 'https://larp-larp-sahur-default-rtdb.firebaseio.com';

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const TYPES = ['avatar', 'effect', 'banner'];

const PRIZES = [
  { coins: 5,   weight: 22 },
  { coins: 10,  weight: 18 },
  { coins: 15,  weight: 15 },
  { coins: 20,  weight: 12 },
  { coins: 25,  weight: 10 },
  { coins: 30,  weight: 8 },
  { coins: 35,  weight: 6 },
  { coins: 40,  weight: 5 },
  { coins: 100, weight: 4 }
];

const slug = f => String(f).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

const cache = new Map();

function pageUrlFrom(req) {
  const host = req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  let pathname = '/';
  try { pathname = new URL(req.headers.referer || '').pathname || '/'; } catch {}
  return `${proto}://${host}${pathname}`;
}

async function loadItems(req) {
  const url = pageUrlFrom(req);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < 60 * 1000) return hit.items;
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error('could not fetch shop page: ' + res.status);
  const html = await res.text();

  const items = [];
  const tagRe = /<[a-z]+\b[^>]*\bclass\s*=\s*["'][^"']*\bshop-item\b[^"']*["'][^>]*>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = {};
    const attrRe = /\bdata-([a-z-]+)\s*=\s*"([^"]*)"/gi;
    let a;
    while ((a = attrRe.exec(m[0])) !== null) attrs[a[1].toLowerCase()] = a[2];
    const price = parseInt(attrs.price, 10);
    if (!attrs.file || !TYPES.includes(attrs.type) || !Number.isFinite(price) || price < 0) continue;
    items.push({ id: slug(attrs.file), type: attrs.type, price });
  }
  cache.set(url, { t: Date.now(), items });
  return items;
}



function uidFromToken(token) {
  
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch { return null; }
}

async function dbGet(path, token) {
  const r = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error('db read failed: ' + r.status);
  return r.json();
}

async function dbPatch(path, token, body) {
  const r = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.ok;
}


function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function pickPrize() {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PRIZES.length; i++) {
    r -= PRIZES[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

function publicState(v) {
  v = v || {};
  const last = v.lastSpinAt || 0;
  return {
    coins: v.coins || 0,
    owned: v.owned || {},
    equipped: v.equipped || {},
    lastSpinAt: last,
    nextSpinAt: last ? last + SPIN_COOLDOWN_MS : 0,
    prizes: PRIZES.map(p => p.coins)
  };
}



module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const uid = token && uidFromToken(token);
    if (!uid) return send(res, 401, { error: 'not signed in' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const path = 'shop/' + uid;
    const cur = (await dbGet(path, token)) || {};

    switch (body.action) {
      case 'state':
        return send(res, 200, publicState(cur));

      case 'spin': {
        if (cur.lastSpinAt && Date.now() - cur.lastSpinAt < SPIN_COOLDOWN_MS) {
          return send(res, 429, { error: 'cooldown', ...publicState(cur) });
        }
        const idx = pickPrize();
        
        const ok = await dbPatch(path, token, {
          coins: (cur.coins || 0) + PRIZES[idx].coins,
          lastSpinAt: { '.sv': 'timestamp' }
        });
        const fresh = (await dbGet(path, token)) || {};
        if (!ok) return send(res, 429, { error: 'cooldown', ...publicState(fresh) });
        return send(res, 200, { prizeIndex: idx, reward: PRIZES[idx].coins, ...publicState(fresh) });
      }

      case 'buy': {
        const item = (await loadItems(req)).find(i => i.id === body.id);
        if (!item) return send(res, 404, { error: 'no such item' });
        if (cur.owned && cur.owned[item.id]) return send(res, 409, { error: 'already owned', ...publicState(cur) });
        if ((cur.coins || 0) < item.price) return send(res, 402, { error: 'not enough coins', ...publicState(cur) });
        const ok = await dbPatch(path, token, {
          coins: cur.coins - item.price,
          ['owned/' + item.id]: true
        });
        const fresh = (await dbGet(path, token)) || {};
        if (!ok) return send(res, 409, { error: 'purchase failed, try again', ...publicState(fresh) });
        return send(res, 200, publicState(fresh));
      }

      case 'equip': {
        const type = body.type;
        if (!TYPES.includes(type)) return send(res, 400, { error: 'bad type' });
        if (body.id) {
          const item = (await loadItems(req)).find(i => i.id === body.id && i.type === type);
          if (!item) return send(res, 404, { error: 'no such item' });
          if (!(cur.owned && cur.owned[item.id])) return send(res, 403, { error: 'not owned' });
        }
        await dbPatch(path, token, { ['equipped/' + type]: body.id || null });
        const fresh = (await dbGet(path, token)) || {};
        return send(res, 200, publicState(fresh));
      }

      default:
        return send(res, 400, { error: 'unknown action' });
    }
  } catch (err) {
    console.error('worker error', err);
    return send(res, 500, { error: 'server error' });
  }
};
