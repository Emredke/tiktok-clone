# Velo

**The curiosity club.** A working, mobile-first short-video social network with a React interface, Express API, relational database, authenticated video delivery, and S3-compatible object storage for production.

This repository includes the original brief in [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md). It is a runnable application, not a static design. Production deployment requires your own hosting, email delivery, and object-storage configuration.

## Run locally

Requires **Node.js 24+**, npm, and **FFmpeg/FFprobe** on your PATH. Install FFmpeg with `brew install ffmpeg` on macOS or `sudo apt-get install ffmpeg fonts-dejavu-core` on Debian/Ubuntu.

```sh
npm ci
cp .env.example .env
npm run captions:setup   # Python 3.9+, local automatic speech captions
npm run dev
```

Open **http://localhost:5173**. The API runs on port 3001. First startup automatically creates the schema and seeds 24 fictional creators, 36 original seven-second vertical videos, 576 relational likes, 144 comments/replies, bookmarks, shares, views, and follows. Generating the clips takes approximately 30–90 seconds depending on hardware. Startup also imports 300 credited real clips in the background. Startup is idempotent; subsequent runs preserve all data.

For a single-server local preview of the compiled app:

```sh
npm run build
APP_ORIGIN=http://localhost:3001 node --env-file-if-exists=.env server/index.js
```

`npm start` intentionally enforces production settings. Use `npm run dev` for development.

## Accounts and email

Create an account through the app. Passwords use salted asynchronous scrypt hashes. Opaque login cookies are HttpOnly, SameSite=Lax, last 30 days, and use Secure in production. Only token hashes are stored. Verification and password-reset links expire after one hour; reset tokens are consumed once and revoke all existing sessions.

With `MAIL_MODE=development`, email messages are written to **`data/mail/*.json`**. Open the `url` in the newest message addressed to your test email to verify your account or reset your password. Tokens are never returned from an API endpoint. Accounts may browse and interact immediately; uploads and direct video messages require verified email.

For real delivery, set `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. SMTP port 465 uses TLS; other ports use STARTTLS where offered. Set `APP_ORIGIN` to your exact frontend origin.

For development only, a seeded account can log in with:

- Email: `sports2@demo.velo.invalid`
- Password: `VeloDemo!2026`

All seeded creators are explicitly fictional. **Demo login is disabled in production.** No real person's engagement is fabricated.

## What works

- A cinematic forest-and-gold discovery home with an animated globe, paper textures, accessible focus, reduced-motion support, and responsive film shelves.
- A first-adventure guide with interest, saved-film, and verification steps; one lifetime 25-XP reward and a First light stamp.
- Earned passport covers, profile frames, and titles, checked against server-derived XP and saved across sessions.
- Rotating weekly creative challenges, original-film submission/withdrawal, a real shared showcase, and a once-weekly 75-XP reward.
- A ten-person invite system, optional invitation-only signup, private beta feedback with staff triage, and honest physical-device reports. See [the beta guide](docs/BETA_GUIDE.md).
- An editorial discovery home with topic trails, a screening shelf, Club picks and Your circle, explicit pagination, and no homepage autoplay.
- A dedicated screening room with native video controls, separate field notes and licensing credits, horizontal social actions, and related films.
- Private weekly quests for saving three topics, curating a collection of two creators, and publishing an original. Server-validated claims award XP once per week, unlock permanent passport stamps, and advance levels every 200 XP. Imports and remixes do not earn creator rewards; no rewards for watch time or messaging, no public leaderboard, and no streak penalties.
- Club picks ranking from real activity and Your circle from persisted follow relationships; eight-film pages with exclusions.
- Signup, login, logout, persistent sessions, email verification/resend, forgot password, one-time password reset.
- Editable profiles, photo uploads, follower/following lists, uploaded/liked videos, private saved collection.
- Optimistic video likes and bookmarks, follows, comment/reply threads, comment likes, and author-only deletion.
- Copy-link and browser/device sharing, shareable `/v/:id` URLs, in-app video messages.
- Search by caption/category/hashtag/creator, trending tags, category filters, suggested creators, paginated results.
- Database notifications for follows, video likes, comments, replies, comment likes; shared-video inbox and read state. Live events refresh the navigation badge and conversations, with polling fallback.
- MP4/MOV/WebM uploads, live upload progress, preview, duration trim, cover-frame selection, category, captions/hashtags, public/followers/private visibility, comments switch.
- Browser camera recording when supported and permission is granted; graceful fallback to upload.
- Reporting of videos, accounts, and comments; bilateral account blocking/unblocking; deletion of your own videos/comments.
- Interest onboarding, editable feed preferences, reversible negative feedback, and recommendation explanations.
- Creator Studio with persistent drafts, background processing/retry, captions review, and audience analytics.
- Timed text overlays, speed/rotation/framing edits, local automatic speech captions, and adaptive HLS playback.
- Permission-controlled duets/remixes with original links and credit preservation.
- Staff moderation queue, content removal, timed suspension/restoration, and audit history.
- A credited, reproducibly imported collection of 300 openly licensed real videos.
- Private watch history with saved playback position, pause, individual removal, and clear controls.
- Named private collections and ordered public creator playlists with visibility and ownership checks.
- Live text/video conversations, message requests, threaded replies, read receipts, per-chat mute, and privacy preferences.
- Nine original CC0 music loops/effects, microphone or file voiceovers, and real rendered audio mixing with separate volume controls.
- Optional browser push for messages, comments/replies, and followed creators' new uploads, device opt-out, topic controls, and quiet time.
- Automatic verified daily SQLite backups, private S3 copies, checksum-checked restore, and a Render deployment Blueprint. See [LAUNCH.md](LAUNCH.md) for the account/domain setup and restore drill.

## Architecture

```text
React + Vite → same-origin Express API → SQLite (WAL, foreign keys, indexes)
                                     → FFmpeg validation/transcoding/thumbnails
                                     → private S3-compatible bucket (production)
                                     → SMTP (production)
```

- `client/`: responsive application, navigation, feed playback, sheets, profiles, search, upload UI.
- `server/app.js`: validated API routes, authorization, rate limiting, origin checks, media access.
- `server/auth.js`: password hashing, opaque sessions, email tokens/delivery.
- `server/schema.sql`, `server/db.js`: schema and transactional database access.
- `server/recommend.js`: replaceable recommendation ranker.
- `server/storage.js`: media processing and local/S3 storage adapters.
- `scripts/seed.js`: deterministic original media and sample social activity.
- `tests/`: real integration and browser regression suites.

The database contains club_passports, challenge_entries, beta_invites, beta_feedback, beta_devices, users, profiles, videos, video_views, likes, comments, comment_likes, follows, bookmarks, shares, hashtags, video_hashtags, notifications, messages, sessions, auth_tokens, blocks, reports, and analytics_events. Foreign keys and composite uniqueness prevent orphaned interactions and duplicate likes/follows. Permissions are enforced in the API; this SQLite deployment does not have database row-level security.

**Deployment scope:** one application instance with a persistent SQLite volume. WAL and indexes are appropriate for an early-stage single-service deployment. For multiple application replicas, migrate the relational layer to PostgreSQL, use a shared rate-limit/session cleanup service, and replace the local durable media queue with a distributed worker service. S3 already separates media capacity from database size. There is no claim of load-tested internet-scale capacity.

## Storage, uploads, and privacy

Development stores media as files in `MEDIA_DIR` (default `data/media`). Video binaries are never stored inside the relational database.

Production requires `STORAGE_DRIVER=s3`. Configure:

```dotenv
STORAGE_DRIVER=s3
S3_BUCKET=your-private-bucket
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-server-only-key
AWS_SECRET_ACCESS_KEY=your-server-only-secret
# Optional for R2, MinIO, or another S3-compatible provider:
S3_ENDPOINT=https://your-s3-endpoint
# Optional CSP origin if your provider redirects downloads to another hostname:
S3_PUBLIC_URL=https://your-media-origin
```

Keep the bucket **private**, with public access blocked. Grant the server identity only the bucket/prefix permissions it needs (`s3:PutObject`, `s3:GetObject`). Uploads are streamed to temporary files, probed with FFprobe, transcoded to H.264/AAC MP4, and given JPEG thumbnails. Uploads are limited to 100 MB, 1–180 seconds, and 4K input dimensions; published video width is at most 1080 pixels. Avatar uploads accept JPG/PNG/WebP up to 5 MB and are re-encoded to JPEG. Media processing has timeouts and a persistent background queue with one processing worker.

The client sees mediated `/api/media/:id/video` and `/api/media/:id/thumbnail` URLs. The server checks visibility and blocks before serving local files or issuing a **60-second signed S3 download URL**. Private/follower videos cannot be sent to an in-app recipient who lacks access. Anonymous visitors cannot retrieve private media. Local files support byte-range playback. Access already granted through a signed URL remains valid until that URL expires. No AWS or SMTP secrets are shipped to the frontend.

The media uploader does not need bucket CORS because uploads are server-side. If your S3 provider requires CORS for browser video playback, allow only your application origin and GET/HEAD; expose `Content-Length` and `Content-Range`. Include its actual media hostname in `S3_PUBLIC_URL` for the content security policy.

Deleting content removes its database row and cascades social data immediately; mediated media access is denied. Physical storage cleanup can be scheduled separately by comparing bucket keys with active video/avatar references; orphaned objects are not exposed publicly. Back up the database and bucket independently.

## Seed videos and content rights

The 36 clips are **original procedural motion studies**, with generated gradient animations, typography, and synthesized audio. They are sample clips labeled across 12 categories, not scraped footage of actual sports, animals, or people. The original procedural collection does not use scraped TikTok videos, commercial songs, or external profile photos. The additional open collection imports real footage with individual source licenses and credits; see below. Initial profile pictures are deterministic initials; users can upload their own photo.

The generator is included and covered by the repository's MIT license. `npm run seed` fills an empty or incomplete database idempotently. To start over in a disposable development environment, stop the app, back up anything needed, remove `data/velo.sqlite` plus its WAL/SHM files, then run the seed command. This destroys local user content; it is not a production reset procedure.

Seed media is generated on demand and excluded from Git to keep the repository small. With S3 enabled, the seed script uploads original MP4s/JPEGs to your private bucket. FFmpeg and font support are included in the Docker image.

## Recommendations and analytics

Candidates are limited to a recent pool of 200 visible, unblocked videos, excluding IDs already returned in the current scroll session. Eight ranked entries are sent per request; the screening room loads the active film, while the home and related shelves show thumbnails without autoplay.

`rankVideos(candidates, userId)` considers:

- Category, hashtag, and creator affinity from persisted likes (+3), comments (+4), saves (+5), shares (+6), and watch signals.
- Watch completion, completed views, rewatches, fast skips, and repeat exposure penalties.
- Followed creators, aggregate completion and engagement quality, logarithmic popularity, and exponential freshness decay.
- A small deterministic daily exploration bonus for 10% of candidates, preserving discovery without randomizing the feed.

Affinity is bounded with `tanh`, so one session cannot dominate the score indefinitely. Already viewed videos lose four points per prior viewing. Skips under two seconds with less than 20% completion contribute negative affinity. The `video_views` table records seconds watched, maximum completion, completed flag, loops, and skip duration. View signals flush when a video leaves the active viewport, the tab hides, or the component unmounts. The analytics_events table also records view/completion, rewatch/skip, like, comment, save, share, and follow-after-watch events; bookmark and follow tables supply additional signals. The isolated ranker can later be replaced by a learned model without changing the feed API.

## Security and moderation

Server-side validation uses Zod and prepared database statements. Mutations require same-origin JSON or multipart requests; cross-site fetch metadata and mismatched origins are rejected. React escapes user content. Helmet sets a restrictive content security policy. APIs, account attempts, uploads, and media delivery have separate rate limits. General API limits identify authenticated users independently; anonymous and authentication attempts are limited by IP. Requests are size-limited. Profile/video/comment ownership, collection privacy, follower visibility, and bilateral blocks are checked server-side. Auth cookies are never readable by frontend JavaScript.

Reports are stored with target type/ID, reason, reporter, creation time, and moderation status. The staff-only Moderation dashboard reviews this queue, records decisions, removes content, and suspends/restores accounts. Staff roles are granted through trusted server tooling. Public launch still requires your own operational moderation process and policy.

## Test and verify

```sh
npm run check                 # Production build + API/database integration tests
npx playwright install chromium webkit
npm run test:e2e              # Full flow on desktop and iPhone 16 Pro/Android Chromium and iPhone-size WebKit
npm audit --audit-level=moderate
```

The integration suite uses a disposable database, validates seed completeness/idempotence, and tests authentication, verification, reset/session revocation, CSRF, video ranges, likes, saved privacy, follows, comments/replies, recommendations, actual transcoding, private media, messaging, notifications, search, reporting, blocking, and cascaded deletion.

The browser suite starts a separate test server/database on port 3101. It tests actual playback, signup/verification, screening-room playback, social actions, search, profile editing, upload/playback, notifications, logout/login, persistent sessions, console errors, and horizontal overflow. Test accounts stay in the ignored `data/e2e.sqlite` database; delete that database when no longer needed. Screenshots/traces of failures go into `test-results/`.

GitHub Actions runs builds, security audit, integration tests, and 18 browser checks across desktop, iPhone 16 Pro, Android, and WebKit layouts on every main-branch push and pull request. The Docker deployment definition is included; Docker was unavailable in the local verification environment. Tests use local storage and development email; production SMTP and your chosen S3 provider require environment-specific deployment verification. Camera recording is exercised with a synthetic browser camera. Chromium testing does not substitute for device testing on Safari/iOS or camera testing on physical phones.

## Deploy

1. Provision a private S3-compatible bucket and an SMTP service. Put their credentials in your hosting platform's secret store.
2. Configure `.env` or platform variables from `.env.example`: HTTPS `APP_ORIGIN`, `MAIL_MODE=smtp`, SMTP credentials, `STORAGE_DRIVER=s3`, bucket, region, and server AWS credentials. Set `TRUST_PROXY=1` only behind your trusted reverse proxy.
3. Build the Docker image and run it with a persistent `/app/data` volume. `docker compose up --build -d` uses the supplied `compose.yaml` and `.env` file.
4. Put an HTTPS reverse proxy in front of port 3001. Allow a 100 MB request body and at least three minutes for upload processing. Example Nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 100m;
  proxy_read_timeout 240s;
}
```

5. Wait for the first-run original clips to be generated and uploaded. Check `/api/health`. Register a real account, verify its email, post a video, and check private playback before exposing the service publicly.
6. Back up the SQLite database with SQLite's backup API or a consistent snapshot (include WAL state); set bucket backups/lifecycle policy and operational log retention. Periodically delete expired session/auth-token rows and unused media objects through trusted maintenance tooling.

Static-only hosting such as GitHub Pages cannot run this backend. This repository does not provision cloud accounts or deploy a public instance automatically.

## Creator Studio and community features

New accounts choose interests during onboarding; these persist in `interests` and affect the Club picks score. Feed preferences let users edit topics and undo hidden videos, creators, or categories. Video options explain one applicable ranking signal, offer “Not interested,” and open duets/remixes. A small editorial boost helps people discover the credited open collection; creator/category diversity prevents a single collection from occupying consecutive slots. Your circle retains chronological order.

**Creator Studio** is available from the sidebar and your profile, including on mobile. It lists drafts, queued/processing/failed uploads, progress, retry controls, caption editing, and 7/30/90-day analytics. Analytics measure playback events, seconds watched, average watch time, completed views, daily views, per-video performance, and new/net followers. One view represents a flushed viewing session rather than a deduplicated person. Generated demo watch events are explicitly excluded from Studio watch metrics. Historical follows created before this update are not included in follower-change history.

Uploads now return **202 Accepted** with an owner-only job ID. Raw media is retained privately in local storage or S3. A single durable SQLite worker processes one job at a time, generates H.264/AAC MP4, JPEG covers, and low/medium/high HLS variants, and marks it ready atomically. HLS.js automatically switches quality; Safari uses native HLS and other browsers fall back to MP4. Playlists and segments pass the same visibility checks as MP4 delivery, and S3 HLS/raw media is streamed through the API. Restarting recovers interrupted processing jobs. Keep one application/worker instance per SQLite database; this is not a distributed queue. At most 20 unfinished uploads per account are retained. Failed uploads require an explicit retry from Studio.

Drafts survive reloads and remain invisible outside their owner's job endpoints. The editor supports trimming, cover selection, 0.5×/1×/1.5×/2× speed, 90-degree rotations, fit/fill framing, audio removal, and timed burned-in text overlays. Rendered edits appear after processing. Drafts can be resumed, edited, published, or deleted. Moderated uploads cannot be republished through retry.

Duets place the source and response side by side; the source holds its last frame if shorter than the response. Remixes prepend up to eight seconds of the source to the response, with a combined 180-second limit. Only visible public sources with the relevant creator permission enabled can be used. Permissions are rechecked at publication. Original links and imported author/license credits carry through collaboration. Original removal/deletion, suspension, and bilateral blocks protect collaboration chains too.

### Local automatic captions

Requires Python 3.9+ for development. Run:

```sh
npm run captions:setup
```

This installs pinned `faster-whisper` in `data/captions-venv` and caches the multilingual `tiny` model in `data/models`. Check “Generate speech captions” when creating a video. Speech is processed **on this server**, without uploading audio to a transcription provider. The model is downloaded from its model host during setup. Docker bundles Python, the caption runtime, and the model. Override `CAPTION_PYTHON`, `CAPTION_MODEL`, and `CAPTION_MODEL_DIR` as needed. Recognition can be inaccurate; review words/timing in Studio. No-speech clips get a clear no-speech status. A model/setup failure does not discard the upload: Studio shows a warning and permits manual captions. Saved cues produce authenticated WebVTT tracks, and viewers can toggle captions.

To run the actual speech-model integration check:

```sh
npm run seed
node scripts/caption-fixture.js
TEST_CAPTIONS=1 npm test
```

The test fixture uses the public JFK inaugural speech distributed in the Whisper repository; it is not included in the public video feed.

### Staff moderation

Grant access to an **existing verified account** from the server:

```sh
npm run admin -- your-email@example.com
# To revoke:
npm run admin -- your-email@example.com --revoke
```

There is no public role-assignment endpoint or default production administrator. Open Moderation from the staff profile/sidebar. Staff can review reports, dismiss them, remove reported videos/comments, suspend creators for a specified duration, and restore suspended accounts. Every decision requires a reason and creates an immutable audit record. Repeated decisions on an already-reviewed report are rejected. Removing a video hides its collaboration descendants and all mediated media. Suspended creators cannot mutate content, and their videos become unavailable until restoration/expiry. This dashboard supplies operational tools; your deployment still needs people and a community policy to review reports.

### Real video collection and credits

Startup now imports **300 real clips** from Wikimedia Commons in the background: wildlife, landscapes, travel, sports, cooking, robotics, and science. These are individually selected **CC0 or CC BY** files; each entry preserves its specific license version. `scripts/open-videos.json` preserves the exact file URL, description page, original author, license link, retrieval date, and transformations. Clips are shortened to at most twelve seconds, resized/transcoded, and have audio removed. `Velo Open Archive` is a Velo-operated collection, not an account impersonating the original creators. Imported videos start with zero fabricated likes, comments, views, or followers. Credits are visible on each video and in its options and survive remixing.

```sh
npm run import:videos       # Idempotent manual import / retry
# Optional: 1–4 concurrent workers (default 2)
IMPORT_CONCURRENCY=4 npm run import:videos
```

Set `IMPORT_REAL_VIDEOS=0` to disable automatic import. A first import of the full library takes several minutes, depending on bandwidth and hardware, while the app stays usable. Fresh installations need outbound access to `upload.wikimedia.org`; an unavailable source is logged and skipped while the app remains usable. Downloads stream to disk with a 100 MB cap, four bounded attempts for temporary failures, and a cross-process lock that prevents overlapping startup/manual imports. Reruns skip complete clips, repair missing local files or adaptive assets, and preserve moderation/privacy decisions. `data/imports/last-run.json` records the latest totals. Run the import again to retry. `scripts/discover-videos.py` optionally retrieves metadata candidates; review candidates before adding them to the curated manifest. Binary video files stay in private storage and out of Git; the repository contains the reproducible curated manifest/importer. Existing imported files remain usable without network access. Before adding sources, verify each file's own rights and attribution requirements; the collection manifest's entries do not grant rights to other uploads. See [Wikimedia reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

Back up raw uploads, encoded media, playlists/segments, and SQLite together. Deleted database rows revoke mediated access immediately, while physical orphan cleanup remains an operator task; include `media_jobs.raw_location` and `video_assets.location` when identifying live objects. Captions, interests, feedback, follower history, job state, and moderation history are stored in additive migrations that preserve existing accounts and content.
