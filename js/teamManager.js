// /src/js/teamManager.js
import { db, auth, FieldValue } from '../firebase-config.js';

/**
 * Creates a new team and adds the current user as the admin.
 * @param {string} teamName - The name of the new team.
 */
export async function createTeam(teamName) {
    const user = auth.currentUser;
    if (!user) return Promise.reject("No user logged in");
    if (!teamName) return Promise.reject("Team name cannot be empty");

    try {
        // 1. Create the team document
        const teamRef = await db.collection('teams').add({
            name: teamName,
            createdBy: user.uid,
            members: [user.uid], // Creator is the first member
            teamCode: (Math.random().toString(36).substring(2, 8)).toUpperCase()
        });

        // 2. Add this team to the user's "teams" array (in the 'users' collection)
        const userRef = db.collection('users').doc(user.uid);
        await userRef.set({
        // This 'set' with 'merge: true' will create the doc if it's missing,
        // or just update it if it already exists.
            teams: FieldValue.arrayUnion(teamRef.id)
        }, { merge: true });
        
        return teamRef;
    } catch (error) {
        console.error("Error creating team:", error);
        return Promise.reject(error.message);
    }
}

/**
 * Gets a real-time stream of the user's teams.
 * @param {string} userId - The UID of the current user.
 * @param {function} callback - Function to run when team data changes.
 */
export function getTeamsForUser(userId, callback) {
    if (!userId) return () => {}; // Return an empty unsubscribe function

    // Listen for changes to the user's document
    return db.collection('users').doc(userId)
        .onSnapshot(async (doc) => {
            const userData = doc.data();
            if (userData && userData.teams && userData.teams.length > 0) {
                // Fetch the details for each team
                const teamPromises = userData.teams.map(teamID => 
                    db.collection('teams').doc(teamID).get()
                );
                const teamDocs = await Promise.all(teamPromises);
                const teams = teamDocs
                    .filter(teamDoc => teamDoc.exists) // Ensure team exists
                    .map(teamDoc => ({
                        id: teamDoc.id,
                        ...teamDoc.data()
                    }));
                callback(teams);
            } else {
                callback([]); // User is in no teams
            }
        });
}

// TODO: Add functions for getTeamTasks, addTeamTask, inviteMember, etc.