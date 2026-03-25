# Agency Colony

A complete, production-ready resource management platform built for digital agencies. One codebase, 13 screens, zero framework bloat.

Built with vanilla JavaScript, Supabase, and Netlify — deployed and battle-tested at a real agency.

---

## What You Get

### Business Development
- **Deal Flow Pipeline** — Kanban board with drag-and-drop, stage tracking (Qualifying > Pitching > Proposal > Negotiating > Contracted), per-column sorting, company/brand switching
- **Client Linking** — Connect deals to active clients when contracted, with mandatory linking enforcement
- **Pipeline Stats** — Live counters for open deals, overdue, stalled, contracted, and lost — each clickable as a filter
- **Multi-brand Support** — Run separate BD pipelines for different brands/entities under one roof

### Resource Management
- **Team Dashboard** — Bird's-eye view of who's working on what, with utilization heatmaps and department breakdowns
- **Weekly Allocation** — Assign team hours across client projects, with week and month views
- **Work Planner** — Daily task management with drag-and-drop reordering, auto-rollover of incomplete tasks, and weekly archiving of completed items

### People & Leave
- **Leave Center** — Submit requests, approval workflows, balance tracking, cycle management, and leadership overviews
- **People Directory** — Employee profiles with utilization data, department filters, and profile cards
- **Employee Profiles** — Personal details, allocation history, invoice uploads

### Client & Finance
- **Client Management** — Active/archived client tracking with ownership and engagement types
- **Invoice Center** — Monthly invoice tracking with upload status per employee
- **Client Analytics** — LinkedIn analytics import with AI-powered performance insights

### Internal Tools
- **Bugs & Features Board** — Internal feedback system with upvotes, replies, status tracking, and email notifications
- **Admin Settings** — User access control, department management, leave cycle configuration
- **Home Feed** — Dashboard with team stats, birthdays, sustainability calendar, and activity timeline

---

## Key Capabilities

| Capability | Details |
|---|---|
| **Authentication** | Google OAuth (domain-restricted) via Supabase Auth |
| **Role-based Access** | Superadmin, Leadership, Finance, and Employee roles with granular screen/action permissions |
| **Dark Mode** | Full light/dark theme support with system preference detection |
| **Mobile Responsive** | Bottom tab navigation, touch-friendly layouts across all screens |
| **Real-time Updates** | Supabase subscriptions for live data |
| **Email Notifications** | Automated reminders for tasks, leaves, invoices, birthdays, and allocation |
| **Row-Level Security** | Every table locked down with Supabase RLS policies — users only see what they should |
| **Excel Export** | Export allocations and reports to .xlsx |
| **Drag & Drop** | Kanban boards, task reordering, priority management |
| **Scheduled Jobs** | Netlify cron functions for daily reminders, weekly nudges, and invoice alerts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS — single `app.js`, no build step, no framework |
| Styling | Single `styles.css` with CSS variables for theming |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Auth | Google OAuth via Supabase, domain-restricted |
| Serverless | Netlify Functions (scheduled + webhook) |
| Email | Resend API for transactional emails |
| Charts | Chart.js for analytics visualizations |
| Export | SheetJS (xlsx) for Excel exports |

---

## Quick Start

```bash
git clone https://github.com/mojaswi/agency-colony.git
cd agency-colony
```

1. Create a [Supabase](https://supabase.com) project
2. Run the 52 database migrations
3. Configure Google OAuth for your domain
4. Set environment variables (see `.env.example`)
5. Deploy to Netlify

See **[SETUP.md](SETUP.md)** for the full step-by-step guide.

---

## Project Structure

```
.
├── index.html              # Single-page app shell
├── app.js                  # All application logic (~12,000 lines)
├── styles.css              # All styles with dark mode (~4,800 lines)
├── assets/                 # Favicons, logos, SVGs
├── vendor/                 # Supabase JS, Chart.js, SheetJS
├── netlify/
│   └── functions/          # 8 serverless functions
│       ├── runtime-config.js              # Env vars for frontend
│       ├── daily-reminders.js             # Task, birthday, leave reminders
│       ├── weekly-allocation-reminder.js  # Monday allocation nudges
│       ├── invoice-reminder.js            # Invoice upload reminders
│       ├── leave-submitted.js             # Leave approval notifications
│       ├── feature-request-notify.js      # Bug/feature notifications
│       ├── analyze-analytics.js           # AI analytics insights
│       └── lib/                           # Shared utilities
├── supabase/
│   └── migrations/         # 52 schema migrations
├── .env.example            # All required environment variables
├── netlify.toml            # Netlify config with cron schedules
└── SETUP.md                # Detailed setup guide
```

---

## Who This Is For

- **Agency founders** who want a custom internal tool without paying for 5 different SaaS subscriptions
- **Small-to-mid agencies** (5–50 people) managing clients, resources, and BD pipelines
- **Technical teams** who want full control over their ops platform

---

## License

MIT — use it, fork it, make it yours.
