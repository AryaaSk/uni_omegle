"use client";

import { useState, useCallback, useRef } from "react";
import {
  ref,
  set,
  push,
  remove,
  update,
  onValue,
  off,
  serverTimestamp,
} from "firebase/database";
import { getFirebaseDb } from "@/lib/firebase";

// ========================
// Matchmaking Hook — Queue-Based
//
// Handles queue operations only. The global CurrentRoomProvider
// listens on users/{uid}/currentRoom and drives room entry.
//
// Flow:
// 1. startSearching() → add to queue, listen for queue changes
// 2. Queue listener fires → find first non-self UID (sorted keys)
// 3. If selfUid < partnerUid alphabetically → create room
//    (deterministic: both clients agree on who creates)
// 4. Room creation is a single atomic multi-path update that
//    creates the room, sets both users' currentRoom, and clears queue
// 5. CurrentRoomProvider picks up the change → redirect + connected
// ========================

async function createRoomAndNotify(uid: string, partnerUid: string, log: (msg: string) => void): Promise<void> {
  const roomId = push(ref(getFirebaseDb(), "rooms")).key!;
  const sortedUsers = [uid, partnerUid].sort() as [string, string];

  log(`Creating room ${roomId} with partner ${partnerUid}`);

  await update(ref(getFirebaseDb()), {
    [`rooms/${roomId}/users`]: sortedUsers,
    [`rooms/${roomId}/${uid}/heartbeat`]: serverTimestamp(),
    [`users/${uid}/currentRoom`]: roomId,
    [`users/${partnerUid}/currentRoom`]: roomId,
    [`queue/${uid}`]: null,
    [`queue/${partnerUid}`]: null,
  });

  log(`Room ${roomId} created successfully`);
}

export function useMatchmaking(uid: string | undefined, email: string | undefined) {
  const [isSearching, setIsSearching] = useState(false);

  const matchedRef = useRef(false);
  const queueListenerRef = useRef<ReturnType<typeof ref> | null>(null);

  const tag = email || uid || "unknown";
  const log = useCallback((msg: string) => {
    console.log(`[${tag}] [matchmaking] ${msg}`);
  }, [tag]);

  const cleanup = useCallback(() => {
    if (queueListenerRef.current) {
      off(queueListenerRef.current);
      queueListenerRef.current = null;
    }
  }, []);

  const startSearching = useCallback(async () => {
    if (!uid) return;

    matchedRef.current = false;
    cleanup();
    setIsSearching(true);

    log("Joining queue");

    try {
      // Add self to queue
      await set(ref(getFirebaseDb(), `queue/${uid}`), true);
      log("Added to queue");

      // Listen for queue changes
      const queueRef = ref(getFirebaseDb(), "queue");
      queueListenerRef.current = queueRef;

      onValue(queueRef, async (snapshot) => {
        if (matchedRef.current) return;

        const queue = snapshot.val() as Record<string, boolean> | null;
        if (!queue) return;

        // Sort keys for deterministic ordering
        const sortedKeys = Object.keys(queue).sort();
        log(`Queue update: ${sortedKeys.length} users [${sortedKeys.join(", ")}]`);

        const partnerUid = sortedKeys.find((k) => k !== uid);
        if (!partnerUid) {
          log("No partner in queue yet");
          return;
        }

        // Only the alphabetically-first UID creates the room
        if (uid > partnerUid) {
          log(`Partner ${partnerUid} found — they are responsible for room creation`);
          return;
        }

        // Prevent double-creation
        if (matchedRef.current) return;
        matchedRef.current = true;

        log(`Partner ${partnerUid} found — I am responsible for room creation`);

        try {
          await createRoomAndNotify(uid, partnerUid, log);
          cleanup();
          setIsSearching(false);
        } catch (err) {
          log(`Room creation failed: ${err}`);
          matchedRef.current = false;
        }
      });
    } catch (err) {
      log(`Failed to join queue: ${err}`);
      setIsSearching(false);
    }
  }, [uid, cleanup, log]);

  const stopSearching = useCallback(async () => {
    if (!uid) return;
    log("Stopping search");
    matchedRef.current = false;
    cleanup();
    setIsSearching(false);
    try {
      await remove(ref(getFirebaseDb(), `queue/${uid}`));
      log("Removed from queue");
    } catch {
      // Best effort
    }
  }, [uid, cleanup, log]);

  return { isSearching, startSearching, stopSearching };
}
