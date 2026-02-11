"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useCurrentRoom } from "@/lib/currentRoom";
import { useMatchmaking } from "@/lib/matchmaking";
import AuthGuard from "@/components/AuthGuard";
import VideoChat from "@/components/VideoChat";
import Navbar from "@/components/Navbar";

// ========================
// Chat Page
//
// State machine: IDLE → SEARCHING → CONNECTED
//
// Connected state is driven by the global currentRoomId
// from CurrentRoomProvider (users/{uid}/currentRoom listener).
// ========================

function ChatContent() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { currentRoomId } = useCurrentRoom();

  const [chatState, setChatState] = useState<"idle" | "searching" | "connected">("idle");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const { isSearching, startSearching, stopSearching } = useMatchmaking(uid, user?.email || undefined);

  // Sync local state with global currentRoomId
  // Handles: null→room (matched), room→room (skipToNext via provider), room→null (partner left)
  useEffect(() => {
    if (currentRoomId) {
      if (chatState !== "connected" || activeRoomId !== currentRoomId) {
        setActiveRoomId(currentRoomId);
        setChatState("connected");
      }
    } else if (chatState === "connected") {
      setActiveRoomId(null);
      setChatState("idle");
    }
  }, [currentRoomId, chatState, activeRoomId]);

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

  const handleDisconnect = useCallback(() => {
    setActiveRoomId(null);
    setChatState("idle");
  }, []);

  const handleNext = useCallback((newRoomId?: string) => {
    if (newRoomId) {
      // Atomic skip — new room already created by skipToNext()
      setActiveRoomId(newRoomId);
      setChatState("connected");
    } else {
      // No next partner — go to searching
      setActiveRoomId(null);
      setChatState("searching");
      startSearching();
    }
  }, [startSearching]);

  // ========================
  // Render
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
                  Waiting for another student to join
                </p>
              </div>
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
              key={activeRoomId}
              roomId={activeRoomId}
              uid={uid}
              userEmail={user?.email || undefined}
              onDisconnect={handleDisconnect}
              onNext={handleNext}
            />
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
