# Velo founding-circle beta

The app now includes a private host desk at `/beta`, a feedback form, and a device-check record. This prepares a beta of up to ten invited members. It does not recruit testers, send invitation emails, or publish the local preview.

## Set up the circle

1. Keep a single production service with the storage, email, and backup settings in `LAUNCH.md`. The user has requested no hosting charges; do not create paid hosting until they approve it separately.
2. Grant the real host account the admin role using the existing trusted admin command. Development demo administrators are not production accounts.
3. Set `BETA_INVITE_ONLY=1` before inviting people. Existing accounts still sign in; new signups require an invitation. Public films remain browsable, while beta feedback and device results require membership or staff access.
4. Open **Profile → Founding circle** or `/beta`. In **Host’s desk**, create an invitation with a useful label. Copy its link immediately: only a token hash is stored, so the original link cannot be retrieved later. Each invite is valid for one person for fourteen days. Expired or revoked unused links free their reserved slot. Accepted invitations continue to count toward the ten-person cohort.
5. Share five invitations initially. Add up to five more after checking signup, playback, and feedback. Invitations are never emailed automatically. Hosts can revoke unused invitations.
6. Invited new members create their account through the invitation link, then verify their email. Existing verified members accept the link. After invited signup, **Enter the founding circle** opens the beta panel without consuming the invitation twice.

## A twenty-minute first visit

Ask each tester to:

- Choose one or two interests and finish the first adventure by saving a film and verifying their email.
- Collect the First light stamp, open their passport, and understand how cosmetic styles unlock.
- Explore two topics and watch a complete film with sound or captions.
- Create an original short film and explicitly submit it to the weekly challenge showcase.
- Find the saved film in their library, then leave a private field note describing one delight and one confusing moment.

The guided adventure awards 25 XP once per account. The weekly challenge awards 75 XP once per UTC week after an eligible submission. Regular quests still award 40/60/100 XP. No reward is earned merely by watching. Existing stamps and XP survive weekly resets, withdrawals, or a break from using the app. Cosmetics unlock at levels 1–5 and are not sold.

## iPhone 16 Pro hands-on check

Use Safari on the actual phone and the app’s reachable HTTPS address. `localhost` on a phone points to the phone, not the development computer. Camera recording requires a secure context. An automated iPhone viewport or WebKit test is not a physical-device result.

Record the iOS and Safari version, the connection type, and each actual result in **Founding circle → Try it in the real world**. All results default to **Not tested**.

1. Playback: open a film; pause, resume, scrub, toggle sound, rotate to landscape, return to portrait, and try captions on a captioned film. Lock and unlock the phone; confirm playback does not continue unexpectedly in the background.
2. Camera: tap **Create**, allow camera and microphone, record five seconds, stop, and play the preview. Leave the page and confirm the camera indicator turns off. Also deny permission once and confirm the upload fallback is understandable.
3. Upload: select a short MOV from Photos; preview, trim, set a cover, publish, and play it from the profile. Test a private upload while signed out from a separate session. Confirm a dropped connection gives an actionable retry.
4. Accessibility: turn on larger text and VoiceOver. Visit Explore, Quests, Passport, challenge entry, and the feedback form. Check labels, logical reading order, visible focus when using a keyboard, touch targets, and horizontal overflow. Turn on Reduce Motion and confirm decorative movement stops.
5. Installation/notifications: optionally add to the Home Screen and check navigation. Enable push only if the tester chooses it. Record notification tests separately from the core four checks.

An Android phone is still needed for equivalent hands-on testing in Chrome. Automated Pixel 7 checks cover layout and application flows; they do not certify its physical camera.

## Review feedback

Hosts see up to the latest 100 feedback notes and 50 device reports. Mark feedback **New**, **Reviewing**, or **Done**; the member sees the status of their own notes. Never include passwords, authentication codes, or other people’s personal data. Member notes are not public posts.

After the first five sessions, address repeated blockers before inviting the next five. Useful measures are: did someone finish their first adventure without help, play a film, publish or save something meaningful, and return voluntarily? Record actual outcomes; do not invent engagement or device passes.

## Verification scope

The automated suite checks desktop Chromium, an iPhone 16 Pro viewport in Chromium, a Pixel 7 viewport, and WebKit with an iPhone viewport. It covers durable rewards and cosmetics, actual uploads, challenge entry and withdrawal, invitation redemption, feedback privacy/triage, untested device-report defaults, reduced motion, and page width. Existing Chromium camera tests use a synthetic camera.

A public beta still needs configured hosting, verified email delivery, private media storage, and real tester invitations. Those external steps are deliberately separate from the completed local beta tools.
