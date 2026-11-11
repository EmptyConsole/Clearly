// /design: every shared component in its states (development only). Labels here are inline
// because this page never ships (DECISIONS M00).
import { useState } from 'react';
import { Audiogram } from '../ui/Audiogram.tsx';
import { BigButton } from '../ui/BigButton.tsx';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Stepper } from '../ui/Stepper.tsx';
import { Switch } from '../ui/Switch.tsx';
import { ReliabilityBadge } from '../check/ReliabilityBadge.tsx';
import { EarIndicator } from '../check/EarIndicator.tsx';
import { Chips } from '../ui/Chips.tsx';
import { Icon, type IconName } from '../ui/icons.tsx';
import { BackLink } from '../ui/Page.tsx';
import { Popover } from '../ui/Popover.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { TableScroll } from '../ui/TableScroll.tsx';
import { Slider } from '../ui/Slider.tsx';

const ICONS: IconName[] = [
  'home',
  'check',
  'audio',
  'quiet',
  'more',
  'health',
  'settings',
  'devices',
  'privacy',
  'feedback',
  'back',
];

const SAMPLE = {
  right: [0, 0, 5, 10, 20, 30, 40, 45].map((l, i) => ({
    hz: [250, 500, 1000, 2000, 3000, 4000, 6000, 8000][i] ?? 250,
    lossDb: l,
    estimated: i === 0 || i === 4 || i === 6,
  })),
  left: [0, 5, 5, 15, 25, 35, 45, 55].map((l, i) => ({
    hz: [250, 500, 1000, 2000, 3000, 4000, 6000, 8000][i] ?? 250,
    lossDb: l,
    estimated: i === 0 || i === 4 || i === 6,
  })),
};

export function ComponentGallery() {
  const [checked, setChecked] = useState(false);
  const [on, setOn] = useState(true);
  const [mode, setMode] = useState<'original' | 'enhanced'>('enhanced');
  const [presses, setPresses] = useState(0);
  const [chip, setChip] = useState<'rain' | 'ocean' | 'pink'>('rain');
  const [level, setLevel] = useState(0.4);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-lg">Button</h3>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink to="/">Link as button</ButtonLink>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-lg">BigButton (test button)</h3>
        <BigButton
          onClick={() => {
            setPresses((p) => p + 1);
          }}
        >
          I hear it
        </BigButton>
        <p className="mt-1">{`Pressed ${presses} times. StatusLine is a polite live region.`}</p>
      </div>
      <div>
        <h3 className="mb-2 text-lg">Checkbox</h3>
        <Checkbox checked={checked} onCheckedChange={setChecked}>
          A required agreement, in plain words.
        </Checkbox>
      </div>
      <div>
        <h3 className="mb-2 text-lg">Switch</h3>
        <Switch
          checked={on}
          onCheckedChange={setOn}
          label="Slower pace"
          hint="More time to answer."
        />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Segmented</h3>
        <Segmented
          legend="Sound"
          large
          value={mode}
          onChange={setMode}
          options={[
            { value: 'original', label: 'Original' },
            { value: 'enhanced', label: 'Enhanced' },
          ]}
        />
      </div>
      <div>
        <h3 className="mb-2 text-lg">ProgressBar</h3>
        <ProgressBar value={3} max={10} label="Progress" valueText="3 of 10 pitches done" />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Stepper</h3>
        <Stepper label="Steps" current={1} steps={['Welcome', 'Start', 'Listen', 'Watch']} />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Card, badges, ear indicator</h3>
        <Card>
          <p className="flex flex-wrap items-center gap-2">
            <EstimatedBadge /> A card with the Estimated badge.
          </p>
          <div className="mt-2">
            <ReliabilityBadge level="Medium" />
          </div>
          <EarIndicator ear="left" />
          <EarIndicator ear="right" />
        </Card>
      </div>
      <div>
        <h3 className="mb-2 text-lg">ErrorPanel</h3>
        <ErrorPanel
          title="Sound could not start"
          what="Your browser did not let Clearly play sound."
          tryThis="Check that this tab is not muted, then try again."
          onRetry={() => undefined}
        />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Audiogram</h3>
        <Audiogram series={SAMPLE} title="Sample hearing chart" />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Icons (one set, 2 px strokes)</h3>
        <div className="flex flex-wrap gap-3">
          {ICONS.map((n) => (
            <span key={n} className="flex flex-col items-center gap-0.5 text-sm">
              <Icon name={n} />
              {n}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-lg">Switch as a card title, Switch disabled-looking off state</h3>
        <Card className="flex flex-col gap-3">
          <Switch
            title
            checked={on}
            onCheckedChange={setOn}
            label="Night mode"
            hint="A title switch with a body-size hint."
          />
          <Switch
            checked={!on}
            onCheckedChange={(v) => {
              setOn(!v);
            }}
            label="Turn on automatically"
            hint="A plain switch."
          />
        </Card>
      </div>
      <div>
        <h3 className="mb-2 text-lg">Chips and Slider</h3>
        <Chips<'rain' | 'ocean' | 'pink'>
          legend="Sound"
          value={chip}
          onChange={setChip}
          options={[
            { value: 'rain', label: 'Rain' },
            { value: 'ocean', label: 'Ocean' },
            { value: 'pink', label: 'Pink noise' },
          ]}
        />
        <Slider
          className="mt-3"
          label="Volume"
          valueText="Volume"
          value={level}
          min={0}
          max={1}
          step={0.05}
          onChange={setLevel}
        />
      </div>
      <div>
        <h3 className="mb-2 text-lg">Popover, BackLink, StatusLine</h3>
        <div className="flex flex-wrap items-center gap-3">
          <BackLink to="/design" label="Parent page" />
          <Popover label="What does this do?">
            <p>A short explanation next to its trigger.</p>
          </Popover>
        </div>
        <StatusLine className="mt-2 font-semibold">A polite status message.</StatusLine>
      </div>
      <div>
        <h3 className="mb-2 text-lg">TableScroll (wide table)</h3>
        <TableScroll>
          <table className="text-left">
            <tbody>
              <tr>
                {Array.from({ length: 14 }, (_, i) => (
                  <td key={i} className="whitespace-nowrap pr-3">
                    Column {i + 1} value
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </div>
    </div>
  );
}
