Build a complete, production-quality short-form vertical video social media app inspired by TikTok. Do NOT make this a static mockup. Build the actual working application with a real frontend, backend, database, authentication, video storage, interactions, and seeded video content.

The app should feel extremely polished and fast, with smooth animations and a mobile-first interface. Give it an original app name and branding rather than calling it TikTok.

## 1. CORE VIDEO FEED

The main screen should be a full-screen vertical video feed.

Each video should:
- Fill the entire screen vertically
- Autoplay when it becomes the active video
- Pause immediately when the user scrolls away
- Loop automatically
- Be muted/unmuted by tapping
- Support smooth swipe-up/swipe-down navigation
- Preload upcoming videos so scrolling feels instant
- Display a loading indicator if buffering
- Maintain the correct aspect ratio
- Support captions/text overlays

Overlay the following information on each video:
- Creator username
- Creator profile picture
- Caption
- Hashtags
- Music/audio name
- Like button
- Comment button
- Save/bookmark button
- Share button
- Creator follow button

Show real counts for likes, comments, saves, and shares based on database data.

Create two feed tabs:
- Following
- For You

The Following feed shows videos from followed creators.

The For You feed should use a recommendation algorithm based on signals including:
- Videos watched
- Percentage of video watched
- Rewatches
- Likes
- Comments
- Saves
- Shares
- Accounts followed
- Hashtags/categories interacted with
- Videos skipped quickly

Do not simply randomize the feed.

## 2. VIDEOS ALREADY IN THE APP

The application must NOT launch with an empty feed.

Seed the database with at least 30-50 short-form videos across categories such as:
- Comedy
- Sports
- Basketball
- Gaming
- Food
- Travel
- Animals
- Technology
- Fashion
- Music
- Memes
- Educational content

Use legally reusable/demo video content from sources that permit this use, or include local/sample videos in the project.

Do not scrape, download, or rehost copyrighted TikTok videos without authorization.

If linking/embedding third-party content is supported by the provider's official API or embed system, use that official method instead of downloading and rehosting the video.

Every seeded video should have:
- Creator
- Username
- Profile picture
- Caption
- Hashtags
- Audio/music label
- Like count
- Comment count
- Share count
- Upload date
- Category

Generate realistic demo accounts and engagement so the app feels active immediately.

## 3. AUTHENTICATION

Create working:
- Sign up
- Login
- Logout
- Forgot password
- Email verification
- Persistent login sessions

Users should be able to create:
- Username
- Display name
- Bio
- Profile photo

Usernames must be unique.

## 4. PROFILES

Each user gets a profile page containing:
- Profile picture
- Username
- Display name
- Bio
- Following count
- Follower count
- Total likes
- Follow/Edit Profile button
- Uploaded videos
- Liked videos
- Saved videos

Allow users to:
- Edit profile picture
- Edit display name
- Edit username
- Edit bio

Tapping another creator's username or picture should open their profile.

## 5. FOLLOW SYSTEM

Create a real follow system.

Users can:
- Follow
- Unfollow
- View followers
- View following

Following counts must update correctly.

Following a creator should affect the Following feed and recommendation system.

## 6. LIKES

Likes must actually work.

When the user taps the heart:
- Animate it
- Save the like to the database
- Update the count instantly

Tapping again removes the like.

Double-tapping the video should also like it and show a heart animation.

## 7. COMMENTS

Create a TikTok-style comments panel that slides up over the video.

Users can:
- Post comments
- Delete their own comments
- Like comments
- Reply to comments
- View replies

Display:
- Profile picture
- Username
- Comment
- Timestamp
- Like count

Comment totals should update automatically.

## 8. SHARING

The share button should open a share sheet.

Include:
- Copy link
- Share through supported device/browser share functionality
- Send to another user inside the app

Generate unique shareable URLs for videos.

## 9. SAVED VIDEOS

Users can bookmark videos.

Saved videos should appear privately on their profile under a Saved tab.

## 10. VIDEO UPLOAD

Create a real video upload system.

Users should be able to:
1. Select a video
2. Preview it
3. Trim/select the video duration if practical
4. Choose a thumbnail
5. Write a caption
6. Add hashtags
7. Choose a category
8. Configure comments
9. Upload/post

Show upload progress.

Store uploaded videos using scalable object storage rather than storing video binary data directly in the main database.

Generate thumbnails for uploaded videos where possible.

## 11. CREATE SCREEN

The center + button in the navigation should open the creation interface.

Include:
- Upload video
- Record video if browser/device permissions allow
- Caption
- Hashtags
- Thumbnail
- Privacy settings
- Comments on/off
- Post button

## 12. SEARCH / DISCOVER

Create a Discover page with a search bar.

Users can search:
- Creators
- Videos
- Captions
- Hashtags

Include:
- Trending videos
- Trending hashtags
- Suggested creators
- Categories

Search results should update quickly.

## 13. INBOX / NOTIFICATIONS

Create an Inbox tab.

Notifications should include:
- New follower
- Someone liked your video
- Someone commented
- Someone replied to your comment
- Someone liked your comment

Notifications should be stored in the database and have read/unread status.

## 14. NAVIGATION

Use a bottom navigation bar similar to modern short-form video apps:

Home | Discover | + | Inbox | Profile

The navigation should work without unnecessary page reloads.

## 15. UI / DESIGN

The video feed should primarily use a dark/black interface.

Make the UI:
- Modern
- Minimal
- Premium
- Mobile-first
- Responsive
- Smooth
- Fast

Use polished animations for:
- Likes
- Following
- Comments opening
- Sharing
- Navigation
- Loading
- Video transitions

Avoid making the interface look like a generic AI-generated dashboard.

Desktop should still work, but the video feed should retain a phone-like viewing experience rather than stretching videos awkwardly across a monitor.

## 16. DATABASE

Create a proper relational database schema for at least:

users
profiles
videos
video_views
likes
comments
comment_likes
follows
bookmarks
shares
hashtags
video_hashtags
notifications
messages

Use proper foreign keys, indexes, timestamps, and permissions.

Do not fake important functionality using only frontend arrays or localStorage.

## 17. VIDEO ANALYTICS

Record useful feed signals including:
- View
- Watch duration
- Completion percentage
- Completed view
- Rewatch
- Like
- Comment
- Save
- Share
- Follow after watching
- Skip speed

Use these signals to improve recommendations.

## 18. RECOMMENDATION ENGINE

Implement an initial recommendation scoring system.

For example, score candidate videos based on:
- User-category affinity
- Hashtag affinity
- Creator affinity
- Completion rate
- Like rate
- Comment rate
- Share rate
- Freshness
- Overall popularity

Reduce scores for:
- Videos already seen repeatedly
- Videos the user immediately skipped
- Creators/categories the user repeatedly ignores

Include some exploration so the feed does not become completely repetitive.

Design this recommendation logic so it could later be replaced by a more advanced ML recommendation system.

## 19. PERFORMANCE

Optimize aggressively.

Implement:
- Lazy loading
- Video preloading
- Pagination/infinite scrolling
- Database indexes
- Optimistic UI updates
- Cached queries where appropriate
- Efficient video delivery
- Thumbnail loading
- Proper loading/error states

Do not download the entire feed at once.

## 20. SECURITY

Implement:
- Server-side authorization
- Input validation
- File type validation
- Upload size limits
- Rate limiting where appropriate
- Secure authentication
- Database row-level permissions if supported by the chosen backend
- Protection against users modifying other users' content

Never expose private server keys or secrets in frontend code.

## 21. ADMIN / MODERATION

Create basic moderation capabilities for:
- Reporting a video
- Reporting a user
- Reporting a comment
- Blocking users
- Removing your own content

Structure the database so an admin moderation dashboard can be added later.

## 22. RESPONSIVENESS

The application must work on:
- iPhone-size screens
- Android-size screens
- Tablets
- Desktop browsers

Prioritize mobile.

## 23. QUALITY REQUIREMENTS

This is extremely important:

DO NOT create a prototype where buttons do nothing.

DO NOT create fake functionality just to make the UI look complete.

DO NOT leave major sections as TODOs.

DO NOT use placeholder buttons for features that are supposed to work.

Test the complete user flow:

Sign up → watch videos → swipe feed → like → comment → follow → search → open profile → save video → upload video → view uploaded video → receive notifications → log out → log back in.

Fix errors you encounter.

The final result should feel like an actual early-stage short-form video social network that someone could genuinely use, not simply a TikTok-looking webpage.

## 24. SEED DATA

Automatically create enough seed data that the app looks populated immediately.

Create approximately:
- 20+ demo creators
- 30-50+ videos
- Hundreds of realistic likes
- Comments and replies
- Follow relationships
- Different hashtags/categories

Use deterministic seed scripts so the database can easily be repopulated during development.

Do not fabricate engagement on real people's accounts. Demo accounts should clearly be fictional/sample accounts.

## 25. FINAL DELIVERY

Before considering the project complete:
- Run the application
- Fix build errors
- Fix console errors
- Test authentication
- Test the database
- Test video playback
- Test mobile layouts
- Test likes/comments/follows/bookmarks
- Test uploads
- Test profiles
- Test search
- Test the recommendation feed

Also create a README explaining:
- Architecture
- Setup
- Environment variables
- Database setup
- Storage setup
- How seed videos are loaded
- How the recommendation algorithm works
- How to run locally
- How to deploy

Do not stop after generating the UI. Continue until the application is functional end-to-end.