'use client';

import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  LegacyBnLegend, inkOn, type LegacyBnParentCfg,
} from 'app/components/mdx/event-components';
import { CrmaMrLegend, crmaRiskColour } from 'app/components/mdx/CrmaMrDag';
import type { CrmaMrBasinDag, CrmaMrSchema } from 'app/types/crma-mr';

/**
 * Full-screen dialog for the region's network: the one place the network is
 * read at full size, so it carries everything needed to read it on its own —
 * the one-line answer in the header, a plain-language guide (flow + key) beside
 * or above the graph, and the zoomable graph.
 *
 * An accessible dialog: aria-modal + a visible, labelled title; focus moves to
 * Close on open, Tab is trapped inside, Esc closes, and focus returns to
 * whatever opened it. Also closes on backdrop click. Portalled, position:fixed
 * → not clipped by any parent overflow.
 *
 * `children` may be a render function `(fit) => node`. The dialog then chooses:
 * when the graph pane is wide enough for the whole network at a readable size
 * it asks for the fitted version, otherwise the natural-size one, which the
 * pane scrolls (phones, tablets, a 7-column network beside the guide). The
 * reader can switch with "Whole network" / "Actual size".
 */
export function DagModal({
  open,
  onClose,
  title,
  eyebrow,
  answer,
  guide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Small line above the title: which network, which date. */
  eyebrow?: React.ReactNode;
  /** The one-line answer (see NetworkAnswer), so the dialog stands on its own. */
  answer?: React.ReactNode;
  /** "How to read this" (see NetworkGuide). Kept outside the zoomed stage. */
  guide?: React.ReactNode;
  children: React.ReactNode | ((fit: boolean) => React.ReactNode);
}) {
  // Zoom and pan. A 13-node DAG at full width still needs magnification to
  // read a decibel value. Ctrl/⌘ + wheel (and trackpad pinch) zooms, drag
  // pans, +/-/0 keys; plain wheel scrolls, so the pane and the guide scroll
  // like any page. Every state resets when the dialog closes.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fit, setFit] = useState(false);
  const [sized, setSized] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const answerId = useId();
  const canFit = typeof children === 'function';

  const zoomIn = useCallback(() => setScale((z) => Math.min(6, z * 1.25)), []);
  const zoomOut = useCallback(() => setScale((z) => Math.max(0.5, z / 1.25)), []);
  const reset = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); }, []);

  useEffect(() => {
    if (!open) {
      setScale(1); setPan({ x: 0, y: 0 }); drag.current = null; setDragging(false);
      setSized(false); setFit(false);
    }
  }, [open]);

  // On open: the guide starts open unless the screen is phone-sized (it then
  // sits collapsed above the graph, one tap away), and the graph is fitted
  // only when the pane can show the whole network at ≥ 70% of natural size —
  // the first render is natural size, so its viewBox can be measured.
  useLayoutEffect(() => {
    if (!open || sized) return;
    setGuideOpen(typeof window === 'undefined' || window.innerWidth > 640);
    const svg = stageRef.current?.querySelector<SVGSVGElement>('svg[viewBox]');
    const pane = bodyRef.current;
    if (canFit && svg && pane) {
      const vbW = svg.viewBox?.baseVal?.width ?? 0;
      setFit(vbW > 0 && pane.clientWidth >= vbW * 0.7);
    }
    setSized(true);
  }, [open, sized, canFit]);

  // Focus in on open, back to the trigger on close; lock page scroll meanwhile.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
          e.preventDefault(); first.focus();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, zoomIn, zoomOut, reset]);

  // Ctrl/⌘ + wheel zoom (trackpad pinch arrives as ctrl + wheel) via a native
  // non-passive listener: React's onWheel is passive, so preventDefault there
  // cannot stop the browser's own page zoom.
  useEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Let a click on a control inside the graph (Technical notes) through.
    if ((e.target as HTMLElement).closest('summary, button, a, details[open] > div')) return;
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setDragging(true);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  if (!open || typeof document === 'undefined') return null;

  const content = typeof children === 'function' ? children(fit) : children;

  // Portalled to <body>: the panels also live inside sticky / scrolling
  // columns (scenario .scn-right), whose stacking context could otherwise
  // paint other UI over the dialog.
  return createPortal(
    <div className='dag-modal' onClick={onClose}>
      <div
        ref={dialogRef}
        className='dag-modal__dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        aria-describedby={answer ? answerId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='dag-modal__bar'>
          <div className='dag-modal__heading'>
            {eyebrow && <p className='ds-eyebrow dag-modal__eyebrow'>{eyebrow}</p>}
            <h2 id={titleId} className='dag-modal__title'>{title ?? 'Enlarged diagram'}</h2>
            {answer && <div id={answerId} className='dag-modal__answer'>{answer}</div>}
          </div>
          <button ref={closeRef} type='button' className='ds-btn ds-btn--primary dag-modal__close'
            onClick={onClose}>
            Close <span aria-hidden='true'>✕</span>
          </button>
        </div>

        <div className={`dag-modal__main${guide ? ' has-guide' : ''}`}>
          {guide && (
            <details
              className='dag-modal__guide'
              open={guideOpen}
              onToggle={(e) => setGuideOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className='dag-modal__guide-summary'>
                How to read this
                <span className='dag-modal__guide-chevron' aria-hidden='true'>▾</span>
              </summary>
              <div className='dag-modal__guide-body'>{guide}</div>
            </details>
          )}

          <section className='dag-modal__graph' aria-label='The network'>
            <div className='dag-modal__tools' role='group' aria-label='Diagram view'>
              {canFit && (
                <div className='dag-modal__seg' role='group' aria-label='Size'>
                  <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm'
                    aria-pressed={fit} onClick={() => { setFit(true); reset(); }}>
                    Whole network
                  </button>
                  <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm'
                    aria-pressed={!fit} onClick={() => { setFit(false); reset(); }}>
                    Actual size
                  </button>
                </div>
              )}
              <div className='dag-modal__zoomgrp' role='group' aria-label='Zoom'>
                <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon'
                  aria-label='Zoom out' title='Zoom out (−)' onClick={zoomOut}>−</button>
                <span className='dag-modal__zoom' aria-live='polite'>{Math.round(scale * 100)}%</span>
                <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon'
                  aria-label='Zoom in' title='Zoom in (+)' onClick={zoomIn}>+</button>
                <button type='button' className='ds-btn ds-btn--ghost ds-btn--sm' onClick={reset}
                  title='Back to 100% (0)'>
                  Reset
                </button>
              </div>
              <span className='dag-modal__hint'>
                Drag or scroll to move around · Ctrl + scroll to zoom
              </span>
            </div>

            <div ref={bodyRef} className='dag-modal__body'>
              {/* transform-origin top-left so zooming pushes content down-right
                  (into the scrollable area) rather than drifting from the centre. */}
              <div
                ref={stageRef}
                className={`dag-modal__stage${fit ? '' : ' is-natural'}`}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                style={{
                  cursor: dragging ? 'grabbing' : 'grab',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: 'top left',
                  transition: dragging ? 'none' : 'transform 80ms linear',
                }}
              >
                {content}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The dialog's one-line answer: the result chip (in the map's colour) and a
 * sentence of key numbers. Presentation only; callers pass values they already
 * show in the panel.
 */
export function NetworkAnswer({
  chip, colour, children,
}: {
  chip: string;
  colour: string;
  children?: React.ReactNode;
}) {
  return (
    <p className='dag-modal__answerline'>
      <span className='dag-modal__chip' style={{ background: colour, color: inkOn(colour) }}>
        {chip}
      </span>
      {children && <span className='dag-modal__answertext'>{children}</span>}
    </p>
  );
}

/**
 * "How to read this": the flow of the network as numbered columns, then its
 * key (what the lines, boxes and colours mean), then a note. The key is the
 * renderer's own legend component, so the guide never restates its semantics.
 */
export function NetworkGuide({
  steps, keyTitle = 'Lines, boxes and colours', legend, note,
}: {
  steps: { title: string; text: React.ReactNode }[];
  keyTitle?: string;
  legend?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className='ev-guide'>
      <h3 className='ev-guide__h'>Read it left to right</h3>
      <ol className='ev-guide__flow'>
        {steps.map((s, i) => (
          <li key={i}>
            <span className='ev-guide__num' aria-hidden='true'>{i + 1}</span>
            <span>
              <strong>{s.title}</strong> — {s.text}
            </span>
          </li>
        ))}
      </ol>
      {legend && (
        <>
          <h3 className='ev-guide__h'>{keyTitle}</h3>
          <div className='ev-guide__key'>{legend}</div>
        </>
      )}
      {note && <p className='ev-guide__note'>{note}</p>}
    </div>
  );
}

const _sentenceList = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Guide for the legacy daily flood and monthly drought networks (fixed 3 columns). */
export function LegacyBnGuide({ parents }: { parents: LegacyBnParentCfg[] }) {
  return (
    <NetworkGuide
      steps={[
        {
          title: 'Inputs',
          text: (
            <>
              {parents.length} readings for this place: {_sentenceList(parents.map((p) => p.title))}.
              Each box shows the reading and how likely each of its states is.
            </>
          ),
        },
        {
          title: 'Risk level',
          text: 'the network combines all the inputs into a chance for each risk level, Minimal to Extreme.',
        },
        {
          title: 'Decision',
          text: (
            <>
              the CRMA decision on a four-step ladder (Monitor, Evaluate, Assess, Actionable Risk),
              from a cost–loss rule (γ = 0.20), with the chance of High or Extreme risk beneath it.
              Same traffic-light colours as the map.
            </>
          ),
        },
      ]}
      legend={<LegacyBnLegend />}
      note={
        <>
          The lines show what feeds into what. All {parents.length} inputs feed the risk level
          together; this network does not report how much each one contributed.
        </>
      }
    />
  );
}

/**
 * What each column of the medium-range network is, in plain words. Only the
 * layers the schema actually declares are listed, in the renderer's order.
 */
const _MR_LAYER_PLAIN: Record<string, { title: string; text: string }> = {
  evidence: {
    title: 'Weather signals',
    text: 'the forecast’s atmospheric signals. The thicker a blue line, the bigger that signal’s share of the heavy-rain signal; very small signals are grouped into one box.',
  },
  measurement: {
    title: 'Rainfall readings',
    text: 'rainfall measures that feed the hazard and the risk directly.',
  },
  observation: {
    title: 'What has already happened',
    text: 'observations before the forecast, such as how wet the ground already is.',
  },
  hazard: {
    title: 'Hazard',
    text: 'the chance of heavy rain, built from the signals and readings.',
  },
  context: {
    title: 'Context',
    text: 'exposure and susceptibility of the basin, as a rank among these 55 basins — not a risk level.',
  },
  risk: {
    title: 'Risk level',
    text: 'the model’s belief across five levels, Minimal to Extreme, and the chance of High or Extreme.',
  },
  uncertainty: {
    title: 'Sharpness',
    text: 'how concentrated that belief is — not forecast skill; a sharp forecast can still be wrong.',
  },
  decision: {
    title: 'Decision',
    text: 'the decision the network draws from the risk.',
  },
};
const _MR_LAYER_ORDER = [
  'evidence', 'measurement', 'observation', 'hazard', 'context', 'risk', 'uncertainty', 'decision',
];

/** Guide for the medium-range CRMA network (schema-driven columns). */
export function CrmaMrGuide({
  schema, basin, window: win,
}: {
  schema: CrmaMrSchema;
  basin: CrmaMrBasinDag;
  window: string;
}) {
  const layers = new Set(schema.nodes.map((n) => n.layer as string));
  const steps = _MR_LAYER_ORDER
    .filter((l) => layers.has(l) && _MR_LAYER_PLAIN[l])
    .map((l) => _MR_LAYER_PLAIN[l]);
  return (
    <NetworkGuide
      steps={steps}
      legend={
        <>
          <ul className='ev-legend' aria-label='Risk level colours'>
            <li>
              <span className='ev-legend__swatches' aria-hidden='true'>
                {['Minimal', 'Low', 'Moderate', 'High', 'Extreme'].map((b) => (
                  <span key={b} className='ds-swatch' style={{ background: crmaRiskColour(b) }} />
                ))}
              </span>
              risk level bars, Minimal → Extreme
            </li>
          </ul>
          <CrmaMrLegend schema={schema} basin={basin} window={win} />
        </>
      }
      note={
        layers.has('decision') ? undefined : (
          <>
            This network makes no decision: CRMA applies no threshold to the chance of High or
            Extreme — compare it with the level your own plan acts on.
          </>
        )
      }
    />
  );
}

// ── Shared pieces of the three boundary panels ─────────────────────────────
// BoundaryCrmaMrPanel, BoundaryDagPanel and BoundaryDagPanelDrought all use
// these, so the header, the empty/loading/error states and the "Why?"
// disclosure look and behave the same in every feed.

/** Card header: feed name (eyebrow), region (title), date/lead badges. */
export function PanelHeader({
  eyebrow, title, badges, busy,
}: {
  eyebrow: string;
  title: React.ReactNode;
  badges?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <div className='ds-card__header ev-panel__header'>
      <div className='ev-panel__heading'>
        <p className='ds-eyebrow'>{eyebrow}</p>
        <h3 className='ds-card__title'>{title}</h3>
      </div>
      {(badges || busy) && (
        <div className='ev-panel__badges'>
          {badges}
          {busy && (
            <span className='ds-badge' role='status'>
              <span className='ds-spinner ev-spinner--inline' aria-hidden='true' /> Loading
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Empty / loading / error body. */
export function PanelState({
  kind, title, children,
}: {
  kind: 'empty' | 'loading' | 'error';
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`ds-state${kind === 'error' ? ' ds-state--error' : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {kind === 'loading' && <span className='ds-spinner' aria-hidden='true' />}
      {kind === 'empty' && (
        <svg width='28' height='28' viewBox='0 0 24 24' aria-hidden='true' fill='none'
          stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z' />
          <circle cx='12' cy='9.5' r='2.5' />
        </svg>
      )}
      {title && <p className='ds-state__title'>{title}</p>}
      {children && <p className='ev-state__text'>{children}</p>}
    </div>
  );
}

export const EMPTY_PROMPT = 'Click a region on the map to see why it has this risk level';

/**
 * The "Why?" control under each panel's summary.
 *
 * With `onEnlarge` (every dashboard and scenario panel): ONE button that opens
 * the network in the full-screen dialog, where it is large, zoomable and has a
 * how-to-read guide beside it. The network is not drawn inline — a half-width
 * column is too narrow to read it.
 *
 * Without `onEnlarge`: the old inline disclosure, with a scroll affordance when
 * the diagram is wider than the card (the diagram must mark its scroller with
 * `.ev-dag__scroll`).
 */
export function NetworkDisclosure({
  id, onEnlarge, children,
}: {
  id: string;
  onEnlarge?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const hintId = useId();

  useLayoutEffect(() => {
    if (!open || !frame.current) { setOverflows(false); return; }
    const el = frame.current;
    const check = () => {
      const sc = el.querySelector<HTMLElement>('.ev-dag__scroll');
      setOverflows(!!sc && sc.scrollWidth > sc.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);

  if (onEnlarge) {
    return (
      <div className='ev-layer2-bar'>
        <button
          type='button'
          className='ds-btn ds-btn--primary ev-why'
          aria-haspopup='dialog'
          aria-describedby={hintId}
          onClick={onEnlarge}
        >
          Why? See the full network
          <span aria-hidden='true'>→</span>
        </button>
        <span id={hintId} className='ev-why__hint'>
          Opens it full screen, with a guide to reading it.
        </span>
      </div>
    );
  }

  return (
    <>
      <div className='ev-layer2-bar'>
        <button
          type='button'
          className='ds-btn ds-btn--secondary ev-why'
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide the full network' : 'Why? Show the full network'}
          <span aria-hidden='true'>{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open && (
        <div id={id} ref={frame} className='ev-network'>
          {overflows && (
            <p className='ev-network__hint'>
              <span>
                <span aria-hidden='true'>↔ </span>Scroll sideways to see the whole network
              </span>
            </p>
          )}
          {children}
        </div>
      )}
    </>
  );
}
