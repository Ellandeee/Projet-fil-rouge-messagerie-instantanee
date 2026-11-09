/*
  Effets visuels et sonores de la page des discussions
  - les effets d'envoi achetés dans la boutique (tampon, encre, sable, avion, confettis)
  - les sons de notification achetés dans la boutique
  - les polices de la boutique, chargées seulement quand on en a besoin
  - les petites animations des grains (+1 qui s'envole, nombre qui défile)
  - l'humeur d'un message et l'heure du jour pour les articles qui en dépendent
  Les animations sont faites avec element.animate() donc pas besoin de keyframes en CSS
  Rien ne bouge si la personne a demandé moins d'animations dans son système
*/

const moinsDAnimations = window.matchMedia("(prefers-reduced-motion: reduce)");

// Couleurs des particules, prises dans la charte (sable, encre, brique, sauge, papier)
const COULEURS_FETE = ["#c8923a", "#1f2a44", "#b5442e", "#2f6b4a", "#f3e3c3", "#2457a6"];

// ===== Calque des particules =====

// Les particules sont posées dans un calque fixe qui couvre l'écran
// Quand une fenêtre (dialog) est ouverte on le met dedans sinon il passerait dessous
function calqueEffets() {
  const parent = document.querySelector("dialog[open]") || document.body;
  let calque = parent.querySelector(":scope > .calque-effets");
  if (!calque) {
    calque = document.createElement("div");
    calque.className = "calque-effets";
    calque.setAttribute("aria-hidden", "true");
    parent.append(calque);
  }
  return calque;
}

// Crée une particule à la position x, y de l'écran et lance son animation
function lancerParticule({ x, y, taille, couleur, forme = "rond", images, duree, delai = 0 }) {
  const particule = document.createElement("span");
  particule.className = "particule particule-" + forme;
  particule.style.left = x + "px";
  particule.style.top = y + "px";
  particule.style.width = taille + "px";
  particule.style.height = forme === "confetti" ? taille * 0.45 + "px" : taille + "px";
  particule.style.backgroundColor = couleur;
  calqueEffets().append(particule);

  const animation = particule.animate(images, {
    duration: duree,
    delay: delai,
    easing: "cubic-bezier(0.2, 0.6, 0.4, 1)",
    fill: "both"
  });
  animation.onfinish = () => particule.remove();
}

function hasard(min, max) {
  return min + Math.random() * (max - min);
}

// Centre d'un élément à l'écran
function centreDe(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect };
}

// ===== Effets d'envoi =====

// ligne = le <li class="message moi"> qu'on vient d'ajouter
// conteneur = l'élément qui porte les classes des articles (la discussion ou la vitrine)
function jouerEffetEnvoi(ligne, conteneur) {
  if (moinsDAnimations.matches || !ligne) return;
  const effet = [...conteneur.classList].find((classe) => classe.startsWith("effet-"));
  const bulle = ligne.querySelector(".bulle");
  if (!effet || !bulle) return;

  if (effet === "effet-tampon") effetTampon(ligne, conteneur);
  if (effet === "effet-encre") effetEncre(bulle);
  if (effet === "effet-grains") effetGrains(bulle);
  if (effet === "effet-avion") effetAvion(bulle);
  if (effet === "effet-confettis") effetConfettis(bulle);
}

// La bulle tombe de haut et la discussion tremble un tout petit peu
function effetTampon(ligne, conteneur) {
  ligne.querySelector(".bulle").animate(
    [
      { transform: "scale(1.5) rotate(-4deg)", opacity: 0 },
      { transform: "scale(0.94) rotate(1deg)", opacity: 1, offset: 0.6 },
      { transform: "scale(1) rotate(0)" }
    ],
    { duration: 380, easing: "ease-out" }
  );
  const zone = conteneur.querySelector(".liste-messages") || conteneur;
  zone.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(-2px, 1px)" },
      { transform: "translate(2px, -1px)" },
      { transform: "translate(0, 0)" }
    ],
    { duration: 180, delay: 220 }
  );
}

// Un rond d'encre grandit derrière la bulle puis s'efface
function effetEncre(bulle) {
  const { x, y, rect } = centreDe(bulle);
  const taille = Math.max(rect.width, rect.height) * 1.6;
  lancerParticule({
    x: x - taille / 2,
    y: y - taille / 2,
    taille,
    couleur: "rgba(31, 42, 68, 0.22)",
    duree: 700,
    images: [
      { transform: "scale(0.2)", opacity: 1 },
      { transform: "scale(1)", opacity: 0 }
    ]
  });
}

// Des grains partent vers le haut puis retombent avec la gravité
function effetGrains(bulle) {
  const { x, y } = centreDe(bulle);
  for (let i = 0; i < 22; i++) {
    const dx = hasard(-90, 90);
    const monte = hasard(40, 110);
    lancerParticule({
      x,
      y,
      taille: hasard(3, 6),
      couleur: i % 4 === 0 ? "#6b4a12" : "#c8923a",
      duree: hasard(700, 1000),
      images: [
        { transform: "translate(0, 0)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${-monte}px)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${-monte + 140}px)`, opacity: 0 }
      ]
    });
  }
}

// Un petit avion en papier part de la bulle vers le haut à droite
function effetAvion(bulle) {
  const { rect } = centreDe(bulle);
  const avion = document.createElement("span");
  avion.className = "avion-papier";
  avion.style.left = rect.left + "px";
  avion.style.top = rect.top - 10 + "px";
  calqueEffets().append(avion);

  const animation = avion.animate(
    [
      { transform: "translate(0, 0) rotate(-10deg)", opacity: 0 },
      { transform: "translate(40px, -30px) rotate(-20deg)", opacity: 1, offset: 0.15 },
      { transform: "translate(160px, -40px) rotate(10deg)", offset: 0.5 },
      { transform: "translate(320px, -180px) rotate(-30deg)", opacity: 0 }
    ],
    { duration: 1300, easing: "ease-in-out", fill: "both" }
  );
  animation.onfinish = () => avion.remove();
}

// Des confettis qui tombent en tournant au-dessus de la bulle
function effetConfettis(bulle) {
  const { x, rect } = centreDe(bulle);
  for (let i = 0; i < 34; i++) {
    const depart = x + hasard(-rect.width, rect.width * 0.6);
    lancerParticule({
      x: depart,
      y: rect.top - hasard(20, 70),
      taille: hasard(6, 10),
      couleur: COULEURS_FETE[i % COULEURS_FETE.length],
      forme: "confetti",
      duree: hasard(900, 1400),
      delai: hasard(0, 150),
      images: [
        { transform: "translate(0, 0) rotate(0)", opacity: 1 },
        { transform: `translate(${hasard(-40, 40)}px, ${hasard(90, 170)}px) rotate(${hasard(200, 540)}deg)`, opacity: 0 }
      ]
    });
  }
}

// Petite fête de grains après un achat dans la boutique
function feterAchat(element) {
  if (moinsDAnimations.matches || !element) return;
  const { x, y } = centreDe(element);
  for (let i = 0; i < 26; i++) {
    const angle = (Math.PI * 2 * i) / 26;
    const distance = hasard(40, 90);
    lancerParticule({
      x,
      y,
      taille: hasard(4, 7),
      couleur: COULEURS_FETE[i % 3],
      duree: hasard(600, 900),
      images: [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.4)`, opacity: 0 }
      ]
    });
  }
}

// ===== Grains gagnés =====

// Un « +1 » s'envole du bouton des grains et le nombre fait un petit bond
function animerGain(nombre) {
  const bouton = document.querySelector("#bouton-boutique");
  const solde = document.querySelector("#solde-points");
  if (!bouton || moinsDAnimations.matches) return;

  solde.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
    { duration: 350, easing: "ease-out" }
  );

  const plus = document.createElement("span");
  plus.className = "grain-gagne";
  plus.textContent = "+" + nombre;
  bouton.append(plus);
  const animation = plus.animate(
    [
      { transform: "translate(-50%, 0)", opacity: 0 },
      { transform: "translate(-50%, -10px)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%, -34px)", opacity: 0 }
    ],
    { duration: 1100, easing: "ease-out" }
  );
  animation.onfinish = () => plus.remove();
}

// Fait défiler un nombre de « depuis » à « vers » (utilisé pour le solde après un achat)
function animerNombre(element, depuis, vers, duree = 600) {
  if (!element) return;
  if (moinsDAnimations.matches || depuis === vers) {
    element.textContent = vers;
    return;
  }
  const debut = performance.now();
  function etape(maintenant) {
    const avancee = Math.min(1, (maintenant - debut) / duree);
    element.textContent = Math.round(depuis + (vers - depuis) * avancee);
    if (avancee < 1) requestAnimationFrame(etape);
  }
  requestAnimationFrame(etape);
}

// ===== Machine à écrire =====

// Le texte apparaît lettre par lettre (le message complet dure 1,2 s au maximum)
function ecrireLettreParLettre(element, texte) {
  if (moinsDAnimations.matches) {
    element.textContent = texte;
    return;
  }
  const pas = Math.max(1, Math.ceil(texte.length / 50));
  let position = 0;
  element.textContent = "";
  element.classList.add("en-frappe");
  const minuterie = setInterval(() => {
    position += pas;
    element.textContent = texte.slice(0, position);
    if (position >= texte.length) {
      clearInterval(minuterie);
      element.classList.remove("en-frappe");
    }
  }, 24);
}

// ===== Humeur d'un message (article couleur-humeur) =====

// On regarde juste quelques signes simples dans le texte
function humeurMessage(texte) {
  const bas = texte.toLowerCase();
  if (/(haha|hihi|mdr|ptdr|lol|xd)/.test(bas)) return "rire";
  if (/!/.test(bas)) return "cri";
  if (/\?\s*$/.test(bas)) return "question";
  return "";
}

// ===== Heure du jour (article fond-ciel-du-moment) =====

function momentDeLaJournee(date = new Date()) {
  const heure = date.getHours();
  if (heure >= 5 && heure < 9) return "aube";
  if (heure >= 9 && heure < 17) return "jour";
  if (heure >= 17 && heure < 21) return "crepuscule";
  return "nuit";
}

// ===== Couleur de l'avatar (article couleur-assortie) =====

// Texte blanc ou foncé selon la couleur de fond, pour que ça reste lisible
function couleurTexteSur(fond) {
  const r = parseInt(fond.slice(1, 3), 16);
  const v = parseInt(fond.slice(3, 5), 16);
  const b = parseInt(fond.slice(5, 7), 16);
  const clarte = (r * 299 + v * 587 + b * 114) / 1000;
  return clarte > 150 ? "#23201c" : "#ffffff";
}

// Prépare un élément qui porte des classes d'articles (discussion, vitrine ou carte)
function preparerConteneur(element) {
  const couleur = (utilisateur && utilisateur.couleur_avatar) || "#1f2a44";
  element.style.setProperty("--couleur-perso", couleur);
  element.style.setProperty("--texte-perso", couleurTexteSur(couleur));
  element.dataset.moment = momentDeLaJournee();
}

// ===== Polices de la boutique =====

// Chaque police vient de Google Fonts, on ne la télécharge que si on l'utilise
const POLICES = {
  "police-arrondie": "Fredoka:wght@400;600",
  "police-manuscrite": "Caveat:wght@500;700",
  "police-pixel": "Press+Start+2P",
  "police-machine": "Special+Elite",
  "police-grimoire": "UnifrakturMaguntia"
};
const policesChargees = new Set();

function chargerPolice(idArticle) {
  const famille = POLICES[idArticle];
  if (!famille || policesChargees.has(idArticle)) return;
  policesChargees.add(idArticle);
  const lien = document.createElement("link");
  lien.rel = "stylesheet";
  lien.href = "https://fonts.googleapis.com/css2?family=" + famille + "&display=swap";
  document.head.append(lien);
}

// ===== Sons de la boutique =====

let contexteAudio = null;

// Petite note : fréquence de départ, d'arrivée, durée, forme de l'onde et moment de départ
function note(audio, { depart, arrivee = depart, duree, forme = "sine", debut = 0, volume = 0.15 }) {
  const t = audio.currentTime + debut;
  const oscillateur = audio.createOscillator();
  const gain = audio.createGain();
  oscillateur.type = forme;
  oscillateur.frequency.setValueAtTime(depart, t);
  oscillateur.frequency.exponentialRampToValueAtTime(arrivee, t + duree);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
  oscillateur.connect(gain);
  gain.connect(audio.destination);
  oscillateur.start(t);
  oscillateur.stop(t + duree);
}

// Bruit filtré qui ressemble à du sable qui coule
function souffle(audio, duree) {
  const taille = Math.floor(audio.sampleRate * duree);
  const tampon = audio.createBuffer(1, taille, audio.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < taille; i++) {
    donnees[i] = (Math.random() * 2 - 1) * (1 - i / taille);
  }
  const source = audio.createBufferSource();
  const filtre = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = tampon;
  filtre.type = "bandpass";
  filtre.frequency.value = 3200;
  gain.gain.value = 0.25;
  source.connect(filtre);
  filtre.connect(gain);
  gain.connect(audio.destination);
  source.start();
}

function jouerSonArticle(idArticle) {
  try {
    contexteAudio = contexteAudio || new AudioContext();
    const audio = contexteAudio;
    if (idArticle === "son-goutte") {
      note(audio, { depart: 1400, arrivee: 380, duree: 0.18 });
    } else if (idArticle === "son-coucou") {
      note(audio, { depart: 784, duree: 0.22 });
      note(audio, { depart: 622, duree: 0.3, debut: 0.25 });
    } else if (idArticle === "son-carillon") {
      note(audio, { depart: 523, duree: 0.5, forme: "triangle" });
      note(audio, { depart: 659, duree: 0.5, forme: "triangle", debut: 0.12 });
      note(audio, { depart: 784, duree: 0.7, forme: "triangle", debut: 0.24 });
    } else if (idArticle === "son-8bits") {
      note(audio, { depart: 988, duree: 0.08, forme: "square", volume: 0.07 });
      note(audio, { depart: 1319, duree: 0.3, forme: "square", volume: 0.07, debut: 0.08 });
    } else if (idArticle === "son-sablier") {
      souffle(audio, 0.6);
    } else {
      jouerSon(); // le son de base de commun.js
    }
  } catch (erreur) {
    // Le navigateur bloque le son tant qu'on n'a pas cliqué sur la page, pas grave
  }
}

// Le son choisi pour chaque discussion (salonId -> id de l'article)
const sonsParSalon = new Map();

async function chargerSonsEquipes() {
  const { data } = await client
    .from("personnalisations")
    .select("salon_id, article_id")
    .eq("categorie", "son");
  sonsParSalon.clear();
  for (const ligne of data || []) {
    sonsParSalon.set(ligne.salon_id, ligne.article_id);
  }
}

function jouerSonDuSalon(salonId) {
  jouerSonArticle(sonsParSalon.get(salonId));
}
