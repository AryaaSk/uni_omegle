"use client";

import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import Link from "next/link";

export default function SignInPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect authenticated users away from sign-in
  useEffect(() => {
    if (loading) return;
    if (user?.emailVerified) {
      router.replace("/chat");
    } else if (user) {
      router.replace("/verify-email");
    }
  }, [user, loading, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      if (getFirebaseAuth().currentUser?.emailVerified) {
        router.replace("/chat");
      } else {
        router.replace("/verify-email");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setError(message);
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign In</h1>
          <p className="mt-2 text-foreground/60">
            Welcome back to UniChat
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.ac.uk"
              className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:border-foreground/40 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:border-foreground/40 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-foreground py-2.5 text-background font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-foreground/60">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-foreground underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
