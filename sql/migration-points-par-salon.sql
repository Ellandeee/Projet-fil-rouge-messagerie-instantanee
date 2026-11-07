-- Migration du 6 novembre 2026
-- Les points, les achats et les personnalisations passent d'un contact à une discussion
-- Comme ça les salons de groupe ont aussi des points et une boutique
-- Les points déjà gagnés sont gardés et rattachés à la discussion privée correspondante
-- À lancer une seule fois sur une base créée avec l'ancienne version de schema.sql
-- (une base neuve créée avec schema.sql est déjà à jour)

begin;

-- ===== 1. Les tables =====

-- Pour chaque table on ajoute salon_id, on le remplit avec la discussion privée
-- entre les deux personnes, puis on enlève l'ancienne colonne contact_id

alter table public.points add column if not exists salon_id bigint references public.salons (id) on delete cascade;
alter table public.achats add column if not exists salon_id bigint references public.salons (id) on delete cascade;
alter table public.personnalisations add column if not exists salon_id bigint references public.salons (id) on delete cascade;

update public.points t set salon_id = (
  select s.id from public.salons s
  join public.membres_salon m1 on m1.salon_id = s.id and m1.membre_id = t.proprietaire_id
  join public.membres_salon m2 on m2.salon_id = s.id and m2.membre_id = t.contact_id
  where s.est_prive limit 1
) where salon_id is null;

update public.achats t set salon_id = (
  select s.id from public.salons s
  join public.membres_salon m1 on m1.salon_id = s.id and m1.membre_id = t.proprietaire_id
  join public.membres_salon m2 on m2.salon_id = s.id and m2.membre_id = t.contact_id
  where s.est_prive limit 1
) where salon_id is null;

update public.personnalisations t set salon_id = (
  select s.id from public.salons s
  join public.membres_salon m1 on m1.salon_id = s.id and m1.membre_id = t.proprietaire_id
  join public.membres_salon m2 on m2.salon_id = s.id and m2.membre_id = t.contact_id
  where s.est_prive limit 1
) where salon_id is null;

-- Les lignes sans discussion privée ne servent plus à rien
delete from public.points where salon_id is null;
delete from public.achats where salon_id is null;
delete from public.personnalisations where salon_id is null;

alter table public.points drop constraint points_pkey;
alter table public.points drop column contact_id;
alter table public.points alter column salon_id set not null;
alter table public.points add primary key (proprietaire_id, salon_id);

alter table public.achats drop constraint achats_pkey;
alter table public.achats drop column contact_id;
alter table public.achats alter column salon_id set not null;
alter table public.achats add primary key (proprietaire_id, salon_id, article_id);

alter table public.personnalisations drop constraint personnalisations_pkey;
alter table public.personnalisations drop column contact_id;
alter table public.personnalisations alter column salon_id set not null;
alter table public.personnalisations add primary key (proprietaire_id, salon_id, categorie);

-- ===== 2. Les fonctions =====

-- On enlève les anciennes versions qui prenaient un contact
drop function if exists public.crediter_points(uuid, integer);
drop function if exists public.acheter_article(uuid, text);
drop function if exists public.equiper_article(uuid, text);

-- Ajoute des points dans une discussion et vérifie la triche côté serveur
-- Il faut être membre de la discussion
-- On donne au max 1 point par 10 secondes depuis le dernier gain (avec 1 s de marge)
-- et au max 12 points par appel
-- Même en appelant la fonction en boucle un tricheur ne gagne pas plus vite que la normale
-- Renvoie les points crédités, le solde et les points gagnés
create or replace function public.crediter_points(p_salon bigint, p_points integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ligne     public.points%rowtype;
  v_autorises integer;
  v_credites  integer;
begin
  if not public.est_membre(p_salon) then
    raise exception 'Vous ne faites pas partie de cette discussion.';
  end if;

  -- Si c'est la première fois dans cette discussion on crée la ligne de points
  insert into public.points (proprietaire_id, salon_id, dernier_gain)
  values (auth.uid(), p_salon, now() - interval '10 seconds')
  on conflict (proprietaire_id, salon_id) do nothing;

  -- for update bloque la ligne pendant le calcul pour éviter de créditer deux fois
  select * into v_ligne from public.points
  where proprietaire_id = auth.uid() and salon_id = p_salon
  for update;

  v_autorises := floor((extract(epoch from (now() - v_ligne.dernier_gain)) + 1) / 10)::integer;
  v_credites  := least(greatest(coalesce(p_points, 0), 0), v_autorises, 12);

  if v_credites > 0 then
    update public.points
    set points_gagnes = points_gagnes + v_credites,
        solde         = solde + v_credites,
        dernier_gain  = now()
    where proprietaire_id = auth.uid() and salon_id = p_salon
    returning * into v_ligne;
  end if;

  return jsonb_build_object(
    'credites', v_credites,
    'solde', v_ligne.solde,
    'points_gagnes', v_ligne.points_gagnes
  );
end;
$$;

-- Achète un article pour une discussion
-- Le prix est lu dans la base et pas envoyé par le site donc on ne peut pas tricher dessus
-- Renvoie le nouveau solde
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
    raise exception 'Il vous faut % points pour cet article.', v_prix;
  end if;

  update public.points set solde = solde - v_prix
  where proprietaire_id = auth.uid() and salon_id = p_salon;

  insert into public.achats (proprietaire_id, salon_id, article_id)
  values (auth.uid(), p_salon, p_article);

  return jsonb_build_object('solde', v_solde - v_prix);
end;
$$;

-- Équipe un article déjà acheté (remplace celui de la même catégorie)
create or replace function public.equiper_article(p_salon bigint, p_article text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_categorie text;
begin
  if not exists (
    select 1 from public.achats
    where proprietaire_id = auth.uid() and salon_id = p_salon and article_id = p_article
  ) then
    raise exception 'Achetez d''abord cet article.';
  end if;

  select categorie into v_categorie from public.articles where id = p_article;

  insert into public.personnalisations (proprietaire_id, salon_id, categorie, article_id)
  values (auth.uid(), p_salon, v_categorie, p_article)
  on conflict (proprietaire_id, salon_id, categorie)
  do update set article_id = excluded.article_id;
end;
$$;

revoke execute on function public.crediter_points(bigint, integer)  from public, anon;
revoke execute on function public.acheter_article(bigint, text)     from public, anon;
revoke execute on function public.equiper_article(bigint, text)     from public, anon;
grant  execute on function public.crediter_points(bigint, integer)  to authenticated;
grant  execute on function public.acheter_article(bigint, text)     to authenticated;
grant  execute on function public.equiper_article(bigint, text)     to authenticated;

commit;
