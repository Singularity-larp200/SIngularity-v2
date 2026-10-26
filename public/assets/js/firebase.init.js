import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFQFc5KcUDWT7r-V0UvyUznQ6IeCESINg",
  authDomain: "larp-larp-sahur.firebaseapp.com",
  projectId: "larp-larp-sahur",
  storageBucket: "larp-larp-sahur.firebasestorage.app",
  messagingSenderId: "810674651244",
  appId: "1:810674651244:web:85fdecc13a4dc8dd0a5849",
  databaseURL: "https://larp-larp-sahur-default-rtdb.firebaseio.com",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
