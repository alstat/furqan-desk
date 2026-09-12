-- Starter tier, and a daily token window for the Free tier.
--
-- Two changes land together because they are the same shape of change:
--
--   * Starter is a paid tier between Free and Pro. It spends the Standard
--     model on a paid quota and has no Advanced allowance at all, so its
--     advanced weekly/monthly caps are zero.
--
--   * Free accounts are no longer locked out of the AI. They get a small
--     DAILY allowance instead, which is a different window from the rolling
--     7-day budget the paid tiers manage.
--
-- SENTINEL, and note it differs between the daily and the weekly/monthly
-- columns:
--
--   daily_tokens / advanced_daily_tokens  — 0 means "this tier has no daily
--       ceiling", which is what every paid tier wants. daily_tokens already
--       existed on this table as NOT NULL, so 0 rather than NULL has to carry
--       that meaning.
--   weekly / monthly columns              — 0 means a cap of zero, i.e. that
--       pool is closed. This is how Free and Starter are denied the Advanced
--       model.
--
-- The asymmetry is deliberate: a tier with no daily limit still has a real
-- weekly one, so "unset" and "zero" must be distinguishable for the daily
-- window and must NOT be for the weekly one.

alter table public.tier_limits
    add column if not exists daily_tokens bigint not null default 0,
    add column if not exists advanced_daily_tokens bigint not null default 0;

-- Normalise in case an earlier run added either column as nullable, so the
-- app and the edge function can read them without a null check.
update public.tier_limits
   set daily_tokens = coalesce(daily_tokens, 0),
       advanced_daily_tokens = coalesce(advanced_daily_tokens, 0);

alter table public.tier_limits
    alter column daily_tokens set default 0,
    alter column advanced_daily_tokens set default 0;

alter table public.tier_limits
    alter column daily_tokens set not null,
    alter column advanced_daily_tokens set not null;

comment on column public.tier_limits.daily_tokens is
    'Standard-model tokens per rolling 24h. 0 = no daily ceiling (the paid '
    'tiers budget weekly instead); a positive value is enforced by the '
    'chat-completion edge function alongside the weekly and monthly caps.';
comment on column public.tier_limits.advanced_daily_tokens is
    'Advanced-model equivalent of daily_tokens. 0 = no daily ceiling. Tiers '
    'with no Advanced access are denied it through advanced_weekly_tokens, '
    'not through this column.';


-- Seed every tier's allowance.
--
-- UPDATE-then-INSERT rather than ON CONFLICT: it needs no unique constraint on
-- `tier`, and a legacy `free` row (from when Free had no AI) carries zeros
-- across the board, which ON CONFLICT ... DO NOTHING would have left in place.
-- A zero weekly cap is not "unconfigured", it is a cap that blocks every
-- request, and a zero storage_bytes refuses the first message an account ever
-- sends.
--
-- THE NUMBERS ARE MONTHLY BUDGETS, and the website's pricing page quotes them:
--
--   free      150,000 standard
--   starter   1,000,000 standard
--   pro       2,000,000 standard   500,000 advanced
--   pro_plus  8,000,000 standard   2,000,000 advanced
--
-- weekly_tokens is a quarter of the monthly figure. A 30-day month holds about
-- 4.3 weeks, so a quarter leaves a little headroom: a heavy week can borrow
-- from the ones around it without the weekly cap binding before the monthly
-- one, which stays the real backstop. Keep this file and src/lib/tiers.ts in
-- the website repo in step — nothing checks them against each other.
--
-- Free is the exception: its daily allowance is the cap that binds, so its
-- weekly and monthly figures are just 7x and 30x the daily rate and can never
-- stop it first.

-- Free: 5,000 standard tokens a day → 150,000 a month. No Advanced.
update public.tier_limits set
    daily_tokens            = 5000,
    weekly_tokens           = 35000,
    monthly_tokens          = 150000,
    advanced_daily_tokens   = 0,
    advanced_weekly_tokens  = 0,
    advanced_monthly_tokens = 0,
    storage_bytes           = coalesce(nullif(storage_bytes, 0), 5242880)
where tier = 'free';

insert into public.tier_limits (
    tier, daily_tokens, weekly_tokens, monthly_tokens,
    advanced_daily_tokens, advanced_weekly_tokens, advanced_monthly_tokens,
    storage_bytes
)
select 'free', 5000, 35000, 150000, 0, 0, 0, 5242880
where not exists (select 1 from public.tier_limits where tier = 'free');

-- Starter: 1M standard a month, no daily ceiling, no Advanced.
update public.tier_limits set
    daily_tokens            = 0,
    weekly_tokens           = 250000,
    monthly_tokens          = 1000000,
    advanced_daily_tokens   = 0,
    advanced_weekly_tokens  = 0,
    advanced_monthly_tokens = 0,
    storage_bytes           = coalesce(nullif(storage_bytes, 0), 104857600)
where tier = 'starter';

insert into public.tier_limits (
    tier, daily_tokens, weekly_tokens, monthly_tokens,
    advanced_daily_tokens, advanced_weekly_tokens, advanced_monthly_tokens,
    storage_bytes
)
select 'starter', 0, 250000, 1000000, 0, 0, 0, 104857600
where not exists (select 1 from public.tier_limits where tier = 'starter');

-- Pro: 2M standard + 500K advanced a month.
update public.tier_limits set
    daily_tokens            = 0,
    weekly_tokens           = 500000,
    monthly_tokens          = 2000000,
    advanced_daily_tokens   = 0,
    advanced_weekly_tokens  = 125000,
    advanced_monthly_tokens = 500000,
    storage_bytes           = coalesce(nullif(storage_bytes, 0), 524288000)
where tier = 'pro';

insert into public.tier_limits (
    tier, daily_tokens, weekly_tokens, monthly_tokens,
    advanced_daily_tokens, advanced_weekly_tokens, advanced_monthly_tokens,
    storage_bytes
)
select 'pro', 0, 500000, 2000000, 0, 125000, 500000, 524288000
where not exists (select 1 from public.tier_limits where tier = 'pro');

-- Pro+: 8M standard + 2M advanced a month.
update public.tier_limits set
    daily_tokens            = 0,
    weekly_tokens           = 2000000,
    monthly_tokens          = 8000000,
    advanced_daily_tokens   = 0,
    advanced_weekly_tokens  = 500000,
    advanced_monthly_tokens = 2000000,
    storage_bytes           = coalesce(nullif(storage_bytes, 0), 2147483648)
where tier = 'pro_plus';

insert into public.tier_limits (
    tier, daily_tokens, weekly_tokens, monthly_tokens,
    advanced_daily_tokens, advanced_weekly_tokens, advanced_monthly_tokens,
    storage_bytes
)
select 'pro_plus', 0, 2000000, 8000000, 0, 500000, 2000000, 2147483648
where not exists (select 1 from public.tier_limits where tier = 'pro_plus');


-- Both aggregates gain the 24h window. The grid is what decides which windows
-- come back, so adding 86400 to it is the whole change — callers that only
-- care about the weekly and monthly rows are unaffected, they simply see one
-- more row per pool.
create or replace function public.token_usage_windows()
returns table (
    pool text,
    window_seconds integer,
    used bigint,
    oldest_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
    with grid as (
        select c.pool, w.window_seconds
        from (values ('standard'::text), ('advanced'::text)) as c(pool)
        cross join (values (86400), (604800), (2592000)) as w(window_seconds)
    )
    select
        g.pool,
        g.window_seconds,
        coalesce(sum(u.total_tokens), 0)::bigint,
        min(u.created_at)
    from grid g
    left join public.token_usage u
           on coalesce(u.model_class, 'standard') = g.pool
          and u.user_id = auth.uid()
          and u.created_at >= now() - (g.window_seconds * interval '1 second')
    group by g.pool, g.window_seconds;
$$;

comment on function public.token_usage_windows() is
    'Daily (86400s), weekly (604800s) and monthly (2592000s) token totals for '
    'the calling user, per model class, with the timestamp of the oldest row '
    'still inside each rolling window. Used by the account dialog and the '
    'token budget warning.';

revoke all on function public.token_usage_windows() from public;
revoke all on function public.token_usage_windows() from anon;
grant execute on function public.token_usage_windows() to authenticated;


create or replace function public.token_usage_windows_for(p_user_id uuid)
returns table (
    pool text,
    window_seconds integer,
    used bigint,
    oldest_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    with grid as (
        select c.pool, w.window_seconds
        from (values ('standard'::text), ('advanced'::text)) as c(pool)
        cross join (values (86400), (604800), (2592000)) as w(window_seconds)
    )
    select
        g.pool,
        g.window_seconds,
        coalesce(sum(u.total_tokens), 0)::bigint,
        min(u.created_at)
    from grid g
    left join public.token_usage u
           on coalesce(u.model_class, 'standard') = g.pool
          and u.user_id = p_user_id
          and u.created_at >= now() - (g.window_seconds * interval '1 second')
    group by g.pool, g.window_seconds;
$$;

comment on function public.token_usage_windows_for(uuid) is
    'Service-role-only variant of token_usage_windows() for a named user. Used '
    'by the chat-completion edge function to enforce the daily, weekly and '
    'monthly quotas.';

revoke all on function public.token_usage_windows_for(uuid) from public;
revoke all on function public.token_usage_windows_for(uuid) from anon, authenticated;
grant execute on function public.token_usage_windows_for(uuid) to service_role;
