-- Staleness must come from what the DATA covers, not when someone clicked
-- upload: uploaded_at was frozen for pre-2-Jul re-uploads (Helix Labs showed
-- "10 Mar" under July charts and the Tuesday reminder wrongly nagged), and
-- conversely a fresh upload of an OLD file would wrongly satisfy it.
-- data_through = the last date the report's contents actually cover:
--   content        -> last weekly row's week + 6 days (week END)
--   followers      -> last daily row's date
--   visitors       -> last visitor_metrics row's date
--   instagram      -> max(post publish date, daily metrics date)
--   community_pulse-> summary date_to (last send)
alter table app.client_analytics add column if not exists data_through date;

update app.client_analytics ca set data_through = sub.dt
from (
  select id,
    case report_type
      when 'content' then (
        select max((r->>'week')::date) + 6 from jsonb_array_elements(coalesce(metrics_data,'[]'::jsonb)) r
        where r->>'week' ~ '^\d{4}-\d{2}-\d{2}'
      )
      when 'followers' then (
        select max((r->>'date')::date) from jsonb_array_elements(coalesce(metrics_data,'[]'::jsonb)) r
        where r->>'date' ~ '^\d{4}-\d{2}-\d{2}'
      )
      when 'visitors' then (
        select max((r->>'date')::date) from jsonb_array_elements(coalesce(visitor_metrics,'[]'::jsonb)) r
        where r->>'date' ~ '^\d{4}-\d{2}-\d{2}'
      )
      when 'instagram' then greatest(
        (select max(left(coalesce(nullif(r->>'date',''), r->>'publish_time'), 10)::date)
           from jsonb_array_elements(coalesce(posts_data,'[]'::jsonb)) r
          where left(coalesce(nullif(r->>'date',''), r->>'publish_time'), 10) ~ '^\d{4}-\d{2}-\d{2}'),
        (select max((r->>'date')::date) from jsonb_array_elements(coalesce(metrics_data,'[]'::jsonb)) r
          where r->>'date' ~ '^\d{4}-\d{2}-\d{2}')
      )
      when 'community_pulse' then nullif(summary->>'date_to','')::date
    end as dt
  from app.client_analytics
) sub
where sub.id = ca.id and sub.dt is not null;

-- Early uploads predate client-side date normalization and carry MM/DD/YYYY
-- daily dates (Helix Labs followers/visitors) — second pass for those.
update app.client_analytics ca set data_through = sub.dt
from (
  select id,
    greatest(
      (select max(to_date(r->>'date', 'MM/DD/YYYY')) from jsonb_array_elements(coalesce(metrics_data,'[]'::jsonb)) r
        where r->>'date' ~ '^\d{2}/\d{2}/\d{4}$'),
      (select max(to_date(r->>'date', 'MM/DD/YYYY')) from jsonb_array_elements(coalesce(visitor_metrics,'[]'::jsonb)) r
        where r->>'date' ~ '^\d{2}/\d{2}/\d{4}$')
    ) as dt
  from app.client_analytics
  where data_through is null
) sub
where sub.id = ca.id and sub.dt is not null;
