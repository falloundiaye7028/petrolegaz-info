# Alertes PME — préférences et simulation, sans envoi

## Périmètre livré

- Préférences privées par compte : consentement non précoché, fréquence quotidienne/hebdomadaire et score minimum.
- RPC authentifiées, sans identifiant utilisateur fourni par le navigateur. Aucun rattachement exigé pour se désabonner.
- Horodatage/version du consentement et historique des changements attribués côté serveur. Lecture limitée au compte, aucune écriture directe cliente.
- Simulation sur les PME autorisées : sources valides, échéances non dépassées, exclusions démonstrations/TEST, dédoublonnage d’opportunités et plafond de 20 résultats.
- L’interface conserve le suivi des candidatures existant. Un échec des préférences n’empêche pas de consulter le reste de l’espace.

## Déploiement progressif

1. Appliquer **une seule fois** `supabase/migrations/20260915_alert_preferences.sql` dans le bon projet Supabase, après sauvegarde et contrôle des tables existantes. La migration est atomique et échoue si les objets existent ; elle ne remplace rien.
2. Tester en preview avec un compte connecté : absence d’abonnement initial, consentement/enregistrement/rechargement, changement de fréquence/score, désabonnement/rechargement, isolation avec un second compte.
3. Sans PME autorisée, la simulation doit rester vide. Ne pas réaccorder une PME réelle pour un essai.
4. Fusionner après validation ; activer `PME_ALERT_PREFERENCES_ENABLED=true` en production uniquement après validation du parcours réel. Un redéploiement est requis.

Le module est visible en preview et masqué en production par défaut. `emailSendingEnabled` reste **false sans exception**. Aucune tâche planifiée, route d’envoi ou campagne n’est active. La fréquence est une préférence enregistrée, pas une planification active. Le socle serveur Resend ci-dessous est préparé séparément ; il ne branche pas le transport à l’interface.

## Socle Resend préparé — pas encore un service d’envoi opérationnel

Le domaine retenu est `send.petrolegaz.com`, avec l’expéditeur proposé `alertes@send.petrolegaz.com`. Le SMTP Zoho utilisé pour l’authentification n’est pas modifié.

- `server/alert-transport.cjs` : modèle HTML échappé + texte, une opportunité par message, adresse interne exacte obligatoire, URL Resend fixe, autorisation serveur juste avant la requête, délai borné, aucune relance automatique. `accepted` signifie accepté par Resend, pas livré au destinataire. Toute réponse incertaine impose une vérification opérateur.
- `server/alert-token.cjs` : jetons HMAC SHA-256 dédiés au désabonnement, durée de 180 jours, aucun email ni secret dans le contenu signé. Un lien ancien reste valable jusqu’à expiration même après réabonnement ; une rotation invalide les anciens liens, l’espace authentifié reste disponible.
- `api/alert-unsubscribe` : GET affiche uniquement une confirmation ; POST signé désabonne sans connexion. En-têtes anti-cache, anti-fuite du lien et protection contre les scripts. L’arrêt des envois ne doit jamais désactiver cette route une fois des messages émis.
- `api/resend-webhook` : vérification du corps brut avec Svix **2.5.0**, signature et horodatage avant toute écriture. Échec du stockage → 503, jamais de faux accusé de réception. Seuls les identifiants/types utiles sont conservés, pas le corps complet contenant des données personnelles.
- `supabase/migrations/20260916_alert_outbox.sql` : file privée, unicité compte/opportunité, autorisation atomique à usage unique, fréquence quotidienne/hebdomadaire, recontrôle du consentement, de l’adresse confirmée, du rattachement et de l’échéance. Toute modification de consentement annule la file et retire l’approbation d’envoi. Rebonds/plaintes/suppressions bloquent la suite ; un événement de livraison tardif ne lève jamais ce blocage. Les événements précoces sont rapprochés après stockage de l’identifiant Resend.

**Limites explicites :** migrations serveur non appliquées en production par ce lot ; tables d’approbation initialement vides ; aucun nouveau compte inscrit aux envois ; aucun cron ni API publique d’envoi. Le coordinateur manuel décrit ci-dessous est livré, mais non exécuté avec des secrets réels. Les callbacks sont fermés par défaut. Le transport n’est appelé par aucune route existante. La file réserve une seule opportunité par compte/message ; un digest multi-opportunités nécessite une table de réservation par élément. Les anciens abonnements de préparation ne constituent pas une activation d’envoi.

La politique conservatrice est « au plus une tentative » : un processus interrompu peut laisser un message `attempting` ou `unknown`, jamais remis automatiquement en file. L’historique ne doit pas être effacé pour relancer : cela détruirait la protection anti-doublon. Une révocation après le contrôle final ne peut pas rappeler un email déjà en cours d’envoi chez Resend. Le coordinateur relit directement Airtable et les autorisations avant l’autorisation SQL ; la base ne possède pas le catalogue Airtable. Les données Airtable et Postgres ne partagent pas une transaction : une modification de catalogue après la dernière lecture reste possible.

### Déclencheur manuel interne

- `server/alert-dispatch.cjs` relie le rapprochement, la réservation durable, le modèle, le contrôle final et le transport. Une invocation traite au plus une opportunité pour un seul compte configuré. Un compte sans approbation séparée, désabonné, non vérifié, bloqué ou hors fréquence ne reçoit rien.
- `server/alert-sources.cjs` lit les champs utiles directement depuis Airtable (sans cache CDN, pagination bornée, pas de données partielles) et appelle les RPC serveur. Aucun URL externe ou destinataire arbitraire accepté par un endpoint public. Les identifiants de base et de projet sont fixes : ne pas l’exécuter contre une base de recette sans adapter explicitement les sources.
- `supabase/migrations/20260917_alert_dispatch.sql` doit être appliquée **après** `20260916_alert_outbox.sql`. Elle fournit la lecture privée du contexte et une réservation contrôlant les PME réellement qualifiées dans le nouveau calcul. Ne pas rejouer les migrations précédentes déjà appliquées.
- Simulation : `node scripts/run-alerts.cjs`. Ne modifie aucune ligne et n’envoie rien. Les secrets/paramètres sont injectés dans l’environnement du processus, pas dans la commande ni dans le dépôt. La console affiche seulement un état et, en simulation, un nombre de correspondances.
- Recette réelle **uniquement après validation** : `node scripts/run-alerts.cjs --send`. Requiert simultanément les trois indicateurs à `true`, les secrets et l’approbation du compte courant. `--send` seul ne suffit pas. Ne pas lancer cette commande simplement pour vérifier l’installation.
- Un échec de stockage après réponse de Resend retourne `reconciliation_required` : vérifier le journal fournisseur et la file, sans relancer le message. L’historique est plafonné à 10 000 entrées par compte avant arrêt et revue opérateur, jamais tronqué silencieusement. Les anciennes réservations annulées ne sont pas réactivées automatiquement.

### Paramètres à connecter avant recette (secrets serveur uniquement)

| Variable | Fonction / valeur de sécurité |
| --- | --- |
| `RESEND_API_KEY` | Clé d’envoi Resend limitée au domaine ; jamais dans Git, le navigateur ou une capture. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur du projet `ocyjfjddyijaaunzupxe`, jamais la clé publique. |
| `PME_ALERT_UNSUBSCRIBE_SECRET` | Secret indépendant, 32 octets aléatoires encodés en 64 caractères hexadécimaux. |
| `RESEND_WEBHOOK_SECRET` | Secret de signature du webhook, pas la clé API Resend. |
| `PME_ALERT_CALLBACKS_ENABLED` | `false` tant que migration et secrets des callbacks ne sont pas prêts. |
| `PME_ALERT_CALLBACKS_READY` | `false` tant que désabonnement et webhook ne sont pas validés sur le déploiement réel. |
| `PME_ALERT_EMAIL_ENABLED` | `false` ; ne pas activer avant la recette interne et le coordinateur. |
| `PME_ALERT_INTERNAL_RECIPIENT` | Adresse interne exacte explicitement autorisée pour la recette ; aucune liste ni destinataire fourni par une requête publique. |
| `PME_ALERT_INTERNAL_USER_ID` | UUID Supabase du même compte de recette ; aucun accès ajouté automatiquement. |
| `AIRTABLE_TOKEN` | Jeton serveur de lecture du catalogue, déjà utilisé par les API publiques ; ne pas l’exposer au client. |

Ne pas copier les secrets de production dans des previews partagées. Les tests automatisés utilisent une base isolée et des appels HTTP simulés. Avant tout envoi réel : revue/appliquer les nouvelles migrations une fois dans l’ordre, connecter les secrets dans Vercel et dans le processus opérateur, valider les callbacks avec Resend, valider une simulation connectée du coordinateur, vérifier quotas et rétention puis approuver séparément le consentement courant du seul compte interne. Il n’existe pas de script d’approbation globale. Ne pas réattribuer une PME réelle pour la recette.

Références de conception : [idempotence Resend, fenêtre de 24 heures](https://resend.com/docs/dashboard/emails/idempotency-keys), [vérification des webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [API d’envoi](https://resend.com/docs/api-reference/emails/send-email).

## Avant tout envoi réel (validation opérationnelle restante)

- Choisir/valider le prestataire, l’expéditeur et le domaine (SPF/DKIM/DMARC), les quotas et la facturation. Ne pas réutiliser le SMTP d’authentification pour une campagne sans validation.
- Valider le coordinateur manuel avec les sources réelles ; ne jamais confondre acceptation Resend et livraison.
- Recontrôler consentement, adresse vérifiée, rattachement et échéance **au moment de l’envoi**, y compris après une révocation concurrente ; annuler les messages en attente après désabonnement.
- Valider sur Vercel les callbacks préparés (corps brut reçu intact), connecter le webhook Resend, vérifier l’arrêt d’urgence et organiser la surveillance des résultats incertains.
- Valider les mentions de confidentialité, la rétention et le consentement de réception réelle après la phase de préparation. Ne pas importer d’abonnés ni activer automatiquement les comptes existants.
- Faire une recette vers une adresse interne consentante avant toute ouverture. Aucune promesse de livraison ou de compatibilité email n’est faite par la simulation.

## Tests

`node tests/alert-plan.cjs`, `node tests/alert-ui.cjs`, `node tests/pme-config.cjs`.

`PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/alert-access.cjs` valide la migration dans un Postgres isolé, pas dans la base de production. Rejouer également toutes les suites de régression existantes.

Socle Resend : `npm ci --ignore-scripts`, `node tests/alert-transport.cjs`, `node tests/alert-callbacks.cjs`, puis `PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/alert-outbox.cjs`. Les requêtes HTTP sont simulées et la base SQL isolée : ces tests n’envoient aucun email. Les assertions de réservation sont séquentielles ; un test de concurrence multi-connexion en recette reste requis.

Coordinateur : `node tests/alert-dispatch.cjs` et `node tests/alert-sources.cjs`. Ils couvrent notamment le mode lecture seule, les changements entre lectures, deux workers simulés concurrents, les erreurs après acceptation fournisseur et la pagination. `alert-outbox.cjs` couvre également la migration du déclencheur et le contrôle des PME fraîchement qualifiées. La concurrence SQL multi-connexion et le parcours réel restent à valider.

## Retrait

Pour masquer le module en production, retirer/mettre à false `PME_ALERT_PREFERENCES_ENABLED` puis redéployer. Ne pas supprimer les tables pour masquer l’interface. Un désabonnement est enregistré via `pme_unsubscribe_alerts()` ; l’historique est conservé. La gestion de la durée de rétention requiert une politique explicite avant l’envoi réel.
