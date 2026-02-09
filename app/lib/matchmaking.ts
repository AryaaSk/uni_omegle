"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ref,
  set,
  remove,
  update,
  onValue,
  serverTimestamp,
  Unsubscribe,
} from "firebase/database";
import { db } from "@/lib/firebase";
import type { MatchmakingStatus, QueueEntry } from "@/lib/types";

// ========================
// Helper: Compute deterministic room ID
// ========================

function computeRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

// ========================
// Queue Operations
// ========================

async function joinQueue(uid: string): Promise<void> {
  await set(ref(db, `queue/${uid}`), {
    joinedAt: serverTimestamp(),
  });
}

async function leaveQueue(uid: string): Promise<void> {
  await remove(ref(db, `queue/${uid}`));
}

// ========================
// Room Creation + Notification
//
// When a client sees >= 2 users in the queue, it:
// 1. Creates the room in RTDB
// 2. Writes the roomId to matches/{uid} for both users
// 3. Removes both users from the queue
//
// The room ID is deterministic (sorted UIDs), so even if both
// clients try to create the room simultaneously, they write
// identical data — the second write is effectively a no-op.
// ========================

async function createRoomAndNotify(
  uid: string,
  partnerUid: string
): Promise<string> {
  const roomId = computeRoomId(uid, partnerUid);

  // 1. Create the room
  await set(ref(db, `rooms/${roomId}`), {
    users: [uid, partnerUid].sort(),
    owner: uid,
    status: "active",
    createdAt: serverTimestamp(),
    presence: {
      [uid]: { heartbeat: serverTimestamp() },
      [partnerUid]: { heartbeat: 0 },
    },
  });

  // 2. Notify both users of their room assignment
  await set(ref(db, `matches/${partnerUid}`), roomId);
  await set(ref(db, `matches/${uid}`), roomId);

  // 3. Remove both users from queue atomically
  await update(ref(db), {
    [`queue/${uid}`]: null,
    [`queue/${partnerUid}`]: null,
  });

  return roomId;
}

// ========================
// useMatchmaking Hook
//
// State machine: idle → queued → matching → matched
//
// In "queued" state, the client:
// - Watches the queue for >= 2 users
// - Watches matches/{ownUid} in case another user matched them
//
// When >= 2 users exist, the client picks a partner and creates
// the room directly. Since room IDs are deterministic, duplicate
// creation attempts are safe.
// ========================

export function useMatchmaking(uid: string | undefined) {
  const [status, setStatus] = useState<MatchmakingStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track whether we're currently attempting to create a room
  const attemptingRef = useRef(false);
  // Store unsubscribe functions for cleanup
  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const startSearching = useCallback(async () => {
    if (!uid) return;

    setError(null);
    setRoomId(null);
    cleanup();

    try {
      await joinQueue(uid);
      setStatus("queued");

      // Watch for match notifications (in case another user matches us)
      const matchRef = ref(db, `matches/${uid}`);
      const matchUnsub = onValue(matchRef, async (snapshot) => {
        const matchedRoomId = snapshot.val() as string | null;
        if (matchedRoomId) {
          cleanup();
          setRoomId(matchedRoomId);
          setStatus("matched");
        }
      });
      unsubscribesRef.current.push(matchUnsub);

      // Watch the queue for potential matches
      const queueRef = ref(db, "queue");
      const queueUnsub = onValue(queueRef, async (snapshot) => {
        if (attemptingRef.current) return;

        const queue = snapshot.val() as Record<string, QueueEntry> | null;
        if (!queue) return;

        const entries = Object.entries(queue);
        if (entries.length < 2) return;

        // Sort by joinedAt to pick the earliest partner
        entries.sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));

        const partner = entries.find(([entryUid]) => entryUid !== uid);
        if (!partner) return;

        const partnerUid = partner[0];

        attemptingRef.current = true;
        setStatus("matching");

        try {
          const newRoomId = await createRoomAndNotify(uid, partnerUid);
          cleanup();
          setRoomId(newRoomId);
          setStatus("matched");
        } catch (err) {
          console.error("Room creation failed:", err);
          setStatus("queued");
        } finally {
          attemptingRef.current = false;
        }
      });
      unsubscribesRef.current.push(queueUnsub);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to join queue";
      setError(message);
      setStatus("idle");
    }
  }, [uid, cleanup]);

  const stopSearching = useCallback(async () => {
    if (!uid) return;
    cleanup();
    attemptingRef.current = false;
    try {
      await leaveQueue(uid);
      await remove(ref(db, `matches/${uid}`));
    } catch {
      // Best effort cleanup
    }
    setRoomId(null);
    setStatus("idle");
  }, [uid, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (uid) {
        leaveQueue(uid).catch(() => {});
        remove(ref(db, `matches/${uid}`)).catch(() => {});
      }
    };
  }, [uid, cleanup]);

  return { status, roomId, error, startSearching, stopSearching };
}
