"use client";

import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const { user, loading, signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email, password);
      router.replace("/verify-email");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign up failed. Please try again.";
      setError(message);
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="text-2xl font-bold inline-block mb-6">
            uni<span className="text-primary">omegle</span>
          </Link>
          <h1 className="text-3xl font-bold">Create Account</h1>
          <p className="mt-2 text-muted">
            Use your university email (.ac.uk or .edu)
          </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                University Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.ac.uk"
                className="w-full rounded-lg border border-surface-border bg-surface-light px-4 py-2.5 text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
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
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-surface-border bg-surface-light px-4 py-2.5 text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full rounded-lg border border-surface-border bg-surface-light px-4 py-2.5 text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-2.5 text-background font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
