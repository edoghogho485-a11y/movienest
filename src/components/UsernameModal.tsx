import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, AtSign, Check, Loader2, X } from 'lucide-react';
import {
  changeUsername,
  checkUsernameAvailable,
  claimUsername,
  getMyUsername,
  isValidUsernameFormat,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  UserProfile,
} from '../lib/supabase';

export type UsernameModalMode = 'claim' | 'change' | null;

interface UsernameModalProps {
  mode: UsernameModalMode;
  currentUsername: string | null;
  dismissible: boolean;
  onClose: () => void;
  onSuccess: (profile: UserProfile) => void;
}

export function UsernameModal({
  mode,
  currentUsername,
  dismissible,
  onClose,
  onSuccess,
}: UsernameModalProps) {
  const [input, setInput] = useState('');
  const [availability, setAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken'
  >('idle');
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (mode) {
      setInput('');
      setAvailability('idle');
      setConfirmStep(false);
      setSubmitting(false);
      setErrorMsg('');
    }
  }, [mode]);

  useEffect(() => {
    if (!mode || !dismissible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, dismissible, onClose]);

  const trimmed = input.trim();
  const formatValid = isValidUsernameFormat(trimmed);
  const isSameAsCurrent =
    mode === 'change' &&
    Boolean(currentUsername) &&
    trimmed.toLowerCase() === currentUsername?.toLowerCase();

  // Debounced (400ms) live availability check against Supabase username_available(p_name)
  useEffect(() => {
    if (!mode) return;
    setConfirmStep(false);

    if (!trimmed || !formatValid || isSameAsCurrent) {
      setAvailability('idle');
      return;
    }

    let cancelled = false;
    setAvailability('checking');

    const timer = window.setTimeout(async () => {
      const available = await checkUsernameAvailable(trimmed);
      if (cancelled) return;
      if (available === true) {
        setAvailability('available');
      } else if (available === false) {
        setAvailability('taken');
      } else {
        setAvailability('idle');
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, trimmed, formatValid, isSameAsCurrent]);

  if (!mode) return null;

  const isChangeMode = mode === 'change';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formatValid || submitting || availability === 'taken' || isSameAsCurrent) {
      return;
    }

    // Require an explicit confirm step before spending the one-time username change
    if (isChangeMode && !confirmStep) {
      setErrorMsg('');
      setConfirmStep(true);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    if (isChangeMode) {
      const { status, error } = await changeUsername(trimmed);
      setSubmitting(false);

      if (status === 'ok') {
        onSuccess({ username: trimmed, changes: 1 });
        return;
      }

      setConfirmStep(false);
      setErrorMsg(error ?? 'Could not change your username right now.');
      return;
    }

    const { status, error } = await claimUsername(trimmed);
    if (status === 'ok') {
      setSubmitting(false);
      onSuccess({ username: trimmed, changes: 0 });
      return;
    }

    // If this device already claimed a username in another tab, restore it cleanly
    if (status === 'already_set') {
      const restored = await getMyUsername();
      setSubmitting(false);
      if (restored) {
        onSuccess(restored);
        return;
      }
    }

    setSubmitting(false);
    setErrorMsg(error ?? 'Could not save your username right now.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-modal-title"
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#3a322a] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f2a33a]">
              <AtSign className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2
              id="username-modal-title"
              className="text-lg font-bold text-[#f4ece1]"
            >
              {isChangeMode ? 'Change username' : 'Choose your username'}
            </h2>
          </div>

          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close username prompt"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Amber notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#f2a33a]/40 bg-[#14110f] p-3.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[#f2a33a]"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#f4ece1]">
            {isChangeMode
              ? 'You can change your username only once. This is your one and only change.'
              : 'Usernames are unique. You can only change your username once, so choose carefully.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="username-input"
              className="block text-sm font-medium text-[#f4ece1]"
            >
              {isChangeMode ? 'New username' : 'Username'}
            </label>

            <div className="relative mt-1.5">
              <AtSign
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9aa98]"
                aria-hidden="true"
              />
              <input
                id="username-input"
                type="text"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={USERNAME_MAX_LENGTH}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="e.g. movie_fan99"
                className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] pl-10 pr-4 py-2.5 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
              />
            </div>

            <div className="mt-2 min-h-[20px] flex items-center justify-between gap-2 text-xs">
              {!trimmed ? (
                <span className="text-[#b9aa98]">
                  {USERNAME_MIN_LENGTH} to {USERNAME_MAX_LENGTH} characters: letters, numbers, and
                  underscores only.
                </span>
              ) : isSameAsCurrent ? (
                <span className="text-[#b9aa98]">
                  This is already your current username.
                </span>
              ) : !formatValid ? (
                <span className="text-[#f2a33a]">
                  Use {USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} letters, numbers, or underscores
                  only.
                </span>
              ) : availability === 'checking' ? (
                <span className="inline-flex items-center gap-1.5 text-[#b9aa98]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Checking availability...</span>
                </span>
              ) : availability === 'available' ? (
                <span className="inline-flex items-center gap-1 font-bold text-[#f2a33a]">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Available</span>
                </span>
              ) : availability === 'taken' ? (
                <span className="font-bold text-[#f2a33a]">Already taken</span>
              ) : (
                <span className="text-[#b9aa98]">Looks good</span>
              )}
            </div>
          </div>

          {confirmStep && isChangeMode && (
            <div className="rounded-2xl border border-[#3a322a] bg-[#14110f] p-3.5 text-xs text-[#b9aa98]">
              Change your username from{' '}
              <span className="font-bold text-[#f4ece1]">@{currentUsername}</span> to{' '}
              <span className="font-bold text-[#f2a33a]">@{trimmed}</span>? You will not be
              able to change it again.
            </div>
          )}

          {errorMsg && (
            <p className="text-xs font-medium text-[#f2a33a]" role="alert">
              {errorMsg}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            {confirmStep && isChangeMode ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmStep(false)}
                className="min-h-[44px] rounded-full border border-[#3a322a] px-5 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                Back
              </button>
            ) : dismissible ? (
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="min-h-[44px] rounded-full border border-[#3a322a] px-5 py-2.5 text-sm font-medium text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
              >
                Cancel
              </button>
            ) : null}

            <button
              type="submit"
              disabled={
                submitting ||
                !formatValid ||
                availability === 'checking' ||
                availability === 'taken' ||
                isSameAsCurrent
              }
              className="min-h-[44px] rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? 'Saving...'
                : isChangeMode
                  ? confirmStep
                    ? 'Yes, change it'
                    : 'Change username'
                  : 'Confirm username'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
