# TimeChat

**Site en ligne : https://ellandeee.github.io/Projet-fil-rouge-messagerie-instantanee/**

TimeChat est une messagerie instantanée où le temps passé à discuter rapporte des grains. On les dépense ensuite dans une boutique pour décorer chaque conversation. Projet fil rouge du cours 8WEB101 (UQAC, automne 2026), réalisé par Ellande Cros et Émeric Aubert.

L'analyse des besoins, l'arborescence et les choix visuels sont détaillés dans [docs/conception.md](docs/conception.md).

## Fonctionnalités

On crée un compte avec une adresse e-mail, un nom d'utilisateur et un mot de passe. On peut se connecter, rester connecté, demander un nouveau mot de passe, changer son nom et la couleur de son avatar, ou supprimer son compte.

On ajoute des contacts en cherchant leur nom d'utilisateur, puis on discute avec eux en privé ou dans un salon de groupe. Les messages arrivent en temps réel, avec l'heure, et on voit qui est en ligne, qui est en train d'écrire et si nos messages sont envoyés, reçus ou lus. Une notification et un son préviennent quand un message arrive dans une autre discussion.

Notre fonctionnalité en plus s'inspire des points de chaîne de Twitch. Tant qu'une discussion est ouverte, on gagne 1 grain toutes les 10 secondes. Si personne n'envoie de message pendant 1 minute, la discussion se ferme toute seule. Les grains servent à acheter, dans une boutique, 47 articles répartis en sept catégories : fonds, bulles, cadres, polices, couleurs, effets d'envoi et sons. Un achat vaut pour une seule discussion et seule la personne qui l'a acheté le voit. Une page Classement range les discussions selon les grains gagnés.

Le site s'utilise aussi sur téléphone : le menu passe en bas de l'écran et la page des discussions montre soit la liste, soit la discussion ouverte.

## Technologies

| Rôle | Choix |
|---|---|
| Interface | HTML, CSS et JavaScript, sans framework |
| Comptes, base de données et temps réel | [Supabase](https://supabase.com) (PostgreSQL) |
| Bibliothèque côté navigateur | `supabase-js` |
| Hébergement | GitHub Pages |
| Polices | Young Serif et Atkinson Hyperlegible (Google Fonts) |

Il n'y a pas de serveur à nous : le navigateur parle directement à Supabase.

## Structure du projet

```
├── index.html            Connexion, inscription et mot de passe oublié
├── conversation.html     Discussions, avec la boutique et la fenêtre « Nouvelle discussion »
├── contact.html          Recherche, invitations et liste des contacts
├── classement.html       Podium et tableau des discussions
├── parametre.html        Mon profil
├── confidentialite.html  Mentions légales et confidentialité
├── 404.html              Page affichée quand une adresse n'existe pas
├── css/
│   ├── style.css            Variables, boutons, formulaires, en-tête (commun à toutes les pages)
│   ├── connexion.css, conversation.css, contact.css, classement.css, parametre.css
│   └── personnalisation.css Les articles de la boutique
├── js/
│   ├── config.js         Création du client Supabase
│   ├── interface.js      Toasts, messages d'erreur, bouton « Afficher » des mots de passe
│   ├── commun.js         Session, en-tête, présence et notifications des pages connectées
│   ├── connexion.js, contact.js, classement.js, parametre.js
│   ├── conversation.js   Liste des salons, messages, envoi et temps réel
│   ├── points.js         Chrono de fermeture et gain des grains
│   ├── boutique.js       Boutique et vitrine d'essai
│   └── effets.js         Animations, sons et polices de la boutique
├── images/               Logo et sablier animé
├── sql/schema.sql        Toute la base de données
└── docs/conception.md    Dossier de conception
```

## Organisation du code

Chaque page charge ses scripts avec `defer`, donc ils s'exécutent dans l'ordre écrit, une fois le HTML lu. L'ordre compte : `supabase-js`, puis `config.js` qui crée le client, puis `interface.js` et `commun.js`, et enfin les fichiers propres à la page. La page de connexion ne charge pas `commun.js` puisqu'on n'y est pas encore connecté.

`commun.js` expose une promesse `pagePrete` que chaque page attend avant de démarrer. Elle vérifie la session, renvoie vers la connexion si on n'est pas connecté, et charge le profil. La page des discussions est découpée en quatre fichiers pour que chacun ait un seul rôle : `conversation.js` pour la messagerie, `points.js` pour le chrono, `boutique.js` pour la boutique et `effets.js` pour les animations.

Les messages sont toujours ajoutés à l'écran avec `textContent` et jamais avec `innerHTML`, pour qu'un message ne puisse pas injecter du code. Les animations sont coupées si la personne a demandé moins d'animations dans son système.

## Base de données

Tout est dans [`sql/schema.sql`](sql/schema.sql). Dans le code et la base on parle de « points », le mot « grains » n'apparaît que dans les textes du site.

| Table | Contenu |
|---|---|
| `profils` | Nom d'utilisateur et couleur d'avatar, créé automatiquement à l'inscription |
| `contacts` | Invitations et contacts acceptés entre deux personnes |
| `salons` et `membres_salon` | Discussions privées ou de groupe, avec la date de dernière lecture de chaque membre |
| `messages` | Messages de 500 caractères maximum |
| `points` | Grains gagnés et solde de chaque personne dans chaque discussion |
| `articles` | Catalogue de la boutique |
| `achats` et `personnalisations` | Articles achetés et articles équipés, par discussion |

La clé publique de `config.js` est visible par tout le monde, c'est normal. La protection repose sur la sécurité au niveau des lignes (RLS) : chacun ne lit que ses contacts, ses discussions, ses messages et ses grains. Les opérations sensibles passent par des fonctions de la base (`crediter_points`, `acheter_article`, `equiper_article`, `ouvrir_salon_prive`, `creer_salon_groupe`, `supprimer_mon_compte`). Par exemple `crediter_points` refuse de donner plus d'un grain toutes les 10 secondes, et `acheter_article` lit le prix dans la base plutôt que de croire le navigateur, donc on ne peut pas tricher depuis la console.

## Installation

Il faut d'abord créer un projet sur [supabase.com](https://supabase.com), puis coller le contenu de `sql/schema.sql` dans **SQL Editor** et cliquer sur Run. Le script peut être relancé sans risque.

Dans **Authentication**, la connexion par e-mail doit être activée. Pour tester rapidement, on peut désactiver la confirmation par e-mail.

Ensuite on remplace `SUPABASE_URL` et `SUPABASE_CLE_PUBLIQUE` dans `js/config.js` par ceux du projet (**Project Settings > API**). Il ne faut jamais y mettre la clé secrète `service_role`.

Pour travailler en local, il suffit d'ouvrir le dossier avec un petit serveur, par exemple l'extension Live Server ou Live Preview de VS Code.

## Ce qu'on a ajouté par rapport à l'exemple du cours

Les messages plus anciens se chargent avec un bouton « Messages précédents ». Un message ne peut pas s'afficher deux fois, même s'il arrive par le temps réel juste après l'envoi. La discussion ne descend toute seule que si on était déjà en bas, sinon un bouton « Nouveaux messages » apparaît. Les boutons sont bloqués pendant qu'on attend une réponse de Supabase, et les erreurs s'affichent dans la page plutôt que dans la console. Chaque discussion garde aussi le brouillon du message qu'on était en train d'écrire.
