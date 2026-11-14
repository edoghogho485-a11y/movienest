import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, X } from 'lucide-react';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import {
  createRoomInSupabase,
  findRoomByCode,
  getInviteLink,
  RoomRecord,
  SharedLibraryItem,
} from '../lib/supabase';
import { PastedYouTubeVideo, PasteYouTubeBar } from './PasteYouTubeBar';

export type ModalMode = 'create' | 'join' | null;

export interface RoomVideoOption {
  id: string;
  title: string;
  duration?: string;
  thumbnail: string;
  youtubeId?: string;
}

interface RoomModalProps {
  mode: ModalMode;
  initialVideo: RoomVideoOption | null;
  sharedLibrary: SharedLibraryItem[];
  onClose: () => void;
  onOpenRoom: (room: RoomRecord) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
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

export function RoomModal({
  mode,
  initialVideo,
  sharedLibrary,
  onClose,
  onOpenRoom,
  onSavedToLibrary,
}: RoomModalProps) {
  const [roomName, setRoomName] = useState('Friday Movie Night');
  const [selectedVideoId, setSelectedVideoId] = useState(
    initialVideo?.youtubeId ?? initialVideo?.id ?? LIBRARY_VIDEOS[0].id
  );
  const [joinCode, setJoinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<RoomRecord | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync selected video whenever modal opens with a specific video or resets
  useEffect(() => {
    if (mode === 'create') {
      if (initialVideo) {
        setSelectedVideoId(initialVideo.youtubeId ?? initialVideo.id);
      } else {
        setSelectedVideoId(
          sharedLibrary[0]?.video_id ?? LIBRARY_VIDEOS[0].id
        );
      }
    }
  }, [mode, initialVideo, sharedLibrary]);

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

  const createRoomForVideoId = async (videoIdToSave: string) => {
    setErrorMsg('');
    setSubmitting(true);

    const { room, error } = await createRoomInSupabase({
      name: roomName,
      videoId: videoIdToSave,
    });

    setSubmitting(false);

    if (error || !room) {
      setErrorMsg(error ?? 'Could not save room. Please try again.');
      return;
    }

    setCreatedRoom(room);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await createRoomForVideoId(selectedVideoId);
  };

  // Triggered when user clicks "Create Room with this" inside the modal's Paste-a-Link bar
  const handleCreateWithPastedYouTube = async (pasted: PastedYouTubeVideo) => {
    setSelectedVideoId(pasted.videoId);
    await createRoomForVideoId(pasted.videoId);
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
      // Clipboard API unavailable
    }
  };

  // Check if selectedVideoId is already represented in one of the dropdown lists
  const isKnownDropdownOption =
    sharedLibrary.some((item) => item.video_id === selectedVideoId) ||
    LIBRARY_VIDEOS.some(
      (v) => v.id === selectedVideoId || v.youtubeId === selectedVideoId
    ) ||
    FEATURED_VIDEOS.some(
      (v) => v.id === selectedVideoId || v.youtubeId === selectedVideoId
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-[#111116] p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <h2
            id="room-modal-title"
            className="font-display text-lg font-semibold text-white"
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
            className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {createdRoom ? (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm text-zinc-300">
                <span className="font-semibold text-white">{createdRoom.name}</span> is saved and
                ready. Share this invite link with your friends:
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-white/10 bg-[#181820] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-400">Room code</span>
                <span className="font-mono text-base font-semibold tracking-wider text-[#E50914]">
                  {createdRoom.code}
                </span>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-zinc-400">Invite link</p>
                <p className="mt-1 break-all font-mono text-xs text-zinc-200 select-all">
                  {inviteLink}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#181820] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
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
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(229,9,20,0.3)] transition-colors hover:bg-[#F40612] cursor-pointer"
              >
                <span>Open Room</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : mode === 'create' ? (
          <div className="mt-5 space-y-4">
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="room-name-input"
                  className="block text-sm font-medium text-zinc-200"
                >
                  Room name
                </label>
                <input
                  id="room-name-input"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Friday Movie Night"
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#08080A] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
                />
              </div>

              <div>
                <label
                  htmlFor="video-select"
                  className="block text-sm font-medium text-zinc-200"
                >
                  Choose a video
                </label>
                <select
                  id="video-select"
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#08080A] px-3.5 py-2.5 text-sm text-white focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
                >
                  {!isKnownDropdownOption && initialVideo && (
                    <optgroup label="Selected YouTube Video">
                      <option value={initialVideo.youtubeId ?? initialVideo.id}>
                        {initialVideo.title}
                      </option>
                    </optgroup>
                  )}
                  {sharedLibrary.length > 0 && (
                    <optgroup label="Shared Library">
                      {sharedLibrary.map((item) => (
                        <option key={item.id} value={item.video_id}>
                          {item.title} ({item.category})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Sample Videos (Free Open Movies)">
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
                <p className="text-xs text-[#F87171]" role="alert">
                  {errorMsg}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Creating Room...' : 'Create Room'}
                </button>
              </div>
            </form>

            {/* Paste-a-Link bar inside the Create Room pop-up */}
            <PasteYouTubeBar
              variant="modal"
              inputId="modal-paste-youtube-input"
              onCreateRoomWithVideo={handleCreateWithPastedYouTube}
              onSavedToLibrary={(savedItem) => {
                onSavedToLibrary(savedItem);
                setSelectedVideoId(savedItem.video_id);
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="room-code-input"
                className="block text-sm font-medium text-zinc-200"
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
                placeholder="e.g. NEST-7K4M2Q"
                className="mt-1.5 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#08080A] px-3.5 py-2.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
              />
              {errorMsg && (
                <p className="mt-1.5 text-xs text-[#F87171]" role="alert">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] disabled:opacity-60 cursor-pointer"
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
