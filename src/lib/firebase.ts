import { FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { getPublicEnv } from "@/lib/runtimeEnv";

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cached: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (cached) {
    return cached;
  }

  const config = {
    apiKey: getPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: getPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID")
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing Firebase env vars: ${missing.join(", ")}`);
  }

  const app = getApps()[0] ?? initializeApp(config);
  cached = {
    app,
    auth: getAuth(app),
    db: getFirestore(app)
  };

  return cached;
}
