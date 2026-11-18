'use client';

import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * Full-screen modal for enlarging a BN DAG (or any SVG/figure).
 *
 * An accessible dialog: aria-modal + a visible, labelled title; focus moves to
 * Close on open, Tab is trapped inside, Esc closes, and focus returns to
 * whatever opened it. Also closes on backdrop click. position:fixed → not
 * clipped by any parent overflow.
 */
export function DagModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  // Zoom and pan. A 13-node DAG at full width still needs magnification to
  // read a decibel value, and "enlarge" that only fits the diagram to the
  // viewport is not enlargement. Wheel to zoom, drag to pan, +/-/0 keys, and
  // every state resets when the modal closes so it never reopens mid-pan.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const zoomIn = useCallback(() => setScale((z) => Math.min(6, z * 1.25)), []);
  const zoomOut = useCallback(() => setScale((z) => Math.max(0.5, z / 1.25)), []);
  const reset = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); }, []);

  useEffect(() => {
    if (!open) { setScale(1); setPan({ x: 0, y: 0 }); drag.current = null; setDragging(false); }
  }, [open]);

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
      if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, zoomIn, zoomOut, reset]);

  // Wheel zoom via a native non-passive listener: React's onWheel is passive,
  // so preventDefault there cannot stop the page from scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  const onDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setDragging(true);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  if (!open || typeof document === 'undefined') return null;

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
        onClick={(e) => e.stopPropagation()}
      >
        <div className='dag-modal__bar'>
          <h2 id={titleId} className='dag-modal__title'>{title ?? 'Enlarged diagram'}</h2>
          <div className='dag-modal__tools' role='group' aria-label='Zoom'>
            <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon'
              aria-label='Zoom out' title='Zoom out (−)' onClick={zoomOut}>−</button>
            <span className='dag-modal__zoom' aria-live='polite'>{Math.round(scale * 100)}%</span>
            <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon'
              aria-label='Zoom in' title='Zoom in (+)' onClick={zoomIn}>+</button>
            <button type='button' className='ds-btn ds-btn--ghost ds-btn--sm' onClick={reset}>
              Reset
            </button>
            <span className='dag-modal__hint'>scroll to zoom · drag to pan</span>
          </div>
          <button ref={closeRef} type='button' className='ds-btn ds-btn--primary'
            onClick={onClose}>
            Close <span aria-hidden='true'>✕</span>
          </button>
        </div>

        <div className='dag-modal__body'>
          {/* transform-origin top-left so zooming pushes content down-right
              predictably rather than drifting from the centre. */}
          <div
            ref={stageRef}
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
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
 * "Why? Show the full network" disclosure + Enlarge, with a scroll affordance
 * when the diagram is wider than the card (horizontal scroll is allowed for the
 * DAG only). The diagram must mark its scroller with `.ev-dag__scroll`.
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
        {onEnlarge && (
          <button
            type='button'
            className='ds-btn ds-btn--secondary ds-btn--icon'
            onClick={onEnlarge}
            aria-label='Enlarge the network full screen'
            title='Enlarge the network full screen (scroll to zoom, drag to pan)'
          >
            <span aria-hidden='true'>⤢</span>
          </button>
        )}
      </div>

      {open && (
        <div id={id} ref={frame} className='ev-network'>
          {overflows && (
            <p className='ev-network__hint'>
              <span>
                <span aria-hidden='true'>↔ </span>Scroll sideways to see the whole network
                {onEnlarge ? ', or' : ''}
              </span>
              {onEnlarge && (
                <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm'
                  onClick={onEnlarge}>
                  Enlarge <span aria-hidden='true'>⤢</span>
                </button>
              )}
            </p>
          )}
          <div
            // Double-click rather than single: a single click on a diagram this
            // dense is far more often someone selecting a number to read than
            // someone asking for a lightbox.
            onDoubleClick={onEnlarge}
            style={onEnlarge ? { cursor: 'zoom-in' } : undefined}
            title={onEnlarge ? 'Double-click to enlarge — then scroll to zoom, drag to pan' : undefined}
          >
            {children}
          </div>
        </div>
      )}
    </>
  );
}
