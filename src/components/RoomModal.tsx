import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Play, Share2, Users, X } from 'lucide-react';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import { copyTextToClipboard, ShareTarget } from '../lib/share';
import { fetchArchiveMovieDetails, isValidArchiveDownloadUrl } from '../lib/archive';
import {
  createRoomInSupabase,
  findRoomByCode,
  getInviteLink,
  isRoomHost,
  isValidRoomCode,
  ROOM_NAME_MAX_LENGTH,
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
  source?: 'youtube' | 'archive';
  videoUrl?: string;
  positionSeconds?: number;
}

interface RoomModalProps {
  mode: ModalMode;
  initialVideo: RoomVideoOption | null;
  initialPositionSeconds?: number;
  sharedLibrary: SharedLibraryItem[];
  onClose: () => void;
  onOpenRoom: (room: RoomRecord) => void;
  onWatchAlone: (videoId: string, source?: 'youtube' | 'archive') => void;
  onShareRoom: (target: ShareTarget) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

const EMPTY_LIBRARY: SharedLibraryItem[] = [];

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
  initialPositionSeconds = 0,
  sharedLibrary,
  onClose,
  onOpenRoom,
  onWatchAlone,
  onShareRoom,
  onSavedToLibrary,
}: RoomModalProps) {
  const safeLibrary = Array.isArray(sharedLibrary) ? sharedLibrary : EMPTY_LIBRARY;
  const [roomName, setRoomName] = useState('Friday Movie Night');
  const [selectedVideoId, setSelectedVideoId] = useState(
    initialVideo?.youtubeId ?? initialVideo?.id ?? LIBRARY_VIDEOS[0]?.youtubeId ?? ''
  );
  const [joinCode, setJoinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<RoomRecord | null>(null);
  const [createdVideoTitle, setCreatedVideoTitle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync selected video whenever modal opens with a specific video or resets
  useEffect(() => {
    if (mode === 'create') {
      if (initialVideo) {
        setSelectedVideoId(initialVideo.youtubeId ?? initialVideo.id);
      } else {
        setSelectedVideoId(
          safeLibrary[0]?.video_id ?? LIBRARY_VIDEOS[0]?.youtubeId ?? ''
        );
      }
    }
  }, [mode, initialVideo, safeLibrary]);

  useEffect(() => {
    if (!mode) {
      setCreatedRoom(null);
      setCreatedVideoTitle(null);
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

  const resolveVideoTitle = (videoIdToLookup: string): string => {
    if (
      initialVideo &&
      (initialVideo.youtubeId === videoIdToLookup || initialVideo.id === videoIdToLookup)
    ) {
      return initialVideo.title;
    }
    const fromShared = safeLibrary.find((i) => i.video_id === videoIdToLookup);
    if (fromShared) return fromShared.title;
    const fromLib = LIBRARY_VIDEOS.find(
      (v) => v.youtubeId === videoIdToLookup || v.id === videoIdToLookup
    );
    if (fromLib) return fromLib.title;
    const fromFeat = FEATURED_VIDEOS.find(
      (v) => v.youtubeId === videoIdToLookup || v.id === videoIdToLookup
    );
    if (fromFeat) return fromFeat.title;
    return roomName.trim() || 'Movie Night';
  };

  const createRoomForVideoId = async (
    videoIdToSave: string,
    explicitTitle?: string,
    overrideSource?: 'youtube' | 'archive',
    overrideVideoUrl?: string
  ) => {
    setErrorMsg('');
    setSubmitting(true);

    const trimmedRoomName = roomName.trim();
    if (!trimmedRoomName || trimmedRoomName.length > ROOM_NAME_MAX_LENGTH) {
      setSubmitting(false);
      setErrorMsg(`Please enter a room name between 1 and ${ROOM_NAME_MAX_LENGTH} characters.`);
      return;
    }

    const isSelectedInitial =
      initialVideo &&
      (initialVideo.youtubeId === videoIdToSave || initialVideo.id === videoIdToSave);
    const resolvedSource: 'youtube' | 'archive' =
      overrideSource ?? (isSelectedInitial ? initialVideo?.source ?? 'youtube' : 'youtube');

    let resolvedVideoUrl: string | null =
      overrideVideoUrl ?? (isSelectedInitial ? initialVideo?.videoUrl ?? null : null);
    let resolvedTitle = explicitTitle ?? resolveVideoTitle(videoIdToSave);

    // For Internet Archive movies, resolve the first .mp4 URL before saving the room
    if (resolvedSource === 'archive') {
      if (!resolvedVideoUrl) {
        const details = await fetchArchiveMovieDetails(videoIdToSave);
        if (!details.mp4Url || !isValidArchiveDownloadUrl(details.mp4Url)) {
          setSubmitting(false);
          setErrorMsg(
            "This Archive movie doesn't have a playable MP4 file. Please pick another movie."
          );
          return;
        }
        resolvedVideoUrl = details.mp4Url;
        if (details.title && !explicitTitle) {
          resolvedTitle = details.title;
        }
      } else if (!isValidArchiveDownloadUrl(resolvedVideoUrl)) {
        setSubmitting(false);
        setErrorMsg('This Archive video link is not supported.');
        return;
      }
    }

    const { room, error } = await createRoomInSupabase({
      name: roomName,
      videoId: videoIdToSave,
      source: resolvedSource,
      videoUrl: resolvedVideoUrl,
      positionSeconds: isSelectedInitial ? initialPositionSeconds : 0,
    });

    setSubmitting(false);

    // Only advance when the Supabase insert succeeds and returns a valid room record
    if (error || !room || !room.id || !room.code) {
      setErrorMsg(error ?? 'Could not save room. Please try again.');
      return;
    }

    setCreatedVideoTitle(resolvedTitle);
    setCreatedRoom(room);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await createRoomForVideoId(selectedVideoId);
  };

  // Triggered when user clicks "Create Room with this" inside the modal's Paste-a-Link bar
  const handleCreateWithPastedYouTube = async (pasted: PastedYouTubeVideo) => {
    setSelectedVideoId(pasted.videoId);
    await createRoomForVideoId(pasted.videoId, pasted.title, 'youtube');
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = extractRoomCode(joinCode);
    if (!isValidRoomCode(cleanCode)) {
      setErrorMsg('Please enter a valid room code like NEST-7K4M2Q.');
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

    if (room.locked && !isRoomHost(room)) {
      setErrorMsg('This room is locked.');
      return;
    }

    onOpenRoom(room);
  };

  const inviteLink = createdRoom ? getInviteLink(createdRoom.code) : '';

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    const ok = await copyTextToClipboard(inviteLink);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareInviteLink = () => {
    if (!inviteLink || !createdRoom) return;
    onShareRoom({
      kind: 'room',
      title: createdVideoTitle ?? createdRoom.name,
      roomCode: createdRoom.code,
      url: inviteLink,
    });
  };

  // Check if selectedVideoId is already represented in one of the dropdown lists
  const isKnownDropdownOption =
    safeLibrary.some((item) => item.video_id === selectedVideoId) ||
    LIBRARY_VIDEOS.some(
      (v) => v.id === selectedVideoId || v.youtubeId === selectedVideoId
    ) ||
    FEATURED_VIDEOS.some(
      (v) => v.id === selectedVideoId || v.youtubeId === selectedVideoId
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-[#3a322a] pb-4">
          <h2
            id="room-modal-title"
            className="text-lg font-bold text-[#f4ece1]"
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
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {createdRoom ? (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm text-[#b9aa98]">
                <span className="font-bold text-[#f4ece1]">{createdRoom.name}</span> is saved and
                ready. Share this invite link with your friends:
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#3a322a] bg-[#14110f] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#b9aa98]">Room code</span>
                <span className="font-mono text-base font-bold tracking-wider text-[#f2a33a]">
                  {createdRoom.code}
                </span>
              </div>

              <div className="border-t border-[#3a322a] pt-3">
                <p className="text-xs text-[#b9aa98]">Invite link</p>
                <p className="mt-1 break-all font-mono text-xs text-[#f4ece1] select-all">
                  {inviteLink}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                      <span>Copied Link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleShareInviteLink}
                  className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                  <span>Share</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (createdRoom?.id && createdRoom?.code) {
                    onOpenRoom(createdRoom);
                  }
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
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
                  className="block text-sm font-medium text-[#f4ece1]"
                >
                  Room name
                </label>
                <input
                  id="room-name-input"
                  type="text"
                  maxLength={ROOM_NAME_MAX_LENGTH}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Friday Movie Night"
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#3a322a] bg-[#14110f] px-3.5 py-2.5 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="video-select"
                  className="block text-sm font-medium text-[#f4ece1]"
                >
                  Choose a video
                </label>
                <select
                  id="video-select"
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-[#3a322a] bg-[#14110f] px-3.5 py-2.5 text-sm text-[#f4ece1] focus:border-[#f2a33a] focus:outline-none"
                >
                  {!isKnownDropdownOption && initialVideo && (
                    <optgroup
                      label={
                        initialVideo.source === 'archive'
                          ? 'Selected Internet Archive Movie'
                          : 'Selected YouTube Video'
                      }
                    >
                      <option value={initialVideo.youtubeId ?? initialVideo.id}>
                        {initialVideo.title}
                      </option>
                    </optgroup>
                  )}
                  {safeLibrary.length > 0 && (
                    <optgroup label="Shared Library">
                      {safeLibrary.map((item) => (
                        <option key={item.id} value={item.video_id}>
                          {item.title} ({item.category})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Open Movies">
                    {LIBRARY_VIDEOS.map((video) => (
                      <option key={video.id} value={video.youtubeId}>
                        {video.title} ({video.category})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Featured Picks">
                    {FEATURED_VIDEOS.map((video) => (
                      <option key={video.id} value={video.youtubeId}>
                        {video.title} ({video.genre})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {errorMsg && (
                <p className="text-xs font-medium text-[#f2a33a]" role="alert">
                  {errorMsg}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const isSelectedInitial =
                      initialVideo &&
                      (initialVideo.youtubeId === selectedVideoId ||
                        initialVideo.id === selectedVideoId);
                    onWatchAlone(
                      selectedVideoId,
                      isSelectedInitial ? initialVideo?.source : 'youtube'
                    );
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <Play className="h-4 w-4 text-[#f2a33a] fill-current" aria-hidden="true" />
                  <span>Watch Alone instead</span>
                </button>

                <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[44px] rounded-full border border-[#3a322a] px-4 py-2.5 text-sm font-medium text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-60 cursor-pointer"
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    <span>{submitting ? 'Creating Room...' : 'Watch Together'}</span>
                  </button>
                </div>
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
                className="block text-sm font-medium text-[#f4ece1]"
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
                className="mt-1.5 w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 font-mono text-sm text-[#f4ece1] placeholder:font-sans placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
              />
              {errorMsg && (
                <p className="mt-1.5 text-xs font-medium text-[#f2a33a]" role="alert">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-full border border-[#3a322a] px-5 py-2.5 text-sm font-medium text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-60 cursor-pointer"
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
