// /src/firebase-config.js

// PASTE YOUR FIREBASE CONFIGURATION HERE
const firebaseConfig = {
    apiKey: "AIzaSyDAVEPguCIyI43It6q4DZuSzW1gKwZ1z0E",
    authDomain: "tasknestapp-b8d2e.firebaseapp.com",
    projectId: "tasknestapp-b8d2e",
    storageBucket: "tasknestapp-b8d2e.firebasestorage.app",
    messagingSenderId: "5527435505",
    appId: "1:5527435505:web:5878e64a4a46c02415d150",
    measurementId: "G-FSJWP6PHKT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export the services all other modules will need
export const auth = firebase.auth();
export const db = firebase.firestore();
export const FieldValue = firebase.firestore.FieldValue;