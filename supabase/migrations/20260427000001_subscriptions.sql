-- Paddle subscription state per user.
-- Source of truth for entitlement; auth.users.app_metadata.is_pro is mirrored
-- from this table by the paddle-webhook Edge Function for fast client reads.

create table public.subscriptions (
    user_id uuid primary key references auth.users(id) on delete cascade,
    paddle_customer_id text not null,
    paddle_subscription_id text not null unique,
    paddle_price_id text not null,
    status text not null,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index subscriptions_paddle_customer_id_idx
    on public.subscriptions (paddle_customer_id);

alter table public.subscriptions enable row level security;

create policy "subs_self_read"
    on public.subscriptions
    for select
    using (auth.uid() = user_id);

create or replace function public.subscriptions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger subscriptions_set_updated_at
    before update on public.subscriptions
    for each row
    execute function public.subscriptions_set_updated_at();
