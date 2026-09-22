'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Lightweight full-screen modal for enlarging a BN DAG (or any SVG/figure).
 * Closes on backdrop click, the Close button, or Esc. Used by the BN-DAG panels
 * when `expandable` is set (scenario mode) so participants can read the diagram's
 * elements at full size. position:fixed → not clipped by any parent overflow.
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
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) { setScale(1); setPan({ x: 0, y: 0 }); drag.current = null; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setScale((z) => Math.min(6, z * 1.25));
      else if (e.key === '-' || e.key === '_') setScale((z) => Math.max(0.5, z / 1.25));
      else if (e.key === '0') { setScale(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
  };
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => { drag.current = null; };

  if (!open) return null;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={title ?? 'Enlarged diagram'}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        cursor: 'zoom-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1200px, 96vw)',
          maxHeight: '94vh',
          overflow: 'auto',
          position: 'relative',
          cursor: 'default',
        }}
      >
        <button
          type='button'
          onClick={onClose}
          className='usa-button usa-button--secondary'
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
        >
          Close ✕
        </button>

        <div
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 1, display: 'flex',
            gap: '0.25rem', alignItems: 'center', background: 'rgba(255,255,255,0.92)',
            borderRadius: 6, padding: '0.2rem 0.4rem', fontSize: '0.75rem',
            border: '1px solid #d4d4d8',
          }}
        >
          <button type='button' aria-label='Zoom out'
            onClick={() => setScale((z) => Math.max(0.5, z / 1.25))}
            style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.3rem' }}>−</button>
          <span style={{ minWidth: '3.2rem', textAlign: 'center', color: '#4b5563' }}>
            {Math.round(scale * 100)}%
          </span>
          <button type='button' aria-label='Zoom in'
            onClick={() => setScale((z) => Math.min(6, z * 1.25))}
            style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.3rem' }}>+</button>
          <button type='button' onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
            style={{ border: 0, background: 'none', cursor: 'pointer', color: '#4b5563', padding: '0 0.3rem' }}>Reset</button>
          <span style={{ color: '#9ca3af', paddingLeft: '0.25rem' }}>scroll to zoom · drag to pan</span>
        </div>

        {/* transform-origin top-left so zooming pushes content down-right
            predictably rather than drifting from the centre. */}
        <div
          onWheel={onWheel}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{
            cursor: drag.current ? 'grabbing' : 'grab',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'top left',
            transition: drag.current ? 'none' : 'transform 80ms linear',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
