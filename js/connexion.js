/*
  Page de connexion (index.html)
  Gère les 3 formulaires : connexion, inscription et mot de passe oublié
*/

const ongletConnexion = document.querySelector("#onglet-connexion");
const ongletInscription = document.querySelector("#onglet-inscription");
const formConnexion = document.querySelector("#form-connexion");
const formInscription = document.querySelector("#form-inscription");
const formMdpOublie = document.querySelector("#form-mdp-oublie");
const zoneMessage = document.querySelector("#message-connexion");

// Si on est déjà connecté on va directement aux discussions
client.auth.getSession().then(({ data }) => {
  if (data.session) {
    window.location.href = "conversation.html";
  }
});

// ===== Changer de formulaire =====

function montrerFormulaire(formulaire) {
  formConnexion.hidden = formulaire !== formConnexion;
  formInscription.hidden = formulaire !== formInscription;
  formMdpOublie.hidden = formulaire !== formMdpOublie;

  const surConnexion = formulaire === formConnexion;
  ongletConnexion.classList.toggle("actif", surConnexion);
  ongletInscription.classList.toggle("actif", formulaire === formInscription);
  ongletConnexion.setAttribute("aria-pressed", surConnexion);
  ongletInscription.setAttribute("aria-pressed", formulaire === formInscription);

  afficherEtat(zoneMessage, "");
}

ongletConnexion.addEventListener("click", () => montrerFormulaire(formConnexion));
ongletInscription.addEventListener("click", () => montrerFormulaire(formInscription));
document.querySelector("#bouton-mdp-oublie").addEventListener("click", () => montrerFormulaire(formMdpOublie));
document.querySelector("#bouton-retour-connexion").addEventListener("click", () => montrerFormulaire(formConnexion));

// commun.js n'est pas chargé sur cette page donc on a notre propre version
function afficherEtat(element, texte, type = "") {
  element.textContent = texte;
  element.classList.remove("erreur", "succes");
  if (type) element.classList.add(type);
}

// Les erreurs de Supabase sont en anglais, on traduit les plus courantes
function traduireErreur(erreur) {
  const message = erreur.message || "";
  if (message.includes("Invalid login credentials")) return "Adresse e-mail ou mot de passe incorrect.";
  if (message.includes("already registered")) return "Un compte existe déjà avec cette adresse e-mail.";
  if (message.includes("Password should be")) return "Le mot de passe doit faire au moins 6 caractères.";
  if (message.includes("rate limit")) return "Trop d'essais d'affilée. Attendez quelques minutes puis réessayez.";
  if (message.includes("valid email") || message.includes("invalid format")) return "L'adresse e-mail n'est pas valide.";
  return "Une erreur est survenue : " + message;
}

function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== Connexion =====

formConnexion.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const email = document.querySelector("#connexion-email").value.trim();
  const mdp = document.querySelector("#connexion-mdp").value;

  if (!emailValide(email) || mdp === "") {
    afficherEtat(zoneMessage, "Remplissez votre adresse e-mail et votre mot de passe.", "erreur");
    return;
  }

  // On retient le choix avant de se connecter pour que la session aille au bon endroit
  const souvenir = document.querySelector("#se-souvenir").checked;
  localStorage.setItem("se-souvenir", souvenir ? "oui" : "non");

  afficherEtat(zoneMessage, "Connexion en cours…");
  const { error } = await client.auth.signInWithPassword({ email, password: mdp });
  if (error) {
    afficherEtat(zoneMessage, traduireErreur(error), "erreur");
    return;
  }
  window.location.href = "conversation.html";
});

// ===== Inscription =====

formInscription.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const nom = document.querySelector("#inscription-nom").value.trim();
  const email = document.querySelector("#inscription-email").value.trim();
  const mdp = document.querySelector("#inscription-mdp").value;
  const confirmation = document.querySelector("#inscription-mdp-confirmation").value;

  // On vérifie tout avant d'appeler Supabase
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(nom)) {
    afficherEtat(zoneMessage, "Le nom d'utilisateur doit faire 3 à 20 caractères (lettres, chiffres, _ ou -).", "erreur");
    return;
  }
  if (!emailValide(email)) {
    afficherEtat(zoneMessage, "L'adresse e-mail n'est pas valide.", "erreur");
    return;
  }
  if (mdp.length < 6) {
    afficherEtat(zoneMessage, "Le mot de passe doit faire au moins 6 caractères.", "erreur");
    return;
  }
  if (mdp !== confirmation) {
    afficherEtat(zoneMessage, "Les deux mots de passe ne sont pas identiques.", "erreur");
    return;
  }

  // Le nom doit être libre (fonction nom_disponible dans la base)
  afficherEtat(zoneMessage, "Création du compte…");
  const { data: libre } = await client.rpc("nom_disponible", { p_nom: nom });
  if (libre === false) {
    afficherEtat(zoneMessage, "Ce nom d'utilisateur est déjà pris, essayez-en un autre.", "erreur");
    return;
  }

  // Le nom est envoyé avec le compte, la base crée le profil toute seule
  localStorage.setItem("se-souvenir", "oui");
  const { data, error } = await client.auth.signUp({
    email,
    password: mdp,
    options: { data: { nom_utilisateur: nom } }
  });
  if (error) {
    afficherEtat(zoneMessage, traduireErreur(error), "erreur");
    return;
  }

  // Sans confirmation par e-mail on est connecté tout de suite
  if (data.session) {
    window.location.href = "conversation.html";
  } else {
    montrerFormulaire(formConnexion);
    afficherEtat(zoneMessage, "Compte créé ! Regardez vos e-mails pour le confirmer, puis connectez-vous.", "succes");
  }
});

// ===== Mot de passe oublié =====

formMdpOublie.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  const email = document.querySelector("#mdp-oublie-email").value.trim();
  if (!emailValide(email)) {
    afficherEtat(zoneMessage, "L'adresse e-mail n'est pas valide.", "erreur");
    return;
  }

  // Le lien de l'e-mail ramène sur la page des paramètres pour choisir un nouveau mot de passe
  const pageRetour = new URL("parametre.html", window.location.href).href;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: pageRetour });
  if (error) {
    afficherEtat(zoneMessage, traduireErreur(error), "erreur");
    return;
  }
  afficherEtat(zoneMessage, "E-mail envoyé ! Si un compte existe avec cette adresse, vous allez recevoir un lien. Pensez à regarder vos courriers indésirables.", "succes");
});
