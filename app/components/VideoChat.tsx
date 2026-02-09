"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRoom } from "@/lib/room";
import { useWebRTC } from "@/lib/webrtc";

// ========================
// VideoChat Component
//
// Orchestrates the full video chat experience for an active room:
// 1. Establishes WebRTC peer connection (signaling via Firebase RTDB)
// 2. Manages room heartbeats and partner presence
// 3. Renders local + remote video streams
// 4. Provides media controls and disconnect options
// ========================

interface VideoChatProps {
  roomId: string;
  uid: string;
  userEmail?: string;
  isInitiator: boolean;
  onDisconnect: () => void;
  onNext: () => void;
}

export default function VideoChat({
  roomId,
  uid,
  userEmail,
  isInitiator,
  onDisconnect,
  onNext,
}: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Room management: heartbeats, partner presence, termination
  const { partnerUid, partnerOnline, terminated, terminate } = useRoom(roomId, uid);

  // WebRTC: media streams + peer connection (signaling via RTDB)
  const handleIceFailure = useCallback(() => {
    terminate("ice-failure");
  }, [terminate]);

  const {
    localStream,
    remoteStream,
    connectionState,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    close: closeWebRTC,
  } = useWebRTC({
    roomId: partnerUid ? roomId : "",
    uid,
    partnerUid: partnerUid || "",
    isInitiator,
    onIceFailure: handleIceFailure,
  });

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Close WebRTC when room terminates
  useEffect(() => {
    if (terminated) {
      closeWebRTC();
    }
  }, [terminated, closeWebRTC]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeWebRTC();
    };
  }, [closeWebRTC]);

  function handleEnd() {
    terminate("user");
    closeWebRTC();
    onDisconnect();
  }

  function handleNext() {
    terminate("user");
    closeWebRTC();
    onNext();
  }

  // ========================
  // Disconnected State
  // ========================

  if (terminated) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Partner Disconnected</h2>
          <p className="mt-2 text-foreground/60">The chat has ended.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onNext}
            className="rounded-lg bg-foreground px-6 py-2.5 text-background font-medium hover:opacity-90 transition-opacity"
          >
            Find New Partner
          </button>
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-foreground/20 px-6 py-2.5 font-medium hover:bg-foreground/5 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // Active Video Chat
  //
  // Video elements are ALWAYS rendered so that refs are valid
  // when streams become available. A connecting overlay is shown
  // on top while the peer connection is being established.
  // ========================

  const isConnecting = connectionState === "new" || connectionState === "connecting" || !partnerUid;

  return (
    <div className="flex flex-col gap-4">
      {/* User email */}
      {userEmail && (
        <div className="text-center text-sm text-foreground/60">
          Signed in as <span className="font-medium text-foreground">{userEmail}</span>
        </div>
      )}

      {/* Video Container */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {/* Remote Video (full size) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />

        {/* Connecting overlay */}
        {isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <p className="text-white/60">Establishing peer connection...</p>
          </div>
        )}

        {/* Connection status indicator */}
        {!isConnecting && (
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
            <div
              className={`h-2 w-2 rounded-full ${
                partnerOnline ? "bg-green-400" : "bg-red-400"
              }`}
            />
            <span className="text-xs text-white">
              {partnerOnline ? "Connected" : "Partner offline"}
            </span>
          </div>
        )}

        {/* Local Video (picture-in-picture) */}
        <div className="absolute bottom-4 right-4 w-1/4 max-w-[200px] overflow-hidden rounded-xl border-2 border-white/20 shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full object-cover"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={toggleAudio}
          className={`rounded-full p-3 transition-colors ${
            audioEnabled
              ? "bg-foreground/10 hover:bg-foreground/20"
              : "bg-red-500/20 text-red-500"
          }`}
          title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {audioEnabled ? (
            <MicIcon className="h-5 w-5" />
          ) : (
            <MicOffIcon className="h-5 w-5" />
          )}
        </button>

        <button
          onClick={toggleVideo}
          className={`rounded-full p-3 transition-colors ${
            videoEnabled
              ? "bg-foreground/10 hover:bg-foreground/20"
              : "bg-red-500/20 text-red-500"
          }`}
          title={videoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {videoEnabled ? (
            <VideoIcon className="h-5 w-5" />
          ) : (
            <VideoOffIcon className="h-5 w-5" />
          )}
        </button>

        <button
          onClick={handleNext}
          className="rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
        >
          Next
        </button>

        <button
          onClick={handleEnd}
          className="rounded-full bg-red-500 px-5 py-3 text-sm font-medium text-white hover:bg-red-600 transition-colors"
        >
          End Chat
        </button>
      </div>
    </div>
  );
}

// ========================
// Simple SVG Icons (inline to avoid dependencies)
// ========================

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5.29" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function VideoOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
      <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
