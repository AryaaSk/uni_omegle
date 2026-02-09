// ========================
// RTDB Schema Types
// ========================

export interface QueueEntry {
  joinedAt: number;
}

export interface RoomPresence {
  heartbeat: number;
}

export interface Room {
  users: [string, string];
  owner: string;
  status: "active" | "terminating";
  createdAt: number;
  terminatedBy?: string;
  terminatedAt?: number;
  presence: Record<string, RoomPresence>;
}

// ========================
// Matchmaking State
// ========================

export type MatchmakingStatus = "idle" | "queued" | "matching" | "matched";

// ========================
// Chat Page State Machine
// ========================

export type ChatState =
  | "idle"
  | "searching"
  | "matched"
  | "connecting"
  | "connected"
  | "disconnected";

