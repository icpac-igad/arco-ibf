'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * MediaGallery
 *
 * Folder-based gallery of media (images + videos) served from
 * gs://crma-mdx-store/media/{prefix}/. Reads the manifest at /api/mdx/manifest
 * to enumerate files — no separate listing endpoint required.
 *
 * Usage in MDX:
 *   <MediaGallery prefix="rm/fl-rm-2026-04-08/" />
 *   <MediaGallery prefix="rk/fl-rk-2024-0247-KEN/" columns={3} />
 *
 * Behaviour (per design Q3, Q4):
 *   - Grid of thumbnails; videos show a poster placeholder + ▶ overlay
 *     (no autoplay)
 *   - Click a thumb → opens a carousel lightbox at that index
 *   - Arrow keys / on-screen prev-next to navigate; Esc to close
 *   - Inside the lightbox, video elements have native controls; the user
 *     must click play (no autoplay)
 */

interface ManifestEntry {
  hash?: string;
  updated?: string;
  size?: number;
}
interface Manifest {
  files: Record<string, ManifestEntry>;
}

type MediaKind = 'image' | 'video';
interface MediaItem {
  path: string;   // path under media/ — used to build /api/mdx/media/{path}
  name: string;   // last URL segment for the caption fallback
  kind: MediaKind;
  size?: number;
}

interface Props {
  prefix: string;
  columns?: number; // override the responsive auto-fit
}

const IMAGE_EXTS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
const VIDEO_EXTS = ['.webm', '.mp4'];

function classifyExt(p: string): MediaKind | null {
  const lc = p.toLowerCase();
  if (IMAGE_EXTS.some((e) => lc.endsWith(e))) return 'image';
  if (VIDEO_EXTS.some((e) => lc.endsWith(e))) return 'video';
  return null;
}

function fileName(p: string): string {
  const slash = p.lastIndexOf('/');
  return slash >= 0 ? p.slice(slash + 1) : p;
}

/**
 * Collapse same-stem siblings to one item, preferring WebP/WebM:
 *   a.gif + a.webm + a.mp4  →  a.webm
 *   b.png + b.webp           →  b.webp
 */
function dedupeBestFormat(items: MediaItem[]): MediaItem[] {
  const byStem = new Map<string, MediaItem>();
  const rank = (path: string): number => {
    const lc = path.toLowerCase();
    if (lc.endsWith('.webm')) return 0;
    if (lc.endsWith('.webp')) return 0;
    if (lc.endsWith('.mp4')) return 1;
    if (lc.endsWith('.gif')) return 2;
    if (lc.endsWith('.png')) return 1;
    if (lc.endsWith('.jpg') || lc.endsWith('.jpeg')) return 1;
    return 3;
  };
  for (const it of items) {
    const dot = it.path.lastIndexOf('.');
    const stem = dot >= 0 ? it.path.slice(0, dot) : it.path;
    const existing = byStem.get(stem);
    if (!existing || rank(it.path) < rank(existing.path)) {
      byStem.set(stem, it);
    }
  }
  return Array.from(byStem.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function MediaGallery({ prefix, columns }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Normalise prefix: trim leading slash, ensure trailing slash.
  const normPrefix = prefix.replace(/^\/+/, '').replace(/\/?$/, '/');
  const fullPrefix = `media/${normPrefix}`;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mdx/manifest', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        return res.json() as Promise<Manifest>;
      })
      .then((manifest) => {
        if (cancelled) return;
        const matched: MediaItem[] = [];
        for (const [key, entry] of Object.entries(manifest.files ?? {})) {
          if (!key.startsWith(fullPrefix)) continue;
          const kind = classifyExt(key);
          if (!kind) continue;
          matched.push({
            path: key.slice('media/'.length), // drop the media/ prefix for the URL
            name: fileName(key),
            kind,
            size: entry.size,
          });
        }
        setItems(dedupeBestFormat(matched));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [fullPrefix]);

  const close = useCallback(() => {
    setActiveIndex(null);
    dialogRef.current?.close();
  }, []);

  const next = useCallback(() => {
    setActiveIndex((i) => {
      if (i === null) return null;
      return (i + 1) % items.length;
    });
  }, [items.length]);

  const prev = useCallback(() => {
    setActiveIndex((i) => {
      if (i === null) return null;
      return (i - 1 + items.length) % items.length;
    });
  }, [items.length]);

  // Open / close the native <dialog>, set up arrow-key navigation
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeIndex !== null && !dialog.open) {
      dialog.showModal();
    }
    if (activeIndex === null && dialog.open) {
      dialog.close();
    }
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeIndex, next, prev, close]);

  const gridStyle = useMemo<React.CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: columns
      ? `repeat(${columns}, 1fr)`
      : 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.5rem',
    margin: '1rem 0',
  }), [columns]);

  if (error) {
    return (
      <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
        Media manifest unavailable ({error}).
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
        No media under <code>media/{normPrefix}</code> yet.
      </p>
    );
  }

  const active = activeIndex !== null ? items[activeIndex] : null;

  return (
    <>
      <div style={gridStyle}>
        {items.map((item, i) => (
          <button
            key={item.path}
            type='button'
            onClick={() => setActiveIndex(i)}
            style={{
              padding: 0,
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              background: '#f9fafb',
              cursor: 'pointer',
              overflow: 'hidden',
              aspectRatio: '4 / 3',
              position: 'relative',
            }}
            aria-label={item.name}
          >
            {item.kind === 'image' ? (
              <img
                src={`/api/mdx/media/${item.path}`}
                alt={item.name}
                loading='lazy'
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <VideoThumb name={item.name} />
            )}
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setActiveIndex(null)}
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
        {active && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <header style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 1rem',
              background: '#111827',
              fontSize: '0.85rem',
            }}>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                {activeIndex !== null ? activeIndex + 1 : 0} / {items.length} — {active.name}
              </span>
              <button
                type='button'
                onClick={close}
                style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                aria-label='Close'
              >
                ×
              </button>
            </header>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              minHeight: '60vh',
            }}>
              {active.kind === 'image' ? (
                <img
                  src={`/api/mdx/media/${active.path}`}
                  alt={active.name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
                />
              ) : (
                <video
                  key={active.path}
                  src={`/api/mdx/media/${active.path}`}
                  controls
                  style={{ maxWidth: '100%', maxHeight: '75vh' }}
                />
              )}
            </div>
            {items.length > 1 && (
              <footer style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.5rem 1rem',
                background: '#111827',
              }}>
                <button type='button' onClick={prev} style={navBtn}>← Previous</button>
                <button type='button' onClick={next} style={navBtn}>Next →</button>
              </footer>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

const navBtn: React.CSSProperties = {
  background: '#374151',
  color: '#fff',
  border: 'none',
  padding: '0.4rem 1rem',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.85rem',
};

function VideoThumb({ name }: { name: string }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#1f2937 0%,#0b1220 100%)',
      color: '#9ca3af',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      {/* Play triangle */}
      <svg width='40' height='40' viewBox='0 0 40 40' aria-hidden='true'>
        <circle cx='20' cy='20' r='18' fill='rgba(255,255,255,0.12)' />
        <path d='M16 12 L28 20 L16 28 Z' fill='#f9fafb' />
      </svg>
      <span style={{ fontSize: '0.7rem', fontFamily: 'ui-monospace, monospace', padding: '0 0.5rem', textAlign: 'center', wordBreak: 'break-all' }}>
        {name}
      </span>
    </div>
  );
}
