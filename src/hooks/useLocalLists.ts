import { useCallback, useEffect, useState } from 'react';
import {
  clearWatchHistory,
  getContinueWatchingItems,
  getHistoryItems,
  getWatchLaterItems,
  LOCAL_LIST_TOAST_EVENT,
  LOCAL_LISTS_UPDATED_EVENT,
  LocalMediaSource,
  removeHistoryItem,
  removeWatchLaterItem,
  toggleWatchLaterItem,
  WatchHistoryItem,
  WatchLaterInput,
  WatchLaterItem,
} from '../lib/localLists';

// Subscribes to device-only Watch Later and Continue Watching / History changes across components
export function useLocalLists() {
  const [watchLater, setWatchLater] = useState<WatchLaterItem[]>(() =>
    getWatchLaterItems()
  );
  const [history, setHistory] = useState<WatchHistoryItem[]>(() =>
    getHistoryItems()
  );
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>(() =>
    getContinueWatchingItems()
  );

  const refresh = useCallback(() => {
    setWatchLater(getWatchLaterItems());
    setHistory(getHistoryItems());
    setContinueWatching(getContinueWatchingItems());
  }, []);

  useEffect(() => {
    const handleUpdate = () => refresh();
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === 'movienest_watchlater' ||
        e.key === 'movienest_history'
      ) {
        refresh();
      }
    };

    window.addEventListener(LOCAL_LISTS_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LOCAL_LISTS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  const isSaved = useCallback(
    (source: LocalMediaSource, id: string) =>
      watchLater.some((item) => item.source === source && item.id === id.trim()),
    [watchLater]
  );

  const toggleWatchLater = useCallback((input: WatchLaterInput) => {
    return toggleWatchLaterItem(input);
  }, []);

  const removeFromWatchLater = useCallback(
    (source: LocalMediaSource, id: string) => {
      removeWatchLaterItem(source, id);
    },
    []
  );

  const removeFromHistory = useCallback(
    (source: LocalMediaSource, id: string) => {
      removeHistoryItem(source, id);
    },
    []
  );

  const clearAllHistory = useCallback(() => {
    clearWatchHistory();
  }, []);

  return {
    watchLater,
    history,
    continueWatching,
    isSaved,
    toggleWatchLater,
    removeFromWatchLater,
    removeFromHistory,
    clearAllHistory,
  };
}

// Listens for global "Saved to Watch Later" / "Removed from Watch Later" toast events
export function useWatchLaterToast(): string | null {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: number | null = null;

    const handleToast = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const message = typeof custom.detail === 'string' ? custom.detail : '';
      if (!message) return;

      setToastMsg(message);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        setToastMsg(null);
      }, 2400);
    };

    window.addEventListener(LOCAL_LIST_TOAST_EVENT, handleToast);
    return () => {
      window.removeEventListener(LOCAL_LIST_TOAST_EVENT, handleToast);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  return toastMsg;
}
