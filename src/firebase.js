import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCU-ifKFeJdGSkZPomGKvX33awN8cHtE9c",
  authDomain: "kronex-ea52e.firebaseapp.com",
  projectId: "kronex-ea52e",
  storageBucket: "kronex-ea52e.firebasestorage.app",
  messagingSenderId: "684877330486",
  appId: "1:684877330486:web:688c89be6d10f831340097",
  measurementId: "G-RWJVHNT33G"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
