/*
  Connexion à Supabase (utilisé par toutes les pages)
  La clé publique peut être visible dans le code, elle est faite pour ça
  Il ne faut JAMAIS mettre ici la clé secrète (service_role)
*/

const SUPABASE_URL = "https://ofyqjpgdmufnzyenkwjt.supabase.co";
const SUPABASE_CLE_PUBLIQUE = "sb_publishable_Z1f0NQmgDCVZNNrh2oSfAQ_GzNGrfX5";

// Case « Se souvenir de moi » : on garde le choix dans le localStorage
function seSouvenir() {
  return localStorage.getItem("se-souvenir") !== "non";
}

// Supabase garde la session dans le stockage qu'on lui donne
// Si on se souvient : localStorage (reste après fermeture du navigateur)
// Sinon : sessionStorage (effacé quand on ferme l'onglet)
const stockageSession = {
  getItem(cle) {
    return localStorage.getItem(cle) ?? sessionStorage.getItem(cle);
  },
  setItem(cle, valeur) {
    if (seSouvenir()) {
      localStorage.setItem(cle, valeur);
    } else {
      sessionStorage.setItem(cle, valeur);
    }
  },
  removeItem(cle) {
    localStorage.removeItem(cle);
    sessionStorage.removeItem(cle);
  }
};

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: { storage: stockageSession }
});
