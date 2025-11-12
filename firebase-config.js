import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js"
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  startAfter,
  onSnapshot,
  Timestamp,
  serverTimestamp, 
  increment 
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  updateEmail,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL }from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCW9VW5MGePB2_vH8Ay0RXqzcG6acRy4Gg",
  authDomain: "comlog-b733f.firebaseapp.com",
  databaseURL: "https://comlog-b733f-default-rtdb.firebaseio.com",
  projectId: "comlog-b733f",
  storageBucket: "comlog-b733f.appspot.com",
  messagingSenderId: "470684182726",
  appId: "1:470684182726:web:25f3a8484df2db77684fc7",
  measurementId: "G-MFRED6BJX5",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
export const storage = getStorage(app); 

let analytics;
try {
  analytics = getAnalytics(app);
} catch (error) {
  console.warn("Analytics could not be initialized:", error);
}

// Export Firebase services
export {
  app,
  db,
  auth,
  analytics,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  Timestamp,
  serverTimestamp, 
  increment,
  ref,
  uploadBytes,
  getDownloadURL,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  updateEmail,
  deleteUser,
  logEvent,
};