"use client";

import {
  Auth,
  GoogleAuthProvider,
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { getFirebase } from "@/lib/firebase";
import { getPublicEnv } from "@/lib/runtimeEnv";

type AuthStatus = "loading" | "unauthenticated" | "authenticated" | "unconfigured" | "error";

interface AuthContextValue {
  status: AuthStatus;
  user: FirebaseUser | null;
  mappedUserId: string | null;
  errorMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const GM_USER_ID = "u-gm";
const USA_USER_ID = "u-1";
const USSR_USER_ID = "u-2";
const FINLAND_USER_ID = "u-3";

function parseSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
}

function resolveMappedUserId(user: FirebaseUser | null): string | null {
  if (!user) {
    return null;
  }

  const gmEmails = parseSet(getPublicEnv("NEXT_PUBLIC_GM_EMAILS"));
  const usaEmails = parseSet(getPublicEnv("NEXT_PUBLIC_USA_EMAILS"));
  const ussrEmails = parseSet(getPublicEnv("NEXT_PUBLIC_USSR_EMAILS"));
  const finlandEmails = parseSet(getPublicEnv("NEXT_PUBLIC_FINLAND_EMAILS"));

  const gmUids = parseSet(getPublicEnv("NEXT_PUBLIC_GM_UIDS"));
  const usaUids = parseSet(getPublicEnv("NEXT_PUBLIC_USA_UIDS"));
  const ussrUids = parseSet(getPublicEnv("NEXT_PUBLIC_USSR_UIDS"));
  const finlandUids = parseSet(getPublicEnv("NEXT_PUBLIC_FINLAND_UIDS"));

  const uid = user.uid.toLowerCase();
  const email = (user.email ?? "").toLowerCase();
  const localPart = email.includes("@") ? email.split("@")[0] : "";

  if (gmUids.has(uid) || gmEmails.has(email) || localPart === "gm") {
    return GM_USER_ID;
  }
  if (usaUids.has(uid) || usaEmails.has(email) || localPart === "usa") {
    return USA_USER_ID;
  }
  if (ussrUids.has(uid) || ussrEmails.has(email) || localPart === "ussr" || localPart === "soviet") {
    return USSR_USER_ID;
  }
  if (finlandUids.has(uid) || finlandEmails.has(email) || localPart === "finland") {
    return FINLAND_USER_ID;
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const firebase = getFirebase();
      setAuth(firebase.auth);
      unsubscribe = onAuthStateChanged(firebase.auth, (nextUser) => {
        setUser(nextUser);
        setStatus(nextUser ? "authenticated" : "unauthenticated");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase config is missing.";
      setErrorMessage(message);
      setStatus("unconfigured");
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      setStatus("error");
      setErrorMessage("Auth is not configured.");
      return;
    }

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in.";
      setErrorMessage(message);
    }
  };

  const signOutUser = async () => {
    if (!auth) {
      return;
    }
    await signOut(auth);
  };

  const mappedUserId = useMemo(() => resolveMappedUserId(user), [user]);

  const value: AuthContextValue = {
    status,
    user,
    mappedUserId,
    errorMessage,
    signInWithGoogle,
    signOutUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
