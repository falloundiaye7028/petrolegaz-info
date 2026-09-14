# Lot 2 — consultation de l'annuaire et des opportunités

- Annuaire : pagination de 12 entreprises, secteurs tirés des données, localisation, recherche insensible aux accents et réinitialisation.
- Opportunités : pagination de 10 avis, secteurs et donneurs d'ordre, dates inconnues et avis clôturés, réinitialisation.
- Accès à l'avis source lorsque `Lien source` (champ URL facultatif de la table Airtable `Appels d'offres`) est renseigné. Une URL dans le champ existant `Source` fonctionne aussi. Sinon le site indique que le lien manque. Seuls HTTP/HTTPS sans identifiants intégrés sont acceptés.
- Un avis dépassé ne propose plus de demande d'informations. Les dates sans heure restent évaluées par jour à Dakar.
- Chargement avec délai maximal et bouton de nouvelle tentative en cas d'erreur.

Le filtre « Clôturées » porte sur les avis déjà renvoyés par l'API : celle-ci sélectionne toujours les statuts Airtable Nouveau/En cours. Ce n'est pas une archive exhaustive des marchés clôturés.

## Vérifications

Test en navigateur local avec 25 entreprises et 12 avis fictifs : passage de page, retour à la page 1 après filtrage, combinaison localisation/statut, recherche sans accents, réinitialisation, filtres de date/secteur/acheteur, lien HTTPS présent et lien javascript absent, suppression du bouton de demande pour un avis dépassé. Aucune erreur console sur la page des opportunités testée. Syntaxe JavaScript et contrôle Git des espaces vérifiés.

Les données fictives et le serveur de test ne sont pas inclus dans le dépôt. Aucun enregistrement Airtable n'a été créé ou modifié. La prévisualisation Vercel avec les données réelles et le rendu mobile restent à vérifier avant fusion.

## Déploiement

Déployer la branche complète : les deux pages nécessitent désormais les nouveaux fichiers `assets/catalogue.js`, `assets/catalogue.css`, `assets/annuaire.js` et `assets/opportunites.js`. L'API appels-offres ajoute le champ `sourceUrl` sans rendre obligatoire un nouveau champ Airtable. Conserver la variable AIRTABLE_TOKEN existante. Après validation de la prévisualisation, fusionner la branche dans main via une demande de fusion.
