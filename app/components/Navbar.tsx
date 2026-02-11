"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUniversityShortName } from "@/lib/universities";

export default function Navbar() {
  const { user, loading, logOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await logOut();
    router.push("/");
  }

  const uniName = user?.email ? getUniversityShortName(user.email) : null;

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm">
      <Link href="/" className="text-xl font-bold">
        uni<span className="text-primary">omegle</span>.com
      </Link>

      <div className="flex items-center gap-4">
        {loading ? null : user ? (
          <>
            <span className="text-sm text-muted hidden sm:inline">
              {user.email}{uniName ? ` — ${uniName}` : ""}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-muted hover:bg-surface-light transition-colors"
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-background font-medium hover:bg-primary-dark transition-colors"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
