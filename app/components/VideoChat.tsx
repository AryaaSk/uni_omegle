"use client";
//using https://www.expressturn.com/ for turn server

import { useEffect, useRef, useCallback, useState } from "react";
import { useRoom } from "@/lib/room";
import { useWebRTC } from "@/lib/webrtc";
import { getUniversityName, getUniversityLogo } from "@/lib/universities";
import { getFirebaseDb } from "@/lib/firebase";
import { ref, push } from "firebase/database";
import Image from "next/image";
import Link from "next/link";

function getDisconnectInfo(reason: string | null) {
  switch (reason) {
    case "partner_left":
      return {
        title: "Partner Disconnected",
        description: "Your partner has left the chat.",
        isError: false,
        detail: "",
      };
    case "partner_inactive":
      return {
        title: "Connection Lost",
        description: "The chat has ended unexpectedly.",
        isError: true,
        detail: "Your partner\u2019s connection dropped. This usually means they closed the tab or lost internet.",
      };
    case "partner_timeout":
      return {
        title: "Partner Didn\u2019t Connect",
        description: "The chat could not be established.",
        isError: true,
        detail: "Your partner was matched but never connected. They may have closed the page before the chat started.",
      };
    case "connection_failed":
      return {
        title: "Connection Failed",
        description: "The video connection could not be established.",
        isError: true,
        detail: "This is usually caused by a firewall or network restriction blocking the video connection. Try switching to a different network.",
      };
    default:
      return {
        title: "Chat Ended",
        description: "The chat has ended.",
        isError: false,
        detail: "",
      };
  }
}

interface VideoChatProps {
  roomId: string;
  uid: string;
  userEmail?: string;
  onDisconnect: () => void;
  onNext: (newRoomId?: string) => void;
}

export default function VideoChat({
  roomId,
  uid,
  userEmail,
  onDisconnect,
  onNext,
}: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const { partnerUid, partnerEmail, terminated, disconnectReason, leaveRoom, skipToNext, nextPartnerAvailable, isInitiator } = useRoom(roomId, uid, userEmail);

  const handleIceFailure = useCallback(() => {
    const db = getFirebaseDb();
    push(ref(db, "errors"), {
      type: "ice_failure",
      roomId,
      uid,
      timestamp: Date.now(),
    });
    leaveRoom("connection_failed");
  }, [leaveRoom, roomId, uid]);

  const {
    localStream,
    remoteStream,
    connectionState,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    switchDevice,
    close: closeWebRTC,
  } = useWebRTC({
    roomId: partnerUid ? roomId : "",
    uid,
    partnerUid: partnerUid || "",
    isInitiator,
    onIceFailure: handleIceFailure,
  });

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (terminated) {
      closeWebRTC();
    }
  }, [terminated, closeWebRTC]);

  useEffect(() => {
    return () => {
      closeWebRTC();
    };
  }, [closeWebRTC]);

  function handleEnd() {
    const db = getFirebaseDb();
    push(ref(db, "errors"), {
      type: "user_end_chat",
      roomId,
      uid,
      timestamp: Date.now(),
    });
    leaveRoom();
    closeWebRTC();
    onDisconnect();
  }

  function handleNext() {
    const newRoomId = skipToNext();
    closeWebRTC();
    if (newRoomId) {
      onNext(newRoomId);
    } else {
      const db = getFirebaseDb();
      push(ref(db, "errors"), {
        type: "user_next_no_partner",
        roomId,
        uid,
        timestamp: Date.now(),
      });
      leaveRoom();
      onNext();
    }
  }

  const userUniName = userEmail ? getUniversityName(userEmail) : null;
  const userUniLogo = userEmail ? getUniversityLogo(userEmail) : null;
  const partnerUniName = partnerEmail ? getUniversityName(partnerEmail) : null;
  const partnerUniLogo = partnerEmail ? getUniversityLogo(partnerEmail) : null;

  // ========================
  // Disconnected State
  // ========================

  if (terminated) {
    const reasonInfo = getDisconnectInfo(disconnectReason);
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{reasonInfo.title}</h2>
          <p className="mt-2 text-muted">{reasonInfo.description}</p>
        </div>
        {reasonInfo.isError && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-6 py-3 text-sm text-danger max-w-md text-center">
            {reasonInfo.detail}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onDisconnect}
            className="rounded-lg border border-surface-border px-6 py-2.5 font-medium text-muted hover:bg-surface-light transition-colors"
          >
            Back to Home
          </button>
          <button
            onClick={() => onNext()}
            className="rounded-lg bg-primary px-6 py-2.5 text-background font-medium hover:bg-primary-dark transition-colors"
          >
            Find New Partner
          </button>
        </div>
        <Image src="/logo.png" alt="UniOmegle.com" width={120} height={27} className="h-5 w-auto opacity-30 select-none" />
      </div>
    );
  }

  // ========================
  // Active Video Chat
  // ========================

  const isConnecting = connectionState === "new" || connectionState === "connecting" || !partnerUid;

  return (
    <div className="fixed inset-0 flex flex-col bg-background p-3 gap-3">
      {/* Branding bar */}
      <div className="shrink-0">
        <Link href="/">
          <Image src="/logo.png" alt="UniOmegle.com" width={180} height={40} className="h-8 w-auto" priority />
        </Link>
      </div>

      {/* Remote Video — top half */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="relative w-full max-h-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <UniBadge name={partnerUniName} logo={partnerUniLogo} fallback={partnerEmail || "Partner"} />

          {isConnecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="text-muted">Connecting...</p>
            </div>
          )}
        </div>
      </div>

      {/* Local Video — bottom half */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="relative w-full max-h-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
          />
          <UniBadge name={userUniName} logo={userUniLogo} fallback={userEmail || "You"} />
        </div>
      </div>

      {/* Controls — bottom */}
      <div className="relative flex justify-center pb-1">
        <div className="inline-flex items-center gap-3 rounded-2xl bg-surface/80 backdrop-blur-sm border border-surface-border px-6 py-3">
          <button
            onClick={toggleAudio}
            className={`rounded-full p-3 transition-colors ${
              audioEnabled
                ? "bg-surface-light hover:bg-surface-border"
                : "bg-danger/20 text-danger"
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
                ? "bg-surface-light hover:bg-surface-border"
                : "bg-danger/20 text-danger"
            }`}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            {videoEnabled ? (
              <VideoIcon className="h-5 w-5" />
            ) : (
              <VideoOffIcon className="h-5 w-5" />
            )}
          </button>

          <DeviceSettings switchDevice={switchDevice} />

          <button
            onClick={handleEnd}
            className="rounded-full bg-danger px-5 py-3 text-sm font-medium text-white hover:bg-danger/80 transition-colors"
          >
            End Chat
          </button>

          <button
            onClick={handleNext}
            disabled={!nextPartnerAvailable}
            className={`rounded-full px-5 py-3 text-sm font-medium transition-all ${
              nextPartnerAvailable
                ? "bg-primary text-background hover:bg-primary-dark"
                : "bg-surface-light text-muted/50 cursor-not-allowed"
            }`}
          >
            Next
          </button>

        </div>
      </div>
    </div>
  );
}

// ========================
// University Badge
// ========================

function UniBadge({ name, logo, fallback }: { name: string | null; logo: string | null; fallback: string }) {
  const [logoError, setLogoError] = useState(false);
  const showLogo = logo && !logoError;

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-black/60 backdrop-blur-sm px-3 py-1.5" style={{ transform: "translateZ(0)" }}>
      {showLogo && (
        <Image
          src={logo}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 object-contain shrink-0"
          onError={() => setLogoError(true)}
        />
      )}
      {name ? (
        <span className="text-sm font-semibold text-primary">{name}</span>
      ) : (
        <span className="text-sm font-semibold text-muted">{fallback}</span>
      )}
    </div>
  );
}

// ========================
// Device Settings Popover
// ========================

function DeviceSettings({ switchDevice }: { switchDevice: (kind: "audioinput" | "videoinput", deviceId: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput" || d.kind === "videoinput"));
  }, []);

  useEffect(() => {
    if (open) loadDevices();
  }, [open, loadDevices]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const cameras = devices.filter((d) => d.kind === "videoinput");
  const mics = devices.filter((d) => d.kind === "audioinput");

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-full p-3 bg-surface-light hover:bg-surface-border transition-colors"
        title="Device settings"
      >
        <GearIcon className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 rounded-xl bg-surface border border-surface-border p-4 shadow-lg space-y-4 z-30">
          {cameras.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Camera</label>
              <select
                onChange={(e) => switchDevice("videoinput", e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-light px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${cameras.indexOf(d) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mics.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Microphone</label>
              <select
                onChange={(e) => switchDevice("audioinput", e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-light px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${mics.indexOf(d) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========================
// SVG Icons
// ========================

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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
