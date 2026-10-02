# Avis officiels publiés le 2 octobre 2026

La sélection versionnée dans `data/opportunites-verifiees.js` ajoute cinq avis publics à l’API existante, sans écrire dans Airtable. L’API conserve les autres données et les trois démonstrations, enrichit un éventuel avis identique et évite les doublons par identifiant, URL source, référence ou titre + acheteur. Les identifiants éditoriaux stables `recPG…` respectent le format du suivi privé existant mais ne désignent pas des enregistrements Airtable.

## Contrôle des sources

Les PDF officiels et les listes SENELEC/RGS ont été recontrôlés le 2 octobre 2026. Les liens précis sont conservés sur chaque fiche. Aucun autre report/additif relatif à ces quatre avis SENELEC n’a été trouvé lors du contrôle ; cela n’est pas une garantie d’absence de modifications ultérieures.

- SENELEC AAO 36/2026 : 21 octobre 2026 à 09 h 30 GMT, batteries et installation. DAO : 30 000 FCFA non remboursables ; garantie : 1 500 000 FCFA.
- SENELEC AMI 35/2026 : 21 octobre à 09 h 30 GMT, études d’électrification. Dépôt physique **et** électronique. Critères détaillés dans l’avis.
- SENELEC AAO 38/2026 : 28 octobre à 09 h 30 GMT, maintenance solaire. Visites des 30 septembre, 1er et 2 octobre déjà passées ; caractère éliminatoire de l’absence non établi. DAO : 30 000 FCFA ; garantie : 4 000 000 FCFA.
- SENELEC AAO 41/2026 : 4 novembre à 09 h 30 GMT, atelier et banc d’essai. Visite le 15 octobre à 10 h à Hann. Seuils financiers élevés ; DAO : 50 000 FCFA ; garantie : 15 000 000 FCFA.
- RGS T_RGS M_01 : préqualification, report au 7 octobre à 10 h GMT ; ouverture en ligne à 11 h. Le dossier initial est expiré et le canal de dépôt n’est pas établi. La date de la liste officielle (9 septembre) est obsolète. Ne pas présenter cette fiche comme un dossier complet ou un accès PME garanti.

Les dates de publication SENELEC sont inconnues et restent nulles. La date de contrôle n’est pas une date de publication. Les prix de dossier et garanties ne sont pas des budgets de marché. SENELEC 40/31/33 et la piste PETROSEN ne font pas partie de cette sélection, en raison de contradictions ou de documentation insuffisante.

## Vérification technique

- `node tests/verified-notices.cjs` : sélection, métadonnées, fusion et dédoublonnage, préservation des démos, recherche/filtres, détails, avertissements et échappement HTML.
- `node tests/demonstrations.cjs` : exclusions des démos et absence d’action de candidature.
- `node tests/matching.cjs` : clôture exacte des avis horodatés, traitement jusqu’à la fin du jour pour les dates sans heure, rapprochement et suivi local.
- Les autres tests `tests/*.cjs` sont à exécuter ; les tests SQL utilisent `@electric-sql/pglite` installé hors du dépôt.
- Contrôle de syntaxe et `git diff --check`.
- Vérifier le déploiement Vercel du SHA final, l’API publique (5 avis éditoriaux + 3 démos au moment de publication), les détails/liens et les filtres dans le navigateur.

Aucun contact, dépôt de candidature, inscription, paiement, migration de base de données, changement tarifaire ou changement de CGU n’est inclus.
