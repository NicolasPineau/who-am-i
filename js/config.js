// Configuration Supabase (Project Settings → API Keys / Data API).
// Ces deux valeurs sont publiques par nature : elles peuvent être dans le dépôt.
// NE JAMAIS mettre ici la clé « service_role » / « secret ».
//
// Si elles sont vides, le jeu marche quand même en mode libre (sans évaluation).
// Astuce : ajoute ?demo=1 à l'adresse pour tester l'évaluation sans Supabase,
// entre plusieurs onglets du même navigateur.
export const CONFIG = {
  SUPABASE_URL: "https://phlmghdknejkezlxvptg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_oR5XBszuSDu5ywdzg34aLg_-FiG2HS8",
};
