"use client";

import { AuthProvider } from "@/lib/auth";
import { CurrentRoomProvider } from "@/lib/currentRoom";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CurrentRoomProvider>{children}</CurrentRoomProvider>
    </AuthProvider>
  );
}
