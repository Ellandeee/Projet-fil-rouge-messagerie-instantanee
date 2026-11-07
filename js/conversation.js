/*
  Page des discussions (conversation.html)
  - liste des salons à gauche avec le dernier message et les non lus
  - discussion ouverte à droite avec les messages en temps réel
  - indicateurs en ligne, en train d'écrire et envoyé / reçu / lu
  - fenêtre pour créer une nouvelle discussion
  Le chrono et les points sont dans points.js, la boutique dans boutique.js
*/

// ===== État de la page =====

// Chaque salon : { id, nom, est_prive, cree_le, membres, autre, dernier, nonLus }
let salons = [];
let salonOuvert = null;

// Ids des messages déjà affichés (pour ne pas afficher deux fois le même)
const messagesAffiches = new Set();
let dernierJourAffiche = "";

// Dernier message affiché, pour coller les messages qui se suivent du même auteur
let dernierAffiche = null;

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
const indicateurEcriture = document.querySelector("#indicateur-ecriture");
const formMessage = document.querySelector("#form-message");
const champMessage = document.querySelector("#champ-message");
const compteurCaracteres = document.querySelector("#compteur-caracteres");

demarrer();

async function demarrer() {
  await pagePrete;
  if (!utilisateur) return;

  await chargerSalons();
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

  await chargerDerniersMessages();
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

function afficherSalons() {
  // Les discussions les plus récentes en haut
  salons.sort((a, b) => {
    const dateA = a.dernier ? a.dernier.cree_le : a.cree_le;
    const dateB = b.dernier ? b.dernier.cree_le : b.cree_le;
    return new Date(dateB) - new Date(dateA);
  });

  const filtre = rechercheDiscussion.value.trim().toLowerCase();
  listeSalons.textContent = "";

  for (const salon of salons) {
    if (filtre && !salon.nom.toLowerCase().includes(filtre)) continue;

    const modele = document.querySelector("#modele-salon").content.cloneNode(true);
    const bouton = modele.querySelector(".salon");
    const avatar = modele.querySelector(".avatar");
    const badge = modele.querySelector(".salon-badge");

    remplirAvatar(avatar, profilAffiche(salon));
    modele.querySelector(".salon-nom").textContent = salon.nom;
    modele.querySelector(".salon-apercu").textContent = apercuSalon(salon);
    if (salon.dernier) {
      modele.querySelector(".salon-heure").textContent = formaterDateCourte(salon.dernier.cree_le);
    }

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

  document.querySelector("#aucune-discussion").hidden = salons.length > 0;
}

// Avatar d'un salon : la personne en privé, le nom du salon en groupe
function profilAffiche(salon) {
  if (salon.autre) return salon.autre;
  return { id: null, nom_utilisateur: salon.nom, couleur_avatar: "#3f2a6b" };
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

// ===== Ouvrir et fermer une discussion =====

async function ouvrirSalon(id) {
  const salon = salons.find((s) => s.id === id);
  if (!salon) return;

  if (salonOuvert) fermerDiscussion();
  salonOuvert = salon;
  salon.nonLus = 0;

  etatVide.hidden = true;
  discussionOuverte.hidden = false;
  disposition.classList.add("discussion-active"); // sur téléphone on cache la liste
  mettreAJourEnTeteDiscussion();

  // Nos points dans cette discussion (privée ou de groupe)
  const { data } = await client.from("points").select("solde").eq("salon_id", salon.id).maybeSingle();
  afficherSolde(data ? data.solde : 0);
  await appliquerPersonnalisation(salon.id);

  await chargerMessages(salon.id);
  marquerCommeLu();
  ecouterEcriture(salon.id);

  demarrerChrono({ salonId: salon.id, quandFerme: fermerDiscussion });

  afficherSalons();
  champMessage.focus();
}

// automatique = true quand c'est le chrono qui ferme (on explique pourquoi)
function fermerDiscussion(automatique = false) {
  arreterChrono();
  if (canalEcriture) {
    client.removeChannel(canalEcriture);
    canalEcriture = null;
  }
  const fenetre = document.querySelector("#boutique");
  if (fenetre.open) fenetre.close();

  const infoFermeture = document.querySelector("#info-fermeture");
  infoFermeture.hidden = !automatique;
  if (automatique && salonOuvert) {
    infoFermeture.textContent = "La discussion « " + salonOuvert.nom + " » s'est fermée après 1 minute sans message.";
  }

  salonOuvert = null;
  discussionOuverte.hidden = true;
  etatVide.hidden = false;
  indicateurEcriture.hidden = true;
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
    // En groupe on affiche la liste des membres
    statut.textContent = salon.membres.map((m) => m.profil.nom_utilisateur).join(", ");
    statut.classList.remove("en-ligne");
  }
}

// ===== Messages =====

async function chargerMessages(salonId) {
  listeMessages.textContent = "";
  messagesAffiches.clear();
  dernierJourAffiche = "";
  dernierAffiche = null;

  // Les 100 derniers messages (on les prend du plus récent puis on remet dans l'ordre)
  const { data, error } = await client
    .from("messages")
    .select("id, salon_id, auteur_id, contenu, cree_le")
    .eq("salon_id", salonId)
    .order("cree_le", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }
  // Discussion encore vide : une petite phrase pour lancer la conversation
  if (data.length === 0) {
    const vide = document.createElement("li");
    vide.className = "message-vide";
    vide.textContent = salonOuvert.est_prive
      ? "Envoyez le premier message à " + salonOuvert.nom + "."
      : "Envoyez le premier message du groupe.";
    listeMessages.append(vide);
    return;
  }

  data.reverse().forEach(afficherMessage);
  descendreEnBas();
}

function afficherMessage(message) {
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
  const auteur = cacheProfils.get(message.auteur_id) || { nom_utilisateur: "?", couleur_avatar: "#8f8998" };

  // Même auteur que le message d'avant et moins de 5 minutes d'écart : on colle les deux
  const ecart = dernierAffiche ? new Date(message.cree_le) - new Date(dernierAffiche.cree_le) : Infinity;
  if (dernierAffiche && dernierAffiche.auteur_id === message.auteur_id && ecart < 5 * 60 * 1000) {
    ligne.classList.add("suite");
  }
  dernierAffiche = message;

  ligne.dataset.date = message.cree_le;
  if (deMoi) {
    ligne.classList.add("moi");
  } else {
    remplirAvatar(modele.querySelector(".message-avatar"), auteur);
    // En groupe on écrit le nom de l'auteur au-dessus du message
    if (!salonOuvert.est_prive) {
      modele.querySelector(".message-auteur").textContent = auteur.nom_utilisateur;
    }
  }

  // textContent et pas innerHTML : un message ne peut pas injecter du HTML
  modele.querySelector(".message-contenu").textContent = message.contenu;
  const heure = modele.querySelector(".message-heure");
  heure.textContent = formaterHeure(message.cree_le);
  heure.setAttribute("datetime", message.cree_le);

  if (deMoi) {
    modele.querySelector(".message-statut").textContent = statutMessage(message.cree_le);
  }

  listeMessages.append(modele);
}

function descendreEnBas() {
  listeMessages.scrollTop = listeMessages.scrollHeight;
}

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

champMessage.addEventListener("input", () => {
  // Le compteur n'apparaît qu'en approchant de la limite des 500 caractères
  const longueur = champMessage.value.length;
  compteurCaracteres.textContent = longueur >= 400 ? longueur + " / 500" : "";
  compteurCaracteres.classList.toggle("limite", longueur >= 480);

  // La zone grandit avec le texte (jusqu'à la hauteur max du CSS)
  champMessage.style.height = "auto";
  champMessage.style.height = champMessage.scrollHeight + "px";

  signalerEcriture();
});

champMessage.addEventListener("keydown", (evenement) => {
  signalerFrappe(evenement); // points.js : garde la discussion ouverte

  // Entrée envoie le message, Maj + Entrée fait un retour à la ligne
  if (evenement.key === "Enter" && !evenement.shiftKey) {
    evenement.preventDefault();
    formMessage.requestSubmit();
  }
});

formMessage.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const contenu = champMessage.value.trim();
  if (!salonOuvert || contenu === "" || contenu.length > 500) return;

  const bouton = formMessage.querySelector("button");
  bouton.disabled = true;

  const { data, error } = await client
    .from("messages")
    .insert({ salon_id: salonOuvert.id, auteur_id: utilisateur.id, contenu })
    .select()
    .single();

  bouton.disabled = false;
  if (error) {
    console.error(error);
    alert("Le message n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.");
    return;
  }

  champMessage.value = "";
  champMessage.style.height = "auto";
  compteurCaracteres.textContent = "";
  compteurCaracteres.classList.remove("limite");

  afficherMessage(data);
  descendreEnBas();
  salonOuvert.dernier = data;
  afficherSalons();
  signalerEnvoi(); // points.js : relance le chrono et donne les points en attente
});

// ===== En train d'écrire =====

// Chaque salon ouvert a un petit canal « broadcast » (rien n'est enregistré dans la base)
function ecouterEcriture(salonId) {
  canalEcriture = client.channel("ecriture-" + salonId);
  canalEcriture.on("broadcast", { event: "ecrit" }, ({ payload }) => {
    if (payload.id === utilisateur.id) return;
    indicateurEcriture.textContent = payload.nom + " est en train d'écrire…";
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
    afficherMessage(message);
    descendreEnBas();
    if (!deMoi) {
      indicateurEcriture.hidden = true;
      if (document.visibilityState === "visible") marquerCommeLu();
    }
  } else if (!deMoi) {
    salon.nonLus++;
    const auteur = await obtenirProfil(message.auteur_id);
    if (auteur) afficherNotification(auteur, message.contenu, "conversation.html?salon=" + salon.id);
    jouerSon();
  }

  // Son aussi si la discussion est ouverte mais que l'onglet est caché
  if (!deMoi && salonOuvert && salonOuvert.id === salon.id && document.visibilityState !== "visible") {
    jouerSon();
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

document.querySelector("#bouton-nouvelle-discussion").addEventListener("click", async () => {
  formNouvelle.reset();
  zoneNomSalon.hidden = true;
  choixParticipants.textContent = "";
  afficherEtat(messageNouvelle, "");

  const contacts = (await chargerContacts()).filter((c) => c.statut === "accepte");
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

// Le champ du nom apparaît seulement si on coche plusieurs contacts
choixParticipants.addEventListener("change", () => {
  const nombre = choixParticipants.querySelectorAll("input:checked").length;
  zoneNomSalon.hidden = nombre < 2;
});

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
    return;
  }

  // Un contact = discussion privée, plusieurs = salon de groupe
  const reponse = ids.length === 1
    ? await client.rpc("ouvrir_salon_prive", { p_contact: ids[0] })
    : await client.rpc("creer_salon_groupe", { p_nom: nomSalon, p_membres: ids });

  if (reponse.error) {
    afficherEtat(messageNouvelle, reponse.error.message, "erreur");
    return;
  }

  fenetreNouvelle.close();
  await chargerSalons();
  ouvrirSalon(reponse.data);
});
