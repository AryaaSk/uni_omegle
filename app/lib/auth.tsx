"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

// ========================
// University Email Validation
// ========================

const ALLOWED_DOMAINS = [".ac.uk", ".edu"];

function isUniversityEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => lower.endsWith(domain));
}

// ========================
// Auth Context
// ========================

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  sendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ========================
// Auth Provider
// ========================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isUniversityEmail(email)) {
      throw new Error(
        "Please use a university email address (.ac.uk or .edu)"
      );
    }
    const credential = await createUserWithEmailAndPassword(
      getFirebaseAuth(),
      email,
      password
    );
    // Automatically send verification email after sign-up
    await sendEmailVerification(credential.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const logOut = useCallback(async () => {
    await signOut(getFirebaseAuth());
  }, []);

  const sendVerification = useCallback(async () => {
    const currentUser = getFirebaseAuth().currentUser;
    if (currentUser) {
      await sendEmailVerification(currentUser);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signUp, signIn, logOut, sendVerification }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ========================
// useAuth Hook
// ========================
//triggering rebuild

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
