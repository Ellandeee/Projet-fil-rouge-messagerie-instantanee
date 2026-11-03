-- Base de données de Messagerie Custom sur Supabase
-- Pour l'utiliser on va dans Supabase > SQL Editor > New query
-- puis on colle tout le fichier et on clique sur Run
-- On peut le relancer sans problème, ça ne recrée pas ce qui existe déjà
--
-- 1. Les tables
-- 2. Les fonctions utiles et la création auto du profil
-- 3. Les règles de sécurité (qui a le droit de lire ou d'écrire quoi)
-- 4. Les fonctions appelées par le site
-- 5. Le temps réel
-- 6. Les articles de la boutique


-- ===== 1. Les tables =====

-- Le profil de chaque personne inscrite (relié à son compte Supabase)
create table if not exists public.profils (
  id              uuid primary key references auth.users (id) on delete cascade,
  nom_utilisateur text not null check (nom_utilisateur ~ '^[A-Za-z0-9_-]{3,20}$'),
  couleur_avatar  text not null default '#7c3aed' check (couleur_avatar ~ '^#[0-9a-fA-F]{6}$'),
  cree_le         timestamptz not null default now()
);
-- Deux personnes ne peuvent pas avoir le même nom (Alice et alice c'est pareil)
create unique index if not exists profils_nom_unique on public.profils (lower(nom_utilisateur));

-- Une invitation entre deux personnes qui devient un contact quand elle est acceptée
create table if not exists public.contacts (
  id              bigint generated always as identity primary key,
  demandeur_id    uuid not null references public.profils (id) on delete cascade,
  destinataire_id uuid not null references public.profils (id) on delete cascade,
  statut          text not null default 'en_attente' check (statut in ('en_attente', 'accepte')),
  cree_le         timestamptz not null default now(),
  check (demandeur_id <> destinataire_id)
);
-- Une seule relation par paire peu importe qui a invité qui
create unique index if not exists contacts_paire_unique
  on public.contacts (least(demandeur_id, destinataire_id), greatest(demandeur_id, destinataire_id));

-- Un salon peut être privé (2 personnes avec des points) ou de groupe (avec un nom)
create table if not exists public.salons (
  id        bigint generated always as identity primary key,
  nom       text check (nom is null or char_length(nom) between 1 and 40),
  est_prive boolean not null default true,
  cree_par  uuid references public.profils (id) on delete set null,
  cree_le   timestamptz not null default now()
);

-- Les membres d'un salon (derniere_lecture sert pour afficher « lu »)
create table if not exists public.membres_salon (
  salon_id         bigint not null references public.salons (id) on delete cascade,
  membre_id        uuid not null references public.profils (id) on delete cascade,
  derniere_lecture timestamptz not null default now(),
  primary key (salon_id, membre_id)
);

-- Les messages font 500 caractères max contre la triche et ne peuvent pas être vides
create table if not exists public.messages (
  id        bigint generated always as identity primary key,
  salon_id  bigint not null references public.salons (id) on delete cascade,
  auteur_id uuid not null references public.profils (id) on delete cascade,
  contenu   text not null check (char_length(contenu) <= 500 and char_length(btrim(contenu)) >= 1),
  cree_le   timestamptz not null default now()
);
create index if not exists messages_salon_date on public.messages (salon_id, cree_le);

-- Les points d'une personne avec un contact précis
-- points_gagnes ne baisse jamais et sert pour le classement
-- solde baisse quand on achète et sert pour la boutique
-- dernier_gain sert à bloquer la triche (1 point toutes les 10 s max)
create table if not exists public.points (
  proprietaire_id uuid not null references public.profils (id) on delete cascade,
  contact_id      uuid not null references public.profils (id) on delete cascade,
  points_gagnes   integer not null default 0 check (points_gagnes >= 0),
  solde           integer not null default 0 check (solde >= 0),
  dernier_gain    timestamptz not null default now(),
  primary key (proprietaire_id, contact_id)
);

-- Les articles de la boutique
-- L'id est aussi le nom de la classe CSS dans personnalisation.css
create table if not exists public.articles (
  id          text primary key,
  categorie   text not null check (categorie in ('fond', 'bulle', 'cadre', 'police', 'couleur')),
  nom         text not null,
  description text not null,
  prix        integer not null check (prix >= 0),
  ordre       smallint not null default 0
);

-- Les articles achetés (on les garde pour toujours)
create table if not exists public.achats (
  proprietaire_id uuid not null references public.profils (id) on delete cascade,
  contact_id      uuid not null references public.profils (id) on delete cascade,
  article_id      text not null references public.articles (id) on delete cascade,
  achete_le       timestamptz not null default now(),
  primary key (proprietaire_id, contact_id, article_id)
);

-- L'article équipé pour chaque catégorie et chaque contact
create table if not exists public.personnalisations (
  proprietaire_id uuid not null references public.profils (id) on delete cascade,
  contact_id      uuid not null references public.profils (id) on delete cascade,
  categorie       text not null,
  article_id      text not null references public.articles (id) on delete cascade,
  primary key (proprietaire_id, contact_id, categorie)
);


-- ===== 2. Fonctions utiles et profil automatique =====
-- security definer veut dire que la fonction tourne avec les droits de celui qui l'a créée
-- Ça évite une boucle infinie dans les règles de sécurité sur membres_salon
-- et ça permet de faire des vérifications côté serveur

-- Est-ce que je suis membre de ce salon ?
create or replace function public.est_membre(p_salon bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.membres_salon
    where salon_id = p_salon and membre_id = auth.uid()
  );
$$;

-- Est-ce que cette personne fait partie de mes contacts ?
create or replace function public.sont_contacts(p_autre uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.contacts
    where statut = 'accepte'
      and ((demandeur_id = auth.uid() and destinataire_id = p_autre)
        or (demandeur_id = p_autre and destinataire_id = auth.uid()))
  );
$$;

-- Est-ce que ce nom d'utilisateur est libre ?
-- On l'appelle avant l'inscription donc sans être connecté
create or replace function public.nom_disponible(p_nom text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.profils where lower(nom_utilisateur) = lower(btrim(p_nom))
  );
$$;

-- Crée le profil automatiquement à chaque inscription
-- avec le nom choisi dans le formulaire (envoyé par connexion.js)
create or replace function public.creer_profil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profils (id, nom_utilisateur)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nom_utilisateur', ''),
      'membre_' || left(replace(new.id::text, '-', ''), 8)
    )
  );
  return new;
end;
$$;

drop trigger if exists apres_inscription on auth.users;
create trigger apres_inscription
  after insert on auth.users
  for each row execute function public.creer_profil();


-- ===== 3. Règles de sécurité (RLS) =====
-- Sans règle rien n'est permis donc on ouvre juste ce qu'il faut
-- Les points, les achats et les salons passent seulement par les fonctions de la partie 4

alter table public.profils           enable row level security;
alter table public.contacts          enable row level security;
alter table public.salons            enable row level security;
alter table public.membres_salon     enable row level security;
alter table public.messages          enable row level security;
alter table public.points            enable row level security;
alter table public.articles          enable row level security;
alter table public.achats            enable row level security;
alter table public.personnalisations enable row level security;

-- Profils : tout le monde connecté peut lire et chacun modifie le sien
drop policy if exists "profils_lecture" on public.profils;
create policy "profils_lecture" on public.profils
  for select to authenticated using (true);

drop policy if exists "profils_modification" on public.profils;
create policy "profils_modification" on public.profils
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Le site peut modifier seulement ces deux colonnes
revoke update on public.profils from anon, authenticated;
grant update (nom_utilisateur, couleur_avatar) on public.profils to authenticated;

-- Contacts : visibles seulement par les deux personnes concernées
drop policy if exists "contacts_lecture" on public.contacts;
create policy "contacts_lecture" on public.contacts
  for select to authenticated using (auth.uid() in (demandeur_id, destinataire_id));

-- On invite seulement en son nom et l'invitation commence en attente
drop policy if exists "contacts_invitation" on public.contacts;
create policy "contacts_invitation" on public.contacts
  for insert to authenticated with check (demandeur_id = auth.uid() and statut = 'en_attente');

-- Seule la personne invitée peut accepter
drop policy if exists "contacts_acceptation" on public.contacts;
create policy "contacts_acceptation" on public.contacts
  for update to authenticated
  using (destinataire_id = auth.uid())
  with check (destinataire_id = auth.uid() and statut = 'accepte');

-- Les deux personnes peuvent refuser, annuler ou supprimer le contact
drop policy if exists "contacts_suppression" on public.contacts;
create policy "contacts_suppression" on public.contacts
  for delete to authenticated using (auth.uid() in (demandeur_id, destinataire_id));

-- On peut modifier seulement le statut (sinon on pourrait changer le demandeur)
revoke update on public.contacts from anon, authenticated;
grant update (statut) on public.contacts to authenticated;

-- Salons et membres : visibles seulement par les membres
drop policy if exists "salons_lecture" on public.salons;
create policy "salons_lecture" on public.salons
  for select to authenticated using (public.est_membre(id));

drop policy if exists "membres_lecture" on public.membres_salon;
create policy "membres_lecture" on public.membres_salon
  for select to authenticated using (public.est_membre(salon_id));

-- Chacun met à jour sa date de lecture (pour afficher « lu »)
drop policy if exists "membres_lecture_maj" on public.membres_salon;
create policy "membres_lecture_maj" on public.membres_salon
  for update to authenticated using (membre_id = auth.uid()) with check (membre_id = auth.uid());

revoke update on public.membres_salon from anon, authenticated;
grant update (derniere_lecture) on public.membres_salon to authenticated;

-- Quitter un salon de groupe
drop policy if exists "membres_quitter" on public.membres_salon;
create policy "membres_quitter" on public.membres_salon
  for delete to authenticated using (membre_id = auth.uid());

-- Messages : seulement les membres du salon peuvent les lire et en écrire
drop policy if exists "messages_lecture" on public.messages;
create policy "messages_lecture" on public.messages
  for select to authenticated using (public.est_membre(salon_id));

drop policy if exists "messages_envoi" on public.messages;
create policy "messages_envoi" on public.messages
  for insert to authenticated with check (auteur_id = auth.uid() and public.est_membre(salon_id));

-- Points, achats et personnalisations : chacun voit seulement les siens
drop policy if exists "points_lecture" on public.points;
create policy "points_lecture" on public.points
  for select to authenticated using (proprietaire_id = auth.uid());

drop policy if exists "achats_lecture" on public.achats;
create policy "achats_lecture" on public.achats
  for select to authenticated using (proprietaire_id = auth.uid());

drop policy if exists "personnalisations_lecture" on public.personnalisations;
create policy "personnalisations_lecture" on public.personnalisations
  for select to authenticated using (proprietaire_id = auth.uid());

-- Retirer un article pour revenir au style de base
drop policy if exists "personnalisations_retrait" on public.personnalisations;
create policy "personnalisations_retrait" on public.personnalisations
  for delete to authenticated using (proprietaire_id = auth.uid());

-- Articles : tout le monde connecté peut voir la boutique
drop policy if exists "articles_lecture" on public.articles;
create policy "articles_lecture" on public.articles
  for select to authenticated using (true);


-- ===== 4. Fonctions appelées par le site avec client.rpc() =====

-- Ouvre le salon privé avec un contact (ou le crée s'il n'existe pas)
-- Renvoie l'id du salon
create or replace function public.ouvrir_salon_prive(p_contact uuid)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon bigint;
begin
  if not public.sont_contacts(p_contact) then
    raise exception 'Cette personne ne fait pas partie de vos contacts.';
  end if;

  -- On regarde si un salon privé existe déjà entre les deux
  select s.id into v_salon
  from public.salons s
  join public.membres_salon m1 on m1.salon_id = s.id and m1.membre_id = auth.uid()
  join public.membres_salon m2 on m2.salon_id = s.id and m2.membre_id = p_contact
  where s.est_prive
  limit 1;

  if v_salon is null then
    insert into public.salons (est_prive, cree_par) values (true, auth.uid())
    returning id into v_salon;
    insert into public.membres_salon (salon_id, membre_id)
    values (v_salon, auth.uid()), (v_salon, p_contact);
  end if;

  return v_salon;
end;
$$;

-- Crée un salon de groupe avec un nom et des contacts puis renvoie son id
create or replace function public.creer_salon_groupe(p_nom text, p_membres uuid[])
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  bigint;
  v_membre uuid;
begin
  if p_nom is null or char_length(btrim(p_nom)) = 0 then
    raise exception 'Le nom du salon est obligatoire.';
  end if;
  if coalesce(array_length(p_membres, 1), 0) < 1 then
    raise exception 'Choisissez au moins un contact.';
  end if;
  foreach v_membre in array p_membres loop
    if not public.sont_contacts(v_membre) then
      raise exception 'Une des personnes choisies ne fait pas partie de vos contacts.';
    end if;
  end loop;

  insert into public.salons (nom, est_prive, cree_par)
  values (btrim(p_nom), false, auth.uid())
  returning id into v_salon;

  insert into public.membres_salon (salon_id, membre_id) values (v_salon, auth.uid());
  insert into public.membres_salon (salon_id, membre_id)
  select v_salon, unnest(p_membres)
  on conflict do nothing;

  return v_salon;
end;
$$;

-- Ajoute des points avec un contact et vérifie la triche côté serveur
-- Il faut être contacts
-- On donne au max 1 point par 10 secondes depuis le dernier gain (avec 1 s de marge)
-- et au max 12 points par appel
-- Même en appelant la fonction en boucle un tricheur ne gagne pas plus vite que la normale
-- Renvoie les points crédités, le solde et les points gagnés
create or replace function public.crediter_points(p_contact uuid, p_points integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ligne     public.points%rowtype;
  v_autorises integer;
  v_credites  integer;
begin
  if not public.sont_contacts(p_contact) then
    raise exception 'Cette personne ne fait pas partie de vos contacts.';
  end if;

  -- Si c'est la première fois avec ce contact on crée sa ligne de points
  insert into public.points (proprietaire_id, contact_id, dernier_gain)
  values (auth.uid(), p_contact, now() - interval '10 seconds')
  on conflict (proprietaire_id, contact_id) do nothing;

  -- for update bloque la ligne pendant le calcul pour éviter de créditer deux fois
  select * into v_ligne from public.points
  where proprietaire_id = auth.uid() and contact_id = p_contact
  for update;

  v_autorises := floor((extract(epoch from (now() - v_ligne.dernier_gain)) + 1) / 10)::integer;
  v_credites  := least(greatest(coalesce(p_points, 0), 0), v_autorises, 12);

  if v_credites > 0 then
    update public.points
    set points_gagnes = points_gagnes + v_credites,
        solde         = solde + v_credites,
        dernier_gain  = now()
    where proprietaire_id = auth.uid() and contact_id = p_contact
    returning * into v_ligne;
  end if;

  return jsonb_build_object(
    'credites', v_credites,
    'solde', v_ligne.solde,
    'points_gagnes', v_ligne.points_gagnes
  );
end;
$$;

-- Achète un article pour un contact
-- Le prix est lu dans la base et pas envoyé par le site donc on ne peut pas tricher dessus
-- Renvoie le nouveau solde
create or replace function public.acheter_article(p_contact uuid, p_article text)
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
    where proprietaire_id = auth.uid() and contact_id = p_contact and article_id = p_article
  ) then
    raise exception 'Vous possédez déjà cet article pour ce contact.';
  end if;

  select solde into v_solde from public.points
  where proprietaire_id = auth.uid() and contact_id = p_contact
  for update;

  if coalesce(v_solde, 0) < v_prix then
    raise exception 'Solde insuffisant : il faut % points.', v_prix;
  end if;

  update public.points set solde = solde - v_prix
  where proprietaire_id = auth.uid() and contact_id = p_contact;

  insert into public.achats (proprietaire_id, contact_id, article_id)
  values (auth.uid(), p_contact, p_article);

  return jsonb_build_object('solde', v_solde - v_prix);
end;
$$;

-- Équipe un article déjà acheté (remplace celui de la même catégorie)
create or replace function public.equiper_article(p_contact uuid, p_article text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_categorie text;
begin
  if not exists (
    select 1 from public.achats
    where proprietaire_id = auth.uid() and contact_id = p_contact and article_id = p_article
  ) then
    raise exception 'Achetez d''abord cet article.';
  end if;

  select categorie into v_categorie from public.articles where id = p_article;

  insert into public.personnalisations (proprietaire_id, contact_id, categorie, article_id)
  values (auth.uid(), p_contact, v_categorie, p_article)
  on conflict (proprietaire_id, contact_id, categorie)
  do update set article_id = excluded.article_id;
end;
$$;

-- Supprime pour de bon le compte de la personne connectée
-- Avec les on delete cascade tout le reste est effacé en même temps
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- Ces fonctions sont seulement pour les personnes connectées
revoke execute on function public.ouvrir_salon_prive(uuid)          from public, anon;
revoke execute on function public.creer_salon_groupe(text, uuid[])  from public, anon;
revoke execute on function public.crediter_points(uuid, integer)    from public, anon;
revoke execute on function public.acheter_article(uuid, text)       from public, anon;
revoke execute on function public.equiper_article(uuid, text)       from public, anon;
revoke execute on function public.supprimer_mon_compte()            from public, anon;
grant  execute on function public.ouvrir_salon_prive(uuid)          to authenticated;
grant  execute on function public.creer_salon_groupe(text, uuid[])  to authenticated;
grant  execute on function public.crediter_points(uuid, integer)    to authenticated;
grant  execute on function public.acheter_article(uuid, text)       to authenticated;
grant  execute on function public.equiper_article(uuid, text)       to authenticated;
grant  execute on function public.supprimer_mon_compte()            to authenticated;

-- Sauf celle-là qu'on utilise avant d'être connecté
grant  execute on function public.nom_disponible(text)              to anon, authenticated;


-- ===== 5. Temps réel =====
-- Le site est prévenu tout de suite des nouveaux messages, des lectures et des invitations
do $$
declare
  v_table text;
begin
  foreach v_table in array array['messages', 'membres_salon', 'contacts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;


-- ===== 6. Articles de la boutique =====
-- On gagne 6 points par minute donc 10 minutes de discussion donnent environ 60 points
insert into public.articles (id, categorie, nom, description, prix, ordre) values
  -- Fond de la discussion
  ('fond-coucher-soleil', 'fond',    'Coucher de soleil', 'Un dégradé chaud, orange et rose.',              50, 1),
  ('fond-ocean',          'fond',    'Océan',             'Un bleu profond et apaisant.',                    60, 2),
  ('fond-nuit-etoilee',   'fond',    'Nuit étoilée',      'Un ciel sombre parsemé d''étoiles.',             100, 3),
  ('fond-damier',         'fond',    'Damier rétro',      'Des carreaux façon jeu vidéo d''antan.',         150, 4),
  ('fond-aurore',         'fond',    'Aurore boréale',    'Un dégradé animé aux couleurs changeantes.',     250, 5),
  -- Cadre des messages (forme des bulles)
  ('bulle-arrondie',      'bulle',   'Bulle ronde',       'Des bulles très arrondies et douces.',            30, 1),
  ('bulle-bd',            'bulle',   'Bande dessinée',    'Contour épais et ombre décalée façon BD.',        80, 2),
  ('bulle-neon',          'bulle',   'Néon',              'Un contour lumineux qui brille.',                150, 3),
  ('bulle-doree',         'bulle',   'Dorée',             'Un cadre doré pour des messages précieux.',      250, 4),
  -- Cadre de la photo de profil
  ('cadre-anneau',        'cadre',   'Anneau coloré',     'Un anneau autour de votre photo.',                40, 1),
  ('cadre-story',         'cadre',   'Anneau story',      'Un anneau dégradé façon réseaux sociaux.',       100, 2),
  ('cadre-halo',          'cadre',   'Halo animé',        'Une lueur qui pulse autour de votre photo.',     200, 3),
  ('cadre-couronne',      'cadre',   'Couronne',          'Une couronne posée sur votre photo.',            300, 4),
  -- Typographie
  ('police-manuscrite',   'police',  'Manuscrite',        'Une écriture qui semble faite à la main.',        60, 1),
  ('police-machine',      'police',  'Machine à écrire',  'Des lettres façon vieille machine à écrire.',     60, 2),
  ('police-arrondie',     'police',  'Arrondie',          'Une police ronde et amicale.',                    60, 3),
  -- Couleur de nos bulles
  ('couleur-emeraude',    'couleur', 'Émeraude',          'Vos bulles en vert émeraude.',                    40, 1),
  ('couleur-corail',      'couleur', 'Corail',            'Vos bulles en rouge corail.',                     40, 2),
  ('couleur-saphir',      'couleur', 'Saphir',            'Vos bulles en bleu saphir.',                      40, 3),
  ('couleur-arc-en-ciel', 'couleur', 'Arc-en-ciel',       'Vos bulles en dégradé multicolore.',             200, 4)
on conflict (id) do update set
  categorie   = excluded.categorie,
  nom         = excluded.nom,
  description = excluded.description,
  prix        = excluded.prix,
  ordre       = excluded.ordre;


-- ===== Pour tester =====
-- À lancer à la main seulement pour tester la boutique
-- Donne 500 points à ellande avec emeric
--
-- update public.points set solde = solde + 500, points_gagnes = points_gagnes + 500
-- where proprietaire_id = (select id from public.profils where nom_utilisateur = 'ellande')
--   and contact_id      = (select id from public.profils where nom_utilisateur = 'emeric');
