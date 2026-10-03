/* Local-only visual QA server. Never deploy. All example news is explicitly TEST. */
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const modes = new Set(['empty', 'populated', 'unavailable', 'notfound', 'xss', 'race']);
const apiRequests = [];
function article(n) {
  return { id: 'rec' + String(n).padStart(14, '0'), slug: 'test-' + n, title: 'TEST — Activité du secteur ' + n,
    summary: 'TEST — Résumé fictif réservé à la vérification du lecteur. Aucune actualité réelle.',
    body: 'TEST — Premier paragraphe de vérification.\nUne deuxième ligne.\n\nTEST — Deuxième paragraphe de vérification.',
    category: ['Pétrole', 'Gaz', 'Mines'][(n - 1) % 3], organization: 'TEST — Organisation ' + n,
    actorType: ['Entreprise', 'Institution', 'Projet', 'Autre'][(n - 1) % 4], location: 'TEST — Lieu',
    publishedAt: '2020-03-05T14:00:00.000Z', sourceName: 'TEST — Source originale', sourceUrl: 'https://example.test/TEST-' + n, image: null };
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const cookie = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
  let mode = cookie.TEST_NEWS_MODE || 'empty';
  if (url.pathname === '/__qa__/scenario') {
    mode = modes.has(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'empty';
    res.setHeader('Set-Cookie', 'TEST_NEWS_MODE=' + mode + '; Path=/; SameSite=Strict');
    const width = Number(url.searchParams.get('width'));
    const page = url.searchParams.get('page') === 'home' ? '/' : url.searchParams.get('page') === 'detail' ? '/actualite.html?id=rec00000000000001' : '/actualites.html';
    if ([360, 390, 800, 1024, 1201, 1280, 1440].includes(width)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!DOCTYPE html><html lang="fr"><title>Local QA — ' + mode + ' — ' + width + 'px</title><body style="margin:0;background:#ddd"><iframe title="Local QA preview" src="' + page + '" width="' + width + '" height="2400" style="display:block;border:0;background:white"></iframe></body></html>');
    } else { res.writeHead(302, { Location: page }).end(); }
    return;
  }
  if (url.pathname === '/__qa__/requests') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(apiRequests)); return; }
  if (url.pathname === '/api/actualites') {
    apiRequests.push({ mode, query: Object.fromEntries(url.searchParams) });
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'unavailable') { res.writeHead(503).end(JSON.stringify({ code: 'NOT_CONFIGURED', error: 'TEST configuration unavailable' })); return; }
    if (mode === 'notfound') { res.writeHead(404).end(JSON.stringify({ code: 'NOT_FOUND', error: 'TEST unpublished' })); return; }
    let articles = mode === 'empty' ? [] : Array.from({ length: 14 }, (_, i) => article(i + 1));
    if (mode === 'xss') {
      const attack = 'TEST <img src=x onerror="window.TEST_XSS=1"><script>window.TEST_XSS=2</script>';
      articles = [{ ...article(1), title: attack, body: attack, summary: attack, organization: attack, sourceName: attack }];
    }
    if (url.searchParams.has('id')) { res.end(JSON.stringify({ article: articles.find(a => a.id === url.searchParams.get('id')) })); return; }
    if (url.searchParams.has('category')) articles = articles.filter(a => a.category === url.searchParams.get('category'));
    if (url.searchParams.has('actorType')) articles = articles.filter(a => a.actorType === url.searchParams.get('actorType'));
    if (url.searchParams.has('q')) articles = articles.filter(a => (a.title + ' ' + a.body).toLowerCase().includes(url.searchParams.get('q').toLowerCase()));
    const start = url.searchParams.get('cursor') === 'TEST-page-2' ? 12 : 0;
    const selected = articles.slice(start, start + 12), hasMore = articles.length > start + 12;
    const finish = () => res.end(JSON.stringify({ articles: selected, count: selected.length, hasMore, nextCursor: hasMore ? 'TEST-page-2' : null }));
    if (mode === 'race' && !url.searchParams.has('category')) setTimeout(finish, 2500); else finish();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  fs.readFile(file, (error, data) => { if (error) res.writeHead(404).end(); else res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data); });
});
server.listen(Number(process.env.NEWS_QA_PORT || 4387), '127.0.0.1', () => console.log('Local-only news QA: http://127.0.0.1:' + server.address().port + '/__qa__/scenario?mode=empty'));
