import { isSameDevice } from '@clearly/core/desktop';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import { kv } from '../storage/repos.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { BackLink, PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import {
  cableOutputFor,
  isCable,
  listDevices,
  testRouting,
  type AudioDevices,
} from './cableRouting.ts';
import { usePlayerStore } from './playerStore.ts';

const CABLE_SITES = [
  { name: 'BlackHole (Mac)', url: 'https://existential.audio/blackhole/' },
  { name: 'VB-CABLE (Windows and Mac)', url: 'https://vb-audio.com/Cable/' },
] as const;

const selectClass =
  'min-h-[var(--t-target-input-height)] w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2';

/** The virtual cable wizard (desktop app, M12): four steps, device choice, a routing test. */
export function CableWizardPage() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const setSource = usePlayerStore((s) => s.setSource);
  const [devices, setDevices] = useState<AudioDevices | null>(null);
  const [denied, setDenied] = useState(false);
  const [inputId, setInputId] = useState('');
  const [outputId, setOutputId] = useState('');
  const [test, setTest] = useState<'idle' | 'running' | 'ok' | 'failed' | 'no-output'>('idle');
  const [startFailed, setStartFailed] = useState(false);

  const showDevices = () => {
    setDenied(false);
    listDevices()
      .then((d) => {
        setDevices(d);
        const cable = d.inputs.find(isCable);
        setInputId(cable?.deviceId ?? d.inputs[0]?.deviceId ?? '');
        const out = d.outputs.find((o) => !isCable(o));
        setOutputId(out?.deviceId ?? '');
      })
      .catch(() => {
        setDenied(true);
      });
  };

  const input = devices?.inputs.find((d) => d.deviceId === inputId) ?? null;
  const output = devices?.outputs.find((d) => d.deviceId === outputId) ?? null;
  const loop = input !== null && output !== null && isSameDevice(input, output);
  const cableFound = devices ? devices.inputs.some(isCable) : false;

  const runTest = () => {
    if (!devices || !input) return;
    const cableOut = cableOutputFor(input, devices.outputs);
    if (!cableOut) {
      setTest('no-output');
      return;
    }
    setTest('running');
    testRouting(input.deviceId, cableOut.deviceId)
      .then((ok) => {
        setTest(ok ? 'ok' : 'failed');
      })
      .catch(() => {
        setTest('failed');
      });
  };

  const start = () => {
    if (!input || !output || loop) return;
    setStartFailed(false);
    void getAudioEngine()
      .start()
      .catch(() => undefined);
    void kv.set('outputDeviceId', output.deviceId);
    platform
      .startCapture({ kind: 'cable', id: input.deviceId })
      .then((stream) => {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('no audio');
        setSource({
          kind: 'tab',
          capture: { stream, audioTrack, title: input.label, suppressed: true, via: 'cable' },
        });
        navigate('/audio/player');
      })
      .catch(() => {
        setStartFailed(true);
      });
  };

  return (
    <PageBody>
      <BackLink to="/audio" label={t('audio.title')} />
      <PageHeading className="mt-2">{t('cable.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('cable.lead')}</p>

      <ol className="mt-6 flex max-w-measure list-decimal flex-col gap-3 pl-4 text-lg">
        <li>
          {t('cable.step1')}
          <ul className="mt-1 flex flex-col gap-1">
            {CABLE_SITES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </li>
        <li>{t('cable.step2')}</li>
        <li>{t('cable.step3')}</li>
        <li>{t('cable.step4')}</li>
      </ol>

      <Card className="mt-6 max-w-measure">
        {!devices ? (
          <>
            <h2 className="text-xl">{t('cable.mic.title')}</h2>
            <p className="mt-1">{t('cable.mic.body')}</p>
            <Button className="mt-3" onClick={showDevices}>
              {t('cable.mic.show')}
            </Button>
            {denied ? (
              <div className="mt-3">
                <ErrorPanel
                  title={t('cable.mic.deniedTitle')}
                  what={t('cable.mic.denied')}
                  tryThis={t('cable.mic.deniedTry')}
                  onRetry={showDevices}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            {!cableFound ? <p className="font-semibold">{t('cable.none')}</p> : null}
            <div>
              <label htmlFor="cable-in" className="font-semibold">
                {t('cable.input')}
              </label>
              <select
                id="cable-in"
                className={selectClass}
                value={inputId}
                onChange={(e) => {
                  setInputId(e.target.value);
                  setTest('idle');
                }}
              >
                {devices.inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {isCable(d) ? `${d.label} (${t('cable.detected')})` : d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cable-out" className="font-semibold">
                {t('cable.output')}
              </label>
              <select
                id="cable-out"
                className={selectClass}
                value={outputId}
                onChange={(e) => {
                  setOutputId(e.target.value);
                }}
              >
                {devices.outputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            {loop ? (
              <p className="font-semibold" role="alert">
                {t('cable.same')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={runTest} disabled={!input || test === 'running'}>
                {t('cable.test')}
              </Button>
              <Button onClick={start} disabled={!input || !output || loop}>
                {t('cable.start')}
              </Button>
            </div>
            <StatusLine>
              {test === 'running'
                ? t('cable.test.running')
                : test === 'ok'
                  ? t('cable.test.ok')
                  : test === 'failed'
                    ? t('cable.test.failed')
                    : test === 'no-output'
                      ? t('cable.test.noOutput')
                      : ''}
            </StatusLine>
            {startFailed ? (
              <p className="font-semibold" role="alert">
                {t('cable.startFailed')}
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </PageBody>
  );
}
