/* Offline DOM logic tests. These supplement, never replace, actual browser QA.
 * All publication data below is explicitly TEST and never published. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/actualites.js'), 'utf8');
const navSource = fs.readFileSync(path.join(__dirname, '../assets/nav-mobile.js'), 'utf8');
const id = n => 'rec' + String(n).padStart(14, '0');
const fixture = (n = 1, changes = {}) => ({ id: id(n), slug: 'test-' + n, title: 'TEST — Article ' + n,
  summary: 'TEST — Résumé', body: 'TEST — Paragraphe 1\nLigne 2\n\nTEST — Paragraphe 2', category: 'Gaz',
  organization: 'TEST — Organisation', actorType: 'Entreprise', location: 'TEST — Lieu',
  publishedAt: '2020-03-05T14:00:00.000Z', sourceName: 'TEST — Source', sourceUrl: 'https://example.test/TEST-source',
  image: { url: 'https://example.test/TEST-photo.jpg', alt: 'TEST — Image', caption: 'TEST — Légende', credit: 'TEST — Crédit' }, ...changes });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const result = (articles = [fixture()], cursor = null) => response({ articles, count: articles.length, hasMore: !!cursor, nextCursor: cursor });
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
class Element {
  constructor(tag, owner) {
    this.tagName = tag.toUpperCase(); this.owner = owner; this.children = []; this.events = {}; this.attributes = {}; this.dataset = {};
    this.value = ''; this.disabled = false; this.hidden = false; this.className = ''; this._text = '';
    this.classList = { contains: c => this.className.split(' ').includes(c),
      add: c => { if (!this.classList.contains(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: c => { this.className = this.className.split(' ').filter(x => x !== c).join(' '); },
      toggle: c => { const existed = this.classList.contains(c); existed ? this.classList.remove(c) : this.classList.add(c); return !existed; } };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, handler, options = {}) { (this.events[type] ??= []).push({ handler, once: options.once }); }
  fire(type, changes = {}) {
    const event = { button: 0, preventDefault() {}, target: this, ...changes };
    for (const entry of [...(this.events[type] || [])]) { entry.handler(event); if (entry.once) this.events[type] = this.events[type].filter(x => x !== entry); }
  }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
  focus() { this.owner.activeElement = this; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) { return this.descendants().filter(node => selector === 'a' ? node.tagName === 'A' : false); }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}
function app({ view = 'list', search = '', fetcher = async () => result(), navigationOnly = false } = {}) {
  const nodes = {}, documentEvents = {}, windowEvents = {}, timers = new Map(), requests = [];
  let timerId = 0;
  const doc = { title: '', activeElement: null, body: { dataset: { newsView: view } },
    createElement: tag => new Element(tag, doc), getElementById: key => nodes[key],
    querySelectorAll: selector => selector === '[data-category]' ? categories : [],
    querySelector: selector => ({ 'meta[name="description"]': description, 'meta[name="robots"]': robots,
      'link[rel="canonical"]': canonical, '.menu-toggle': menu })[selector],
    addEventListener: (name, handler) => { (documentEvents[name] ??= []).push(handler); } };
  for (const key of ['news-list','news-count','news-pagination','news-query','news-actor','news-reset','news-previous','news-next','news-page-label','news-filters','news-article','navLinks']) { nodes[key] = doc.createElement('div'); nodes[key].id = key; }
  const categories = ['', 'Pétrole', 'Gaz', 'Mines'].map(category => { const a = doc.createElement('a'); a.dataset.category = category; return a; });
  const description = doc.createElement('meta'), robots = doc.createElement('meta'), canonical = doc.createElement('link'), menu = doc.createElement('button');
  robots.content = 'noindex';
  nodes.navLinks.append(...categories);
  const location = new URL('https://local.test/' + (view === 'list' ? 'actualites' : 'actualite') + '.html' + search);
  const stack = [location.href]; let historyIndex = 0;
  const history = { pushState(_state, _title, url) { location.href = new URL(url, location.href).href; stack.splice(++historyIndex); stack.push(location.href); } };
  const window = { addEventListener: (name, handler) => { (windowEvents[name] ??= []).push(handler); } };
  const context = vm.createContext({ document: doc, window, URL, URLSearchParams, AbortController, AbortSignal, Intl, Date, location, history,
    setTimeout(fn, delay) { const key = ++timerId; timers.set(key, { fn, delay }); return key; }, clearTimeout(key) { timers.delete(key); },
    fetch: async (url, options) => { requests.push({ url: new URL(url, location), options }); return fetcher(new URL(url, location).searchParams, options, requests.length); } });
  vm.runInContext(navigationOnly ? navSource : source, context);
  return { nodes, categories, document: doc, location, requests, timers, menu, window, description, robots, canonical,
    fireDocument(name, changes) { (documentEvents[name] || []).forEach(handler => handler(changes)); },
    navigateHistory(delta) { historyIndex += delta; assert.ok(historyIndex >= 0 && historyIndex < stack.length); location.href = stack[historyIndex]; (windowEvents.popstate || []).forEach(handler => handler()); },
    find(container, tag) { return nodes[container].descendants().filter(node => node.tagName === tag.toUpperCase()); },
    byClass(container, name) { return nodes[container].descendants().filter(node => node.classList.contains(name)); },
    action(container, label) { const button = nodes[container].descendants().find(node => node.tagName === 'BUTTON' && node.textContent === label); assert.ok(button, 'Action exists: ' + label); button.fire('click'); } };
}
(async () => {
  let page = app(); await tick();
  assert.equal(page.nodes['news-count'].textContent, '1 publication sur cette page');
  assert.equal(page.nodes['news-list'].getAttribute('aria-busy'), 'false');
  assert.equal(page.nodes['news-pagination'].hidden, true);
  assert.equal(page.find('news-list', 'article').length, 1);
  assert.equal(page.find('news-list', 'time')[0].textContent, '5 mars 2020');
  assert.equal(page.find('news-list', 'time')[0].dateTime, fixture().publishedAt);
  assert.match(page.nodes['news-list'].textContent, /Source : TEST — Source/);
  assert.equal(page.find('news-list', 'a')[0].href, 'actualite.html?id=' + id(1));
  assert.equal(page.find('news-list', 'img')[0].alt, 'TEST — Image');
  assert.equal(page.find('news-list', 'img')[0].referrerPolicy, 'no-referrer');

  page.categories[2].fire('click'); await tick();
  assert.equal(page.requests.at(-1).url.searchParams.get('category'), 'Gaz');
  page.nodes['news-query'].value = '  TEST project  '; page.nodes['news-actor'].value = 'Projet';
  page.nodes['news-filters'].fire('submit'); await tick();
  assert.equal(page.requests.at(-1).url.searchParams.get('q'), 'TEST project');
  assert.equal(page.requests.at(-1).url.searchParams.get('actorType'), 'Projet');
  assert.equal(page.categories[2].getAttribute('aria-current'), 'true');
  page.nodes['news-reset'].fire('click'); await tick();
  assert.equal(page.location.search, '');
  page.navigateHistory(-1); await tick();
  assert.equal(page.nodes['news-query'].value, 'TEST project');
  assert.equal(page.nodes['news-actor'].value, 'Projet');
  page.navigateHistory(1); await tick(); assert.equal(page.nodes['news-query'].value, '');

  page = app({ fetcher: async params => params.has('cursor') ? result([fixture(13)]) : result(Array.from({ length: 12 }, (_, i) => fixture(i + 1)), 'TEST-next') }); await tick();
  assert.equal(page.nodes['news-previous'].disabled, true); assert.equal(page.nodes['news-pagination'].hidden, false);
  page.nodes['news-next'].fire('click'); await tick();
  assert.equal(page.requests.at(-1).url.searchParams.get('cursor'), 'TEST-next');
  assert.equal(page.nodes['news-page-label'].textContent, 'Page 2');
  assert.equal(page.nodes['news-next'].disabled, true); assert.equal(page.document.activeElement.id, 'news-count');
  page.nodes['news-previous'].fire('click'); await tick();
  assert.equal(page.requests.at(-1).url.searchParams.get('cursor'), null);
  assert.equal(page.nodes['news-page-label'].textContent, 'Page 1');
  page.nodes['news-next'].fire('click'); await tick(); page.categories[3].fire('click'); await tick();
  assert.equal(page.requests.at(-1).url.searchParams.get('cursor'), null);

  page = app({ fetcher: async params => params.has('cursor') ? response({ code: 'INVALID_CURSOR' }, 400) : result([fixture()], 'TEST-expired') }); await tick();
  page.nodes['news-next'].fire('click'); await tick(); assert.match(page.nodes['news-list'].textContent, /La liste a évolué/);
  page.action('news-list', 'Revenir à la première page'); await tick(); assert.equal(page.find('news-list', 'article').length, 1);

  for (const [search, cursor, message] of [['', null, /premières publications/], ['?q=TEST', null, /Aucun résultat/], ['', 'TEST-more', /Aucun article sur cette page/]]) {
    page = app({ search, fetcher: async () => result([], cursor) }); await tick();
    assert.match(page.nodes['news-list'].textContent, message);
    if (cursor) assert.equal(page.nodes['news-next'].disabled, false);
  }
  for (const failed of [() => response({ code: 'NOT_CONFIGURED' }, 503), () => response({ code: 'UPSTREAM_UNAVAILABLE' }, 503),
    () => { throw new Error('TEST offline'); }, () => ({ ok: true, status: 200, json: async () => { throw new Error('TEST JSON'); } }),
    () => response({ articles: [{}] }), () => result([fixture(1, { publishedAt: 'not-a-date' })]),
    () => result([fixture(1, { publishedAt: '2999-01-01' })]), () => result([fixture(1, { body: '' })])]) {
    let recovered = false; page = app({ fetcher: async () => recovered ? result() : failed() }); await tick();
    assert.equal(page.nodes['news-count'].textContent, 'Publications indisponibles');
    assert.match(page.nodes['news-list'].textContent, /momentanément indisponibles/);
    assert.doesNotMatch(page.nodes['news-list'].textContent, /Aucun article n’a encore été publié/);
    recovered = true; page.action('news-list', 'Réessayer'); await tick(); assert.equal(page.find('news-list', 'article').length, 1);
  }

  // Intentionally uncooperative fetch verifies revisions, even if abort is ignored.
  let releaseOld, releaseNew;
  const old = new Promise(resolve => { releaseOld = resolve; }), current = new Promise(resolve => { releaseNew = resolve; });
  page = app({ fetcher: async (_params, _options, n) => n === 1 ? old : current }); await tick();
  const obsoleteTimeout = [...page.timers.values()][0];
  page.categories[2].fire('click'); await tick();
  assert.equal(page.requests[0].options.signal.aborted, true);
  obsoleteTimeout.fn();
  assert.equal(page.requests[1].options.signal.aborted, false, 'Obsolete timeout must not abort newer request');
  releaseNew(result([fixture(2)])); await tick();
  releaseOld(result([fixture(1)])); await tick();
  assert.equal(page.find('news-list', 'h2')[0].textContent, 'TEST — Article 2');
  assert.equal(page.nodes['news-list'].getAttribute('aria-busy'), 'false');
  assert.equal(page.timers.size, 0);

  // Timeout transitions to retryable failure and the retry can recover.
  let shouldTimeout = true;
  page = app({ fetcher: async (_params, options) => !shouldTimeout ? result() : new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('TEST timeout')))) }); await tick();
  [...page.timers.values()][0].fn(); await tick();
  assert.match(page.nodes['news-list'].textContent, /momentanément indisponibles/);
  shouldTimeout = false; page.action('news-list', 'Réessayer'); await tick();
  assert.equal(page.find('news-list', 'article').length, 1);

  page = app({ view: 'article', search: '?id=INVALID' }); await tick();
  assert.equal(page.requests.length, 0); assert.match(page.nodes['news-article'].textContent, /Article introuvable/);
  for (const failure of [404, 503]) {
    let recovered = false;
    page = app({ view: 'article', search: '?id=' + id(1), fetcher: async () => recovered ? response({ article: fixture() }) : response({ code: failure === 404 ? 'NOT_FOUND' : 'UPSTREAM_UNAVAILABLE' }, failure) }); await tick();
    assert.match(page.nodes['news-article'].textContent, failure === 404 ? /Article introuvable/ : /ne peut pas être chargé/);
    assert.equal(page.robots.content, 'noindex');
    if (failure === 503) { recovered = true; page.action('news-article', 'Réessayer'); await tick(); assert.equal(page.find('news-article', 'article').length, 1); }
  }
  page = app({ view: 'article', search: '?id=' + id(1), fetcher: async () => response({ article: fixture() }) }); await tick();
  assert.equal(page.document.title, 'TEST — Article 1 — PétroleGaz');
  assert.equal(page.description.content, 'TEST — Résumé');
  assert.equal(page.robots.content, 'index,follow');
  assert.equal(page.canonical.href, 'https://www.petrolegaz.com/actualite.html?id=' + id(1));
  assert.equal(page.byClass('news-article', 'news-body')[0].children.length, 2);
  const sourceLink = page.byClass('news-article', 'news-source')[0].children[1];
  assert.equal(sourceLink.href, fixture().sourceUrl); assert.equal(sourceLink.rel, 'noopener noreferrer'); assert.equal(sourceLink.target, '_blank');
  assert.equal(page.find('news-article', 'figcaption')[0].textContent, 'TEST — Légende · Crédit : TEST — Crédit');
  page.find('news-article', 'img')[0].fire('error'); assert.equal(page.find('news-article', 'figure').length, 0);

  const attack = 'TEST <img src=x onerror="window.TEST_XSS=1"><script>window.TEST_XSS=2</script>';
  const badText = fixture(1, { title: attack, summary: attack, body: attack, organization: attack, location: attack, sourceName: attack,
    image: { url: fixture().image.url, alt: attack, caption: attack, credit: attack } });
  for (const view of ['list', 'article']) {
    page = app({ view, search: view === 'article' ? '?id=' + id(1) : '', fetcher: async () => view === 'list' ? result([badText]) : response({ article: badText }) }); await tick();
    const target = view === 'list' ? 'news-list' : 'news-article';
    assert.equal(page.find(target, view === 'list' ? 'h2' : 'h1')[0].textContent, attack);
    assert.equal(page.find(target, 'script').length, 0);
    assert.equal(page.find(target, 'img').length, 1);
    assert.equal(page.find(target, 'img')[0].alt, attack);
    assert.equal(page.window.TEST_XSS, undefined);
  }
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,TEST', 'file:///TEST', 'https://user:password@example.test/TEST']) {
    page = app({ view: 'article', search: '?id=' + id(1), fetcher: async () => response({ article: fixture(1, { sourceUrl: unsafe }) }) }); await tick();
    assert.equal(page.find('news-article', 'article').length, 0);
    assert.match(page.nodes['news-article'].textContent, /ne peut pas être chargé/);
  }
  for (const unsafe of ['javascript:alert(1)', 'data:image/svg+xml,TEST', 'http://example.test/TEST.jpg', 'https://user:password@example.test/TEST.jpg']) {
    page = app({ fetcher: async () => result([fixture(1, { image: { url: unsafe, alt: 'TEST' } })]) }); await tick();
    assert.equal(page.find('news-list', 'article').length, 1); assert.equal(page.find('news-list', 'img').length, 0);
  }
  page = app(); await tick(); page.find('news-list', 'img')[0].fire('error');
  assert.equal(page.byClass('news-list', 'news-card-visual').length, 0);
  page = app({ search: '?category=INVALID&actorType=INVALID&q=' + 'T'.repeat(200) }); await tick();
  assert.equal(page.requests[0].url.searchParams.get('q').length, 120);
  assert.equal(page.requests[0].url.searchParams.get('category'), null);
  assert.equal(page.requests[0].url.searchParams.get('actorType'), null);

  page = app({ navigationOnly: true });
  page.window.toggleMenu(); assert.equal(page.menu.getAttribute('aria-expanded'), 'true');
  page.fireDocument('keydown', { key: 'Escape' });
  assert.equal(page.menu.getAttribute('aria-expanded'), 'false'); assert.equal(page.document.activeElement, page.menu);
  page.window.toggleMenu(); page.fireDocument('click', { target: page.nodes['news-list'] });
  assert.equal(page.menu.getAttribute('aria-expanded'), 'false');
  page.window.toggleMenu(); page.categories[0].fire('click');
  assert.equal(page.menu.getAttribute('aria-expanded'), 'false');

  console.log('PASS: offline news DOM: list/detail, metadata/photos, filters/reset/history, pagination/focus, empty/unavailable/retry, invalid/unpublished IDs, stale responses, timeout isolation/retry, XSS/unsafe URL defense, broken photos, and keyboard navigation. Real browser/layout checks are separate.');
})().catch(error => { console.error(error); process.exitCode = 1; });
