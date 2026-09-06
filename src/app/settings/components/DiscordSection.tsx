'use client';

import { useState, useEffect, useTransition } from 'react';
import { MessageSquare, Copy, Check, Link as LinkIcon, Unlink, RefreshCw } from 'lucide-react';
import {
  getDiscordLinkStatusAction,
  createDiscordLinkCodeAction,
  unlinkDiscordAction,
  type LinkStatusResponse,
} from '@/server/discord-link';

export default function DiscordSection() {
  const [status, setStatus] = useState<LinkStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load initial status
  useEffect(() => {
    let mounted = true;
    getDiscordLinkStatusAction()
      .then((res) => {
        if (mounted) {
          setStatus(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setActionError(err instanceof Error ? err.message : 'Failed to load Discord link status');
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setRemainingSeconds(diff);
      if (diff === 0) {
        setActiveCode(null);
        setExpiresAt(null);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleGenerateCode = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await createDiscordLinkCodeAction();
      if (res.ok && res.code && res.expiresAt) {
        const exp = new Date(res.expiresAt);
        setActiveCode(res.code);
        setExpiresAt(exp);
        setRemainingSeconds(Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)));
      } else {
        setActionError(res.error || 'Failed to generate link code');
      }
    });
  };

  const handleCopyCode = async () => {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${activeCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleUnlink = () => {
    if (!confirm('Are you sure you want to unlink your Discord account?')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await unlinkDiscordAction();
      if (res.ok) {
        setStatus((prev) =>
          prev ? { ...prev, linked: false, discordUsername: null, discordUserId: undefined } : null,
        );
        setActiveCode(null);
        setExpiresAt(null);
      } else {
        setActionError(res.error || 'Failed to unlink Discord account');
      }
    });
  };

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <section className="za-bookplate relative p-6 sm:p-8">
      <span className="za-ribbon-bookmark" aria-hidden="true" />
      <div className="mb-5 flex items-center justify-between border-b border-decorative pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-accent" />
          <h2 className="font-[var(--za-font-display)] text-sm font-[var(--za-weight-heading)] uppercase tracking-[0.06em] text-ink">
            Discord Companion
          </h2>
        </div>
        {status?.linked && (
          <span className="inline-flex items-center gap-1 rounded-small border border-success bg-success-surface px-2 py-0.5 text-[10px] font-[var(--za-weight-emphasis)] text-success">
            <LinkIcon size={12} /> Linked
          </span>
        )}
      </div>

      {actionError && (
        <div className="mb-4 rounded-small border border-warning bg-warning-surface p-2 text-xs text-warning">
          {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-ink-muted">
          <RefreshCw size={14} className="animate-spin" /> Checking link status...
        </div>
      ) : status?.linked ? (
        <div className="space-y-4 text-xs">
          <p className="text-ink-muted">
            Your archive is connected to Discord. You can log episodes, inspect your library, and
            check stats directly from Discord.
          </p>
          <div className="space-y-3 rounded-small border border-decorative p-4 bg-surfaceSubtle">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-decorative pb-2">
              <span className="text-ink-muted">Discord Username</span>
              <span className="font-[var(--za-weight-emphasis)] text-ink">
                {status.discordUsername ? `@${status.discordUsername}` : 'Connected'}
              </span>
            </div>
            {status.discordUserId && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-decorative pb-2">
                <span className="text-ink-muted">Discord ID</span>
                <span className="font-mono text-ink-muted text-[11px]">{status.discordUserId}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink-muted">Linked Since</span>
              <span className="text-ink">
                {status.createdAt ? new Date(status.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleUnlink}
              className="inline-flex items-center gap-1.5 rounded-small border border-decorative px-3 py-1.5 text-xs text-ink-muted hover:border-warning hover:text-warning transition-colors"
            >
              <Unlink size={14} />
              Unlink Discord
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          <p className="text-ink-muted">
            Link your ZedArchive account with our Discord companion bot (
            <strong>{status?.botPublicName || 'ZedArchive'}</strong>) to log media on the go.
          </p>

          {activeCode ? (
            <div className="rounded-small border border-accent/40 bg-surfaceSubtle p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-ink font-[var(--za-weight-emphasis)]">
                  Your One-Time Link Code
                </span>
                <span className="text-accent font-mono text-[11px]">
                  Expires in {formatCountdown(remainingSeconds)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-small border border-decorative bg-canvas p-2.5">
                <code className="font-mono text-sm tracking-widest text-ink font-bold">
                  {activeCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 rounded-small bg-accent px-2.5 py-1 text-[11px] font-[var(--za-weight-emphasis)] text-onAccent hover:opacity-90"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied command' : 'Copy command'}
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                DM the ZedArchive bot: <code className="text-ink">/link {activeCode}</code>. Never
                paste this code in a public server channel.
              </p>
            </div>
          ) : (
            <div>
              <button
                type="button"
                disabled={isPending}
                onClick={handleGenerateCode}
                className="inline-flex items-center gap-2 rounded-small bg-accent px-4 py-2 text-xs font-[var(--za-weight-emphasis)] text-onAccent hover:opacity-90 transition-opacity"
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                Generate Discord Link Code
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
