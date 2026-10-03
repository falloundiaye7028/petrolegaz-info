/* Local-only browser fixtures. Every fictional publication is explicitly TEST.
 * Run: node tests/actualites-ui.cjs
 * Optional: PLAYWRIGHT_MODULE, CHROMIUM_PATH, NEWS_QA_OUTPUT_DIR.
 * No external service is contacted; the HTTP server and API fixtures are local.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.NEWS_QA_OUTPUT_DIR || path.join(os.tmpdir(), 'petrolegaz-news-qa');
const imageUrl = 'https://fixtures.test/TEST-news.svg';
const fixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#143a64"/><text x="600" y="330" text-anchor="middle" fill="white" font-size="60">TEST — fixture de test</text></svg>';
function article(n = 1, overrides = {}) {
  return {
    id: 'rec' + String(n).padStart(14, '0'), slug: 'test-publication-' + n,
    title: 'TEST — Activité du secteur ' + n,
    summary: 'TEST — Résumé fictif réservé aux tests automatiques du lecteur.',
    body: 'TEST — Premier paragraphe de vérification.\nUne deuxième ligne.\n\nTEST — Deuxième paragraphe de vérification.',
    category: ['Pétrole', 'Gaz', 'Mines'][(n - 1) % 3], organization: 'TEST — Organisation ' + n,
    actorType: ['Entreprise', 'Institution', 'Projet', 'Autre'][(n - 1) % 4], location: 'TEST — Lieu',
    publishedAt: '2020-03-05T14:00:00.000Z', sourceName: 'TEST — Source originale',
    sourceUrl: 'https://source.test/TEST-publication-' + n,
    image: { url: imageUrl, alt: 'TEST — Illustration de vérification', caption: 'TEST — Légende', credit: 'TEST — Crédit' },
    ...overrides
  };
}
function pageData(articles, nextCursor = null) {
  return { articles, count: articles.length, hasMore: !!nextCursor, nextCursor };
}
const requests = [];
const failures = [];
const successes = [];
let browser, origin;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});
async function newPage(handler, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Africa/Dakar', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/actualites') {
      requests.push(url.search);
      try {
        const reply = await handler(url.searchParams, route.request());
        if (reply?.abort) return await route.abort('failed');
        return await route.fulfill({ status: reply?.status || 200, contentType: reply?.raw ? 'text/plain' : 'application/json', body: reply?.raw ?? JSON.stringify(reply?.data ?? reply) });
      } catch (error) {
        if (!page.isClosed()) throw error;
      }
    } else if (url.href === imageUrl) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureSvg });
    } else if (url.origin !== origin) {
      // Remote analytics, fonts, data, and photos must never escape this local test.
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  page.qaErrors = errors;
  page.qaContext = context;
  return page;
}
async function loaded(page, target = '#news-list') {
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', target);
}
async function go(page, suffix = '/actualites.html', target = '#news-list') {
  await page.goto(origin + suffix);
  await loaded(page, target);
}
async function assertText(page, selector, regex) {
  assert.match(await page.locator(selector).innerText(), regex);
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, JSON.stringify(dimensions));
}
async function check(name, run) {
  try { await run(); successes.push(name); console.log('PASS: ' + name); }
  catch (error) { failures.push({ name, error: String(error.stack || error) }); console.error('FAIL: ' + name + '\n' + error.stack); }
}
async function close(page) {
  assert.deepEqual(page.qaErrors, [], 'No uncaught browser exceptions');
  await page.qaContext.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  await check('list, page count, dates, sources, and detail navigation', async () => {
    const page = await newPage(params => params.has('id') ? { article: article(1) } : pageData([article(1), article(2)]));
    await go(page);
    assert.equal(await page.locator('.news-card').count(), 2);
    await assertText(page, '#news-count', /2 publications sur cette page/);
    await assertText(page, '.news-card:first-child time', /5 mars 2020/);
    await assertText(page, '.news-card:first-child', /Source : TEST — Source originale/);
    assert.equal(await page.locator('#news-pagination').isVisible(), false);
    await page.locator('.news-card:first-child h2 a').click();
    await loaded(page, '#news-article');
    await assertText(page, 'h1', /TEST — Activité du secteur 1/);
    assert.equal(await page.locator('.news-body p').count(), 2);
    assert.equal(await page.locator('.news-source a').first().getAttribute('target'), '_blank');
    assert.equal(await page.locator('.news-source a').first().getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await page.locator('.news-source a').first().getAttribute('href'), article(1).sourceUrl);
    await assertText(page, '.news-article-meta', /5 mars 2020/);
    await assertText(page, 'figcaption', /TEST — Légende · Crédit : TEST — Crédit/);
    assert.equal(await page.locator('figure img').getAttribute('alt'), 'TEST — Illustration de vérification');
    assert.equal(await page.locator('figure img').getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'index,follow');
    assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'), /actualite\.html\?id=rec00000000000001$/);
    await page.goBack(); await loaded(page);
    assert.equal(await page.locator('.news-card').count(), 2);
    await close(page);
  });

  await check('search, category, actor, reset, and browser Back/Forward', async () => {
    const seen = [];
    const page = await newPage(params => { seen.push(Object.fromEntries(params)); return pageData([article(1)]); });
    await go(page);
    await page.locator('[data-category="Gaz"]').click(); await loaded(page);
    assert.equal(seen.at(-1).category, 'Gaz');
    await page.locator('#news-query').fill('  TEST projet  ');
    await page.locator('#news-actor').selectOption('Projet');
    await page.locator('#news-filters button').click(); await loaded(page);
    assert.deepEqual(seen.at(-1), { limit: '12', q: 'TEST projet', category: 'Gaz', actorType: 'Projet' });
    assert.equal(await page.locator('[data-category="Gaz"]').getAttribute('aria-current'), 'true');
    await page.locator('#news-reset').click(); await loaded(page);
    assert.deepEqual(seen.at(-1), { limit: '12' });
    assert.equal(await page.locator('#news-query').inputValue(), '');
    assert.equal(await page.locator('#news-actor').inputValue(), '');
    await page.goBack(); await loaded(page);
    assert.equal(await page.locator('#news-query').inputValue(), 'TEST projet');
    assert.equal(await page.locator('#news-actor').inputValue(), 'Projet');
    assert.equal(seen.at(-1).category, 'Gaz');
    await page.goForward(); await loaded(page);
    assert.deepEqual(seen.at(-1), { limit: '12' });
    await close(page);
  });

  await check('pagination, previous, filter cursor reset, and focus', async () => {
    const seen = [];
    const page = await newPage(params => { seen.push(Object.fromEntries(params)); return params.get('cursor') === 'TEST-opaque-next' ? pageData([article(13)]) : pageData(Array.from({ length: 12 }, (_, i) => article(i + 1)), 'TEST-opaque-next'); });
    await go(page);
    assert.equal(await page.locator('#news-previous').isDisabled(), true);
    await page.locator('#news-next').click(); await loaded(page);
    await assertText(page, '#news-page-label', /^Page 2$/);
    await assertText(page, '#news-count', /1 publication sur cette page/);
    assert.equal(seen.at(-1).cursor, 'TEST-opaque-next');
    assert.equal(await page.locator('#news-next').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'news-count');
    await page.locator('#news-previous').click(); await loaded(page);
    await assertText(page, '#news-page-label', /^Page 1$/);
    assert.equal(seen.at(-1).cursor, undefined);
    await page.locator('#news-next').click(); await loaded(page);
    await page.locator('[data-category="Mines"]').click(); await loaded(page);
    assert.equal(seen.at(-1).cursor, undefined);
    await assertText(page, '#news-page-label', /^Page 1$/);
    await close(page);
  });

  await check('obsolete cursor has a first-page recovery action', async () => {
    let first = 0;
    const page = await newPage(params => params.has('cursor') ? { status: 400, data: { code: 'INVALID_CURSOR', error: 'TEST invalid cursor' } } : (first++, pageData([article(1)], 'TEST-old-cursor')));
    await go(page);
    await page.locator('#news-next').click(); await loaded(page);
    await assertText(page, '#news-list h2', /La liste a évolué/);
    await page.getByRole('button', { name: 'Revenir à la première page' }).click(); await loaded(page);
    assert.equal(first, 2);
    assert.equal(await page.locator('.news-card').count(), 1);
    await close(page);
  });

  await check('newer filter wins over a delayed stale response', async () => {
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const page = await newPage(async params => {
      if (!params.has('category')) { await delayed; return pageData([article(1, { title: 'TEST — stale response' })]); }
      return pageData([article(2, { title: 'TEST — fresh response' })]);
    });
    await page.goto(origin + '/actualites.html');
    await page.locator('[data-category="Gaz"]').click(); await loaded(page);
    release(); await page.waitForTimeout(150);
    await assertText(page, '.news-card h2', /^TEST — fresh response$/);
    assert.equal(await page.locator('#news-list').getAttribute('aria-busy'), 'false');
    await close(page);
  });

  await check('empty list, filtered empty, and continuing empty page are distinct', async () => {
    let mode = 'empty';
    const page = await newPage(() => pageData([], mode === 'continue' ? 'TEST-more' : null));
    await go(page);
    await assertText(page, '#news-list h2', /premières publications/);
    assert.equal(await page.locator('#news-list').getByRole('button', { name: 'Réessayer' }).count(), 0);
    await page.locator('[data-category="Gaz"]').click(); await loaded(page);
    await assertText(page, '#news-list h2', /Aucun résultat/);
    await page.locator('#news-list').getByRole('button', { name: 'Tout afficher' }).click(); await loaded(page);
    assert.equal(new URL(page.url()).search, '');
    mode = 'continue'; await page.reload(); await loaded(page);
    await assertText(page, '#news-list h2', /Aucun article sur cette page/);
    assert.equal(await page.locator('#news-next').isEnabled(), true);
    await close(page);
  });

  await check('unavailable, configuration error, network failure, invalid JSON and retry are never empty', async () => {
    for (const failure of [
      { status: 503, data: { code: 'UPSTREAM_UNAVAILABLE', error: 'TEST unavailable' } },
      { status: 503, data: { code: 'NOT_CONFIGURED', error: 'TEST not configured' } },
      { abort: true }, { status: 200, raw: 'TEST not JSON' },
      { data: { articles: [{ title: 'TEST malformed' }] } }
    ]) {
      let recovered = false;
      const page = await newPage(() => recovered ? pageData([article(1)]) : failure);
      await go(page);
      await assertText(page, '#news-list h2', /momentanément indisponibles/);
      await assertText(page, '#news-count', /Publications indisponibles/);
      assert.doesNotMatch(await page.locator('#news-list').innerText(), /Aucun article n’a encore été publié/);
      recovered = true;
      await page.getByRole('button', { name: 'Réessayer' }).click(); await loaded(page);
      assert.equal(await page.locator('.news-card').count(), 1);
      await close(page);
    }
  });

  await check('invalid detail ID, not found, unpublished and retry', async () => {
    let calls = 0, reply = { status: 404, data: { code: 'NOT_FOUND' } };
    const page = await newPage(() => { calls++; return reply; });
    await go(page, '/actualite.html?id=bad', '#news-article');
    assert.equal(calls, 0);
    await assertText(page, '#news-article h2', /Article introuvable/);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
    await go(page, '/actualite.html?id=' + article(1).id, '#news-article');
    await assertText(page, '#news-article h2', /Article introuvable/);
    reply = { status: 503, data: { code: 'UPSTREAM_UNAVAILABLE' } };
    await page.reload(); await loaded(page, '#news-article');
    await assertText(page, '#news-article h2', /ne peut pas être chargé/);
    reply = { article: article(1) };
    await page.getByRole('button', { name: 'Réessayer' }).click(); await loaded(page, '#news-article');
    assert.equal(await page.locator('.news-article').count(), 1);
    await close(page);
  });

  await check('HTML/script content is inert text in list and detail', async () => {
    const attack = 'TEST <img src=x onerror="window.TEST_XSS=1"><script>window.TEST_XSS=2</script>';
    const malicious = article(1, { title: attack, summary: attack, body: attack + '\n\n' + attack, organization: attack, location: attack, sourceName: attack, image: { url: imageUrl, alt: attack, caption: attack, credit: attack } });
    const page = await newPage(params => params.has('id') ? { article: malicious } : pageData([malicious]));
    await go(page);
    assert.equal(await page.locator('.news-card h2').innerText(), attack);
    assert.equal(await page.locator('.news-card script, .news-card img[onerror]').count(), 0);
    await page.locator('.news-card h2 a').click(); await loaded(page, '#news-article');
    assert.equal(await page.locator('h1').innerText(), attack);
    assert.equal(await page.locator('.news-article script, .news-article img[onerror]').count(), 0);
    assert.equal(await page.evaluate(() => window.TEST_XSS), undefined);
    assert.equal(await page.locator('.news-article figure img').getAttribute('alt'), attack);
    await close(page);
  });

  await check('unsafe source URLs reject article; unsafe photo URLs are omitted', async () => {
    for (const sourceUrl of ['javascript:window.TEST_XSS=1', 'data:text/html,TEST', 'https://user:password@source.test/TEST']) {
      const page = await newPage(() => ({ article: article(1, { sourceUrl }) }));
      await go(page, '/actualite.html?id=' + article(1).id, '#news-article');
      await assertText(page, '#news-article h2', /ne peut pas être chargé/);
      assert.equal(await page.locator('.news-source').count(), 0);
      await close(page);
    }
    for (const url of ['javascript:window.TEST_XSS=1', 'data:image/svg+xml,TEST', 'http://fixtures.test/TEST.svg', 'https://user:password@fixtures.test/TEST.svg']) {
      const page = await newPage(() => ({ article: article(1, { image: { url, alt: 'TEST' } }) }));
      await go(page, '/actualite.html?id=' + article(1).id, '#news-article');
      assert.equal(await page.locator('.news-article').count(), 1);
      assert.equal(await page.locator('.news-article img').count(), 0);
      await close(page);
    }
  });

  await check('broken photos disappear without broken-image residue', async () => {
    const bad = article(1, { image: { url: 'https://fixtures.test/TEST-broken.png', alt: 'TEST broken' } });
    const page = await newPage(params => params.has('id') ? { article: bad } : pageData([bad]));
    await go(page);
    await page.waitForFunction(() => document.querySelectorAll('.news-card-visual').length === 0);
    assert.equal(await page.locator('.news-card').count(), 1);
    await page.locator('.news-card h2 a').click(); await loaded(page, '#news-article');
    await page.waitForFunction(() => document.querySelectorAll('.news-article figure').length === 0);
    assert.equal(await page.locator('.news-body').count(), 1);
    await close(page);
  });

  await check('mobile/desktop reader layouts, keyboard menu and screenshots', async () => {
    for (const width of [360, 390, 800, 1024, 1280, 1440]) {
      const page = await newPage(params => params.has('id') ? { article: article(1) } : pageData([article(1), article(2), article(3, { image: null })]), { width, height: 900 });
      await go(page); await noOverflow(page);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      if (width <= 1200) {
        assert.equal(await page.locator('#navLinks').isVisible(), false);
        await page.locator('.menu-toggle').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#navLinks').isVisible(), true);
        await noOverflow(page);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement.className), 'menu-toggle');
      } else {
        assert.equal(await page.locator('.menu-toggle').isVisible(), false);
        assert.equal(await page.locator('#navLinks').isVisible(), true);
      }
      if ([360, 390, 1440].includes(width)) await screenshot(page, 'TEST-news-list-' + width);
      await page.locator('.news-card h2 a').first().click(); await loaded(page, '#news-article');
      await noOverflow(page);
      if ([360, 390, 1440].includes(width)) await screenshot(page, 'TEST-news-detail-' + width);
      await close(page);
    }
  });

  await check('homepage navigation regression, mobile menu links, outside click and desktop fit', async () => {
    for (const width of [360, 390, 768, 1200, 1201, 1280, 1440]) {
      const page = await newPage(() => pageData([]), { width, height: 900 });
      await page.goto(origin + '/');
      await noOverflow(page);
      if (width <= 1200) {
        assert.equal(await page.locator('.menu-toggle').isVisible(), true);
        await page.locator('.menu-toggle').click();
        assert.equal(await page.locator('#navLinks').isVisible(), true);
        assert.equal(await page.locator('#navLinks a[href="actualites.html"]').isVisible(), true);
        await noOverflow(page);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#navLinks').isVisible(), false);
        await page.locator('.menu-toggle').click();
        await page.locator('main').count() ? await page.locator('main').click({ position: { x: 2, y: 600 } }) : await page.mouse.click(4, 850);
        assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
      } else {
        assert.equal(await page.locator('.menu-toggle').isVisible(), false);
        const fit = await page.evaluate(() => {
          const logo = document.querySelector('.logo').getBoundingClientRect();
          const nav = document.querySelector('#navLinks').getBoundingClientRect();
          return { logoRight: logo.right, navLeft: nav.left, navRight: nav.right, viewport: innerWidth };
        });
        assert.ok(fit.logoRight <= fit.navLeft + 1, JSON.stringify(fit));
        assert.ok(fit.navRight <= fit.viewport + 1, JSON.stringify(fit));
      }
      if ([390, 1280, 1440].includes(width)) await screenshot(page, 'homepage-navigation-' + width);
      await close(page);
    }
  });

  await check('invalid URL filters are ignored and search length is bounded', async () => {
    const seen = [];
    const page = await newPage(params => { seen.push(Object.fromEntries(params)); return pageData([]); });
    await go(page, '/actualites.html?category=INVALID&actorType=INVALID&q=' + 'T'.repeat(200));
    assert.equal(seen.at(-1).q.length, 120);
    assert.equal(seen.at(-1).category, undefined);
    assert.equal(seen.at(-1).actorType, undefined);
    await close(page);
  });

  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ fixtureNotice: 'All publication content in these tests is fictional and explicitly TEST.', successes, failures, apiRequests: requests.length }, null, 2));
  console.log(`\n${successes.length} browser scenarios passed; ${failures.length} failed. Screenshots: ${output}`);
  if (failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
