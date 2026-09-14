# Rapprochement, alertes et suivi — première version locale

Page : `rapprochement.html`, accessible depuis l’accueil et l’annuaire.

## Livré dans le code

- Lecture des deux API publiques existantes ; aucun nouvel accès Airtable ni écriture serveur.
- Score déterministe expliqué : secteur normalisé identique (50), compétence complète citée (20 chacune, plafond 40), localisation normalisée identique (10). La localisation seule ne suffit pas.
- Exclusion stricte des démonstrations, dates absentes/invalides/passées et liens sources absents/non HTTP(S). Fin de journée UTC, correspondant au Sénégal.
- Aucun score d’éligibilité, aucune inférence sur la capacité financière, HSE ou les certifications.
- Alertes opt-in dans la page à l’ouverture/actualisation ; identifiants lus conservés par profil. Une modification d’un avis déjà lu n’est pas une nouvelle alerte.
- Suivi déclaratif par profil et identifiant d’avis, persistant dans localStorage : À préparer, Envoyée, En échange, Retenue, Non retenue, Abandonnée. Un avis devenu indisponible reste dans le suivi.
- Pas de pièces jointes, email, candidature envoyée, authentification ou vérification de propriété. Données locales accessibles aux autres utilisateurs du même navigateur. Effacement global confirmé, erreurs de sauvegarde signalées.

## Tests exécutés

`node tests/matching.cjs` : moteur et simulation DOM (alertes, lecture, suivi, changement de profil, panne/reprise API, effacement).

`node tests/demonstrations.cjs` et `node tests/donneurs-ordre.cjs` : régressions existantes.

`git diff --check` : aucune erreur.

Le rendu dans un vrai navigateur, le mobile et la prévisualisation Vercel restent à valider. Aucun déploiement ou fusion réalisé pour ce lot.

## Suite nécessaire pour une version multiutilisateur

1. Choisir et configurer l’authentification ; vérifier la propriété de la PME avant d’accéder à son suivi privé.
2. Créer les tables privées de candidatures, préférences et historique ; contrôle d’accès côté serveur, validation, journalisation et limitation de débit. Ne jamais exposer ces données dans les API publiques actuelles.
3. Configurer un prestataire email et un domaine expéditeur vérifié, consentement et désabonnement. Traitement planifié avec déduplication et suivi des échecs. Aucun envoi avant validation.
4. Recette avec comptes distincts, tests d’isolation et données de test ; vérifier réception email et persistance interappareils.

Cette première version ne remplace pas ces étapes. Les exemples d’avis actuellement identifiés restent exclus : l’outil peut donc afficher zéro correspondance tant que des avis réels exploitables ne sont pas publiés.
