"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import { getUniversityName } from "@/lib/universities";

export default function VerifyEmailPage() {
  const { user, loading, sendVerification, logOut } = useAuth();
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/sign-in");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.emailVerified) {
      router.replace("/chat");
    }
  }, [user, router]);

  useEffect(() => {
    if (!user || user.emailVerified) return;

    const interval = setInterval(async () => {
      const currentUser = getFirebaseAuth().currentUser;
      await currentUser?.reload();
      if (currentUser?.emailVerified) {
        await currentUser.getIdToken(true);
        router.replace("/chat");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, router]);

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  const uniName = user.email ? getUniversityName(user.email) : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <EnvelopeIcon />
        </div>

        <div>
          <h1 className="text-3xl font-bold">Verify Your Email</h1>
          <p className="mt-2 text-muted">
            We sent a verification link to
          </p>
          <p className="mt-1 font-medium">{user.email}</p>
          {uniName && (
            <p className="mt-2 text-sm text-muted">
              You&apos;re signing up as a student at{" "}
              <span className="text-primary font-medium">{uniName}</span>
            </p>
          )}
        </div>

        <p className="text-sm text-muted">
          Click the link in the email to verify your account. This page will
          automatically redirect once verified.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full rounded-lg bg-primary py-2.5 text-background font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : resending
                ? "Sending..."
                : "Resend Verification Email"}
          </button>

          {resent && (
            <p className="text-sm text-success">
              Verification email sent! Check your inbox.
            </p>
          )}

          <button
            onClick={logOut}
            className="w-full rounded-lg border border-surface-border py-2.5 font-medium text-muted hover:bg-surface-light transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
