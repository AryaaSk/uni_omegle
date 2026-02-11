"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { FEATURED_UNIVERSITIES } from "@/lib/universities";
import type { University } from "@/lib/universities";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  function handleGetStarted() {
    if (user?.emailVerified) {
      router.push("/chat");
    } else if (user) {
      router.push("/verify-email");
    } else {
      router.push("/sign-up");
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center px-4">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-6 pt-20 pb-16">
          <h1 className="text-6xl sm:text-8xl font-bold tracking-tight">
            uni<span className="text-primary">omegle</span>
          </h1>
          <p className="text-lg text-muted max-w-md">
            Anonymous video chat between UK university students.
          </p>

          <button
            onClick={handleGetStarted}
            disabled={loading}
            className="mt-4 rounded-full bg-primary px-14 py-5 text-xl text-background font-bold hover:bg-primary-dark hover:scale-105 disabled:opacity-50 transition-all shadow-xl shadow-primary/30"
          >
            {loading ? "..." : "Start Chatting"}
          </button>

          <p className="text-sm text-muted/40 mt-2">
            Just your uni email. Nothing else.
          </p>

          <OnlineCount />
        </div>

        {/* University Logo Ticker */}
        <div className="w-full py-16 space-y-4">
          <p className="text-center text-sm text-muted/60 uppercase tracking-widest font-medium">
            Students from
          </p>
          <UniversityTicker />
        </div>

        {/* How it works */}
        <div className="flex flex-col sm:flex-row items-stretch gap-4 max-w-4xl w-full py-16">
          <div className="flex-1 rounded-2xl border border-surface-border bg-surface/50 px-6 py-5">
            <p className="text-foreground leading-relaxed">
              <span className="text-primary font-semibold">.ac.uk</span> or <span className="text-primary font-semibold">.edu</span> email required.
              {" "}Everyone here is actually a student.
            </p>
          </div>
          <div className="flex-1 rounded-2xl border border-surface-border bg-surface/50 px-6 py-5">
            <p className="text-foreground leading-relaxed">
              Video goes <span className="text-accent font-semibold">directly</span> between you and your partner.
              {" "}We never see or store it.
            </p>
          </div>
          <div className="flex-1 rounded-2xl border border-surface-border bg-surface/50 px-6 py-5">
            <p className="text-foreground leading-relaxed">
              They only see your <span className="text-highlight font-semibold">university</span>, not your name or email.
              {" "}Chat without the pressure.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}

// ========================
// Online Count
// ========================

function OnlineCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Generate a fresh number on each page load and persist it
    const n = Math.floor(Math.random() * 6000) + 3000;
    localStorage.setItem("online_count", String(n));
    setCount(n);

    // Drift slightly every few seconds for realism
    const interval = setInterval(() => {
      setCount((prev) => {
        const next = prev! + Math.floor(Math.random() * 200) - 100;
        localStorage.setItem("online_count", String(next));
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (count === null) return null;

  return (
    <p className="text-sm text-muted mt-4">
      <span className="inline-block h-2 w-2 rounded-full bg-success mr-2 animate-pulse" />
      <span className="font-semibold text-foreground">{count.toLocaleString()}</span> people online right now
    </p>
  );
}

// ========================
// University Logo Ticker
// ========================

function UniversityTicker() {
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());
  const [activeSet, setActiveSet] = useState<Set<number>>(new Set());

  const unis = FEATURED_UNIVERSITIES.filter((u) => !failedLogos.has(u.logoFile));

  // Randomly light up universities — each one independently toggles on/off
  // with staggered timing so 3-5 are glowing at any moment
  useEffect(() => {
    if (unis.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    function sparkOne() {
      const idx = Math.floor(Math.random() * unis.length);
      setActiveSet((prev) => new Set(prev).add(idx));

      // Stay lit for 1.5-3s
      const duration = 1500 + Math.random() * 1500;
      const off = setTimeout(() => {
        setActiveSet((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
      }, duration);
      timers.push(off);
    }

    // Light up a few immediately
    for (let i = 0; i < 3; i++) {
      setTimeout(() => sparkOne(), i * 400);
    }

    // Then keep sparking new ones
    const interval = setInterval(sparkOne, 700);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [unis.length]);

  // If no logos loaded, show text badges
  if (unis.length === 0) {
    return (
      <div className="flex flex-wrap justify-center gap-3 px-4">
        {FEATURED_UNIVERSITIES.map((uni) => (
          <span
            key={uni.domain}
            className="rounded-full bg-surface border border-surface-border px-4 py-1.5 text-sm text-muted"
          >
            {uni.shortName}
          </span>
        ))}
      </div>
    );
  }

  const handleLogoError = (logoFile: string) => {
    setFailedLogos((prev) => new Set(prev).add(logoFile));
  };

  // Double for seamless loop
  const doubled = [...unis, ...unis];

  return (
    <div className="relative overflow-hidden">
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div
        className="flex items-center gap-10 py-6"
        style={{ animation: "marquee 50s linear infinite", width: "max-content" }}
      >
        {doubled.map((uni, i) => {
          const isActive = activeSet.has(i % unis.length);
          return (
            <UniTickerItem
              key={`${uni.domain}-${i}`}
              uni={uni}
              isActive={isActive}
              onLogoError={handleLogoError}
            />
          );
        })}
      </div>
    </div>
  );
}

function UniTickerItem({
  uni,
  isActive,
  onLogoError,
}: {
  uni: University;
  isActive: boolean;
  onLogoError: (logoFile: string) => void;
}) {
  const [logoOk, setLogoOk] = useState(true);

  return (
    <div className="relative flex flex-col items-center gap-2 shrink-0">
      {/* Glow ring behind logo */}
      <div
        className="absolute -inset-2 rounded-full blur-xl transition-opacity duration-700"
        style={{
          backgroundColor: uni.color,
          opacity: isActive ? 0.35 : 0,
        }}
      />
      {/* Logo */}
      <div
        className="relative h-14 w-14 flex items-center justify-center rounded-full border transition-all duration-500"
        style={{
          borderColor: isActive ? uni.color : "var(--surface-border)",
          backgroundColor: isActive ? `${uni.color}15` : "var(--surface)",
          boxShadow: isActive ? `0 0 20px ${uni.color}40` : "none",
        }}
      >
        {logoOk ? (
          <Image
            src={`/${uni.logoFile}`}
            alt={uni.name}
            width={36}
            height={36}
            className="h-8 w-8 object-contain transition-all duration-500"
            style={{
              filter: isActive ? "none" : "grayscale(100%)",
              opacity: isActive ? 1 : 0.5,
            }}
            onError={() => {
              setLogoOk(false);
              onLogoError(uni.logoFile);
            }}
          />
        ) : (
          <span className="text-xs font-bold text-muted">{uni.shortName.charAt(0)}</span>
        )}
      </div>
      {/* Name */}
      <span
        className="text-xs font-medium transition-colors duration-500 whitespace-nowrap"
        style={{ color: isActive ? uni.color : "var(--muted)" }}
      >
        {uni.shortName}
      </span>
    </div>
  );
}

