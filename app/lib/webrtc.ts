"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ref,
  set,
  push,
  remove,
  onValue,
  onChildAdded,
} from "firebase/database";
import { getFirebaseDb } from "@/lib/firebase";

// ========================
// ICE Server Configuration
//
// STUN: helps peers discover their public IP (free, works ~80-85% of the time)
// TURN: relay fallback for symmetric NATs (needed for ~15-20% of connections)
// ========================

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function getIceServers(): Promise<RTCIceServer[]> {
  // Try Cloudflare TURN (server-generated short-lived credentials)
  try {
    const res = await fetch("/api/turn-credentials");
    if (res.ok) {
      const data = await res.json();
      if (data.iceServers && data.iceServers.length > 0) {
        console.log("[webrtc] Using Cloudflare TURN servers");
        return data.iceServers;
      }
    }
  } catch {
    // API route not available — fall through
  }

  // Fallback: static TURN from env vars (e.g. expressturn.com)
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    console.log("[webrtc] Using static TURN server from env");
    return [
      ...FALLBACK_ICE_SERVERS,
      {
        urls: turnUrl,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
      },
    ];
  }

  console.warn("[webrtc] No TURN server configured — STUN only");
  return FALLBACK_ICE_SERVERS;
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

// ========================
// Diagnostics — collect detailed info when ICE fails
// ========================

interface IceDiagnostics {
  localCandidateTypes: string[];
  remoteCandidateTypes: string[];
  selectedPair: string | null;
  iceGatheringState: string;
  iceConnectionState: string;
  signalingState: string;
  connectionState: string;
  localCandidateCount: number;
  remoteCandidateCount: number;
  hasTurnServer: boolean;
  hadTurnCandidate: boolean;
}

async function collectDiagnostics(pc: RTCPeerConnection): Promise<IceDiagnostics> {
  const localTypes: string[] = [];
  const remoteTypes: string[] = [];
  let selectedPair: string | null = null;
  let hadTurnCandidate = false;

  try {
    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (report.type === "local-candidate") {
        const ctype = report.candidateType as string;
        if (!localTypes.includes(ctype)) localTypes.push(ctype);
        if (ctype === "relay") hadTurnCandidate = true;
      }
      if (report.type === "remote-candidate") {
        const ctype = report.candidateType as string;
        if (!remoteTypes.includes(ctype)) remoteTypes.push(ctype);
      }
      if (report.type === "candidate-pair" && report.state === "succeeded") {
        selectedPair = `${report.localCandidateId} <-> ${report.remoteCandidateId} (${report.state})`;
      }
    });
  } catch {
    // getStats can fail on a closed PC
  }

  return {
    localCandidateTypes: localTypes,
    remoteCandidateTypes: remoteTypes,
    selectedPair,
    iceGatheringState: pc.iceGatheringState,
    iceConnectionState: pc.iceConnectionState,
    signalingState: pc.signalingState,
    connectionState: pc.connectionState,
    localCandidateCount: localTypes.length,
    remoteCandidateCount: remoteTypes.length,
    hasTurnServer: localTypes.includes("relay") || remoteTypes.includes("relay"),
    hadTurnCandidate,
  };
}

interface UseWebRTCOptions {
  roomId: string;
  uid: string;
  partnerUid: string;
  isInitiator: boolean;
  onIceFailure: (diagnostics?: IceDiagnostics) => void;
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
  const onIceFailureRef = useRef(onIceFailure);
  onIceFailureRef.current = onIceFailure;

  const log = useCallback((msg: string) => {
    console.log(`[webrtc] ${msg}`);
  }, []);

  // ========================
  // Close everything
  // ========================

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    log("Closing WebRTC connection");

    // Stop all local media tracks (releases camera/mic)
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close the peer connection
    pcRef.current?.close();
    pcRef.current = null;

    setRemoteStream(null);
    setConnectionState("closed");
  }, [log]);

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

  // Switch to a different camera or microphone by deviceId
  const switchDevice = useCallback(async (kind: "audioinput" | "videoinput", deviceId: string) => {
    const constraints = kind === "videoinput"
      ? { video: { deviceId: { exact: deviceId } } }
      : { audio: { deviceId: { exact: deviceId } } };

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = newStream.getTracks()[0];
    if (!newTrack) return;

    const stream = localStreamRef.current;
    const pc = pcRef.current;
    if (!stream) return;

    // Replace the track in the local stream
    const oldTrack = kind === "videoinput"
      ? stream.getVideoTracks()[0]
      : stream.getAudioTracks()[0];

    if (oldTrack) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    stream.addTrack(newTrack);
    setLocalStream(new MediaStream(stream.getTracks()));

    // Replace the track on the peer connection sender
    if (pc) {
      const senderKind = kind === "videoinput" ? "video" : "audio";
      const sender = pc.getSenders().find((s) => s.track?.kind === senderKind);
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }
  }, []);

  // ========================
  // Main WebRTC Setup
  //
  // This effect runs once when the hook mounts with valid params.
  // It orchestrates the entire connection flow using RTDB for signaling.
  // ========================

  useEffect(() => {
    if (!roomId || !uid || !partnerUid) return;

    log(`Setup starting — room=${roomId}, initiator=${isInitiator}, partner=${partnerUid}`);

    // Close any leftover PC from a previous effect run (e.g. strict mode remount)
    // to prevent orphaned connections that race with the new setup.
    if (pcRef.current) {
      log("Closing leftover PeerConnection from previous run");
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Reset so that re-runs work
    closedRef.current = false;
    setConnectionState("new");

    let isCancelled = false;

    // Collect unsubscribe functions for proper cleanup
    const unsubs: (() => void)[] = [];

    // Track RTDB refs for signaling
    const signalingBase = `rooms/${roomId}/signaling`;
    const offerRef = ref(getFirebaseDb(), `${signalingBase}/offer`);
    const answerRef = ref(getFirebaseDb(), `${signalingBase}/answer`);
    const partnerCandidatesRef = ref(getFirebaseDb(), `${signalingBase}/iceCandidates/${partnerUid}`);

    // Connection timeout — if not connected within 30s, trigger failure.
    // We check BOTH connectionState and iceConnectionState because with
    // TURN relays, iceConnectionState often reaches "connected" before
    // connectionState does.
    const connectionTimeout = setTimeout(() => {
      if (isCancelled || !pcRef.current) return;
      const pc = pcRef.current;
      const isConnected =
        pc.connectionState === "connected" ||
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed";
      if (!isConnected) {
        log(`Connection timeout after 30s — state=${pc.connectionState}, iceConnection=${pc.iceConnectionState}, signalingState=${pc.signalingState}`);
        collectDiagnostics(pc).then((diag) => {
          log(`TIMEOUT DIAGNOSTICS: ${JSON.stringify(diag)}`);
          if (!isCancelled) onIceFailureRef.current(diag);
        });
      }
    }, 30_000);

    async function setup() {
      try {
        // 1. Acquire local media
        log("Requesting getUserMedia...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (isCancelled) {
          log("Cancelled after getUserMedia — stopping tracks");
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        log(`getUserMedia success — ${stream.getTracks().length} tracks`);
        localStreamRef.current = stream;
        setLocalStream(stream);

        // 2. Create peer connection with TURN credentials
        const iceServers = await getIceServers();
        if (isCancelled) return;

        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;
        log("RTCPeerConnection created");

        // 3. Add local tracks to the connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // 4. Handle incoming remote tracks
        const remote = new MediaStream();
        setRemoteStream(remote);

        pc.ontrack = (event) => {
          log(`Remote track received: ${event.track.kind}`);
          remote.addTrack(event.track);
          setRemoteStream(new MediaStream(remote.getTracks()));
        };

        // 5. Send ICE candidates to RTDB as they're generated
        const myCandidatesRef = ref(getFirebaseDb(), `${signalingBase}/iceCandidates/${uid}`);
        let iceSentCount = 0;
        const localCandidateTypes = new Set<string>();
        pc.onicecandidate = (event) => {
          if (isCancelled) return;
          if (event.candidate) {
            iceSentCount++;
            const cand = event.candidate;
            localCandidateTypes.add(cand.type || "unknown");
            push(myCandidatesRef, cand.toJSON());
            if (iceSentCount <= 5) {
              log(`ICE candidate sent (#${iceSentCount}): type=${cand.type} protocol=${cand.protocol} ${cand.candidate.substring(0, 60)}...`);
            }
          } else {
            log(`ICE gathering complete — ${iceSentCount} candidates sent, types: [${[...localCandidateTypes].join(", ")}]`);
          }
        };

        // 6. Monitor connection state
        // Track whether we've ever been connected — don't kill a working
        // session if a transient ICE state change happens.
        let everConnected = false;

        pc.onconnectionstatechange = () => {
          if (isCancelled) return;
          const state = pc.connectionState;
          log(`Connection state: ${state} (iceConnection=${pc.iceConnectionState}, gathering=${pc.iceGatheringState})`);
          setConnectionState(state);
          if (state === "connected") {
            everConnected = true;
            clearTimeout(connectionTimeout);
            log(`Connected! Local candidate types: [${[...localCandidateTypes].join(", ")}]`);
          }
          if (state === "failed" && !everConnected) {
            // Only trigger failure if we never successfully connected.
            // If we were connected before, let the heartbeat system handle it.
            log("Connection FAILED (never connected) — collecting diagnostics");
            collectDiagnostics(pc).then((diag) => {
              log(`DIAGNOSTICS: ${JSON.stringify(diag)}`);
              if (!isCancelled) onIceFailureRef.current(diag);
            });
          }
        };

        // 6b. Monitor ICE connection state (more granular — often updates before connectionState)
        pc.oniceconnectionstatechange = () => {
          if (isCancelled) return;
          const iceState = pc.iceConnectionState;
          log(`ICE connection state: ${iceState}`);
          if (iceState === "connected" || iceState === "completed") {
            everConnected = true;
            clearTimeout(connectionTimeout);
            log(`ICE connected! Local candidate types: [${[...localCandidateTypes].join(", ")}]`);
          }
        };

        // 6c. Monitor ICE gathering state
        pc.onicegatheringstatechange = () => {
          log(`ICE gathering state: ${pc.iceGatheringState}`);
        };

        // 7. Listen for the partner's ICE candidates
        // Buffer candidates that arrive before remoteDescription is set
        const pendingCandidates: RTCIceCandidateInit[] = [];
        let iceRecvCount = 0;

        async function flushCandidates() {
          // splice atomically drains the array — new candidates pushed
          // by onChildAdded during the async loop are preserved.
          const batch = pendingCandidates.splice(0, pendingCandidates.length);
          if (batch.length === 0) return;
          log(`Flushing ${batch.length} buffered ICE candidates`);
          for (const c of batch) {
            if (isCancelled) return;
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch((err) => {
              log(`Failed to add buffered ICE candidate: ${err}`);
            });
          }
        }

        unsubs.push(onChildAdded(partnerCandidatesRef, (snapshot) => {
          if (isCancelled) return;
          const candidate = snapshot.val();
          if (!candidate) return;
          iceRecvCount++;
          if (pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
              log(`Failed to add ICE candidate: ${err}`);
            });
          } else {
            pendingCandidates.push(candidate);
            if (iceRecvCount <= 3) {
              log(`ICE candidate buffered (#${iceRecvCount}) — no remote description yet`);
            }
          }
        }));

        // 8. SDP exchange via RTDB — depends on role

        // Both sides: clear own stale ICE candidates from any previous attempt
        log("Clearing own stale ICE candidates");
        await remove(myCandidatesRef);
        if (isCancelled) return;

        // Session nonce — the initiator includes this in the offer and the
        // non-initiator echoes it in the answer. This lets the initiator
        // reject stale answers from a previous SDP exchange.
        const sessionNonce = Math.random().toString(36).slice(2);

        if (isInitiator) {
          // Clear stale offer/answer (but not partner's ICE candidates —
          // their onChildAdded listener may be active on that path)
          log("Initiator: clearing stale offer/answer");
          await remove(offerRef);
          if (isCancelled) return;
          await remove(answerRef);
          if (isCancelled) return;

          log("Initiator: creating offer");
          const offer = await pc.createOffer();
          if (isCancelled) return;

          await pc.setLocalDescription(offer);
          if (isCancelled) return;

          log("Initiator: writing offer to RTDB");
          await set(offerRef, {
            type: pc.localDescription!.type,
            sdp: pc.localDescription!.sdp,
            nonce: sessionNonce,
          });
          log("Initiator: offer written — waiting for answer");

          // Listen for the answer from the non-initiator
          unsubs.push(onValue(answerRef, async (snapshot) => {
            const answer = snapshot.val();
            if (!answer || isCancelled) return;
            // Reject stale answers from a previous SDP exchange
            if (answer.nonce !== sessionNonce) {
              log(`Initiator: ignoring answer — nonce mismatch (expected ${sessionNonce}, got ${answer.nonce})`);
              return;
            }
            log(`Initiator: answer received — signalingState=${pc.signalingState}`);
            try {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(answer)
                );
                if (isCancelled) return;
                log("Initiator: remote description set");
                await flushCandidates();
              } else {
                log(`Initiator: ignoring answer — wrong signalingState (${pc.signalingState})`);
              }
            } catch (err) {
              log(`Initiator: failed to set remote answer: ${err}`);
            }
          }));
        } else {
          // Non-initiator: listen for offer, then create and write answer
          log("Non-initiator: listening for offer");
          unsubs.push(onValue(offerRef, async (snapshot) => {
            const offer = snapshot.val();
            if (!offer || isCancelled) return;
            // Only process the offer once — if signalingState has progressed
            // past "new", we already handled an offer on this PC.
            if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
              log(`Non-initiator: ignoring offer — signalingState=${pc.signalingState}`);
              return;
            }
            log("Non-initiator: offer received — processing");
            try {
              await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
              );
              if (isCancelled) return;
              log("Non-initiator: remote description set");
              await flushCandidates();
              if (isCancelled) return;
              const answer = await pc.createAnswer();
              if (isCancelled) return;
              await pc.setLocalDescription(answer);
              if (isCancelled) return;
              log("Non-initiator: writing answer to RTDB");
              await set(answerRef, {
                type: pc.localDescription!.type,
                sdp: pc.localDescription!.sdp,
                nonce: offer.nonce || "",
              });
              log("Non-initiator: answer written");
            } catch (err) {
              log(`Non-initiator: failed to process offer: ${err}`);
            }
          }));
        }
      } catch (err) {
        log(`WebRTC setup FAILED: ${err}`);
        if (!isCancelled) {
          onIceFailureRef.current();
        }
      }
    }

    setup();

    return () => {
      log("Cleanup — cancelling and detaching listeners");
      isCancelled = true;
      clearTimeout(connectionTimeout);
      unsubs.forEach((fn) => fn());

      // Close the PC from this run so it doesn't linger as an orphan
      // (the close() callback handles final unmount separately)
      if (pcRef.current) {
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
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
    switchDevice,
    close,
  };
}
