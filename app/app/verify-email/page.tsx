"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function VerifyEmailPage() {
  const { user, loading, sendVerification, logOut } = useAuth();
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Redirect if not logged in (wait for auth to finish loading first)
  useEffect(() => {
    if (loading) return;
    // Small delay to allow onAuthStateChanged to fire after sign-up redirect
    const timeout = setTimeout(() => {
      if (!user) router.replace("/sign-in");
    }, 1000);
    return () => clearTimeout(timeout);
  }, [user, loading, router]);

  // Redirect if already verified
  useEffect(() => {
    if (user?.emailVerified) {
      router.replace("/chat");
    }
  }, [user, router]);

  // Poll for email verification every 5 seconds
  useEffect(() => {
    if (!user || user.emailVerified) return;

    const interval = setInterval(async () => {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        // Force token refresh so RTDB security rules see email_verified: true
        await auth.currentUser.getIdToken(true);
        router.replace("/chat");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, router]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    setResending(true);
    setResent(false);
    try {
      await sendVerification();
      setResent(true);
      setCooldown(60);
    } catch {
      // Firebase rate-limits verification emails
    } finally {
      setResending(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 text-3xl">
          @
        </div>

        <div>
          <h1 className="text-3xl font-bold">Verify Your Email</h1>
          <p className="mt-2 text-foreground/60">
            We sent a verification link to
          </p>
          <p className="mt-1 font-medium">{user.email}</p>
        </div>

        <p className="text-sm text-foreground/60">
          Click the link in the email to verify your account. This page will
          automatically redirect once verified.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full rounded-lg bg-foreground py-2.5 text-background font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : resending
                ? "Sending..."
                : "Resend Verification Email"}
          </button>

          {resent && (
            <p className="text-sm text-green-500">
              Verification email sent! Check your inbox.
            </p>
          )}

          <button
            onClick={logOut}
            className="w-full rounded-lg border border-foreground/20 py-2.5 font-medium hover:bg-foreground/5 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
