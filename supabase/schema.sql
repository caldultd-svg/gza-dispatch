-- =====================================================================
--  Gza Dispatch — database schema for Supabase
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to re-run: it drops nothing that holds data.
-- =====================================================================

-- ---------- helpers: roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending' check (role in ('owner','dispatcher','driver','pending','blocked')),
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  photo_path text,
  languages text not null default '',
  license_until date,
  vehicle_id uuid,
  duty text not null default 'on' check (duty in ('on','off')),
  color text,
  -- legal / bank (visible to owner + dispatchers only)
  legal_type text not null default 'individual' check (legal_type in ('individual','ie','llc')),
  legal_name text not null default '',
  legal_id text not null default '',
  iban text not null default '',
  bank text not null default '',
  -- pay rules (each driver can have a different mix)
  pay_trip numeric not null default 0,      -- per transfer
  pay_day numeric not null default 0,       -- per tour day
  pay_percent numeric not null default 0,   -- % of order price
  pay_monthly numeric not null default 0,   -- fixed monthly
  per_diem numeric not null default 0,      -- per tour day, on top
  pay_currency text not null default 'GEL',
  -- telegram + location
  tg_chat_id bigint,
  tg_code text not null default substr(replace(gen_random_uuid()::text,'-',''),1,12),
  loc_lat double precision,
  loc_lng double precision,
  loc_at timestamptz,
  loc_src text,
  notes text not null default '',
  lang text not null default 'ka',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists lang text not null default 'ka';

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('owner','dispatcher') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_driver() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'driver' from public.profiles where id = auth.uid()), false) $$;

-- first account to sign up becomes the owner; everyone after waits for approval
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    case when exists (select 1 from public.profiles where role = 'owner') then 'pending' else 'owner' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- people may edit their own card, but not their role, pay or telegram link
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- server / service role
  if public.is_owner() then return new; end if;
  if public.is_staff() then
    if old.role = 'owner' or new.role = 'owner' then new.role := old.role; end if;
    return new;
  end if;
  new.role := old.role;
  new.pay_trip := old.pay_trip; new.pay_day := old.pay_day; new.pay_percent := old.pay_percent;
  new.pay_monthly := old.pay_monthly; new.per_diem := old.per_diem; new.pay_currency := old.pay_currency;
  new.tg_chat_id := old.tg_chat_id; new.tg_code := old.tg_code;
  new.notes := old.notes; new.color := old.color;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
for each row execute function public.protect_profile();

-- ---------- settings (one row) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company text not null default '',
  usd numeric not null default 2.70,
  eur numeric not null default 3.00,
  def_cur text not null default 'GEL',
  digest_hour int not null default 19,
  gas_url text not null default '',
  gas_secret text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- fleet ----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  model text not null default '',
  vclass text not null default 'sedan',
  seats int not null default 4,
  year int,
  color text not null default '',
  insurance_until date,
  inspection_until date,
  owner text not null default '',
  odometer int not null default 0,
  oil_km int,
  oil_date date,
  oil_interval int not null default 10000,
  active boolean not null default true,
  photo_path text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.profiles add constraint profiles_vehicle_fk foreign key (vehicle_id) references public.vehicles(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ctype text not null default 'person',
  phone text not null default '',
  email text not null default '',
  contact_name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tariffs (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  from_place text not null default '',
  to_place text not null default '',
  vclass text not null default 'sedan',
  price numeric not null default 0,
  currency text not null default 'GEL',
  duration int not null default 60,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- transfers ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'transfer',
  status text not null default 'new' check (status in ('new','assigned','en_route','arrived','onboard','done','cancelled')),
  date date not null,
  time text not null default '',
  duration int not null default 60,
  pickup text not null default '',
  dropoff text not null default '',
  stops text not null default '',
  flight text not null default '',
  sign text not null default '',
  pax int not null default 1,
  luggage int not null default 0,
  child_seats int not null default 0,
  wheelchair boolean not null default false,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '',
  passenger_name text not null default '',
  passenger_phone text not null default '',
  contact_org text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  cost_center text not null default '',
  vclass text not null default 'sedan',
  driver_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  accept text not null default 'none' check (accept in ('none','pending','accepted','declined')),
  partner_name text not null default '',
  partner_cost numeric not null default 0,
  price numeric not null default 0,
  currency text not null default 'GEL',
  payment text not null default 'cash',
  paid boolean not null default false,
  driver_pay numeric not null default 0,
  notes text not null default '',
  special text not null default '',
  log jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_date_idx on public.orders(date);
create index if not exists orders_driver_idx on public.orders(driver_id);

-- ---------- tours (multi-day) ----------
create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  status text not null default 'confirmed' check (status in ('planned','confirmed','ongoing','done','cancelled')),
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '',
  contact_org text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  group_size int not null default 1,
  date_from date not null,
  date_to date not null,
  start_time text not null default '',
  guide text not null default '',
  guide_phone text not null default '',
  price numeric not null default 0,
  currency text not null default 'GEL',
  payment text not null default 'invoice',
  paid boolean not null default false,
  km int not null default 0,
  driver_hotel numeric not null default 0,
  other_cost numeric not null default 0,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tour_days (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  idx int not null default 0,
  date date not null,
  from_place text not null default '',
  to_place text not null default '',
  stops text not null default '',
  hotel text not null default '',
  note text not null default '',
  driver_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  accept text not null default 'none' check (accept in ('none','pending','accepted','declined')),
  driver_pay numeric not null default 0,
  per_diem numeric not null default 0
);
create index if not exists tour_days_tour_idx on public.tour_days(tour_id);
create index if not exists tour_days_driver_idx on public.tour_days(driver_id, date);

-- ---------- driver-entered records ----------
create table if not exists public.fuel (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  station text not null default '',
  liters numeric not null default 0,
  price_l numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'GEL',
  odometer int,
  paid_by text not null default 'driver' check (paid_by in ('driver','company','card')),
  reimbursed boolean not null default false,
  photo_path text,
  order_id uuid references public.orders(id) on delete set null,
  tour_id uuid references public.tours(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'parking' check (category in ('parking','wash','repair','fine','toll','border','other')),
  driver_id uuid references public.profiles(id) on delete set null default auth.uid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  at timestamptz not null default now(),
  place text not null default '',
  amount numeric not null default 0,
  currency text not null default 'GEL',
  paid_by text not null default 'driver' check (paid_by in ('driver','company','client')),
  deduct boolean not null default false,       -- e.g. a fine charged to the driver
  reimbursed boolean not null default false,
  photo_path text,
  order_id uuid references public.orders(id) on delete set null,
  tour_id uuid references public.tours(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.odometer (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.profiles(id) on delete set null default auth.uid(),
  km int not null,
  at timestamptz not null default now(),
  photo_path text,
  order_id uuid references public.orders(id) on delete set null,
  tour_id uuid references public.tours(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null default auth.uid(),
  at timestamptz not null default now(),
  kind text not null default 'start' check (kind in ('start','end','other')),
  photos text[] not null default '{}',
  damage boolean not null default false,
  order_id uuid references public.orders(id) on delete set null,
  tour_id uuid references public.tours(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.days_off (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  date_from date not null,
  date_to date not null,
  reason text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- staff-only records ----------
create table if not exists public.service_log (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null default 'oil' check (kind in ('oil','tires','brakes','belt','battery','other')),
  km int,
  at date not null default current_date,
  cost numeric not null default 0,
  currency text not null default 'GEL',
  photo_path text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.advances (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  at date not null default current_date,
  kind text not null default 'advance' check (kind in ('advance','payout','bonus')),
  amount numeric not null default 0,
  currency text not null default 'GEL',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.notif_log (
  key text primary key,
  at timestamptz not null default now()
);

-- ---------- automatic updates ----------
create or replace function public.touch_updated() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated();
drop trigger if exists tours_touch on public.tours;
create trigger tours_touch before update on public.tours for each row execute function public.touch_updated();

create or replace function public.bump_odometer() returns trigger
language plpgsql security definer set search_path = public as $$
declare k int;
begin
  if tg_table_name = 'fuel' then k := new.odometer; else k := new.km; end if;
  if k is not null and new.vehicle_id is not null then
    update public.vehicles set odometer = greatest(coalesce(odometer,0), k) where id = new.vehicle_id;
  end if;
  return new;
end $$;
drop trigger if exists odometer_bump on public.odometer;
create trigger odometer_bump after insert on public.odometer for each row execute function public.bump_odometer();
drop trigger if exists fuel_bump on public.fuel;
create trigger fuel_bump after insert on public.fuel for each row execute function public.bump_odometer();

create or replace function public.service_oil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'oil' then
    update public.vehicles set oil_km = coalesce(new.km, oil_km), oil_date = new.at where id = new.vehicle_id;
  end if;
  if new.km is not null then
    update public.vehicles set odometer = greatest(coalesce(odometer,0), new.km) where id = new.vehicle_id;
  end if;
  return new;
end $$;
drop trigger if exists service_oil on public.service_log;
create trigger service_oil after insert on public.service_log for each row execute function public.service_oil();

-- ---------- row-level security ----------
alter table public.profiles    enable row level security;
alter table public.settings    enable row level security;
alter table public.vehicles    enable row level security;
alter table public.clients     enable row level security;
alter table public.tariffs     enable row level security;
alter table public.orders      enable row level security;
alter table public.tours       enable row level security;
alter table public.tour_days   enable row level security;
alter table public.fuel        enable row level security;
alter table public.expenses    enable row level security;
alter table public.odometer    enable row level security;
alter table public.inspections enable row level security;
alter table public.days_off    enable row level security;
alter table public.service_log enable row level security;
alter table public.advances    enable row level security;
alter table public.notif_log   enable row level security;

-- profiles
drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update to authenticated using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());
drop policy if exists p_del on public.profiles;
create policy p_del on public.profiles for delete to authenticated using (public.is_owner() and id <> auth.uid());

-- settings
drop policy if exists s_sel on public.settings;
create policy s_sel on public.settings for select to authenticated using (public.is_staff());
drop policy if exists s_upd on public.settings;
create policy s_upd on public.settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- vehicles: drivers can read (to pick a car), staff write
drop policy if exists v_sel on public.vehicles;
create policy v_sel on public.vehicles for select to authenticated using (public.is_staff() or public.is_driver());
drop policy if exists v_all on public.vehicles;
create policy v_all on public.vehicles for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- staff-only tables
do $$
declare t text;
begin
  foreach t in array array['clients','tariffs','orders','tours','tour_days','service_log'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- driver-entered tables: driver sees and adds own rows, may delete own rows for 24 h; staff everything
do $$
declare t text;
begin
  foreach t in array array['fuel','expenses','odometer','inspections','days_off'] loop
    execute format('drop policy if exists own_sel on public.%I', t);
    execute format('create policy own_sel on public.%I for select to authenticated using (public.is_staff() or driver_id = auth.uid())', t);
    execute format('drop policy if exists own_ins on public.%I', t);
    execute format('create policy own_ins on public.%I for insert to authenticated with check (public.is_staff() or (public.is_driver() and driver_id = auth.uid()))', t);
    execute format('drop policy if exists staff_upd on public.%I', t);
    execute format('create policy staff_upd on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('drop policy if exists own_del on public.%I', t);
    execute format('create policy own_del on public.%I for delete to authenticated using (public.is_staff() or (driver_id = auth.uid() and created_at > now() - interval ''24 hours''))', t);
  end loop;
end $$;

-- advances: staff write, driver reads own
drop policy if exists a_sel on public.advances;
create policy a_sel on public.advances for select to authenticated using (public.is_staff() or driver_id = auth.uid());
drop policy if exists a_all on public.advances;
create policy a_all on public.advances for all to authenticated using (public.is_staff()) with check (public.is_staff());
-- notif_log: no policies → only the server (service role) touches it

-- ---------- driver functions (drivers never read orders/tours tables directly) ----------
create or replace function public.my_jobs() returns jsonb
language sql stable security definer set search_path = public as $$
select jsonb_build_object(
  'orders', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'type', o.type, 'status', o.status, 'date', o.date, 'time', o.time, 'duration', o.duration,
      'pickup', o.pickup, 'dropoff', o.dropoff, 'stops', o.stops, 'flight', o.flight, 'sign', o.sign,
      'pax', o.pax, 'luggage', o.luggage, 'child_seats', o.child_seats, 'wheelchair', o.wheelchair,
      'passenger_name', o.passenger_name, 'passenger_phone', o.passenger_phone,
      'contact_org', o.contact_org, 'contact_name', o.contact_name, 'contact_phone', o.contact_phone,
      'vehicle_id', o.vehicle_id, 'accept', o.accept, 'notes', o.notes, 'special', o.special,
      'driver_pay', o.driver_pay,
      'collect', case when o.payment = 'cash' and not o.paid then o.price else null end,
      'currency', o.currency) order by o.date, o.time)
    from public.orders o
    where o.driver_id = auth.uid() and o.date >= current_date - 31 and o.status <> 'cancelled'), '[]'::jsonb),
  'tours', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'status', t.status, 'client_name', t.client_name, 'group_size', t.group_size,
      'date_from', t.date_from, 'date_to', t.date_to, 'start_time', t.start_time,
      'guide', t.guide, 'guide_phone', t.guide_phone,
      'contact_org', t.contact_org, 'contact_name', t.contact_name, 'contact_phone', t.contact_phone, 'notes', t.notes,
      'days', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'idx', d.idx, 'date', d.date, 'from_place', d.from_place, 'to_place', d.to_place,
          'stops', d.stops, 'hotel', d.hotel, 'note', d.note, 'vehicle_id', d.vehicle_id,
          'mine', d.driver_id = auth.uid(), 'accept', case when d.driver_id = auth.uid() then d.accept end,
          'driver_pay', case when d.driver_id = auth.uid() then d.driver_pay end,
          'per_diem', case when d.driver_id = auth.uid() then d.per_diem end) order by d.idx, d.date), '[]'::jsonb)
        from public.tour_days d where d.tour_id = t.id)) order by t.date_from)
    from public.tours t
    where t.status <> 'cancelled' and t.date_to >= current_date - 31
      and exists (select 1 from public.tour_days d where d.tour_id = t.id and d.driver_id = auth.uid())), '[]'::jsonb)
);
$$;

create or replace function public.driver_order_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('en_route','arrived','onboard','done') then raise exception 'bad status'; end if;
  update public.orders
     set status = p_status,
         accept = case when accept in ('none','pending') then 'accepted' else accept end,
         log = log || jsonb_build_object(p_status, now())
   where id = p_id and driver_id = auth.uid();
  if not found then raise exception 'not your order'; end if;
end $$;

create or replace function public.driver_tour_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ongoing','done') then raise exception 'bad status'; end if;
  if not exists (select 1 from public.tour_days where tour_id = p_id and driver_id = auth.uid()) then
    raise exception 'not your tour';
  end if;
  update public.tours set status = p_status where id = p_id;
end $$;

-- accept / decline a request (used by the app; the Telegram bot does the same server-side)
create or replace function public.driver_respond(p_kind text, p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'order' then
    if p_accept then
      update public.orders set accept = 'accepted' where id = p_id and driver_id = auth.uid();
    else
      update public.orders set accept = 'declined', driver_id = null, vehicle_id = null,
             status = case when status = 'assigned' then 'new' else status end
       where id = p_id and driver_id = auth.uid();
    end if;
  elsif p_kind = 'tour' then
    if p_accept then
      update public.tour_days set accept = 'accepted' where tour_id = p_id and driver_id = auth.uid();
    else
      update public.tour_days set accept = 'declined', driver_id = null where tour_id = p_id and driver_id = auth.uid();
    end if;
  else
    raise exception 'bad kind';
  end if;
  if not found then raise exception 'not yours'; end if;
end $$;

create or replace function public.report_location(p_lat double precision, p_lng double precision) returns void
language sql security definer set search_path = public as $$
  update public.profiles set loc_lat = p_lat, loc_lng = p_lng, loc_at = now(), loc_src = 'app' where id = auth.uid();
$$;

-- basic info every signed-in person may read
create or replace function public.app_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company', company, 'usd', usd, 'eur', eur, 'def_cur', def_cur) from public.settings where id = 1;
$$;

revoke all on function public.my_jobs() from public, anon;
revoke all on function public.driver_order_status(uuid, text) from public, anon;
revoke all on function public.driver_tour_status(uuid, text) from public, anon;
revoke all on function public.driver_respond(text, uuid, boolean) from public, anon;
revoke all on function public.report_location(double precision, double precision) from public, anon;
revoke all on function public.app_info() from public, anon;
grant execute on function public.my_jobs() to authenticated;
grant execute on function public.driver_order_status(uuid, text) to authenticated;
grant execute on function public.driver_tour_status(uuid, text) to authenticated;
grant execute on function public.driver_respond(text, uuid, boolean) to authenticated;
grant execute on function public.report_location(double precision, double precision) to authenticated;
grant execute on function public.app_info() to authenticated;

-- ---------- photo storage (private bucket) ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;

drop policy if exists gza_photos_read on storage.objects;
create policy gza_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists gza_photos_insert on storage.objects;
create policy gza_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists gza_photos_delete on storage.objects;
create policy gza_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (public.is_staff() or (storage.foldername(name))[1] = auth.uid()::text));

-- ---------- live updates for the dispatcher screen ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','vehicles','clients','tariffs','orders','tours','tour_days','fuel','expenses','odometer','inspections','days_off','service_log','advances','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
