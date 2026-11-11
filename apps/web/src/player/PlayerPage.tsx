import type { ProcessingGraph, ProcessingMode } from '@clearly/audio';
import type { PresetId } from '@clearly/core';
import { levelWord, PRESET_CHIPS } from './presets.ts';
import { seekBy, SKIP_SECONDS, togglePlay } from './media.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t, type MessageId } from '../copy/en.ts';
import { kv, sinChecks } from '../storage/repos.ts';
import { tracker } from '../health/tracker.ts';
import { cleanupHintDue } from './cleanupHint.ts';
import { CleanupCard } from './CleanupCard.tsx';
import { NightCard } from './NightCard.tsx';
import type { CaptionModel } from '../captions/assets.ts';
import { CaptionsCard, type CaptionMode } from '../captions/CaptionsCard.tsx';
import { CaptionsView } from '../captions/CaptionsView.tsx';
import { DEFAULT_DISPLAY, type CaptionDisplay } from '../captions/display.ts';
import { hasDocumentPiP, openFloatingWindow } from '../captions/floating.ts';
import { useCaptions, type CaptionSource } from '../captions/useCaptions.ts';
import { usePlatform } from '../platform/context.ts';
import { DESKTOP_MODE_EVENT, isDesktopAdapter } from '../platform/desktop.ts';
import { watchOutputs } from './outputGuard.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { ProfileSelector } from '../ui/ProfileSelector.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Chips } from '../ui/Chips.tsx';
import { Slider } from '../ui/Slider.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';
import { cx } from '../ui/cx.ts';
import { strengthWord } from '../settings/strengthWord.ts';
import { Advanced } from './Advanced.tsx';
import { demoClipUrl } from './demoClip.ts';
import { ExportDialog } from './ExportDialog.tsx';
import { Insight } from './Insight.tsx';
import { fileUrl, usePlayerStore } from './playerStore.ts';
import { TEST_HOOKS_ENABLED } from '../test/hooks.ts';
import { PlayerSession } from './session.ts';
import { DEFAULT_VOICE_FOCUS, manualFor, playerSettings } from './settings.ts';
import { Transport } from './Transport.tsx';
import { Waveform } from './Waveform.tsx';
import { HumCard } from './HumCard.tsx';
import { HearExample } from './HearExample.tsx';
import { useHumFilter } from './useHumFilter.ts';
import { AutoBoostCard } from '../quiet/AutoBoostCard.tsx';
import { autoBoostContribution, setAutoBoostGraph, useAutoBoost } from '../quiet/autoBoostStore.ts';

const isTyping = (el: EventTarget | null): boolean => {
  const e = el as HTMLElement | null;
  if (!e) return false;
  if (e.isContentEditable) return true;
  if (e.tagName === 'TEXTAREA' || e.tagName === 'SELECT') return true;
  if (e.tagName === 'INPUT') return true; // text fields, sliders, radios, checkboxes
  return false;
};
/** Space keeps its normal job on buttons, switches and links. */
const isActivatable = (el: EventTarget | null): boolean => {
  const e = el as HTMLElement | null;
  return Boolean(e?.closest('button, a, [role="switch"], [role="checkbox"], summary'));
};

export function PlayerPage() {
  const loaded = useProfilesLoaded();
  const app = useAppSettings();
  const source = usePlayerStore((s) => s.source);
  const sourceId = usePlayerStore((s) => s.sourceId);
  useEffect(() => {
    if (!app.loaded) void app.load();
  }, [app]);
  if (!source) return <Navigate to="/audio" replace />;
  if (!loaded || !app.loaded) return <Loading />;
  return <Player key={sourceId} />;
}

function Player() {
  const navigate = useNavigate();
  const engine = getAudioEngine();
  const source = usePlayerStore((s) => s.source);
  const sessionOverrides = usePlayerStore((s) => s.session);
  const setSessionOverrides = usePlayerStore((s) => s.setSession);
  const setSource = usePlayerStore((s) => s.setSource);
  const profile = useProfileStore((s) => s.active);
  const demoMode = useProfileStore((s) => s.demoMode);
  const updateOverrides = useProfileStore((s) => s.updateOverrides);
  const app = useAppSettings();
  const [mode, setMode] = useState<ProcessingMode>('enhanced');
  const [graph, setGraph] = useState<ProcessingGraph | null>(null);
  const [mediaEl, setMediaEl] = useState<HTMLMediaElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [overloaded, setOverloaded] = useState(false);
  const [mono, setMono] = useState(false);
  const [tabEnded, setTabEnded] = useState(false);
  const [askMute, setAskMute] = useState(false);
  const [muteAnswer, setMuteAnswer] = useState<boolean | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  // Headphones unplugged (M14): pause rather than move to the speakers at the same level.
  const [deviceLost, setDeviceLost] = useState(false);
  const sessionRef = useRef<PlayerSession | null>(null);
  const modeBeforeHold = useRef<ProcessingMode | null>(null);
  const [ctx, setCtx] = useState<AudioContext | null>(null);

  // Hum Filter and Auto Boost (M09).
  const humMode = usePlayerStore((s) => s.humMode);
  const setHumMode = usePlayerStore((s) => s.setHumMode);
  const loadHumMode = usePlayerStore((s) => s.loadHumMode);
  useEffect(() => {
    void loadHumMode();
  }, [loadHumMode]);
  const hum = useHumFilter(graph, ctx, humMode);
  const abPhase = useAutoBoost((s) => s.phase);
  const abReading = useAutoBoost((s) => s.reading);
  const auto = useMemo(() => autoBoostContribution(abPhase, abReading), [abPhase, abReading]);
  useEffect(() => {
    setAutoBoostGraph(graph);
    return () => {
      setAutoBoostGraph(null);
    };
  }, [graph]);

  const settings = useMemo(
    () =>
      playerSettings(
        profile,
        app.settings,
        sessionOverrides,
        app.settings.preset,
        auto,
        hum.settings,
      ),
    [profile, app.settings, sessionOverrides, auto, hum.settings],
  );
  const settingsRef = useRef(settings);
  const profileRef = useRef(profile);
  const modeRef = useRef(mode);
  useEffect(() => {
    settingsRef.current = settings;
    profileRef.current = profile;
    modeRef.current = mode;
  }, [settings, profile, mode]);

  // Captions (M07).
  const platform = usePlatform();
  const [captionMode, setCaptionModeState] = useState<CaptionMode>('off');
  const [captionModel, setCaptionModelState] = useState<CaptionModel>('standard');
  const [captionsFirst, setCaptionsFirstState] = useState(true);
  const [display, setDisplayState] = useState<CaptionDisplay>(DEFAULT_DISPLAY);
  const [modelReady, setModelReady] = useState(false);
  const [floating, setFloating] = useState<Window | null>(null);
  const [demoBlob, setDemoBlob] = useState<Blob | null>(null);
  useEffect(() => {
    void Promise.all([
      kv.get('captionsAlways'),
      kv.get('captionModel'),
      kv.get('captionsFirst'),
      kv.get('captionDisplay'),
    ]).then(([always, model, first, disp]) => {
      if (always) setCaptionModeState('always');
      if (model) setCaptionModelState(model);
      if (first !== undefined) setCaptionsFirstState(first);
      if (disp) setDisplayState(disp);
    });
  }, []);
  const setCaptionMode = (m: CaptionMode) => {
    setCaptionModeState(m);
    void kv.set('captionsAlways', m === 'always');
  };
  const setCaptionModel = (m: CaptionModel) => {
    setCaptionModelState(m);
    void kv.set('captionModel', m);
  };
  const setCaptionsFirst = (v: boolean) => {
    setCaptionsFirstState(v);
    void kv.set('captionsFirst', v);
  };
  const setDisplay = (d: CaptionDisplay) => {
    setDisplayState(d);
    void kv.set('captionDisplay', d);
  };
  const onModelReady = useCallback((ready: boolean) => {
    setModelReady(ready);
  }, []);
  useEffect(() => {
    if (source?.kind !== 'demo' || captionMode === 'off' || demoBlob) return;
    void demoClipUrl(source.hum === true)
      .then((u) => fetch(u))
      .then((r) => r.blob())
      .then(setDemoBlob);
  }, [source, captionMode, demoBlob]);
  const capSource: CaptionSource | null =
    source?.kind === 'tab'
      ? { kind: 'live' }
      : source?.kind === 'file'
        ? { kind: 'file', blob: source.file, media: mediaEl }
        : source?.kind === 'demo' && demoBlob
          ? { kind: 'file', blob: demoBlob, media: mediaEl }
          : null;
  const captions = useCaptions({
    enabled:
      captionMode !== 'off' && modelReady && (capSource?.kind === 'live' || Boolean(mediaEl)),
    model: captionModel,
    source: capSource,
    graph,
    ctx,
    captionsFirst,
  });
  // Desktop app (M12): a native always-on-top captions window instead of Document PiP.
  const [desktopFloating, setDesktopFloating] = useState(false);
  const desktopBridge = isDesktopAdapter(platform) ? platform.bridge : null;
  useEffect(
    () => () => {
      if (desktopBridge) void desktopBridge.hideFloatingCaptions().catch(() => undefined);
    },
    [desktopBridge],
  );
  const toggleFloating = () => {
    if (desktopBridge) {
      const next = !desktopFloating;
      setDesktopFloating(next);
      void (
        next ? desktopBridge.showFloatingCaptions() : desktopBridge.hideFloatingCaptions()
      ).catch(() => {
        setDesktopFloating(false);
      });
      return;
    }
    if (floating) {
      floating.close();
      setFloating(null);
      return;
    }
    if (platform.capabilities.floatingCaptions && hasDocumentPiP()) {
      void openFloatingWindow(t('captions.floatTitle')).then((win) => {
        win.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') win.close();
        });
        win.addEventListener('pagehide', () => {
          setFloating(null);
        });
        setFloating(win);
      });
    }
  };

  const [hint, setHint] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([sinChecks.list(), kv.get('cleanupHintDismissed')]).then(
      ([checks, dismissed]) => {
        if (live)
          setHint(
            cleanupHintDue(checks, settingsRef.current.cleanupStrength > 0, dismissed === true),
          );
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const isVideo = source?.kind === 'file' && source.file.type.startsWith('video/');

  // Media URL for files and the demo clip.
  const fileSrc = source?.kind === 'file' ? fileUrl(source.file) : null;
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (source?.kind !== 'demo') return;
    void demoClipUrl(source.hum === true).then(setDemoUrl);
  }, [source]);
  const src = fileSrc ?? demoUrl;

  const attach = useCallback(async () => {
    if (sessionRef.current || !source) return;
    await engine.start();
    const input =
      source.kind === 'tab'
        ? ({ kind: 'stream', stream: source.capture.stream } as const)
        : mediaEl
          ? ({ kind: 'element', element: mediaEl } as const)
          : null;
    if (!input) return;
    const s = await PlayerSession.create(
      engine,
      input,
      profileRef.current,
      settingsRef.current,
      modeRef.current,
    );
    sessionRef.current = s;
    s.graph.on('overload', () => {
      setOverloaded(true);
    });
    s.graph.on('mono', (e) => {
      setMono(e.isMono);
    });
    const id = await kv.get('outputDeviceId');
    if (id) {
      const { setOutputDevice } = await import('./session.ts');
      await setOutputDevice(s.ctx, id);
    }
    setCtx(s.ctx);
    setGraph(s.graph);
  }, [engine, source, mediaEl]);

  // Tab capture starts at once (the source card click was the gesture).
  useEffect(() => {
    if (source?.kind !== 'tab') return;
    void attach().catch(() => {
      setFailed(t('tab.failed'));
    });
    const track = source.capture.audioTrack;
    const onEnded = () => {
      setTabEnded(true);
    };
    track.addEventListener('ended', onEnded);
    return () => {
      track.removeEventListener('ended', onEnded);
    };
  }, [source, attach]);

  // Clean up on leave.
  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (source?.kind === 'tab') for (const tr of source.capture.stream.getTracks()) tr.stop();
    },
    [source],
  );

  // Test builds only: expose the live graph and an export reference render.
  useEffect(() => {
    if (!TEST_HOOKS_ENABLED) return;
    window.__clearlyPlayer = {
      graph,
      reference:
        source?.kind === 'file'
          ? async () => {
              const a = await import('@clearly/audio');
              const opened = await a.openFileReader(source.file);
              const r = await a.renderOffline(
                opened.reader,
                profileRef.current,
                settingsRef.current,
                {
                  sink: a.createWavSink({ expectedFrames: opened.reader.durationFrames }),
                },
              );
              return r.result;
            }
          : null,
    };
  }, [graph, source]);

  // Safe-listening tracker (M08).
  useEffect(() => {
    if (!graph) return;
    return tracker.attach(graph);
  }, [graph]);

  // Settings and profile changes go to the live graph (smoothed inside the graph).
  useEffect(() => {
    graph?.update(settings, profile);
  }, [graph, settings, profile]);
  useEffect(() => {
    graph?.setMode(mode);
  }, [graph, mode]);

  useEffect(
    () =>
      watchOutputs(
        () => playingRef.current || source?.kind === 'tab',
        () => {
          mediaEl?.pause();
          void getAudioEngine().hold();
          setDeviceLost(true);
        },
      ),
    [ctx, mediaEl, source],
  );

  // Desktop app (M12): the tray menu and the global shortcut switch Original | Enhanced, and the
  // tray shows the current mode while a player is open.
  useEffect(() => {
    const onCommand = (e: Event) => {
      const c = (e as CustomEvent<unknown>).detail;
      setMode((m) =>
        c === 'toggle'
          ? m === 'original'
            ? 'enhanced'
            : 'original'
          : c === 'original'
            ? 'original'
            : 'enhanced',
      );
    };
    window.addEventListener(DESKTOP_MODE_EVENT, onCommand);
    return () => {
      window.removeEventListener(DESKTOP_MODE_EVENT, onCommand);
    };
  }, []);
  useEffect(() => {
    if (!isDesktopAdapter(platform)) return;
    const bridge = platform.bridge;
    const tray = mode === 'enhanced' ? 'enhanced' : 'original';
    void bridge.setTrayState({ mode: tray, active: true }).catch(() => undefined);
    return () => {
      void bridge.setTrayState({ mode: tray, active: false }).catch(() => undefined);
    };
  }, [platform, mode]);

  // Media element events, Media Session.
  useEffect(() => {
    if (!mediaEl) return;
    const onPlay = () => {
      setPlaying(true);
      void attach().catch(() => {
        setFailed(t('error.audio.body'));
      });
    };
    const onPause = () => {
      setPlaying(false);
    };
    const onError = () => {
      const ext =
        source?.kind === 'file' ? (source.file.name.split('.').pop() ?? '').toUpperCase() : '';
      setFailed(t('player.unsupported', { format: ext || t('player.unsupportedUnknown') }));
    };
    mediaEl.addEventListener('play', onPlay);
    mediaEl.addEventListener('pause', onPause);
    mediaEl.addEventListener('error', onError);
    if ('mediaSession' in navigator) {
      const title = source?.kind === 'file' ? source.file.name : t('source.demo.title');
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: t('app.name') });
      navigator.mediaSession.setActionHandler('play', () => void mediaEl.play());
      navigator.mediaSession.setActionHandler('pause', () => {
        mediaEl.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        seekBy(mediaEl, -SKIP_SECONDS);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        seekBy(mediaEl, SKIP_SECONDS);
      });
    }
    return () => {
      mediaEl.removeEventListener('play', onPlay);
      mediaEl.removeEventListener('pause', onPause);
      mediaEl.removeEventListener('error', onError);
    };
  }, [mediaEl, attach, source]);

  // Keys: Space toggles Original | Enhanced, hold H for Original, K/J/L transport.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !isActivatable(e.target)) {
        e.preventDefault();
        if (e.repeat) return;
        setMode((m) => (m === 'original' ? 'enhanced' : 'original'));
      } else if (e.key === 'h' || e.key === 'H') {
        if (e.repeat || modeBeforeHold.current) return;
        modeBeforeHold.current = modeRef.current;
        setMode('original');
      } else if (mediaEl && (e.key === 'k' || e.key === 'K')) {
        togglePlay(mediaEl);
      } else if (mediaEl && (e.key === 'j' || e.key === 'J')) {
        seekBy(mediaEl, -SKIP_SECONDS);
      } else if (mediaEl && (e.key === 'l' || e.key === 'L')) {
        seekBy(mediaEl, SKIP_SECONDS);
      }
    };
    const up = (e: KeyboardEvent) => {
      if ((e.key === 'h' || e.key === 'H') && modeBeforeHold.current) {
        setMode(modeBeforeHold.current);
        modeBeforeHold.current = null;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [mediaEl]);

  if (!source) return null;
  const music = settings.preset === 'music';
  const setCleanup = (v: number) => {
    // In the Music preset, turning cleanup back on lasts for this session only.
    if (music) setSessionOverrides({ ...sessionOverrides, cleanupStrength: v });
    else void updateOverrides({ cleanupStrength: v });
  };
  const setNight = (level: 'off' | 'low' | 'medium' | 'high') => {
    void updateOverrides({ nightMode: level });
  };
  const setVoiceFocus = (v: number) => {
    // In the Music preset, turning Voice focus back on lasts for this session only.
    if (music) setSessionOverrides({ ...sessionOverrides, voiceFocus: v });
    else void updateOverrides({ voiceFocus: v });
  };
  const vf = settings.voiceFocus;
  const modes: { value: ProcessingMode; label: string }[] = [
    { value: 'original', label: t('player.mode.original') },
    { value: 'enhanced', label: t('player.mode.enhanced') },
    ...(demoMode && profile
      ? [{ value: 'simulate' as const, label: t('player.mode.simulate') }]
      : []),
  ];
  const modeLabel = modes.find((m) => m.value === mode)?.label ?? '';
  const via = source.kind === 'tab' ? source.capture.via : undefined;
  const tabTitle =
    via === 'system'
      ? t('source.system.title')
      : via === 'cable'
        ? t('source.cable.title')
        : source.kind === 'tab'
          ? (source.capture.title ?? t('tab.yourTab'))
          : '';
  const doubled = source.kind === 'tab' && !source.capture.suppressed;

  return (
    <PageBody wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink to="/audio" variant="quiet">
          {t('player.back')}
        </ButtonLink>
        {source.kind === 'tab' && !tabEnded ? (
          <span
            className="inline-flex items-center gap-1 rounded-pill border-control border-primary px-3 py-0.5 font-semibold"
            role="status"
          >
            <span
              aria-hidden="true"
              className="inline-block size-[var(--t-space-1)] rounded-pill bg-primary"
            />
            {t('tab.enhancing', { title: tabTitle })}
          </span>
        ) : null}
      </div>
      <PageHeading className="mt-2">{t('player.title')}</PageHeading>
      <div className="mt-3 max-w-measure">
        <ProfileSelector />
      </div>
      {profile?.audiogram.method === 'starter' ? (
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <EstimatedBadge /> {t('player.estimated')}
        </p>
      ) : null}
      {!profile ? <p className="mt-2 text-text-muted">{t('player.noProfileNote')}</p> : null}

      {source.kind === 'tab' ? (
        <div className="mt-4">
          {tabEnded ? (
            <Card>
              <p className="font-semibold">{via ? t('capture.ended') : t('tab.ended')}</p>
              <ButtonLink to="/audio" className="mt-2">
                {via ? t('capture.again') : t('source.tab.start')}
              </ButtonLink>
            </Card>
          ) : (
            <p className="text-xl font-semibold">
              {via ? t('capture.switchNow') : t('tab.switchNow')}
            </p>
          )}
          {doubled && via === 'system' ? (
            <Card className="mt-3 border-control border-warning" role="alert">
              <h2 className="text-xl">{t('tab.doubled.title')}</h2>
              <p className="mt-1">{t('system.doubled.body')}</p>
              <ButtonLink to="/audio/cable" variant="secondary" className="mt-3">
                {t('system.doubled.cable')}
              </ButtonLink>
            </Card>
          ) : doubled ? (
            <Card className="mt-3 border-control border-warning" role="alert">
              <h2 className="text-xl">{t('tab.doubled.title')}</h2>
              <p className="mt-1">{t('tab.doubled.body')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSource(null);
                    navigate('/audio');
                  }}
                >
                  {t('tab.doubled.useFile')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAskMute(true);
                  }}
                >
                  {t('tab.doubled.mute')}
                </Button>
              </div>
              {askMute && muteAnswer === null ? (
                <div className="mt-3">
                  <p className="font-semibold">{t('tab.doubled.ask')}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      onClick={() => {
                        setMuteAnswer(true);
                        void kv.set('tabMuteWorks', true);
                      }}
                    >
                      {t('tab.doubled.yes')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMuteAnswer(false);
                        void kv.set('tabMuteWorks', false);
                      }}
                    >
                      {t('tab.doubled.no')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {muteAnswer === false ? <p className="mt-2">{t('tab.doubled.noBody')}</p> : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 wide:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-surface bg-surface-sunken p-2">
            {source.kind !== 'tab' && src ? (
              isVideo ? (
                <video
                  ref={setMediaEl}
                  src={src}
                  playsInline
                  className="w-full rounded-control"
                  data-testid="media"
                />
              ) : (
                <>
                  <audio ref={setMediaEl} src={src} data-testid="media" />
                  <Waveform analyser={graph?.taps.analyser ?? null} />
                </>
              )
            ) : (
              <Waveform analyser={graph?.taps.analyser ?? null} />
            )}
          </div>
          {captionMode !== 'off' && modelReady ? (
            <CaptionsView
              cues={captions.cues}
              media={mediaEl}
              live={captions.live}
              display={display}
              floating={floating}
              {...(desktopBridge && desktopFloating
                ? {
                    onText: (text: string | null) => {
                      void desktopBridge
                        .updateCaptionText({ text: (text ?? '').slice(0, 2000), final: false })
                        .catch(() => undefined);
                    },
                  }
                : {})}
            />
          ) : null}
          {deviceLost ? (
            <Card className="border-control border-warning" role="alert">
              <h2 className="text-xl">{t('device.lost.title')}</h2>
              <p className="mt-1">{t('device.lost.body')}</p>
              <Button
                className="mt-3"
                onClick={() => {
                  setDeviceLost(false);
                  void getAudioEngine()
                    .resume()
                    .catch(() => undefined);
                  if (mediaEl) void mediaEl.play().catch(() => undefined);
                }}
              >
                {t('device.lost.play')}
              </Button>
            </Card>
          ) : null}
          {failed ? (
            <p role="alert" className="font-semibold">
              {failed}
            </p>
          ) : null}
          {mediaEl ? <Transport media={mediaEl} /> : null}
          {source.kind === 'file' && mediaEl ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setExportOpen(true);
                }}
              >
                {t('export.open')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="order-first flex flex-col gap-5 wide:order-none">
          <div data-controls>
            <Segmented<ProcessingMode>
              legend={t('player.mode.legend')}
              large
              value={mode}
              onChange={setMode}
              options={modes}
            />
            <p className="mt-1 text-sm text-text-muted">{t('player.mode.hint')}</p>
            <StatusLine className="font-semibold">
              {playing || source.kind === 'tab' ? t('player.mode.now', { mode: modeLabel }) : ''}
            </StatusLine>
          </div>
          {overloaded ? (
            <Card className="border-control border-warning" role="alert">
              <p className="font-semibold">{t('player.overload')}</p>
              <Button
                className="mt-2"
                onClick={() => {
                  graph?.resumeAfterOverload();
                  setOverloaded(false);
                }}
              >
                {t('player.resume')}
              </Button>
            </Card>
          ) : null}
          <Slider
            label={t('player.strength', {
              word: strengthWord(settings.strength),
              n: Math.round(settings.strength * 100),
            })}
            valueText={t('player.strength', {
              word: strengthWord(settings.strength),
              n: Math.round(settings.strength * 100),
            })}
            value={settings.strength}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => void updateOverrides({ strength: v })}
          />
          <Chips<PresetId>
            legend={t('player.preset.legend')}
            value={settings.preset}
            onChange={(p) => {
              setSessionOverrides({});
              // A preset decides Night mode itself: forget a remembered Night on/off choice.
              void updateOverrides({ nightMode: undefined });
              void app.update({ preset: p });
            }}
            options={PRESET_CHIPS.map((p) => ({
              value: p,
              label: t(`player.preset.${p}` as MessageId),
            }))}
          />
        </div>
      </div>

      <section className="mt-8" aria-labelledby="enh-title">
        <h2 id="enh-title" className="text-2xl">
          {t('player.enhancements')}
        </h2>
        {hint ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 rounded-pill border-control border-primary px-3 py-1"
            role="status"
          >
            <span className="font-semibold">{t('cleanup.hint')}</span>
            <span>{t('cleanup.hintBody')}</span>
            <Button
              variant="quiet"
              onClick={() => {
                setHint(false);
                void kv.set('cleanupHintDismissed', true);
              }}
            >
              {t('cleanup.hintDismiss')}
            </Button>
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 tablet:grid-cols-2 desktop:grid-cols-1 wide:grid-cols-2">
          <CleanupCard
            graph={graph}
            sampleRate={ctx?.sampleRate ?? null}
            strength={settings.cleanupStrength}
            setStrength={setCleanup}
          />
          <NightCard
            settings={settings}
            setNight={setNight}
            example={<HearExample feature="night" onStart={() => mediaEl?.pause()} />}
          />
          <HumCard
            mode={humMode}
            setMode={setHumMode}
            view={hum}
            demoPlaying={source.kind === 'demo' && source.hum === true}
            example={<HearExample feature="hum" onStart={() => mediaEl?.pause()} />}
            onDemo={() => {
              if (humMode === 'off') setHumMode('auto');
              setSource({ kind: 'demo', hum: true });
            }}
          />
          <AutoBoostCard />
          <CaptionsCard
            mode={captionMode}
            setMode={setCaptionMode}
            model={captionModel}
            setModel={setCaptionModel}
            onReady={onModelReady}
            status={captions.status}
            waiting={captions.waiting}
            captionsFirst={captionsFirst}
            setCaptionsFirst={setCaptionsFirst}
            cues={captions.cues}
            baseName={
              source.kind === 'file'
                ? source.file.name.replace(/\.[^.]+$/, '')
                : t('source.demo.title')
            }
            display={display}
            setDisplay={setDisplay}
            floatingSupported={
              desktopBridge !== null || (platform.capabilities.floatingCaptions && hasDocumentPiP())
            }
            floatingOpen={floating !== null || desktopFloating}
            toggleFloating={toggleFloating}
          />
          <Card>
            <Switch
              title
              checked={vf > 0}
              onCheckedChange={(on) => {
                setVoiceFocus(
                  on
                    ? (manualFor(profile).voiceFocus ?? DEFAULT_VOICE_FOCUS) || DEFAULT_VOICE_FOCUS
                    : 0,
                );
              }}
              label={t('player.vf.title')}
              hint={t('player.vf.body')}
            />
            <Slider
              className="mt-3"
              label={t('player.vf.slider', { word: levelWord(vf), n: Math.round(vf * 100) })}
              valueText={t('player.vf.slider', { word: levelWord(vf), n: Math.round(vf * 100) })}
              value={vf}
              min={0}
              max={1}
              step={0.05}
              onChange={setVoiceFocus}
            />
            {mono ? (
              <p className="mt-2 font-semibold" role="status">
                {t('player.vf.mono')}
              </p>
            ) : null}
            <HearExample feature="vf" onStart={() => mediaEl?.pause()} />
          </Card>
        </div>
      </section>

      {graph ? (
        <>
          <details className="mt-8 rounded-surface border-hairline border-border p-3">
            <summary className={cx('cursor-pointer text-xl font-semibold')}>
              {t('insight.title')}
            </summary>
            <div className="mt-4">
              <Insight graph={graph} />
            </div>
          </details>
          {ctx ? (
            <details className="mt-3 rounded-surface border-hairline border-border p-3">
              <summary className="cursor-pointer text-xl font-semibold">
                {t('advanced.title')}
              </summary>
              <div className="mt-4">
                <Advanced graph={graph} ctx={ctx} />
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {source.kind === 'file' && mediaEl && exportOpen ? (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          file={source.file}
          durationSeconds={Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0}
          profile={profile}
          settings={settings}
        />
      ) : null}
    </PageBody>
  );
}
