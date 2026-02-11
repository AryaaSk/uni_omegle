"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useCurrentRoom } from "@/lib/currentRoom";
import { useMatchmaking } from "@/lib/matchmaking";
import { getUniversityName } from "@/lib/universities";
import { FEATURED_UNIVERSITIES } from "@/lib/universities";
import AuthGuard from "@/components/AuthGuard";
import VideoChat from "@/components/VideoChat";
import Navbar from "@/components/Navbar";

function ChatContent() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { currentRoomId } = useCurrentRoom();

  const [chatState, setChatState] = useState<"idle" | "searching" | "connected">("idle");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const { isSearching, startSearching, stopSearching } = useMatchmaking(uid, user?.email || undefined);

  const uniName = user?.email ? getUniversityName(user.email) : null;

  // Sync local state with global currentRoomId
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
      setActiveRoomId(newRoomId);
      setChatState("connected");
    } else {
      setActiveRoomId(null);
      setChatState("searching");
      startSearching();
    }
  }, [startSearching]);

  return (
    <div className="min-h-screen flex flex-col">
      {chatState !== "connected" && <Navbar />}

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl">
          {/* IDLE STATE */}
          {chatState === "idle" && (
            <div className="flex flex-col items-center gap-6 py-20">
              <h1 className="text-4xl font-bold text-center">
                Ready to chat?
              </h1>
              <p className="text-muted text-center max-w-md">
                Connect with another university student for an anonymous video
                conversation.
              </p>
              {uniName && (
                <p className="text-sm text-muted/60">
                  Chatting as <span className="text-primary font-medium">{uniName}</span>
                </p>
              )}
              <button
                onClick={handleStartChat}
                className="rounded-full bg-primary px-10 py-4 text-lg text-background font-semibold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/25"
              >
                Start Chat
              </button>
              <OnlineCount />
            </div>
          )}

          {/* SEARCHING STATE */}
          {chatState === "searching" && (
            <div className="flex flex-col items-center gap-6 py-20">
              <div className="relative">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Looking for a partner...</h2>
                <SearchingText />
              </div>
              <button
                onClick={handleCancelSearch}
                className="rounded-lg border border-surface-border px-6 py-2.5 font-medium text-muted hover:bg-surface-light transition-colors"
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

// Rotating search text that cycles through university names
function SearchingText() {
  const [uniIndex, setUniIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setUniIndex((prev) => (prev + 1) % FEATURED_UNIVERSITIES.length);
    }, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <p className="mt-2 text-muted">
      Maybe someone from{" "}
      <span className="text-primary">{FEATURED_UNIVERSITIES[uniIndex].shortName}</span>
      ...
    </p>
  );
}

function OnlineCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("online_count");
    setCount(stored ? parseInt(stored, 10) : Math.floor(Math.random() * 6000) + 3000);
  }, []);

  if (count === null) return null;

  return (
    <p className="text-sm text-muted mt-4">
      <span className="inline-block h-2 w-2 rounded-full bg-success mr-2 animate-pulse" />
      <span className="font-semibold text-foreground">{count.toLocaleString()}</span> people online right now
    </p>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}
