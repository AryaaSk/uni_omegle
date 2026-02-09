"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ref,
  onValue,
  set,
  update,
  get,
  remove,
  serverTimestamp,
} from "firebase/database";
import { getFirebaseDb } from "@/lib/firebase";
import type { Room } from "@/lib/types";

// ========================
// Constants
// ========================

const HEARTBEAT_INTERVAL_MS = 3_000; // Write heartbeat every 3 seconds
const PEER_INACTIVE_THRESHOLD_MS = 15_000; // Peer considered inactive after 15 seconds
const DELETION_GRACE_PERIOD_MS = 10_000; // Wait 10 seconds before final deletion
const PARTNER_JOIN_TIMEOUT_MS = 30_000; // If partner never starts heartbeat, re-queue

// ========================
// useRoom Hook
//
// Manages the full room lifecycle:
// 1. Listens for room state changes in RTDB
// 2. Runs a heartbeat loop (writes own timestamp every 3s)
// 3. Monitors the partner's heartbeat for staleness
// 4. Executes two-phase termination when peer goes inactive
// 5. Handles beforeunload for best-effort cleanup on tab close
// ========================

export function useRoom(roomId: string | null, uid: string | undefined, userEmail?: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [partnerOnline, setPartnerOnline] = useState(true);
  const [terminated, setTerminated] = useState(false);

  // Track the partner's last known heartbeat for staleness checks
  const partnerHeartbeatRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deletionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerJoinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminatedRef = useRef(false);

  // Derive partner UID from room data
  const partnerUid =
    room && uid ? room.users.find((u) => u !== uid) ?? null : null;

  // ========================
  // Terminate Room (Two-Phase)
  //
  // Phase 1: Mark as "terminating" — both clients see this and stop signaling.
  // Phase 2: After grace period, delete the room if still terminating.
  //
  // This prevents split-brain deletion: if both clients try to terminate
  // simultaneously, the first update wins and the second is a no-op.
  // The grace period ensures both clients have time to see the termination.
  // ========================

  const terminate = useCallback(
    async (reason: "user" | "heartbeat" | "ice-failure") => {
      if (!roomId || terminatedRef.current) return;
      terminatedRef.current = true;
      setTerminated(true);

      const roomRef = ref(getFirebaseDb(), `rooms/${roomId}`);

      try {
        // Phase 1: Mark as terminating
        await update(roomRef, {
          status: "terminating",
          terminatedBy: uid,
          terminatedAt: serverTimestamp(),
        });

        // Phase 2: Schedule final deletion after grace period
        deletionTimeoutRef.current = setTimeout(async () => {
          try {
            const snapshot = await get(roomRef);
            if (snapshot.exists() && snapshot.val().status === "terminating") {
              await remove(roomRef);
            }
          } catch {
            // Best effort — another client may have already deleted it
          }
        }, DELETION_GRACE_PERIOD_MS);
      } catch {
        // Room may have already been deleted by partner
      }
    },
    [roomId, uid]
  );

  // ========================
  // Room State Listener
  //
  // Watches rooms/{roomId} in real-time. When the room transitions
  // to "terminating" (by either client), we stop the heartbeat
  // and mark ourselves as terminated.
  // ========================

  useEffect(() => {
    if (!roomId || !uid) return;

    const roomRef = ref(getFirebaseDb(), `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snapshot) => {
      const data = snapshot.val() as Room | null;
      setRoom(data);

      if (!data) {
        // Room was deleted
        setTerminated(true);
        terminatedRef.current = true;
        return;
      }

      if (data.status === "terminating" && !terminatedRef.current) {
        // Partner initiated termination — react to it
        terminatedRef.current = true;
        setTerminated(true);
      }
    });

    return unsub;
  }, [roomId, uid]);

  // ========================
  // Heartbeat Loop
  //
  // Writes our timestamp to presence/{uid}/heartbeat every 3 seconds.
  // This is the ONLY authoritative presence mechanism — there is no
  // onDisconnect fallback. If we stop writing, the partner will detect
  // staleness and terminate the room.
  // ========================

  useEffect(() => {
    if (!roomId || !uid || terminatedRef.current) return;

    const heartbeatPath = ref(getFirebaseDb(), `rooms/${roomId}/presence/${uid}/heartbeat`);

    // Write initial heartbeat immediately (same as before — set on heartbeat path)
    set(heartbeatPath, serverTimestamp()).catch(() => {});

    // Write email to presence separately (best effort — doesn't affect heartbeat)
    if (userEmail) {
      set(ref(getFirebaseDb(), `rooms/${roomId}/presence/${uid}/email`), userEmail).catch(() => {});
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
  }, [roomId, uid, userEmail]);

  // ========================
  // Partner Heartbeat Monitoring
  //
  // Two mechanisms work together:
  // 1. onValue listener: fires when the partner's heartbeat value changes
  // 2. setInterval: re-evaluates staleness every 3s, because onValue
  //    only fires on value changes, not when time passes
  //
  // If the partner's heartbeat is stale for > 15 seconds, we trigger
  // two-phase termination.
  // ========================

  useEffect(() => {
    if (!roomId || !partnerUid || terminatedRef.current) return;

    const partnerPath = ref(
      getFirebaseDb(),
      `rooms/${roomId}/presence/${partnerUid}/heartbeat`
    );

    // Listen for heartbeat value changes
    const unsub = onValue(partnerPath, (snapshot) => {
      const val = snapshot.val() as number | null;
      if (val && val > 0) {
        partnerHeartbeatRef.current = val;
        setPartnerOnline(true);
      }
    });

    // Periodically check if the heartbeat has gone stale
    stalenessIntervalRef.current = setInterval(() => {
      if (terminatedRef.current) return;

      const staleness = Date.now() - partnerHeartbeatRef.current;
      if (staleness > PEER_INACTIVE_THRESHOLD_MS) {
        setPartnerOnline(false);
        terminate("heartbeat");
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      unsub();
      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
        stalenessIntervalRef.current = null;
      }
    };
  }, [roomId, partnerUid, terminate]);

  // ========================
  // Partner Join Timeout
  //
  // If the partner's heartbeat never appears within 30 seconds
  // of room creation, the room is stale (partner never connected).
  // Terminate and let the chat page re-queue.
  // ========================

  useEffect(() => {
    if (!roomId || !partnerUid || terminatedRef.current) return;

    partnerJoinTimeoutRef.current = setTimeout(() => {
      // Check if partner ever wrote a real heartbeat
      if (partnerHeartbeatRef.current <= 0) {
        terminate("heartbeat");
      }
    }, PARTNER_JOIN_TIMEOUT_MS);

    return () => {
      if (partnerJoinTimeoutRef.current) {
        clearTimeout(partnerJoinTimeoutRef.current);
        partnerJoinTimeoutRef.current = null;
      }
    };
  }, [roomId, partnerUid, terminate]);

  // ========================
  // Best-Effort Cleanup on Tab Close
  //
  // beforeunload is unreliable for async operations, but we try.
  // The real safety net is the heartbeat timeout — if we disappear,
  // the partner detects staleness within 15 seconds.
  // ========================

  useEffect(() => {
    if (!roomId || !uid) return;

    const handleBeforeUnload = () => {
      terminate("user");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId, uid, terminate]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current)
        clearInterval(heartbeatIntervalRef.current);
      if (stalenessIntervalRef.current)
        clearInterval(stalenessIntervalRef.current);
      if (deletionTimeoutRef.current)
        clearTimeout(deletionTimeoutRef.current);
      if (partnerJoinTimeoutRef.current)
        clearTimeout(partnerJoinTimeoutRef.current);
    };
  }, []);

  // Derive partner's email from room presence data
  const partnerEmail = partnerUid && room?.presence?.[partnerUid]?.email || null;

  return {
    room,
    partnerUid,
    partnerEmail,
    partnerOnline,
    terminated,
    terminate,
  };
}
