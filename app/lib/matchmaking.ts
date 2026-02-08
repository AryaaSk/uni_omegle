"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ref,
  set,
  remove,
  update,
  onValue,
  runTransaction,
  serverTimestamp,
  get,
  Unsubscribe,
} from "firebase/database";
import { db } from "@/lib/firebase";
import type { MatchmakingStatus, Lock, QueueEntry } from "@/lib/types";

// ========================
// Constants
// ========================

const STALE_LOCK_THRESHOLD_MS = 10_000; // Locks older than 10s are considered stale

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
// Lock Transaction
//
// Only one client may hold the lock at a time.
// If the lock is stale (claimed > 10s ago), we override it.
// The transaction guarantees atomicity — no two clients
// can both win the lock simultaneously.
// ========================

async function attemptLock(uid: string): Promise<boolean> {
  const lockRef = ref(db, "lock");
  const result = await runTransaction(lockRef, (current: Lock | null) => {
    if (current === null) {
      // Lock node doesn't exist yet — claim it
      return { claimed: true, by: uid, claimedAt: Date.now() };
    }

    if (current.claimed) {
      // Check if stale (winner crashed before releasing)
      if (current.claimedAt && Date.now() - current.claimedAt > STALE_LOCK_THRESHOLD_MS) {
        // Override stale lock
        return { claimed: true, by: uid, claimedAt: Date.now() };
      }
      // Lock is active — abort
      return undefined;
    }

    // Lock is unclaimed — claim it
    return { claimed: true, by: uid, claimedAt: Date.now() };
  });

  return result.committed;
}

// ========================
// Room Creation + Match Notification
//
// After winning the lock, the winner:
// 1. Creates the room in RTDB
// 2. Writes the roomId to matches/{partnerUid} so the partner discovers the room
// 3. Removes both users from the queue atomically
// 4. Releases the lock
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
      [partnerUid]: { heartbeat: 0 }, // Partner will start their heartbeat when they join
    },
  });

  // 2. Notify both users of their room assignment
  // Both need this so either can rejoin on page refresh
  await set(ref(db, `matches/${partnerUid}`), roomId);
  await set(ref(db, `matches/${uid}`), roomId);

  // 3. Remove both users from queue atomically
  await update(ref(db), {
    [`queue/${uid}`]: null,
    [`queue/${partnerUid}`]: null,
  });

  // 4. Release the lock
  await set(ref(db, "lock"), {
    claimed: false,
    by: null,
    claimedAt: null,
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
// When >= 2 users exist, the client attempts to claim the lock.
// If it wins, it creates the room and transitions to "matched".
// If it loses, it stays in "queued" and waits for either:
// - Another queue change (to try again)
// - A match notification from the winner
// ========================

export function useMatchmaking(uid: string | undefined) {
  const [status, setStatus] = useState<MatchmakingStatus>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track whether we're currently attempting a lock to prevent concurrent attempts
  const attemptingRef = useRef(false);
  // Store unsubscribe functions for cleanup
  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  // Cleanup all listeners
  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  // Start searching for a match
  const startSearching = useCallback(async () => {
    if (!uid) return;

    setError(null);
    setRoomId(null);
    cleanup();

    try {
      // Join the queue
      await joinQueue(uid);
      setStatus("queued");

      // Watch for match notifications (in case another user matches us)
      const matchRef = ref(db, `matches/${uid}`);
      const matchUnsub = onValue(matchRef, async (snapshot) => {
        const matchedRoomId = snapshot.val() as string | null;
        if (matchedRoomId) {
          // We were matched by another user
          cleanup();
          // Clean up the match notification
          await remove(ref(db, `matches/${uid}`));
          setRoomId(matchedRoomId);
          setStatus("matched");
        }
      });
      unsubscribesRef.current.push(matchUnsub);

      // Watch the queue for potential matches
      const queueRef = ref(db, "queue");
      const queueUnsub = onValue(queueRef, async (snapshot) => {
        // If we're already matched or attempting, skip
        if (attemptingRef.current) return;

        const queue = snapshot.val() as Record<string, QueueEntry> | null;
        if (!queue) return;

        const entries = Object.entries(queue);
        if (entries.length < 2) return;

        // Sort by joinedAt to pick the earliest partner
        entries.sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));

        // Find the first user that isn't us
        const partner = entries.find(([entryUid]) => entryUid !== uid);
        if (!partner) return;

        const partnerUid = partner[0];

        // Attempt to claim the lock
        attemptingRef.current = true;
        setStatus("matching");

        try {
          const won = await attemptLock(uid);

          if (won) {
            // We won — create the room and notify partner
            const newRoomId = await createRoomAndNotify(uid, partnerUid);
            cleanup();
            setRoomId(newRoomId);
            setStatus("matched");
          } else {
            // Lost the lock — go back to queued, wait for next event
            setStatus("queued");
          }
        } catch (err) {
          console.error("Match attempt failed:", err);
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

  // Stop searching and leave the queue
  const stopSearching = useCallback(async () => {
    if (!uid) return;
    cleanup();
    attemptingRef.current = false;
    try {
      await leaveQueue(uid);
      // Also clean up any stale match notification
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
      // Best-effort: remove from queue if still queued
      if (uid) {
        leaveQueue(uid).catch(() => {});
        remove(ref(db, `matches/${uid}`)).catch(() => {});
      }
    };
  }, [uid, cleanup]);

  return { status, roomId, error, startSearching, stopSearching };
}
