# Espace PME privé — recette avant activation

Projet : `ocyjfjddyijaaunzupxe`, créé en Europe sur le forfait gratuit.

## Installation déjà effectuée

La migration `migrations/20260914_pme_private.sql` a été appliquée via l’éditeur SQL au nouveau projet. Ne pas la réexécuter : elle crée des objets sans écraser les existants. Les quatre tables ont été vérifiées sur la base réelle : RLS actif, SELECT anonyme interdit.

- `pme_access_requests` : demande de rattachement, consultable uniquement par son auteur ; il ne peut ni l’approuver ni changer son identité.
- `pme_memberships` : attribution manuelle d’un accès ; aucun droit d’écriture client.
- `pme_applications` : suivi partagé entre membres autorisés de la même PME ; seul le statut est modifiable côté client.
- `pme_application_events` : historique généré par le serveur, jamais modifiable côté client.

La création d’un compte ne valide pas son mandat. Les métadonnées de profil et le badge public ne sont jamais utilisés comme autorisation.

## Activation contrôlée

`/api/pme-config` fournit uniquement URL et clé **publiable**. Aucune clé secrète/service_role n’est nécessaire pour le site. Le mode preview est activé ; la production reste bloquée tant que `PME_AUTH_ENABLED=true` n’est pas configuré explicitement. Les paramètres publics peuvent être remplacés par `PME_SUPABASE_URL` et `PME_SUPABASE_PUBLISHABLE_KEY`.

La nouvelle page est `espace-pme.html` ; les pages publiques et le suivi local restent inchangés. Le SDK officiel est épinglé à 2.116.0. Connexion par code email (`signInWithOtp`, puis `verifyOtp` de type `email`). Ne pas utiliser de navigateur partagé sans se déconnecter. Aucun import automatique du localStorage historique.

Dans Supabase Auth > Emails, utiliser `templates/email-otp.html` pour **Magic link or OTP** et **Confirm sign up**, avec le sujet « Votre code de connexion PétroleGaz ». La variable `{{ .Token }}` remplace les liens à usage unique. Ne pas modifier les modèles de récupération/invitation. Les limites SMTP et la durée d’expiration restent inchangées. Les anciennes prévisualisations à lien ne sont plus adaptées à ces modèles : utiliser la dernière version à code. Les anciens retours d’erreur sont affichés clairement et retirés de l’URL. Aucun code ni jeton n’est journalisé par l’application.

## Recette requise avant production

1. Autoriser dans Supabase Auth uniquement l’URL exacte `/espace-pme.html` de la prévisualisation. Ajouter l’URL production après validation, pas de wildcard global.
2. Vérifier l’envoi email : le service par défaut peut limiter les destinataires aux membres de l’organisation ; configurer un SMTP dédié avant ouverture aux PME. Pas d’alertes marketing dans ce lot.
3. Avec deux comptes de test contrôlés, vérifier le code email (compte existant et nouvelle inscription), le rattachement en attente, puis une approbation manuelle sur une PME TEST. Tester l’isolation et la révocation sur la base réelle.
4. Tester le suivi sur deux appareils. Aucune soumission réelle à un acheteur ; les statuts restent déclaratifs.
5. Valider la protection anti-abus de l’inscription et les limites email, ainsi que l’information des utilisateurs sur le traitement de leurs données.

## Approbation manuelle (opérateur uniquement)

La prévisualisation propose `PME TEST PétroleGaz — entreprise fictive`, identifiant synthétique `recTEST0000000001`, uniquement dans l’espace privé. Aucune fiche Airtable ni entrée d’annuaire public n’est créée. La configuration production n’expose pas cette fixture. Aucun matching réel n’est proposé pour cette PME. Les demandes et rattachements restent soumis aux mêmes RLS et à la validation manuelle : ce profil n’accorde aucun droit automatiquement. Les éventuels enregistrements de recette Supabase doivent être traités comme des données TEST, jamais comme un mandat réel.

Après vérification de l’identité et du mandat par un autre canal, utiliser une transaction SQL : insérer dans `pme_memberships` le `user_id` de la demande et l’identifiant Airtable exact de la PME ; passer la demande correspondante à `approved`. Ne jamais approuver sur le seul texte de la demande. Pour révoquer, supprimer le rattachement ciblé ; les données de suivi sont conservées mais deviennent inaccessibles à ce membre.

## Tests

Dans la prévisualisation uniquement, sélectionner la PME fictive autorisée puis « Créer la candidature TEST ». L’opportunité synthétique `recTEST0000000002` n’est ni ajoutée à Airtable ni proposée dans les correspondances réelles. Le bouton utilise les mêmes droits RLS et le même historique serveur que le suivi normal. Vérifier création « À préparer », passage « Envoyée », puis « Abandonnée », et persistance après actualisation. Aucun envoi externe. Ne pas confondre ce scénario de recette avec une candidature réelle.

- `node tests/pme-config.cjs`
- `node tests/pme-otp.cjs` : simulation envoi, code expiré, format invalide, limitation, changement d’email, session et absence de rattachement automatique. La réception et la saisie d’un vrai code restent à valider par l’utilisateur.
- `PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/private-access.cjs` (validé avec PGlite 0.5.8)
- Régressions : `node tests/matching.cjs`, `node tests/demonstrations.cjs`, `node tests/donneurs-ordre.cjs`

Les tests Postgres sont isolés et ne créent aucun utilisateur dans Supabase. Ils couvrent l’absence d’accès anonyme, deux comptes/deux PME, les colonnes protégées, l’interdiction d’auto-approbation, l’historique et la révocation. L’interface limite les listes de demandes à 100 et le suivi à 200 : ajouter une pagination avant un usage dépassant ces volumes.
