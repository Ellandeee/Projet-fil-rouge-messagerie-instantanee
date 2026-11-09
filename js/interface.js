/*
  Petits outils d'interface utilisés sur toutes les pages, même la connexion
  Messages sous les formulaires, toasts et bouton « Afficher » des mots de passe
*/

// ===== Messages d'état (erreur ou succès) =====

function afficherEtat(element, texte, type = "") {
  element.textContent = texte;
  element.classList.remove("erreur", "succes");
  if (type) element.classList.add(type);
}

// ===== Toasts =====

// Les toasts s'empilent dans une zone en bas de l'écran
// Si une fenêtre (dialog) est ouverte on met la zone dedans, sinon elle passerait dessous
function zoneToasts() {
  const parent = document.querySelector("dialog[open]") || document.body;
  let zone = parent.querySelector(":scope > .pile-toasts");
  if (!zone) {
    zone = document.createElement("div");
    zone.className = "pile-toasts";
    zone.setAttribute("role", "status");
    zone.setAttribute("aria-live", "polite");
    parent.append(zone);
  }
  return zone;
}

// type = "" (normal), "succes" ou "erreur"
function afficherToast(texte, type = "", duree = 4000) {
  const toast = document.createElement("p");
  toast.className = "toast" + (type ? " " + type : "");
  toast.textContent = texte;
  zoneToasts().append(toast);

  // On le fait partir en douceur avant de l'enlever
  setTimeout(() => toast.classList.add("depart"), duree);
  setTimeout(() => toast.remove(), duree + 300);
}

// ===== Afficher le mot de passe =====

// Chaque bouton .bouton-voir est juste après son champ mot de passe
function preparerMotsDePasse() {
  for (const bouton of document.querySelectorAll(".bouton-voir")) {
    const champ = bouton.previousElementSibling;
    bouton.addEventListener("click", () => {
      const visible = champ.type === "text";
      champ.type = visible ? "password" : "text";
      bouton.textContent = visible ? "Afficher" : "Cacher";
      bouton.setAttribute("aria-pressed", !visible);
      champ.focus();
    });
  }
}

preparerMotsDePasse();
