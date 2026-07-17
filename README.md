# Agency Colony

**The tool a small agency runs on.** Who's working on what, who's on leave, what's in the pipeline, and how your clients' social channels are actually doing — in one place, instead of eight spreadsheets nobody updates.

Free and open source. Built for a real 16-person agency and used there every day.

---

## The problem it solves

Most small agencies run on a pile of spreadsheets:

- an **allocation sheet** that's three weeks out of date
- a **leave tracker** only one person maintains
- a **BD pipeline** doc that lives in someone's Drive
- **task lists** scattered across five different tools
- **client analytics** rebuilt by hand into a deck every month

None of them talk to each other. By the time leadership asks "who's free next week?", the honest answer is "let me check three files and ask two people."

Colony puts all of it in one app — and, more importantly, makes it worth updating. It nudges the people who forget, fills things in for you where it can, and tells you when its own data has gone stale instead of quietly showing you March's numbers in July.

---

## What it actually looks like

**Monday morning.** You open My Work and type your tasks for the week, each tagged to a client. Then you open My Allocation and hit *"Suggest from tasks"* — it reads what you just wrote and fills in your split (40% Acme, 30% Northwind, 30% Helix). You adjust and save. That took a minute, not fifteen.

**You need Friday off.** You request it in My Leave. It routes to your manager — only your manager — who gets an email and approves it. It now shows on the team calendar, on everyone's home screen, and your balance updates. Half-days count as half.

**A deal closes.** Your BD lead drags it to *Contracted* in Deal Flow. It becomes a client automatically. When the engagement eventually ends, archiving the client asks how it went and closes the deal properly — so your pipeline never lies about what's active.

**Reporting time.** Your account manager downloads the client's LinkedIn and Instagram exports and drags them in. Colony parses them, charts them, and — if you want — hands you a written read of what happened, with real numbers, to paste straight into the client email. No deck-building.

**You, on a Tuesday.** You open Agency Overview and see who's over capacity, who's under, whose numbers moved, and which client's data hasn't been touched in six weeks — without asking anyone.

---

## The screens

| | |
|---|---|
| **Home** | your day: tasks due, who's out, what the team shipped |
| **Agency Overview** | leadership's bird's-eye: capacity, pipeline, activity |
| **Deal Flow** | BD pipeline, drag-and-drop, closes into real clients |
| **Resource Planner** | the team grid — who's booked, who's free, what's gone stale |
| **My Work** | daily tasks, weekly backlog, monthly repeats, auto carry-forward |
| **My Allocation** | your week's split, suggested from your own tasks |
| **My Leave** | requests, approvals, balances, half-days |
| **Team Directory** | people, profiles, utilisation |
| **Clients** | who they are, who's on them, what's in scope, how they're doing |
| **Client Analytics** | LinkedIn + Instagram + newsletter, with AI insights |
| **Invoice Center** | monthly uploads, tracked |
| **Policy** | company policies + who's acknowledged them |
| **Bugs & Features** | your team's requests, with replies and notifications |

---

## The analytics bit (the part people ask about)

Your team already downloads exports from LinkedIn and Meta. Colony reads those files as-is — no new habits, no API keys, no data entry.

**Drag the file in. That's the whole workflow.**

- **LinkedIn** — content, followers and visitor exports → week-on-week numbers, trends, audience breakdown, post performance
- **Instagram** — Meta's post export *and* its Insights CSVs (one file per metric) → daily trend charts for views, reach, follows, interactions
- **Newsletter/community** — per-send open and click rates, subscriber growth, member demographics

Then, optionally, a button that reads all of it and writes you a paragraph:

> *"Impressions have been in freefall for 4 consecutive weeks: 10,809 → 4,386 → 3,526 → 207. But four hiring posts on May 29 pulled 51,779 impressions between them — those are structural outliers. Remove that surge and the real baseline is ~3k."*

That's a real one. There's a copy button, because the point is to put it in a client email, not admire it.

**Two things it refuses to do:**

- **Lie about freshness.** It knows what dates your data actually covers — not when someone last clicked upload. A client whose numbers stop in March says so, loudly.
- **Invent patterns.** "Mondays perform best" from two posts is noise. It won't tell you that.

---

## Is this for you?

**Probably yes if:** you're a 5–50 person agency or studio, you're on Google Workspace, you're drowning in spreadsheets, and someone there can spend an afternoon setting up a Supabase project.

**Probably not if:** you need a mobile app, you want SSO beyond Google, you bill hourly and need timesheets (this tracks allocation, not hours), or you want something configurable without ever touching code.

**It's opinionated.** It was built for how one agency works — an April–March leave year, percentage-based allocation, a superadmin who can override anything. Most of that is configurable inside the app. Some of it you'll want to change in code. It's MIT licensed, so go ahead.

---

## Try it

```bash
git clone https://github.com/mojaswi/agency-colony.git
cd agency-colony
npm install
npm test          # 71 tests — should be green
```

To actually run it you need a free Supabase project and Google OAuth (about 30 minutes). **[SETUP.md](SETUP.md)** walks through every step.

```bash
cp .env.example .env    # your Supabase keys
netlify dev             # → http://localhost:8888
```

---

## How it's built

Vanilla JavaScript. No framework, no bundler, **no build step** — the folder you clone is the folder that gets served.

- **Data + auth:** Supabase (PostgreSQL), Google Workspace sign-in
- **Security:** 100+ row-level security policies. Permissions are enforced in the database, not just hidden in the UI
- **Backend jobs:** Netlify Functions — reminders, digests, nudges. Each reports a heartbeat, so a broken job shows up within a day instead of silently doing nothing for two months (ask us how we know)
- **Email:** Resend. **AI:** Claude. Both optional — the app works fine without them
- **Tests:** 71, over the logic that matters (leave rules, allocation maths, task carry-forward, analytics parsing)

Most settings — who's an admin, who approves whose leave, holidays, who sees what — live in the database and are editable inside the app. You shouldn't need a deploy to onboard someone.

---

## What's new in v2 (July 2026)

v1 was a March snapshot. Since then: Instagram and newsletter analytics, the AI insights layer, a cross-platform overview, database-backed configuration, half-day leave, manager-only approvals enforced at the database level, recurring tasks, allocation-suggested-from-tasks, job heartbeats, a modular front end and a test suite.

Also a real fix: v1's scheduled jobs had a bug that silently killed every reminder. If you cloned v1, please pull.

---

## Contributing

Issues and PRs welcome — especially "I tried to set this up and got stuck at X." That's the most useful thing you can tell us.

Keep it build-step-free. Logic that can be pure belongs in `js/*.js` with a test in `tests/`.

## Licence

MIT — do what you like with it. See [LICENSE](LICENSE).
