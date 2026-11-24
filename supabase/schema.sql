-- ============================================================================
-- Qui est-ce ? SQL — tables Supabase (version 2)
-- À coller en entier dans Supabase → SQL Editor → New query → Run.
-- Le script peut être relancé sans risque : il ne supprime aucune donnée
-- (sauf, une seule fois, les tables de la version 1 si elles existent).
--
-- Principe de sécurité :
--   - les questions et leurs solutions ne sont lisibles que par le prof ;
--   - pendant une évaluation, les élèves ne voient que les consignes déjà affichées ;
--   - la correction se fait ici, sur le serveur, en comparant une « empreinte »
--     (hash) du résultat de l'élève avec celle du résultat attendu ;
--   - les solutions ne deviennent visibles qu'au moment de la correction.
-- ============================================================================

-- 0. Passage de la version 1 à la version 2 (une seule fois) -------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'evaluations' and column_name = 'questions') then
    drop table if exists public.reponses cascade;
    drop table if exists public.evaluations cascade;
    drop function if exists public.avancer_question(uuid, int);
  end if;
end $$;

-- 1. Banque de questions (prof uniquement) --------------------------------------
create table if not exists public.banque (
  id          uuid primary key default gen_random_uuid(),
  position    int  not null default 0,
  notion      text not null default '',
  consigne    text not null,
  solution    text not null,
  verif       text not null default 'ids' check (verif in ('ids', 'valeurs')),
  tri         text not null default 'non',  -- 'non', 'oui' ou le nom d'une colonne (ex. 'taille')
  duree       int  not null default 120 check (duree between 10 and 1800),
  explication text not null default '',
  maj         timestamptz not null default now()
);

-- 1 bis. Liste des élèves de la classe (prof uniquement) ------------------------
create table if not exists public.eleves (
  id      uuid primary key default gen_random_uuid(),
  nom     text not null,
  prenom  text not null,
  maj     timestamptz not null default now()
);

-- 2. État partagé de la classe (une seule ligne, id = 1) ------------------------
create table if not exists public.etat (
  id               int primary key default 1 check (id = 1),
  mode             text not null default 'libre'
                   check (mode in ('libre', 'evaluation', 'fin', 'correction')),
  run_id           uuid,
  question_index   int not null default 0,
  question_debut   timestamptz,
  correction_index int not null default 0,
  maj              timestamptz not null default now()
);
insert into public.etat (id) values (1) on conflict (id) do nothing;

-- 3. Évaluations lancées et leurs questions (copie figée de la banque) ----------
create table if not exists public.evaluations (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null,
  creee_le     timestamptz not null default now(),
  nb_questions int  not null
);

create table if not exists public.evaluation_questions (
  run_id         uuid not null references public.evaluations (id) on delete cascade,
  idx            int  not null,
  notion         text not null,
  consigne       text not null,
  verif          text not null,
  tri            text not null,
  duree          int  not null,
  -- colonnes secrètes (jamais lisibles par les élèves) :
  solution       text not null,
  explication    text not null,
  empreinte      text not null,  -- hash du résultat attendu (l'ordre compte si tri <> 'non')
  empreinte_ens  text not null,  -- hash sans tenir compte de l'ordre (pour dire « mauvais ordre »)
  nb_lignes      int  not null,
  nb_colonnes    int  not null,
  primary key (run_id, idx)
);

-- 4. Tentatives des élèves --------------------------------------------------------
create table if not exists public.reponses (
  id             bigint generated always as identity primary key,
  run_id         uuid not null references public.evaluations (id) on delete cascade,
  eleve_id       uuid not null,
  eleve_nom      text not null check (char_length(eleve_nom) between 1 and 40),
  question_index int  not null,
  requete        text not null check (char_length(requete) <= 4000),
  correct        boolean not null,
  erreur         text check (char_length(erreur) <= 500),
  tentative      int  not null,
  affichee_le    timestamptz not null,  -- heure d'affichage de la question sur le poste de l'élève
  repondu_le     timestamptz not null,  -- heure de la tentative sur le poste de l'élève
  duree_ms       int  not null,         -- repondu_le - affichee_le
  recu_le        timestamptz not null default now()
);
create index if not exists reponses_run_idx on public.reponses (run_id, question_index, eleve_id);

-- 5. Droits ----------------------------------------------------------------------
-- « anon » = les élèves (sans compte), « authenticated » = le prof connecté.
alter table public.banque               enable row level security;
alter table public.eleves               enable row level security;
alter table public.etat                 enable row level security;
alter table public.evaluations          enable row level security;
alter table public.evaluation_questions enable row level security;
alter table public.reponses             enable row level security;

revoke all on public.banque, public.eleves, public.etat, public.evaluations, public.evaluation_questions, public.reponses from anon;
revoke all on public.banque, public.eleves, public.etat, public.evaluations, public.evaluation_questions, public.reponses from authenticated;

-- Prof : tous les droits
grant select, insert, update, delete on public.banque, public.eleves, public.evaluations, public.evaluation_questions to authenticated;
grant select, update on public.etat to authenticated;
grant select, delete on public.reponses to authenticated;

drop policy if exists "eleves prof" on public.eleves;
create policy "eleves prof" on public.eleves for all to authenticated using (true) with check (true);
drop policy if exists "banque prof" on public.banque;
create policy "banque prof" on public.banque for all to authenticated using (true) with check (true);
drop policy if exists "etat lecture" on public.etat;
create policy "etat lecture" on public.etat for select to anon, authenticated using (true);
drop policy if exists "etat prof" on public.etat;
create policy "etat prof" on public.etat for update to authenticated using (true) with check (true);
drop policy if exists "evaluations lecture" on public.evaluations;
create policy "evaluations lecture" on public.evaluations for select to anon, authenticated using (true);
drop policy if exists "evaluations prof" on public.evaluations;
create policy "evaluations prof" on public.evaluations for all to authenticated using (true) with check (true);
drop policy if exists "questions prof" on public.evaluation_questions;
create policy "questions prof" on public.evaluation_questions for all to authenticated using (true) with check (true);
drop policy if exists "reponses prof" on public.reponses;
create policy "reponses prof" on public.reponses for select to authenticated using (true);
drop policy if exists "reponses prof suppr" on public.reponses;
create policy "reponses prof suppr" on public.reponses for delete to authenticated using (true);

-- Élèves : l'état, les titres d'évaluations, et seulement les colonnes publiques
-- des questions déjà affichées (jamais solution, explication ni empreintes).
grant select on public.etat, public.evaluations to anon;
grant select (run_id, idx, notion, consigne, verif, tri, duree) on public.evaluation_questions to anon;
drop policy if exists "questions eleves" on public.evaluation_questions;
create policy "questions eleves" on public.evaluation_questions for select to anon
  using (exists (
    select 1 from public.etat e
    where e.id = 1 and e.run_id = evaluation_questions.run_id
      and (   (e.mode = 'evaluation' and evaluation_questions.idx <= e.question_index)
           or (e.mode in ('fin', 'correction')))
  ));
-- Pas de droit direct sur public.reponses pour les élèves : tout passe par soumettre().

-- 6. Fonctions -------------------------------------------------------------------
create or replace function public.heure_serveur()
returns timestamptz language sql stable as $$ select now() $$;

-- Passage à la question suivante quand le temps est écoulé (appelable par tous,
-- ne fait rien si le temps n'est pas vraiment écoulé).
create or replace function public.avancer_question(p_run uuid, p_depuis int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_duree int;
  v_nb int;
begin
  select duree into v_duree from evaluation_questions where run_id = p_run and idx = p_depuis;
  select nb_questions into v_nb from evaluations where id = p_run;
  if v_duree is null or v_nb is null then return; end if;
  update etat
     set question_index = p_depuis + 1,
         question_debut = now(),
         mode = case when p_depuis + 1 >= v_nb then 'fin' else 'evaluation' end,
         maj = now()
   where id = 1 and mode = 'evaluation' and run_id = p_run and question_index = p_depuis
     and now() >= question_debut + make_interval(secs => v_duree) - interval '2 seconds';
end $$;

-- Un élève soumet une requête. Le serveur décide si elle est juste.
-- Renvoie {"correct": bool, "tentative": n, "indice": "..."}.
create or replace function public.soumettre(
  p_run uuid, p_idx int, p_eleve_id uuid, p_eleve_nom text, p_requete text,
  p_empreinte text, p_empreinte_ens text, p_nb_lignes int, p_nb_colonnes int, p_erreur text,
  p_affichee_le timestamptz, p_repondu_le timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q evaluation_questions%rowtype;
  v_tentative int;
  v_correct boolean;
  v_indice text := '';
begin
  if not exists (select 1 from etat where id = 1 and mode = 'evaluation' and run_id = p_run and question_index = p_idx) then
    return jsonb_build_object('erreur', 'fermee');
  end if;
  if exists (select 1 from reponses where run_id = p_run and question_index = p_idx and eleve_id = p_eleve_id and correct) then
    return jsonb_build_object('erreur', 'deja');
  end if;
  select * into q from evaluation_questions where run_id = p_run and idx = p_idx;
  select count(*) + 1 into v_tentative from reponses where run_id = p_run and question_index = p_idx and eleve_id = p_eleve_id;
  if v_tentative > 200 then return jsonb_build_object('erreur', 'trop'); end if;

  v_correct := p_erreur is null and p_empreinte is not null and p_empreinte = q.empreinte;
  if not v_correct and p_erreur is null then
    if q.verif = 'valeurs' and p_nb_colonnes is distinct from q.nb_colonnes then
      v_indice := format('Il faut %s colonne(s), ta requête en renvoie %s.', q.nb_colonnes, p_nb_colonnes);
    elsif p_nb_lignes > q.nb_lignes then
      v_indice := format('Pas tout à fait : ta requête renvoie %s ligne(s), c''est trop.', p_nb_lignes);
    elsif p_nb_lignes < q.nb_lignes then
      v_indice := format('Pas tout à fait : ta requête renvoie %s ligne(s), il en manque.', p_nb_lignes);
    elsif q.tri <> 'non' and p_empreinte_ens = q.empreinte_ens then
      v_indice := 'Les bonnes lignes, mais pas dans le bon ordre.';
    else
      v_indice := 'Le bon nombre de lignes, mais pas les bonnes.';
    end if;
  end if;

  insert into reponses (run_id, eleve_id, eleve_nom, question_index, requete, correct, erreur, tentative,
                        affichee_le, repondu_le, duree_ms)
  values (p_run, p_eleve_id, left(coalesce(nullif(trim(p_eleve_nom), ''), '?'), 40), p_idx, left(p_requete, 4000),
          v_correct, left(coalesce(p_erreur, nullif(v_indice, '')), 500), v_tentative,
          p_affichee_le, p_repondu_le,
          greatest(0, least(86400000, (extract(epoch from (p_repondu_le - p_affichee_le)) * 1000)::bigint))::int);

  return jsonb_build_object('correct', v_correct, 'tentative', v_tentative, 'indice', v_indice);
end $$;

-- Solution et explication d'une question, seulement pendant sa correction.
create or replace function public.question_corrigee(p_run uuid, p_idx int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('solution', q.solution, 'explication', q.explication)
    from evaluation_questions q
    join etat e on e.id = 1 and e.mode = 'correction' and e.run_id = q.run_id and q.idx <= e.correction_index
   where q.run_id = p_run and q.idx = p_idx
$$;

revoke all on function public.avancer_question(uuid, int) from public;
revoke all on function public.soumettre(uuid, int, uuid, text, text, text, text, int, int, text, timestamptz, timestamptz) from public;
revoke all on function public.question_corrigee(uuid, int) from public;
grant execute on function public.heure_serveur() to anon, authenticated;
grant execute on function public.avancer_question(uuid, int) to anon, authenticated;
grant execute on function public.soumettre(uuid, int, uuid, text, text, text, text, int, int, text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.question_corrigee(uuid, int) to anon, authenticated;

-- 7. Temps réel : les postes sont prévenus dès que l'état change ----------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'etat'
  ) then
    alter publication supabase_realtime add table public.etat;
  end if;
end $$;
