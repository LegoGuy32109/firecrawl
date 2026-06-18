-- Local development stub functions for Supabase RPCs that don't exist locally.
-- Run once after applying the drizzle migration:
--   psql $DATABASE_URL -f apps/api/scripts/local-db-setup.sql
--
-- Test API key: fc-3d478a296e59403e85c794aba81ffd2a
-- (parses to UUID 3d478a29-6e59-403e-85c7-94aba81ffd2a — satisfies normalizedApiIsUuid)

-- ---------------------------------------------------------------------------
-- auth_credit_usage_chunk_47
-- Accepts any API key, returns a bypass ACUC row with 99 999 999 credits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_credit_usage_chunk_47(
  input_key text,
  i_is_extract boolean DEFAULT false,
  tally_untallied_credits boolean DEFAULT false
) RETURNS TABLE (
  api_key                                    text,
  api_key_id                                 bigint,
  team_id                                    uuid,
  sub_id                                     text,
  sub_current_period_start                   timestamptz,
  sub_current_period_end                     timestamptz,
  sub_user_id                                text,
  price_id                                   text,
  rate_limits                                jsonb,
  price_credits                              numeric,
  price_should_be_graceful                   boolean,
  price_associated_auto_recharge_price_id    text,
  credits_used                               numeric,
  coupon_credits                             numeric,
  adjusted_credits_used                      numeric,
  remaining_credits                          numeric,
  total_credits_sum                          numeric,
  plan_priority                              jsonb,
  concurrency                                integer,
  flags                                      jsonb,
  is_extract                                 boolean,
  org_id                                     uuid
) LANGUAGE sql AS $$
  SELECT
    input_key::text,
    0::bigint,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'local-sub',
    now() - interval '30 days',
    now() + interval '30 days',
    'local-user',
    'local-price',
    '{"crawl":99999999,"scrape":99999999,"extract":99999999,"search":99999999,"map":99999999,"preview":99999999,"crawlStatus":99999999,"extractStatus":99999999}'::jsonb,
    99999999::numeric,
    false,
    null::text,
    0::numeric,
    99999999::numeric,
    0::numeric,
    99999999::numeric,
    99999999::numeric,
    '{"bucketLimit":25,"planModifier":1}'::jsonb,
    100::integer,
    null::jsonb,
    i_is_extract,
    null::uuid
$$;

-- ---------------------------------------------------------------------------
-- auth_credit_usage_chunk_47_from_team
-- Same as above but keyed by team_id instead of API key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_credit_usage_chunk_47_from_team(
  i_team_id uuid,
  i_is_extract boolean DEFAULT false,
  tally_untallied_credits boolean DEFAULT false
) RETURNS TABLE (
  api_key                                    text,
  api_key_id                                 bigint,
  team_id                                    uuid,
  sub_id                                     text,
  sub_current_period_start                   timestamptz,
  sub_current_period_end                     timestamptz,
  sub_user_id                                text,
  price_id                                   text,
  rate_limits                                jsonb,
  price_credits                              numeric,
  price_should_be_graceful                   boolean,
  price_associated_auto_recharge_price_id    text,
  credits_used                               numeric,
  coupon_credits                             numeric,
  adjusted_credits_used                      numeric,
  remaining_credits                          numeric,
  total_credits_sum                          numeric,
  plan_priority                              jsonb,
  concurrency                                integer,
  flags                                      jsonb,
  is_extract                                 boolean,
  org_id                                     uuid
) LANGUAGE sql AS $$
  SELECT
    'local-key'::text,
    0::bigint,
    i_team_id,
    'local-sub',
    now() - interval '30 days',
    now() + interval '30 days',
    'local-user',
    'local-price',
    '{"crawl":99999999,"scrape":99999999,"extract":99999999,"search":99999999,"map":99999999,"preview":99999999,"crawlStatus":99999999,"extractStatus":99999999}'::jsonb,
    99999999::numeric,
    false,
    null::text,
    0::numeric,
    99999999::numeric,
    0::numeric,
    99999999::numeric,
    99999999::numeric,
    '{"bucketLimit":25,"planModifier":1}'::jsonb,
    100::integer,
    null::jsonb,
    i_is_extract,
    null::uuid
$$;

-- ---------------------------------------------------------------------------
-- bill_team_6
-- No-op billing stub — local dev doesn't deduct credits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bill_team_6(
  i_team_id uuid,
  i_credits numeric,
  i_job_id text DEFAULT null,
  i_api_key text DEFAULT null,
  i_job_type text DEFAULT null,
  i_sub_user_id text DEFAULT null
) RETURNS void LANGUAGE sql AS $$
  -- no-op
$$;

-- ---------------------------------------------------------------------------
-- change_tracking_insert_scrape
-- No-op change-tracking stub — no Supabase realtime needed locally.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION change_tracking_insert_scrape(
  i_team_id uuid,
  i_url text,
  i_scrape_id uuid,
  i_content_hash text DEFAULT null,
  i_metadata jsonb DEFAULT null
) RETURNS void LANGUAGE sql AS $$
  -- no-op
$$;
