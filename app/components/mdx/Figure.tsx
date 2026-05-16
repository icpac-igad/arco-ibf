'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Figure — single image / video MDX component.
 *
 * Renders an image or video served from gs://crma-mdx-store/media/{src}
 * via the /api/mdx/media/{src} proxy.
 *
 * Click → opens the media in a lightbox (same dialog pattern as
 * MediaGallery but single-item, no carousel).
 *
 * Usage in MDX:
 *   <Figure src="rk/fl-rk-2024-0247-KEN/peak.webp" caption="Peak discharge" />
 *   <Figure src="rk/fl-rk-2024-0247-KEN/anim.webm" caption="6-day animation" w="60%" />
 *
 * Per design Q3: video never autoplays. In the grid it shows a poster
 * (first frame of the WebM via preload="metadata" + paused) and clicking
 * the play overlay opens the lightbox where the user clicks the native
 * play button.
 */

interface Props {
  src: string;
  caption?: string;
  alt?: string;
  /** CSS width override, e.g. "60%", "320px". Defaults to 100% of container. */
  w?: string;
  /** Force kind detection if the extension is ambiguous. */
  kind?: 'image' | 'video';
}

const VIDEO_EXTS = ['.webm', '.mp4'];

function inferKind(src: string): 'image' | 'video' {
  const lc = src.toLowerCase();
  if (VIDEO_EXTS.some((e) => lc.endsWith(e))) return 'video';
  return 'image';
}

export function Figure({ src, caption, alt, w, kind: kindOverride }: Props) {
  const kind = kindOverride ?? inferKind(src);
  const url = `/api/mdx/media/${src.replace(/^\//, '')}`;
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <figure style={{ margin: '1rem 0', width: w ?? '100%', textAlign: 'center' }}>
      <button
        type='button'
        onClick={() => setOpen(true)}
        style={{
          padding: 0,
          border: '1px solid #e5e7eb',
          borderRadius: 4,
          background: '#f9fafb',
          cursor: 'pointer',
          overflow: 'hidden',
          width: '100%',
          position: 'relative',
          display: 'block',
        }}
        aria-label={alt ?? caption ?? src}
      >
        {kind === 'image' ? (
          <img
            src={url}
            alt={alt ?? caption ?? ''}
            loading='lazy'
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <>
            <video
              src={url}
              preload='metadata'
              muted
              playsInline
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <span style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }} aria-hidden='true'>
              <svg width='24' height='24' viewBox='0 0 24 24'>
                <path d='M8 5 L20 12 L8 19 Z' fill='#f9fafb' />
              </svg>
            </span>
          </>
        )}
      </button>
      {caption && (
        <figcaption style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>
          {caption}
        </figcaption>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        style={{
          width: 'min(95vw, 1200px)',
          maxHeight: '95vh',
          padding: 0,
          border: 'none',
          borderRadius: 8,
          background: '#000',
          color: '#fff',
        }}
      >
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 1rem', background: '#111827', fontSize: '0.85rem',
        }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{caption ?? src}</span>
          <button type='button' onClick={() => setOpen(false)}
            style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
            aria-label='Close'
          >×</button>
        </header>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem', minHeight: '60vh',
        }}>
          {kind === 'image' ? (
            <img src={url} alt={alt ?? caption ?? ''}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
          ) : (
            <video src={url} controls
              style={{ maxWidth: '100%', maxHeight: '75vh' }} />
          )}
        </div>
      </dialog>
    </figure>
  );
}
