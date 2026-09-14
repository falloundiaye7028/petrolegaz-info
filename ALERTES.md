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

**Limites explicites :** migration non appliquée en production par ce lot ; tables d’approbation initialement vides ; aucun nouveau compte inscrit aux envois ; aucun coordinateur catalogue → file → transport, cron ou API publique d’envoi livré. Les callbacks sont fermés par défaut. Le transport n’est appelé par aucune route existante. La file réserve une seule opportunité par compte/message ; un digest multi-opportunités nécessite une table de réservation par élément. Les anciens abonnements de préparation ne constituent pas une activation d’envoi.

La politique conservatrice est « au plus une tentative » : un processus interrompu peut laisser un message `attempting` ou `unknown`, jamais remis automatiquement en file. L’historique ne doit pas être effacé pour relancer : cela détruirait la protection anti-doublon. Une révocation après le contrôle final ne peut pas rappeler un email déjà en cours d’envoi chez Resend. Une vérification fraîche du catalogue et de l’adéquation au score reste à réaliser dans le coordinateur avant l’autorisation SQL ; la base ne possède pas le catalogue Airtable.

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

Ne pas copier les secrets de production dans des previews partagées. Tester d’abord avec une base de recette et une adresse consentante. Avant tout envoi : revue/appliquer la migration une fois, connecter les secrets dans Vercel, valider les callbacks avec Resend, construire/tester le coordinateur, vérifier quotas et rétention puis approuver séparément le consentement courant du seul compte interne. Il n’existe pas de script d’approbation globale. Ne pas réattribuer une PME réelle pour la recette.

Références de conception : [idempotence Resend, fenêtre de 24 heures](https://resend.com/docs/dashboard/emails/idempotency-keys), [vérification des webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [API d’envoi](https://resend.com/docs/api-reference/emails/send-email).

## Avant tout envoi réel (validation opérationnelle restante)

- Choisir/valider le prestataire, l’expéditeur et le domaine (SPF/DKIM/DMARC), les quotas et la facturation. Ne pas réutiliser le SMTP d’authentification pour une campagne sans validation.
- Relier le coordinateur à la file et au transport préparés ; ne jamais marquer un message envoyé avant confirmation du prestataire.
- Recontrôler consentement, adresse vérifiée, rattachement et échéance **au moment de l’envoi**, y compris après une révocation concurrente ; annuler les messages en attente après désabonnement.
- Valider sur Vercel les callbacks préparés (corps brut reçu intact), connecter le webhook Resend, vérifier l’arrêt d’urgence et organiser la surveillance des résultats incertains.
- Valider les mentions de confidentialité, la rétention et le consentement de réception réelle après la phase de préparation. Ne pas importer d’abonnés ni activer automatiquement les comptes existants.
- Faire une recette vers une adresse interne consentante avant toute ouverture. Aucune promesse de livraison ou de compatibilité email n’est faite par la simulation.

## Tests

`node tests/alert-plan.cjs`, `node tests/alert-ui.cjs`, `node tests/pme-config.cjs`.

`PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/alert-access.cjs` valide la migration dans un Postgres isolé, pas dans la base de production. Rejouer également toutes les suites de régression existantes.

Socle Resend : `npm ci --ignore-scripts`, `node tests/alert-transport.cjs`, `node tests/alert-callbacks.cjs`, puis `PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/alert-outbox.cjs`. Les requêtes HTTP sont simulées et la base SQL isolée : ces tests n’envoient aucun email. Les assertions de réservation sont séquentielles ; un test de concurrence multi-connexion en recette reste requis.

## Retrait

Pour masquer le module en production, retirer/mettre à false `PME_ALERT_PREFERENCES_ENABLED` puis redéployer. Ne pas supprimer les tables pour masquer l’interface. Un désabonnement est enregistré via `pme_unsubscribe_alerts()` ; l’historique est conservé. La gestion de la durée de rétention requiert une politique explicite avant l’envoi réel.
