// Firebase Configuration
// Substitua as strings abaixo pelas suas credenciais do Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyBgcY_d-3H8LzmcvEN3M4BfCls9H4vr25o",
    authDomain: "gestor-sp.firebaseapp.com",
    projectId: "gestor-sp",
    storageBucket: "gestor-sp.firebasestorage.app",
    messagingSenderId: "749056549451",
    appId: "1:749056549451:web:3e12d7a07dadf276f323ce"
};

// Initialize Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, doc, setDoc, getDoc, updateDoc };
