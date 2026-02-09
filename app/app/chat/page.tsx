"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useMatchmaking } from "@/lib/matchmaking";
import { ref, get, remove } from "firebase/database";
import { getFirebaseDb } from "@/lib/firebase";
import AuthGuard from "@/components/AuthGuard";
import VideoChat from "@/components/VideoChat";
import Navbar from "@/components/Navbar";
import type { ChatState } from "@/lib/types";

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

  const { status, roomId, error, startSearching, stopSearching } =
    useMatchmaking(uid);

  // ========================
  // Clean up stale match on page load
  //
  // If matches/{uid} exists from a previous session, remove it so
  // the user starts fresh. The room's heartbeat system will handle
  // termination on its own.
  // ========================

  useEffect(() => {
    if (!uid || chatState !== "idle") return;

    get(ref(getFirebaseDb(), `matches/${uid}`)).then(async (snap) => {
      if (snap.val()) {
        await remove(ref(getFirebaseDb(), `matches/${uid}`));
      }
    });
  }, [uid, chatState]);

  // ========================
  // React to matchmaking state changes
  //
  // When matchmaking finds a room, transition directly to "connected".
  // The initiator role is determined inside useRoom (deterministic).
  // ========================

  useEffect(() => {
    if (status === "matched" && roomId) {
      setActiveRoomId(roomId);
      setChatState("connected");
    }
  }, [status, roomId]);

  // ========================
  // User Actions
  // ========================

  const handleStartChat = useCallback(() => {
    if (!user?.emailVerified) return;
    setChatState("searching");
    startSearching();
  }, [user, startSearching]);

  const handleCancelSearch = useCallback(() => {
    stopSearching();
    setChatState("idle");
  }, [stopSearching]);

  // "End Chat" — go back to idle
  const handleDisconnect = useCallback(() => {
    if (uid) remove(ref(getFirebaseDb(), `matches/${uid}`)).catch(() => {});
    setActiveRoomId(null);
    setChatState("idle");
  }, [uid]);

  // "Next" — terminate current room and immediately re-queue
  const handleNext = useCallback(() => {
    if (!user?.emailVerified) return;
    if (uid) remove(ref(getFirebaseDb(), `matches/${uid}`)).catch(() => {});
    setActiveRoomId(null);
    setChatState("searching");
    startSearching();
  }, [user, uid, startSearching]);

  // ========================
  // Render based on state
  // ========================

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl">
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
              userEmail={user?.email || undefined}
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
