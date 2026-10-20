# Backups for the KCHS ERP (free tools, for a beginner)

**Why this exists.** The app runs on the Supabase *Free* plan. The Free plan gives you no backups you can rely on, and a Free project that nobody uses for about a week is *paused*. So you make your own backups, on your own Mac, and a small daily "ping" keeps the project awake.

> ## ⚠️ READ THIS FIRST: these backups hold children's data
> - Once the school goes live, every backup contains real names, birth dates, phone numbers, photos and fee records of children.
> - **Never share a backup** with anyone (no WhatsApp, no email, no "just send me the file").
> - **Never keep an unencrypted copy.** The scripts only ever write *encrypted* files. Never make a plain export "just to look".
> - The **private key is a master password** for everything in every backup. Treat it like the key to the school safe. Never keep it in the repo, Google Drive, email, WhatsApp, or on the Mac for longer than a minute after you make it.
> - If you lose the private key (or its passphrase), the backups can **never** be opened: not by you, not by anyone. Keep two copies.

## What you get

| Tool | What it does | How often |
|---|---|---|
| `npm run backup:db` | One encrypted file with all the school's data, the staff **login accounts** (so people can still sign in after a restore), and the list of stored files | weekly (daily if you enter a lot of data) |
| `npm run backup:files` | One encrypted archive of every photo, document, notice/diary attachment, fee QR and the logo | monthly (and after a big photo upload) |
| `npm run restore:check` | **The drill.** Restores the newest backup into a throw-away database on your Mac, then checks it | once a month, and after any change to these tools |
| `npm run restore:db` / `restore:files` | The real restore, into a NEW project | only if data is lost |
| Keep-alive (GitHub) | Pings the project once a day so it is never "inactive" | automatic |

The scripts run on **your Mac**, not in GitHub, so the database password is never stored in GitHub. Backups go to the folder **`~/KCHS-Backups`** (that is `/Users/<you>/KCHS-Backups`), outside the project, so they can never be committed by accident. The newest 8 of each kind are kept (change with `BACKUP_KEEP=12` in `.env.local`).

## Step 1: make the key pair (once)

1. Open Terminal in the project folder and run:
   ```
   npm run backup:keygen
   ```
2. It asks for a **passphrase** twice. Choose a long sentence you will remember. Write it on paper.
3. It creates two files in `~/KCHS-Backup-Keys/`:
   - `public-key.pem`: *locks* backups. Safe to keep on the Mac. The backup scripts use it.
   - `private-key.pem`: *opens* backups. **The master key.**
4. **Right now:** copy `private-key.pem` to **two USB sticks** (label them "KCHS backup key 1 / 2"), keep them in two different places (for example home and the school safe or a relative's house). Keep the paper with the passphrase in a *third* place.
5. **Check each copy works** before you delete anything: run the drill (step 5) once with `BACKUP_PRIVATE_KEY=/Volumes/<usb>/private-key.pem`.
6. Only then **delete `private-key.pem` from the Mac** (and empty the Bin). Keep `public-key.pem`.

Never make a second key pair "to be safe": backups made with one pair cannot be opened with another. The tool refuses to overwrite an existing pair.

## Step 2: make a database backup

```
npm run backup:db
```
It reads the database address from `.env.local` (never printed), reads everything in one consistent moment, encrypts it as it goes, and writes one file such as `~/KCHS-Backups/kchs-db-2026-11-02_0915.enc`. Nothing unencrypted is written anywhere. It ends by telling you the folder.

## Step 3: make a files backup (monthly)

```
npm run backup:files
```
Same idea: downloads every stored file and writes `kchs-files-<date>.enc`. If even one file cannot be read, it keeps nothing and tells you (a half backup is worse than none).

## Step 4: copy the results somewhere safe

After each backup, copy the **whole** `~/KCHS-Backups` folder to:
1. **Google Drive** (the files are encrypted, so this is safe), and
2. an **external drive** that you keep away from the Mac.

Do not copy the keys into Google Drive. A backup that exists only on the Mac is not a backup.

## Step 5: test a restore (the drill) every month

A backup you have never restored is only a hope. Run:
```
BACKUP_PRIVATE_KEY=/Volumes/<usb>/private-key.pem npm run restore:check
```
(You are asked for the passphrase.) It opens the newest database backup (and files archive), restores it into a **temporary database on your Mac that is deleted at the end**, and prints PASS/FAIL for: every table's row count, the security rules (row-level security, permissions, file-storage rules, the tamper-proof audit log), a staff login with its password, and every file in the archive. It needs PostgreSQL's tools once: `brew install postgresql@17`. After you go live, tell it which login to look for: `BACKUP_CHECK_EMAIL=you@school.example`.

**All PASS = the backup is good.** Any FAIL: do not trust that backup; make a new one and tell your developer.

## Not inside any backup (you must redo these in a new project)
- The Supabase **Auth settings** in the dashboard: password rules, sign-in rate limits, session length, leaked-password protection, site URL.
- The **hosting** settings (environment variables, domain).
- The **private key and passphrase**: on purpose.
- Anything you typed only into the Supabase dashboard.

## If the project is PAUSED
1. Sign in at supabase.com → your project → **Restore project**. Data is normally kept for a while after a pause (check Supabase's current terms; do not rely on it).
2. After it is back, run the drill and a fresh `backup:db` straight away.
3. Check the keep-alive on GitHub (Actions tab) and why it did not stop the pause.

## If data is LOST (project deleted, wrong data overwritten)
1. **Stop.** Do not delete or "fix" anything. Tell your developer.
2. Create a **new** Supabase project (same region, Mumbai). Do not touch the damaged one until the new one works.
3. Get the newest good backup files (from Google Drive / the external drive) and the private key from the USB stick.
4. Restore the database into the new project (the connection string is under Project → Connect, "Session pooler"; the tool refuses the live database unless you add `--allow-live`):
   ```
   npm run restore:db -- ~/KCHS-Backups/kchs-db-<date>.enc --target "<new connection string>" --key /Volumes/<usb>/private-key.pem
   ```
   It asks you to type `RESTORE`.
5. Restore the files:
   ```
   TARGET_SUPABASE_URL=https://<new>.supabase.co TARGET_SERVICE_KEY=<new service key> npm run restore:files -- ~/KCHS-Backups/kchs-files-<date>.enc --key /Volumes/<usb>/private-key.pem
   ```
6. Point the app at the new project (new URL and keys in the hosting settings), redo the Auth settings above, sign in as Admin, and look at students, fees and the audit log.
7. Everything entered after the backup date is gone: re-enter it from paper receipts and registers.

**Honest limits.** The drill proves the backup restores into a clean database on your Mac. The same restore into a brand-new *Supabase* project has not been rehearsed yet: do that once on a scratch project before real data goes in (it is on the pre-launch list). The files restore was tested by uploading into temporary buckets of the dev project.

## The daily keep-alive (GitHub)
`.github/workflows/keepalive.yml` asks the project one harmless question every day (the school's public name and logo, plus the sign-in service health), using only the **public** key. It holds no secrets.

Set it up once: GitHub → the repo → Settings → Secrets and variables → Actions → **Variables** → add `SUPABASE_URL` (the project address) and `SUPABASE_ANON_KEY` (Project settings → API, the *anon public* key). Until you set `SUPABASE_URL`, it pings the development project. Then Actions → "Keep Supabase awake" → **Run workflow** to test it.

**Watch it work for a week.** Look at the Actions tab each day: a green tick means it ran; a red cross also emails you. GitHub can delay or skip scheduled runs, so this lowers the risk of a pause but does not remove it. Also open the Supabase dashboard once a week and check the project says "Active".

## Safety net in the project
`npm run scan:secrets` (and a hook that runs it before every commit: `git config core.hooksPath .githooks`, once) **fails** if a backup file, key, `.env` file, or something that looks like a password or key is staged for commit. The backup folders and `*.enc`, `*.pem` are also in `.gitignore`.

---

# ✂ PRINT THIS PAGE: Backup checklist

**Every week** (or every day while data is being entered)
- [ ] `npm run backup:db` finished with "Done"
- [ ] Copied `~/KCHS-Backups` to Google Drive
- [ ] Copied it to the external drive (kept away from the Mac)
- [ ] GitHub → Actions: "Keep Supabase awake" shows green ticks
- [ ] Supabase dashboard says the project is **Active**

**Every month**
- [ ] `npm run backup:files` finished with "Done" and the folder was copied (Drive + external drive)
- [ ] `restore:check` drill: **ALL CHECKS PASSED** (date: ________ )
- [ ] The two USB sticks with the private key are still where they should be
- [ ] The passphrase paper is still safe

**Never**
- [ ] No backup or key is ever sent to anyone, or put in the project, WhatsApp, email or an open cloud folder
- [ ] No unencrypted export of the database, ever
- [ ] The private key is not on the Mac (only on the 2 USB sticks)

**If something goes wrong**
1. Stop. Do not delete anything.  2. Newest backup + private key + passphrase.  3. Create a NEW project.  4. `restore:db`, then `restore:files`.  5. Redo the Auth settings, check Admin sign-in.

Developer: ______________________  Phone: ______________________
