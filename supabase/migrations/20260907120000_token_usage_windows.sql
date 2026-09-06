-- Rolling-window token usage, aggregated in Postgres.
--
-- Both the app and the chat-completion edge function used to fetch raw
-- token_usage rows and sum them in JS. That was affordable when the app read
-- them once on opening the account dialog, but the weekly-budget warning polls
-- and the edge function checks the quota on every message, so the read repeats
-- and its row count grows with how heavily the account is used.
--
-- Two functions, differing only in where the user id comes from:
--
--   token_usage_windows()          — the caller's own totals, for the app.
--   token_usage_windows_for(uuid)  — a named user's totals, for the edge
--                                    function's quota check, which runs as the
--                                    service role where auth.uid() is null.
--
-- Both return the four (pool, window) totals: the weekly quota and the monthly
-- backstop, for each of the two model classes. All four rows come back always,
-- zeroed when there is no usage, so callers need no defaults of their own.
-- min(created_at) is the oldest spend still inside each rolling window, which
-- is what tells a caller when tokens next free up.
--
-- Rows whose model_class is NULL predate the standard/advanced split and count
-- as standard.

-- The app's own usage. SECURITY INVOKER, so the token_usage row-level policy
-- still applies. The explicit auth.uid() predicate is what scopes the aggregate
-- (and lets the index below do the work) rather than relying on the policy
-- alone.
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
        cross join (values (604800), (2592000)) as w(window_seconds)
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
    'Weekly (604800s) and monthly (2592000s) token totals for the calling user, '
    'per model class, with the timestamp of the oldest row still inside each '
    'rolling window. Used by the account dialog and the weekly budget warning.';

-- REVOKE FROM PUBLIC does not remove a direct grant, and Supabase's default
-- privileges hand new public-schema functions to anon as well, so anon is
-- revoked by name. It would only ever read back zeros (auth.uid() is null for
-- it), but the grant should match the intent.
revoke all on function public.token_usage_windows() from public;
revoke all on function public.token_usage_windows() from anon;
grant execute on function public.token_usage_windows() to authenticated;


-- The same aggregate for an explicitly named user, so the edge function can
-- run its quota check with the service role.
--
-- SECURITY DEFINER: it must read rows the caller does not own, so it runs as
-- the function owner and bypasses RLS. Two things keep that safe, and both
-- matter:
--
--   * EXECUTE is granted to service_role alone, and explicitly revoked from
--     anon and authenticated — Supabase's default privileges would otherwise
--     grant it to them. A signed-in user therefore cannot pass someone else's
--     id and read their totals.
--   * search_path is pinned, so the body cannot be redirected to a shadowing
--     table via a caller-controlled search_path.
--
-- The body is duplicated rather than delegating to the function above: the two
-- differ only in the user id, and keeping them separate keeps each one's
-- security posture readable on its own.
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
        cross join (values (604800), (2592000)) as w(window_seconds)
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
    'Service-role-only variant of token_usage_windows() for a named user. '
    'Used by the chat-completion edge function to enforce the weekly quota.';

revoke all on function public.token_usage_windows_for(uuid) from public;
revoke all on function public.token_usage_windows_for(uuid) from anon, authenticated;
grant execute on function public.token_usage_windows_for(uuid) to service_role;


-- Supports both aggregates. Skip this statement if an equivalent index already
-- exists under another name — IF NOT EXISTS matches on name, not on definition,
-- so it will not detect a duplicate.
create index if not exists token_usage_user_id_created_at_idx
    on public.token_usage (user_id, created_at desc)
    include (total_tokens, model_class);
