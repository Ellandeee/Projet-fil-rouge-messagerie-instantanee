/*
  Page des discussions (conversation.html)
  - liste des salons à gauche avec le dernier message, les non lus, les grains et des filtres
  - discussion ouverte à droite avec les messages en temps réel
  - indicateurs en ligne, en train d'écrire et envoyé / reçu / lu
  - fenêtre pour créer une nouvelle discussion
  Le chrono et les grains sont dans points.js, la boutique dans boutique.js
  Les animations et les sons sont dans effets.js
*/

// Nombre de messages chargés à la fois (le bouton « Messages précédents » charge la suite)
const TAILLE_PAGE = 50;

// ===== État de la page =====

// Chaque salon : { id, nom, est_prive, cree_le, membres, autre, dernier, nonLus }
let salons = [];
let salonOuvert = null;
let filtreSalons = "toutes";

// Grains de chaque discussion (salonId -> solde) pour les afficher dans la liste
const soldes = new Map();

// Messages chargés pour la discussion ouverte, du plus ancien au plus récent
let messagesCharges = [];
let toutCharge = false;

// Ids des messages déjà affichés (pour ne pas afficher deux fois le même)
const messagesAffiches = new Set();
let dernierJourAffiche = "";

// Dernier message affiché, pour coller les messages qui se suivent du même auteur
let dernierAffiche = null;

// Numéro de l'ouverture en cours : si on clique vite sur une autre discussion
// la première ouverture voit que le numéro a changé et s'arrête
let jetonOuverture = 0;

// Messages arrivés pendant qu'on lisait plus haut dans la discussion
let nouveauxEnBas = 0;
let restaitEnBas = true;

let envoiEnCours = false;

// Ce qu'on avait commencé à écrire dans chaque discussion (salonId -> texte)
const brouillons = new Map();

// Canal temps réel pour « en train d'écrire » du salon ouvert
let canalEcriture = null;
let minuterieEcriture = null;
let dernierSignalEcriture = 0;

// ===== Éléments de la page =====

const listeSalons = document.querySelector("#liste-salons");
const rechercheDiscussion = document.querySelector("#recherche-discussion");
const disposition = document.querySelector(".disposition-conversation");
const etatVide = document.querySelector("#etat-vide");
const discussionOuverte = document.querySelector("#discussion-ouverte");
const listeMessages = document.querySelector("#liste-messages");
const boutonBas = document.querySelector("#bouton-bas");
const indicateurEcriture = document.querySelector("#indicateur-ecriture");
const texteEcriture = document.querySelector("#texte-ecriture");
const formMessage = document.querySelector("#form-message");
const champMessage = document.querySelector("#champ-message");
const boutonEnvoi = formMessage.querySelector("button[type=submit]");
const compteurCaracteres = document.querySelector("#compteur-caracteres");

// Sur ordinateur on met le curseur dans la zone d'écriture, pas sur téléphone (le clavier cacherait tout)
const grandEcran = window.matchMedia("(min-width: 769px)");

demarrer();

async function demarrer() {
  await pagePrete;
  if (!utilisateur) return;

  await chargerSalons();
  await chargerSonsEquipes(); // effets.js : le son choisi dans chaque discussion
  ecouterTempsReel();

  // Quand quelqu'un se connecte ou part on met à jour les pastilles et les statuts
  quandPresenceChange(() => {
    afficherSalons();
    if (salonOuvert) {
      mettreAJourEnTeteDiscussion();
      rafraichirStatuts();
    }
  });

  // Lien venant de la page Contacts ou d'une notification : conversation.html?salon=12
  const salonDemande = new URLSearchParams(window.location.search).get("salon");
  if (salonDemande) {
    ouvrirSalon(Number(salonDemande));
  }
}

// ===== Liste des salons =====

async function chargerSalons() {
  // On récupère les salons avec leurs membres et le profil de chaque membre en une requête
  const { data, error } = await client
    .from("salons")
    .select("id, nom, est_prive, cree_le, membres_salon(membre_id, derniere_lecture, profils(id, nom_utilisateur, couleur_avatar))");

  if (error) {
    console.error(error);
    listeSalons.textContent = "";
    afficherToast("Impossible de charger vos discussions. Vérifiez votre connexion.", "erreur");
    return;
  }

  salons = data.map((salon) => {
    const membres = salon.membres_salon.map((m) => ({
      id: m.membre_id,
      derniereLecture: m.derniere_lecture,
      profil: m.profils
    }));
    membres.forEach((m) => cacheProfils.set(m.id, m.profil));
    const autreMembre = membres.find((m) => m.id !== utilisateur.id);
    return {
      id: salon.id,
      nom: salon.est_prive ? (autreMembre ? autreMembre.profil.nom_utilisateur : "Discussion") : salon.nom,
      est_prive: salon.est_prive,
      cree_le: salon.cree_le,
      membres,
      autre: salon.est_prive && autreMembre ? autreMembre.profil : null,
      dernier: null,
      nonLus: 0
    };
  });

  await Promise.all([chargerDerniersMessages(), chargerSoldes()]);
  listeSalons.removeAttribute("aria-busy");
  afficherSalons();
}

// Dernier message et nombre de non lus pour chaque salon
async function chargerDerniersMessages() {
  if (salons.length === 0) return;

  const { data } = await client
    .from("messages")
    .select("id, salon_id, auteur_id, contenu, cree_le")
    .in("salon_id", salons.map((s) => s.id))
    .order("cree_le", { ascending: false })
    .limit(300);

  for (const salon of salons) {
    const messagesDuSalon = (data || []).filter((m) => m.salon_id === salon.id);
    const moi = salon.membres.find((m) => m.id === utilisateur.id);
    salon.dernier = messagesDuSalon[0] || null;
    salon.nonLus = messagesDuSalon.filter(
      (m) => m.auteur_id !== utilisateur.id && new Date(m.cree_le) > new Date(moi.derniereLecture)
    ).length;
  }
}

async function chargerSoldes() {
  const { data } = await client.from("points").select("salon_id, solde");
  soldes.clear();
  for (const ligne of data || []) {
    soldes.set(ligne.salon_id, ligne.solde);
  }
}

// Le salon passe-t-il le filtre choisi et la recherche ?
function salonVisible(salon, recherche) {
  if (recherche && !salon.nom.toLowerCase().includes(recherche)) return false;
  if (filtreSalons === "non-lues") return salon.nonLus > 0;
  if (filtreSalons === "groupes") return !salon.est_prive;
  return true;
}

function afficherSalons() {
  // Les discussions les plus récentes en haut
  salons.sort((a, b) => {
    const dateA = a.dernier ? a.dernier.cree_le : a.cree_le;
    const dateB = b.dernier ? b.dernier.cree_le : b.cree_le;
    return new Date(dateB) - new Date(dateA);
  });

  const recherche = rechercheDiscussion.value.trim().toLowerCase();
  const visibles = salons.filter((salon) => salonVisible(salon, recherche));
  listeSalons.textContent = "";

  for (const salon of visibles) {
    const modele = document.querySelector("#modele-salon").content.cloneNode(true);
    const bouton = modele.querySelector(".salon");
    const badge = modele.querySelector(".salon-badge");
    bouton.dataset.salonId = salon.id;

    remplirAvatar(modele.querySelector(".avatar"), profilAffiche(salon));
    modele.querySelector(".salon-nom").textContent = salon.nom;
    modele.querySelector(".salon-apercu").textContent = apercuSalon(salon);
    if (salon.dernier) {
      modele.querySelector(".salon-heure").textContent = formaterDateCourte(salon.dernier.cree_le);
    }
    remplirGrainsSalon(modele.querySelector(".salon-grains"), salon.id);

    if (salonOuvert && salonOuvert.id === salon.id) {
      bouton.classList.add("actif");
      bouton.setAttribute("aria-current", "true");
    }
    if (salon.nonLus > 0) {
      bouton.classList.add("non-lu");
      badge.hidden = false;
      badge.textContent = salon.nonLus;
    }

    bouton.addEventListener("click", () => ouvrirSalon(salon.id));
    listeSalons.append(modele);
  }

  // Des discussions existent mais aucune ne passe le filtre ou la recherche
  if (salons.length > 0 && visibles.length === 0) {
    const vide = document.createElement("li");
    vide.className = "aucun-resultat";
    vide.textContent = filtreSalons === "non-lues" && !recherche
      ? "Tout est lu, rien ne vous attend."
      : "Aucune discussion ne correspond.";
    listeSalons.append(vide);
  }

  document.querySelector("#aucune-discussion").hidden = salons.length > 0;
  mettreAJourTitre();
}

// Les grains d'une discussion, en petit dans la liste (rien si 0)
function remplirGrainsSalon(element, salonId) {
  const solde = soldes.get(salonId) || 0;
  element.textContent = solde > 0 ? solde + " grains" : "";
}

// Le nombre total de non lus s'affiche dans l'onglet du navigateur
function mettreAJourTitre() {
  const total = salons.reduce((somme, salon) => somme + salon.nonLus, 0);
  document.title = (total > 0 ? "(" + total + ") " : "") + "Discussions | TimeChat";
}

// Avatar d'un salon : la personne en privé, le nom du salon en groupe
function profilAffiche(salon) {
  if (salon.autre) return salon.autre;
  return { id: null, nom_utilisateur: salon.nom, couleur_avatar: "#6b4a12" };
}

function apercuSalon(salon) {
  if (!salon.dernier) return "Pas encore de message";
  let debut = "";
  if (salon.dernier.auteur_id === utilisateur.id) {
    debut = "Vous : ";
  } else if (!salon.est_prive) {
    const auteur = cacheProfils.get(salon.dernier.auteur_id);
    debut = auteur ? auteur.nom_utilisateur + " : " : "";
  }
  return debut + salon.dernier.contenu;
}

rechercheDiscussion.addEventListener("input", afficherSalons);

// Les trois filtres au-dessus de la liste (Toutes, Non lues, Groupes)
for (const bouton of document.querySelectorAll(".filtre")) {
  bouton.addEventListener("click", () => {
    filtreSalons = bouton.dataset.filtre;
    document.querySelectorAll(".filtre").forEach((b) => b.setAttribute("aria-pressed", b === bouton));
    afficherSalons();
  });
}

// points.js et boutique.js préviennent quand le solde d'une discussion change
document.addEventListener("solde-change", (evenement) => {
  const { salonId, solde } = evenement.detail;
  if (!salonId) return;
  soldes.set(salonId, solde);
  const bouton = listeSalons.querySelector(`.salon[data-salon-id="${salonId}"]`);
  if (bouton) remplirGrainsSalon(bouton.querySelector(".salon-grains"), salonId);
});

// ===== Ouvrir et fermer une discussion =====

async function ouvrirSalon(id) {
  const salon = salons.find((s) => s.id === id);
  if (!salon) {
    afficherToast("Cette discussion n'existe plus ou vous n'en faites pas partie.", "erreur");
    return;
  }

  // Déjà ouverte : on remet juste le curseur dans la zone d'écriture
  if (salonOuvert && salonOuvert.id === id) {
    if (grandEcran.matches) champMessage.focus();
    return;
  }

  if (salonOuvert) fermerDiscussion();
  const jeton = ++jetonOuverture;
  salonOuvert = salon;
  salon.nonLus = 0;

  etatVide.hidden = true;
  discussionOuverte.hidden = false;
  disposition.classList.add("discussion-active"); // sur téléphone on cache la liste
  mettreAJourEnTeteDiscussion();
  afficherSalons();
  afficherChargementMessages();

  // Les grains de cette discussion et les articles équipés, en même temps
  const [reponsePoints] = await Promise.all([
    client.from("points").select("solde").eq("salon_id", salon.id).maybeSingle(),
    appliquerPersonnalisation(salon.id)
  ]);
  if (jeton !== jetonOuverture) return; // une autre discussion a été ouverte entre temps
  afficherSolde(reponsePoints.data ? reponsePoints.data.solde : 0, salon.id);

  await chargerMessages(salon.id);
  if (jeton !== jetonOuverture) return;

  marquerCommeLu();
  ecouterEcriture(salon.id);
  demarrerChrono({ salonId: salon.id, quandFerme: fermerDiscussion });

  // On retrouve le message qu'on avait commencé à écrire
  champMessage.value = brouillons.get(salon.id) || "";
  majZoneEcriture();
  if (grandEcran.matches) champMessage.focus();
}

// automatique = true quand c'est le chrono qui ferme (on explique pourquoi)
function fermerDiscussion(automatique = false) {
  arreterChrono();
  jetonOuverture++;
  if (canalEcriture) {
    client.removeChannel(canalEcriture);
    canalEcriture = null;
  }
  const fenetre = document.querySelector("#boutique");
  if (fenetre.open) fenetre.close();

  const infoFermeture = document.querySelector("#info-fermeture");
  infoFermeture.hidden = !automatique;
  if (automatique && salonOuvert) {
    const texte = "La discussion « " + salonOuvert.nom + " » s'est fermée après 1 minute sans message.";
    infoFermeture.textContent = texte;
    // Sur téléphone on revient à la liste, l'explication passe par un toast
    if (!grandEcran.matches) afficherToast(texte);
  }

  // Le brouillon est gardé pour la prochaine fois
  if (salonOuvert) brouillons.set(salonOuvert.id, champMessage.value);

  salonOuvert = null;
  discussionOuverte.hidden = true;
  etatVide.hidden = false;
  indicateurEcriture.hidden = true;
  boutonBas.hidden = true;
  champMessage.value = "";
  disposition.classList.remove("discussion-active");
  afficherSalons();
}

document.querySelector("#bouton-fermer-discussion").addEventListener("click", () => fermerDiscussion());
document.querySelector("#bouton-retour-liste").addEventListener("click", () => fermerDiscussion());
document.querySelector("#bouton-boutique").addEventListener("click", () => {
  if (!salonOuvert) return;
  ouvrirBoutique({ id: salonOuvert.id, nom: salonOuvert.nom, profil: profilAffiche(salonOuvert) });
});

function mettreAJourEnTeteDiscussion() {
  const salon = salonOuvert;
  const statut = document.querySelector("#statut-discussion");
  document.querySelector("#titre-discussion").textContent = salon.nom;
  remplirAvatar(document.querySelector("#avatar-discussion"), profilAffiche(salon));

  if (salon.est_prive) {
    const connecte = enLigne.has(salon.autre.id);
    statut.textContent = connecte ? "En ligne" : "Hors ligne";
    statut.classList.toggle("en-ligne", connecte);
  } else {
    // En groupe on affiche le nombre de membres et combien sont là
    const presents = salon.membres.filter((m) => m.id !== utilisateur.id && enLigne.has(m.id)).length;
    statut.textContent = salon.membres.length + " membres" + (presents > 0 ? ", " + presents + " en ligne" : "");
    statut.title = salon.membres.map((m) => m.profil.nom_utilisateur).join(", ");
    statut.classList.toggle("en-ligne", presents > 0);
  }
}

// ===== Messages =====

// Pendant le chargement on montre trois fausses bulles qui brillent
function afficherChargementMessages() {
  listeMessages.textContent = "";
  for (const largeur of [55, 35, 45]) {
    const ligne = document.createElement("li");
    ligne.className = "message-squelette squelette";
    ligne.style.width = largeur + "%";
    ligne.setAttribute("aria-hidden", "true");
    listeMessages.append(ligne);
  }
}

async function chargerMessages(salonId) {
  // Les derniers messages (on les prend du plus récent puis on remet dans l'ordre)
  const { data, error } = await client
    .from("messages")
    .select("id, salon_id, auteur_id, contenu, cree_le")
    .eq("salon_id", salonId)
    .order("cree_le", { ascending: false })
    .limit(TAILLE_PAGE);

  if (error) {
    console.error(error);
    listeMessages.textContent = "";
    afficherToast("Les messages n'ont pas pu être chargés.", "erreur");
    return;
  }

  messagesCharges = data.reverse();
  toutCharge = data.length < TAILLE_PAGE;
  dessinerMessages();
  descendreEnBas();
}

// Redessine toute la liste à partir de messagesCharges
function dessinerMessages() {
  listeMessages.textContent = "";
  messagesAffiches.clear();
  dernierJourAffiche = "";
  dernierAffiche = null;

  // Bouton pour remonter plus loin dans la discussion
  if (!toutCharge) {
    const ligne = document.createElement("li");
    ligne.className = "charger-plus";
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "bouton bouton-petit bouton-secondaire";
    bouton.textContent = "Messages précédents";
    bouton.addEventListener("click", chargerPlusAnciens);
    ligne.append(bouton);
    listeMessages.append(ligne);
  }

  // Discussion encore vide : une petite phrase pour lancer la conversation
  if (messagesCharges.length === 0) {
    const vide = document.createElement("li");
    vide.className = "message-vide";
    vide.textContent = salonOuvert.est_prive
      ? "Envoyez le premier message à " + salonOuvert.nom + "."
      : "Envoyez le premier message du groupe.";
    listeMessages.append(vide);
    return;
  }

  messagesCharges.forEach((message) => afficherMessage(message));
}

async function chargerPlusAnciens(evenement) {
  const bouton = evenement.currentTarget;
  bouton.disabled = true;
  bouton.textContent = "Chargement…";
  const salonId = salonOuvert.id;

  const { data, error } = await client
    .from("messages")
    .select("id, salon_id, auteur_id, contenu, cree_le")
    .eq("salon_id", salonId)
    .lt("cree_le", messagesCharges[0].cree_le)
    .order("cree_le", { ascending: false })
    .limit(TAILLE_PAGE);

  if (error || !salonOuvert || salonOuvert.id !== salonId) {
    bouton.disabled = false;
    bouton.textContent = "Messages précédents";
    return;
  }

  // On garde la même position à l'écran pendant que les anciens messages s'ajoutent au-dessus
  const hauteurAvant = listeMessages.scrollHeight;
  messagesCharges = data.reverse().concat(messagesCharges);
  toutCharge = data.length < TAILLE_PAGE;
  dessinerMessages();
  listeMessages.scrollTop = listeMessages.scrollHeight - hauteurAvant;
}

// nouveau = true pour un message qui arrive maintenant (il a droit aux animations)
function afficherMessage(message, nouveau = false) {
  if (messagesAffiches.has(message.id)) return;
  messagesAffiches.add(message.id);

  // Le premier message remplace la phrase « Envoyez le premier message »
  const vide = listeMessages.querySelector(".message-vide");
  if (vide) vide.remove();

  // Séparateur quand on change de jour
  const jour = formaterJour(message.cree_le);
  if (jour !== dernierJourAffiche) {
    const separateur = document.createElement("li");
    separateur.className = "separateur-date";
    separateur.textContent = jour;
    listeMessages.append(separateur);
    dernierJourAffiche = jour;
    dernierAffiche = null;
  }

  const modele = document.querySelector("#modele-message").content.cloneNode(true);
  const ligne = modele.querySelector(".message");
  const deMoi = message.auteur_id === utilisateur.id;
  const auteur = cacheProfils.get(message.auteur_id) || { nom_utilisateur: "?", couleur_avatar: "#6b655b" };

  // Même auteur que le message d'avant et moins de 5 minutes d'écart : on colle les deux
  const ecart = dernierAffiche ? new Date(message.cree_le) - new Date(dernierAffiche.cree_le) : Infinity;
  if (dernierAffiche && dernierAffiche.auteur_id === message.auteur_id && ecart < 5 * 60 * 1000) {
    ligne.classList.add("suite");
  }
  dernierAffiche = message;

  ligne.dataset.date = message.cree_le;
  if (deMoi) {
    ligne.classList.add("moi");
    ligne.dataset.humeur = humeurMessage(message.contenu); // effets.js, pour la couleur Humeur
  } else {
    remplirAvatar(modele.querySelector(".message-avatar"), auteur);
    // En groupe on écrit le nom de l'auteur au-dessus du message
    if (!salonOuvert.est_prive) {
      modele.querySelector(".message-auteur").textContent = auteur.nom_utilisateur;
    }
  }

  remplirTexte(modele.querySelector(".message-contenu"), message.contenu);
  const heure = modele.querySelector(".message-heure");
  heure.textContent = formaterHeure(message.cree_le);
  heure.setAttribute("datetime", message.cree_le);
  heure.title = new Date(message.cree_le).toLocaleString("fr-FR");

  if (deMoi) {
    modele.querySelector(".message-statut").textContent = statutMessage(message.cree_le);
  }

  listeMessages.append(modele);

  if (nouveau) animerArrivee(ligne, message.contenu, deMoi);
}

// Met le texte du message et transforme les adresses web en liens cliquables
// On crée les éléments un par un (jamais innerHTML) donc un message ne peut pas injecter du HTML
function remplirTexte(element, texte) {
  element.textContent = "";
  const morceaux = texte.split(/(https?:\/\/[^\s]+)/g);
  for (const morceau of morceaux) {
    if (!/^https?:\/\//.test(morceau)) {
      element.append(morceau);
      continue;
    }
    // La ponctuation collée à la fin ne fait pas partie du lien
    const adresse = morceau.replace(/[.,;:!?)]+$/, "");
    const lien = document.createElement("a");
    lien.href = adresse;
    lien.textContent = adresse;
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";
    element.append(lien, morceau.slice(adresse.length));
  }
}

// Le message glisse en place, et les articles équipés ajoutent leur petit effet
function animerArrivee(ligne, contenu, deMoi) {
  ligne.classList.add("arrivee");
  if (discussionOuverte.classList.contains("police-machine")) {
    const zone = ligne.querySelector(".message-contenu");
    ecrireLettreParLettre(zone, contenu, () => remplirTexte(zone, contenu));
  }
  if (deMoi) jouerEffetEnvoi(ligne, discussionOuverte);
}

// ===== Défilement =====

// Vrai si on voit le bas de la discussion (à 80 px près)
function estEnBas() {
  return listeMessages.scrollHeight - listeMessages.scrollTop - listeMessages.clientHeight < 80;
}

function descendreEnBas(doux = false) {
  listeMessages.scrollTo({ top: listeMessages.scrollHeight, behavior: doux ? "smooth" : "auto" });
  nouveauxEnBas = 0;
  boutonBas.hidden = true;
}

// Bouton « Nouveaux messages » quand un message arrive pendant qu'on lit plus haut
function signalerNouveauEnBas() {
  nouveauxEnBas++;
  boutonBas.textContent = nouveauxEnBas > 1 ? nouveauxEnBas + " nouveaux messages" : "Nouveau message";
  boutonBas.hidden = false;
}

boutonBas.addEventListener("click", () => descendreEnBas(true));

listeMessages.addEventListener("scroll", () => {
  restaitEnBas = estEnBas();
  if (restaitEnBas && !boutonBas.hidden) {
    boutonBas.hidden = true;
    nouveauxEnBas = 0;
  }
});

// Sur téléphone le clavier réduit l'écran : on garde le dernier message visible
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (salonOuvert && restaitEnBas) descendreEnBas();
  });
}

// ===== Statuts envoyé / reçu / lu =====

// Envoyé / Reçu / Lu pour mes messages
function statutMessage(date) {
  const autres = salonOuvert.membres.filter((m) => m.id !== utilisateur.id);
  const toutLu = autres.length > 0 && autres.every((m) => new Date(m.derniereLecture) >= new Date(date));
  if (toutLu) return "Lu";
  // Reçu = au moins une personne a la messagerie ouverte en ce moment
  if (autres.some((m) => enLigne.has(m.id))) return "Reçu";
  return "Envoyé";
}

function rafraichirStatuts() {
  for (const ligne of listeMessages.querySelectorAll(".message.moi")) {
    ligne.querySelector(".message-statut").textContent = statutMessage(ligne.dataset.date);
  }
}

// On note dans la base qu'on a tout lu (sert à l'indicateur « Lu » chez les autres)
async function marquerCommeLu() {
  if (!salonOuvert) return;
  const maintenant = new Date().toISOString();
  const moi = salonOuvert.membres.find((m) => m.id === utilisateur.id);
  if (moi) moi.derniereLecture = maintenant;
  await client
    .from("membres_salon")
    .update({ derniere_lecture: maintenant })
    .eq("salon_id", salonOuvert.id)
    .eq("membre_id", utilisateur.id);
}

// Quand on revient sur l'onglet les messages arrivés entre temps deviennent lus
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") marquerCommeLu();
});

// ===== Écrire et envoyer =====

// Le bouton Envoyer est grisé tant qu'il n'y a rien à envoyer
function majBoutonEnvoi() {
  boutonEnvoi.disabled = envoiEnCours || champMessage.value.trim() === "";
}

// Compteur, hauteur de la zone et bouton Envoyer selon le texte tapé
function majZoneEcriture() {
  // Le compteur n'apparaît qu'en approchant de la limite des 500 caractères
  const longueur = champMessage.value.length;
  compteurCaracteres.textContent = longueur >= 400 ? longueur + " / 500" : "";
  compteurCaracteres.classList.toggle("limite", longueur >= 480);

  // La zone grandit avec le texte (jusqu'à la hauteur max du CSS)
  champMessage.style.height = "auto";
  champMessage.style.height = champMessage.scrollHeight + "px";

  majBoutonEnvoi();
}

champMessage.addEventListener("input", () => {
  majZoneEcriture();
  signalerEcriture();
});

champMessage.addEventListener("keydown", (evenement) => {
  signalerFrappe(evenement); // points.js : garde la discussion ouverte

  // Entrée envoie le message, Maj + Entrée fait un retour à la ligne
  if (evenement.key === "Enter" && !evenement.shiftKey && !evenement.isComposing) {
    evenement.preventDefault();
    formMessage.requestSubmit();
  }
});

formMessage.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const contenu = champMessage.value.trim();
  // envoiEnCours empêche d'envoyer deux fois le même message avec deux appuis rapides
  if (!salonOuvert || envoiEnCours || contenu === "" || contenu.length > 500) return;

  envoiEnCours = true;
  majBoutonEnvoi();
  const salon = salonOuvert;

  const { data, error } = await client
    .from("messages")
    .insert({ salon_id: salon.id, auteur_id: utilisateur.id, contenu })
    .select()
    .single();

  envoiEnCours = false;
  if (error) {
    console.error(error);
    majBoutonEnvoi();
    afficherToast("Le message n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.", "erreur");
    return;
  }

  salon.dernier = data;
  if (salonOuvert !== salon) return; // la discussion a été fermée pendant l'envoi

  champMessage.value = "";
  brouillons.delete(salon.id);
  majZoneEcriture();

  messagesCharges.push(data);
  afficherMessage(data, true);
  descendreEnBas();
  afficherSalons();
  signalerEnvoi(); // points.js : relance le chrono et donne les grains en attente
});

// ===== En train d'écrire =====

// Chaque salon ouvert a un petit canal « broadcast » (rien n'est enregistré dans la base)
function ecouterEcriture(salonId) {
  canalEcriture = client.channel("ecriture-" + salonId);
  canalEcriture.on("broadcast", { event: "ecrit" }, ({ payload }) => {
    if (payload.id === utilisateur.id) return;
    texteEcriture.textContent = payload.nom + " est en train d'écrire";
    indicateurEcriture.hidden = false;
    // Si on ne reçoit plus rien pendant 3 s on cache l'indicateur
    clearTimeout(minuterieEcriture);
    minuterieEcriture = setTimeout(() => {
      indicateurEcriture.hidden = true;
    }, 3000);
  });
  canalEcriture.subscribe();
}

// On prévient les autres au maximum une fois toutes les 2 s
function signalerEcriture() {
  if (!canalEcriture || Date.now() - dernierSignalEcriture < 2000) return;
  dernierSignalEcriture = Date.now();
  canalEcriture.send({
    type: "broadcast",
    event: "ecrit",
    payload: { id: utilisateur.id, nom: utilisateur.nom_utilisateur }
  });
}

// ===== Temps réel =====

function ecouterTempsReel() {
  client
    .channel("discussions")
    // Nouveau message dans un de nos salons (la sécurité de la base filtre pour nous)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (changement) => {
      recevoirMessage(changement.new);
    })
    // Quelqu'un a lu les messages (pour l'indicateur « Lu »)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "membres_salon" }, (changement) => {
      lectureMiseAJour(changement.new);
    })
    // On a été ajouté dans un nouveau salon
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "membres_salon" }, () => {
      chargerSalons();
    })
    .subscribe();
}

async function recevoirMessage(message) {
  let salon = salons.find((s) => s.id === message.salon_id);
  if (!salon) {
    await chargerSalons();
    salon = salons.find((s) => s.id === message.salon_id);
    if (!salon) return;
  }
  salon.dernier = message;
  const deMoi = message.auteur_id === utilisateur.id;

  if (salonOuvert && salonOuvert.id === salon.id) {
    if (!messagesAffiches.has(message.id)) {
      // On ne descend tout seul que si on était déjà en bas, sinon on ne coupe pas la lecture
      const enBas = estEnBas();
      messagesCharges.push(message);
      afficherMessage(message, true);
      if (enBas || deMoi) descendreEnBas();
      else signalerNouveauEnBas();
    }
    if (!deMoi) {
      indicateurEcriture.hidden = true;
      if (document.visibilityState === "visible") marquerCommeLu();
      else jouerSonDuSalon(salon.id); // discussion ouverte mais onglet caché
    }
  } else if (!deMoi) {
    salon.nonLus++;
    const auteur = await obtenirProfil(message.auteur_id);
    // Un clic sur la notification ouvre la discussion sans recharger la page
    if (auteur) afficherNotification(auteur, message.contenu, () => ouvrirSalon(salon.id));
    jouerSonDuSalon(salon.id); // effets.js : le son acheté pour cette discussion
  }

  afficherSalons();
}

function lectureMiseAJour(ligne) {
  const salon = salons.find((s) => s.id === ligne.salon_id);
  if (!salon) return;
  const membre = salon.membres.find((m) => m.id === ligne.membre_id);
  if (membre) membre.derniereLecture = ligne.derniere_lecture;
  if (salonOuvert && salonOuvert.id === salon.id) rafraichirStatuts();
}

// ===== Nouvelle discussion =====

const fenetreNouvelle = document.querySelector("#dialogue-nouvelle-discussion");
const formNouvelle = document.querySelector("#form-nouvelle-discussion");
const choixParticipants = document.querySelector("#choix-participants");
const zoneNomSalon = document.querySelector("#zone-nom-salon");
const messageNouvelle = document.querySelector("#message-nouvelle-discussion");
const boutonCommencer = formNouvelle.querySelector("button[type=submit]");

document.querySelector("#bouton-nouvelle-discussion").addEventListener("click", async () => {
  formNouvelle.reset();
  zoneNomSalon.hidden = true;
  choixParticipants.textContent = "";
  afficherEtat(messageNouvelle, "");
  majBoutonCommencer();

  const contacts = (await chargerContacts())
    .filter((c) => c.statut === "accepte")
    .sort((a, b) => a.autre.nom_utilisateur.localeCompare(b.autre.nom_utilisateur));
  if (contacts.length === 0) {
    afficherEtat(messageNouvelle, "Ajoutez d'abord un contact depuis la page Contacts.", "erreur");
  }

  for (const contact of contacts) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const caseACocher = document.createElement("input");
    caseACocher.type = "checkbox";
    caseACocher.value = contact.autre.id;
    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-petit";
    remplirAvatar(avatar, contact.autre);
    const nom = document.createElement("span");
    nom.textContent = contact.autre.nom_utilisateur;
    label.append(caseACocher, avatar, nom);
    li.append(label);
    choixParticipants.append(li);
  }

  fenetreNouvelle.showModal();
});

// Le texte du bouton dit ce qui va se passer (discussion privée ou groupe)
function majBoutonCommencer() {
  const nombre = choixParticipants.querySelectorAll("input:checked").length;
  zoneNomSalon.hidden = nombre < 2;
  boutonCommencer.disabled = nombre === 0;
  boutonCommencer.textContent = nombre > 1 ? "Créer le groupe (" + (nombre + 1) + ")" : "Commencer";
}

choixParticipants.addEventListener("change", majBoutonCommencer);

document.querySelector("#bouton-annuler-discussion").addEventListener("click", () => {
  fenetreNouvelle.close();
});

formNouvelle.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const ids = [...choixParticipants.querySelectorAll("input:checked")].map((c) => c.value);
  const nomSalon = document.querySelector("#nom-salon").value.trim();

  if (ids.length === 0) {
    afficherEtat(messageNouvelle, "Cochez au moins un contact.", "erreur");
    return;
  }
  if (ids.length > 1 && nomSalon === "") {
    afficherEtat(messageNouvelle, "Donnez un nom au groupe.", "erreur");
    document.querySelector("#nom-salon").focus();
    return;
  }

  // Un contact = discussion privée, plusieurs = salon de groupe
  boutonCommencer.disabled = true;
  const reponse = ids.length === 1
    ? await client.rpc("ouvrir_salon_prive", { p_contact: ids[0] })
    : await client.rpc("creer_salon_groupe", { p_nom: nomSalon, p_membres: ids });

  if (reponse.error) {
    boutonCommencer.disabled = false;
    afficherEtat(messageNouvelle, reponse.error.message, "erreur");
    return;
  }

  fenetreNouvelle.close();
  await chargerSalons();
  ouvrirSalon(reponse.data);
  if (ids.length > 1) afficherToast("Groupe « " + nomSalon + " » créé.", "succes");
});
