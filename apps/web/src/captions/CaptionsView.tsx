import type { Cue } from '@clearly/core';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptionText } from './CaptionText.tsx';
import { cueAt, nextLiveCue, type CaptionDisplay, type Shown } from './display.ts';

/** The in-player caption panel, and the same captions in the floating window when it is open. */
export function CaptionsView({
  cues,
  media,
  live,
  display,
  floating,
  onText,
}: {
  cues: readonly Cue[];
  media: HTMLMediaElement | null;
  live: boolean;
  display: CaptionDisplay;
  floating: Window | null;
  /** Every change of the shown line (the desktop app sends it to its captions window). */
  onText?: (text: string | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = useRef<Shown | null>(null);
  const cuesRef = useRef(cues);
  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    const tick = () => {
      if (live || !media) {
        shown.current = nextLiveCue(
          shown.current,
          cuesRef.current.at(-1) ?? null,
          performance.now() / 1000,
        );
        setText(shown.current?.cue.text ?? null);
      } else {
        setText(cueAt(cuesRef.current, media.currentTime)?.text ?? null);
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => {
      window.clearInterval(id);
    };
  }, [media, live]);

  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  useEffect(() => {
    onTextRef.current?.(text);
  }, [text]);

  return (
    <>
      <CaptionText text={text} display={display} />
      {floating
        ? createPortal(<CaptionText text={text} display={display} />, floating.document.body)
        : null}
    </>
  );
}
