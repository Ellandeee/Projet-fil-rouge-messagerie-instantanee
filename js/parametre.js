/*
  Page Mon profil (parametre.html)
  On change son nom, la couleur de son avatar et son mot de passe
  On peut aussi se déconnecter ou supprimer son compte
*/

// Le lien « mot de passe oublié » arrive avec type=recovery dans l'adresse
// On le regarde tout de suite avant que Supabase nettoie l'adresse
const arriveeRecuperation = window.location.hash.includes("type=recovery");

const formProfil = document.querySelector("#form-profil");
const champNom = document.querySelector("#profil-nom");
const champCouleur = document.querySelector("#profil-couleur");
const apercuAvatar = document.querySelector("#apercu-avatar");
const formMdp = document.querySelector("#form-mdp");
const formSuppression = document.querySelector("#form-suppression");

client.auth.onAuthStateChange((evenement) => {
  if (evenement === "PASSWORD_RECOVERY") montrerBandeauRecuperation();
});

demarrerParametres();

async function demarrerParametres() {
  await pagePrete;
  if (!utilisateur) return;

  champNom.value = utilisateur.nom_utilisateur;
  champCouleur.value = utilisateur.couleur_avatar;
  document.querySelector("#apercu-email").textContent = utilisateur.email;
  mettreAJourApercu();
  afficherStatistiques();

  if (arriveeRecuperation) montrerBandeauRecuperation();
}

// Date d'inscription, grains gagnés dans toutes les discussions et articles achetés
async function afficherStatistiques() {
  document.querySelector("#stat-inscription").textContent = new Date(utilisateur.inscritLe)
    .toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

  const [reponsePoints, reponseAchats] = await Promise.all([
    client.from("points").select("points_gagnes"),
    client.from("achats").select("article_id", { count: "exact", head: true })
  ]);
  const grains = (reponsePoints.data || []).reduce((total, ligne) => total + ligne.points_gagnes, 0);
  document.querySelector("#stat-grains").textContent = grains;
  document.querySelector("#stat-articles").textContent = reponseAchats.count || 0;
}

function montrerBandeauRecuperation() {
  document.querySelector("#bandeau-recuperation").hidden = false;
  document.querySelector("#nouveau-mdp").focus();
}

// L'aperçu change pendant qu'on tape ou qu'on choisit la couleur
// La pastille du nuancier qui correspond à la couleur est cochée
function mettreAJourApercu() {
  for (const choix of document.querySelectorAll("input[name=couleur-choix]")) {
    choix.checked = choix.value.toLowerCase() === champCouleur.value.toLowerCase();
  }
  const profil = {
    id: utilisateur.id,
    nom_utilisateur: champNom.value.trim() || utilisateur.nom_utilisateur,
    couleur_avatar: champCouleur.value
  };
  remplirAvatar(apercuAvatar, profil);
  document.querySelector("#apercu-nom").textContent = profil.nom_utilisateur;
}

champNom.addEventListener("input", mettreAJourApercu);
champCouleur.addEventListener("input", mettreAJourApercu);

// Un clic sur une pastille du nuancier change la couleur
for (const choix of document.querySelectorAll("input[name=couleur-choix]")) {
  choix.addEventListener("change", () => {
    champCouleur.value = choix.value;
    mettreAJourApercu();
  });
}

// ===== Profil =====

formProfil.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const message = document.querySelector("#message-profil");
  const nom = champNom.value.trim();
  const couleur = champCouleur.value;

  if (!/^[A-Za-z0-9_-]{3,20}$/.test(nom)) {
    afficherEtat(message, "Le nom d'utilisateur doit faire 3 à 20 caractères (lettres, chiffres, _ ou -).", "erreur");
    return;
  }

  // Si le nom change il doit être libre
  if (nom.toLowerCase() !== utilisateur.nom_utilisateur.toLowerCase()) {
    const { data: libre } = await client.rpc("nom_disponible", { p_nom: nom });
    if (libre === false) {
      afficherEtat(message, "Ce nom d'utilisateur est déjà pris.", "erreur");
      return;
    }
  }

  const { error } = await client
    .from("profils")
    .update({ nom_utilisateur: nom, couleur_avatar: couleur })
    .eq("id", utilisateur.id);

  if (error) {
    afficherEtat(message, "Le profil n'a pas pu être enregistré : " + error.message, "erreur");
    return;
  }

  utilisateur.nom_utilisateur = nom;
  utilisateur.couleur_avatar = couleur;
  remplirEnTete();
  cacheProfils.set(utilisateur.id, { id: utilisateur.id, nom_utilisateur: nom, couleur_avatar: couleur });
  afficherEtat(message, "");
  afficherToast("Profil enregistré.", "succes");
});

// ===== Mot de passe =====

formMdp.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const message = document.querySelector("#message-mdp");
  const mdp = document.querySelector("#nouveau-mdp").value;
  const confirmation = document.querySelector("#nouveau-mdp-confirmation").value;

  if (mdp.length < 6) {
    afficherEtat(message, "Le mot de passe doit faire au moins 6 caractères.", "erreur");
    return;
  }
  if (mdp !== confirmation) {
    afficherEtat(message, "Les deux mots de passe ne sont pas identiques.", "erreur");
    return;
  }

  const { error } = await client.auth.updateUser({ password: mdp });
  if (error) {
    afficherEtat(message, "Le mot de passe n'a pas pu être changé : " + error.message, "erreur");
    return;
  }

  formMdp.reset();
  document.querySelector("#bandeau-recuperation").hidden = true;
  afficherEtat(message, "");
  afficherToast("Mot de passe changé.", "succes");
});

// ===== Déconnexion =====

document.querySelector("#bouton-deconnexion").addEventListener("click", async () => {
  await client.auth.signOut();
  window.location.href = "index.html";
});

// ===== Suppression du compte =====

formSuppression.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const message = document.querySelector("#message-suppression");

  // Il faut écrire SUPPRIMER pour éviter une suppression par erreur
  if (document.querySelector("#confirmation-suppression").value.trim() !== "SUPPRIMER") {
    afficherEtat(message, "Écrivez SUPPRIMER en majuscules pour confirmer.", "erreur");
    return;
  }

  const { error } = await client.rpc("supprimer_mon_compte");
  if (error) {
    afficherEtat(message, "Le compte n'a pas pu être supprimé : " + error.message, "erreur");
    return;
  }

  // Le compte n'existe plus, on vide la session et on retourne à l'accueil
  await client.auth.signOut();
  localStorage.removeItem("se-souvenir");
  window.location.href = "index.html";
});
