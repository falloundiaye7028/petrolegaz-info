// Run with: node tests/signup-navigation.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const text = html => html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const signup = read('inscription.html');
const signupText = text(signup);
assert.doesNotMatch(signupText, /48\s*h|notifie par email|Conformité CDP|chiffrées|confidentielles|contrôle votre NINEA et votre RCCM avant publication/i);
for (const required of ['Vérification distincte du référencement', 'Le référencement et la vérification sont deux étapes distinctes', 'aucun délai de validation n’est garanti', 'Référencement et vérification', 'Seul un contrôle validé', 'Données et visibilité', 'accessibles à tous, sans connexion', 'N’inscrivez pas d’informations privées dans ces champs', 'ne sont pas affichés dans l’annuaire actuel']) assert.ok(signupText.includes(required), required);
assert.match(signup, /<section class="form-notice"[\s\S]*?<\/section>\s*<iframe/);
assert.match(signup, /<iframe data-tally-src="https:\/\/tally\.so\/embed\/KY90vK\?alignLeft=1&amp;hideTitle=1&amp;transparentBackground=1&amp;dynamicHeight=1" loading="lazy" width="100%" height="1200" frameborder="0" marginheight="0" marginwidth="0" title="Inscription PME — PétroleGaz Info"><\/iframe>/);
assert.match(signup, /w = "https:\/\/tally.so\/widgets\/embed.js"/);
for (const block of [signup.match(/<section class="form-notice"[\s\S]*?<\/section>/)[0], signup.match(/<p class="form-documents">[\s\S]*?<\/p>/)[0]]) {
 for (const file of ['legal/cgu.html', 'legal/confidentialite.html']) {
  assert.ok(block.includes(`href="${file}" target="_blank" rel="noopener"`), `Preserve form input when opening ${file}`);
  assert.ok(fs.existsSync(path.join(root, file)));
 }
}
assert.match(signup, /<footer>[\s\S]*?<a href="legal\/cgu.html">CGU<\/a>[\s\S]*?<\/footer>/);
for (const file of ['index.html', 'inscription.html', 'annuaire.html', 'appels-offres.html', 'enterprise.html']) {
 const html=read(file);
 assert.doesNotMatch(html, />Connexion<\/a>/);
 assert.match(html, /<a href="connexion.html"[^>]*>Suivre mon inscription<\/a>/);
 assert.match(html, /<script src="assets\/nav-mobile.js"><\/script>/);
}
const followup = read('connexion.html');
assert.match(followup, /<title>Suivi de mon inscription — PétroleGaz Info<\/title>/);
assert.match(followup, /<h1>Suivi de mon inscription<\/h1>/);
assert.doesNotMatch(followup, /Votre inscription est enregistrée dans notre base/);
assert.match(followup, /Pour vérifier la réception de votre inscription ou demander des nouvelles de son traitement/);
assert.match(followup, /mailto:contact@petrolegaz.com\?subject=Suivi%20de%20mon%20inscription/);
const home = read('index.html');
assert.match(home, /<a href="inscription.html" class="btn btn-outline btn-block">Inscrire gratuitement ma PME<\/a>/);
const offerLinks = [...home.matchAll(/<a href="([^"]+)"[^>]*>Demander des informations sur (Vérifié|Premium)<\/a>/g)];
assert.equal(offerLinks.length, 2);
for (const [, href, offer] of offerLinks) {
 const target = new URL(href);
 assert.equal(target.protocol, 'mailto:');
 assert.equal(target.pathname, 'contact@petrolegaz.com');
 assert.equal(target.searchParams.get('subject'), `Informations sur l’offre ${offer}`);
 assert.deepEqual([...target.searchParams.keys()], ['subject']);
}
assert.equal((home.match(/Contactez l’équipe pour connaître les prestations disponibles et les conditions de souscription\./g)||[]).length, 2);
assert.deepEqual([...home.matchAll(/<div class="price-amount">([\d ]+) <small>FCFA<\/small>/g)].map(m=>m[1]), ['0','25 000','60 000']);
assert.deepEqual([...home.matchAll(/<div class="price-period">([^<]+)<\/div>/g)].map(m=>m[1]), ['pour toujours','par mois','par mois']);
console.log('PASS: signup claims, public-field notice, unchanged Tally integration, legal document links, tracking navigation and distinct inquiry CTA destinations.');
