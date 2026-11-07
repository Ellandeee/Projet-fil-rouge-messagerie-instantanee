/*
  Page des contacts (contact.html)
  - chercher quelqu'un par son nom et l'inviter
  - accepter ou refuser les invitations reçues
  - annuler les invitations envoyées
  - ouvrir une discussion avec un contact ou le supprimer
*/

const formRecherche = document.querySelector("#form-recherche-contact");
const champRecherche = document.querySelector("#recherche-contact");
const messageRecherche = document.querySelector("#message-recherche");
const resultatsRecherche = document.querySelector("#resultats-recherche");

// Toutes nos relations (rechargées à chaque changement)
let relations = [];

demarrerContacts();

async function demarrerContacts() {
  await pagePrete;
  if (!utilisateur) return;

  await afficherRelations();

  // Une invitation reçue ou acceptée apparaît sans recharger la page
  client
    .channel("contacts")
    .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, afficherRelations)
    .subscribe();

  // Mise à jour des « En ligne » quand quelqu'un arrive ou part
  quandPresenceChange(dessinerRelations);
}

// ===== Les trois listes =====

async function afficherRelations() {
  relations = await chargerContacts();
  dessinerRelations();
}

function dessinerRelations() {
  const recues = relations.filter((r) => r.statut === "en_attente" && !r.envoyeeParMoi);
  const envoyees = relations.filter((r) => r.statut === "en_attente" && r.envoyeeParMoi);
  const contacts = relations
    .filter((r) => r.statut === "accepte")
    .sort((a, b) => a.autre.nom_utilisateur.localeCompare(b.autre.nom_utilisateur));

  remplirListe("#liste-invitations-recues", recues, (relation) => [
    creerBouton("Accepter", "bouton bouton-petit bouton-plein", () => accepter(relation)),
    creerBouton("Refuser", "bouton bouton-petit bouton-secondaire", () => supprimerRelation(relation))
  ], "Veut vous ajouter");

  remplirListe("#liste-invitations-envoyees", envoyees, (relation) => [
    creerBouton("Annuler", "bouton bouton-petit bouton-secondaire", () => supprimerRelation(relation))
  ], "Invitation envoyée");

  remplirListe("#liste-contacts", contacts, (relation) => [
    creerBouton("Discuter", "bouton bouton-petit", () => discuter(relation.autre)),
    creerBouton("Supprimer", "bouton bouton-petit bouton-supprimer-contact", () => supprimerContact(relation))
  ], null);

  // Les blocs d'invitations n'apparaissent que s'il y en a
  document.querySelector("#bloc-recues").hidden = recues.length === 0;
  document.querySelector("#bloc-envoyees").hidden = envoyees.length === 0;
  document.querySelector("#nombre-contacts").textContent = contacts.length > 0 ? "(" + contacts.length + ")" : "";
}

// detailFixe = texte sous le nom, sinon on affiche En ligne / Hors ligne
function remplirListe(selecteur, liste, creerActions, detailFixe) {
  const ul = document.querySelector(selecteur);
  ul.textContent = "";
  for (const relation of liste) {
    const detail = detailFixe || (enLigne.has(relation.autre.id) ? "En ligne" : "Hors ligne");
    const ligne = creerLigne(relation.autre, detail);
    if (!detailFixe && enLigne.has(relation.autre.id)) {
      ligne.querySelector(".ligne-contact-detail").classList.add("en-ligne");
    }
    ligne.querySelector(".ligne-contact-actions").append(...creerActions(relation));
    ul.append(ligne);
  }
}

function creerLigne(profil, detail) {
  const modele = document.querySelector("#modele-contact").content.cloneNode(true);
  remplirAvatar(modele.querySelector(".avatar"), profil);
  modele.querySelector(".ligne-contact-nom").textContent = profil.nom_utilisateur;
  modele.querySelector(".ligne-contact-detail").textContent = detail;
  return modele;
}

function creerBouton(texte, classes, action) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = classes;
  bouton.textContent = texte;
  bouton.addEventListener("click", action);
  return bouton;
}

// ===== Recherche =====

// La recherche se lance pendant la frappe, 300 ms après la dernière touche
// (on attend un peu pour ne pas interroger la base à chaque lettre)
let minuterieRecherche = null;

champRecherche.addEventListener("input", () => {
  clearTimeout(minuterieRecherche);
  minuterieRecherche = setTimeout(rechercher, 300);
});

formRecherche.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  clearTimeout(minuterieRecherche);
  rechercher();
});

async function rechercher() {
  const texte = champRecherche.value.trim();
  resultatsRecherche.textContent = "";

  // Moins de 2 lettres : on n'affiche rien, ce n'est pas une erreur
  if (texte.length < 2) {
    afficherEtat(messageRecherche, "");
    return;
  }

  // ilike = recherche sans tenir compte des majuscules, % = n'importe quoi avant ou après
  const { data, error } = await client
    .from("profils")
    .select("id, nom_utilisateur, couleur_avatar")
    .ilike("nom_utilisateur", "%" + texte + "%")
    .neq("id", utilisateur.id)
    .order("nom_utilisateur")
    .limit(10);

  if (error) {
    afficherEtat(messageRecherche, "La recherche n'a pas marché : " + error.message, "erreur");
    return;
  }
  if (data.length === 0) {
    afficherEtat(messageRecherche, "Aucun utilisateur ne s'appelle « " + texte + " ».");
    return;
  }
  afficherEtat(messageRecherche, "");

  for (const profil of data) {
    const relation = relations.find((r) => r.autre.id === profil.id);
    let detail = "";
    if (relation && relation.statut === "accepte") detail = "Déjà dans vos contacts";
    else if (relation && relation.envoyeeParMoi) detail = "Invitation envoyée";
    else if (relation) detail = "Vous a envoyé une invitation";

    const ligne = creerLigne(profil, detail);
    if (!relation) {
      ligne.querySelector(".ligne-contact-actions").append(
        creerBouton("Inviter", "bouton bouton-petit bouton-plein", (evenement) => inviter(profil, evenement.target))
      );
    }
    resultatsRecherche.append(ligne);
  }
}

// ===== Actions =====

async function inviter(profil, bouton) {
  bouton.disabled = true;
  const { error } = await client
    .from("contacts")
    .insert({ demandeur_id: utilisateur.id, destinataire_id: profil.id });

  if (error) {
    bouton.disabled = false;
    afficherEtat(messageRecherche, "L'invitation n'a pas pu être envoyée : " + error.message, "erreur");
    return;
  }
  bouton.textContent = "Invitation envoyée";
  afficherEtat(messageRecherche, "Invitation envoyée à " + profil.nom_utilisateur + ".", "succes");
  await afficherRelations();
}

async function accepter(relation) {
  const { error } = await client.from("contacts").update({ statut: "accepte" }).eq("id", relation.id);
  if (error) {
    alert("Impossible d'accepter l'invitation : " + error.message);
    return;
  }
  await afficherRelations();
}

// Refuser une invitation reçue ou annuler une invitation envoyée
async function supprimerRelation(relation) {
  const { error } = await client.from("contacts").delete().eq("id", relation.id);
  if (error) {
    alert("L'action n'a pas marché : " + error.message);
    return;
  }
  await afficherRelations();
}

async function supprimerContact(relation) {
  const ok = confirm("Supprimer " + relation.autre.nom_utilisateur + " de vos contacts ? Vos anciens messages restent visibles.");
  if (ok) await supprimerRelation(relation);
}

// Ouvre (ou crée) la discussion privée puis va sur la page des discussions
async function discuter(profil) {
  const { data, error } = await client.rpc("ouvrir_salon_prive", { p_contact: profil.id });
  if (error) {
    alert("Impossible d'ouvrir la discussion : " + error.message);
    return;
  }
  window.location.href = "conversation.html?salon=" + data;
}
