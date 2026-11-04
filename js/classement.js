/*
  Page du classement (classement.html)
  On classe nos contacts avec les points gagnés (ils ne baissent jamais)
  Le solde et le nombre d'articles achetés sont affichés en plus
*/

demarrerClassement();

async function demarrerClassement() {
  await pagePrete;
  if (!utilisateur) return;

  const [contacts, reponsePoints, reponseAchats] = await Promise.all([
    chargerContacts(),
    client.from("points").select("contact_id, points_gagnes, solde"),
    client.from("achats").select("contact_id")
  ]);

  const points = reponsePoints.data || [];
  const achats = reponseAchats.data || [];

  // Une ligne par contact accepté, même ceux à 0 point
  const lignes = contacts
    .filter((c) => c.statut === "accepte")
    .map((c) => {
      const ligne = points.find((p) => p.contact_id === c.autre.id);
      return {
        profil: c.autre,
        gagnes: ligne ? ligne.points_gagnes : 0,
        solde: ligne ? ligne.solde : 0,
        articles: achats.filter((a) => a.contact_id === c.autre.id).length
      };
    })
    .sort((a, b) => b.gagnes - a.gagnes || a.profil.nom_utilisateur.localeCompare(b.profil.nom_utilisateur));

  afficherPodium(lignes.filter((l) => l.gagnes > 0).slice(0, 3));
  afficherTableau(lignes);
  document.querySelector("#classement-vide").hidden = lignes.some((l) => l.gagnes > 0);
}

function afficherPodium(premiers) {
  const podium = document.querySelector("#podium");
  podium.textContent = "";

  premiers.forEach((ligne, index) => {
    const li = document.createElement("li");
    li.className = "podium-place";

    const rang = document.createElement("span");
    rang.className = "podium-rang";
    rang.textContent = index + 1;

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    remplirAvatar(avatar, ligne.profil);

    const nom = document.createElement("strong");
    nom.className = "podium-nom";
    nom.textContent = ligne.profil.nom_utilisateur;

    const pts = document.createElement("span");
    pts.className = "points";
    pts.textContent = ligne.gagnes + " pts";

    li.append(rang, avatar, nom, pts);
    podium.append(li);
  });
}

function afficherTableau(lignes) {
  const corps = document.querySelector("#corps-classement");
  corps.textContent = "";

  lignes.forEach((ligne, index) => {
    const tr = document.createElement("tr");

    const rang = document.createElement("td");
    rang.textContent = index + 1;

    // Avatar et nom dans la même cellule
    const contact = document.createElement("td");
    const cellule = document.createElement("div");
    cellule.className = "cellule-contact";
    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-petit";
    remplirAvatar(avatar, ligne.profil);
    const nom = document.createElement("span");
    nom.textContent = ligne.profil.nom_utilisateur;
    cellule.append(avatar, nom);
    contact.append(cellule);

    const gagnes = document.createElement("td");
    gagnes.className = "colonne-points";
    gagnes.textContent = ligne.gagnes + " pts";

    const solde = document.createElement("td");
    solde.className = "colonne-solde";
    solde.textContent = ligne.solde + " pts";

    const articles = document.createElement("td");
    articles.textContent = ligne.articles + (ligne.articles > 1 ? " articles" : " article");

    tr.append(rang, contact, gagnes, solde, articles);
    corps.append(tr);
  });
}
