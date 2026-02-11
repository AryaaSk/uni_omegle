"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { ref, onValue, get, set } from "firebase/database";
import { useRouter, usePathname } from "next/navigation";
import { getFirebaseDb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

// ========================
// CurrentRoom Context
//
// App-wide listener on users/{uid}/currentRoom.
// When currentRoom becomes non-null:
//   1. Verify the room still exists
//   2. If yes → expose roomId, redirect to /chat if not already there
//   3. If no  → stale reference, clean up to null
// ========================

interface CurrentRoomContextValue {
  currentRoomId: string | null;
}

const CurrentRoomContext = createContext<CurrentRoomContextValue | null>(null);

export function CurrentRoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const email = user?.email;
  const router = useRouter();
  const pathname = usePathname();

  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  const tag = email || uid || "unknown";
  const log = useCallback((msg: string) => {
    console.log(`[${tag}] [currentRoom] ${msg}`);
  }, [tag]);

  useEffect(() => {
    if (!uid) {
      setCurrentRoomId(null);
      return;
    }

    log("Starting currentRoom listener");
    const currentRoomRef = ref(getFirebaseDb(), `users/${uid}/currentRoom`);

    const unsub = onValue(currentRoomRef, async (snapshot) => {
      const roomId = snapshot.val() as string | null;

      if (!roomId) {
        log("currentRoom is null");
        setCurrentRoomId(null);
        return;
      }

      log(`currentRoom changed to ${roomId} — verifying room exists`);

      // Verify room still exists before accepting
      try {
        const roomSnap = await get(ref(getFirebaseDb(), `rooms/${roomId}`));
        if (roomSnap.exists()) {
          log(`Room ${roomId} verified — setting active`);
          setCurrentRoomId(roomId);
        } else {
          log(`Room ${roomId} no longer exists — cleaning up stale reference`);
          setCurrentRoomId(null);
          set(currentRoomRef, null).catch(() => {});
        }
      } catch (err) {
        log(`Room verification failed: ${err} — cleaning up`);
        setCurrentRoomId(null);
        set(currentRoomRef, null).catch(() => {});
      }
    });

    return unsub;
  }, [uid, log]);

  // Redirect to /chat when currentRoomId becomes non-null and not already there
  useEffect(() => {
    if (currentRoomId && pathname !== "/chat") {
      log(`Redirecting to /chat (was on ${pathname})`);
      router.push("/chat");
    }
  }, [currentRoomId, pathname, router, log]);

  return (
    <CurrentRoomContext.Provider value={{ currentRoomId }}>
      {children}
    </CurrentRoomContext.Provider>
  );
}

// ========================
// useCurrentRoom Hook
// ========================

export function useCurrentRoom(): CurrentRoomContextValue {
  const context = useContext(CurrentRoomContext);
  if (!context) {
    throw new Error("useCurrentRoom must be used within a CurrentRoomProvider");
  }
  return context;
}
