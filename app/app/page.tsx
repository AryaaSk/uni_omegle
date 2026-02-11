"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { FEATURED_UNIVERSITIES } from "@/lib/universities";

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

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-3xl text-center space-y-8">
          {/* Hero */}
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
            uni<span className="text-primary">omegle</span>
          </h1>
          <p className="text-xl text-muted max-w-lg mx-auto">
            Video chat with students from universities across the UK.
            Anonymous. Verified. Fun.
          </p>

          <button
            onClick={handleGetStarted}
            disabled={loading}
            className="rounded-full bg-primary px-10 py-4 text-lg text-background font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-lg shadow-primary/25"
          >
            {loading ? "Loading..." : user ? "Go to Chat" : "Get Started"}
          </button>

          <p className="text-sm text-muted/50">
            Free. No downloads. Just your uni email.
          </p>
        </div>

        {/* University Logo Ticker */}
        <div className="w-full mt-20 space-y-4">
          <p className="text-center text-sm text-muted/60 uppercase tracking-widest font-medium">
            Trusted by students from
          </p>
          <UniversityTicker />
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full mt-20">
          <FeatureCard
            icon={<ShieldIcon />}
            iconColor="text-primary bg-primary/10"
            title="University Verified"
            description="Only .ac.uk and .edu email addresses. Every user is a real student."
          />
          <FeatureCard
            icon={<LinkIcon />}
            iconColor="text-accent bg-accent/10"
            title="Peer-to-Peer"
            description="Video streams go directly between you and your partner. No server in the middle."
          />
          <FeatureCard
            icon={<MaskIcon />}
            iconColor="text-highlight bg-highlight/10"
            title="Anonymous"
            description="Only your university is shown. Chat freely with no strings attached."
          />
        </div>
      </main>
    </div>
  );
}

// ========================
// University Logo Ticker
// ========================

function UniversityTicker() {
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  const unis = FEATURED_UNIVERSITIES.filter((u) => !failedLogos.has(u.logoFile));

  // If no logos loaded yet (user hasn't added SVGs), show text badges instead
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

  // Double the list for seamless loop
  const doubled = [...unis, ...unis];

  return (
    <div className="relative overflow-hidden">
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div
        className="flex items-center gap-12 py-4"
        style={{ animation: "marquee 40s linear infinite", width: "max-content" }}
      >
        {doubled.map((uni, i) => (
          <Image
            key={`${uni.domain}-${i}`}
            src={`/logos/${uni.logoFile}`}
            alt={uni.name}
            width={48}
            height={48}
            className="h-10 w-auto opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300"
            onError={() => handleLogoError(uni.logoFile)}
          />
        ))}
      </div>
    </div>
  );
}

// ========================
// Feature Card
// ========================

function FeatureCard({
  icon,
  iconColor,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 space-y-4">
      <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl ${iconColor}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}

// ========================
// SVG Icons
// ========================

function ShieldIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function MaskIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
