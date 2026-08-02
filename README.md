# 🌊 Link — Web Edition (App Mode)

An ocean-gloss, mobile-app-style web app that fuses two worlds:

- **Link Core** — realtime, person-to-person direct messaging (no statuses, no stories, no noise).
- **Global Feed** — a Facebook-style home feed crossed with an Interpals community board,
  with language tags (`Native: Korean · Learning: English`) on every member and post.

Built with vanilla HTML/CSS/JS + Supabase (Auth, Postgres, Realtime). No build step.

## Screens (hash-routed, back-button friendly)

| Route | Screen |
|---|---|
| `#/home` | 🏠 FB-style newsfeed + composer teaser + infinite scroll + likes |
| `#/explore` | 🧭 Interpals-style member discovery with language tags |
| `#/messages` | 💬 Messenger-style conversation list with unread badges |
| `#/chat/:id` | 💬 Full-screen live chat with read receipts (✓✓) |
| `#/profile` | 👤 Your profile: avatar, bio, languages, stats, your posts |
| `#/user/:id` | 👤 Anyone else's profile + Message button |
| `#/compose` | ✏️ Stylus new-post screen (also the raised center FAB) |
| `#/edit-profile` | ✏️ Edit username / languages / avatar / bio |

Navigation is a **floating glass bottom bar** with a raised **stylus ✏️ compose button**.
Sign-up shows a **waiting-room screen** when email confirmation is enabled
(resend button with cooldown + "I've confirmed — dive in").

---

## Setup (≈ 3 minutes)

### 1. Create the database
Supabase Dashboard → **SQL Editor** → paste [`schema.sql`](schema.sql) → **Run**.
(Safe to re-run: adds RLS + realtime to existing tables.)

### 2. Choose your sign-up email mode
**Want the confirmation-email flow? (recommended for launch)**
Authentication → **Sign In / Up** → Email → enable **Confirm email** → Save.
New sign-ups now receive an email and land on the waiting-room screen until they confirm.
⚠️ Supabase's built-in mailer is rate-limited (~2–3 emails/hour on free tier) — configure
**Settings → Authentication → SMTP** (SendGrid/Resend/etc.) if you need more.

**Want zero-friction testing?** Leave *Confirm email* **off** — accounts sign in instantly
and the waiting room is skipped automatically. The app handles both modes.

### 3. Serve the app
```bash
cd link-app
python3 -m http.server 8000   # → http://localhost:8000
```
Or host on GitHub Pages — see [`DEPLOY-GITHUB.md`](DEPLOY-GITHUB.md).

---

## Feature checklist
- ✅ Floating bottom nav + stylus FAB (no sidebars, app-style)
- ✅ Home feed with likes, image posts, "N new posts" realtime pill, infinite scroll
- ✅ Explore: member cards with Native/Learning tags + bio + Message shortcut
- ✅ Chats list with previews, timestamps, unread badges
- ✅ Live chat: realtime delivery, read receipts, liquid-cyan / frosted-white bubbles
- ✅ Profiles with post/like stats + per-user post history
- ✅ Email-confirmation waiting room (resend + confirm retry)
- ✅ Sign-out, edit profile with live avatar preview

## Troubleshooting
- **No confirmation email arrives** → step 2 above (toggle + SMTP limits).
- **Empty feed/people, 401/403 in console** → run `schema.sql` (RLS section).
- **Messages not live** → Database → Replication should list `messages` + `feed_posts` (schema.sql §6 does this).
