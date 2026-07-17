# Setup Guide

Everything needed to run your own Agency Colony instance.

> **v2 note:** most operational settings now live in the **database** and are editable in-app (Admin Settings → Operational Config) — you only need to edit code for the initial bootstrap. See [Configuration](#6-configuration) below.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project
2. From **Settings → API**, note your:
   - **Project URL** (`https://your-project-ref.supabase.co`)
   - **anon/public key** (safe in the browser — RLS protects your data)
   - **service_role key** (secret — server-side only, never commit it)

## 2. Run the database migrations

Run every file in `supabase/migrations/` **in alphabetical order**:

- **Supabase Dashboard** → SQL Editor → paste and run each file, or
- **Supabase CLI** → `supabase db push` (after linking your project)

They create ~33 tables, 12 enums, 40+ functions, 20+ triggers and **100+ RLS policies** covering:

- employees, departments, clients, projects, allocations
- the leave system (requests, balances, Apr–Mar cycles, half-days, holidays)
- daily/weekly/recurring tasks
- deals + stage history
- client analytics (LinkedIn, Instagram, community)
- invoices, policies, onboarding, feature requests, notifications
- DB-backed config: `access_overrides`, `app_config`, `public_holidays`

The migrations are schema + a **placeholder bootstrap**: they seed the departments and a few placeholder
accounts (`admin@youragency.com`, `strategy-lead@…`, `creative-lead@…`, `am-lead@…`, finance) so the first
sign-in has a superadmin to attach to. Change those emails to your real ones **before running the
migration** (search-replace `youragency.com`), or delete the seeded rows afterwards. No client data,
no real people.

## 3. Set up Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add your Supabase callback as an authorized redirect URI:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
4. In Supabase → **Authentication → Providers → Google**: enable it, paste the Client ID + Secret
5. Restrict to your Google Workspace domain if you want sign-in limited to your team

> The app uses the **PKCE** flow. Don't switch to implicit — it breaks token refresh across tabs.

## 4. Environment variables

```bash
cp .env.example .env
```

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key          # optional — email notifications
ANTHROPIC_API_KEY=your_anthropic_api_key    # optional — AI analytics insights
EMAIL_SENDER=noreply@youragency.com
APP_BASE_URL=https://colony.youragency.com
```

For Netlify, set the same values in **Site settings → Environment variables**.

## 5. Run it locally

```bash
npm install
npm test        # 71 tests over the pure logic modules — should be green
netlify dev     # serves the app + functions at http://localhost:8888
```

`netlify dev` serves `/api/runtime-config` from your `.env`, so the browser never needs hardcoded keys. (A plain static server will fall back to the placeholder block in `app.js` — fill it in only if you really need it, and don't commit real keys.)

## 6. Configuration

### Bootstrap (in code — `js/config.js`)

Edit these once so you can sign in as an admin:

```js
const ENFORCED_ACCESS_BY_EMAIL = {
  'admin@youragency.com': 'admin',
  'creative-lead@youragency.com': 'leadership',
};
const SUPERADMIN_EMAIL = 'admin@youragency.com';
const ANT_DOMAIN = '@youragency.com';           // your email domain
const WORK_HOURS_PER_WEEK = 45;                 // your working week
const PUBLIC_HOLIDAYS = [ /* your region's dates */ ];
```

Also set your domain in `supabase/migrations/202602230001_init_agency_colony.sql`
(`is_agency_email`) before running it, and in `netlify/functions/runtime-config.js`.

### Everything else (in the app — no deploys)

Once you're signed in as superadmin, **Admin Settings → Operational Config** manages:

| Setting | What it does |
|---|---|
| Enforced access | pins emails to admin/leadership, overriding the DB |
| Team approver | department → leave approver |
| Direct manager | per-person overrides (take precedence) |
| Invoice viewers / excluded | who sees the Invoice Center; who's exempt |
| Hidden employees | keep access, hide from team views |
| Deal-flow viewers | non-leadership people who can see Deal Flow |
| Analytics personas | per-client target audience for Audience Intelligence |
| Public holidays | the yearly list |

Each falls back to the `js/config.js` constant when unset, so the app works before you touch any of it.

## 7. Branding

Replace in `assets/`: `favicon.svg`, `favicon-32.png`, `favicon-192.png`, `colony-logo-*.svg`, `ant-icon.svg`.
Update the page title and splash text in `index.html`.
`assets/analytics-ant.png` is used in the task-nudge email — swap it (and the copy in `netlify/functions/task-nudge.js`) for something your team finds funny.

## 8. Deploy

1. Push to a Git repo
2. Connect it to Netlify
3. Set the environment variables
4. Deploy — there's **no build step**; the root is served as-is

`netlify.toml` configures static serving, `/api/*` → functions, cache headers, and the scheduled functions:

| Cron | When | What |
|---|---|---|
| `daily-reminders` | 10:00 daily | pending-leave digest, birthdays, leave cycle rollover |
| `task-nudge` | 11:00 weekdays | nudges only people who haven't touched their tasklist |
| `invoice-reminder` | 10:00 from the 25th | invoice upload reminders |
| `analytics-upload-reminder` | Tue 10:00 | per-client analytics staleness, retainers only |
| `policy-update-reminder` | Mon 10:00 | annual policy review |

Times are UTC in `netlify.toml` (`30 4 * * *` = 10:00 IST) — adjust for your timezone.

> **Scheduled functions gotcha:** they're invoked over HTTP POST by Netlify's scheduler, so never guard them on `event.httpMethod` — that silently kills every cron. They guard on the `next_run` payload instead. Every run writes a heartbeat, surfaced in **Admin Settings → Scheduled Jobs Health**.

### Other hosts

The frontend is a static SPA and will run anywhere (Vercel, Cloudflare Pages, S3). The `netlify/functions/` need porting to your platform's serverless runtime.

## 9. Email (optional)

Notifications use [Resend](https://resend.com): create an account, verify your sending domain, set `RESEND_API_KEY` + `EMAIL_SENDER`. Without it, the app runs fine and email is skipped gracefully.

## 10. AI insights (optional)

The analytics insight buttons call Claude via `netlify/functions/analyze-analytics.js`. Set `ANTHROPIC_API_KEY` to enable them; without it the rest of analytics works normally.

---

## First run checklist

1. Migrations applied
2. Google OAuth working, domain restricted
3. `js/config.js`: superadmin email + domain set
4. Sign in — your profile bootstraps automatically
5. Admin Settings → add your team, departments, holidays
6. Everyone else signs in and lands on an empty, working app
