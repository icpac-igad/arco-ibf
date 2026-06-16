'use client';

import React, { useEffect } from 'react';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
        {children}
      </div>
    </div>
  );
}
