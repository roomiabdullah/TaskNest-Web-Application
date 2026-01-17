import { auth, db, FieldValue } from '../../firebase-config.js';

export class AuthService {
    constructor() {
        this.isSigningUp = false;
    }

    /**
     * Observes authentication state changes.
     * @param {Function} onUserLoggedIn - Callback when user logs in.
     * @param {Function} onUserLoggedOut - Callback when user logs out.
     */
    observeAuthState(onUserLoggedIn, onUserLoggedOut) {
        auth.onAuthStateChanged(user => {
            // Prevent redirect race condition during signup
            if (this.isSigningUp) return;

            if (user) {
                onUserLoggedIn(user);
            } else {
                onUserLoggedOut();
            }
        });
    }

    /**
     * Logs in the user.
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<any>}
     */
    async login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            // Optional: Update email in DB to ensure consistency (legacy support)
            await db.collection('users').doc(userCredential.user.uid).set({
                email: email.toLowerCase()
            }, { merge: true });

            return userCredential.user;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Signs up a new user and creates their Firestore document.
     * @param {string} firstName 
     * @param {string} lastName 
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<any>}
     */
    async signup(firstName, lastName, email, password) {
        this.isSigningUp = true; // Set flag
        try {
            // 1. Create Auth User
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // 2. Create Firestore Document
            await db.collection('users').doc(user.uid).set({
                firstName: firstName,
                lastName: lastName,
                displayName: `${firstName} ${lastName}`,
                email: user.email.toLowerCase(),
                teams: [],
                createdAt: FieldValue.serverTimestamp()
            });

            this.isSigningUp = false; // Reset flag on success
            return user;
        } catch (error) {
            this.isSigningUp = false; // Reset flag on error
            throw error;
        }
    }

    /**
     * Logs out the current user.
     */
    async logout() {
        await auth.signOut();
    }

    /**
     * Gets the current user data from Firestore.
     * @param {string} uid 
     * @returns {Promise<Object>}
     */
    async getUserData(uid) {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    }
    /**
     * Updates user profile (name).
     */
    async updateProfile(user, firstName, lastName) {
        const displayName = `${firstName} ${lastName}`;
        // Update Auth
        // await user.updateProfile({ displayName }); // Client SDK sometimes quirky with re-auth, but should work.
        // Actually, pure client SDK 'updateProfile' is deprecated in v9 but safe in v8 compat.
        // We will perform Firestore update primarily.

        await db.collection('users').doc(user.uid).update({
            firstName,
            lastName,
            displayName
        });

        return displayName;
    }

    /**
     * Deletes the user account permanently.
     * @param {Object} user - The Firebase User object
     * @param {Object} transferMap - Map of { teamId: newAdminUid }
     * @param {Array} teamsToTransfer - List of team objects that require transfer
     */
    async deleteAccount(user, transferMap = {}, teamsToTransfer = []) {
        const uid = user.uid;

        // 1. Process Admin Transfers
        // We need to import TeamService helper or perform the updates here.
        // To keep services decoupled, we assume 'dashboard.js' or caller handles the logic?
        // OR we just do direct DB updates here for atomicity of the operation concept.
        // Let's do direct DB updates here as this is a "Destructive/Cleanup" service operation.

        for (const team of teamsToTransfer) {
            const newAdminId = transferMap[team.id];
            if (newAdminId) {
                await db.collection('teams').doc(team.id).update({
                    admins: FieldValue.arrayUnion(newAdminId)
                });
            }
        }

        // 2. Delete Personal Tasks (stored in /users/{uid}/tasks subcollection)
        const tasksQuery = await db.collection('users').doc(uid).collection('tasks').get();

        const batch = db.batch();
        tasksQuery.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // 3. Remove user from all teams (members and admins lists)
        const userDoc = await db.collection('users').doc(uid).get();
        const teamIds = userDoc.data()?.teams || [];

        for (const teamId of teamIds) {
            await db.collection('teams').doc(teamId).update({
                members: FieldValue.arrayRemove(uid),
                admins: FieldValue.arrayRemove(uid)
            });
        }

        // 4. Delete user's invite document (if exists)
        const userEmail = user.email?.toLowerCase();
        if (userEmail) {
            const inviteDoc = db.collection('invites').doc(userEmail);
            const inviteSnapshot = await inviteDoc.get();
            if (inviteSnapshot.exists) {
                await inviteDoc.delete();
            }
        }

        // 5. Delete User Document
        await db.collection('users').doc(uid).delete();

        // 6. Delete Auth User
        try {
            await user.delete();
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                // If this fails, we effectively have a "ghost" user in Auth but data is gone.
                // We should alert the user to re-login.
                throw new Error("For security, please log out and log back in before deleting your account.");
            }
            throw error;
        }
    }
}
