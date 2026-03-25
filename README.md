# Agency Colony

A full-featured agency resource management platform built as a single-page app with Supabase backend and Netlify serverless functions.

## Features (13 screens)

1. **Home Feed** - Dashboard with team stats, birthday notifications, sustainability calendar, and activity timeline
2. **Deal Flow / BD Pipeline** - Kanban board + list view for business development deals with stages, POC assignment, and company filtering
3. **Team Dashboard** (Leadership) - Monthly allocation planner with team utilization heatmaps
4. **Work Planner** - Daily task management with drag-and-drop reordering, calendar archive, and auto-rollover of incomplete tasks
5. **Weekly Allocation** - Per-employee time allocation across client projects (week/month view)
6. **Leave Center** - Leave request submission, approval workflow, balance tracking, and cycle management
7. **People Directory** - Employee directory with utilization data, department filters, and profile cards
8. **Clients** - Client/project management with active/archived states
9. **Employee Profile** - Personal profile editing, invoice uploads, allocation history
10. **Invoice Center** - Monthly invoice tracking with upload status per employee
11. **Bugs & Features Board** - Internal feedback board with upvotes, replies, status tracking, and email notifications
12. **Admin Settings** - User access control, department management, leave cycle configuration
13. **Client Analytics** - LinkedIn analytics import, AI-powered performance insights (via OpenAI)

## Tech Stack

- **Frontend**: Vanilla JS single-page app (no framework), CSS with dark mode support
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Auth**: Google OAuth via Supabase Auth (domain-restricted)
- **Serverless**: Netlify Functions (scheduled reminders, email notifications)
- **Email**: Resend API for transactional emails
- **Charts**: Chart.js for analytics visualizations
- **Export**: SheetJS (xlsx) for Excel exports

## Quick Start

1. Clone this repository
2. Create a Supabase project at [supabase.com](https://supabase.com)
3. Run the database migrations (see [SETUP.md](SETUP.md))
4. Configure Google OAuth in Supabase
5. Set environment variables
6. Deploy to Netlify (or any static host)

See **[SETUP.md](SETUP.md)** for detailed setup instructions.

## Project Structure

```
.
├── index.html              # Single-page app HTML shell
├── app.js                  # All application logic (~460KB)
├── styles.css              # All styles with dark mode support
├── assets/                 # Favicons, logos, SVG icons
├── vendor/                 # Supabase JS, Chart.js, SheetJS
├── netlify/
│   ├── functions/          # Serverless functions
│   │   ├── runtime-config.js           # Exposes env vars to frontend
│   │   ├── daily-reminders.js          # Scheduled: task reminders, birthday alerts, leave digests
│   │   ├── weekly-allocation-reminder.js # Scheduled: Monday allocation reminders
│   │   ├── invoice-reminder.js         # Scheduled: invoice upload reminders (25th+)
│   │   ├── leave-submitted.js          # Webhook: leave approval notifications
│   │   ├── feature-request-notify.js   # Webhook: bug/feature request notifications
│   │   ├── analyze-analytics.js        # AI-powered analytics insights
│   │   └── lib/                        # Shared utilities (config, email, supabase client)
│   └── functions/lib/
│       ├── config.js
│       ├── email.js
│       ├── notifications.js
│       └── supabase-admin.js
├── supabase/
│   └── migrations/         # Database schema migrations
├── netlify.toml            # Netlify configuration
├── .env.example            # Environment variable template
├── robots.txt              # Blocks all crawlers
└── package.json            # Dependencies (@supabase/supabase-js)
```

## License

Proprietary. For use by the receiving agency only.
