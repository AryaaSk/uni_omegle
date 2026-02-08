"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  off,
} from "firebase/database";
import { db } from "@/lib/firebase";

// ========================
// ICE Server Configuration
//
// STUN: helps peers discover their public IP (free, works ~80-85% of the time)
// TURN: relay fallback for symmetric NATs (needed for ~15-20% of connections)
// ========================

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
    });
  }

  return servers;
}

// ========================
// useWebRTC Hook
//
// Manages the full WebRTC lifecycle with Firebase RTDB signaling:
// 1. Acquire local media (camera + microphone)
// 2. Create RTCPeerConnection with ICE servers
// 3. Exchange SDP offer/answer via RTDB
// 4. Exchange ICE candidates via RTDB
// 5. Handle remote stream arrival
// 6. Monitor connection state (trigger termination on failure)
// 7. Provide media controls (mute/unmute, camera toggle)
//
// Signaling is done entirely through Firebase RTDB:
//   rooms/{roomId}/signaling/offer        — SDP offer (written by initiator)
//   rooms/{roomId}/signaling/answer       — SDP answer (written by non-initiator)
//   rooms/{roomId}/signaling/iceCandidates/{uid}/{pushId} — ICE candidates
//
// The `isInitiator` flag determines who creates the offer:
// - Room owner (lock winner) = initiator → creates offer
// - Other participant = non-initiator → waits for offer, sends answer
// ========================

interface UseWebRTCOptions {
  roomId: string;
  uid: string;
  partnerUid: string;
  isInitiator: boolean;
  onIceFailure: () => void;
}

export function useWebRTC({
  roomId,
  uid,
  partnerUid,
  isInitiator,
  onIceFailure,
}: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const closedRef = useRef(false);

  // ========================
  // Close everything
  // ========================

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;

    // Stop all local media tracks (releases camera/mic)
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close the peer connection
    pcRef.current?.close();
    pcRef.current = null;

    setRemoteStream(null);
    setConnectionState("closed");
  }, []);

  // ========================
  // Media Controls
  // ========================

  const toggleAudio = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setAudioEnabled((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setVideoEnabled((prev) => !prev);
  }, []);

  // ========================
  // Main WebRTC Setup
  //
  // This effect runs once when the hook mounts with valid params.
  // It orchestrates the entire connection flow using RTDB for signaling.
  // ========================

  useEffect(() => {
    if (!roomId || !uid || !partnerUid || closedRef.current) return;

    let isCancelled = false;

    // Track RTDB refs for cleanup
    const signalingBase = `rooms/${roomId}/signaling`;
    const offerRef = ref(db, `${signalingBase}/offer`);
    const answerRef = ref(db, `${signalingBase}/answer`);
    const partnerCandidatesRef = ref(db, `${signalingBase}/iceCandidates/${partnerUid}`);

    async function setup() {
      try {
        // 1. Acquire local media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // 2. Create peer connection
        const pc = new RTCPeerConnection({
          iceServers: getIceServers(),
        });
        pcRef.current = pc;

        // 3. Add local tracks to the connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // 4. Handle incoming remote tracks
        const remote = new MediaStream();
        setRemoteStream(remote);

        pc.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            remote.addTrack(track);
          });
          setRemoteStream(new MediaStream(remote.getTracks()));
        };

        // 5. Send ICE candidates to RTDB as they're generated
        // Each user pushes their candidates under their own UID
        const myCandidatesRef = ref(db, `${signalingBase}/iceCandidates/${uid}`);
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            push(myCandidatesRef, event.candidate.toJSON());
          }
        };

        // 6. Monitor connection state
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          setConnectionState(state);
          if (state === "failed" || state === "disconnected") {
            onIceFailure();
          }
        };

        // 7. Listen for the partner's ICE candidates
        // onChildAdded fires for each new candidate the partner pushes
        onChildAdded(partnerCandidatesRef, (snapshot) => {
          const candidate = snapshot.val();
          if (candidate && pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
              console.warn("Failed to add ICE candidate:", err);
            });
          }
        });

        // 8. SDP exchange via RTDB — depends on role
        if (isInitiator) {
          // Initiator: create offer, write to RTDB, then listen for answer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await set(offerRef, {
            type: pc.localDescription!.type,
            sdp: pc.localDescription!.sdp,
          });

          // Listen for the answer from the non-initiator
          onValue(answerRef, async (snapshot) => {
            const answer = snapshot.val();
            if (answer && pc.signalingState === "have-local-offer") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(answer)
              );
            }
          });
        } else {
          // Non-initiator: listen for offer, then create and write answer
          onValue(offerRef, async (snapshot) => {
            const offer = snapshot.val();
            if (offer && pc.signalingState === "stable") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
              );
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await set(answerRef, {
                type: pc.localDescription!.type,
                sdp: pc.localDescription!.sdp,
              });
            }
          });
        }
      } catch (err) {
        console.error("WebRTC setup failed:", err);
        if (!isCancelled) {
          onIceFailure();
        }
      }
    }

    setup();

    return () => {
      isCancelled = true;
      // Detach all RTDB listeners
      off(offerRef);
      off(answerRef);
      off(partnerCandidatesRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, uid, partnerUid, isInitiator]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  return {
    localStream,
    remoteStream,
    connectionState,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    close,
  };
}
