# 🚀 Deploy Link on GitHub Pages (free, no CLI required)

## The 5-minute web-only path

1. **Create the repo**
   github.com → top-right **+** → **New repository** → name it `link-app`
   → Public → **Create repository** (leave README/license unchecked).

2. **Upload the files**
   On your new repo page, click **"uploading an existing file"**
   → select these 6 files and drag them in **all at once**:
   `index.html`, `style.css`, `app.js`, `schema.sql`, `README.md`, `DEPLOY-GITHUB.md`
   ⚠️ Upload the *files themselves*, not a zip or the parent folder —
   `index.html` must sit at the repo **root** or Pages won't find it.
   → **Commit changes**.

3. **Switch on Pages**
   Repo → **Settings** → **Pages** (left sidebar) →
   Source: **Deploy from a branch** → Branch: **main** → folder: **/ (root)** → **Save**.

4. **Visit your live app**
   Wait 1–2 minutes, refresh the Pages settings screen, and GitHub shows your URL:
   ```
   https://YOUR-USERNAME.github.io/link-app/
   ```
   That URL works worldwide, on HTTPS, forever-free. 🌊

## One Supabase tweak for the live URL

Supabase Dashboard → **Authentication → URL Configuration** →
set **Site URL** to `https://YOUR-USERNAME.github.io/link-app/`
(otherwise "confirm email" links would point at localhost).
If you disabled Confirm email (README step 2), you can skip this.

## When you change code later

Repo → open the file → pencil icon (✏️) → edit → **Commit changes**.
Pages redeploys automatically in about a minute. No other action needed.

## Prefer the terminal? The git path

```bash
git clone https://github.com/YOUR-USERNAME/link-app.git
cd link-app
# copy index.html, style.css, app.js, schema.sql, README.md, DEPLOY-GITHUB.md in here
git add -A && git commit -m "🌊 Link web app" && git push
# then Settings → Pages as in step 3
```

## Notes
- Everything is static — no build step, no secrets in the client. The Supabase
  anon key in `app.js` is *designed* to be public; Row Level Security (schema.sql §5)
  is what guards the data.
- GitHub Pages serves from a subpath (`/link-app/`), and the app already uses
  relative paths, so nothing needs changing.
