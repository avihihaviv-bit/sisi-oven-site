-- ============================================================================
-- התנור של סבתא סיסי — database schema
--
-- Run this once in the Supabase SQL editor.
--
-- Security model: every table has Row Level Security on, and the policies are
-- what actually stop a stranger writing to the menu. The browser only ever
-- holds the anon key, which Supabase publishes on purpose; it grants nothing
-- beyond what the policies below allow. Hiding the admin link would not be
-- security, so none of this depends on that.
-- ============================================================================

-- ---------- who is allowed to manage the site ----------
create table if not exists public.staff (
  id          uuid primary key references auth.users on delete cascade,
  role        text not null default 'staff' check (role in ('admin','staff')),
  display_name text,
  created_at  timestamptz not null default now()
);

-- helpers used by every policy below. security definer so a caller cannot
-- read the staff table directly to answer the question.
create or replace function public.is_staff() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and role = 'admin');
$$;

-- ---------- categories ----------
create table if not exists public.categories (
  id      bigint generated always as identity primary key,
  name    text not null unique,
  sort    int  not null default 0,
  hidden  boolean not null default false
);

-- ---------- products ----------
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text not null default '',
  price       numeric(8,2),                 -- null means "ask by phone"
  sale_price  numeric(8,2),                 -- null means not on offer
  category    text not null references public.categories(name) on update cascade,
  tags        text[] not null default '{}', -- טבעוני, חריף, פופולארי, מכיל בשר
  image_url   text,
  sort        int not null default 0,
  available   boolean not null default true,   -- false shows "אזל מהמלאי"
  hidden      boolean not null default false,  -- true removes it from the site
  updated_at  timestamptz not null default now(),
  constraint price_not_negative      check (price is null or price >= 0),
  constraint sale_price_not_negative check (sale_price is null or sale_price >= 0),
  constraint sale_below_price        check (sale_price is null or price is null or sale_price <= price)
);

create index if not exists products_category_idx on public.products (category, sort);

-- ---------- business settings: one row, edited in the panel ----------
create table if not exists public.settings (
  id               int primary key default 1 check (id = 1),
  business_name    text not null default 'התנור של סבתא סיסי',
  phone            text not null default '',
  whatsapp         text not null default '',
  address          text not null default '',
  accepting_orders boolean not null default true,  -- the "we are swamped" switch
  notice           text not null default '',       -- shown on the site when not empty
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- keep updated_at honest ----------
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.staff      enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.settings   enable row level security;

-- the public site reads the menu; it can never write it
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to anon, authenticated using (true);

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to anon, authenticated using (true);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated using (true);

-- staff manage the menu
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- only an admin changes the business settings
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- staff can see who they are; only an admin manages the staff list
drop policy if exists staff_read_self on public.staff;
create policy staff_read_self on public.staff for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists staff_admin_write on public.staff;
create policy staff_admin_write on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- a category that still holds products cannot be deleted by accident
create or replace function public.block_category_delete() returns trigger
  language plpgsql as $$
  declare n int;
  begin
    select count(*) into n from public.products where category = old.name;
    if n > 0 then
      raise exception 'הקטגוריה "%" מכילה % מנות. העבירו או מחקו אותן קודם.', old.name, n;
    end if;
    return old;
  end $$;

drop trigger if exists categories_guard on public.categories;
create trigger categories_guard before delete on public.categories
  for each row execute function public.block_category_delete();
-- seed: the 40 dishes currently on the site, extracted from index.html
insert into categories (name, sort) values
  ('פיתות', 0),
  ('באגטים', 10),
  ('התבשילים של סבתא סיסי', 20),
  ('סלטים ביתיים במשקל', 30),
  ('נשנושים בצד', 40),
  ('מתוקים', 50),
  ('שתייה קלה', 60)
on conflict (name) do nothing;

insert into products (name, description, price, category, tags, sort, available) values
  ('פיתה קציצות עירוק', 'העירוק המפורסם של סבתא סיסי. 2 קציצות עירוק ביתיות עסיסיות עשויות תפוח אדמה, גזר, קישוא, פטרוזיליה ובצל. מוגש בפיתה עם ממרחים וסלטים לבחירה.', 30, 'פיתות', '{"פופולארי"}', 0, true),
  ('פיתה סביח הבית', 'מנת סביח עם ביצה, חציל מטוגן ותפוח אדמה מבושל. מוגש בפיתה עם ממרחים וסלטים לבחירה.', 29, 'פיתות', '{}', 10, true),
  ('פיתה פלאפל ירוק', 'כדורי פלאפל פריכים עם עשבי תיבול. מוגש בפיתה עם ממרחים וסלטים לבחירה.', 26, 'פיתות', '{}', 20, true),
  ('פיתה קובה בורגול מטוגנת', 'קובה בורגול מטוגנת במילוי פטריות ותפוח אדמה. מוגש בפיתה עם ממרחים וסלטים לבחירה.', 28, 'פיתות', '{}', 30, true),
  ('באגט קציצות עירוק', 'העירוק המפורסם של סבתא סיסי. 3 קציצות עירוק ביתיות עסיסיות עשויות תפוח אדמה, גזר, קישוא, פטרוזיליה ובצל. מוגש בבאגט עם ממרחים וסלטים לבחירה.', 38, 'באגטים', '{"פופולארי"}', 40, true),
  ('באגט סביח הבית', 'מנת סביח עם 2 ביצים, חציל מטוגן ותפוח אדמה מבושל. מוגש בבאגט עם ממרחים וסלטים לבחירה.', 36, 'באגטים', '{}', 50, true),
  ('באגט פלאפל ירוק', 'כדורי פלאפל פריכים עם עשבי תיבול. מוגש בבאגט עם ממרחים וסלטים לבחירה.', 32, 'באגטים', '{}', 60, true),
  ('באגט קובה בורגול מטוגנת', 'קובה בורגול מטוגנת במילוי פטריות ותפוח אדמה. מוגש בבאגט עם ממרחים וסלטים לבחירה.', 38, 'באגטים', '{}', 70, true),
  ('קוסקוס עננים עם מרק ירקות', 'קוסקוס אוורירי מוגש עם מרק ירקות מעל. המרק מכיל תפוח אדמה, גזר, קישוא, דלעת, בטטה, חומוס גרגירים, בצל וסלרי.', null, 'התבשילים של סבתא סיסי', '{"פופולארי","טבעוני"}', 80, true),
  ('קוסקוס עננים', 'קוסקוס אוורירי.', null, 'התבשילים של סבתא סיסי', '{"טבעוני"}', 90, true),
  ('מרק ירקות עשיר', 'מרק ירקות עם תפוח אדמה, גזר, קישוא, דלעת, בטטה, חומוס גרגירים, בצל וסלרי.', null, 'התבשילים של סבתא סיסי', '{"פופולארי","טבעוני"}', 100, true),
  ('מרק שעועית מרוקאי', 'מרק שעועית עם עגבניות, בצל, שום, כמון ופפריקה.', null, 'התבשילים של סבתא סיסי', '{"טבעוני"}', 110, true),
  ('אורז לבן עם שעועית', 'אורז לבן מוגש עם תבשיל שעועית מעל. התבשיל מכיל שעועית ברוטב עגבניות, בצל ושום.', null, 'התבשילים של סבתא סיסי', '{"טבעוני"}', 120, true),
  ('אורז לבן', 'אורז לבן.', null, 'התבשילים של סבתא סיסי', '{"טבעוני"}', 130, true),
  ('מטבוחה', 'מטבוחה עם עגבניות ושום.', 24, 'סלטים ביתיים במשקל', '{"טבעוני"}', 140, true),
  ('טחינה', 'טחינה ביתית.', 20, 'סלטים ביתיים במשקל', '{"טבעוני"}', 150, true),
  ('חומוס', 'חומוס ביתי.', 18, 'סלטים ביתיים במשקל', '{"טבעוני"}', 160, true),
  ('סחוג אדום', 'פלפל אדום חריף ושום. חריף מאוד.', 20, 'סלטים ביתיים במשקל', '{"טבעוני","חריף מאוד"}', 170, true),
  ('סחוג ירוק', 'פלפל ירוק, שום ופטרוזיליה. חריף.', 20, 'סלטים ביתיים במשקל', '{"טבעוני","חריף"}', 180, true),
  ('כרוב לבן', 'כרוב לבן עם לימון, חומץ, מלח וסוכר.', 15, 'סלטים ביתיים במשקל', '{"טבעוני"}', 190, true),
  ('כרוב סגול במיונז', 'כרוב סגול במיונז.', 17, 'סלטים ביתיים במשקל', '{}', 200, true),
  ('קולסלאו', 'כרוב לבן, גזר ומיונז.', 20, 'סלטים ביתיים במשקל', '{}', 210, true),
  ('חציל במיונז', 'חציל על האש במיונז.', 20, 'סלטים ביתיים במשקל', '{}', 220, true),
  ('סלט סלק מבושל', 'סלק, לימון ושום.', 18, 'סלטים ביתיים במשקל', '{}', 230, true),
  ('קציצת עירוק', 'יחידה אחת. קציצת עירוק עם בצל, גזר, תפוח אדמה, קישוא ופטרוזיליה.', 8, 'נשנושים בצד', '{"פופולארי"}', 240, true),
  ('קובה בורגול', 'יחידה אחת. קובה בורגול מטוגנת במילוי בשר.', 8, 'נשנושים בצד', '{"מכיל בשר"}', 250, true),
  ('כדורי פלאפל', '5 יחידות.', 10, 'נשנושים בצד', '{}', 260, true),
  ('צ''יפס תפוחי אדמה', '', 20, 'נשנושים בצד', '{}', 270, true),
  ('מלבי קלאסי', 'שמנת צמחית, סוכר, קורנפלור ותמצית מי ורדים. מוגש לצד שברי קוקוס ובוטנים קצוצים.', 14, 'מתוקים', '{"טבעוני"}', 280, true),
  ('קרם בווריה', 'שמנת צמחית, קורנפלור וסוכר. מוגש לצד סירופ שוקולד ושברי ביסקוויטים.', 14, 'מתוקים', '{"טבעוני"}', 290, true),
  ('מים מינרליים עין גדי', 'בקבוק 0.5 ליטר.', 9, 'שתייה קלה', '{"פופולארי"}', 300, true),
  ('סודה טמפו', 'בקבוק זכוכית 275 מ"ל.', 9, 'שתייה קלה', '{}', 310, true),
  ('קוקה קולה', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{"פופולארי"}', 320, true),
  ('קוקה קולה זירו', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 330, true),
  ('פפסי', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 340, true),
  ('פפסי מקס', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 350, true),
  ('מירינדה', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 360, true),
  ('7UP זירו', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 370, true),
  ('שוופס תותית', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 380, true),
  ('מיץ פז ענבים', 'פחית 330 מ"ל.', 10, 'שתייה קלה', '{}', 390, true)
on conflict (name) do nothing;
