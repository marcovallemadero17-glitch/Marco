import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID;

// Use applet config as fallback if env vars are missing (for AI Studio preview)
let finalConfig = { ...firebaseConfig };
let finalDatabaseId = firestoreDatabaseId;

try {
  // @ts-ignore - this file might not exist in all environments
  const appletConfig = await import('../firebase-applet-config.json');
  const configData = appletConfig.default || appletConfig;
  
  if (!finalConfig.apiKey) {
    finalConfig = {
      ...finalConfig,
      apiKey: configData.apiKey,
      authDomain: configData.authDomain,
      projectId: configData.projectId,
      storageBucket: configData.storageBucket,
      messagingSenderId: configData.messagingSenderId,
      appId: configData.appId,
      measurementId: configData.measurementId,
    };
  }
  if (!finalDatabaseId) {
    finalDatabaseId = configData.firestoreDatabaseId;
  }
} catch (e) {
  // Ignore error if file is missing
}

const app = initializeApp(finalConfig);
export const db = getFirestore(app, finalDatabaseId);
export const auth = getAuth(app);
