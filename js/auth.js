// auth.js

// Import the services from your config file
import { auth, db, FieldValue } from '../firebase-config.js';

// DOM Elements
const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');

// Login Form
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const showSignup = document.getElementById('show-signup');

// Signup Form
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupButton = document.getElementById('signup-button');
const showLogin = document.getElementById('show-login');

// View Toggling
showSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
    signupView.classList.add('flex');
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupView.classList.add('hidden');
    signupView.classList.remove('flex');
    loginView.classList.remove('hidden');
});

// Authentication
auth.onAuthStateChanged(user => {
    if (user) {
        // User is logged in, redirect them to the dashboard
        window.location.href = 'dashboard.html';
    } else {
        // User is logged out, make sure the login form is visible
        signupView.classList.add('hidden');
        signupView.classList.remove('flex');
        loginView.classList.remove('hidden');
    }
});

// Login User
loginButton.addEventListener('click', () => {
    const email = loginEmail.value;
    const password = loginPassword.value;
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => alert(error.message));
});

// Signup User
signupButton.addEventListener('click', () => {
    const email = signupEmail.value;
    const password = signupPassword.value;
    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            // When a new user signs up, create a document for them
            // This is essential for storing their personal tasks and team list
            const user = userCredential.user;
            db.collection('users').doc(user.uid).set({
                email: user.email,
                teams: [] // Initialize an empty array for their teams
            })
            .catch(err => console.error("Error creating user document: ", err));
        })
        .catch(error => alert(error.message));
});