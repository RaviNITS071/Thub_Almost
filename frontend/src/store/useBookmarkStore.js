/**
 * @file frontend/src/store/useBookmarkStore.js
 * @description Zustand store managing contractor-scoped saved tenders (bookmarks)
 * with optimistic UI updates, MongoDB persistence, and guest fallback.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { contractorService } from '@/services/contractor.service';

export const useBookmarkStore = create(
  persist(
    (set, get) => ({
      savedTenders: [],
      isLoading: false,

      /**
       * Check if a specific tender is bookmarked
       */
      isBookmarked: (id) => {
        if (!id) return false;
        return get().savedTenders.some((item) => (item._id || item.sourceTenderId) === id);
      },

      /**
       * Fetch authenticated contractor's saved tenders from MongoDB
       */
      fetchSavedTenders: async () => {
        try {
          set({ isLoading: true });
          const dbTenders = await contractorService.getSavedTenders();
          if (Array.isArray(dbTenders)) {
            set({ savedTenders: dbTenders, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        } catch (err) {
          set({ isLoading: false });
        }
      },

      /**
       * Sync guest/local bookmarks into the contractor's account upon sign-in
       */
      syncWithBackend: async () => {
        const localIds = get().savedTenders.map((t) => t._id || t.sourceTenderId).filter(Boolean);
        try {
          set({ isLoading: true });
          const syncedTenders = await contractorService.syncSavedTenders(localIds);
          set({ savedTenders: syncedTenders || [], isLoading: false });
        } catch (err) {
          set({ isLoading: false });
        }
      },

      /**
       * Toggle bookmark: Optimistic update + MongoDB persistence for authenticated contractor
       */
      toggleBookmark: async (tender) => {
        if (!tender) return;
        const tenderId = tender._id || tender.sourceTenderId;
        const currentSaved = get().savedTenders;
        const exists = currentSaved.some((item) => (item._id || item.sourceTenderId) === tenderId);

        // 1. Optimistic update
        if (exists) {
          set({ savedTenders: currentSaved.filter((item) => (item._id || item.sourceTenderId) !== tenderId) });
        } else {
          set({ savedTenders: [tender, ...currentSaved] });
        }

        // 2. Persist to MongoDB (authenticated via HttpOnly session cookies)
        try {
          const res = await contractorService.toggleSavedTender(tenderId);
          if (res?.success && Array.isArray(res?.data)) {
            set({ savedTenders: res.data });
          }
        } catch (err) {
          // If 401 unauthenticated, keep the optimistic local bookmark for guest
          if (err.response?.status !== 401) {
            console.warn('Failed to sync bookmark with backend:', err);
          }
        }
      },

      /**
       * Clear stored bookmarks on logout
       */
      clearBookmarks: () => {
        set({ savedTenders: [] });
      },
    }),
    { 
      name: 'tenderhub_bookmarks',
      partialize: (state) => ({ savedTenders: state.savedTenders }),
    }
  )
);