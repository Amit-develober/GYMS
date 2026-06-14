// Firebase SDK Configuration & Initialization
// Configured with active project details for "gympro-b9732"

const firebaseConfig = {
  apiKey: "AIzaSyC71GiSJkNkToXi68NenIs1kna5PT1CrLU",
  authDomain: "gympro-b9732.firebaseapp.com",
  projectId: "gympro-b9732",
  storageBucket: "gympro-b9732.firebasestorage.app",
  messagingSenderId: "903579992662",
  appId: "1:903579992662:web:abe0c30bcefd607c4f31f7",
  measurementId: "G-1HE5319V02"
};

// Check if credentials are set
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

let app = null;
let auth = null;
let db = null;
let isFirebaseConnected = false;

if (isConfigValid) {
  try {
    // Import SDK modules dynamically using standard ES modules
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseConnected = true;
    console.log("Firebase initialized successfully on project: gympro-b9732.");
  } catch (error) {
    console.warn("Firebase initialization failed. Falling back to Local Storage.", error);
  }
} else {
  console.log("No valid Firebase configuration found. Running in Local Storage Demo Mode.");
}

export { app, auth, db, isFirebaseConnected };
