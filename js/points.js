/*
  Chrono de fermeture et gain de points (notre fonctionnalité en plus)
  Règles :
  - la discussion se ferme toute seule après 60 s sans message envoyé
  - écrire au clavier garde aussi la discussion ouverte
  - dans chaque discussion (privée ou de groupe) on gagne 1 point toutes les 10 s si l'onglet est visible
  - le temps gagné grâce à la frappe donne des points en attente
    qui sont ajoutés seulement quand on envoie le message (12 max)
  La base vérifie aussi de son côté (1 point par 10 s max) donc on ne peut pas tricher
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
  quandFerme: null
};

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
  const { data, error } = await client.rpc("crediter_points", {
    p_salon: chrono.salonId,
    p_points: nombre
  });
  if (!error && data) {
    afficherSolde(data.solde);
  }
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
  const maintenant = Date.now();
  const derniereActivite = Math.max(chrono.dernierEnvoi, chrono.derniereFrappe);
  const restant = Math.max(0, DUREE_OUVERTURE - Math.floor((maintenant - derniereActivite) / 1000));
  const prolongeParFrappe = maintenant - chrono.dernierEnvoi >= DUREE_OUVERTURE * 1000;
  const bientot = restant <= 10;

  barreMinuteur.style.width = (restant / DUREE_OUVERTURE) * 100 + "%";
  barreMinuteur.classList.toggle("bientot", bientot);
  texteMinuteur.classList.toggle("bientot", bientot);
  texteMinuteur.classList.toggle("ecriture", prolongeParFrappe && !bientot);

  // La plupart du temps la barre suffit, le texte reste vide (donc caché par le CSS)
  if (prolongeParFrappe && !bientot) {
    texteMinuteur.textContent = "Vous écrivez, la discussion reste ouverte";
  } else if (restant <= AFFICHER_TEXTE_A) {
    texteMinuteur.textContent = "Fermeture dans " + restant + " s, envoyez un message pour rester";
  } else {
    texteMinuteur.textContent = "";
  }
}

function afficherSolde(solde) {
  document.querySelector("#solde-points").textContent = solde;
}

function afficherAttente() {
  document.querySelector("#points-attente-zone").hidden = chrono.enAttente === 0;
  document.querySelector("#points-attente").textContent = chrono.enAttente;
}
