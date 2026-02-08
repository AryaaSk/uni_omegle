"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Navbar() {
  const { user, loading, logOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await logOut();
    router.push("/");
  }

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
      <Link href="/" className="text-xl font-bold">
        UniChat
      </Link>

      <div className="flex items-center gap-4">
        {loading ? null : user ? (
          <>
            <span className="text-sm text-foreground/60 hidden sm:inline">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5 transition-colors"
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="text-sm hover:underline"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 transition-opacity"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
