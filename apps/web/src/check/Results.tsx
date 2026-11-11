import {
  expectedDurationSeconds,
  describeShape,
  referralReasons,
  type HearingCheckRecord,
} from '@clearly/core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { t, type MessageId } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { hearingChecks, kv } from '../storage/repos.ts';
import { Audiogram } from '../ui/Audiogram.tsx';
import { seriesFromAudiogram } from '../ui/audiogramData.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { ContinueSetup } from '../welcome/ContinueSetup.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { useFlowStore } from './flowStore.ts';
import { methodLabel } from './methodLabel.ts';
import { ReliabilityBadge } from './ReliabilityBadge.tsx';

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

export function Results() {
  const { id = '' } = useParams();
  return <ResultsLoader key={id} id={id} />;
}

function ResultsLoader({ id }: { id: string }) {
  const loaded = useProfilesLoaded();
  const [record, setRecord] = useState<HearingCheckRecord | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    hearingChecks
      .get(id)
      .then((r) => {
        if (live) setRecord(r);
      })
      .catch(() => {
        if (live) setRecord(null);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (!loaded || record === undefined) return <Loading label={t('results.loading')} />;
  if (record === null) {
    return (
      <PageBody>
        <PageHeading>{t('results.title')}</PageHeading>
        <div className="mt-4">
          <ErrorPanel
            title={t('results.notFound')}
            what={t('error.generic.body')}
            tryThis={t('error.generic.try')}
            onRetry={() => {
              setRecord(undefined);
              setAttempt((a) => a + 1);
            }}
          />
        </div>
      </PageBody>
    );
  }
  return <ResultsView record={record} />;
}

function ResultsView({ record }: { record: HearingCheckRecord }) {
  const navigate = useNavigate();
  const platform = usePlatform();
  const active = useProfileStore((s) => s.active);
  const setFlow = useFlowStore((s) => s.set);
  const [pdfStatus, setPdfStatus] = useState('');
  const [persistNote, setPersistNote] = useState<string | null>(null);
  const a = record.audiogram;
  const isActive = active?.id === record.profileId && active.audiogram.createdAt === a.createdAt;
  const low = a.reliability === 'Low';
  const reasons = referralReasons({ left: a.ears.left.lossDb, right: a.ears.right.lossDb });
  const shape = describeShape({ left: a.ears.left.lossDb, right: a.ears.right.lossDb });
  const date = new Date(record.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' });

  // After the first completed check, ask the browser to keep Clearly's data (once).
  useEffect(() => {
    if (a.method === 'starter') return;
    const state = { live: true };
    void (async () => {
      const asked = await kv.get('persistRequested');
      if (asked) return;
      await kv.set('persistRequested', true);
      const result = await platform.requestPersistentStorage();
      if (!state.live || result === 'unsupported') return;
      setPersistNote(
        `${t('results.persist')} ${result === 'granted' ? t('results.persistGranted') : t('results.persistDenied')}`,
      );
    })().catch(() => undefined);
    return () => {
      state.live = false;
    };
  }, [a.method, platform]);

  const makePdf = async (): Promise<File> => {
    const [{ buildResultsPdf, pdfFileName }, { PDF_COLOURS }] = await Promise.all([
      import('./pdf.ts'),
      import('./pdfColours.ts'),
    ]);
    const bytes = await buildResultsPdf(record, PDF_COLOURS);
    return new File([bytes as BlobPart], pdfFileName(record), { type: 'application/pdf' });
  };

  const savePdf = () => {
    setPdfStatus(t('results.pdfMaking'));
    makePdf()
      .then((file) => platform.saveFile(file, { suggestedName: file.name, mimeType: file.type }))
      .then(() => {
        setPdfStatus(t('results.pdfDone'));
      })
      .catch(() => {
        setPdfStatus(t('results.pdfFailed'));
      });
  };

  const share = () => {
    setPdfStatus(t('results.pdfMaking'));
    makePdf()
      .then(async (file) => {
        if (platform.capabilities.webShare && navigator.canShare({ files: [file] })) {
          setPdfStatus('');
          await navigator.share({ files: [file], title: t('pdf.title') }).catch(() => undefined);
          return;
        }
        await platform.saveFile(file, { suggestedName: file.name, mimeType: file.type });
        setPdfStatus(t('results.pdfDone'));
      })
      .catch(() => {
        setPdfStatus(t('results.pdfFailed'));
      });
  };

  const fineTune = () => {
    if (!record.session || record.lcDbfs === null) return;
    setFlow({
      lcDbfs: record.lcDbfs,
      ageRange: record.ageRange,
      refine: {
        seed: record.session,
        lcDbfs: record.lcDbfs,
        ageRange: record.ageRange,
        headphoneName: record.headphoneName,
        responses: [],
        rngSeed: randomSeed(),
        output: record.output ?? 'headphones',
      },
    });
    navigate('/check/test');
  };

  return (
    <PageBody wide>
      <PageHeading>{low ? t('results.low.title') : t('results.title')}</PageHeading>
      <p className="mt-1 text-text-muted">
        {t('results.meta', {
          method: methodLabel(a.method),
          date,
          headphones: record.headphoneName,
        })}
      </p>
      {record.output === 'speakers' ? (
        <p className="mt-2 max-w-measure font-semibold">{t('results.speakers')}</p>
      ) : null}
      <div className="mt-4 grid gap-6 desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <p className="max-w-measure text-xl font-semibold">
            {t(`results.shape.${shape}` as MessageId)}
          </p>
          <div className="mt-4">
            <Audiogram series={seriesFromAudiogram(a)} />
          </div>
          <p className="mt-3 max-w-measure text-text-muted">{t('hearingCheck.results.refNote')}</p>
        </div>
        <div className="flex flex-col gap-4">
          {a.reliability ? <ReliabilityBadge level={a.reliability} /> : null}
          <p className="font-semibold">
            {low
              ? isActive
                ? t('results.low.noPrevious')
                : t('results.low.keptPrevious')
              : isActive
                ? t('results.active')
                : ''}
          </p>
          {reasons.length > 0 ? (
            <Card className="border-control border-warning">
              <h2 className="text-xl">{t('results.referral.title')}</h2>
              <p className="mt-1">{t('results.referral.body')}</p>
              <p className="mt-1 text-text-muted">{t('results.referral.continue')}</p>
            </Card>
          ) : null}
          <div className="flex flex-col items-start gap-2">
            {low ? (
              <ButtonLink to="/check/before" className="text-lg">
                {t('results.retake')}
              </ButtonLink>
            ) : (
              <ButtonLink to="/audio" className="text-lg">
                {t('results.listen')}
              </ButtonLink>
            )}
            {a.method === 'express' && !low ? (
              <Button variant="secondary" onClick={fineTune}>
                {t('results.refine', { n: expectedDurationSeconds('refine', 'normal') })}
              </Button>
            ) : null}
            {low ? (
              <ButtonLink to="/audio" variant="secondary">
                {t('results.listen')}
              </ButtonLink>
            ) : null}
            <ContinueSetup />
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-border pt-2">
              {!low ? (
                <ButtonLink to="/check/before" variant="quiet">
                  {t('results.retake')}
                </ButtonLink>
              ) : null}
              <Button variant="quiet" onClick={savePdf}>
                {t('results.pdf')}
              </Button>
              <Button variant="quiet" onClick={share}>
                {t('results.share')}
              </Button>
            </div>
            <StatusLine>{pdfStatus}</StatusLine>
          </div>
          {persistNote ? <p className="text-sm text-text-muted">{persistNote}</p> : null}
        </div>
      </div>
    </PageBody>
  );
}
