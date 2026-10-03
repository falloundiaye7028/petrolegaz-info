// Lecture publique uniquement. La rédaction reste dans Airtable, avec ses accès privés.
// Aucun jeton, champ interne, brouillon ou article futur ne quitte ce serveur.
const BASE_ID = 'appCQuqklwVbrz7XF';
const DEFAULT_TABLE = 'Actualités';
const CATEGORIES = ['Pétrole', 'Gaz', 'Mines'];
const ACTOR_TYPES = ['Entreprise', 'Institution', 'Projet', 'Autre'];
const FIELDS = ['Titre', 'Résumé', 'Contenu', 'Catégorie', 'Organisation', 'Type d’acteur',
  'Localisation', 'Date de publication', 'Source', 'Lien source', 'Photo', 'Légende photo',
  'Crédit photo', 'Statut', 'Slug'];
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const TIMEOUT_MS = 7000;
const CURSOR_AGE_MS = 60 * 60 * 1000;
const MAX_UPSTREAM_PAGES = 4;
const ACCENTS = { à: 'a', â: 'a', ä: 'a', æ: 'ae', ç: 'c', é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', ô: 'o', ö: 'o', œ: 'oe', ù: 'u', û: 'u', ü: 'u', ÿ: 'y' };

function failure(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function invalidQuery() {
  return failure(400, 'INVALID_QUERY', 'Paramètres invalides ou pagination expirée. Relancez la recherche.');
}
function unavailable() {
  return failure(503, 'ACTUALITES_UNAVAILABLE', 'La rubrique Actualités est temporairement indisponible.');
}
function upstreamFailure() {
  return failure(502, 'UPSTREAM_UNAVAILABLE', 'La source des actualités est temporairement indisponible.');
}
function text(value, maximum, paragraphs = false) {
  if (typeof value !== 'string') return '';
  const clean = value.normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '');
  const normalized = paragraphs ? clean.trim() : clean.replace(/\s+/g, ' ').trim();
  return normalized.length <= maximum ? normalized : '';
}
function fold(value) {
  return value.toLowerCase().replace(/[àâäæçéèêëîïôöœùûüÿ]/g, letter => ACCENTS[letter]);
}
function safeUrl(value, image = false) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\u0000-\u001F\u007F\\]/.test(value)) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || (image && url.protocol !== 'https:') || url.username || url.password) return '';
    // Public DNS destinations only; no localhost, intranet names or IP literals.
    if (!hostname.includes('.') || /^\d+(\.\d+){3}$/.test(hostname) || hostname.includes(':') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)) return '';
    return url.href;
  } catch { return ''; }
}
function dateValue(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() ||
    (hour !== undefined && (+hour > 23 || +minute > 59 || +second > 59)) ||
    (zone && zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
function normalize(record, asOf) {
  if (!record || !RECORD_ID.test(record.id) || !record.fields || typeof record.fields !== 'object') return null;
  const fields = record.fields;
  if (fields.Statut !== 'Publié') return null;
  const title = text(fields.Titre, 220);
  const body = text(fields.Contenu, 50000, true);
  const category = fields['Catégorie'];
  const sourceName = text(fields.Source, 200);
  const sourceUrl = safeUrl(fields['Lien source']);
  const publishedAt = dateValue(fields['Date de publication']);
  if (!title || !body || !CATEGORIES.includes(category) || !sourceName || !sourceUrl ||
    publishedAt === null || publishedAt > asOf) return null;
  const caption = text(fields['Légende photo'], 350);
  const credit = text(fields['Crédit photo'], 200);
  let image = null;
  if (Array.isArray(fields.Photo)) {
    for (const photo of fields.Photo.slice(0, 10)) {
      const url = photo && safeUrl(photo.url, true);
      // SVG/documents/HTML are not news photographs. Do not expose attachment metadata.
      if (url && /^image\/(jpeg|png|webp|gif|avif)$/i.test(photo.type || '')) {
        image = { url, alt: caption || title, caption, credit };
        break;
      }
    }
  }
  const slug = text(fields.Slug, 160);
  return {
    id: record.id,
    slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : record.id,
    title,
    summary: text(fields['Résumé'], 650),
    body,
    category,
    organization: text(fields.Organisation, 200),
    actorType: ACTOR_TYPES.includes(fields['Type d’acteur']) ? fields['Type d’acteur'] : 'Autre',
    location: text(fields.Localisation, 200),
    publishedAt: new Date(publishedAt).toISOString(),
    sourceName,
    sourceUrl,
    image,
  };
}
function parseQuery(query, now) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw invalidQuery();
  const allowed = new Set(['id', 'limit', 'cursor', 'q', 'category', 'actorType']);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key) || typeof query[key] !== 'string') throw invalidQuery();
  }
  if (query.id !== undefined) {
    if (!RECORD_ID.test(query.id) || Object.keys(query).length !== 1) throw invalidQuery();
    return { id: query.id, limit: 1, q: '', category: '', actorType: '', asOf: now, offset: '' };
  }
  const limit = query.limit === undefined ? 12 : Number(query.limit);
  if (query.limit !== undefined && !/^[1-9]\d?$/.test(query.limit)) throw invalidQuery();
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) throw invalidQuery();
  const rawQuery = query.q || '';
  if (rawQuery.length > 120 || /[\u0000-\u001F\u007F]/.test(rawQuery)) throw invalidQuery();
  const q = fold(text(rawQuery, 120));
  const category = query.category || '';
  const actorType = query.actorType || '';
  if ((category && !CATEGORIES.includes(category)) || (actorType && !ACTOR_TYPES.includes(actorType))) throw invalidQuery();
  const scope = JSON.stringify([q, category, actorType]);
  let asOf = now;
  let offset = '';
  if (query.cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,4096}$/.test(query.cursor)) throw invalidQuery();
    try {
      const cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (!cursor || cursor.v !== 1 || cursor.scope !== scope || typeof cursor.offset !== 'string' ||
        !cursor.offset || cursor.offset.length > 1024 || /[\u0000-\u001F\u007F]/.test(cursor.offset) ||
        !Number.isSafeInteger(cursor.asOf) || cursor.asOf > now || now - cursor.asOf > CURSOR_AGE_MS) throw invalidQuery();
      offset = cursor.offset;
      asOf = cursor.asOf;
    } catch { throw invalidQuery(); }
  }
  return { id: '', limit, q, category, actorType, scope, asOf, offset };
}
function formulaString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
function formulaFor(query) {
  const parts = ["{Statut}='Publié'", "{Date de publication}!=''",
    `NOT(IS_AFTER({Date de publication},DATETIME_PARSE(${formulaString(new Date(query.asOf).toISOString())})))`,
    "{Titre}!=''", "{Contenu}!=''", "{Source}!=''", "{Lien source}!=''",
    `OR(${CATEGORIES.map(value => `{Catégorie}=${formulaString(value)}`).join(',')})`];
  if (query.id) parts.push(`RECORD_ID()=${formulaString(query.id)}`);
  if (query.category) parts.push(`{Catégorie}=${formulaString(query.category)}`);
  if (query.actorType === 'Autre') parts.push("OR({Type d’acteur}='Autre',{Type d’acteur}='')");
  else if (query.actorType) parts.push(`{Type d’acteur}=${formulaString(query.actorType)}`);
  if (query.q) {
    let expression = "LOWER({Titre}&' '&{Résumé}&' '&{Organisation}&' '&{Localisation}&' '&{Source})";
    for (const [accent, replacement] of Object.entries(ACCENTS)) {
      expression = `SUBSTITUTE(${expression},${formulaString(accent)},${formulaString(replacement)})`;
    }
    parts.push(`FIND(${formulaString(query.q)},${expression})>0`);
  }
  return `AND(${parts.join(',')})`;
}
function matches(article, query) {
  return (!query.id || article.id === query.id) && (!query.category || article.category === query.category) &&
    (!query.actorType || article.actorType === query.actorType) && (!query.q ||
      fold([article.title, article.summary, article.organization, article.location, article.sourceName].join(' ')).includes(query.q));
}
async function readPage(table, token, query, offset, limit, signal) {
  const params = new URLSearchParams({
    filterByFormula: formulaFor(query),
    'sort[0][field]': 'Date de publication',
    'sort[0][direction]': 'desc',
    'sort[1][field]': 'Titre',
    'sort[1][direction]': 'asc',
    pageSize: String(limit),
  });
  for (const field of FIELDS) params.append('fields[]', field);
  if (offset) params.set('offset', offset);
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}?${params}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (!response.ok) {
    if ([401, 403, 404, 422].includes(response.status)) {
      if (response.status === 422 && offset) {
        let payload;
        try { payload = await response.json(); } catch { /* Return a generic error below. */ }
        if (['LIST_RECORDS_ITERATOR_NOT_AVAILABLE', 'INVALID_OFFSET_VALUE'].includes(payload?.error?.type)) throw invalidQuery();
      }
      throw unavailable();
    }
    throw upstreamFailure();
  }
  let data;
  try { data = await response.json(); } catch { throw upstreamFailure(); }
  if (!data || !Array.isArray(data.records) || data.records.length > limit ||
    (data.offset !== undefined && (typeof data.offset !== 'string' || !data.offset ||
      data.offset.length > 1024 || /[\u0000-\u001F\u007F]/.test(data.offset)))) throw upstreamFailure();
  return data;
}

export default async function handler(req, res) {
  // No stale cache: archiving and corrections must not leave a public stale copy.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée', code: 'METHOD_NOT_ALLOWED' });
  }
  let timer;
  let controller;
  try {
    const query = parseQuery(req.query || {}, Date.now());
    const token = process.env.AIRTABLE_TOKEN;
    const table = process.env.AIRTABLE_ACTUALITES_TABLE === undefined ? DEFAULT_TABLE : process.env.AIRTABLE_ACTUALITES_TABLE;
    if (!token || typeof table !== 'string' || !table.trim() || table.length > 200 || /[\u0000-\u001F\u007F]/.test(table)) throw unavailable();
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const articles = [];
    const seenIds = new Set();
    const seenOffsets = new Set(query.offset ? [query.offset] : []);
    let offset = query.offset;
    for (let page = 0; page < MAX_UPSTREAM_PAGES; page++) {
      const data = await readPage(table, token, query, offset, query.limit - articles.length, controller.signal);
      for (const record of data.records) {
        const article = normalize(record, query.asOf);
        if (article && matches(article, query) && !seenIds.has(article.id)) {
          articles.push(article);
          seenIds.add(article.id);
        }
      }
      offset = data.offset || '';
      if (offset && seenOffsets.has(offset)) throw upstreamFailure();
      if (offset) seenOffsets.add(offset);
      if (!offset || articles.length >= query.limit || query.id) break;
    }
    if (query.id) {
      if (!articles.length) return res.status(404).json({ error: 'Article introuvable', code: 'ARTICLE_NOT_FOUND' });
      return res.status(200).json({ article: articles[0] });
    }
    const nextCursor = offset ? Buffer.from(JSON.stringify({ v: 1, offset, asOf: query.asOf, scope: query.scope })).toString('base64url') : null;
    return res.status(200).json({ articles, count: articles.length, hasMore: Boolean(offset), nextCursor });
  } catch (error) {
    if (controller?.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return res.status(504).json({ error: 'La source des actualités met trop de temps à répondre.', code: 'UPSTREAM_TIMEOUT' });
    }
    const status = error?.status || 502;
    return res.status(status).json({ error: error?.code ? error.message : 'La source des actualités est temporairement indisponible.',
      code: error?.code || 'UPSTREAM_UNAVAILABLE' });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
