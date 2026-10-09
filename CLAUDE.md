# Moteur de match de football

## Le but

Frédéric veut créer un jeu d'entraîneur de football centré sur la tactique : pas de simulation du monde du foot ni du temps qui passe, seulement un match où le joueur gagne par ses choix tactiques. Il faut pour cela un moteur de match réaliste, où chaque footballeur réfléchit par lui-même et ne ressemble pas à un robot.

Étape actuelle (8 octobre 2026, cinquième séance) : un moteur qui simule un match de 90 minutes entre deux équipes en 4-4-2, avec **cinq consignes tactiques réglables par équipe**, avant et pendant le match. Il y a deux sortes d'équipes :

- l'équipe **standard**, où tous les joueurs ont 14 sur 20 partout. Elle sert à comparer les consignes entre deux équipes strictement égales ;
- **quatre équipes de niveaux différents** (élite, élevé, moyen, faible), avec des notes selon le poste, gardées dans le fichier `equipes.json`.

Le code est sur GitHub : `fredGob/foot-match-engine`, branche `main`.

## Comment parler à Frédéric

Il a dit plusieurs fois ne pas comprendre ce que je faisais pendant ce travail. Donc : phrases simples, pas de jargon, dire régulièrement où on en est, et tenir ce fichier à jour (tests, réussites, échecs) à chaque séance.

Ce qu'il a dit et qu'il faut garder en tête :

- Montrer où chaque joueur veut aller, son intention et ses notes, c'est « exactement la bonne direction ». Toute nouvelle mécanique doit rester lisible joueur par joueur.
- Une consigne est une **intention**, pas une règle : « jouer court » ne veut pas dire que tous les ballons sont courts.
- Il regarde les matchs et repère vite ce qui cloche (exemple : les milieux ne passaient jamais aux défenseurs centraux). Ses remarques valent plus que mes moyennes.
- Le match doit s'ouvrir à l'arrêt : on règle les consignes, puis on lance. 90 minutes par défaut ; les durées courtes ne servent qu'aux essais.
- **Les consignes doivent se voir et peser sur le match.** Son test : Bleus en jeu long contre Rouges en bloc haut. Si « ça ne change presque rien », la consigne ne sert à rien, même si mes moyennes bougent.
- Pour cette version, toutes les notes des joueurs sont à 14 : deux équipes égales, seules les consignes font la différence. Les notes individuelles viendront plus tard.
- Après la deuxième séance, il a jugé l'ensemble « bien pour une version 1 » et le comportement global « cohérent ». Après la troisième : « des choses progressent bien dans les comportements ».
- Les passes ratées, c'est bien ; il veut aussi des **contrôles ratés**, liés à une qualité « Prise de balle » : sans pression même un joueur moyen contrôle, sous pression il peut rater, et un joueur doué s'en sort.
- **Les tests doivent se faire avec des équipes de niveaux différents** (élite contre faible, etc.). Les équipes sont dans `equipes.json`, « notre fichier de sauvegarde d'équipe » : on y garde la trace des joueurs et on le modifie à la main si besoin.
- À la fin d'une tâche : noter ici les avancements et les défauts qui restent à corriger sur le moteur.
- Méthode convenue : les vraies statistiques servent de garde-fou, pas de moteur. On avance une situation à la fois : il décrit ce qu'il attend, j'écris un outil qui isole la situation, je trouve la cause, je corrige, je remesure tout.

## Regarder un match

Le fichier à ouvrir est `match.html` : il contient tout et s'ouvre dans n'importe quel navigateur (double-clic, ou `xdg-open match.html`). Après une modification du moteur ou de la page, le refaire avec `node build.js`.

Comment la page fonctionne :

1. **Avant-match.** Le terrain est en place, le match est à l'arrêt. On choisit les équipes (cadre « Équipes », à droite) et les consignes des deux camps (cadre « Consignes »). Rien n'est calculé. « Standard » : tous les joueurs à 14. Les autres choix sont les équipes de `equipes.json`. Changer d'équipe en cours de match remet le match au coup d'envoi.
2. **« Lancer le match ».** La page calcule alors le match entier (environ 1,5 seconde pour 90 minutes), puis le lit comme une vidéo.
3. **Barre de temps.** On la fait glisser pour aller à n'importe quel instant, en avant comme en arrière. Flèches ← → : 5 secondes. Boutons −10 s et +10 s. Les repères sur la barre sont les buts (ronds), les tirs (petits traits) et les changements de consigne (losanges) ; un clic dessus y amène.
4. **Changer une consigne en cours de match.** Le changement s'applique à partir de l'instant affiché : le passé ne bouge pas, toute la suite est recalculée. Il est noté dans le fil du match.
5. **Numéro de match.** Il fixe le hasard (et les noms des joueurs de l'équipe standard). Même numéro, mêmes équipes et mêmes consignes aux mêmes instants : exactement le même match. « Rejouer ce match » repart du coup d'envoi avec les consignes affichées.
6. **Série de matchs** (sous le terrain). Simule beaucoup de matchs avec les équipes et les consignes affichées et donne les moyennes des deux équipes côte à côte. C'est le seul moyen honnête de juger une consigne : un match isolé ne prouve rien, car après un changement toute la suite part ailleurs.

Aussi dans la page : vitesse ×1 à ×16, clic sur un joueur pour lire ce qu'il fait (s'il suit ou non une consigne, sa fraîcheur, ses notes), case pour voir où chaque joueur veut aller, choix de la durée (90, 45, 20 ou 10 minutes). Les statistiques ont une ligne « Fraîcheur des joueurs » : c'est là qu'on voit ce que coûte un pressing.

Les arrêts de jeu ont une durée réaliste (une touche 17 secondes, une sortie de but 30, un corner 34…). Pour ne pas attendre, la case « Passer vite les arrêts de jeu » (cochée par défaut) les lit six fois plus vite.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `engine.js` | Le moteur : joueurs, ballon, règles, décisions, consignes. Aucun affichage. |
| `render.js` | Le dessin du terrain vu de dessus. |
| `stats.js` | Les statistiques affichées (un match ou une série), partagées par la page et les outils. |
| `index.html` | La page : avant-match, lecture, barre de temps, consignes, série de matchs. |
| `equipes.json` | **Le fichier des équipes** : quatre équipes, onze joueurs chacune, vingt notes par joueur. Se modifie à la main. |
| `equipes.js` | Donne les équipes du fichier aux outils en ligne de commande (`equipe=elite`). |
| `build.js` | Assemble le tout (page, moteur, dessin, statistiques, équipes) en un seul fichier `match.html`. |
| `sim.js` | Simule beaucoup de matchs sans affichage et donne les moyennes. |
| `check.js` | Vérifie que le moteur ne déraille pas : sans consignes, avec consignes, et entre équipes de niveaux différents. |
| `README.md`, `docs/apercu.png` | La présentation du projet sur GitHub, avec une capture d'écran de la page. |
| `tools/` | Outils de contrôle : test de la page, vrai navigateur, effet des consignes, tournoi entre les équipes, énergie, qui passe à qui, possession (comment chaque équipe perd le ballon), images. |

## Comment le moteur fonctionne

Le temps avance par pas de 0,05 seconde. À chaque pas :

1. **L'équipe** donne à chaque joueur une position de référence, qui dépend de l'endroit où est le ballon et de qui l'a. C'est un repère, pas un ordre.
2. **Chaque joueur réfléchit** à son propre rythme (toutes les 0,2 à 0,4 seconde, jamais tous en même temps) et choisit quoi faire : presser, marquer, se démarquer, faire un appel, aller au ballon.
3. **Le porteur du ballon** note toutes ses options (chaque passe possible, conduire le ballon dans 9 directions, tirer, garder, dégager) et prend la meilleure, avec une part d'erreur qui dépend de ses qualités et de la pression.
4. **Les gestes sont imprécis** : une passe ou un tir part avec un écart qui dépend du joueur, de la distance et de la pression.
5. **Le ballon suit une physique simple** : il roule, ralentit, vole, rebondit.

Chaque joueur a 20 qualités (vitesse, passe, lucidité, goût du risque…). **Dans l'équipe standard elles valent toutes 14 sur 20**, à la demande de Frédéric : deux équipes égales, seules les consignes font la différence. Les joueurs ne décident quand même pas tous pareil : chaque choix garde une part de hasard. Les équipes de `equipes.json` ont des notes différentes selon le poste et le niveau (voir « Les équipes »). L'ancien tirage au hasard existe toujours (`createMatch({ random: true })`) mais ne sert plus.

Trois idées ajoutées à la deuxième séance dans la tête du porteur :

- **La relance.** Donner le ballon à un partenaire libre derrière soi ne coûte presque rien tant qu'on construit. C'est ce qui amène le ballon aux défenseurs centraux.
- **Prendre son temps.** Un joueur libre, loin du but adverse, lève la tête avant de passer. Un défenseur libre dans son camp avance sans courir.
- **L'impatience.** Plus la possession dure sans rien donner (au-delà de 8 secondes), plus les joueurs acceptent de tenter vers l'avant.

La fatigue : la fraîcheur d'un joueur baisse avec ses courses et ne remonte pas. Elle réduit sa vitesse de pointe : à 50 % de fraîcheur, il perd 9 % de vitesse.

Ajouts de la troisième séance :

- **Jouer dans le dos de la défense.** Un joueur lancé prend le ballon dans sa foulée sans freiner, conduit vite quand la voie est libre (un adversaire dans son dos ne le fait plus ralentir), et un défenseur dans son dos le gêne moins pour tirer qu'un défenseur devant lui.
- **Coups francs.** À portée de tir (moins de 32 m), l'équipe qui défend forme un mur de 2 à 5 joueurs à distance réglementaire, côté premier poteau ; le gardien garde l'autre côté. Le tireur frappe par-dessus le mur avec un ballon brossé qui plonge. Sur ballon arrêté, le geste est presque deux fois plus précis que dans le jeu.

Ajouts de la quatrième séance :

- **Prise de balle.** Chaque réception est un contrôle qui peut échouer. Sans adversaire proche, presque jamais (0,7 % pour un joueur à 14). Sous pression, cela dépend de la note : 21 % d'échecs à 8, 10 % à 14, 3 % à 18. Un joueur doué réussit en plus des « contrôles orientés » : il s'éloigne de l'adversaire dès le premier contact et ne peut pas être taclé pendant un instant. Pendant son contrôle, un joueur est d'autant plus vulnérable au tacle que sa prise de balle est faible.
- **Tirs.** La précision baisse avec la distance. Le gardien arrête moins bien une frappe à bout portant. Un défenseur sur la trajectoire contre le tir trois fois sur quatre. Sur penalty, le tireur vise près du poteau.
- **Fatigue.** Presser et harceler coûtent bien plus cher que courir. Un joueur fatigué court moins vite, démarre moins vite, réagit moins vite, sort moins loin au pressing et tacle moins bien.
- **Le bloc défensif s'adapte à l'attaque.** Il se resserre face à une attaque qui joue dans l'axe et s'étire face à une attaque large.

Ajouts de la cinquième séance :

- **Attendre.** Les attaquants ne courent plus après le ballon : ils gardent leur place et ne sortent que si le porteur passe à moins de 4 m d'eux. Et tant que le ballon est loin (à plus de 40 m du but) et encore devant lui, un joueur rentre dans son bloc en courant, sans sprinter. Sur sa fiche : « Rentre dans le bloc », avec la note « Consigne : attendre l'adversaire ».
- **Équipes venues d'un fichier.** `createMatch({ teams: [équipe des Bleus, équipe des Rouges] })` prend deux équipes de `equipes.json` (ou rien pour l'équipe standard).

## Les équipes

Le fichier `equipes.json` contient quatre équipes de onze joueurs. Il se modifie à la main, dans un éditeur de texte : une ligne par joueur.

- **Poste** : `G` gardien, `AG` arrière gauche, `DCG` et `DCD` défenseurs centraux, `AD` arrière droit, `MG` milieu gauche, `MCG` et `MCD` milieux axiaux, `MD` milieu droit, `ATG` et `ATD` attaquants. Chaque équipe a les onze postes, une fois chacun.
- **Notes**, de 1 à 20 : `vitesse`, `acceleration`, `endurance`, `passe`, `vision`, `prise_de_balle`, `dribble`, `finition`, `tacle`, `placement`, `anticipation`, `lucidite`, `sang_froid`, `volume_de_course`, `agressivite`, `gout_du_risque`, `jeu_de_tete`, `appels`, et pour le gardien `reflexes` et `mains` (il capte le ballon au lieu de le repousser).
- Si le fichier est mal rempli (poste en double, note oubliée ou hors de 1 à 20, nom de note inconnu), le moteur s'arrête avec un message qui dit quelle équipe, quel joueur et quelle note.
- Après une modification : `node tools/levels.js` pour mesurer, `node build.js` pour que `match.html` prenne les nouvelles notes.

Comment les quatre équipes ont été construites (première version, à ajuster) :

| Équipe | Points forts de chaque poste | Moyenne de toutes les notes |
|---|---|---|
| Élite | autour de 17 | 14,9 |
| Élevé | autour de 15 | 12,8 |
| Moyen | autour de 13 | 10,9 |
| Faible | autour de 11 | 8,8 |

Chaque poste a ses points forts (par exemple tacle, placement, anticipation et jeu de tête pour un défenseur central ; finition, appels et sang-froid pour un avant-centre) et ses points faibles, de 1 à 9 points plus bas (la finition d'un défenseur, le tacle d'un attaquant). Le milieu axial gauche récupère, le droit organise ; l'attaquant gauche est mobile, le droit est un avant-centre. Chaque note varie ensuite d'un point en plus ou en moins d'un joueur à l'autre. Un joueur de champ a 5 en réflexes et en jeu de mains.

## Les consignes

Chaque équipe a cinq consignes à trois positions. Dans le moteur, une consigne vaut −1, 0 ou +1 ; 0 est le neutre. Les noms entre parenthèses sont ceux utilisés dans `engine.js` et sur la ligne de commande.

| Consigne | Positions | Ce qu'elle change |
|---|---|---|
| Jeu de passes (`passing`) | Court · Mixte · Long | Court : passes courtes plus tentantes, longs ballons moins, partenaires plus proches du porteur. Long : longs ballons et passes en profondeur plus tentants, appels plus fréquents et lancés de plus loin, attaquants plus hauts, et on saute la construction (moins de relance par l'arrière, on allonge sans attendre). |
| Rythme (`tempo`) | Posé · Normal · Rapide | Temps que le joueur prend ballon au pied, jeu en une touche, délai avant « l'impatience », vitesse des déplacements sans ballon. |
| Largeur (`width`) | Resserré · Normal · Large | Écartement des joueurs avec le ballon, joueur du côté opposé qui rentre ou reste sur son aile, passes vers les ailes et centres plus ou moins tentants. |
| Hauteur du bloc (`line`) | Bas · Médian · Haut | Toute l'équipe défend 6 m plus bas ou 8 m plus haut, sauf quand le ballon approche de son but. Gardien plus avancé en bloc haut. |
| Pressing (`press`) | Attendre · Normal · Harceler | Distance à laquelle un joueur sort sur le porteur. Harceler : pressing d'équipe. Tout le bloc se resserre autour du ballon et monte de 5 m, on colle les solutions de passe proches, un deuxième joueur sort, on va au contact partout. Cela coûte beaucoup d'énergie, et un presseur qui rate son intervention loin de son but reste battu plus longtemps. Attendre : on ne presse pas dans le camp adverse, le bloc est plus compact (lignes plus proches, plus étroit), les attaquants ne courent pas après le ballon et restent frais, et l'équipe rentre dans son bloc sans sprinter tant que le ballon est loin. |

**Une consigne est un penchant, pas un interdit.** Elle rend certaines options plus ou moins tentantes pour le porteur (de 10 à 90 % de l'enjeu du moment, selon la consigne et l'option). Une option nettement meilleure l'emporte quand même. Exemple mesuré : en jeu court, une équipe fait encore 12 longs ballons par match (25 en neutre, 70 en jeu long).

**Lisible sur la fiche du joueur.** Quand la consigne a fait pencher son choix, la fiche affiche « Consigne : jouer court ». Quand il fait le contraire, elle affiche « Malgré la consigne : jouer court ». La ligne « Passes contre la consigne » des statistiques compte ces cas.

Toutes consignes au neutre, les deux équipes jouent de la même façon : j'ai vérifié, au moment d'ajouter les consignes, que le neutre redonnait exactement les matchs d'avant.

## Les tests

À relancer après toute modification de `engine.js` :

```
node check.js 200          # le moteur ne déraille pas (200 matchs neutres, 200 avec consignes au hasard, 200 entre équipes de niveaux différents)
node sim.js 300            # les moyennes sur 10 minutes ressemblent au football
node sim.js 60 1 5400      # même chose sur 90 minutes
node build.js              # refait match.html
```

Mesurer les équipes de `equipes.json` :

```
node tools/possession.js equipe=elite equipe=faible 20    # comment chaque équipe perd le ballon, passes réussies selon la note et la pression
node tools/levels.js 60                                   # tournoi : chaque équipe contre chaque autre, 60 matchs de 90 min par affiche (1 min 30)
node sim.js 100 1 5400 equipe=elite equipe=faible         # une affiche en détail : toutes les statistiques des deux équipes
node tools/profile.js equipe=faible,line=-1 equipe=elite 60   # la même chose avec des consignes, et le détail par demi-heure
```

Mesurer une consigne ou comparer deux équipes :

```
node tools/profile.js press=-1 "" 120                 # duel avec profil dans le temps : occasions par demi-heure, fraîcheur par ligne, sprints (ici Bleus en « attendre »)
node tools/energy.js press=-1 16                      # où part l'énergie des Bleus : par activité, par allure, par moment du jeu, par ligne
node tools/tactics.js 60 5400                       # effet de chaque consigne, une par une (60 matchs de 90 min par réglage)
node sim.js 100 1 5400 passing=-1,line=1 press=1    # Bleus : jeu court + bloc haut, contre Rouges : pressing « harceler »
node tools/passes.js 100                            # qui passe à qui (part des passes par ligne)
node tools/depth.js passing=1 line=1 20             # ballons joués dans le dos de la défense : qui les reçoit, y a-t-il un tir ensuite ?
node tools/press.js press=1 30                      # pressing : que devient un porteur pressé, que se passe-t-il quand le pressing est battu, coût en fatigue
node tools/shots.js 100                             # tirs par zone (six mètres, surface, hors surface), comparés aux chiffres vérifiés
node tools/control.js 16 8,14,18                    # prise de balle : contrôles ratés selon la pression et selon la note
node tools/freekicks.js 200                         # coups francs : mur en place, choix du tireur, issue des tirs
node tools/penalties.js 600                         # penalties mis en scène : buts, arrêts, hors cadre
```

Vérifier la page (une seule fois : `cd tools && npm install`) :

```
node tools/page.js      # la page dans un faux navigateur : avant-match, lecture, barre de temps, consignes, série
node tools/browser.js   # la page dans un VRAI navigateur (Brave par Flatpak, sans fenêtre) + captures d'écran dans tools/
```

Autres outils :

```
node tools/snap.js 5 img.png 60,62,64,66 - line=1   # images du match n°5 à ces instants (ici Bleus en bloc haut)
node tools/zones.js 20                              # dans quelle partie du terrain se joue le match
```

### Ce que vérifie `check.js`

Sur chaque match : aucune valeur aberrante, aucun joueur trop rapide, ballon jamais loin du terrain, aucune situation figée plus de 25 secondes, aucun arrêt de jeu de plus de 95 secondes. Chaque graine est jouée trois fois : au neutre, puis avec des consignes au hasard et un changement à la mi-match, puis entre deux équipes de `equipes.json` (toutes les affiches reviennent) avec des consignes au hasard. Et la même graine redonne exactement le même match.

## Les repères du vrai football

Depuis la quatrième séance, une partie des repères est **vérifiée** (recherche du 8 octobre 2026, Premier League). Par match, les deux équipes ensemble.

| Repère | Valeur | Source |
|---|---|---|
| Ballon en jeu | 55 à 58 minutes (54:49 en 2022-23, 58:11 en 2023-24, 56:59 en 2024-25) | Opta / The Analyst |
| Tirs | environ 26 (8,3 tirs hors surface = 31,7 % des tirs, saison 2024-25) | The Analyst, calcul |
| Tirs hors de la surface | 31,7 % des tirs | The Analyst |
| Buts sur tir dans la surface | 14,7 % | The Analyst (2024-25) |
| Buts sur tir hors de la surface | 4,2 % | The Analyst (2024-25) |
| Buts sur l'ensemble des tirs | 11,9 % (2023-24, record) | premierleague.com |
| Buts | 3,28 (1 246 buts en 2023-24, record) | The Analyst |
| Passes tentées | 941 (2023-24) | The Analyst |
| Passes réussies | 748 à 780, soit environ 83 % | premierleague.com |
| Passes longues | 10,5 % des passes (2024-25), 11,5 % (2025-26) | premierleague.com |
| Corners | environ 10,8 (début 2024-25) | The Analyst, calcul |
| Fautes | environ 22 à 23 (estimation sur 10 équipes, 2025-26) | statz.ai, calcul |
| Coup franc direct | 5,6 % de buts (19 sur 337 en 2021-22, 17 sur 301 en 2022-23) | The Analyst |
| Ballons repris à moins de 40 m du but adverse | 14,6 à 16,7 ; 17 % donnent un tir | premierleague.com / Opta |
| Tir dans les six mètres | environ 40 % de buts ; dans l'axe de la surface, environ 20 % | StatsBomb (étude ancienne) |

**Toujours de mémoire, non vérifié** : tacles réussis (33), hors-jeu (4), contrôles ratés (une quinzaine par équipe), part des passes reçues par les défenseurs centraux (20 %), penalties (0,28 par match, 77 % de buts). Le site qui les donne (FBref) refuse les lectures automatiques.

Sources : [The Analyst, tirs 2024-25](https://theanalyst.com/2025/03/premier-league-2024-25-shot-data) · [The Analyst, ballon en jeu](https://theanalyst.com/articles/match-time-ball-in-play-referees-stats/) · [90min, durée d'un match](https://www.90min.com/posts/how-long-is-an-average-premier-league-match) · [Premier League, tendances 2025-26](https://www.premierleague.com/en/news/4461793/what-are-the-biggest-trends-from-202526-so-far) · [Premier League, jeu long et pressing](https://www.premierleague.com/en/news/4426039/opta-analyst-on-long-balls-long-throws-key-tactical-trends-spotted-in-2025-26-season) · [Premier League, précision des tirs 2023-24](https://www.premierleague.com/news/4027257) · [The Analyst, coups francs](https://theanalyst.com/2025/03/free-kick-specialists-celebrating-an-endangered-species) · [The Analyst, corners](https://theanalyst.com/2024/10/premier-league-corners-2024-25) · [StatsBomb, têtes et tirs](https://blogarchive.statsbomb.com/articles/soccer/how-do-headers-compare-to-shots/) · [statz.ai, fautes](https://statz.ai/news/premier-league-fouls-per-game-2025-26)

Leçon de ces chiffres : rapporté à la minute de jeu réel, le moteur était déjà proche du vrai pour les tirs et les buts. Ses totaux par match étaient gonflés surtout parce que le ballon était trop souvent en jeu.

## État mesuré

Mesures du 8 octobre 2026 (fin de quatrième séance, toujours valables : la cinquième séance n'a changé que « attendre »), équipes standard, consignes neutres, les deux équipes ensemble, match de 90 minutes (100 matchs).

| Par match | Simulé | Vrai | Repère vérifié ? | Verdict |
|---|---|---|---|---|
| Buts | 3,2 | 3,3 (2023-24) | oui | bon |
| Tirs | 31 | 26 | oui | un peu haut |
| Tirs hors de la surface | 35 % | 32 % | oui | bon |
| Buts sur tir dans la surface | 15 % | 14,7 % | oui | bon |
| Buts sur tir hors de la surface | 2 % | 4,2 % | oui | trop bas |
| Buts sur l'ensemble des tirs | 11 % | 11,9 % | oui | bon |
| Tirs contrés | 31 % | environ 28 % | non | bon |
| Occasions (buts attendus) | 3,3 | — | — | cohérent avec les buts |
| Ballon en jeu | 65 minutes | 55 à 58 | oui | trop haut |
| Passes | 1 304 | 941 | oui | trop haut |
| Passes réussies | 87,6 % | 83 % | oui | un peu haut |
| Fautes | 18 | 22 à 23 | à peu près | un peu bas |
| Corners | 3,8 | 10,8 | oui | trop bas |
| Coup franc direct | 4 à 5 % de buts | 5,6 % | oui | bon |
| Penalties | 0,29 par match, 76 % de buts | 0,28 et 77 % | non | bon |
| Tacles réussis | 45 | 33 | non | trop haut |
| Hors-jeu | 0,8 | 4 | non | trop bas |
| Contrôles ratés par équipe | 16 | une quinzaine | non | bon |
| Distance par joueur | 10,4 km | 10,5 km | non | bon |

Scores les plus fréquents : 2-1, 1-1, 1-0, 1-2, 2-2, 0-3.

Autres mesures :

- **Arrêts de jeu par match** : 15 touches, 11 sorties de but, 20 coups francs, 4 corners. Il y en a trop peu (surtout touches et corners), ce qui explique que le ballon reste trop en jeu malgré des durées réalistes.
- **Qui reçoit les passes** : gardien 0,6 %, défenseurs centraux 8,9 % (dont 3,9 % venant des milieux), latéraux 19 %, milieux axiaux 22 %, milieux de côté 25 %, attaquants 24 %.
- **Où se joue le match** : 24 % dans le tiers défensif, 62 % au milieu, 14 % dans le tiers offensif.
- **Tirs par zone** (100 matchs) : dans les six mètres 12 % des tirs, 18 % de buts ; reste de la surface 53 %, 15 % de buts ; hors de la surface 35 %, 2 % de buts.
- **Prise de balle** (16 matchs, note des Bleus imposée) : contrôles ratés sous pression 21 % à 8, 10 % à 14, 3 % à 18 ; sans adversaire proche 2,0 %, 0,7 % et 0,5 %. Contrôles orientés par match : 0, 39 et 77.
- **Coups francs à portée de tir** (172 tirs directs) : mur en place à chaque fois ; 28 % dans le mur, 34 % arrêtés, 34 % hors cadre, 4 % de buts.
- **Fatigue après 90 minutes** (120 matchs) : fraîcheur moyenne 71 %, mais très inégale selon la ligne : défenseurs 85 %, milieux 72 %, **attaquants 41 %**. En « harceler » : 49 % (défenseurs 72 %, milieux 36 %, attaquants 30 %). En « attendre » : 73 % (défenseurs 83 %, milieux 66 %, attaquants 69 %).
- **Où part l'énergie au neutre** (`tools/energy.js`) : 38 % à presser le porteur (2,5 minutes par joueur seulement), 13 % à se replier en sprintant, 24 % quand l'équipe a le ballon. Les trois quarts de la fatigue viennent de 9 minutes de course rapide et de sprint.
- **Vitesse de calcul** : environ 1,4 seconde pour 90 minutes (1,5 dans le navigateur).

### Effet de chaque consigne

Les Bleus appliquent une seule consigne, les Rouges restent neutres. 60 matchs de 90 minutes par réglage (`node tools/tactics.js 60 5400`). Valeurs des Bleus, sauf mention.

| Consigne | Ce qu'on mesure | Position basse | Neutre | Position haute |
|---|---|---|---|---|
| Jeu de passes (court / long) | Passes | 853 | 648 | 460 |
| | Passes réussies | 90,8 % | 87,8 % | 75,5 % |
| | Longs ballons | 12 | 25 | 70 |
| | Possession | 52 % | 50 % | 38 % |
| Rythme (posé / rapide) | Temps balle au pied | 1,87 s | 1,69 s | 1,27 s |
| | Passes en profondeur | 6,8 | 9,7 | 12,6 |
| | Possession | 54 % | 50 % | 48 % |
| Largeur (resserré / large) | Largeur de l'équipe | 35 m | 46 m | 51 m |
| Hauteur du bloc (bas / haut) | Défense à … de son but | 27 m | 33 m | 40 m |
| | Ballons repris dans le camp adverse | 5,4 | 7,5 | 14,5 |
| | Longs ballons des Rouges | 40 | 27 | 9 |
| Pressing (attendre / harceler) | Ballons repris dans le camp adverse | 4,2 | 7,5 | 21,6 |
| | Fautes | 5,1 | 9,1 | 16,0 |
| | Tirs des Rouges | 20,0 | 15,7 | 12,8 |
| | Fraîcheur des attaquants à la fin | 69 % | 41 % | 30 % |

L'équilibre, en occasions créées et concédées (buts attendus). Le neutre fait 1,69 pour et 1,71 contre. Sur 60 matchs, un écart de moins de 0,15 ne veut rien dire.

| Consigne des Bleus | Occasions pour | Occasions contre | Lecture |
|---|---|---|---|
| Jeu court | 1,71 | 1,59 | un peu mieux en défense |
| Jeu long | 1,49 | 2,20 | perdant contre un bloc médian |
| Rythme posé | 1,58 | 1,56 | un peu mieux en défense |
| Rythme rapide | 1,49 | 1,90 | plutôt perdant |
| Resserré | 1,40 | 1,56 | moins d'occasions des deux côtés |
| Large | 1,67 | 1,86 | à peu près neutre |
| Bloc bas | 1,66 | 1,94 | concède un peu plus |
| Bloc haut | 1,85 | 1,89 | plus d'occasions des deux côtés |
| Attendre (120 matchs, cinquième séance) | 1,65 | 1,90 | concède plus, attaque mieux en fin de match |
| Harceler (60 matchs) | 1,57 | 1,42 | gagnant, mais voir ci-dessous |
| Harceler (120 matchs) | 1,54 | 1,50 | à peu près neutre sur 90 minutes |

Sur 120 matchs, le neutre fait 1,60 pour et 1,68 contre. La différence entre les deux lignes « harceler » montre qu'à 60 matchs, un écart de 0,15 tient encore à la chance.

**Le pressing a un profil dans le temps** (`node tools/press.js`, 30 matchs). Occasions par demi-heure, équipe qui harcèle contre équipe neutre : 0,62 contre 0,39 de la 1re à la 30e minute, 0,50 contre 0,46 de la 30e à la 60e, puis 0,41 contre 0,49 de la 60e à la 90e. Harceler domine au début et se paie à la fin : l'équipe finit à 49 % de fraîcheur, contre 71 % au neutre.

**« Attendre » a le profil inverse** (`node tools/profile.js press=-1 "" 120`). Occasions par demi-heure, équipe qui attend contre équipe neutre : 0,49 contre 0,64, puis 0,51 contre 0,62, puis 0,65 contre 0,64. Elle concède plus pendant tout le match (20 tirs contre 15 au neutre), et ses attaquants restés frais créent plus d'occasions dans la dernière demi-heure (0,65 contre 0,54 au neutre).

### Le test de Frédéric : jeu long contre bloc haut

Bleus en jeu long, selon la hauteur du bloc des Rouges. 60 matchs de 90 minutes par colonne. Au neutre, une équipe se crée environ 1,65 d'occasions.

| Valeurs des Bleus | Contre bloc haut | Contre bloc médian | Contre bloc bas |
|---|---|---|---|
| Occasions (buts attendus) | 2,04 | 1,43 | 1,64 |
| Buts | 2,37 | 1,52 | 1,53 |
| Hors-jeu | 1,23 | 0,67 | 0,13 |
| Possession | 44 % | 38 % | 34 % |
| Occasions des Rouges | 2,29 | 2,27 | 2,09 |

Le jeu long rapporte donc surtout contre un bloc haut (occasions +24 % par rapport au neutre), et il coûte toujours : on rend le ballon et l'adversaire se crée plus d'occasions.

## Les quatre équipes : premiers tests

`node tools/levels.js 60` : chaque équipe contre chaque autre, 60 matchs de 90 minutes par affiche (moitié en Bleus, moitié en Rouges), consignes neutres. Chaque ligne se lit : l'équipe de gauche contre l'équipe de la colonne.

Victoires, nuls, défaites (en % des matchs) :

| | contre Élite | contre Élevé | contre Moyen | contre Faible |
|---|---|---|---|---|
| Élite | — | 87 – 13 – 0 | 98 – 2 – 0 | 100 – 0 – 0 |
| Élevé | 0 – 13 – 87 | — | 77 – 18 – 5 | 98 – 0 – 2 |
| Moyen | 0 – 2 – 98 | 5 – 18 – 77 | — | 87 – 7 – 7 |
| Faible | 0 – 0 – 100 | 2 – 0 – 98 | 7 – 7 – 87 | — |

Buts marqués et encaissés par match :

| | contre Élite | contre Élevé | contre Moyen | contre Faible |
|---|---|---|---|---|
| Élite | 2,4 – 2,7 | 4,1 – 1,3 | 5,9 – 0,8 | 8,3 – 0,4 |
| Élevé | 1,3 – 4,1 | 2,4 – 2,4 | 3,3 – 1,5 | 5,4 – 0,6 |
| Moyen | 0,8 – 5,9 | 1,5 – 3,3 | 2,3 – 2,2 | 3,8 – 1,0 |
| Faible | 0,4 – 8,3 | 0,6 – 5,4 | 1,0 – 3,8 | 1,9 – 2,2 |

Possession de l'équipe de gauche, puis ses passes réussies :

| | contre Élite | contre Élevé | contre Moyen | contre Faible |
|---|---|---|---|---|
| Élite | 50 % · 86,8 % | 46 % · 85,3 % | 44 % · 84,5 % | 40 % · 84,0 % |
| Élevé | 54 % · 88,0 % | 50 % · 87,2 % | 47 % · 86,1 % | 44 % · 84,9 % |
| Moyen | 56 % · 88,5 % | 53 % · 88,0 % | 50 % · 87,3 % | 47 % · 85,9 % |
| Faible | 60 % · 88,9 % | 56 % · 88,6 % | 53 % · 87,6 % | 50 % · 87,2 % |

Contrôles ratés par match : Élite 9, Élevé 14, Moyen 20, Faible 29, quel que soit l'adversaire.

Ce que ces tests montrent :

- **Le niveau se voit et l'ordre est respecté** : Élite, puis Élevé, puis Moyen, puis Faible, sans exception. Les contrôles ratés suivent bien la note.
- **L'écart pèse beaucoup trop.** Un seul cran d'écart donne 77 à 87 % de victoires. Élite contre Faible : 100 % de victoires et 8,3 buts à 0,4 en moyenne, avec des scores comme 11-0.
- **La possession est à l'envers** : la meilleure équipe a moins le ballon et réussit moins ses passes. Détail d'Élite contre Faible (`node sim.js 24 1 5400 equipe=elite equipe=faible`) : Élite fait 438 passes, 17 passes en profondeur, 24 centres et 31 tirs ; Faible fait 701 passes et 5 tirs. L'équipe forte attaque vite et tire au bout de quelques passes ; l'équipe faible fait tourner le ballon derrière sans avancer, et personne ne vient la chercher.
- **À niveau égal, il y a trop de buts**, et de plus en plus quand le niveau monte : 4,1 par match entre deux équipes faibles, 5,0 entre deux équipes élite (3,2 entre deux équipes standard).
- **Se regrouper n'aide pas l'équipe faible** : en bloc bas et pressing « attendre » contre Élite, elle perd 0,3 à 9,8 sur 40 matchs (au neutre : 0,35 à 8,3).

## Ce qui est vérifié, ce qui ne l'est pas

Vérifié :

- 200 matchs neutres, 200 avec consignes au hasard et 200 entre équipes de niveaux différents sans anomalie, plus 12, 12 et 12 sur 90 minutes (`check.js`).
- Les changements de la cinquième séance n'ont rien changé d'autre que « attendre » : au neutre et avec les autres consignes, les matchs sont restés identiques au chiffre près.
- **La page fonctionne dans un vrai navigateur** (Brave, `tools/browser.js`) : avant-match à l'arrêt, lancement, lecture, barre de temps glissée à la souris en avant et en arrière, clic sur un joueur, changements de consigne, série de 30 matchs (5 secondes), match de 90 minutes (1,5 seconde), choix d'Élite contre Faible et match joué jusqu'au bout. Aucune erreur JavaScript.
- Un changement de consigne en cours de match ne modifie pas le passé, et réécrit la suite (`tools/page.js`).
- Sur images, les consignes changent la forme de l'équipe, et le mur se forme sur coup franc.
- Frédéric a regardé la deuxième et la troisième version en mouvement : comportement global cohérent, des comportements en progrès.

Pas vérifié :

- **Personne n'a regardé en mouvement les changements de la cinquième séance** : une équipe qui attend (attaquants qui restent en place, repli sans sprint), et les matchs entre équipes de niveaux différents.
- **Ni ceux de la quatrième séance** : arrêts de jeu plus longs et lecture accélérée, contrôles ratés et contrôles orientés, pressing d'équipe en « harceler », fatigue, bloc qui s'adapte à la largeur de l'attaque, nouveau comportement des gardiens et des tireurs. Je n'ai que des mesures.
- Une partie des repères du vrai football reste de mémoire (voir « Les repères du vrai football »).

## Journal des essais

Première séance (8 octobre 2026) : le moteur de base.

| N° | Constat | Changement | Résultat |
|---|---|---|---|
| 1 | Premier jet : 20 tacles et 10 fautes par match, 72 % de passes réussies, 1 but par match | — | Échec : jeu haché |
| 2 | Ballon trop freiné, passes trop molles, défenseurs qui se jettent | Frottement réaliste, passes plus appuyées, tacles plus rares | Fautes à 2,5 (bon), mais 37 longs ballons par match |
| 3 | Trop de longs ballons | Long ballon moins rentable, receveur qui vient au ballon | 85 % de passes réussies, mais moins d'un tir par match |
| 4 | Les équipes restent dans leur camp (72 % du temps) | Le porteur surestimait la capacité des adversaires à couper ses passes : corrigé | Mieux, mais encore 68 % dans leur camp |
| 5 | Toujours pas de progression | Valeur des positions revue, bloc défensif plus haut, équipe plus étagée en attaque | 2,3 tirs par match, mais passes réussies retombées à 73 % |
| 6 | Le porteur choisissait presque au hasard dans son camp | Choix resserré sur les meilleures options | Échec : tout le monde dribble, 9 tirs et 3 buts par match |
| 7 | Trop de dribbles | Dribble sous pression plus risqué, duels modélisés | Bug révélé : un joueur reste planté près du poteau de corner |
| 8 | Joueur immobile balle au pied | Garder le ballon coûte de plus en plus ; pressing obligatoire dans son tiers | Répartition du jeu correcte sur le terrain |
| 9 | 35 duels par match | Duel seulement si le porteur fonce sur le défenseur | Tacles et fautes corrects, mais buts de 30 mètres |
| 10 | Buts de loin | Bug trouvé : le gardien plongeait trop loin et dépassait le ballon. Corrigé | Tirs de loin arrêtés (2 à 4 % de buts) |
| 11 | Presque aucune passe en profondeur (0,1 par match) | Bug trouvé : ces passes mettaient 3 secondes à arriver. Corrigé | 6,7 par match, 40 % réussies |
| 12 | Encore trop de buts | Gardien qui ferme l'angle, recule sous un lob, sort dans les pieds ; défenseurs qui suivent les appels | Buts à 0,5 par match |
| 13 | `check.js` signale un joueur qui garde le ballon 25 secondes | Le presseur va au contact, un deuxième défenseur vient aider | 200 matchs sans anomalie |

Deuxième séance (8 octobre 2026) : consignes, barre de temps, relance par les centraux.

| N° | Constat | Changement | Résultat |
|---|---|---|---|
| 14 | Aucune consigne réglable | Cinq consignes par équipe, branchées sur le placement, le pressing, les appels et le choix du porteur | Le neutre redonne exactement les matchs d'avant ; chaque consigne déplace les mesures dans le bon sens |
| 15 | Jeu court : zéro long ballon. L'intention était devenue une règle absolue | Penchant contre le long ballon divisé par deux | 0,6 long ballon par 10 minutes (2,5 au neutre, 6,2 en jeu long) |
| 16 | Rythme posé : l'équipe ne tire plus. Pressing « attendre » : trois fois plus de tirs concédés | Posé : moins de peur de la passe risquée. Attendre : on ne laisse faire que dans le camp adverse | Posé tire encore 13 % de moins que le neutre. Attendre concède encore 27 % de tirs en plus |
| 17 | Remarque de Frédéric : les milieux ne passent jamais aux défenseurs centraux. Mesuré : ils reçoivent 1,4 % des passes | Erreur trouvée : le porteur croyait qu'une passe en retrait n'avait qu'une chance sur deux de réussir (il s'imaginait frapper sans se retourner, et rater un partenaire pourtant seul). Corrigé, et reculer coûte moins | Centraux à 11 % des passes |
| 18 | Effet pervers : en poussant plus loin, les équipes tournent derrière sans attaquer (1 tir par match) | La relance ne vaut que tant qu'on construit (plafond) | 3 tirs par match, tacles et fautes proches du vrai football |
| 19 | Trop de passes, les joueurs se débarrassent du ballon en une seconde | Un joueur libre lève la tête avant de passer ; un défenseur libre avance sans courir | Temps balle au pied de 1,0 à 1,5 seconde |
| 20 | Le ballon n'est plus que 10 % du temps dans le tiers offensif (23 % avant) | « Impatience » : après 8 secondes de possession, on tente davantage vers l'avant | Buts et tirs au niveau du vrai football. Tiers offensif toujours bas : 11 % |
| 21 | Idée de Frédéric : valider sur des matchs plus longs. Découverte : la fatigue ne fonctionnait pas (99 % de fraîcheur après 90 minutes) | La fraîcheur baisse avec les courses et ne remonte plus | 75 % en moyenne après 90 minutes, 72 % en pressing « harceler » |
| 22 | Calcul trop lent pour des séries et des matchs de 90 minutes (277 ms pour 10 minutes) | Deux calculs accélérés (temps de parcours du ballon, joueur le plus proche de la trajectoire) | 150 ms, mêmes moyennes |
| 23 | Demandes de Frédéric : barre de temps, départ à l'arrêt, 90 minutes par défaut | Le match est calculé en entier puis lu comme une vidéo ; avant-match avec bouton « Lancer le match » | Vérifié dans un vrai navigateur |
| 24 | Les notes « Consigne : … » s'affichaient sur presque toutes les passes | La note n'apparaît que si la consigne a fait pencher le choix, ou s'il a été fait malgré elle | En jeu court : 38 passes sur 128 portent la note, 1 à 2 vont contre la consigne (par 10 minutes) |

Troisième séance (8 octobre 2026) : retours de Frédéric après ses propres tests.

| N° | Constat | Changement | Résultat |
|---|---|---|---|
| 25 | Demande : toutes les notes à 14, pour travailler sur deux équipes égales | Toutes les qualités de tous les joueurs à 14 sur 20 ; l'ancien tirage au hasard reste en option | Le moteur reste sain ; un peu plus de buts et de tacles qu'avec les notes au hasard |
| 26 | Coups francs : pas de mur, et le tireur frappe toujours à côté | Mur de 2 à 5 joueurs, gardien de l'autre côté, frappe par-dessus le mur, geste plus précis sur ballon arrêté | Premier essai raté : 1 % de buts, car sans effet le tireur devait lober doucement et le gardien avait tout son temps |
| 27 | Trop peu de buts sur coup franc | Ballon brossé qui plonge (frappe plus forte), gardien qui voit partir le ballon en retard derrière le mur | 28 % dans le mur, 33 % arrêtés, 33 % hors cadre, 6 % de buts |
| 28 | Test de Frédéric : jeu long contre bloc haut, « ça ne change presque rien ». Mesuré : 14,9 tirs contre 14,8 au neutre, alors qu'un Bleu reçoit 19 fois par match seul dans le dos de la défense | Trois défauts trouvés et corrigés : il freinait pour contrôler même lancé, il conduisait lentement dès qu'un adversaire était à moins de 6 m (même derrière lui), il hésitait à tirer avec un défenseur dans le dos | Seul face au but dans l'axe, il tire maintenant 64 fois sur 100. Occasions des Bleus : +50 % contre un bloc haut |
| 29 | Ces corrections profitent à tous les attaquants : 4,6 buts par match au neutre | Frappes moins précises dans le jeu, tacles un peu plus efficaces, statistique des buts attendus recalée | 3,4 buts par match ; tirs cadrés de 55 % à 48 % des tirs. Mais les tirs de près rentrent trop peu, et les tacles réussis passent de 46 à 64 par match |
| 30 | Le jeu long ne se voyait pas à la relance : même construction derrière qu'au neutre | En jeu long, on relance moins par l'arrière, on allonge sans attendre, on s'impatiente plus tôt | D'abord trop fort (100 longs ballons, 36 % de possession), adouci : 87 longs ballons, 37 % de possession |

Quatrième séance (8 octobre 2026) : chiffres vérifiés, tirs, prise de balle, pressing, équilibre des consignes. Frédéric était absent pour la fin ; les points 3 et 4 ont été faits sans lui.

| N° | Constat | Changement | Résultat |
|---|---|---|---|
| 31 | Mes repères du vrai football venaient de ma mémoire | Recherche de chiffres vérifiés (Premier League, Opta) | Diagnostic changé : à la minute de jeu réel, tirs et buts étaient déjà proches du vrai. Le vrai défaut : ballon en jeu 78 minutes au lieu de 55 à 58 |
| 32 | Arrêts de jeu trop courts | Durées réalistes (touche 17 s, sortie de but 30 s, corner 34 s, coup franc 27 s, après un but 55 s) ; la page les lit six fois plus vite | Ballon en jeu 65 minutes. Pas mieux, parce qu'il y a trop peu de touches et de corners |
| 33 | Trop de tirs cadrés et arrêtés, trop peu de tirs de loin et de tirs contrés ; ma rustine des « frappes imprécises de près » | Précision selon la distance, tir de loin tenté plus souvent, défenseur qui contre trois fois sur quatre, gardien moins sûr à bout portant | 15 % de buts dans la surface (vrai : 14,7 %), 35 % de tirs de loin (32 %), 31 % de tirs contrés. Rustine retirée |
| 34 | Raté en route : en voulant aider le tireur de près, les tirs de toute la surface rentraient à 22 % | La faiblesse du gardien dépendait du temps de vol du ballon, or il sort souvent au-devant du tireur. Remplacé par la distance du tir | Corrigé |
| 35 | Presque un penalty par match, réussi une fois sur deux | Moins de fautes dans sa surface, tireur qui vise près du poteau | 0,29 penalty par match, 76 % de buts |
| 36 | Demande de Frédéric : des contrôles ratés, liés à une qualité « Prise de balle » | Échec possible à chaque réception selon la pression et la note ; contrôle orienté pour les joueurs doués ; vulnérabilité au tacle pendant le contrôle | Sous pression : 21 % d'échecs à 8, 10 % à 14, 3 % à 18. 16 contrôles ratés par équipe et par match |
| 37 | « Harceler » trop fort. Mesuré : ce n'était qu'un joueur plus agressif, sans risque (autant de défenseurs derrière le ballon quand le pressing est battu) ni coût (même fraîcheur) | Pressing d'équipe : le bloc se resserre autour du ballon et monte ; fatigue qui pèse sur la vitesse, le démarrage, la réaction, le pressing et le tacle | Premier essai raté : pressing étouffant, 9 tirs contre 19, et même le jeu long n'en sortait pas |
| 38 | Pressing étouffant | Pressing moins serré, efforts de pressing bien plus coûteux, presseur battu plus longtemps quand il se jette loin de son but | Harceler domine la première demi-heure et se paie dans la dernière ; 49 % de fraîcheur finale contre 71 % |
| 39 | « Resserré » trop fort, « large » trop faible | Le bloc défensif s'adapte à la largeur réelle de l'attaque ; sur un centre possible, le milieu du côté opposé plonge au second poteau | Resserré : moins d'occasions des deux côtés. Large : à peu près neutre |
| 40 | « Attendre » concédait 27 % de tirs en plus sans rien gagner | Bloc plus compact (lignes plus proches, plus étroit) | Presque neutre : 1,61 d'occasions pour, 1,82 contre. Mais il n'économise pas d'énergie |

Cinquième séance (8 octobre 2026) : « attendre », puis les équipes de niveaux différents.

| N° | Constat | Changement | Résultat |
|---|---|---|---|
| 41 | « Attendre » n'économisait pas d'énergie. Mesuré avec un nouvel outil (`tools/energy.js`) : 70 % de fraîcheur finale, comme au neutre. On pressait un peu moins, mais les deux attaquants faisaient encore 60 % du pressing (ils revenaient presser dans leur camp), et toute l'équipe sprintait pour se replacer : ce qu'on gagnait d'un côté, on le perdait de l'autre | Les attaquants ne courent plus après le ballon. L'équipe rentre dans son bloc sans sprinter tant que le ballon est loin et devant | Attaquants à 69 % de fraîcheur en fin de match (41 % au neutre). Mais les milieux pressent à leur place : 66 % (72 % au neutre). Moyenne de l'équipe : 73 % contre 71 %, gain faible |
| 42 | Quel changement fait quoi ? Chacun mesuré seul, 120 matchs | Repli sans sprint seul : gratuit (72 % de fraîcheur, pas plus d'occasions concédées). Attaquants épargnés seuls : +0,25 d'occasions concédées, +0,1 créées en fin de match | Les deux sont gardés : c'est ce qui donne un profil à la consigne |
| 43 | Essai intermédiaire : attaquants qui sortent si le porteur passe à moins de 10 m | — | Abandonné : on concède autant (1,86) et les attaquants ne sont plus frais (51 %) |
| 44 | Découverte en route : au neutre, les attaquants finissent à 41 % de fraîcheur, les défenseurs à 85 % | Pas corrigé | Noté dans les défauts : c'est la suite du coût du pressing réglé à la quatrième séance |
| 45 | La fraîcheur ne se lisait que joueur par joueur | Ligne « Fraîcheur des joueurs » dans les statistiques (match et série) ; outil `tools/profile.js` (duel avec profil par demi-heure, sur plusieurs cœurs) | L'effet d'un pressing se voit dans la page |
| 46 | Demande de Frédéric : quatre équipes de niveaux différents, notes selon le poste, dans un fichier qu'on peut modifier | `equipes.json` (4 équipes, 11 joueurs, 20 notes), lu par le moteur, choisi dans la page (cadre « Équipes ») et dans les outils (`equipe=elite`) ; `check.js` joue aussi ces équipes | Vérifié dans un vrai navigateur. Les matchs des équipes standard n'ont pas bougé |
| 47 | Premier tournoi entre les quatre équipes (`tools/levels.js`, 60 matchs par affiche) | — | L'ordre des niveaux est respecté, mais l'écart pèse beaucoup trop (Élite – Faible : 8,3 à 0,4), la possession est à l'envers, et il y a trop de buts à niveau égal. Voir « Les quatre équipes : premiers tests » |
| 48 | Essai : l'équipe faible en bloc bas et « attendre » contre l'élite | — | Pire qu'au neutre : 0,3 à 9,8 |

Sixième séance (9 octobre 2026) : axe « niveaux », en commençant par la possession. Règle de Frédéric : une équipe nettement plus forte a 65 à 70 % du ballon, quelles que soient les consignes, parce qu'elle réussit ses passes ; un joueur qui lit mal le jeu ne voit pas qui est libre et panique.

| N° | Constat | Changement | Résultat (Élite contre Faible, possession de l'Élite) |
|---|---|---|---|
| 49 | Nouvel outil `tools/possession.js` : un passeur noté 7 réussissait 95 % de ses passes, un passeur à 16 en réussissait 79 %. Sous pression, Faible réussissait 90 % de ses passes. La vision ne servait presque à rien | — | 40 % (point de départ) |
| 50 | La note de passe pesait peu sur le geste (écart ×1,6 entre 8 et 17) | Écart qui grandit vite quand la note baisse (×1 à 14, ×1,8 à 8, ×0,7 à 17), sur la direction et le dosage | 42 % : le receveur rattrape les passes imprécises |
| 51 | Une passe à côté ou mal dosée ne gênait pas le receveur | Une passe mal ajustée est plus dure à contrôler, surtout sous pression | 42 % ; Faible tombe à 86 % de passes au sol réussies |
| 52 | Essai : le porteur croit réussir 30 à 50 % de ses longs ballons, il en réussit environ 10 % ; l'Élite en tente 50 par match | Estimation corrigée, à l'essai seulement | +2 à 3 points seulement. Pas gardé : touche aussi « jeu long », c'est un chantier de l'axe B |
| 53 | Idée de Frédéric : la vision | Un partenaire loin, dans le dos ou de l'autre côté peut passer inaperçu (selon la vision et la pression ; fiche « Ne voit pas … ») | Seul : 44 % |
| 54 | Idée de Frédéric : la panique | Sous 14 de vision, un joueur pressé garde moins le ballon, choisit moins bien et se débarrasse du ballon (« Pressé, se débarrasse du ballon ») | Seule : 55 % ; avec la vision : 58 % |
| 55 | Faible voyait encore parfaitement les défenseurs qui coupent ses passes | Sous 14 de vision, il ne voit qu'une partie du danger d'interception (40 % à 8) | Faible : 83 % de passes au sol réussies, Élite 93 % |
| 56 | Tournoi complet (`node tools/levels.js 60`) | — | Possession de l'équipe forte contre Faible : 56 à 59 % (40 à 44 % avant). Entre niveaux proches : toujours environ 50 %. Équipe standard inchangée (3,2 buts, 1 265 passes, 86,7 %) |

## Ce qui ne va pas encore

Après la sixième séance (à reprendre) :

- **Possession encore trop faible pour l'équipe forte** : 56 à 59 % contre Faible, environ 50 % entre niveaux proches (objectif de Frédéric : 65 à 70 % quand l'écart est grand).
- **Les écarts de score ont grandi** : Élite contre Faible 11,1 à 0,1 (8,3 à 0,4 avant). Faible contre Faible : 2,0 buts par match seulement.
- **Trop de contrôles ratés pour les équipes faibles** : 40 à 49 par match pour Faible (une quinzaine en vrai). L'effet « passe mal ajustée » est sans doute trop fort pour elles.
- L'équipe forte rend encore beaucoup de ballons par de longs ballons ratés (voir n° 52).
- Personne n'a encore regardé en mouvement la panique et les « Ne voit pas … ».

Avant la sixième séance :

Les niveaux (découvert à la cinquième séance, rien n'est encore corrigé) :

- **L'écart de niveau pèse beaucoup trop.** Un cran d'écart (2 points sur les notes) donne 77 à 87 % de victoires. Élite contre Faible : 100 % de victoires, 8,3 buts à 0,4, et un 18-0 vu dans la page avec l'élite en bloc haut et « harceler ». Repère de mémoire, à vérifier : dans un même championnat, une équipe de tête bat une équipe de bas de tableau environ trois fois sur quatre.
- **La meilleure équipe a moins le ballon** (40 % pour Élite contre Faible) **et réussit moins ses passes** (84 % contre 89 %). En vrai c'est l'inverse. Cause vue : l'équipe forte attaque vite et tire au bout de quelques passes ; l'équipe faible fait tourner derrière sans avancer, sans que personne vienne la chercher.
- **Trop de buts à niveau égal** avec les équipes du fichier : 4,1 (faibles) à 5,0 (élite) par match, contre 3,2 entre équipes standard.
- **Les buts dépassent les occasions quand l'écart est grand** (Élite contre Faible : 8,5 buts pour 5,6 buts attendus). La mesure des occasions ne tient pas compte de la qualité du tireur ni du gardien.
- **Se regrouper n'aide pas l'équipe faible** (bloc bas et « attendre » : 0,3 à 9,8 contre l'élite).
- **Toutes les formules du moteur ont été réglées avec des joueurs à 14.** Personne n'a encore mesuré, qualité par qualité, ce que vaut un 11 contre un 17, sauf pour la prise de balle (`tools/control.js`). C'est sans doute par là qu'il faut commencer : un outil par qualité (finition, gardien, tacle, passe, vitesse), comme pour la prise de balle.
- Les quatre équipes sont une première version : mêmes écarts entre points forts et points faibles à tous les niveaux, pas de joueur vedette, pas de remplaçants.

Le jeu :

- **Trop peu de touches et de corners** (15 et 4 par match ; en vrai environ 11 corners, chiffre vérifié, et une quarantaine de touches, de mémoire). Le ballon sort trop rarement : les tacles, les dégagements et les tirs contrés le renvoient presque toujours dans le jeu. C'est maintenant la première cause du trop grand nombre de passes et du ballon trop souvent en jeu.
- **Les tirs de loin rentrent trop peu** (2 % contre 4,2 %) et ceux des six mètres aussi (18 % contre environ 40 %).
- **Le ballon va encore trop peu dans le tiers offensif** (14 % du temps) et trop au milieu.
- **Les centraux reçoivent 9 % des passes, pas 20 %**, et ne se passent presque jamais le ballon entre eux. Le gardien ne reçoit quasiment aucune passe.
- **Les longs ballons réussissent trop peu**, et le ballon qui retombe après un duel de la tête n'est pas disputé. C'est ce qui empêche le jeu long d'être une vraie réponse au pressing.
- Trop de tacles réussis, trop peu de hors-jeu.
- Sur coup franc, les attaquants ne se placent pas dans la surface, et le tireur choisit trop souvent la passe courte.
- Pendant un arrêt de jeu, le ballon saute encore d'un coup à l'endroit de la remise en jeu.

L'équilibre entre les consignes :

- **« Jeu long » et « rythme rapide » restent perdants** contre une équipe neutre. Le jeu long ne devient intéressant que contre un bloc haut. Dans ce moteur, les occasions suivent de trop près le temps de possession : qui rend le ballon concède.
- **« Harceler »** : sur 120 matchs il est à peu près neutre sur 90 minutes (il domine la première demi-heure et se paie dans la dernière). Mais aucune consigne adverse n'en est encore la parade.
- **« Attendre » économise l'énergie des attaquants, pas celle de l'équipe** (73 % de fraîcheur contre 71 % au neutre), et il concède plus (1,90 d'occasions contre 1,68). Les milieux, qui pressent à la place des attaquants, finissent plus fatigués qu'au neutre. Une équipe qui attend ne marche pas plus qu'une autre : elle trottine pour suivre le ballon que l'adversaire fait circuler.
- **Au neutre, les attaquants finissent à 41 % de fraîcheur** (défenseurs 85 %) : ils font l'essentiel du pressing, qui coûte très cher depuis la quatrième séance. C'est probablement trop.
- La fraîcheur ne remonte jamais : passer de « harceler » à « attendre » en cours de match arrête les frais mais ne répare rien. Un joueur qui marche ou qui s'arrête devrait récupérer un peu.
- Les consignes ont été réglées une par une. Deux duels seulement ont été étudiés : jeu long contre hauteur du bloc, et pressing contre jeu long, large, rapide ou court.

La page :

- Recalculer un match de 90 minutes après un changement de consigne prend 1,5 seconde, pendant laquelle la page est figée.
- Une série de 20 matchs de 90 minutes doit prendre environ 30 secondes (estimation).
- La barre de temps montre les buts à venir.
- La fiche d'un joueur affiche douze de ses vingt notes (pour le gardien, réflexes et jeu de mains remplacent dribble et finition).
- On ne peut pas modifier une équipe dans la page : il faut modifier `equipes.json`, puis relancer `node build.js`.

Rappel de méthode : les réglages ont été faits à la main, sur des moyennes. Changer un nombre en déplace d'autres : toujours remesurer. Et se méfier des totaux par match : préférer les chiffres par situation.

## Ce qui n'existe pas encore

- Une seule formation (4-4-2). Onze joueurs par équipe, pas de remplaçants.
- Pas de consigne par joueur ou par ligne, pas de consigne de prise de risque (« mentalité »).
- Pas de cartons, de remplacements, de blessures, de mi-temps (les équipes ne changent pas de côté), de règle de l'avantage.
- Touches jouées comme des passes courtes, pas de pied fort.
- Vue de dessus en 2D seulement.
