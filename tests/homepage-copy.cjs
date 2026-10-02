// Run with: node tests/homepage-copy.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const text = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

assert.doesNotMatch(text, /Annuaire vérifié|Annuaire des PME vérifiées|48\s*h|Centralisation quotidienne|notification à chaque demande|opportunités dès cette semaine|Nous vérifions chaque profil|seuls les donneurs d'ordre inscrits|résilier à tout moment depuis votre tableau de bord/i);
assert.match(text, /Annuaire des entreprises référencées/);
assert.match(text, /Le référencement ne vaut pas vérification/);
assert.match(text, /aucun délai de validation n’est garanti/);
assert.match(text, /Les informations publiées dans l’annuaire sont accessibles à tous, sans connexion/);
assert.match(text, /Les exemples de démonstration sont identifiés et ne sont pas des marchés ouverts/);
assert.match(text, /Enterprise est un programme pilote en préparation ; ses fonctionnalités ne sont pas encore disponibles/);
assert.match(text, /Le suivi de cet outil reste dans votre navigateur : aucun email ni candidature n’est envoyé/);
assert.match(text, /le score ne garantit pas l’éligibilité/);
assert.match(text, /les statistiques, opportunités et demandes présentées sont fictives/);
assert.match(text, /Cet aperçu ne garantit pas la disponibilité de ces fonctionnalités/);
assert.match(text, /Prestations et disponibilité à confirmer avant toute souscription payante/);
assert.match(text, /Badge après contrôle validé uniquement/);
assert.match(text, /Alertes email en préparation, sans envoi actif/);

// Search and social previews must not keep the obsolete verification claim.
for (const name of ['name="description"', 'property="og:description"']) {
  const description = html.match(new RegExp(`<meta ${name} content="([^"]+)"`));
  assert.ok(description, `${name} must remain present`);
  assert.match(description[1], /entreprises référencées/);
}

// Keep existing commercial amounts/cadence, navigation and in-page targets.
assert.deepEqual([...html.matchAll(/<div class="price-name">([^<]+)<\/div>/g)].map(m => m[1]), ['Basique', 'Vérifié', 'Premium']);
assert.deepEqual([...html.matchAll(/<div class="price-amount">([\d ]+) <small>FCFA<\/small>/g)].map(m => m[1]), ['0', '25 000', '60 000']);
assert.equal((html.match(/<div class="price-period">par mois<\/div>/g) || []).length, 2);
for (const file of ['annuaire.html', 'donneurs-ordre.html', 'appels-offres.html', 'rapprochement.html', 'enterprise.html', 'connexion.html', 'inscription.html', 'legal/cgv.html', 'legal/confidentialite.html']) {
  assert.ok(html.includes(`href="${file}"`), `Missing link: ${file}`);
  assert.ok(fs.existsSync(path.join(root, file)), `Missing local destination: ${file}`);
}
for (const [, fragment] of html.matchAll(/href="#([^"\s]+)"/g)) {
  assert.ok(html.includes(`id="${fragment}"`), `Missing in-page destination: ${fragment}`);
}
assert.match(html, /onclick="toggleMenu\(\)"/);
assert.equal((html.match(/onclick="toggleFaq\(this\)"/g) || []).length, 6);
assert.match(html, /<script src="assets\/nav-mobile\.js"><\/script>/);

console.log('PASS: homepage verification, pilot/demo and local-only disclosures; metadata, prices, navigation and FAQ hooks.');
