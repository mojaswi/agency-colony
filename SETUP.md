# Setup Guide

Complete instructions for setting up your own Agency Colony instance.

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** (e.g., `https://abcdefghijk.supabase.co`)
3. Note your **anon/public key** from Settings > API
4. Note your **service_role key** from Settings > API (keep this secret)

## 2. Run Database Migrations

Run all SQL files in `supabase/migrations/` in alphabetical order against your Supabase database. You can do this via:

- **Supabase Dashboard**: Go to SQL Editor, paste each file's contents, and run
- **Supabase CLI**: `supabase db push` (requires `supabase` CLI and linking your project)

The migrations create:
- All tables (employees, departments, clients, projects, allocations, leave system, deals, etc.)
- Row Level Security (RLS) policies
- Database functions and triggers
- Views for utilization analytics

## 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Go to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (Web application type)
5. Add your Supabase project's callback URL as an authorized redirect URI:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
6. In Supabase Dashboard, go to **Authentication > Providers > Google**
7. Enable Google provider and paste your Client ID and Client Secret
8. Set "Restrict to domain" if you want to limit sign-in to your Google Workspace domain

## 4. Configure Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
EMAIL_SENDER=noreply@yourdomain.com
APP_BASE_URL=https://your-deployment-url.com
```

For Netlify deployment, set these as environment variables in your Netlify site settings.

## 5. Configure app.js

Open `app.js` and update the following sections at the top of the file:

### Access Control (lines 14-20)
```js
const ENFORCED_ACCESS_BY_EMAIL = {
  'admin@youragency.com': 'admin',
  'leader1@youragency.com': 'leadership',
  // Add your leadership/admin emails here
};
```

### Superadmin Email (line 22)
```js
const SUPERADMIN_EMAIL = 'admin@youragency.com';
```

### Invoice Viewers (line 23)
```js
const INVOICE_VIEWER_EMAILS = ['finance@youragency.com', 'admin@youragency.com'];
```

### Invoice Excluded (line 24)
Employees excluded from invoice upload requirements:
```js
const INVOICE_EXCLUDED_EMAILS = ['admin@youragency.com'];
```

### Deal Flow Extra Access (line 25)
Non-leadership users who should see the Deal Flow screen:
```js
const DEAL_FLOW_EXTRA_EMAILS = ['sales@youragency.com'];
```

### Domain Restriction (line 26)
```js
const ANT_DOMAIN = '@youragency.com';
```

### Team Managers (lines 29-35)
Map each department to the email of its manager:
```js
const TEAM_MANAGER_BY_TEAM = Object.freeze({
  [TEAM_AM]: 'leader3@youragency.com',
  Art: 'leader2@youragency.com',
  // ...
});
```

### Direct Managers (lines 36-41)
Map leadership-level employees to their direct manager:
```js
const DIRECT_MANAGER_BY_EMAIL = Object.freeze({
  'leader2@youragency.com': SUPERADMIN_EMAIL,
  // ...
});
```

### Deal POC Emails (line ~11185)
Users who can be assigned as deal point-of-contact:
```js
const DEAL_POC_EMAILS = ['admin@youragency.com', 'sales@youragency.com'];
```

### Team Dashboard Exclusions (line ~7072)
Employees to exclude from team dashboard views:
```js
const TEAM_DASHBOARD_EXCLUDE = ['finance@youragency.com'];
```

### Company/Brand Names (line ~11692)
Update the deal flow company dropdown values to match your brands:
```js
<option value="Your Agency">Your Agency</option>
<option value="Brand 2">Brand 2</option>
<option value="Brand 3">Brand 3</option>
```

### Public Holidays (lines 55-68)
Update the holiday list for your region/country.

### Localhost Dev Fallback (lines 1628-1634)
Update the localhost config with your Supabase URL and anon key for local development:
```js
return {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  appBaseUrl: location.origin,
  allowedDomain: 'youragency.com'
};
```

## 6. Configure Netlify Functions

### runtime-config.js
Update the `allowedDomain` fallback to your domain.

### daily-reminders.js
Update the `leadershipEmails` array with your leadership team emails (for birthday notifications).

### invoice-reminder.js
Update `INVOICE_EXCLUDED_EMAILS` and `INVOICE_COMPLETION_EMAIL` for your finance team.

### feature-request-notify.js
Update the `adminEmail` for bug report notifications.

## 7. Configure index.html

### Branding (lines 6, 22)
Update the page title and splash screen text.

### Domain Reference (line 80)
Update the login helper text to reference your domain.

### Home Tagline (line 92)
Update the home screen tagline.

## 8. Deploy

### Netlify (recommended)
1. Push to a Git repository
2. Connect the repo to Netlify
3. Set environment variables in Netlify site settings
4. Deploy

The `netlify.toml` configures:
- Static file serving from root
- API redirects to Netlify functions
- Scheduled functions (daily reminders, weekly reminders, invoice reminders)

### Other Hosts
The app is a static single-page app. You can host the frontend on any static host (Vercel, Cloudflare Pages, S3, etc.), but the Netlify functions will need to be adapted for your serverless platform.

## 9. Set Up Email (Optional)

Email notifications use [Resend](https://resend.com). To enable:
1. Create a Resend account
2. Verify your sending domain
3. Get an API key
4. Set `RESEND_API_KEY` and `EMAIL_SENDER` in environment variables

Without email configured, the app works fine -- email notifications are gracefully skipped.

---

## Summary of Files to Customize

| File | What to Change |
|------|---------------|
| `app.js` (top) | Email lists, domain, team managers, company names, holidays |
| `app.js` (localhost block) | Supabase URL + anon key for local dev |
| `index.html` | Branding text, domain references |
| `netlify/functions/runtime-config.js` | Domain fallback |
| `netlify/functions/daily-reminders.js` | Leadership emails |
| `netlify/functions/invoice-reminder.js` | Finance emails |
| `netlify/functions/feature-request-notify.js` | Admin email |
| `.env` / Netlify env vars | All secrets and URLs |
| `supabase/migrations/` | Run as-is (schema only, no real data) |
| `assets/` | Replace favicons and logos with your own branding |
