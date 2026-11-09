/*
  Code commun aux pages où il faut être connecté
  On vérifie la session, on remplit l'en-tête, on suit qui est en ligne
  et on prévient quand un message arrive
*/

// Profil de la personne connectée (rempli au chargement)
let utilisateur = null;

// Ids des personnes en ligne en ce moment
const enLigne = new Set();

// Fonctions à appeler quand quelqu'un se connecte ou se déconnecte
const abonnesPresence = [];

// Petit cache des profils pour ne pas les redemander à chaque fois
const cacheProfils = new Map();

// Les autres fichiers attendent cette promesse avant de démarrer
const pagePrete = initialiserPage();

async function initialiserPage() {
  const { data } = await client.auth.getSession();
  if (!data.session) {
    window.location.href = "index.html";
    return null;
  }

  const { data: profil, error } = await client
    .from("profils")
    .select("id, nom_utilisateur, couleur_avatar")
    .eq("id", data.session.user.id)
    .single();

  // Pas de profil = compte supprimé ou souci, on déconnecte
  if (error || !profil) {
    await client.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  utilisateur = { ...profil, email: data.session.user.email, inscritLe: data.session.user.created_at };
  cacheProfils.set(profil.id, profil);

  remplirEnTete();
  suivrePresence();
  suivreInvitations();

  // Sur la page des discussions c'est conversation.js qui gère les nouveaux messages
  if (!document.body.classList.contains("page-conversation")) {
    ecouterNouveauxMessages();
  }

  // Si la session se termine (déconnexion dans un autre onglet par exemple)
  client.auth.onAuthStateChange((evenement) => {
    if (evenement === "SIGNED_OUT") {
      window.location.href = "index.html";
    }
  });

  return utilisateur;
}

// ===== En-tête =====

function remplirEnTete() {
  const nom = document.querySelector("#nom-utilisateur");
  const avatar = document.querySelector("#avatar-utilisateur");
  const lienProfil = document.querySelector(".entete-utilisateur");
  if (nom) nom.textContent = utilisateur.nom_utilisateur;
  if (avatar) remplirAvatar(avatar, utilisateur);
  // Texte lu par les lecteurs d'écran (sur téléphone on ne voit que l'avatar)
  if (lienProfil) lienProfil.setAttribute("aria-label", "Mon profil (" + utilisateur.nom_utilisateur + ")");
}

// Petit nombre à côté de « Contacts » quand on a des invitations à traiter
async function mettreAJourBadgeInvitations() {
  const badge = document.querySelector("#badge-invitations");
  if (!badge) return;
  const { count } = await client
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", utilisateur.id)
    .eq("statut", "en_attente");
  badge.hidden = !count;
  badge.textContent = count || "";
}

// Le nombre se met à jour tout seul quand une invitation arrive ou part
function suivreInvitations() {
  mettreAJourBadgeInvitations();
  client
    .channel("badge-invitations")
    .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, mettreAJourBadgeInvitations)
    .subscribe();
}

// ===== Avatars =====

// « lucas_b » donne « LU », « Équipe 8WEB101 » donne « É8 »
function initiales(nom) {
  const mots = nom.replace(/[_-]/g, " ").trim().split(/\s+/);
  if (mots.length > 1) {
    return (mots[0][0] + mots[1][0]).toUpperCase();
  }
  return nom.slice(0, 2).toUpperCase();
}

function remplirAvatar(element, profil) {
  element.textContent = initiales(profil.nom_utilisateur);
  element.style.backgroundColor = profil.couleur_avatar;
  element.classList.toggle("en-ligne", enLigne.has(profil.id));
}

async function obtenirProfil(id) {
  if (cacheProfils.has(id)) {
    return cacheProfils.get(id);
  }
  const { data } = await client
    .from("profils")
    .select("id, nom_utilisateur, couleur_avatar")
    .eq("id", id)
    .single();
  if (data) cacheProfils.set(id, data);
  return data;
}

// ===== Contacts =====

// Toutes nos relations (invitations et contacts) avec le profil de l'autre personne
// Utilisé par les pages Discussions, Contacts et Classement
async function chargerContacts() {
  const { data, error } = await client
    .from("contacts")
    .select(`id, statut, demandeur_id, destinataire_id,
      demandeur:profils!contacts_demandeur_id_fkey(id, nom_utilisateur, couleur_avatar),
      destinataire:profils!contacts_destinataire_id_fkey(id, nom_utilisateur, couleur_avatar)`);

  if (error) {
    console.error(error);
    return [];
  }

  // Pour chaque relation on garde surtout « l'autre » personne
  return data.map((lien) => {
    const jeSuisDemandeur = lien.demandeur_id === utilisateur.id;
    const autre = jeSuisDemandeur ? lien.destinataire : lien.demandeur;
    cacheProfils.set(autre.id, autre);
    return {
      id: lien.id,
      statut: lien.statut,
      envoyeeParMoi: jeSuisDemandeur,
      autre
    };
  });
}

// ===== Dates =====

function formaterHeure(date) {
  return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// « Aujourd'hui », « Hier » ou la date complète
function formaterJour(date) {
  const jour = new Date(date);
  const aujourdhui = new Date();
  const hier = new Date();
  hier.setDate(aujourdhui.getDate() - 1);

  if (jour.toDateString() === aujourdhui.toDateString()) return "Aujourd'hui";
  if (jour.toDateString() === hier.toDateString()) return "Hier";
  return jour.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Heure si c'est aujourd'hui, sinon la date courte (pour la liste des discussions)
function formaterDateCourte(date) {
  const jour = new Date(date);
  if (jour.toDateString() === new Date().toDateString()) {
    return formaterHeure(date);
  }
  return jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// ===== Qui est en ligne =====

// On utilise la « présence » de Supabase Realtime : chaque onglet ouvert
// s'annonce sur le même canal et tout le monde reçoit la liste
function suivrePresence() {
  const canal = client.channel("en-ligne", {
    config: { presence: { key: utilisateur.id } }
  });

  canal.on("presence", { event: "sync" }, () => {
    enLigne.clear();
    for (const id of Object.keys(canal.presenceState())) {
      enLigne.add(id);
    }
    abonnesPresence.forEach((fonction) => fonction());
  });

  canal.subscribe(async (statut) => {
    if (statut === "SUBSCRIBED") {
      await canal.track({ en_ligne_depuis: new Date().toISOString() });
    }
  });
}

function quandPresenceChange(fonction) {
  abonnesPresence.push(fonction);
}

// ===== Notifications =====

// Petit « bip » fait avec le navigateur, pas besoin de fichier son
function jouerSon() {
  try {
    const audio = new AudioContext();
    const oscillateur = audio.createOscillator();
    const volume = audio.createGain();
    oscillateur.frequency.value = 660;
    volume.gain.setValueAtTime(0.15, audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    oscillateur.connect(volume);
    volume.connect(audio.destination);
    oscillateur.start();
    oscillateur.stop(audio.currentTime + 0.3);
  } catch (erreur) {
    // Le navigateur bloque le son tant qu'on n'a pas cliqué sur la page, pas grave
  }
}

// Les notifications s'empilent en haut à droite au lieu de se cacher les unes les autres
function pileNotifications() {
  let pile = document.querySelector(".pile-notifications");
  if (!pile) {
    pile = document.createElement("div");
    pile.className = "pile-notifications";
    document.body.append(pile);
  }
  return pile;
}

// Carte qui disparaît après 6 secondes
// action = un lien (autre page) ou une fonction (page des discussions, sans recharger)
function afficherNotification(profil, texte, action) {
  const pile = pileNotifications();
  // Pas plus de 3 à la fois, la plus ancienne part
  if (pile.children.length >= 3) pile.firstElementChild.remove();

  const carte = document.createElement("div");
  carte.className = "notification";
  carte.setAttribute("role", "status");

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  remplirAvatar(avatar, profil);

  const textes = document.createElement("div");
  textes.className = "notification-textes";
  const titre = document.createElement("p");
  titre.className = "notification-titre";
  titre.textContent = "Nouveau message de " + profil.nom_utilisateur;
  const apercu = document.createElement("p");
  apercu.textContent = texte.length > 80 ? texte.slice(0, 80) + "…" : texte;
  textes.append(titre, apercu);

  const fermer = document.createElement("button");
  fermer.type = "button";
  fermer.className = "bouton-icone";
  fermer.setAttribute("aria-label", "Fermer la notification");
  fermer.textContent = "✕";
  fermer.addEventListener("click", (evenement) => {
    evenement.stopPropagation();
    carte.remove();
  });

  carte.append(avatar, textes, fermer);
  if (action) {
    carte.classList.add("cliquable");
    carte.addEventListener("click", () => {
      carte.remove();
      if (typeof action === "function") action();
      else window.location.href = action;
    });
  }

  pile.append(carte);
  setTimeout(() => carte.remove(), 6000);
}

// Sur les autres pages on prévient quand un message arrive
function ecouterNouveauxMessages() {
  client
    .channel("notifications-messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (changement) => {
      const message = changement.new;
      if (message.auteur_id === utilisateur.id) return;
      const auteur = await obtenirProfil(message.auteur_id);
      if (!auteur) return;
      afficherNotification(auteur, message.contenu, "conversation.html?salon=" + message.salon_id);
      jouerSon();
    })
    .subscribe();
}
