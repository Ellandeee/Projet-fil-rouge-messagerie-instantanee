/*
  Boutique de personnalisation
  On achète des articles avec les points gagnés avec un contact
  Un article acheté vaut seulement pour ce contact et seule la personne qui l'a acheté le voit
  Le nom de chaque article (id) est aussi sa classe CSS dans personnalisation.css
*/

const NOMS_CATEGORIES = {
  fond: "Fond de la discussion",
  bulle: "Forme des bulles",
  cadre: "Cadre des photos",
  police: "Police",
  couleur: "Couleur de mes bulles"
};

const fenetreBoutique = document.querySelector("#boutique");
const zoneCategories = document.querySelector("#boutique-categories");
const messageBoutique = document.querySelector("#message-boutique");

// Liste de tous les articles (chargée une seule fois)
let articles = [];

// Contact de la discussion pour laquelle la boutique est ouverte
let contactBoutique = null;

async function chargerArticles() {
  if (articles.length > 0) return articles;
  const { data, error } = await client.from("articles").select("*").order("prix");
  if (!error) articles = data;
  return articles;
}

// ===== Appliquer les articles équipés sur la discussion =====

async function appliquerPersonnalisation(contactId) {
  await chargerArticles();
  const discussion = document.querySelector("#discussion-ouverte");

  // On enlève d'abord tous les thèmes de la discussion d'avant
  for (const article of articles) {
    discussion.classList.remove(article.id);
  }

  // Pas de personnalisation dans les salons de groupe
  if (!contactId) return;

  const { data } = await client
    .from("personnalisations")
    .select("article_id")
    .eq("contact_id", contactId);

  for (const ligne of data || []) {
    discussion.classList.add(ligne.article_id);
  }
}

// ===== Ouvrir la boutique =====

async function ouvrirBoutique(contact) {
  contactBoutique = contact;
  document.querySelector("#boutique-nom-contact").textContent = contact.nom_utilisateur;
  afficherEtatBoutique("");
  await afficherBoutique();
  fenetreBoutique.showModal();
}

document.querySelector("#bouton-fermer-boutique").addEventListener("click", () => {
  fenetreBoutique.close();
});

// Recharge le solde, les achats et les articles équipés puis dessine la boutique
async function afficherBoutique() {
  await chargerArticles();
  const contactId = contactBoutique.id;

  const [reponsePoints, reponseAchats, reponseEquipes] = await Promise.all([
    client.from("points").select("solde").eq("contact_id", contactId).maybeSingle(),
    client.from("achats").select("article_id").eq("contact_id", contactId),
    client.from("personnalisations").select("article_id").eq("contact_id", contactId)
  ]);

  const solde = reponsePoints.data ? reponsePoints.data.solde : 0;
  const achetes = new Set((reponseAchats.data || []).map((ligne) => ligne.article_id));
  const equipes = new Set((reponseEquipes.data || []).map((ligne) => ligne.article_id));

  document.querySelector("#boutique-solde").textContent = solde;
  afficherSolde(solde);
  zoneCategories.textContent = "";

  // Une section par catégorie
  for (const [categorie, titre] of Object.entries(NOMS_CATEGORIES)) {
    const section = document.createElement("section");
    section.className = "boutique-categorie";
    const h3 = document.createElement("h3");
    h3.textContent = titre;
    const liste = document.createElement("ul");
    liste.className = "liste-articles";
    section.append(h3, liste);

    for (const article of articles.filter((a) => a.categorie === categorie)) {
      liste.append(creerCarteArticle(article, solde, achetes.has(article.id), equipes.has(article.id)));
    }
    zoneCategories.append(section);
  }
}

function creerCarteArticle(article, solde, achete, equipe) {
  const modele = document.querySelector("#modele-article").content.cloneNode(true);
  const carte = modele.querySelector(".article");
  const apercu = modele.querySelector(".article-apercu");
  const bouton = modele.querySelector(".article-action");

  modele.querySelector(".article-nom").textContent = article.nom;
  modele.querySelector(".article-description").textContent = article.description;

  // Aperçu : la classe de l'article sur un petit faux message (ou un avatar pour les cadres)
  apercu.classList.add(article.id);
  if (article.categorie === "cadre") {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = initiales(contactBoutique.nom_utilisateur);
    avatar.style.backgroundColor = contactBoutique.couleur_avatar;
    apercu.append(avatar);
  } else {
    const bulle = document.createElement("span");
    bulle.className = "apercu-bulle";
    bulle.textContent = "Salut !";
    apercu.append(bulle);
  }

  const prix = modele.querySelector(".article-prix");
  if (equipe) {
    carte.classList.add("equipe");
    prix.textContent = "Équipé";
    bouton.textContent = "Retirer";
    bouton.addEventListener("click", () => retirerArticle(article));
  } else if (achete) {
    prix.textContent = "Acheté";
    bouton.textContent = "Équiper";
    bouton.addEventListener("click", () => equiperArticle(article));
  } else if (solde >= article.prix) {
    prix.textContent = article.prix + " pts";
    bouton.textContent = "Acheter";
    bouton.classList.add("bouton-or");
    bouton.addEventListener("click", () => acheterArticle(article));
  } else {
    prix.textContent = article.prix + " pts (il manque " + (article.prix - solde) + ")";
    bouton.textContent = "Acheter";
    bouton.disabled = true;
  }

  return modele;
}

// ===== Actions =====

// Les vérifications (solde, prix) sont faites par la base dans acheter_article
async function acheterArticle(article) {
  const { error } = await client.rpc("acheter_article", {
    p_contact: contactBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  // Un article qu'on vient d'acheter est équipé directement
  await client.rpc("equiper_article", { p_contact: contactBoutique.id, p_article: article.id });
  afficherEtatBoutique("« " + article.nom + " » acheté et équipé !", "succes");
  await afficherBoutique();
  await appliquerPersonnalisation(contactBoutique.id);
}

async function equiperArticle(article) {
  const { error } = await client.rpc("equiper_article", {
    p_contact: contactBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  afficherEtatBoutique("« " + article.nom + " » équipé.", "succes");
  await afficherBoutique();
  await appliquerPersonnalisation(contactBoutique.id);
}

async function retirerArticle(article) {
  const { error } = await client
    .from("personnalisations")
    .delete()
    .eq("contact_id", contactBoutique.id)
    .eq("categorie", article.categorie);
  if (error) {
    afficherEtatBoutique(error.message, "erreur");
    return;
  }
  afficherEtatBoutique("« " + article.nom + " » retiré.", "succes");
  await afficherBoutique();
  await appliquerPersonnalisation(contactBoutique.id);
}

function afficherEtatBoutique(texte, type = "") {
  afficherEtat(messageBoutique, texte, type);
}
