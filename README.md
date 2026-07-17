# Agency Colony

An open-source resource management platform for digital agencies. One codebase, 13 screens, no framework — vanilla JavaScript, Supabase, and Netlify.

Built and run daily at a real agency: allocation, tasks, leave, BD pipeline, invoices, and client analytics with AI insights.

> **v2 (July 2026)** — a full re-release. Adds multi-platform client analytics (LinkedIn + Instagram + newsletter/community), an AI insights layer, DB-backed configuration, a test suite, and a modular front end. See [What's new in v2](#whats-new-in-v2).

---

## What you get

### Business development
- **Deal Flow** — Kanban pipeline (qualified → discovery → proposal → negotiated → contracted), drag-and-drop, stalled/lost tracking, per-column sorting
- **Client linking** — contracted deals link to clients; termination tracking (good/bad) separates completed engagements from losses
- **Pipeline stats** — live counters, each clickable as a filter

### Resource management
- **Resource Planner** — team matrix with utilization heatmaps, staleness indicators, department filters
- **My Allocation** — weekly/monthly percentage or hours editor, copy-from-last-week, and **suggest-from-tasks** (pre-fills your split from the week's task planner)
- **My Work** — daily tasks with carry-forward, weekly backlog, monthly recurring rules, priority ordering, deadlines, and task links

### People and leave
- **Leave Center** — requests, approvals routed to the direct manager, balances, half-day support, calendar-day policy, cycle rollover
- **Team Directory / Profiles** — utilization, allocations, birthdays, onboarding checklists
- **Policy** — versioned policy documents with acknowledgment tracking

### Clients and finance
- **Clients** — active/archived registry, engagement + scope summary, team allocations and active tasks per client, Scope & Coverage planning
- **Invoice Center** — monthly upload tracking, PIN-gated
- **Client Analytics** — see below

### Client analytics (the big one)
Upload the exports your team already downloads; the app parses, merges, and reads them.

| Platform | Sources | What you get |
|---|---|---|
| **LinkedIn** | Content / Followers / Visitors exports | week-on-week KPIs, impression + engagement trends, audience demographics with target-persona highlighting, post table, per-post analysis |
| **Instagram** | Meta post export + Insights metric CSVs | summary KPIs, per-metric daily trend charts, post performance |
| **Community** | Any per-send comms workbook | subscribers, forum members, per-send-type open/click rates, region + segment breakdowns |

- **Cross-platform Overview** — one snapshot card per platform with week-on-week deltas and a data-freshness chip
- **AI insights** — Claude-powered analyses at every level (weekly pulse, monthly trend, brand signal, per-post, Instagram, community), each copyable straight into a client email
- **Idempotent uploads** — re-uploading a report merges by stable key; no duplicates
- **Honest staleness** — freshness is computed from what the data *covers*, not when someone clicked upload

### Under the hood
- **Notifications** — an action-item bell computed from live data (no read-state to maintain) + email via Resend
- **Scheduled jobs** — daily/weekly reminders with heartbeat monitoring and a health panel, so a dead cron is visible within a day
- **Config in the DB** — access overrides, manager maps, visibility lists, holidays, and analytics personas are all superadmin-editable in-app, each with an in-code fallback
- **Row-level security everywhere** — 100+ policies; leave decisions, analytics uploads, and deal access are enforced in the database, not just the UI
- **Tests** — 71 Node tests over the pure logic modules (`npm test`)

---

## Stack

- **Frontend:** vanilla JS SPA — no framework, no bundler, no build step
- **Backend:** Supabase (PostgreSQL + Auth + RPC), RLS enforced
- **Auth:** Google Workspace OAuth, restricted to your domain
- **Serverless:** Netlify Functions
- **Email:** Resend
- **Vendored:** Chart.js, SheetJS, supabase-js (committed in `vendor/`; only the policy editor pulls Quill from a CDN)

---

## Quick start

```bash
git clone https://github.com/mojaswi/agency-colony.git
cd agency-colony
npm install
cp .env.example .env    # fill in your Supabase + Resend keys
npm test                # 71 tests should pass
netlify dev             # http://localhost:8888
```

Full walkthrough — Supabase project, Google OAuth, migrations, first admin — in **[SETUP.md](SETUP.md)**.

---

## What's new in v2

- Instagram analytics (post exports + Insights metric CSVs) and a Community Pulse tab for newsletter/forum data
- Cross-platform analytics Overview; tabs are now per platform and appear only when that platform has data
- AI insights across every analysis level, with copy-to-clipboard for client emails
- Data-coverage staleness (`data_through`) replacing upload timestamps
- DB-backed operational config + analytics personas (no deploys to change them)
- Leave: half-days, calendar-day policy, direct-manager-only approvals enforced in RLS
- Recurring monthly tasks; suggest-allocation-from-tasks
- Cron heartbeats + Scheduled Jobs Health panel
- Front end split into pure, testable modules (`js/`) with a 71-test suite
- Notification bell + board reply notifications

## Configuration

Most operational settings live in the database and are editable in **Admin Settings → Operational Config** — no deploy needed:

- enforced access levels (who's admin/leadership)
- team → approver map, direct-manager overrides
- invoice viewers, hidden employees, deal-flow viewers
- public holidays
- analytics target personas per client

Each falls back to the in-code default in `js/config.js` if unset. Start there for your first deploy.

## Contributing

Issues and PRs welcome. The codebase deliberately avoids a build step — please keep it that way. Logic that can be pure should live in `js/*.js` with a test in `tests/`.

## License

MIT — see [LICENSE](LICENSE).
