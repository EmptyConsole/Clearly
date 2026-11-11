# Clearly: standing rules (read at the start of every session)

You are Claude Code, building Clearly in this repository. This file is loaded every session. Each milestone prompt adds the detail for one slice of work. If a milestone prompt conflicts with this file, this file wins, and you record the conflict in docs/DECISIONS.txt.

## What Clearly is
A full-stack TypeScript app that helps people with mild hearing loss follow dialogue in TV, films, streaming and music with ordinary headphones, without hearing aids. A person sets up personalised sound in under a minute, then a personal equaliser, compressor and limiter run in real time on a browser tab, system audio (desktop app), a file or a demo clip. Around that sit dialogue tools (Voice focus, Background cleanup, Night mode, Captions), a Quiet Lab (Hum Filter, Auto Boost, Calm Sounds) and a Listening Health area (speech-in-noise check, safe-listening tracker, hearing-check history). One React codebase ships as a web app (primary), a PWA on phones and tablets, and an Electron desktop app.

Assume many users are over 55, not technical, on a modest laptop, and sceptical. Every screen has one obvious next action, plain words, large controls, no unexplained jargon and no dead ends: every error says what happened, what to try, and offers a way forward. Never shame, alarm, or imply a diagnosis.

## Three rules that apply everywhere
1. Clearly is not a medical device. It never diagnoses, treats, or makes medical claims. Describe results as how the person heard these sounds with these headphones. Never use: diagnose, treat, cure, clinical, medical-grade, "replaces hearing aids". Every user-facing string about results or health goes on the list in docs/REGULATORY_REVIEW.txt for a human professional to review before launch. You do not decide regulatory status.
2. The interface never uses the word "experimental".
3. All audio processing happens on the user's device. The app says plainly: "Your audio never leaves your device."

## Names used consistently in the UI
Hearing Check, Clear Audio, Quiet Lab, Hum Filter, Auto Boost, Calm Sounds, Voice focus, Background cleanup, Night mode, Captions, Original | Enhanced.

## How to work
- First action of every session: read docs/STATUS.txt, docs/PLAN.txt and docs/DECISIONS.txt (they are tracked plain text and are the project memory). Last action: update docs/STATUS.txt (milestone, what works, what does not, open questions, next step) and commit.
- Work on exactly the milestone you were given. Do not start the next one.
- After each milestone run typecheck, lint, unit tests and any e2e tests that exist, fix failures, commit with a descriptive message, and summarise what works and what does not.
- Never leave stubbed or placeholder logic in a finished milestone. If a platform cannot do something, build the honest fallback and say so in the UI.
- Never invent browser, Electron or library APIs from memory. When behaviour differs between versions (tab audio capture, Electron loopback, Document Picture-in-Picture, WebGPU, ffmpeg.wasm limits, navigator.audioSession), read the current documentation, write a small feature-detection test, and record the outcome in docs/DECISIONS.txt.
- Stop and ask the owner only when genuinely blocked.
- Add no dependency beyond those named without recording it and its licence in docs/DECISIONS.txt (one line of reason each).

## Repository and git rules
- pnpm workspace, Node 24 LTS (Node 20 reached end of life in April 2026), five packages: packages/core (pure TypeScript, no DOM or Web Audio), packages/audio (standard Web Audio only, depends on core), apps/web (Vite, React 18, React Router 6, Zustand, Tailwind, Radix UI), apps/server (Fastify 5; Fastify 4 is end of life), apps/desktop (Electron).
- Tracked documentation is plain text in docs/*.txt (PLAN, DECISIONS, STATUS, DESIGN_RESEARCH, HEARING_MATH, PRIVACY, MOBILE, MANUAL_TESTS, REGULATORY_REVIEW, and others). Licence notices are .txt too. Mermaid diagrams go inside docs/PLAN.txt as fenced text.
- Markdown rule: .gitignore contains `*.md`, then `!/README.md`, then `!/RULES.md`, in that order, and never lists any other Markdown file by name. README.md at the root is an empty file that you never write to; the owner writes it. Verify with `git check-ignore` that a sample Markdown file in a subfolder is ignored and that README.md and RULES.md are not.
- Never commit secrets, tokens, signing certificates, real user data, or files over 5 MB outside assets/demo. CI and a pre-commit hook enforce this.
- Root scripts: dev (web and server), dev:desktop, build, typecheck, lint, test, test:e2e, package:desktop.

## Engineering standards
- TypeScript strict with noUncheckedIndexedAccess, ESM everywhere, no `any`, ESLint, Prettier. zod validation at every boundary (storage reads, network bodies, IPC messages, imported files). Every persisted schema has schemaVersion and migration functions.
- apps/web: Zustand for UI state, Dexie over IndexedDB for persistent data, Radix primitives, Tailwind driven by CSS-variable design tokens, vite-plugin-pwa, qrcode, pdf-lib, fflate, Vitest with Testing Library, Playwright (Chromium, fake media-stream flags).
- Heavy modules load only on first use through dynamic import: RNNoise WebAssembly, Whisper runtime (@huggingface/transformers with onnxruntime-web), lamejs, ffmpeg.wasm (single-thread core), pdf-lib.
- Initial JavaScript for the app shell stays under 250 KB gzipped. Enforce it in CI with a size check. Use route-level code splitting, import Radix primitives individually, and keep Dexie, pdf-lib, qrcode and all audio-engine code out of the entry chunk.
- Heavy assets (RNNoise wasm, Whisper models, onnxruntime wasm, ffmpeg core) are served from the app's own origin under /heavy/, populated by a build-time script `pnpm fetch:heavy` that downloads pinned versions and verifies SHA-256 values listed in a tracked heavy-manifest.json. They are never committed and never requested from third-party hosts at runtime. Every heavy download shows its real size and a progress bar before starting, needs an explicit tap, is stored with the Cache API for offline use, asks for confirmation on a cellular or data-saver connection, and fails gracefully: the rest of the app keeps working and the feature explains why.
- Performance target: the live graph runs glitch-free at 48 kHz on a mid-range laptop. Measure it: a development-only probe records AudioWorklet process() time, and the sum across all worklets must average under 15 percent of one render quantum (128 frames, about 2.67 ms) with Background cleanup on.
- No analytics, telemetry or trackers. No network requests except the optional API and downloads the user explicitly starts.

## Platform adapter
Define PlatformAdapter in apps/web/src/platform with a `capabilities` object (tabAudioCapture, systemAudioCapture, virtualCableRouting, outputDeviceSelection, nativeFileDialogs, floatingCaptions, installPrompt, backgroundAudio, wakeLock, webShare, microphone) and methods listAudioSources, startCapture, saveFile, openFile, showFloatingCaptions, hideFloatingCaptions, requestPersistentStorage, openExternal. WebPlatformAdapter is feature-detected with graceful fallbacks; DesktopPlatformAdapter wraps a typed preload bridge. Components read capabilities from React context and render the right UI or a clear explanation of what is unavailable here and the best alternative. Never branch on browser names or user-agent strings, and never scatter `window.electron` probes in components. Feature detection only.

## Audio engine and signal chain (single source of truth)
One AudioEngine class in apps/web/src/audio owns one AudioContext requested at 48000 Hz, created only after a user gesture, resumed whenever suspended, state exposed to the UI. It calls buildProcessingGraph(ctx, profile, settings, io) from packages/audio, the one function that builds both the live graph and the offline export graph, so what people hear and what they export are identical by construction. Levels are dBFS; gain = 10^(dB/20). Every parameter change uses setTargetAtTime (30 ms time constant for crossfades, 50 ms for sliders), never direct assignment.

Order (document it as a comment block at the top of buildProcessingGraph and in docs/PLAN.txt):
1. Source, then an upmix gain node forced to 2 channels (channelCountMode explicit, channelInterpretation speakers) so mono feeds both ears. **Tap A** here feeds the dry path and the caption transcriber, so captions always hear the original sound.
2. Wet path: Hum filter (notch bank, flat when off) then Background cleanup (RNNoise, wet/dry, bypassed at strength 0) then Voice focus (mid/side) then the personal EQ, one chain per ear, eight filters at 250, 500, 1000, 2000, 3000, 4000, 6000, 8000 Hz (peaking Q 1.0, except 8000 Hz highshelf), then the Speech-preset peaking filter (2500 Hz, Q 1.0), then the Ambient-boost peaking filter (2500 Hz, Q 0.8). Merge the ears, apply -3 dB pre-attenuation, then the compressor stage (normal: threshold -24 dBFS, knee 12 dB, ratio 4, attack 10 ms, release 250 ms; replaced by the Night-mode rider plus tighter compressor when Night mode is on), then the program limiter (DynamicsCompressorNode: threshold -3 dBFS, knee 0, ratio 20, attack 3 ms, release 100 ms), then the Loudest-sound limiter (AudioWorklet lookahead limiter whose ceiling is the user's Loudest-sound limit, range -24 to -6 dBFS, default -12), then the wet gain.
3. Dry path: Tap A through a DelayNode that exactly matches the wet path's total latency, then the dry gain. Original | Enhanced crossfades wet and dry gains.
4. Wet plus dry are summed, then the **Safety limiter** (the same AudioWorklet limiter class, ceiling fixed at -3 dBFS, 2 ms lookahead, inter-sample-peak aware via 4x oversampled detection) is the last processing node on every path, including Original. Output goes to the destination.
5. Taps for spectrum analyser, loudness meter, compression meter, safe-listening tracker and caption window hang off the final node and never alter audio.

Constant-latency design: the wet path's total latency (RNNoise frame delay, two limiter lookaheads) is the same whether features are on, off or not yet downloaded. When cleanup is bypassed or its module is not loaded, a DelayNode of the same length sits in its place. The dry-path delay is set once from this constant. Test with an offline render that the Original/Enhanced crossfade midpoint with flat settings shows no comb-filter notch (null test).

Safety rules, enforced in code and unit-tested:
- The Safety limiter cannot be removed or bypassed: buildProcessingGraph always adds it, and a topology test asserts it is the last node before destination on both paths.
- The Loudest-sound limit is a ceiling (a limiter), not a gain stage, and applies to the Enhanced path. The Safety limiter's -3 dBFS applies to everything.
- The summed boost in any band from personal EQ, Speech preset, Voice focus and Ambient boost is clamped to +24 dB by a pure function in packages/core.
- Master output never exceeds -3 dBFS (test: offline-render hostile signals including full-scale square waves, clipped sweeps and impulses; sample peak at most -3 dBFS plus 0.1 dB, 4x-oversampled peak at most -2.5 dBFS).
- Defence in depth: if output exceeds -1 dBFS for more than 200 ms, the engine fades to silence over 100 ms and shows a plain message with a Resume button.
- Any setting change during playback is click-free, verified by an automated discontinuity detector run on offline renders.
- iOS and Safari silent switch: feature-detect `navigator.audioSession` and set its type to "playback". Only where that is absent and the primary pointer is coarse, play a one-second silent looping HTMLAudioElement on the first gesture so the page uses the media audio session. Record the finding in docs/DECISIONS.txt.

## Design and copy rules
- Calm, large, plain. Body text at least 18 px, line height 1.6, targets at least 48 px (test button at least 160 px), 8 px spacing scale, WCAG 2.2 AA for every text and control colour pair, focus rings at least 3 px, layouts survive 200 percent text zoom, High contrast switch, honour prefers-reduced-motion and prefers-color-scheme. The app never plays sound without an explicit tap. No interactive prompt times out in under 20 seconds (hearing tests excepted).
- No raw colours, sizes or durations in components: only tokens from apps/web/src/design/tokens.json (compiled to CSS variables and the Tailwind theme).
- Do not use: purple, indigo or blue-to-pink gradients; gradient text; blurred glow blobs; glassmorphism; glow shadows; centred gradient hero with two buttons; three identical icon-topped feature cards as the main layout; one large radius and soft shadow on everything; emoji as icons, bullets or headings; sparkle or magic-wand icons; stock 3D or isometric art; unmodified component-library styling; spring or bounce animation; fake testimonials, counts, logos or statistics; lorem ipsum; the words seamless, unlock, empower, elevate, supercharge, revolutionise, game-changing, cutting-edge. Never mention AI in product copy. No exclamation marks in interface copy, no "X, reimagined" headings, no three-part slogans, em dashes sparingly.
- Instead: the product's own subject is its identity (custom SVG audiograms, waveforms, frequency curves from tokens, used as real information); one primary colour plus neutrals and semantic colours; strong typographic hierarchy; an intentional grid with some asymmetry and whitespace; one icon set matched to type weight; one hand-made illustration style in token colours; specific microcopy about hearing; minimal, purposeful motion.
- Copy is about grade 7 reading level. Every string lives in apps/web/src/copy/en.ts keyed by message id. Every screen has designed empty, loading and error states. The error component says what happened, what to try, and offers Try again and Send feedback. Toasts are rare and use role status.
- Accessibility: keyboard-complete, correct roles and names, aria-live status, every chart has a data-table alternative, Playwright axe on every route fails on serious or critical issues, Lighthouse accessibility at least 95.

## Hearing-math honesty (applies to all UI and docs)
Consumer headphones vary by roughly plus or minus 10 dB across frequency, as large as the mild losses being measured, and browsers cannot know output level. Results are therefore approximate. The Hearing Check pre-screen and results say so in one plain sentence, docs/DECISIONS.txt records it, and the profile schema carries an optional per-ear, per-band `headphoneCompensation` array (dB, default zeros) so a correction table can be added later without a migration.
