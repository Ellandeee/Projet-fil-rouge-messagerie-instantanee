-- Boutique v2 de TimeChat
-- À lancer une seule fois dans Supabase > SQL Editor (on peut le relancer sans risque)
-- Ce que ça change :
-- 1. deux nouvelles catégories d'articles, les effets d'envoi et les sons
-- 2. le catalogue complet de la boutique (47 articles, les anciens gardent leur id)
-- 3. le message d'erreur d'achat parle de grains et plus de points
-- 4. la couleur d'avatar par défaut passe en encre
-- Les achats déjà faits ne bougent pas

begin;

-- ===== 1. Nouvelles catégories =====

alter table public.articles drop constraint if exists articles_categorie_check;
alter table public.articles add constraint articles_categorie_check
  check (categorie in ('fond', 'bulle', 'cadre', 'police', 'couleur', 'effet', 'son'));

-- ===== 2. Le catalogue =====
-- On gagne 6 grains par minute donc 10 minutes de discussion donnent environ 60 grains
-- L'id est aussi le nom de la classe CSS dans personnalisation.css

insert into public.articles (id, categorie, nom, description, prix, ordre) values
  -- Fonds de la discussion
  ('fond-cahier',          'fond',    'Cahier d''écolier',  'Des lignes bleues et une marge rouge qui défilent avec les messages.',  40, 1),
  ('fond-coucher-soleil',  'fond',    'Coucher de soleil',  'Un dégradé chaud, orange et rose.',                                    50, 2),
  ('fond-ocean',           'fond',    'Océan',              'Un bleu profond avec des vagues qui roulent en bas.',                  70, 3),
  ('fond-pluie',           'fond',    'Jour de pluie',      'Des gouttes tombent derrière vos messages.',                           90, 4),
  ('fond-damier',          'fond',    'Damier rétro',       'Des carreaux façon jeu vidéo d''antan.',                              100, 5),
  ('fond-nuit-etoilee',    'fond',    'Nuit étoilée',       'Un ciel sombre où les étoiles scintillent.',                          120, 6),
  ('fond-ciel-du-moment',  'fond',    'Ciel du moment',     'Suit l''heure qu''il est : aube, plein jour, crépuscule ou nuit.',     180, 7),
  ('fond-dune',            'fond',    'Dune',               'Le sable monte au fond de la discussion pendant que la minute passe.', 220, 8),
  ('fond-aurore',          'fond',    'Aurore boréale',     'Des couleurs du Grand Nord qui ondulent lentement.',                  260, 9),

  -- Forme des bulles
  ('bulle-arrondie',       'bulle',   'Bulle ronde',        'Des bulles très arrondies, toutes douces.',                            30, 1),
  ('bulle-post-it',        'bulle',   'Post-it',            'Chaque message est un post-it collé un peu de travers.',               70, 2),
  ('bulle-bd',             'bulle',   'Bande dessinée',     'Contour épais et ombre décalée, comme dans une BD.',                   80, 3),
  ('bulle-telegramme',     'bulle',   'Télégramme',         'Tout en majuscules, et chaque message finit par STOP.',               110, 4),
  ('bulle-pixel',          'bulle',   '8 bits',             'Des bords en escalier comme dans un vieux jeu.',                      130, 5),
  ('bulle-neon',           'bulle',   'Néon',               'Un contour lumineux qui grésille quand un message arrive.',           150, 6),
  ('bulle-parchemin',      'bulle',   'Parchemin',          'Un vieux papier jauni aux bords pas tout à fait droits.',             170, 7),
  ('bulle-doree',          'bulle',   'Dorée',              'Un reflet brillant passe sur chaque nouveau message.',                250, 8),

  -- Cadre des photos de profil
  ('cadre-anneau',         'cadre',   'Anneau d''encre',    'Un anneau net autour des photos.',                                     40, 1),
  ('cadre-tampon',         'cadre',   'Timbre-poste',       'Des photos carrées avec un bord pointillé de timbre.',                 70, 2),
  ('cadre-story',          'cadre',   'Anneau story',       'Un anneau dégradé façon réseaux sociaux.',                            100, 3),
  ('cadre-polaroid',       'cadre',   'Polaroïd',           'Un cadre photo blanc, un peu penché.',                                120, 4),
  ('cadre-halo',           'cadre',   'Halo',               'Une lueur dorée qui respire autour des photos.',                      180, 5),
  ('cadre-orbite',         'cadre',   'Orbite',             'Un grain de sable tourne autour de chaque photo.',                    220, 6),
  ('cadre-cadran',         'cadre',   'Cadran',             'Un anneau qui se vide en même temps que le minuteur.',                260, 7),
  ('cadre-couronne',       'cadre',   'Couronne',           'Une couronne posée sur chaque photo.',                                300, 8),

  -- Police des messages
  ('police-arrondie',      'police',  'Arrondie',           'Une police ronde et amicale.',                                         50, 1),
  ('police-manuscrite',    'police',  'Manuscrite',         'Comme une lettre écrite au stylo.',                                    60, 2),
  ('police-pixel',         'police',  'Pixel',              'Les lettres carrées des bornes d''arcade.',                           100, 3),
  ('police-machine',       'police',  'Machine à écrire',   'Les nouveaux messages s''écrivent lettre par lettre.',                120, 4),
  ('police-grimoire',      'police',  'Grimoire',           'Une écriture gothique avec une grande lettrine au début.',            160, 5),

  -- Couleur de mes bulles
  ('couleur-emeraude',     'couleur', 'Émeraude',           'Vos bulles en vert émeraude.',                                         40, 1),
  ('couleur-corail',       'couleur', 'Corail',             'Vos bulles en rouge corail.',                                          40, 2),
  ('couleur-saphir',       'couleur', 'Saphir',             'Vos bulles en bleu saphir.',                                           40, 3),
  ('couleur-assortie',     'couleur', 'Assortie',           'Vos bulles prennent la couleur de votre avatar.',                      80, 4),
  ('couleur-cameleon',     'couleur', 'Caméléon',           'Vos bulles changent de couleur à chaque message.',                    150, 5),
  ('couleur-humeur',       'couleur', 'Humeur',             'La couleur suit le ton : une question en bleu, un cri en brique, un rire en sable.', 180, 6),
  ('couleur-arc-en-ciel',  'couleur', 'Arc-en-ciel',        'Vos bulles en dégradé multicolore.',                                  200, 7),

  -- Effet quand j'envoie un message
  ('effet-tampon',         'effet',   'Coup de tampon',     'Votre message tombe sur la page avec un petit choc.',                  60, 1),
  ('effet-encre',          'effet',   'Tache d''encre',     'Une goutte d''encre s''étale derrière le message envoyé.',             90, 2),
  ('effet-grains',         'effet',   'Poignée de sable',   'Des grains jaillissent de chaque message envoyé.',                    140, 3),
  ('effet-avion',          'effet',   'Avion en papier',    'Un avion en papier s''envole avec votre message.',                    180, 4),
  ('effet-confettis',      'effet',   'Confettis',          'Une petite fête à chaque envoi.',                                     220, 5),

  -- Son quand un message arrive dans cette discussion
  ('son-goutte',           'son',     'Goutte d''eau',      'Un petit ploc tout doux.',                                             40, 1),
  ('son-coucou',           'son',     'Coucou',             'Deux notes comme une horloge suisse.',                                 70, 2),
  ('son-carillon',         'son',     'Carillon',           'Trois notes qui montent.',                                             90, 3),
  ('son-8bits',            'son',     'Pièce 8 bits',       'Le bruit d''une pièce ramassée dans un vieux jeu.',                   120, 4),
  ('son-sablier',          'son',     'Sablier',            'Un souffle de sable qui s''écoule.',                                  150, 5)
on conflict (id) do update set
  categorie   = excluded.categorie,
  nom         = excluded.nom,
  description = excluded.description,
  prix        = excluded.prix,
  ordre       = excluded.ordre;

-- ===== 3. Message d'erreur en grains =====

create or replace function public.acheter_article(p_salon bigint, p_article text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prix  integer;
  v_solde integer;
begin
  select prix into v_prix from public.articles where id = p_article;
  if v_prix is null then
    raise exception 'Cet article n''existe pas.';
  end if;

  if exists (
    select 1 from public.achats
    where proprietaire_id = auth.uid() and salon_id = p_salon and article_id = p_article
  ) then
    raise exception 'Vous avez déjà cet article dans cette discussion.';
  end if;

  select solde into v_solde from public.points
  where proprietaire_id = auth.uid() and salon_id = p_salon
  for update;

  if coalesce(v_solde, 0) < v_prix then
    raise exception 'Il vous faut % grains pour cet article.', v_prix;
  end if;

  update public.points set solde = solde - v_prix
  where proprietaire_id = auth.uid() and salon_id = p_salon;

  insert into public.achats (proprietaire_id, salon_id, article_id)
  values (auth.uid(), p_salon, p_article);

  return jsonb_build_object('solde', v_solde - v_prix);
end;
$$;

revoke execute on function public.acheter_article(bigint, text) from public, anon;
grant  execute on function public.acheter_article(bigint, text) to authenticated;

-- ===== 4. Avatar par défaut en encre =====

alter table public.profils alter column couleur_avatar set default '#1f2a44';

commit;
