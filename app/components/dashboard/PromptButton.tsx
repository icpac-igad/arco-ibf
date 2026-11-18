'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CANONICAL_SOURCE, buildLlmPrompt, promptUrls, type PromptTarget } from 'app/lib/llm-prompt';

/**
 * "Copy AI prompt" — opens a dialog with a ready-to-paste prompt that asks an
 * AI assistant to explain this one assessment, plus the filtered data links it
 * reads from. The text is the canonical prompt from CRMA_LLM_ACCESS.md,
 * prefilled for this unit / date / lead (only its five links change); nothing
 * is fetched here.
 *
 * Its own native <dialog> rather than DagModal: that modal zooms on wheel and
 * pans on drag, which would stop the reader scrolling or selecting the text.
 * showModal() gives the focus trap, Esc, top layer and focus return.
 */
export function PromptButton({ target }: { target: PromptTarget }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  // Backdrop close only when the press also STARTED on the backdrop: a text
  // selection dragged out of the textarea ends with a click on the <dialog>.
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  const text = useMemo(() => (open ? buildLlmPrompt(target) : ''), [open, target]);
  const urls = useMemo(() => (open ? promptUrls(target) : []), [open, target]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  const selectText = () => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setStatus({ ok: true, msg: 'Copied — paste it into your AI assistant.' });
    } catch {
      // Insecure context or permission refused: select it so Ctrl/Cmd+C works.
      selectText();
      setStatus({
        ok: false,
        msg: 'Could not copy automatically — the text is selected; press Ctrl+C (⌘C on Mac).',
      });
    }
  };

  return (
    <>
      <button
        type='button'
        className='ds-btn ds-btn--secondary ds-btn--sm'
        onClick={() => { setStatus(null); setOpen(true); }}
        aria-haspopup='dialog'
        title='A ready-made prompt asking an AI assistant to explain this forecast'
      >
        Copy AI prompt
      </button>

      <dialog
        ref={dialogRef}
        className='prompt-dialog'
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClose={() => setOpen(false)}
        onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
        onClick={(e) => {
          if (e.target === e.currentTarget && downOnBackdrop.current) setOpen(false);
          downOnBackdrop.current = false;
        }}
      >
        {open && (
          <div className='prompt-dialog__inner'>
            <div className='prompt-dialog__bar'>
              <h2 id={titleId} className='prompt-dialog__title'>Ask an AI assistant</h2>
              <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm'
                onClick={() => setOpen(false)}>
                Close <span aria-hidden='true'>✕</span>
              </button>
            </div>

            <p id={descId} className='prompt-dialog__lede'>
              Paste this into an AI assistant that can open web links to get a plain-language
              explanation of this forecast. It explains the reasoning; it is not a warning or
              an impact estimate. It is the standard CRMA prompt, prefilled for{' '}
              <strong>{target.placeName ?? target.boundary}</strong> ({target.boundary}),
              initialisation <strong>{target.init}</strong>, lead <strong>{target.window}</strong>:
              only the date, place and lead in its links change.
            </p>

            <label className='prompt-dialog__label' htmlFor={`${titleId}-text`}>Prompt</label>
            <textarea
              id={`${titleId}-text`}
              ref={textRef}
              className='prompt-dialog__text'
              readOnly
              value={text}
              rows={12}
              spellCheck={false}
            />

            <div className='prompt-dialog__actions'>
              <button type='button' className='ds-btn ds-btn--primary ds-btn--sm' onClick={copy}>
                Copy prompt
              </button>
              <span
                className={`prompt-dialog__status${status && !status.ok ? ' prompt-dialog__status--warn' : ''}`}
                role='status'
                aria-live='polite'
              >
                {status?.msg ?? ''}
              </span>
            </div>

            {urls.length > 0 && (
              <details className='prompt-dialog__links'>
                <summary>Data links used by the prompt</summary>
                <ul>
                  {urls.map((u) => (
                    <li key={u.url}>
                      <span>{u.label}: </span>
                      <a href={u.url} target='_blank' rel='noopener noreferrer'>{u.url}</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className='prompt-dialog__source'>Source: {CANONICAL_SOURCE}</p>
          </div>
        )}
      </dialog>
    </>
  );
}
