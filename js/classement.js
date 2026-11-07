/*
  Page du classement (classement.html)
  On classe nos discussions (privées et de groupe) avec les points gagnés
  Les points gagnés ne baissent jamais, le solde et les articles sont affichés en plus
  Un clic sur une discussion l'ouvre dans la page Discussions
*/

demarrerClassement();

async function demarrerClassement() {
  await pagePrete;
  if (!utilisateur) return;

  const [reponseSalons, reponsePoints, reponseAchats] = await Promise.all([
    client.from("salons").select("id, nom, est_prive, membres_salon(membre_id, profils(id, nom_utilisateur, couleur_avatar))"),
    client.from("points").select("salon_id, points_gagnes, solde"),
    client.from("achats").select("salon_id")
  ]);

  const points = reponsePoints.data || [];
  const achats = reponseAchats.data || [];

  // Une ligne par discussion, même celles à 0 point
  const lignes = (reponseSalons.data || [])
    .map((salon) => {
      const ligne = points.find((p) => p.salon_id === salon.id);
      return {
        salonId: salon.id,
        ...nomEtAvatar(salon),
        gagnes: ligne ? ligne.points_gagnes : 0,
        solde: ligne ? ligne.solde : 0,
        articles: achats.filter((a) => a.salon_id === salon.id).length
      };
    })
    .sort((a, b) => b.gagnes - a.gagnes || a.nom.localeCompare(b.nom));

  afficherPodium(lignes.filter((l) => l.gagnes > 0).slice(0, 3));
  afficherTableau(lignes);
  document.querySelector("#classement-vide").hidden = lignes.some((l) => l.gagnes > 0);
}

// En privé on montre l'autre personne, en groupe le nom du groupe
function nomEtAvatar(salon) {
  if (salon.est_prive) {
    const autre = salon.membres_salon.find((m) => m.membre_id !== utilisateur.id);
    if (autre) return { nom: autre.profils.nom_utilisateur, profil: autre.profils };
  }
  const nom = salon.nom || "Groupe";
  return { nom, profil: { id: null, nom_utilisateur: nom, couleur_avatar: "#3f2a6b" } };
}

// Lien vers la discussion avec son nom
function lienDiscussion(ligne) {
  const lien = document.createElement("a");
  lien.href = "conversation.html?salon=" + ligne.salonId;
  lien.textContent = ligne.nom;
  return lien;
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
    nom.append(lienDiscussion(ligne));

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
    const discussion = document.createElement("td");
    const cellule = document.createElement("div");
    cellule.className = "cellule-contact";
    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-petit";
    remplirAvatar(avatar, ligne.profil);
    cellule.append(avatar, lienDiscussion(ligne));
    discussion.append(cellule);

    const gagnes = document.createElement("td");
    gagnes.className = "colonne-points";
    gagnes.textContent = ligne.gagnes + " pts";

    const solde = document.createElement("td");
    solde.className = "colonne-solde";
    solde.textContent = ligne.solde + " pts";

    const articles = document.createElement("td");
    articles.textContent = ligne.articles;

    tr.append(rang, discussion, gagnes, solde, articles);
    corps.append(tr);
  });
}
