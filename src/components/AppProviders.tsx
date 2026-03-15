"use client";

import { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { GameStoreProvider } from "@/lib/gameStore";

function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, mappedUserId, errorMessage, signInWithGoogle, signOutUser } = useAuth();

  if (status === "loading") {
    return (
      <main className="appShell authShell">
        <section className="panel authPanel">
          <h1>Loading...</h1>
          <p className="muted">Checking login session.</p>
        </section>
      </main>
    );
  }

  if (status === "unconfigured") {
    return (
      <main className="appShell authShell">
        <section className="panel authPanel">
          <h1>Auth Not Configured</h1>
          <p className="muted">{errorMessage ?? "Missing Firebase settings."}</p>
          <p className="muted">Fill `.env.local` with Firebase values and reload.</p>
        </section>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="appShell authShell">
        <section className="panel authPanel">
          <h1>Sign In</h1>
          <p className="muted">Use Google sign-in to access the game.</p>
          {errorMessage ? <p className="muted">{errorMessage}</p> : null}
          <button type="button" onClick={() => void signInWithGoogle()} className="authButton">
            Continue with Google
          </button>
        </section>
      </main>
    );
  }

  if (!mappedUserId) {
    return (
      <main className="appShell authShell">
        <section className="panel authPanel">
          <h1>No Role Mapping</h1>
          <p className="muted">Signed in as {user?.email ?? "unknown email"}.</p>
          <p className="muted">Add this account to role mapping env vars, then sign in again.</p>
          <button type="button" onClick={() => void signOutUser()} className="authButton secondaryButton">
            Sign Out
          </button>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return <GameStoreProvider currentUserId={mappedUserId} firebaseUid={user.uid}>{children}</GameStoreProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
