/*
  Boutique de personnalisation
  On achète des articles avec les points gagnés dans une discussion (privée ou de groupe)
  Un article acheté vaut seulement pour cette discussion et seule la personne qui l'a acheté le voit
  Le nom de chaque article (id) est aussi sa classe CSS dans personnalisation.css
*/

const NOMS_CATEGORIES = {
  fond: "Fonds",
  bulle: "Bulles",
  cadre: "Cadres",
  police: "Polices",
  couleur: "Couleurs"
};

const fenetreBoutique = document.querySelector("#boutique");
const zoneOnglets = document.querySelector("#boutique-onglets");
const listeArticles = document.querySelector("#boutique-articles");
const messageBoutique = document.querySelector("#message-boutique");

// Liste de tous les articles (chargée une seule fois)
let articles = [];

// Discussion pour laquelle la boutique est ouverte et onglet choisi
let salonBoutique = null;
let categorieChoisie = "fond";

// Ce qu'on sait de la discussion ouverte (rechargé à chaque achat)
let etatBoutique = { solde: 0, achetes: new Set(), equipes: new Set() };

async function chargerArticles() {
  if (articles.length > 0) return articles;
  const { data, error } = await client.from("articles").select("*").order("prix");
  if (!error) articles = data;
  return articles;
}

// ===== Appliquer les articles équipés sur la discussion =====

async function appliquerPersonnalisation(salonId) {
  await chargerArticles();
  const discussion = document.querySelector("#discussion-ouverte");

  // On enlève d'abord tous les thèmes de la discussion d'avant
  for (const article of articles) {
    discussion.classList.remove(article.id);
  }

  const { data } = await client
    .from("personnalisations")
    .select("article_id")
    .eq("salon_id", salonId);

  for (const ligne of data || []) {
    discussion.classList.add(ligne.article_id);
  }
}

// ===== Ouvrir la boutique =====

// salon = { id, nom, profil } avec profil l'avatar affiché pour la discussion
async function ouvrirBoutique(salon) {
  salonBoutique = salon;
  document.querySelector("#boutique-nom-contact").textContent = salon.nom;
  afficherEtatBoutique("");
  await chargerEtatBoutique();
  dessinerOnglets();
  dessinerArticles();
  fenetreBoutique.showModal();
}

document.querySelector("#bouton-fermer-boutique").addEventListener("click", () => {
  fenetreBoutique.close();
});

// Solde, articles achetés et articles équipés pour la discussion
async function chargerEtatBoutique() {
  await chargerArticles();
  const salonId = salonBoutique.id;

  const [reponsePoints, reponseAchats, reponseEquipes] = await Promise.all([
    client.from("points").select("solde").eq("salon_id", salonId).maybeSingle(),
    client.from("achats").select("article_id").eq("salon_id", salonId),
    client.from("personnalisations").select("article_id").eq("salon_id", salonId)
  ]);

  etatBoutique = {
    solde: reponsePoints.data ? reponsePoints.data.solde : 0,
    achetes: new Set((reponseAchats.data || []).map((ligne) => ligne.article_id)),
    equipes: new Set((reponseEquipes.data || []).map((ligne) => ligne.article_id))
  };

  document.querySelector("#boutique-solde").textContent = etatBoutique.solde;
  afficherSolde(etatBoutique.solde); // met aussi à jour le bouton dans la discussion
}

// ===== Affichage =====

function dessinerOnglets() {
  zoneOnglets.textContent = "";
  for (const [categorie, titre] of Object.entries(NOMS_CATEGORIES)) {
    const onglet = document.createElement("button");
    onglet.type = "button";
    onglet.className = "onglet-boutique";
    onglet.textContent = titre;
    onglet.setAttribute("aria-pressed", categorie === categorieChoisie);
    onglet.addEventListener("click", () => {
      categorieChoisie = categorie;
      dessinerOnglets();
      dessinerArticles();
    });
    zoneOnglets.append(onglet);
  }
}

function dessinerArticles() {
  listeArticles.textContent = "";
  for (const article of articles.filter((a) => a.categorie === categorieChoisie)) {
    listeArticles.append(creerCarteArticle(article));
  }
}

function creerCarteArticle(article) {
  const modele = document.querySelector("#modele-article").content.cloneNode(true);
  const carte = modele.querySelector(".article");
  const apercu = modele.querySelector(".article-apercu");
  const bouton = modele.querySelector(".article-action");
  const prix = modele.querySelector(".article-prix");
  const achete = etatBoutique.achetes.has(article.id);
  const equipe = etatBoutique.equipes.has(article.id);

  modele.querySelector(".article-nom").textContent = article.nom;
  modele.querySelector(".article-description").textContent = article.description;

  // Aperçu : la classe de l'article sur un petit faux message (ou un avatar pour les cadres)
  apercu.classList.add(article.id);
  if (article.categorie === "cadre") {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    remplirAvatar(avatar, salonBoutique.profil);
    apercu.append(avatar);
  } else {
    const bulle = document.createElement("span");
    bulle.className = "apercu-bulle";
    bulle.textContent = "Salut !";
    apercu.append(bulle);
  }

  if (equipe) {
    carte.classList.add("equipe");
    prix.textContent = "Équipé";
    bouton.textContent = "Retirer";
    bouton.classList.add("bouton-secondaire");
    bouton.addEventListener("click", () => retirerArticle(article));
  } else if (achete) {
    prix.textContent = "Acheté";
    bouton.textContent = "Équiper";
    bouton.addEventListener("click", () => equiperArticle(article));
  } else if (etatBoutique.solde >= article.prix) {
    prix.textContent = article.prix + " grains";
    bouton.textContent = "Acheter";
    bouton.classList.add("bouton-or");
    bouton.addEventListener("click", () => acheterArticle(article));
  } else {
    prix.textContent = article.prix + " grains";
    bouton.textContent = "Encore " + (article.prix - etatBoutique.solde) + " grains";
    bouton.disabled = true;
  }

  return modele;
}

// ===== Actions =====

// Après chaque action on recharge l'état puis on redessine
async function apresAction(texte) {
  afficherEtatBoutique(texte, "succes");
  await chargerEtatBoutique();
  dessinerArticles();
  await appliquerPersonnalisation(salonBoutique.id);
}

// Les vérifications (solde, prix) sont faites par la base dans acheter_article
async function acheterArticle(article) {
  const { error } = await client.rpc("acheter_article", {
    p_salon: salonBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  // Un article qu'on vient d'acheter est équipé directement
  await client.rpc("equiper_article", { p_salon: salonBoutique.id, p_article: article.id });
  await apresAction(article.nom + " acheté et équipé.");
}

async function equiperArticle(article) {
  const { error } = await client.rpc("equiper_article", {
    p_salon: salonBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  await apresAction(article.nom + " équipé.");
}

async function retirerArticle(article) {
  const { error } = await client
    .from("personnalisations")
    .delete()
    .eq("salon_id", salonBoutique.id)
    .eq("categorie", article.categorie);
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  await apresAction(article.nom + " retiré.");
}

function afficherEtatBoutique(texte, type = "") {
  afficherEtat(messageBoutique, texte, type);
}
