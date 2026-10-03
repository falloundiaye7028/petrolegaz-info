# Actualités PétroleGaz : installation et guide de publication

## État de livraison

Le code de la rubrique et son API de lecture sont préparés. L’accès au compte Airtable existant et à la base PétroleGaz Info a été vérifié. **L’installation de la table `Actualités` et de son schéma reste en attente ; elle n’a pas été effectuée. L’activation et le déploiement du site ne sont pas confirmés.** La publication éditoriale ne sera opérationnelle qu’après cette installation et une recette réelle.

Aucun article de démonstration n’est ajouté au catalogue public. Les tests utilisent exclusivement des données locales fictives. Aucun article, compte, jeton ou droit d’accès Airtable n’est créé ou modifié par ce code.

La rédaction se fait dans **l’interface Airtable existante, après connexion avec les accès habituels**. Il n’y a pas de nouvel espace d’administration public, de mot de passe dans le site, ni de bouton public permettant de publier. L’API du site ne dispose d’aucune opération d’écriture.

## Installation initiale, par une personne autorisée

1. Ouvrir la base Airtable PétroleGaz existante, identifiant `appCQuqklwVbrz7XF`.
2. Vérifier si la table `Actualités` existe déjà. Si oui, comparer ses champs au schéma ci-dessous avant tout changement. Sinon, la créer uniquement après validation de la personne responsable de la base.
3. Créer **toutes les colonnes listées**, y compris celles dont la valeur est facultative. L’API les sélectionne explicitement : une colonne manquante est une erreur de configuration, pas un catalogue vide.
4. Conserver l’accès à cette table dans les droits Airtable privés existants. Ne pas créer de formulaire de publication anonyme ou de vue partagée contenant des brouillons.
5. Vérifier côté serveur Vercel que la variable existante `AIRTABLE_TOKEN` a déjà accès en lecture aux enregistrements de cette base. Ne jamais copier ce jeton dans une page HTML, un script navigateur, un dépôt ou un message. Le site n’a besoin d’aucun droit d’écriture pour cette rubrique. Toute création de jeton ou modification de droits demande l’accord du propriétaire.
6. Par défaut, l’API utilise la table nommée exactement `Actualités`. Si une table existante de même schéma porte un autre nom, l’administrateur peut renseigner la variable serveur facultative `AIRTABLE_ACTUALITES_TABLE` avec son nom ou son identifiant. Il n’y a pas de nouvelle variable obligatoire.
7. Après une validation et un déploiement autorisés, effectuer la recette en fin de document. Mettre à jour l’état de livraison uniquement après cette vérification réelle.

### Création simple des colonnes

Dans la base existante, utiliser l’ajout d’une table vide, la nommer `Actualités`, puis renommer le champ principal en `Titre`. Ajouter ensuite les 14 autres colonnes avec les noms et types ci-dessous. Définir les trois valeurs de `Statut`, avec `Brouillon` par défaut, ainsi que les valeurs de `Catégorie` et `Type d’acteur`.

Le fichier [`docs/actualites-colonnes.csv`](docs/actualites-colonnes.csv) contient uniquement la ligne d’en-têtes, sans article ni données inventées. Il peut servir de liste à copier ou de point de départ si l’interface d’import accepte un CSV sans lignes de données. **L’import ne configure pas les types, les valeurs de sélection ni le fuseau** : vérifier chaque colonne après import. Si l’interface exige des données, créer la table vide manuellement plutôt que publier un faux article.

### Schéma exact

Respecter les accents, espaces et apostrophes, notamment **`Type d’acteur`** avec l’apostrophe typographique `’`.

| Champ | Type Airtable | Règle éditoriale |
| --- | --- | --- |
| `Titre` | Texte court, champ principal | Obligatoire, 220 caractères maximum |
| `Résumé` | Texte long, texte enrichi désactivé | Facultatif, 650 caractères maximum ; une ou deux phrases recommandées |
| `Contenu` | Texte long, texte enrichi désactivé | Obligatoire, 50 000 caractères maximum ; paragraphes séparés par une ligne vide |
| `Catégorie` | Sélection unique | Obligatoire : `Pétrole`, `Gaz` ou `Mines` |
| `Organisation` | Texte court | Facultatif, 200 caractères maximum ; entreprise, institution ou projet concerné |
| `Type d’acteur` | Sélection unique | `Entreprise`, `Institution`, `Projet` ou `Autre` ; vide affiché comme `Autre` |
| `Localisation` | Texte court | Facultatif, 200 caractères maximum ; pays, région ou ville utile à la compréhension |
| `Date de publication` | Date avec heure | Obligatoire ; fixer le fuseau commun de l’équipe, UTC recommandé |
| `Source` | Texte court | Obligatoire, 200 caractères maximum ; nom de l’organisme ou du média source |
| `Lien source` | URL | Obligatoire ; lien absolu `https://…` recommandé, `http://…` accepté ; destination publique sans identifiants |
| `Photo` | Pièce jointe | Facultative ; photo autorisée, en JPEG, PNG, WebP, GIF ou AVIF |
| `Légende photo` | Texte court | Facultatif techniquement, recommandé pour l’accessibilité ; 350 caractères maximum |
| `Crédit photo` | Texte court | Facultatif techniquement, à renseigner lorsque requis par les droits ; 200 caractères maximum |
| `Statut` | Sélection unique | `Brouillon`, `Publié`, `Archivé` ; choisir `Brouillon` par défaut |
| `Slug` | Texte court | Valeur facultative, 160 caractères maximum ; minuscules sans accents, chiffres et tirets, par exemple un identifiant éditorial stable |

`Résumé`, `Organisation`, `Type d’acteur`, `Localisation`, les informations photo et `Slug` peuvent rester vides, mais leurs **colonnes doivent exister**. Ne pas remplacer les sélections uniques par des sélections multiples ou des liens vers d’autres tables sans adapter l’API.

Des colonnes de travail supplémentaires peuvent rester privées, par exemple notes, validation ou droits de reproduction. Elles ne sont ni demandées à Airtable ni renvoyées par l’API publique.

## Publier un article au quotidien

1. Dans Airtable, ajouter un enregistrement avec `Statut = Brouillon`.
2. Renseigner le titre, le contenu, la catégorie, la source et son lien. Ajouter le résumé et les informations sur l’acteur concerné si elles sont connues. Ne pas déduire ou inventer des dates, des citations, des annonces ou des chiffres absents des sources.
3. Écrire en **texte simple**. Une ligne vide sépare les paragraphes. Les balises HTML et le Markdown ne sont pas interprétés : ils s’affichent comme du texte.
4. Si une photo peut être utilisée, la joindre dans `Photo`, puis remplir sa légende et son crédit. Une publication sans photo est possible. La première pièce jointe reconnue comme photo sûre est utilisée ; une photo invalide est ignorée sans bloquer l’article.
5. Ouvrir le lien source et relire l’article : organisme exact, date, chiffres, contexte, distinction entre annonce et réalisation. Vérifier que le lien est public et ne contient ni mot de passe, ni jeton privé.
6. Fixer la date et l’heure de mise en ligne dans `Date de publication`. Ce champ représente la publication de cet article sur PétroleGaz ; si la source porte une autre date, l’expliquer dans le texte sans la présenter comme une mise à jour récente.
7. Après validation éditoriale et vérification des droits, passer `Statut` à **`Publié`**.
8. Recharger la liste et ouvrir l’article pour vérifier son affichage réel, son lien source et sa photo.

### Date future et programmation

Un article `Publié` dont la date est future reste invisible, même si quelqu’un connaît son identifiant. Il devient éligible à sa date prévue lors d’une nouvelle consultation de l’API. Aucune notification, tâche planifiée ou publication sur un réseau social n’est créée.

Le serveur utilise l’heure UTC. Airtable affiche éventuellement un fuseau différent : vérifier ensemble le fuseau et l’heure avant de programmer. Une liste déjà ouverte ne s’actualise pas seule. Une recherche paginée conserve son instant de départ ; recharger la page pour voir les nouvelles publications.

### Corriger, retirer et conserver les liens

- Pour une correction visible immédiate après rechargement, modifier l’enregistrement existant. Pour une révision importante, le repasser en `Brouillon`, corriger, puis le republier.
- Pour retirer l’article du site, choisir `Archivé`. La liste et la fiche ne l’exposent plus aux nouvelles requêtes. Une personne peut toujours avoir une copie déjà téléchargée ; archiver ne l’efface pas de son appareil.
- Ne pas supprimer puis recréer l’enregistrement pour une simple correction : le lien de fiche repose sur son identifiant Airtable stable, via `actualite.html?id=rec…`.
- Le `Slug` est une métadonnée facultative ; la fiche n’en dépend pas. S’il est vide ou invalide, l’API utilise l’identifiant de l’enregistrement.
- Éviter de changer la date uniquement pour remonter artificiellement un ancien article. Expliquer une mise à jour importante dans le texte.

## Sources, photos et confidentialité

- Citer une source ne donne pas automatiquement le droit d’en republier un texte ou une photo. Rédiger une synthèse originale et vérifier les droits ou autorisations applicables avant de reproduire un contenu.
- Vérifier l’attribution exacte du crédit, la licence et ses conditions. Conserver la preuve des droits dans le suivi privé de l’équipe. Un crédit visible ne remplace pas une autorisation.
- Ne pas utiliser de photos privées, confidentielles ou trompeuses. Si une photo est illustrative, l’indiquer dans la légende. Ne pas présenter une image comme le lieu ou l’événement réel sans vérification.
- Tous les champs publics d’un article éligible, y compris sa photo, sont accessibles sans connexion. Ne jamais y inscrire des coordonnées personnelles non destinées à publication, des informations confidentielles, des mots de passe ou des liens d’accès privé.
- Un changement de statut protège les nouvelles réponses du site, mais ne peut pas révoquer une photo ou un texte déjà téléchargé par un lecteur.
- Les pièces jointes Airtable fournissent des URL temporaires. L’API récupère une URL fraîche à chaque consultation ; ne pas recopier ces URL comme liens permanents ni les conserver dans le code. Si une page est restée ouverte très longtemps et qu’une image ne charge plus, la recharger. Pour un volume important ou un hébergement permanent des photos, prévoir un stockage média dédié après validation, plutôt qu’utiliser Airtable comme CDN. Voir [le comportement officiel des URL de pièces jointes](https://support.airtable.com/articles/9671148410-airtable-attachment-url-behavior).

## Contrat technique

### Liste

`GET /api/actualites`

Paramètres facultatifs :

- `limit` : de 1 à 24, valeur par défaut 12
- `q` : recherche jusqu’à 120 caractères, sans distinction de casse et avec normalisation des accents français ; porte sur le titre, le résumé, l’organisation, la localisation et le nom de la source
- `category` : `Pétrole`, `Gaz` ou `Mines`
- `actorType` : `Entreprise`, `Institution`, `Projet` ou `Autre`
- `cursor` : valeur opaque `nextCursor` de la réponse précédente ; à transmettre avec les mêmes filtres

Réponse :

```json
{
  "articles": [],
  "count": 0,
  "hasMore": false,
  "nextCursor": null
}
```

`count` compte **uniquement les articles de cette page**, pas le total du catalogue. Les résultats sont demandés du plus récent au plus ancien, puis par titre. Un curseur conserve l’instant de recherche, expire après une heure et doit être abandonné lorsque les filtres changent. Un curseur expiré appelle un redémarrage de la recherche, pas une boucle de réessai avec le même curseur.

Le serveur demande au maximum quatre pages Airtable pour remplir une page publique, avec une durée totale limitée à sept secondes. Si des enregistrements rejetés occupent les pages examinées, une réponse peut contenir moins d’articles que `limit`, voire zéro, **tout en ayant `hasMore = true`**. Le navigateur doit alors conserver la possibilité de charger la suite et ne pas présenter le catalogue comme définitivement vide.

### Fiche

`GET /api/actualites?id=rec…`

Réponse : `{ "article": { … } }`. L’identifiant doit être un identifiant Airtable valide. Ne pas ajouter de paramètres de liste à une demande de fiche.

Chaque article contient exactement :

```text
id, slug, title, summary, body, category, organization, actorType,
location, publishedAt, sourceName, sourceUrl,
image: null ou { url, alt, caption, credit }
```

`body` est une chaîne de texte simple avec sauts de ligne. `publishedAt` est une date ISO UTC. Une légende vide utilise le titre comme texte alternatif de la photo. Aucun champ supplémentaire d’Airtable, statut interne, nom de fichier, métadonnée de pièce jointe, date de création ou jeton n’est publié.

Les consommateurs doivent insérer les champs textuels avec `textContent` ou un échappement HTML sûr. Ils ne doivent pas injecter le titre, le contenu, les légendes ou les crédits dans `innerHTML`, même si les données ont été normalisées côté serveur.

### Conditions de publication et erreurs

Un enregistrement doit réunir **toutes** les conditions suivantes : statut exactement `Publié`, date valide non future, titre et contenu non vides dans les limites prévues, catégorie autorisée, nom de source et URL source sûrs. Un champ obligatoire absent, mal typé ou trop long masque l’article. Un champ facultatif mal typé ou trop long est omis ou remplacé par sa valeur de repli.

Les liens source utilisent HTTP(S), les photos HTTPS. Les adresses avec identifiants, protocoles dangereux, caractères de contrôle, hôtes locaux ou adresses IP littérales sont refusées. Les photos SVG, documents et pièces jointes HTML ne sont pas affichés.

| HTTP | Code | Signification et conduite à tenir |
| --- | --- | --- |
| 200 | — | Source accessible ; liste réellement vide possible |
| 400 | `INVALID_QUERY` | Paramètre invalide, filtre modifié avec un ancien curseur ou pagination expirée ; recommencer la recherche |
| 404 | `ARTICLE_NOT_FOUND` | Identifiant inexistant ou article non publiable ; brouillons et archives sont indistinguables d’un article absent |
| 405 | `METHOD_NOT_ALLOWED` | Seule la méthode GET est permise |
| 503 | `ACTUALITES_UNAVAILABLE` | Jeton, table, colonnes ou accès serveur à vérifier ; **ne pas afficher “aucune actualité”** |
| 502 | `UPSTREAM_UNAVAILABLE` | Réponse Airtable invalide, indisponibilité ou limite de débit ; proposer de réessayer |
| 504 | `UPSTREAM_TIMEOUT` | Délai de sept secondes dépassé ; proposer de réessayer |

Les réponses utilisent `Cache-Control: no-store` pour que corrections et retraits soient réévalués à chaque requête. Pour une forte audience, prévoir une protection de débit et une stratégie de capacité validées avec l’hébergement ; ne pas ajouter un cache persistant qui laisserait des archives ou des brouillons publiés par erreur.

Les formules filtrent côté Airtable, puis l’API revalide chaque enregistrement indépendamment. Les paramètres sont bornés et échappés ; ni les erreurs brutes d’Airtable ni les détails de configuration ne sont exposés au navigateur. Références : [filtres et tri Airtable](https://support.airtable.com/articles/1941464361-airtable-web-api-using-filterbyformula-or-sort-parameters), [fonctions de formule Airtable](https://support.airtable.com/articles/7330071120-airtable-formula-field-functions-reference).

## Recette avant activation

### Tests locaux, sans réseau

```sh
node tests/actualites-api.cjs
```

La suite vérifie notamment : contrat public, champs privés exclus, brouillons/archives/dates futures bloqués même en fiche directe, dates invalides, liens dangereux, photos optionnelles, texte ressemblant à du HTML, recherche accentuée et échappement des formules, pagination bornée, curseurs expirés, méthode GET seule, table vide distincte d’une configuration absente, erreurs amont et délai maximal. Les fixtures ne sont jamais écrites dans Airtable.

### Vérification avec la vraie configuration, après autorisation

- Vérifier la table et les 15 colonnes avec la personne responsable ; confirmer que les champs de sélection ont les valeurs exactes
- Vérifier `/api/actualites?limit=1` sur l’environnement autorisé : 200 si la source est prête, même si elle est vide ; traiter un 503 comme un blocage d’activation
- Avec des enregistrements de recette autorisés, vérifier qu’un brouillon et une date future n’apparaissent ni dans la liste ni via leur identifiant
- Utiliser uniquement un contenu réel, relu et autorisé pour la première publication publique ; ne pas publier les fixtures des tests
- Vérifier la liste, la recherche, les filtres, le chargement de la suite et la fiche sur mobile comme sur ordinateur
- Vérifier l’article sans photo, la légende et le crédit d’une photo autorisée, le lien source et les paragraphes
- Vérifier qu’un passage en `Archivé` retire l’article lors d’un rechargement de la liste et de sa fiche
- Vérifier que l’indisponibilité de la source affiche un message de réessai, sans créer de faux articles ni annoncer un catalogue vide
- Confirmer le déploiement réel et l’accès éditorial privé avant de déclarer la publication opérationnelle
