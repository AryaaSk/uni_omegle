"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useMatchmaking } from "@/lib/matchmaking";
import { ref, get, remove, update, serverTimestamp } from "firebase/database";
import { db } from "@/lib/firebase";
import AuthGuard from "@/components/AuthGuard";
import VideoChat from "@/components/VideoChat";
import Navbar from "@/components/Navbar";
import type { ChatState, Room } from "@/lib/types";

// ========================
// Chat Page
//
// State machine:
//   IDLE → SEARCHING → MATCHED → CONNECTING → CONNECTED → DISCONNECTED
//                                                       ↘ SEARCHING (via "Next")
//
// All matchmaking is client-driven via Firebase RTDB.
// The page orchestrates the transitions between states.
// ========================

function ChatContent() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [chatState, setChatState] = useState<ChatState>("idle");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);

  const { status, roomId, error, startSearching, stopSearching } =
    useMatchmaking(uid);

  // ========================
  // Check for existing room on page load (handles refresh)
  //
  // If matches/{uid} has a roomId, check if that room is still active.
  // If so, rejoin it. If not, clean up the stale match notification.
  // ========================

  useEffect(() => {
    if (!uid || chatState !== "idle") return;

    get(ref(db, `matches/${uid}`)).then(async (snapshot) => {
      const existingRoomId = snapshot.val() as string | null;
      if (!existingRoomId) return;

      const roomSnapshot = await get(ref(db, `rooms/${existingRoomId}`));
      const room = roomSnapshot.val() as Room | null;

      if (!room || room.status !== "active") {
        // Room no longer exists or is terminating — clean up
        await remove(ref(db, `matches/${uid}`));
        return;
      }

      // Check both heartbeats — if either is stale (>5s old), room is dead
      const now = Date.now();
      const heartbeats = room.presence ? Object.values(room.presence) : [];
      const isStale = heartbeats.some(
        (p) => !p.heartbeat || now - p.heartbeat > 5000
      );

      if (isStale) {
        // Room is stale — trigger two-phase termination
        await update(ref(db, `rooms/${existingRoomId}`), {
          status: "terminating",
          terminatedBy: uid,
          terminatedAt: serverTimestamp(),
        });
        // Schedule final deletion after grace period
        setTimeout(async () => {
          const check = await get(ref(db, `rooms/${existingRoomId}`));
          if (check.exists() && check.val().status === "terminating") {
            await remove(ref(db, `rooms/${existingRoomId}`));
          }
        }, 10_000);
        await remove(ref(db, `matches/${uid}`));
        return;
      }

      // Room is active and heartbeats are fresh — rejoin
      setActiveRoomId(existingRoomId);
      setIsInitiator(room.owner === uid);
      setChatState("connected");
    });
  }, [uid, chatState]);

  // ========================
  // React to matchmaking state changes
  //
  // When matchmaking finds a room, we transition to "connected"
  // and look up the room to determine our role (initiator or not).
  // ========================

  useEffect(() => {
    if (status === "matched" && roomId && uid) {
      setActiveRoomId(roomId);

      get(ref(db, `rooms/${roomId}`)).then((snapshot) => {
        const room = snapshot.val() as Room | null;
        if (room) {
          setIsInitiator(room.owner === uid);
          setChatState("connected");
        }
      });
    }
  }, [status, roomId, uid]);

  // ========================
  // User Actions
  // ========================

  const handleStartChat = useCallback(() => {
    setChatState("searching");
    startSearching();
  }, [startSearching]);

  const handleCancelSearch = useCallback(() => {
    stopSearching();
    setChatState("idle");
  }, [stopSearching]);

  // "End Chat" — go back to idle
  const handleDisconnect = useCallback(() => {
    if (uid) remove(ref(db, `matches/${uid}`)).catch(() => {});
    setActiveRoomId(null);
    setIsInitiator(false);
    setChatState("idle");
  }, [uid]);

  // "Next" — terminate current room and immediately re-queue
  const handleNext = useCallback(() => {
    if (uid) remove(ref(db, `matches/${uid}`)).catch(() => {});
    setActiveRoomId(null);
    setIsInitiator(false);
    setChatState("searching");
    startSearching();
  }, [uid, startSearching]);

  // ========================
  // Render based on state
  // ========================

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl">
          {/* IDLE STATE */}
          {chatState === "idle" && (
            <div className="flex flex-col items-center gap-6 py-20">
              <h1 className="text-4xl font-bold text-center">
                Random Video Chat
              </h1>
              <p className="text-foreground/60 text-center max-w-md">
                Connect with other university students for anonymous video
                conversations. Your identity stays private.
              </p>
              <button
                onClick={handleStartChat}
                className="rounded-xl bg-foreground px-8 py-3.5 text-lg text-background font-medium hover:opacity-90 transition-opacity"
              >
                Start Chat
              </button>
            </div>
          )}

          {/* SEARCHING STATE */}
          {chatState === "searching" && (
            <div className="flex flex-col items-center gap-6 py-20">
              <div className="relative">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-foreground/10 border-t-foreground" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Looking for a partner...</h2>
                <p className="mt-2 text-foreground/60">
                  {status === "matching"
                    ? "Found someone! Connecting..."
                    : "Waiting for another student to join"}
                </p>
              </div>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <button
                onClick={handleCancelSearch}
                className="rounded-lg border border-foreground/20 px-6 py-2.5 font-medium hover:bg-foreground/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* CONNECTED STATE */}
          {chatState === "connected" && activeRoomId && uid && (
            <VideoChat
              roomId={activeRoomId}
              uid={uid}
              isInitiator={isInitiator}
              onDisconnect={handleDisconnect}
              onNext={handleNext}
            />
          )}

          {/* DISCONNECTED STATE (handled inside VideoChat, but as fallback) */}
          {chatState === "disconnected" && (
            <div className="flex flex-col items-center gap-6 py-20">
              <h2 className="text-2xl font-bold">Chat Ended</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleNext}
                  className="rounded-lg bg-foreground px-6 py-2.5 text-background font-medium hover:opacity-90 transition-opacity"
                >
                  Find New Partner
                </button>
                <button
                  onClick={handleDisconnect}
                  className="rounded-lg border border-foreground/20 px-6 py-2.5 font-medium hover:bg-foreground/5 transition-colors"
                >
                  Go Home
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ========================
// Page Export (wrapped in AuthGuard)
// ========================

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}
