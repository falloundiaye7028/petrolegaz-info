// No network, token or production data: all records and Airtable responses are fixtures.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../api/actualites.js'), 'utf8')
  .replace('export default async function handler', 'async function handler');
const NOW = Date.parse('2026-10-03T00:00:00.000Z');
class Clock extends Date { static now() { return NOW; } }
const clean = value => JSON.parse(JSON.stringify(value));
const id = n => `rec${String(n).padStart(14, '0')}`;
const article = (n = 1, changes = {}) => ({ id: id(n), createdTime: 'private-created-time', fields: {
  Titre: 'Projet gazier au Sénégal', Résumé: 'Une information vérifiée.',
  Contenu: 'Premier paragraphe.\r\n\r\nDeuxième paragraphe.', Catégorie: 'Gaz',
  Organisation: 'Organisation exemple', 'Type d’acteur': 'Institution', Localisation: 'Dakar',
  'Date de publication': '2026-10-02T12:30:00.000Z', Source: 'Communiqué officiel',
  'Lien source': 'https://example.com/communique', Statut: 'Publié', Slug: 'projet-gazier',
  Photo: [{ url: 'https://images.example.com/photo.jpg', type: 'image/jpeg', filename: 'private-filename.jpg',
    thumbnails: { full: { url: 'https://private.example.com/' } }, id: 'private-attachment-id' }],
  'Légende photo': 'Vue du site.', 'Crédit photo': 'Auteur autorisé',
  Email: 'private@example.com', Notes: 'private-editorial-note', ...changes,
} });
const ok = (records, offset) => ({ ok: true, status: 200, json: async () => ({ records, ...(offset ? { offset } : {}) }) });
function fixture(fetcher = async () => ok([article()]), env = { AIRTABLE_TOKEN: 'secret-test-token' }, fastTimeout = false) {
  const requests = [];
  let timeouts = 0;
  let clears = 0;
  const context = vm.createContext({ URL, URLSearchParams, Buffer, AbortController, Date: Clock,
    process: { env },
    setTimeout(fn, duration) { timeouts++; assert.equal(duration, 7000); return setTimeout(fn, fastTimeout ? 5 : duration); },
    clearTimeout(handle) { clears++; clearTimeout(handle); },
    fetch: async (url, options) => { requests.push({ url: new URL(url), options }); return fetcher(url, options, requests.length); },
  });
  vm.runInContext(source, context);
  return {
    context, requests,
    timers: () => ({ timeouts, clears }),
    async request(query = {}, method = 'GET') {
      const result = { headers: {} };
      await context.handler({ method, query }, {
        setHeader(name, value) { result.headers[name] = value; },
        status(status) { result.status = status; return this; },
        json(data) { result.data = clean(data); return this; },
      });
      return result;
    },
  };
}
(async () => {
  let app = fixture();
  let result = await app.request();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data).sort(), ['articles', 'count', 'hasMore', 'nextCursor']);
  assert.equal(result.data.count, 1);
  assert.equal(result.data.hasMore, false);
  assert.equal(result.data.nextCursor, null);
  assert.equal(result.data.articles[0].body, 'Premier paragraphe.\n\nDeuxième paragraphe.');
  assert.equal(result.data.articles[0].image.alt, 'Vue du site.');
  assert.equal(result.data.articles[0].publishedAt, '2026-10-02T12:30:00.000Z');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.doesNotMatch(JSON.stringify(result), /private-|private@|secret-test-token|Statut|Publié|createdTime|thumbnails|filename/);
  assert.deepEqual(Object.keys(result.data.articles[0]).sort(), [
    'id', 'slug', 'title', 'summary', 'body', 'category', 'organization', 'actorType', 'location',
    'publishedAt', 'sourceName', 'sourceUrl', 'image',
  ].sort());
  assert.equal(app.requests[0].url.origin, 'https://api.airtable.com');
  assert.equal(decodeURIComponent(app.requests[0].url.pathname), '/v0/appCQuqklwVbrz7XF/Actualités');
  assert.equal(app.requests[0].options.method, 'GET');
  assert.equal(app.requests[0].options.headers.Authorization, 'Bearer secret-test-token');
  assert.equal(app.requests[0].url.searchParams.getAll('fields[]').length, 15);
  assert.equal(app.requests[0].url.searchParams.get('pageSize'), '12');
  assert.equal(app.requests[0].url.searchParams.get('sort[0][field]'), 'Date de publication');
  assert.match(app.requests[0].url.searchParams.get('filterByFormula'), /Statut.*Publié.*NOT\(IS_AFTER/);
  assert.deepEqual(app.timers(), { timeouts: 1, clears: 1 });

  // Every publication precondition is independently checked after Airtable filtering.
  for (const fields of [
    { Statut: 'Brouillon' }, { Statut: 'Archivé' }, { Statut: 'publié' }, { Statut: 'Publié ' },
    { 'Date de publication': '2026-10-03T00:00:00.001Z' }, { 'Date de publication': '' },
    { 'Date de publication': '2026-02-30T12:30:00Z' }, { 'Date de publication': 'invalid' },
    { 'Date de publication': '2026-10-02T24:00:00Z' }, { 'Date de publication': '2026-10-02T12:30:00' },
    { Titre: '' }, { Titre: '  \u0000 ' }, { Titre: ['not-a-string'] }, { Titre: 'x'.repeat(221) },
    { Contenu: '' }, { Contenu: 'x'.repeat(50001) }, { Catégorie: 'Énergie' }, { Catégorie: ['Gaz'] },
    { Source: '' }, { Source: {} }, { 'Lien source': '' }, { 'Lien source': 'javascript:alert(1)' },
    { 'Lien source': 'data:text/html,boom' }, { 'Lien source': '//example.com/' },
    { 'Lien source': 'https://user:password@example.com/' }, { 'Lien source': 'https://example.com/\nboom' },
    { 'Lien source': 'https://127.0.0.1/' }, { 'Lien source': 'https://localhost/' },
    { 'Lien source': 'https://example.internal/' }, { 'Lien source': 'https://[::1]/' },
  ]) {
    app = fixture(async () => ok([article(1, fields)]));
    result = await app.request();
    assert.equal(result.status, 200, JSON.stringify(fields));
    assert.equal(result.data.count, 0, JSON.stringify(fields));
    assert.equal((await app.request({ id: id(1) })).status, 404, JSON.stringify(fields));
  }
  app = fixture(async () => ok([article(1, { 'Date de publication': '2026-10-03T00:00:00Z', 'Lien source': 'http://example.com/' })]));
  assert.equal((await app.request()).data.count, 1, 'publication exactly now and HTTP source allowed');
  app = fixture(async () => ok([article(1, { 'Date de publication': '2026-10-02' })]));
  assert.equal((await app.request()).data.articles[0].publishedAt, '2026-10-02T00:00:00.000Z');

  // Text is not interpreted as markup; consumers must render it as textContent.
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  app = fixture(async () => ok([article(1, { Titre: payload, Résumé: payload, Contenu: payload,
    Organisation: payload, Source: payload, 'Légende photo': payload, 'Crédit photo': payload,
    Slug: '../../unsafe', 'Type d’acteur': 'Unexpected' })]));
  result = await app.request();
  assert.equal(result.data.articles[0].title, payload);
  assert.equal(result.data.articles[0].body, payload);
  assert.equal(result.data.articles[0].slug, id(1));
  assert.equal(result.data.articles[0].actorType, 'Autre');
  assert.equal(result.data.articles[0].image.alt, payload);
  for (const photo of [
    { url: 'http://images.example.com/x.jpg', type: 'image/jpeg' },
    { url: 'javascript:alert(1)', type: 'image/jpeg' },
    { url: 'https://user:pass@example.com/x.jpg', type: 'image/jpeg' },
    { url: 'https://example.com/x.svg', type: 'image/svg+xml' },
    { url: 'https://example.com/x.html', type: 'text/html' },
    { url: 'https://127.0.0.1/x.jpg', type: 'image/jpeg' },
  ]) {
    app = fixture(async () => ok([article(1, { Photo: [photo] })]));
    result = await app.request();
    assert.equal(result.data.count, 1, 'bad image must not hide valid article');
    assert.equal(result.data.articles[0].image, null);
  }
  app = fixture(async () => ok([article(1, { Photo: [], 'Légende photo': '' })]));
  assert.equal((await app.request()).data.articles[0].image, null);
  app = fixture(async () => ok([article(1, { 'Légende photo': '' })]));
  assert.equal((await app.request()).data.articles[0].image.alt, 'Projet gazier au Sénégal');

  // Detail has the same publication gate and exposes only the requested record.
  app = fixture();
  result = await app.request({ id: id(1) });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data), ['article']);
  assert.match(app.requests[0].url.searchParams.get('filterByFormula'), new RegExp(`RECORD_ID\\(\\)='${id(1)}'`));
  assert.equal((await app.request({ id: id(2) })).status, 404);
  app = fixture(async () => ok([]));
  result = await app.request();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { articles: [], count: 0, hasMore: false, nextCursor: null });
  assert.equal((await app.request({ id: id(1) })).status, 404);

  // Server pagination fills a short page after invalid rows and retains its snapshot.
  app = fixture(async (_url, _options, call) => {
    if (call === 1) return ok([article(1), article(2, { Statut: 'Brouillon' })], 'offset-one');
    if (call === 2) return ok([article(3)], 'offset-two');
    return ok([article(4)]);
  });
  result = await app.request({ limit: '2' });
  assert.deepEqual(result.data.articles.map(value => value.id), [id(1), id(3)]);
  assert.equal(result.data.hasMore, true);
  assert.equal(app.requests[1].url.searchParams.get('pageSize'), '1');
  assert.equal(app.requests[1].url.searchParams.get('offset'), 'offset-one');
  const cursor = result.data.nextCursor;
  result = await app.request({ limit: '2', cursor });
  assert.equal(result.data.articles[0].id, id(4));
  assert.equal(app.requests[2].url.searchParams.get('offset'), 'offset-two');
  assert.equal(app.requests[0].url.searchParams.get('filterByFormula'), app.requests[2].url.searchParams.get('filterByFormula'));
  assert.equal(result.data.hasMore, false);
  assert.equal((await app.request({ cursor, category: 'Mines' })).status, 400);
  const expired = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  expired.asOf = NOW - 3600001;
  assert.equal((await app.request({ cursor: Buffer.from(JSON.stringify(expired)).toString('base64url') })).status, 400);
  expired.asOf = NOW + 1;
  assert.equal((await app.request({ cursor: Buffer.from(JSON.stringify(expired)).toString('base64url') })).status, 400);
  app = fixture(async (_url, _options, call) => ok([article(call, { Statut: 'Brouillon' })], `offset-${call}`));
  result = await app.request({ limit: '1' });
  assert.equal(app.requests.length, 4, 'bounded upstream scan');
  assert.equal(result.data.count, 0);
  assert.equal(result.data.hasMore, true, 'do not falsely claim the catalogue is exhausted');
  app = fixture(async () => ok([article(1, { Statut: 'Brouillon' })], 'same-offset'));
  assert.equal((await app.request()).status, 502, 'looping offsets are not a successful empty catalogue');

  // Search/category/type are server-side and are also checked against normalized data.
  app = fixture(async () => ok([article(1), article(2, { Catégorie: 'Mines' }), article(3, { 'Type d’acteur': 'Entreprise' })]));
  result = await app.request({ q: 'SENEGAL', category: 'Gaz', actorType: 'Institution' });
  assert.equal(result.data.count, 1);
  const formula = app.requests[0].url.searchParams.get('filterByFormula');
  assert.match(formula, /SUBSTITUTE/);
  assert.match(formula, /FIND\('senegal'/);
  assert.match(formula, /\{Catégorie\}='Gaz'/);
  assert.match(formula, /\{Type d’acteur\}='Institution'/);
  assert.equal((await app.request({ q: 'inexistant' })).data.count, 0);
  app = fixture(async () => ok([]));
  await app.request({ q: "x') OR TRUE() \\" });
  const escaped = app.requests[0].url.searchParams.get('filterByFormula');
  assert.ok(escaped.includes("FIND('x\\') or true() \\\\'"), escaped);
  assert.equal(app.requests[0].url.searchParams.getAll('filterByFormula').length, 1);

  // Invalid input and unsupported methods must never reach Airtable.
  for (const query of [
    { id: '../../other' }, { id: id(1), q: 'anything' }, { id: [id(1)] },
    { limit: '0' }, { limit: '-1' }, { limit: '25' }, { limit: '1.2' }, { limit: '01' },
    { limit: 'NaN' }, { cursor: '' }, { cursor: '**' }, { cursor: 'abc' },
    { q: 'x'.repeat(121) }, { q: 'x\n' }, { category: 'All' }, { actorType: 'Corporate' },
    { arbitrary: 'field' }, { category: ['Gaz'] },
  ]) {
    app = fixture();
    result = await app.request(query);
    assert.equal(result.status, 400, JSON.stringify(query));
    assert.equal(app.requests.length, 0);
  }
  for (const method of ['POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    app = fixture();
    result = await app.request({}, method);
    assert.equal(result.status, 405);
    assert.equal(result.headers.Allow, 'GET');
    assert.equal(app.requests.length, 0);
  }

  // Missing configuration/table/schema/permissions must not masquerade as no articles.
  for (const env of [{}, { AIRTABLE_TOKEN: '' }, { AIRTABLE_TOKEN: 'secret', AIRTABLE_ACTUALITES_TABLE: '' }]) {
    app = fixture(undefined, env);
    result = await app.request();
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'ACTUALITES_UNAVAILABLE');
    assert.equal(app.requests.length, 0);
  }
  app = fixture(undefined, { AIRTABLE_TOKEN: 'secret', AIRTABLE_ACTUALITES_TABLE: 'tblCustomNews00001' });
  assert.equal((await app.request()).status, 200);
  assert.match(app.requests[0].url.pathname, /tblCustomNews00001$/);
  for (const status of [401, 403, 404, 422, 429, 500, 503]) {
    app = fixture(async () => ({ ok: false, status, json: async () => ({ error: { message: 'private-token-and-schema-details' } }) }));
    result = await app.request();
    assert.equal(result.status, status < 429 ? 503 : 502);
    assert.doesNotMatch(JSON.stringify(result), /private|token|schema/);
    assert.equal(result.data.articles, undefined);
  }
  for (const data of [{}, { records: {} }, { records: [], offset: 42 }, { records: [], offset: '' }]) {
    app = fixture(async () => ({ ok: true, json: async () => data }));
    assert.equal((await app.request()).status, 502);
  }
  app = fixture(async () => ({ ok: true, json: async () => { throw new Error('private-parser-error'); } }));
  assert.equal((await app.request()).status, 502);
  app = fixture(async () => { throw new Error('private-network-error'); });
  result = await app.request();
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  app = fixture(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), undefined, true);
  result = await app.request();
  assert.equal(result.status, 504);
  assert.equal(result.data.code, 'UPSTREAM_TIMEOUT');
  assert.deepEqual(app.timers(), { timeouts: 1, clears: 1 });
  console.log('PASS: read-only news API; publication allowlist; privacy; plain text; safe links/photos; strict dates; search injection; pagination; query/method validation; empty vs unavailable; upstream errors and timeout.');
})().catch(error => { console.error(error); process.exitCode = 1; });
