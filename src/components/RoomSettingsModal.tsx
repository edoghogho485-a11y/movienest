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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-[#3a322a] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f2a33a]">
              <Settings className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2
              id="room-settings-title"
              className="text-lg font-bold text-[#f4ece1]"
            >
              Room Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close room settings"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Lock room switch */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#3a322a] bg-[#14110f] p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {draftLocked ? (
                  <Lock className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                ) : (
                  <Unlock className="h-4 w-4 text-[#b9aa98]" aria-hidden="true" />
                )}
                <p className="text-sm font-bold text-[#f4ece1]">Lock room</p>
              </div>
              <p className="mt-1 text-xs text-[#b9aa98]">
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
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-60 ${
                draftLocked
                  ? 'border-[#f2a33a] bg-[#f2a33a]'
                  : 'border-[#3a322a] bg-[#1e1a16]'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full transition-transform ${
                  draftLocked
                    ? 'translate-x-7 bg-[#1a1208]'
                    : 'translate-x-1 bg-[#f4ece1]'
                }`}
              />
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-[#f2a33a]" role="alert">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
