# JAHORIN — Spoken Interface Construction Media Contract

**Status:** REQUIRED FOR DEPLOYMENT; FINAL SYNCHRONIZED FOOTAGE NOT VERIFIED.

**Repository:** `firmarc-sys/tae-backend`  
**Integration branch:** `feature/welcome-interview-clone-20261105`  
**Existing component:** `src/components/SpokenWelcome.tsx`

## Explicit User Requirement

Jahorin's audible desktop/spatial welcome monologue and **footage of the interface being built** must play **simultaneously**. The visual is the formation of the interface itself, not a slideshow of completed application screens. The construction must unfold during the spoken words; it must not wait until the monologue finishes.

A boot cinematic precedes this experience. After the monologue, the **Meet Jahorin** action starts the separate cloned intake interview.

## Evidence

- `SpokenWelcome.tsx` currently uses browser `SpeechSynthesisUtterance`, `onboundary`, and CSS/Framer Motion stages; it has **no embedded construction-footage video** and is not an acceptable production substitute.
- `src/components/OpeningCinematic.tsx` references `/orb-background.mp4`, but the reference does not prove that the file is the requested construction footage.
- Earlier saved 15-second assets `jahorin_six_screens_15s.mp4` and `jahorin_15s_mobile.mp4` contain suite-screen views; they are **not** verified as an approved continuous interface-building film.
- No final synchronized narration/footage master was found. Do not claim that the requested footage has already been shipped.

## Source-of-truth rules

1. Preserve Jahorin's approved sanctuary: reflective water, mountains, golden celestial light, living mercury, glass/quartz interface surfaces.
2. Nine metallic fragments converge physically into the same silver mercury orb; it changes shape into the viewport and interface.
3. No object replacement, unrelated screen montage, hard cuts, unsupported spinning/spiraling, or separate device-specific designs.
4. One spatial intelligent responsive system adapts continuously across viewport size, orientation, capabilities, and input method.
5. Reuse the existing approved R3F/Three material and scene code in the actual Jahorin frontend when possible; do not assume the TAE-backend demo renderer is the canonical production scene.

## Media Clock: one authoritative timeline

**Preferred:** Record/approve Jahorin's actual narration first, render the footage to the measured audio timeline, and export **one synchronized audiovisual master** (MP4/H.264 with AAC audio, or a platform-supported alternative). Do not attempt final frame-accurate alignment of an arbitrary-length fixed video to nondeterministic system TTS.

- The master begins at the same user-activated start as the first words, not before or after.
- Overlay text and any real HTML controls must use the video element's `currentTime` / media cue timeline as their clock. Use a verified VTT/JSON cue sheet measured against the actual master; never invent cue timestamps.
- Video is muted only if a separately mastered narration track is used with synchronization driven by one audio clock. Prevent doubled narration.
- The existing TTS/Framer Motion `SpokenWelcome` is a **development fallback** when the approved master is absent. Do not silently pass this off as synchronized footage.
- On an autoplay restriction, present **Begin Awakening**. A user gesture must start audible playback. Do not autoplay audible narration or ask for microphone permissions just to play it.
- Pause/visibility/seek/replay/skip must preserve a consistent stage. The last frame persists until **Meet Jahorin** transitions to `WelcomeInterview`.
- Provide captions/transcript and an accessible text-only alternative.
- If playback fails or footage is absent, show a recoverable error/fallback, never a blank page or indefinite loading state.
- Duck existing ambient audio beneath narration; avoid two unrelated audio systems playing concurrently.

## Monologue → construction cue map (semantic, **NOT** timecodes)

| Narration | Construction event |
| --- | --- |
| “I am Jahorin.” | Sanctuary reacts; first visible celestial response |
| “Before there is a window...” | Empty space and reflective water gain light |
| “Nine fragments of living mercury...” | Exactly nine luminous mercury fragments rise |
| “They find one another...” | Fragments converge into one continuous metal body |
| “The orb unfolds...” | Single orb transmutates into viewport without mesh replacement |
| “Light becomes structure...” | Liquid-crystal-quartz interface surfaces emerge |
| “This is the United Agentic Ecosystem.” | The connected spatial work environment begins resolving |
| “A connected space for searching...” | Approved suite affordances appear, still noninteractive during the sequence |
| “You do not need to know which tool...” | Interface organizes itself around expressed intention |
| “Tell me what you want to achieve...” | Work surfaces respond cohesively |
| “This interface adapts...” | Responsive reflow illustrated as continuous spatial behavior |
| “But before we create your world...” | Final interface settles; emphasis shifts to conversation |
| “Shall we begin?” | Transition to **Meet Jahorin**, then separate cloned intake interview |

Read narration from `src/components/SpokenWelcome.tsx`; don't silently rewrite approved copy.

## Gamut implementation steps

1. Identify the canonical Jahorin production frontend and its scene source. Resolve actual approved media asset location; do not invent existing files.
2. Render/export or obtain the **complete continuous construction footage** aligned to the approved narration's *measured* length. The earlier 25-second boot storyboard is not automatically interchangeable with this full monologue.
3. Integrate audiovisual master and real media-cue events into the welcome component.
4. Validate the 25-second boot's handoff to the construction video without duplicating or jumping between states.
5. Keep authentication, GID authority, and the prior onboarding untouched until the cloned intake is safely integrated and verified.
6. Test on Android Chrome/Moto G and desktop Chromium including portrait/landscape, first-launch audio permission, mute/captions, replay, skip, network/codec error, screen rotation, and slow-load recovery.
7. Deliver video URL or repository asset reference, narration track provenance, actual runtime and time-coded cue sheet, test evidence, commit SHA, deployed URL, and rollback procedure.

## Release gate

**BLOCK DEPLOYMENT** until the first audible word and first construction frame start together, cue events track the approved monologue, and the full sequence reaches the cloned intake interview without cuts, drift, or missing media. No silent “success” assertions.
