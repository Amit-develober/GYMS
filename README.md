# ApexGym — Premium Gym Management System

ApexGym is a state-of-the-art Single Page Application (SPA) and Progressive Web App (PWA) designed for modern gym operators. It streamlines student enrollment, daily attendance check-ins, monthly expense tracking, and business metrics dashboards. Built with a premium, high-fidelity dark-mode interface, it operates seamlessly both online (with Firebase backend syncing) and offline (using localized storage fallback).

## ✨ Features

- **📊 Comprehensive Dashboard**: Real-time indicators of total active members, today's check-ins, pending fees, monthly expenses, and profit/loss metrics.
- **📅 Attendance Logger**: Easy search filter by name/mobile with single-click attendance logging for the current day.
- **👤 Student Enrollment**: Register new members, select membership duration, record fees, and document payment methods (UPI, Cash, Card, Net Banking).
- **💸 Expense Tracking**: Manage gym operations costs, rent, utilities, and staff salaries.
- **📶 PWA & Smart Fallback**: Fully installable on mobile/tablet devices. Functions completely offline using local database fallbacks if no database credentials are provided.
- **🔒 Secure Authentication**: Embedded Firebase Auth for secure admin login and registration, including one-click sign-in with Google.

## 🛠️ Technology Stack

- **Frontend**: Single Page Application (SPA) written in semantic HTML5 and vanilla JavaScript (ES6 Modules).
- **Styling**: Premium custom CSS with CSS Custom Properties, smooth transitions, and glassmorphism styling.
- **Backend/Database**: Cloud Firestore & Firebase Auth (with automatic fallback to `localStorage` for offline / local-only use).
- **Offline Capabilities**: Service Workers (`sw.js`) caching core assets and an installable web app manifest (`manifest.json`).
- **Server**: Lightweight local Node.js static server for testing and routing.

## 🚀 Running Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/Amit-develober/GYMS.git
   cd GYMS
   ```
2. Run the local static server:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

## ⚙️ Connecting Firebase

To enable remote database synchronization:
1. Open the [js/firebase-config.js](file:///c:/Users/ad/Desktop/GYMS/js/firebase-config.js) file.
2. Replace the placeholder config with your Firebase Project configurations:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```
