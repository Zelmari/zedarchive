'use client';

import { useRef, useState } from 'react';
import type { ClerkChip, ClerkPageState, ClerkProposalView, ClerkTurn } from '@/server/clerk';
import {
  cancelClerkProposal,
  confirmClerkProposal,
  submitClerkSentence,
  undoLastClerkPlan,
} from '@/server/clerk';

const READ_ERROR = 'The clerk could not read that. Try again.';
const RESTING_TEXT = 'The clerk is resting until 00:00 UTC.';
const UNAVAILABLE_TEXT = 'The clerk is not available.';

type TranscriptLine = { role: 'you' | 'clerk'; text: string };

interface ClerkClientProps {
  state: ClerkPageState;
}

function formatToken(value: string): string {
  const spaced = value.replaceAll('_', ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function numbersFrom(proposal: ClerkProposalView): Record<number, number> {
  const values: Record<number, number> = {};
  proposal.lines.forEach((line, index) => {
    if (line.editable) values[index] = line.editable.value;
  });
  return values;
}

function editedNumbers(
  proposal: ClerkProposalView,
  values: Record<number, number>,
): { lineIndex: number; value: number }[] {
  const edits: { lineIndex: number; value: number }[] = [];
  proposal.lines.forEach((line, lineIndex) => {
    if (!line.editable) return;
    edits.push({ lineIndex, value: values[lineIndex] ?? line.editable.value });
  });
  return edits;
}

export default function ClerkClient({ state }: ClerkClientProps) {
  const [sentence, setSentence] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [remaining, setRemaining] = useState(state.remaining);
  const [resting, setResting] = useState(state.resting);
  const [proposal, setProposal] = useState<ClerkProposalView | null>(null);
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [chips, setChips] = useState<ClerkChip[]>([]);
  const [chipPrompt, setChipPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const inFlight = useRef(false);
  // One id per submit. A second click while that request is open reuses it.
  const clientMessageId = useRef<string | null>(null);

  if (!state.enabled) {
    return (
      <p className="text-[length:var(--za-text-supporting)] text-ink-muted">{UNAVAILABLE_TEXT}</p>
    );
  }

  const pushLine = (line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line]);
  };

  const applyTurn = (turn: ClerkTurn) => {
    setRemaining(turn.remaining);
    if (turn.kind === 'proposal') {
      setProposal(turn.proposal);
      setEdits(numbersFrom(turn.proposal));
      setChips([]);
      setChipPrompt('');
      setReply('');
      setResting(false);
      pushLine({ role: 'clerk', text: turn.proposal.summary });
      return;
    }
    if (turn.kind === 'chips') {
      setProposal(null);
      setEdits({});
      setChips(turn.chips.slice(0, 3));
      setChipPrompt(turn.prompt);
      setReply('');
      setResting(false);
      pushLine({ role: 'clerk', text: turn.prompt });
      return;
    }
    if (turn.kind === 'resting') {
      setProposal(null);
      setEdits({});
      setChips([]);
      setChipPrompt('');
      setReply('');
      setResting(true);
      pushLine({ role: 'clerk', text: turn.text });
      return;
    }
    setProposal(null);
    setEdits({});
    setChips([]);
    setChipPrompt('');
    setReply(turn.text);
    setResting(false);
    pushLine({ role: 'clerk', text: turn.text });
  };

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      console.error('Clerk request failed:', err);
      setError(READ_ERROR);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function send(raw: string, entryId?: string) {
    const message = raw.trim();
    if (!message || resting) return;
    const id = clientMessageId.current ?? crypto.randomUUID();
    clientMessageId.current = id;
    await run(async () => {
      try {
        const turn = entryId
          ? await submitClerkSentence(message, id, entryId)
          : await submitClerkSentence(message, id);
        if (!entryId) setSentence('');
        pushLine({ role: 'you', text: message });
        applyTurn(turn);
      } finally {
        clientMessageId.current = null;
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void send(sentence);
  }

  function handleConfirm() {
    if (!proposal) return;
    const current = proposal;
    const payload = editedNumbers(current, edits);
    void run(async () => {
      const turn = await confirmClerkProposal(current.id, payload);
      applyTurn(turn);
      setCanUndo(true);
    });
  }

  function handleCancel() {
    if (!proposal) return;
    const proposalId = proposal.id;
    void run(async () => {
      await cancelClerkProposal(proposalId);
      setProposal(null);
      setEdits({});
    });
  }

  function handleUndo() {
    if (!canUndo) return;
    void run(async () => {
      const turn = await undoLastClerkPlan();
      setCanUndo(false);
      applyTurn(turn);
    });
  }

  function setLineNumber(index: number, bounds: { min: number; max: number }, raw: number) {
    if (!Number.isFinite(raw)) return;
    const next = Math.min(bounds.max, Math.max(bounds.min, Math.round(raw)));
    setEdits((prev) => ({ ...prev, [index]: next }));
  }

  const fieldDisabled = resting || busy;

  return (
    <div className="space-y-6 sm:space-y-8">
      <p className="text-[length:var(--za-text-supporting)] text-ink-muted">
        {remaining} left today
      </p>

      {resting ? (
        <p
          id="clerk-resting"
          role="status"
          className="text-[length:var(--za-text-supporting)] text-ink"
        >
          {RESTING_TEXT}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="clerk-sentence"
            className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink"
          >
            What happened
          </label>
          <input
            id="clerk-sentence"
            type="text"
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            disabled={fieldDisabled}
            required
            maxLength={1000}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="send"
            aria-describedby={resting ? 'clerk-resting' : undefined}
            className="za-field w-full"
          />
        </div>
        <button
          type="submit"
          className="za-button za-button--primary w-full sm:w-auto"
          disabled={fieldDisabled || sentence.trim().length === 0}
        >
          Submit
        </button>
      </form>

      {error ? (
        <p className="za-notice za-notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div aria-live="polite" className="space-y-6">
        {reply ? (
          <p className="whitespace-pre-wrap break-words text-[length:var(--za-text-base)] leading-[var(--za-leading-body)] text-ink">
            {reply}
          </p>
        ) : null}

        {proposal ? (
          <section aria-label="Plan" className="za-bookplate space-y-4 p-6 sm:p-8">
            <p className="whitespace-pre-wrap break-words text-[length:var(--za-text-base)] leading-[var(--za-leading-body)] text-ink">
              {proposal.summary}
            </p>
            <ul className="space-y-4">
              {proposal.lines.map((line, index) => {
                const editable = line.editable;
                return (
                  <li
                    key={`${proposal.id}-${index}`}
                    className="space-y-2 border-b border-decorative pb-4 last:border-b-0 last:pb-0"
                  >
                    <p className="break-words text-[length:var(--za-text-base)] text-ink">
                      {line.title} · {line.label}
                    </p>
                    <p className="text-[length:var(--za-text-supporting)] text-ink-muted">
                      {formatToken(line.category)} · {formatToken(line.status)}
                    </p>
                    {editable ? (
                      <div className="max-w-40">
                        <label
                          htmlFor={`clerk-line-${index}`}
                          className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink"
                        >
                          Number for {line.title}
                        </label>
                        <input
                          id={`clerk-line-${index}`}
                          type="number"
                          inputMode="numeric"
                          className="za-field"
                          min={editable.min}
                          max={editable.max}
                          step={1}
                          value={edits[index] ?? editable.value}
                          disabled={busy}
                          onChange={(event) =>
                            setLineNumber(index, editable, event.target.valueAsNumber)
                          }
                        />
                        <p className="mt-1 text-[length:var(--za-text-fine)] text-ink-muted">
                          {editable.min} to {editable.max}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="za-button za-button--primary"
                onClick={handleConfirm}
                disabled={busy}
              >
                Confirm
              </button>
              <button
                type="button"
                className="za-button za-button--secondary"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {chips.length > 0 ? (
          <section aria-labelledby="clerk-chips-prompt" className="space-y-3">
            <p
              id="clerk-chips-prompt"
              className="whitespace-pre-wrap break-words text-[length:var(--za-text-base)] leading-[var(--za-leading-body)] text-ink"
            >
              {chipPrompt}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="za-button za-button--secondary h-auto w-full whitespace-normal sm:w-auto"
                  disabled={fieldDisabled}
                  onClick={() => void send(chip.title, chip.id)}
                >
                  {chip.title} · {formatToken(chip.category)} · {formatToken(chip.status)}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {canUndo ? (
        <button
          type="button"
          className="za-button za-button--secondary"
          onClick={handleUndo}
          disabled={busy}
          aria-label="Undo the last confirmed plan"
        >
          Undo
        </button>
      ) : null}

      <section aria-label="This visit" className="space-y-3">
        <h2 className="font-[family-name:var(--za-font-display)] text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.06em] text-ink">
          This visit
        </h2>
        {transcript.length === 0 ? (
          <p className="text-[length:var(--za-text-supporting)] text-ink-muted">
            Nothing from this visit yet.
          </p>
        ) : (
          <ol className="space-y-4">
            {transcript.map((line, index) => (
              <li key={index} className="text-[length:var(--za-text-base)] text-ink">
                <span className="mb-1 block text-xs font-[var(--za-weight-emphasis)] text-ink-muted">
                  {line.role === 'you' ? 'You' : 'Clerk'}
                </span>
                <p className="whitespace-pre-wrap break-words leading-[var(--za-leading-body)]">
                  {line.text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
