/*
  Chrono de fermeture et gain de grains (notre fonctionnalité en plus)
  La discussion se ferme après 60 s sans message, écrire au clavier la garde ouverte
  On gagne 1 grain toutes les 10 s quand l'onglet est visible
  Le temps gagné en écrivant donne des grains en attente, ajoutés à l'envoi (12 max)
  La base vérifie aussi de son côté donc on ne peut pas tricher
  Dans le code et la base on dit encore « points », sur le site on dit « grains »
*/

const DUREE_OUVERTURE = 60; // secondes sans message avant la fermeture
const SECONDES_PAR_POINT = 10;
const MAX_EN_ATTENTE = 12;
const AFFICHER_TEXTE_A = 15; // le texte du minuteur apparaît dans les 15 dernières secondes

// État du chrono pour la discussion ouverte
const chrono = {
  minuterie: null,
  salonId: null,
  dernierEnvoi: 0,
  derniereFrappe: 0,
  secondesVisibles: 0,
  enAttente: 0,
  quandFerme: null,
  pause: 0 // moment où la pause a commencé, 0 si le chrono tourne
};

const minuteur = document.querySelector(".minuteur");
const barreMinuteur = document.querySelector("#barre-minuteur");
const texteMinuteur = document.querySelector("#texte-minuteur");

function demarrerChrono({ salonId, quandFerme }) {
  arreterChrono();
  chrono.salonId = salonId;
  chrono.quandFerme = quandFerme;
  chrono.dernierEnvoi = Date.now(); // ouvrir la discussion lance la première minute
  chrono.derniereFrappe = 0;
  chrono.secondesVisibles = 0;
  chrono.enAttente = 0;
  afficherAttente();
  mettreAJourMinuteur();
  chrono.minuterie = setInterval(tic, 1000);
}

function arreterChrono() {
  clearInterval(chrono.minuterie);
  chrono.minuterie = null;
  chrono.pause = 0;
  minuteur.classList.remove("en-pause");
}

// Pause pendant la boutique : sans ça la discussion se fermait au bout d'une minute avec la boutique dedans
function mettreChronoEnPause() {
  if (!chrono.minuterie || chrono.pause) return;
  clearInterval(chrono.minuterie);
  chrono.minuterie = null;
  chrono.pause = Date.now();
  mettreAJourMinuteur();
}

// En repartant on décale les dates du temps passé en pause, comme si le temps s'était arrêté
function reprendreChrono() {
  if (!chrono.pause) return;
  const duree = Date.now() - chrono.pause;
  chrono.dernierEnvoi += duree;
  if (chrono.derniereFrappe) chrono.derniereFrappe += duree;
  chrono.pause = 0;
  chrono.minuterie = setInterval(tic, 1000);
  mettreAJourMinuteur();
}

// Appelé chaque seconde
function tic() {
  const maintenant = Date.now();
  const derniereActivite = Math.max(chrono.dernierEnvoi, chrono.derniereFrappe);

  if (maintenant - derniereActivite >= DUREE_OUVERTURE * 1000) {
    arreterChrono();
    if (chrono.quandFerme) chrono.quandFerme(true);
    return;
  }

  // Les points ne comptent que si la discussion est vraiment à l'écran
  if (document.visibilityState === "visible") {
    chrono.secondesVisibles++;
    if (chrono.secondesVisibles >= SECONDES_PAR_POINT) {
      chrono.secondesVisibles = 0;
      gagnerUnPoint();
    }
  }

  mettreAJourMinuteur();
}

function gagnerUnPoint() {
  const tempsDepuisEnvoi = Date.now() - chrono.dernierEnvoi;
  if (tempsDepuisEnvoi < DUREE_OUVERTURE * 1000) {
    // Temps normal : le point est ajouté tout de suite
    crediterPoints(1);
  } else if (chrono.enAttente < MAX_EN_ATTENTE) {
    // Temps gagné grâce à la frappe : le point attend l'envoi du message
    chrono.enAttente++;
    afficherAttente();
  }
}

async function crediterPoints(nombre) {
  const salonId = chrono.salonId;
  const { data, error } = await client.rpc("crediter_points", {
    p_salon: salonId,
    p_points: nombre
  });
  if (error || !data) return;

  // Si on a changé de discussion entre temps, on met juste à jour la liste
  if (salonId !== chrono.salonId || !chrono.minuterie) {
    document.dispatchEvent(new CustomEvent("solde-change", { detail: { salonId, solde: data.solde } }));
    return;
  }
  afficherSolde(data.solde, salonId);
  if (data.credites > 0) animerGain(data.credites); // effets.js
}

// Une touche maintenue enfoncée (event.repeat) ne compte pas, sinon un objet sur le clavier suffirait
function signalerFrappe(evenement) {
  if (evenement.repeat) return;
  chrono.derniereFrappe = Date.now();
}

// Appelé après l'envoi d'un message
async function signalerEnvoi() {
  chrono.dernierEnvoi = Date.now();
  chrono.derniereFrappe = 0;
  if (chrono.enAttente > 0) {
    const nombre = chrono.enAttente;
    chrono.enAttente = 0;
    afficherAttente();
    await crediterPoints(nombre);
  }
  mettreAJourMinuteur();
}

// ===== Affichage =====

function mettreAJourMinuteur() {
  // En pause on fige tout à l'heure du début de la pause
  const maintenant = chrono.pause || Date.now();
  minuteur.classList.toggle("en-pause", Boolean(chrono.pause));
  const derniereActivite = Math.max(chrono.dernierEnvoi, chrono.derniereFrappe);
  const restant = Math.max(0, DUREE_OUVERTURE - Math.floor((maintenant - derniereActivite) / 1000));
  const prolongeParFrappe = maintenant - chrono.dernierEnvoi >= DUREE_OUVERTURE * 1000;
  const bientot = restant <= 10;

  barreMinuteur.style.width = (restant / DUREE_OUVERTURE) * 100 + "%";

  // Part de la minute déjà passée (0 au début, 1 à la fermeture)
  // Sert aux articles qui suivent le minuteur (fond Dune et cadre Cadran)
  const discussion = document.querySelector("#discussion-ouverte");
  discussion.style.setProperty("--progression", (1 - restant / DUREE_OUVERTURE).toFixed(3));
  discussion.dataset.moment = momentDeLaJournee(); // effets.js, pour le fond Ciel du moment
  barreMinuteur.classList.toggle("bientot", bientot);
  texteMinuteur.classList.toggle("bientot", bientot);
  texteMinuteur.classList.toggle("ecriture", prolongeParFrappe && !bientot);

  // La plupart du temps la barre suffit, le texte reste vide (donc caché par le CSS)
  if (chrono.pause) {
    texteMinuteur.textContent = "En pause pendant que vous êtes dans la boutique";
    texteMinuteur.classList.remove("bientot", "ecriture");
  } else if (prolongeParFrappe && !bientot) {
    texteMinuteur.textContent = "Vous écrivez, la discussion reste ouverte";
  } else if (restant <= AFFICHER_TEXTE_A) {
    texteMinuteur.textContent = "Fermeture dans " + restant + " s, envoyez un message pour rester";
  } else {
    texteMinuteur.textContent = "";
  }
}

// salonId sert à prévenir la liste des discussions (événement « solde-change »)
function afficherSolde(solde, salonId = chrono.salonId) {
  document.querySelector("#solde-points").textContent = solde;
  document.dispatchEvent(new CustomEvent("solde-change", { detail: { salonId, solde } }));
}

function afficherAttente() {
  const zone = document.querySelector("#points-attente-zone");
  zone.hidden = chrono.enAttente === 0;
  document.querySelector("#points-attente").textContent = chrono.enAttente;
  // Petit bond à chaque grain mis de côté
  if (chrono.enAttente > 0 && !moinsDAnimations.matches) {
    zone.animate([{ transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 300 });
  }
}
