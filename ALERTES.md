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

Le module est visible en preview et masqué en production par défaut. `emailSendingEnabled` reste **false sans exception**. Aucun transport email, tâche planifiée, endpoint d’envoi, paiement ni nouveau prestataire n’est installé. La fréquence est une préférence enregistrée, pas une planification active.

## Avant tout envoi réel (non livré dans ce lot)

- Choisir/valider le prestataire, l’expéditeur et le domaine (SPF/DKIM/DMARC), les quotas et la facturation. Ne pas réutiliser le SMTP d’authentification pour une campagne sans validation.
- Implémenter la file serveur avec clé unique compte/opportunité, réservation atomique, tentatives bornées et idempotence transport ; ne jamais marquer un message envoyé avant confirmation du prestataire.
- Recontrôler consentement, adresse vérifiée, rattachement et échéance **au moment de l’envoi**, y compris après une révocation concurrente ; annuler les messages en attente après désabonnement.
- Ajouter le lien de désabonnement signé et l’endpoint de désabonnement sans connexion, la gestion authentifiée des retours/rebonds/plaintes, l’arrêt d’urgence et la surveillance.
- Valider les mentions de confidentialité, la rétention et le consentement de réception réelle après la phase de préparation. Ne pas importer d’abonnés ni activer automatiquement les comptes existants.
- Faire une recette vers une adresse interne consentante avant toute ouverture. Aucune promesse de livraison ou de compatibilité email n’est faite par la simulation.

## Tests

`node tests/alert-plan.cjs`, `node tests/alert-ui.cjs`, `node tests/pme-config.cjs`.

`PGLITE_MODULE=/chemin/vers/@electric-sql/pglite node tests/alert-access.cjs` valide la migration dans un Postgres isolé, pas dans la base de production. Rejouer également toutes les suites de régression existantes.

## Retrait

Pour masquer le module en production, retirer/mettre à false `PME_ALERT_PREFERENCES_ENABLED` puis redéployer. Ne pas supprimer les tables pour masquer l’interface. Un désabonnement est enregistré via `pme_unsubscribe_alerts()` ; l’historique est conservé. La gestion de la durée de rétention requiert une politique explicite avant l’envoi réel.
