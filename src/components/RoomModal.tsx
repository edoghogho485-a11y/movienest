import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, X } from 'lucide-react';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import {
  createRoomInSupabase,
  findRoomByCode,
  getInviteLink,
  RoomRecord,
} from '../lib/supabase';

export type ModalMode = 'create' | 'join' | null;

export interface RoomVideoOption {
  id: string;
  title: string;
  duration: string;
  thumbnail: string;
  youtubeId?: string;
}

const ALL_VIDEO_OPTIONS: RoomVideoOption[] = [
  ...LIBRARY_VIDEOS,
  ...FEATURED_VIDEOS,
];

interface RoomModalProps {
  mode: ModalMode;
  initialVideo: RoomVideoOption | null;
  onClose: () => void;
  onOpenRoom: (room: RoomRecord) => void;
}

function extractRoomCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('room=')) {
    try {
      const parsed = new URL(
        trimmed.startsWith('http') ? trimmed : `https://movienest.local/${trimmed}`
      );
      const param = parsed.searchParams.get('room');
      if (param) return param.trim().toUpperCase();
    } catch {
      // Fallback to raw input below
    }
  }
  return trimmed.toUpperCase();
}

export function RoomModal({ mode, initialVideo, onClose, onOpenRoom }: RoomModalProps) {
  const [roomName, setRoomName] = useState('Friday Movie Night');
  const [selectedVideoId, setSelectedVideoId] = useState(
    initialVideo?.id ?? ALL_VIDEO_OPTIONS[0].id
  );
  const [joinCode, setJoinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<RoomRecord | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialVideo) {
      setSelectedVideoId(initialVideo.id);
    }
  }, [initialVideo]);

  useEffect(() => {
    if (!mode) {
      setCreatedRoom(null);
      setErrorMsg('');
      setSubmitting(false);
      setCopied(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onClose]);

  if (!mode) return null;

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    const { room, error } = await createRoomInSupabase({
      name: roomName,
      videoId: selectedVideoId,
    });

    setSubmitting(false);

    if (error || !room) {
      setErrorMsg(error ?? 'Could not save room. Please try again.');
      return;
    }

    setCreatedRoom(room);
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = extractRoomCode(joinCode);
    if (!cleanCode) {
      setErrorMsg('Please enter a room code (for example, NEST-482).');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);

    const { room, error } = await findRoomByCode(cleanCode);

    setSubmitting(false);

    if (error) {
      setErrorMsg('Could not look up that room right now. Please try again.');
      return;
    }

    if (!room) {
      setErrorMsg('Room not found. Double-check the code and try again.');
      return;
    }

    onOpenRoom(room);
  };

  const inviteLink = createdRoom ? getInviteLink(createdRoom.code) : '';

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-2xl border border-white/15 bg-[#0D121F] p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <h2
            id="room-modal-title"
            className="font-display text-lg font-semibold text-slate-50"
          >
            {createdRoom
              ? 'Room Created'
              : mode === 'create'
                ? 'Create a Private Room'
                : 'Join a Screening Room'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {createdRoom ? (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-slate-100">{createdRoom.name}</span> is saved
                and ready. Share this invite link with your friends:
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-[#111625] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Room code</span>
                <span className="font-mono text-base font-semibold tracking-wider text-amber-400">
                  {createdRoom.code}
                </span>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-slate-400">Invite link</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-200 select-all">
                  {inviteLink}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#161D30] px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-white/30 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    <span>Copied Link</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span>Copy Invite Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenRoom(createdRoom)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer"
              >
                <span>Open Room</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : mode === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="room-name-input"
                className="block text-sm font-medium text-slate-200"
              >
                Room name
              </label>
              <input
                id="room-name-input"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Friday Movie Night"
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#111625] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>

            <div>
              <label
                htmlFor="video-select"
                className="block text-sm font-medium text-slate-200"
              >
                Choose a video
              </label>
              <select
                id="video-select"
                value={selectedVideoId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#111625] px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <optgroup label="Video Library (Free Open Movies)">
                  {LIBRARY_VIDEOS.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.title} ({video.duration})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Featured Picks">
                  {FEATURED_VIDEOS.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.title} ({video.duration})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {errorMsg && (
              <p className="text-xs text-amber-400" role="alert">
                {errorMsg}
              </p>
            )}

            <div className="pt-2 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Creating Room...' : 'Create Room'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="room-code-input"
                className="block text-sm font-medium text-slate-200"
              >
                Room code
              </label>
              <input
                id="room-code-input"
                type="text"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="e.g. NEST-482"
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#111625] px-3.5 py-2.5 font-mono text-sm uppercase text-slate-100 placeholder:normal-case placeholder:font-sans placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              {errorMsg && (
                <p className="mt-1.5 text-xs text-amber-400" role="alert">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Looking up room...' : 'Join Room'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
