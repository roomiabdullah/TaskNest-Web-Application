import { auth, db } from '../firebase-config.js';

// DOM Elements
const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');

// Login Form
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const showSignup = document.getElementById('show-signup');

// Signup Form
const signupFirstName = document.getElementById('signup-first-name');
const signupLastName = document.getElementById('signup-last-name');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupButton = document.getElementById('signup-button');
const showLogin = document.getElementById('show-login');

// --- RACE CONDITION FIX: State Flag ---
let isSigningUp = false;

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

// Authentication State Listener
auth.onAuthStateChanged(user => {
    // FIX: Only redirect if we are NOT currently in the middle of signing up
    if (user && !isSigningUp) {
        window.location.href = 'dashboard.html';
    } else if (!user) {
        // User is logged out, show login
        signupView.classList.add('hidden');
        signupView.classList.remove('flex');
        loginView.classList.remove('hidden');
    }
});

// Login User
loginButton.addEventListener('click', () => {
    const email = loginEmail.value;
    const password = loginPassword.value;

    if (!email || !password) {
        alert("Fields cannot be empty.");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            // Data Migration (Optional, keeps data clean)
            db.collection('users').doc(userCredential.user.uid).set({
                email: email.toLowerCase()
            }, { merge: true });
        })
        .catch(error => alert(error.message));
});

// Signup User
signupButton.addEventListener('click', async () => {
    const firstName = signupFirstName.value;
    const lastName = signupLastName.value;
    const email = signupEmail.value;
    const password = signupPassword.value;

    if (!firstName || !lastName || !email || !password) {
        alert("Please fill out all fields.");
        return;
    }

    // 1. SET FLAG: Tell the listener to ignore the immediate login event
    isSigningUp = true;

    try {
        // 2. Create Auth User
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 3. Create Firestore Document (This will now finish safely)
        await db.collection('users').doc(user.uid).set({
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            email: user.email.toLowerCase(),
            teams: []
        });

        // 4. MANUAL REDIRECT: Now that data is saved, we go to the dashboard
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error("Signup Error:", error);
        alert(error.message);
        isSigningUp = false; // Reset flag if it fails
    }
});