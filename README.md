# Velo

**Find your next obsession.** A working, mobile-first short-video social network with a React interface, Express API, relational database, authenticated video delivery, and S3-compatible object storage for production.

This repository includes the original brief in [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md). It is a runnable application, not a static design. Production deployment requires your own hosting, email delivery, and object-storage configuration.

## Run locally

Requires **Node.js 24+**, npm, and **FFmpeg/FFprobe** on your PATH. Install FFmpeg with `brew install ffmpeg` on macOS or `sudo apt-get install ffmpeg fonts-dejavu-core` on Debian/Ubuntu.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. The API runs on port 3001. First startup automatically creates the schema and seeds 24 fictional creators, 36 original seven-second vertical videos, 576 relational likes, 144 comments/replies, bookmarks, shares, views, and follows. Generating the clips takes approximately 30–90 seconds depending on hardware. Startup is idempotent; subsequent runs preserve all data.

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

- Autoplaying, looping, snap-scrolling feed; inactive videos pause; tap to mute/unmute; double tap to like; buffering and retry states; keyboard navigation on desktop; nearby video preloading.
- For You ranking from real activity and Following feed from persisted relationships; eight-video feed pages with exclusions.
- Signup, login, logout, persistent sessions, email verification/resend, forgot password, one-time password reset.
- Editable profiles, photo uploads, follower/following lists, uploaded/liked videos, private saved collection.
- Optimistic video likes and bookmarks, follows, comment/reply threads, comment likes, and author-only deletion.
- Copy-link and browser/device sharing, shareable `/v/:id` URLs, in-app video messages.
- Search by caption/category/hashtag/creator, trending tags, category filters, suggested creators, paginated results.
- Database notifications for follows, video likes, comments, replies, comment likes; shared-video inbox and read state. Activity polls every 15 seconds on the inbox, with a 30-second navigation badge refresh.
- MP4/MOV/WebM uploads, live upload progress, preview, duration trim, cover-frame selection, category, captions/hashtags, public/followers/private visibility, comments switch.
- Browser camera recording when supported and permission is granted; graceful fallback to upload.
- Reporting of videos, accounts, and comments; bilateral account blocking/unblocking; deletion of your own videos/comments.

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

The database contains users, profiles, videos, video_views, likes, comments, comment_likes, follows, bookmarks, shares, hashtags, video_hashtags, notifications, messages, sessions, auth_tokens, blocks, and reports. Foreign keys and composite uniqueness prevent orphaned interactions and duplicate likes/follows. Permissions are enforced in the API; this SQLite deployment does not have database row-level security.

**Deployment scope:** one application instance with a persistent SQLite volume. WAL and indexes are appropriate for an early-stage single-service deployment. For multiple application replicas, migrate the relational layer to PostgreSQL, use a shared rate-limit/session cleanup service, and put transcoding on a job queue. S3 already separates media capacity from database size. There is no claim of load-tested internet-scale capacity.

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

Keep the bucket **private**, with public access blocked. Grant the server identity only the bucket/prefix permissions it needs (`s3:PutObject`, `s3:GetObject`). Uploads are streamed to temporary files, probed with FFprobe, transcoded to H.264/AAC MP4, and given JPEG thumbnails. Uploads are limited to 100 MB, 1–180 seconds, and 4K input dimensions; published video width is at most 1080 pixels. Avatar uploads accept JPG/PNG/WebP up to 5 MB and are re-encoded to JPEG. Media processing has timeouts and a two-video concurrency cap; exceeding the cap gives a retryable response.

The client sees mediated `/api/media/:id/video` and `/api/media/:id/thumbnail` URLs. The server checks visibility and blocks before serving local files or issuing a **60-second signed S3 download URL**. Private/follower videos cannot be sent to an in-app recipient who lacks access. Anonymous visitors cannot retrieve private media. Local files support byte-range playback. Access already granted through a signed URL remains valid until that URL expires. No AWS or SMTP secrets are shipped to the frontend.

The media uploader does not need bucket CORS because uploads are server-side. If your S3 provider requires CORS for browser video playback, allow only your application origin and GET/HEAD; expose `Content-Length` and `Content-Range`. Include its actual media hostname in `S3_PUBLIC_URL` for the content security policy.

Deleting content removes its database row and cascades social data immediately; mediated media access is denied. Physical storage cleanup can be scheduled separately by comparing bucket keys with active video/avatar references; orphaned objects are not exposed publicly. Back up the database and bucket independently.

## Seed videos and content rights

The 36 clips are **original procedural motion studies**, with generated gradient animations, typography, and synthesized audio. They are sample clips labeled across 12 categories, not scraped footage of actual sports, animals, or people. No TikTok videos, licensed songs, external media URLs, or scraped profile photos are used. Initial profile pictures are deterministic initials; users can upload their own photo.

The generator is included and covered by the repository's MIT license. `npm run seed` fills an empty or incomplete database idempotently. To start over in a disposable development environment, stop the app, back up anything needed, remove `data/velo.sqlite` plus its WAL/SHM files, then run the seed command. This destroys local user content; it is not a production reset procedure.

Seed media is generated on demand and excluded from Git to keep the repository small. With S3 enabled, the seed script uploads original MP4s/JPEGs to your private bucket. FFmpeg and font support are included in the Docker image.

## Recommendations and analytics

Candidates are limited to a recent pool of 200 visible, unblocked videos, excluding IDs already returned in the current scroll session. Eight ranked entries are sent per request; the frontend keeps media sources only on the active video and its neighbors.

`rankVideos(candidates, userId)` considers:

- Category, hashtag, and creator affinity from persisted likes (+3), comments (+4), saves (+5), shares (+6), and watch signals.
- Watch completion, completed views, rewatches, fast skips, and repeat exposure penalties.
- Followed creators, aggregate completion and engagement quality, logarithmic popularity, and exponential freshness decay.
- A small deterministic daily exploration bonus for 10% of candidates, preserving discovery without randomizing the feed.

Affinity is bounded with `tanh`, so one session cannot dominate the score indefinitely. Already viewed videos lose four points per prior viewing. Skips under two seconds with less than 20% completion contribute negative affinity. The `video_views` table records seconds watched, maximum completion, completed flag, loops, and skip duration. View signals flush when a video leaves the active viewport, the tab hides, or the component unmounts. Follow and interaction tables supply additional signals. The isolated ranker can later be replaced by a learned model without changing the feed API.

## Security and moderation

Server-side validation uses Zod and prepared database statements. Mutations require same-origin JSON or multipart requests; cross-site fetch metadata and mismatched origins are rejected. React escapes user content. Helmet sets a restrictive content security policy. APIs, account attempts, and uploads have rate limits. Requests are size-limited. Profile/video/comment ownership, collection privacy, follower visibility, and bilateral blocks are checked server-side. Auth cookies are never readable by frontend JavaScript.

Reports are stored with target type/ID, reason, reporter, creation time, and moderation status. A separate admin dashboard can be built against this queue; no unrestricted admin endpoint is exposed. Administrators can review the database through trusted operational tooling. Public launch still requires your own operational moderation process and policy.

## Test and verify

```sh
npm run check                 # Production build + API/database integration tests
npx playwright install chromium
npm run test:e2e              # Full flow on desktop and iPhone-size Chromium
npm audit --audit-level=moderate
```

The integration suite uses a disposable database, validates seed completeness/idempotence, and tests authentication, verification, reset/session revocation, CSRF, video ranges, likes, saved privacy, follows, comments/replies, recommendations, actual transcoding, private media, messaging, notifications, search, reporting, blocking, and cascaded deletion.

The browser suite starts a separate test server/database on port 3101. It tests actual playback, signup/verification, scroll-and-pause, social actions, search, profile editing, upload/playback, notifications, logout/login, persistent sessions, console errors, and horizontal overflow. Test accounts stay in the ignored `data/e2e.sqlite` database; delete that database when no longer needed. Screenshots/traces of failures go into `test-results/`.

GitHub Actions runs builds, security audit, integration tests, and the two browser layouts on every main-branch push and pull request. Tests use local storage and development email; production SMTP and your chosen S3 provider require environment-specific deployment verification. Chromium testing does not substitute for device testing on Safari/iOS or camera testing on physical phones.

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
