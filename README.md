# 🌊 Link — Web Edition

An ocean-gloss, glassmorphism web app that fuses two worlds:

- **Link Core** — realtime, person-to-person direct messaging (no statuses, no stories, no noise).
- **Global Feed** — a Facebook-style scroll crossed with an Interpals community board, where every
  post carries the author's language tags (`Native: Korean · Learning: English`).

Built with vanilla HTML/CSS/JS + Supabase (Auth, Postgres, Realtime).

---

## Setup (≈ 3 minutes)

### 1. Create the database
Supabase Dashboard → **SQL Editor** → New query → paste the full contents of
[`schema.sql`](schema.sql) → **Run**. It creates the 4 tables, indexes, RLS policies,
and turns on Realtime for live messages/posts.

### 2. (Recommended) Turn off email confirmation for instant sign-ups
Supabase Dashboard → **Authentication → Providers → Email** → disable **Confirm email** → Save.
*(If you leave it on, accounts work too — users just confirm via email before first sign-in,
and their profile is created automatically on that first sign-in.)*

### 3. Serve the app
Browsers block ES-module + auth flows on `file://`, so serve the folder over HTTP:

```bash
cd link-app
python3 -m http.server 8000
# open http://localhost:8000
```

Or drop the folder on any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages).
No build step. No environment variables — the Supabase URL + anon key already live in
`app.js` (the anon key is public by design; RLS is what protects the data).

---

## File map

| File         | What's inside |
|--------------|---------------|
| `schema.sql` | Phase 1 — tables, indexes, RLS, realtime publication |
| `index.html` | Phase 1 — shell: auth card, sidebar, messaging view, feed view, profile modal |
| `style.css`  | Phase 1–3 — the full liquid-glass / ocean-droplet design system |
| `app.js`     | Phase 1–3 — Supabase client, auth, realtime messaging engine, infinite feed, likes |

## Feature checklist

- ✅ Email/password auth with username + native/learning language capture at sign-up
- ✅ Glossy ocean aesthetic: animated gradient, glassmorphism, backdrop-blur, droplet sheens
- ✅ Contact list with search, last-message previews, unread badges, recency ordering
- ✅ Live chat (Supabase Realtime), read receipts (✓✓), liquid-cyan sender bubbles / frosted-white receiver bubbles
- ✅ Global feed: infinite scroll (10/page), language tags, optional image URLs, likes, delete-own-post
- ✅ "Message" button on any post → jumps straight into a DM with that author
- ✅ "N new posts" pill via realtime inserts on `feed_posts`
- ✅ Edit profile (username, languages, avatar URL, bio)
- ✅ Responsive down to mobile (chat opens full-screen with a back button)

## Troubleshooting

- **Feed/people are empty and console shows 401/403** → you skipped section 5 of `schema.sql` (RLS).
- **Messages don't arrive live** → section 6 of `schema.sql` adds the tables to the
  `supabase_realtime` publication; also check Dashboard → Database → Replication.
- **`duplicate key ... users_username_key`** → pick a different username (they're globally unique).
