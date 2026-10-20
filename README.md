# SHEKI BANG

Jeu mobile (PWA) : ton canon tire une armée **verte**, les portes la multiplient (**+1, ×2, ×3, ×5, ×10, ×100**), et elle doit écraser l'armée **bleu foncé** puis détruire sa base. Niveaux infinis.

![Logo](icons/icon-192.png)

## Comment jouer
- **Maintiens le doigt** pour tirer, **glisse** pour viser les meilleures portes.
- Évite les portes rouges **−N** (elles absorbent tes soldats), les lames qui tournent et le vide autour des ponts.
- Le bouton **SUPER** se charge en tirant : il lance un super soldat très résistant.
- Si l'armée bleue atteint ton rempart, tu perds des PV ; à zéro, la partie est perdue.
- Gagne des pièces et améliore **Cadence**, **Rempart** et **Super soldat**.

## Niveaux infinis
Chaque niveau est créé à partir d'une graine propre à la partie (bouton « Nouvelle partie » pour en changer) :
- 4 décors : désert, neige, prairie, canyon ;
- 2 à 4 rangées de portes, portes mobiles, porte jackpot ×10 / ×100 ;
- lames tournantes, pont étroit, géants, boss tous les 5 niveaux ;
- l'armée bleue et la base sont dimensionnées d'après la meilleure combinaison de portes du niveau, la difficulté monte doucement.

## Mettre en ligne (GitHub Pages)
Settings → Pages → *Deploy from a branch* → `main` → `/ (root)` → Save.
Adresse : `https://shekinabanza.github.io/SHEKI-BANG/`

## Fichiers
| Chemin | Rôle |
|---|---|
| `index.html`, `css/style.css`, `js/game.js` | Le jeu (rendu 3D avec Three.js) |
| `vendor/three.module.min.js` | Moteur 3D Three.js (copie locale, marche hors connexion) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur téléphone et jeu hors connexion |
| `test/bot.js` | Robot qui joue les niveaux pour vérifier l'équilibrage |
| `test/shots.js` | Captures d'écran de contrôle |

Après une modification, change `VERSION` dans `sw.js` pour que les joueurs reçoivent la mise à jour.
