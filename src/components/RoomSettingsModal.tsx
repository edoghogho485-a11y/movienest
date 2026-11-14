import { useEffect, useState } from 'react';
import { Lock, Settings, Unlock, X } from 'lucide-react';

interface RoomSettingsModalProps {
  open: boolean;
  locked: boolean;
  onClose: () => void;
  onSaveSettings: (next: { locked: boolean }) => Promise<string | null>;
}

export function RoomSettingsModal({
  open,
  locked,
  onClose,
  onSaveSettings,
}: RoomSettingsModalProps) {
  const [draftLocked, setDraftLocked] = useState<boolean>(locked);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open) {
      setDraftLocked(locked);
      setErrorMsg('');
    }
  }, [open, locked]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleToggleLock = async () => {
    if (saving) return;
    const nextLocked = !draftLocked;
    setDraftLocked(nextLocked);
    setSaving(true);
    setErrorMsg('');
    const err = await onSaveSettings({ locked: nextLocked });
    setSaving(false);
    if (err) {
      setDraftLocked(!nextLocked);
      setErrorMsg(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-[#2a2a33] bg-[#14141a] p-5 sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#2a2a33] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#20202a] text-[#E50914]">
              <Settings className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2
              id="room-settings-title"
              className="font-display text-lg font-semibold text-white"
            >
              Room Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close room settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Lock room switch */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2a2a33] bg-[#0d0d12] p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {draftLocked ? (
                  <Lock className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
                ) : (
                  <Unlock className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                )}
                <p className="text-sm font-medium text-white">Lock room</p>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                When locked, new guests opening the invite link see &ldquo;This room is locked&rdquo;.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={draftLocked}
              aria-label="Lock room"
              disabled={saving}
              onClick={() => void handleToggleLock()}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-60 ${
                draftLocked
                  ? 'border-[#E50914] bg-[#E50914]'
                  : 'border-[#2a2a33] bg-[#1b1b24]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                  draftLocked ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs text-[#F87171]" role="alert">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
