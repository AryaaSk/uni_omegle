"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ref, onValue, set, push, update, serverTimestamp } from "firebase/database";
import { getFirebaseDb } from "@/lib/firebase";
import type { Room } from "@/lib/types";

// ========================
// Constants
// ========================

const HEARTBEAT_INTERVAL_MS = 3_000;
const PEER_INACTIVE_THRESHOLD_MS = 15_000;
const PARTNER_JOIN_TIMEOUT_MS = 30_000;

// ========================
// useRoom Hook
//
// Manages the room lifecycle for an active room:
// 1. Listens for room state (deletion = disconnected)
// 2. Runs heartbeat loop (writes own timestamp every 3s)
// 3. Monitors partner's heartbeat for staleness
// 4. Monitors queue for available "Next" partner
// 5. leaveRoom = atomic delete room + clear both currentRoom
// 6. skipToNext = atomic swap: delete old room, create new room,
//    move old partner to queue, connect with new partner
// ========================

export function useRoom(roomId: string | null, uid: string | undefined, userEmail?: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [nextPartnerAvailable, setNextPartnerAvailable] = useState(false);

  const partnerHeartbeatRef = useRef<number>(0);
  const partnerEverHeartbeatRef = useRef<boolean>(false);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partnerJoinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminatedRef = useRef(false);

  // Save partner UID in a ref so leaveRoom can access it after room deletion
  const partnerUidRef = useRef<string | null>(null);
  // Save next partner UID from queue
  const nextPartnerUidRef = useRef<string | null>(null);

  const tag = userEmail || uid || "unknown";
  const log = useCallback((msg: string) => {
    console.log(`[${tag}] [room] ${msg}`);
  }, [tag]);

  // Derive partner UID from room data
  const partnerUid =
    room && uid ? room.users.find((u) => u !== uid) ?? null : null;

  // Keep ref in sync
  useEffect(() => {
    if (partnerUid) {
      partnerUidRef.current = partnerUid;
    }
  }, [partnerUid]);

  // Deterministic initiator: users array is sorted, so both clients
  // always agree on who is users[0].
  const isInitiator = room && uid ? uid === room.users[0] : false;

  // ========================
  // leaveRoom — atomic cleanup
  //
  // Deletes room + clears both users' currentRoom in one multi-path update.
  // ========================

  const leaveRoom = useCallback(
    async () => {
      if (!roomId || !uid || terminatedRef.current) return;
      terminatedRef.current = true;
      setTerminated(true);

      log(`Leaving room ${roomId}`);

      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
        stalenessIntervalRef.current = null;
      }

      const partner = partnerUidRef.current;
      const updates: Record<string, unknown> = {
        [`rooms/${roomId}`]: null,
        [`users/${uid}/currentRoom`]: null,
      };
      if (partner) {
        updates[`users/${partner}/currentRoom`] = null;
      }

      try {
        await update(ref(getFirebaseDb()), updates);
        log("Room cleanup complete");
      } catch (err) {
        log(`Room cleanup error (may already be deleted): ${err}`);
      }
    },
    [roomId, uid, log]
  );

  // ========================
  // skipToNext — atomic partner swap
  //
  // In a single multi-path update:
  // - Delete old room
  // - Create new room with the next queued partner
  // - Set self + new partner's currentRoom to new room
  // - Set old partner's currentRoom to null + add them to queue
  // - Remove new partner from queue
  //
  // Returns the new roomId synchronously (Firebase update is fire-and-forget).
  // ========================

  const skipToNext = useCallback((): string | null => {
    const nextPartner = nextPartnerUidRef.current;
    if (!roomId || !uid || !nextPartner || terminatedRef.current) return null;

    terminatedRef.current = true;
    setTerminated(true);

    if (stalenessIntervalRef.current) {
      clearInterval(stalenessIntervalRef.current);
      stalenessIntervalRef.current = null;
    }

    const newRoomId = push(ref(getFirebaseDb(), "rooms")).key!;
    const sortedUsers = [uid, nextPartner].sort() as [string, string];
    const oldPartner = partnerUidRef.current;

    log(`Skipping to next: old room ${roomId}, new room ${newRoomId}, new partner ${nextPartner}, old partner ${oldPartner}`);

    const updates: Record<string, unknown> = {
      // Delete old room
      [`rooms/${roomId}`]: null,
      // Create new room
      [`rooms/${newRoomId}/users`]: sortedUsers,
      [`rooms/${newRoomId}/${uid}/heartbeat`]: serverTimestamp(),
      // Set self's currentRoom to new room
      [`users/${uid}/currentRoom`]: newRoomId,
      // Set new partner's currentRoom to new room
      [`users/${nextPartner}/currentRoom`]: newRoomId,
      // Remove new partner from queue
      [`queue/${nextPartner}`]: null,
    };

    // Move old partner to queue
    if (oldPartner) {
      updates[`users/${oldPartner}/currentRoom`] = null;
      updates[`queue/${oldPartner}`] = true;
    }

    update(ref(getFirebaseDb()), updates)
      .then(() => log(`Skip complete — now in room ${newRoomId}`))
      .catch((err) => log(`Skip failed: ${err}`));

    return newRoomId;
  }, [roomId, uid, log]);

  // ========================
  // Room State Listener
  //
  // Watches rooms/{roomId}. When the room is deleted (data = null),
  // we know the chat has ended.
  // ========================

  useEffect(() => {
    if (!roomId || !uid) return;

    log(`Listening on room ${roomId}`);
    const roomRef = ref(getFirebaseDb(), `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.users) {
        setRoom(data as Room);
        log(`Room data received — users: [${data.users.join(", ")}]`);
      } else {
        setRoom(null);
      }

      if (!data && !terminatedRef.current) {
        log("Room deleted by partner");
        terminatedRef.current = true;
        setTerminated(true);
      }
    });

    return unsub;
  }, [roomId, uid, log]);

  // ========================
  // Heartbeat Loop
  // ========================

  useEffect(() => {
    if (!roomId || !uid || terminatedRef.current) return;

    log("Starting heartbeat");
    const heartbeatPath = ref(getFirebaseDb(), `rooms/${roomId}/${uid}/heartbeat`);

    set(heartbeatPath, serverTimestamp()).catch(() => {});

    if (userEmail) {
      set(ref(getFirebaseDb(), `rooms/${roomId}/${uid}/email`), userEmail).catch(() => {});
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (terminatedRef.current) return;
      set(heartbeatPath, serverTimestamp()).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [roomId, uid, userEmail, log]);

  // ========================
  // Partner Heartbeat Monitoring
  // ========================

  useEffect(() => {
    if (!roomId || !partnerUid || terminatedRef.current) return;

    log(`Monitoring partner ${partnerUid} heartbeat`);
    const partnerPath = ref(
      getFirebaseDb(),
      `rooms/${roomId}/${partnerUid}/heartbeat`
    );

    const unsub = onValue(partnerPath, (snapshot) => {
      if (terminatedRef.current) return;
      const val = snapshot.val() as number | null;
      if (val && val > 0) {
        partnerHeartbeatRef.current = val;
        if (!partnerEverHeartbeatRef.current) {
          log("Partner first heartbeat received");
          partnerEverHeartbeatRef.current = true;
        }
      }
    });

    stalenessIntervalRef.current = setInterval(() => {
      if (terminatedRef.current) return;
      if (!partnerEverHeartbeatRef.current) return;

      const staleness = Date.now() - partnerHeartbeatRef.current;
      if (staleness > PEER_INACTIVE_THRESHOLD_MS) {
        log(`Partner heartbeat stale (${Math.round(staleness / 1000)}s) — leaving room`);
        leaveRoom();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      unsub();
      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
        stalenessIntervalRef.current = null;
      }
    };
  }, [roomId, partnerUid, leaveRoom, log]);

  // ========================
  // Partner Join Timeout
  // ========================

  useEffect(() => {
    if (!roomId || !partnerUid || terminatedRef.current) return;

    partnerJoinTimeoutRef.current = setTimeout(() => {
      if (!partnerEverHeartbeatRef.current) {
        log("Partner never sent heartbeat — leaving room");
        leaveRoom();
      }
    }, PARTNER_JOIN_TIMEOUT_MS);

    return () => {
      if (partnerJoinTimeoutRef.current) {
        clearTimeout(partnerJoinTimeoutRef.current);
        partnerJoinTimeoutRef.current = null;
      }
    };
  }, [roomId, partnerUid, leaveRoom, log]);

  // ========================
  // Queue Monitoring (for "Next" button)
  //
  // Listens on queue/ to detect available next partners.
  // Excludes self and current partner from candidates.
  // ========================

  useEffect(() => {
    if (!roomId || !uid || terminatedRef.current) return;

    const queueRef = ref(getFirebaseDb(), "queue");
    const unsub = onValue(queueRef, (snapshot) => {
      if (terminatedRef.current) return;
      const queue = snapshot.val() as Record<string, boolean> | null;
      if (!queue) {
        nextPartnerUidRef.current = null;
        setNextPartnerAvailable(false);
        return;
      }
      const sortedKeys = Object.keys(queue).sort();
      const candidate = sortedKeys.find(
        (k) => k !== uid && k !== partnerUidRef.current
      );
      nextPartnerUidRef.current = candidate || null;
      setNextPartnerAvailable(!!candidate);
      if (candidate) {
        log(`Next partner available in queue: ${candidate}`);
      }
    });

    return unsub;
  }, [roomId, uid, log]);

  // ========================
  // Best-Effort Cleanup on Tab Close
  // ========================

  useEffect(() => {
    if (!roomId || !uid) return;

    const handleBeforeUnload = () => {
      leaveRoom();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId, uid, leaveRoom]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current)
        clearInterval(heartbeatIntervalRef.current);
      if (stalenessIntervalRef.current)
        clearInterval(stalenessIntervalRef.current);
      if (partnerJoinTimeoutRef.current)
        clearTimeout(partnerJoinTimeoutRef.current);
    };
  }, []);

  // Read partner email from room snapshot data
  const roomData = room as Record<string, unknown> | null;
  const partnerData = partnerUid && roomData ? roomData[partnerUid] as Record<string, unknown> | undefined : undefined;
  const partnerEmail = (partnerData?.email as string) || null;

  return {
    partnerUid,
    partnerEmail,
    terminated,
    leaveRoom,
    skipToNext,
    nextPartnerAvailable,
    isInitiator,
  };
}
