/*
  Boutique de personnalisation
  Un article acheté vaut pour une seule discussion et seule la personne qui l'a acheté le voit
  L'id de chaque article est aussi sa classe CSS dans personnalisation.css
  La vitrine en haut montre l'article qu'on essaie avant de l'acheter
*/

const NOMS_CATEGORIES = {
  fond: "Fonds",
  bulle: "Bulles",
  cadre: "Cadres",
  police: "Polices",
  couleur: "Couleurs",
  effet: "Effets",
  son: "Sons"
};

const fenetreBoutique = document.querySelector("#boutique");
const zoneOnglets = document.querySelector("#boutique-onglets");
const listeArticles = document.querySelector("#boutique-articles");
const vitrine = document.querySelector("#boutique-vitrine");
const legendeVitrine = document.querySelector("#vitrine-legende");

// Liste de tous les articles (chargée une seule fois)
let articles = [];

// Discussion pour laquelle la boutique est ouverte et onglet choisi
let salonBoutique = null;
let categorieChoisie = "fond";

// Ce qu'on sait de la discussion ouverte (rechargé à chaque achat)
let etatBoutique = { solde: 0, achetes: new Set(), equipes: new Set() };

async function chargerArticles() {
  if (articles.length > 0) return articles;
  const { data, error } = await client.from("articles").select("*").order("ordre");
  if (!error) articles = data;
  return articles;
}

// Met les classes des articles sur un élément (discussion, vitrine ou carte)
function mettreClassesArticles(element, ids) {
  for (const article of articles) {
    element.classList.remove(article.id);
  }
  for (const id of ids) {
    element.classList.add(id);
    chargerPolice(id); // effets.js : ne fait rien si ce n'est pas une police
  }
  preparerConteneur(element);
}

// ===== Appliquer les articles équipés sur la discussion =====

// Dernière discussion demandée : si on change vite de discussion, l'ancienne réponse est ignorée
let salonApplique = null;

async function appliquerPersonnalisation(salonId) {
  salonApplique = salonId;
  await chargerArticles();
  const { data } = await client
    .from("personnalisations")
    .select("article_id")
    .eq("salon_id", salonId);
  if (salonApplique !== salonId) return;

  const ids = (data || []).map((ligne) => ligne.article_id);
  mettreClassesArticles(document.querySelector("#discussion-ouverte"), ids);
}

// ===== Ouvrir la boutique =====

// salon = { id, nom, profil } avec profil l'avatar affiché pour la discussion
async function ouvrirBoutique(salon) {
  salonBoutique = salon;
  mettreChronoEnPause(); // points.js
  document.querySelector("#boutique-nom-contact").textContent = salon.nom;
  await chargerEtatBoutique();
  remplirVitrine();
  dessinerVitrine(null);
  dessinerOnglets();
  dessinerArticles();
  fenetreBoutique.showModal();
}

document.querySelector("#bouton-fermer-boutique").addEventListener("click", () => {
  fenetreBoutique.close();
  reprendreChrono(); // points.js
});

// Fermée avec Échap : le chrono repart aussi (reprendreChrono ne fait rien s'il tourne déjà)
fenetreBoutique.addEventListener("close", reprendreChrono);

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
  afficherSolde(etatBoutique.solde, salonBoutique.id); // met aussi à jour le bouton dans la discussion
}

// ===== Mini discussion (vitrine et aperçu des cartes) =====

// Un faux message avec la même structure que les vrais pour que le CSS des articles marche
function creerMiniMessage(texte, deMoi, profil) {
  const ligne = document.createElement("li");
  ligne.className = deMoi ? "message moi" : "message";
  if (deMoi) ligne.dataset.humeur = humeurMessage(texte); // pour voir l'article Humeur

  const avatar = document.createElement("span");
  avatar.className = "avatar message-avatar";
  if (!deMoi) remplirAvatar(avatar, profil);

  const bulle = document.createElement("div");
  bulle.className = "bulle";
  const contenu = document.createElement("p");
  contenu.className = "message-contenu";
  contenu.textContent = texte;
  const infos = document.createElement("p");
  infos.className = "message-infos";
  infos.textContent = deMoi ? "14:32 Lu" : "14:31";
  bulle.append(contenu, infos);

  ligne.append(avatar, bulle);
  return ligne;
}

// La vitrine montre trois messages de la discussion
function remplirVitrine() {
  const liste = vitrine.querySelector(".liste-messages");
  liste.textContent = "";
  liste.append(
    creerMiniMessage("Tu as vu ma nouvelle déco ?", false, salonBoutique.profil),
    creerMiniMessage("Oui, ça change tout !", true),
    creerMiniMessage("On se retrouve à la pause ?", true)
  );
}

// articleEssaye = null pour voir la discussion telle qu'elle est maintenant
function dessinerVitrine(articleEssaye) {
  let ids = [...etatBoutique.equipes];
  if (articleEssaye) {
    // L'article essayé remplace celui de la même catégorie
    const memeCategorie = articles.filter((a) => a.categorie === articleEssaye.categorie).map((a) => a.id);
    ids = ids.filter((id) => !memeCategorie.includes(id)).concat(articleEssaye.id);
    legendeVitrine.textContent = "Essai : " + articleEssaye.nom;
  } else {
    legendeVitrine.textContent = "Votre discussion en ce moment";
  }
  mettreClassesArticles(vitrine, ids);
  vitrine.style.setProperty("--progression", "0.55"); // pour la dune et le cadran
}

// Rejoue l'arrivée des messages de la vitrine pour voir les articles qui bougent
function rejouerVitrine(article) {
  const messages = vitrine.querySelectorAll(".message");
  messages.forEach((ligne) => {
    ligne.classList.remove("arrivee");
    void ligne.offsetWidth; // force le navigateur à repartir de zéro
    ligne.classList.add("arrivee");
  });
  const dernier = messages[messages.length - 1];
  if (article.id === "police-machine") {
    ecrireLettreParLettre(dernier.querySelector(".message-contenu"), "On se retrouve à la pause ?");
  }
  if (article.categorie === "effet") {
    jouerEffetEnvoi(dernier, vitrine);
  }
}

function essayerArticle(article) {
  if (article.categorie === "son") {
    jouerSonArticle(article.id);
    legendeVitrine.textContent = "Écoute : " + article.nom;
    return;
  }
  dessinerVitrine(article);
  rejouerVitrine(article);
  // Sur un petit écran la vitrine peut être plus haut, on la ramène en vue
  vitrine.scrollIntoView({ block: "nearest", behavior: moinsDAnimations.matches ? "auto" : "smooth" });
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
      dessinerVitrine(null);
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

// Petit texte dans l'aperçu de la carte (les effets et les sons ont chacun le leur)
const TEXTES_APERCU = {
  "effet-tampon": "Paf !",
  "effet-encre": "Splash",
  "effet-grains": "Fiou !",
  "effet-avion": "Décollage",
  "effet-confettis": "Youpi !",
  "son-goutte": "Ploc",
  "son-coucou": "Coucou",
  "son-carillon": "Ding ding ding",
  "son-8bits": "Bling",
  "son-sablier": "Shhh"
};

function texteApercu(article) {
  return TEXTES_APERCU[article.id] || "Salut !";
}

function creerCarteArticle(article) {
  const modele = document.querySelector("#modele-article").content.cloneNode(true);
  const carte = modele.querySelector(".article");
  const apercu = modele.querySelector(".article-apercu");
  const bouton = modele.querySelector(".article-action");
  const essayer = modele.querySelector(".article-essayer");
  const prix = modele.querySelector(".article-prix");
  const achete = etatBoutique.achetes.has(article.id);
  const equipe = etatBoutique.equipes.has(article.id);

  modele.querySelector(".article-nom").textContent = article.nom;
  modele.querySelector(".article-description").textContent = article.description;

  // Aperçu : un faux message avec la classe de l'article
  // (les couleurs et les effets se voient sur mes bulles, le reste sur une bulle reçue)
  const deMoi = article.categorie === "couleur" || article.categorie === "effet";
  apercu.querySelector(".liste-messages").append(
    creerMiniMessage(texteApercu(article), deMoi, salonBoutique.profil)
  );
  mettreClassesArticles(apercu, [article.id]);
  apercu.style.setProperty("--progression", "0.55");

  essayer.textContent = article.categorie === "son" ? "Écouter" : "Essayer";
  essayer.addEventListener("click", () => essayerArticle(article));

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
    bouton.addEventListener("click", (evenement) => acheterArticle(article, evenement.currentTarget));
  } else {
    // Pas assez de grains : on dit combien il en manque et une barre montre où on en est
    prix.textContent = article.prix + " grains, il en manque " + (article.prix - etatBoutique.solde);
    bouton.textContent = "Acheter";
    bouton.disabled = true;
    const barre = document.createElement("span");
    barre.className = "article-progression";
    barre.style.setProperty("--avancee", Math.round((etatBoutique.solde / article.prix) * 100) + "%");
    barre.title = etatBoutique.solde + " grains sur " + article.prix;
    prix.after(barre);
  }

  return modele;
}

// ===== Actions =====

// Après chaque action on recharge l'état puis on redessine
async function apresAction(texte) {
  afficherToast(texte, "succes");
  await chargerEtatBoutique();
  dessinerArticles();
  dessinerVitrine(null);
  await appliquerPersonnalisation(salonBoutique.id);
  await chargerSonsEquipes(); // effets.js : le son choisi peut avoir changé
}

// Les vérifications (solde, prix) sont faites par la base dans acheter_article
async function acheterArticle(article, bouton) {
  const ancienSolde = etatBoutique.solde;
  const { error } = await client.rpc("acheter_article", {
    p_salon: salonBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherToast(error.message, "erreur");
    return;
  }
  feterAchat(bouton);

  // Un article qu'on vient d'acheter est équipé directement
  await client.rpc("equiper_article", { p_salon: salonBoutique.id, p_article: article.id });
  await apresAction(article.nom + " acheté et équipé.");
  animerNombre(document.querySelector("#boutique-solde"), ancienSolde, etatBoutique.solde);
}

async function equiperArticle(article) {
  const { error } = await client.rpc("equiper_article", {
    p_salon: salonBoutique.id,
    p_article: article.id
  });
  if (error) {
    afficherToast(error.message, "erreur");
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
    afficherToast(error.message, "erreur");
    return;
  }
  await apresAction(article.nom + " retiré.");
}

