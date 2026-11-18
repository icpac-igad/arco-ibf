'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type DropId = 'about' | 'partners';

// Routes that actually exist. Anything else is a panel, not a link, so the
// nav never points at a 404.
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/scenario', label: 'Scenarios' },
];

/**
 * Top bar over the hero. About / Partners are disclosure panels (button with
 * aria-expanded + aria-controls), not menus: they hold prose, not commands.
 * Escape closes and returns focus to the trigger; outside click or focus
 * leaving the nav closes too.
 */
export function TopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState<DropId | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Record<DropId, HTMLButtonElement | null>>({
    about: null,
    partners: null,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerRefs.current[open]?.focus();
        setOpen(null);
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const toggle = (id: DropId) => () => setOpen((cur) => (cur === id ? null : id));

  const disclosure = (id: DropId, label: string, body: React.ReactNode) => {
    const isOpen = open === id;
    return (
      <div className='navitem-wrap'>
        <button
          type='button'
          ref={(el) => {
            triggerRefs.current[id] = el;
          }}
          className={`topbar__link navitem${isOpen ? ' open' : ''}`}
          aria-expanded={isOpen}
          aria-controls={`topbar-panel-${id}`}
          onClick={toggle(id)}
        >
          {label} <span className='caret' aria-hidden='true' />
        </button>
        <div
          id={`topbar-panel-${id}`}
          className={`dropdown${isOpen ? ' on' : ''}`}
          role='region'
          aria-label={label}
        >
          {body}
        </div>
      </div>
    );
  };

  return (
    <header className='topbar'>
      <div className='topbar__in'>
        <Link href='/' className='topbar__brand' aria-label='CRMA — home'>
          <span className='topbar__mark' aria-hidden='true' />
          <span className='topbar__words'>
            <strong>CRMA</strong>
            <span className='topbar__sub'>Risk Monitoring Toolkit</span>
          </span>
        </Link>

        <nav className='topbar__nav' aria-label='Primary' ref={navRef}>
          {LINKS.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`topbar__link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}

          {disclosure(
            'about',
            'About',
            <>
              <h4>Continuous Risk Monitoring &amp; Assessment</h4>
              <p>
                An early-warning view of flood and drought across East Africa: recorded
                EM-DAT disaster events, Admin-1 frequency choropleths, and impact-based
                forecast pipelines.
              </p>
              <p>
                <b>Scenario simulation</b> replays a past event as it unfolded, so a
                decision can be rehearsed against what the record later showed.
              </p>
            </>,
          )}

          {disclosure(
            'partners',
            'Partners',
            <>
              <span className='soon'>Coming soon</span>
              <h4>Partners &amp; collaborators</h4>
              <p>
                This space will list the organisations and institutions collaborating on
                CRMA: partner logos, roles and links will be populated here.
              </p>
            </>,
          )}
        </nav>
      </div>
    </header>
  );
}
