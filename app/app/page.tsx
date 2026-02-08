"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

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
        <div className="max-w-2xl text-center space-y-8">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
            UniChat
          </h1>
          <p className="text-xl text-foreground/60 max-w-lg mx-auto">
            Random video chat for university students. Meet people from campuses
            across the country — anonymously and securely.
          </p>

          <button
            onClick={handleGetStarted}
            disabled={loading}
            className="rounded-xl bg-foreground px-8 py-3.5 text-lg text-background font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Loading..." : user ? "Go to Chat" : "Get Started"}
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8">
            <div className="space-y-2">
              <div className="text-2xl">@</div>
              <h3 className="font-semibold">University Verified</h3>
              <p className="text-sm text-foreground/60">
                Only .ac.uk and .edu email addresses. Every user is a real
                student.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-2xl">&lt;/&gt;</div>
              <h3 className="font-semibold">Peer-to-Peer</h3>
              <p className="text-sm text-foreground/60">
                Video streams go directly between you and your partner. No
                server in the middle.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-2xl">?</div>
              <h3 className="font-semibold">Anonymous</h3>
              <p className="text-sm text-foreground/60">
                Your identity is never shared. Chat freely with no strings
                attached.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
