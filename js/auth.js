// Authentication Interface - Unified Firebase Auth / Mock Local Auth
import { auth, isFirebaseConnected } from "./firebase-config.js";

// Lazy-load Firebase Auth only if Firebase is connected
let firebaseAuth = null;
if (isFirebaseConnected && auth) {
  try {
    firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
  } catch (err) {
    console.error("Failed to load Firebase Auth module. Switching to Mock Auth.", err);
  }
}

// Local mock user session storage
let localUser = JSON.parse(localStorage.getItem("gym_demo_user")) || null;
const authListeners = [];

const triggerAuthListeners = (user) => {
  authListeners.forEach((cb) => cb(user));
};

export const authAPI = {
  async login(email, password) {
    if (firebaseAuth && auth) {
      const userCredential = await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } else {
      if (email && password.length >= 6) {
        localUser = { email, uid: "demo_" + email.replace(/[^a-zA-Z0-9]/g, "") };
        localStorage.setItem("gym_demo_user", JSON.stringify(localUser));
        triggerAuthListeners(localUser);
        return localUser;
      }
      throw new Error("Password must be at least 6 characters for demo mode.");
    }
  },

  async signup(email, password) {
    if (firebaseAuth && auth) {
      const userCredential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } else {
      if (email && password.length >= 6) {
        localUser = { email, uid: "demo_" + email.replace(/[^a-zA-Z0-9]/g, "") };
        localStorage.setItem("gym_demo_user", JSON.stringify(localUser));
        triggerAuthListeners(localUser);
        return localUser;
      }
      throw new Error("Password must be at least 6 characters for demo mode.");
    }
  },

  async loginWithGoogle() {
    if (firebaseAuth && auth) {
      const provider = new firebaseAuth.GoogleAuthProvider();
      const userCredential = await firebaseAuth.signInWithPopup(auth, provider);
      return userCredential.user;
    } else {
      // Create a mock Google user
      localUser = { email: "google_demo_admin@gmail.com", uid: "demo_google_admin" };
      localStorage.setItem("gym_demo_user", JSON.stringify(localUser));
      triggerAuthListeners(localUser);
      return localUser;
    }
  },

  async logout() {
    if (firebaseAuth && auth) {
      await firebaseAuth.signOut(auth);
    } else {
      localUser = null;
      localStorage.removeItem("gym_demo_user");
      triggerAuthListeners(null);
    }
  },

  onAuthStateChanged(callback) {
    authListeners.push(callback);
    if (firebaseAuth && auth) {
      firebaseAuth.onAuthStateChanged(auth, (user) => {
        callback(user);
      });
    } else {
      // Fire callback with the initial mock state
      setTimeout(() => callback(localUser), 0);
    }
  },

  getCurrentUser() {
    if (firebaseAuth && auth) {
      return auth.currentUser;
    } else {
      return localUser;
    }
  }
};
