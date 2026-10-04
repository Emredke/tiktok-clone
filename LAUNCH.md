# Public launch

The app is ready to deploy with the included Dockerfile and Render Blueprint (`render.yaml`). It is not public until a hosting account, sender domain, private object bucket, and secrets are configured. Local development continues to work without these connections.

## Hosting and domain

1. Connect Render to `Emredke/velo`, create a Blueprint from `render.yaml`, and keep one service instance. The persistent `/app/data` disk holds SQLite, VAPID keys, importer checkpoints, and local backup copies. Do not use an ephemeral disk or scale this SQLite deployment across instances.
2. Set `APP_ORIGIN` to the service's exact HTTPS address, with no trailing slash. Add your own domain in Render and set the same origin afterward. This address is used for verification/reset links and request protection.
3. Use “After CI Checks Pass” for automatic deployments. Disk-backed deploys can briefly interrupt connections; clients reconnect automatically. The app's container bundles FFmpeg and the local speech model.
4. Production starts without fictional demo accounts; the credited 300-video collection imports in the background. An existing development database retains its existing demo users, whose login is already disabled in production. To migrate your local collection, preserve its database and upload all media objects, updating location references; alternatively, let the importer rebuild the collection directly into the production bucket.

## Email delivery

Verify a sender domain in Resend and add its DNS records. Set `MAIL_MODE=smtp`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASSWORD` to a Resend API key in Render's secret environment editor, and `MAIL_FROM` to your verified address. Verification and reset emails use this delivery automatically. Never commit keys or paste them into chat.

## Private media storage

Set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, and AWS access credentials through the secret editor. `S3_ENDPOINT` is optional for an S3-compatible provider; leave it empty for AWS. Keep the bucket private, block public access, and use a service credential restricted to this bucket. Playback and thumbnails go through authenticated app routes; the app also checks original-video visibility for remixes and duets. Generated CC0 sounds use the same storage. No public bucket or client-side credential is required.

Enable bucket versioning. Apply a retention policy suitable for your content and backups; do not expire media that the app still references. Off-site database copies are stored under `BACKUP_PREFIX` (default `backups/`). Use a lifecycle rule on this prefix if you want a fixed off-site retention period, such as 30 days. Local snapshots retain seven copies by default.

## Notifications and backups

Push notifications are off on each device until its owner enables them in **Privacy & notifications**. Configure `VAPID_SUBJECT` with your contact email. Keys generate once in `/app/data/vapid.json`, or supply `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as stable secrets. Keep a secure copy of these keys outside the disk; restoring the database with different keys requires users to enable notifications again. Firefox, Chromium, and Safari push endpoints are supported. iPhone users need the installed Home Screen app.

Daily backups run in the app process using SQLite's online backup API, verify integrity and checksums, and upload to the private S3 bucket. The first snapshot runs at startup, followed by daily snapshots and hourly overdue checks. Failures are logged and retried at the next check. Media stays in the versioned object bucket; database snapshots alone do not back up local-development media. They contain private account data and must stay private.

Manual backup: `npm run backup`.

Restore drill: download a `.sqlite` snapshot and its `.sqlite.json` manifest, then run `npm run restore -- /path/to/backup.sqlite /path/to/new.sqlite`. The restore validates checksums and integrity, and refuses to overwrite an existing database. Stop the app before pointing `DATABASE_PATH` at the restored file. Keep the same private media bucket and stable VAPID keys. If using local storage, separately restore `data/media`.

## Verify before announcing

Run `npm run launch:check` in the configured production environment. It checks the public-origin configuration, bucket access, SMTP authentication, FFmpeg, and enabled backups without sending email or exposing secrets. Then verify the actual public HTTPS address, a real signup verification email, private media denial while signed out, a new upload, live chat between two accounts, notification opt-in on a supported device, and a backup restore drill. Give the importer time to finish before expecting all 300 clips.

## Provider references

- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render deployment behavior](https://render.com/docs/deploys)
- [Resend SMTP setup](https://resend.com/docs/send-with-smtp)
- [Node SQLite online backups](https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options)
