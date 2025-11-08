// /src/js/teamManager.js
import { db, auth, FieldValue } from '../firebase-config.js';
let currentTeamTasksUnsubscribe = null;
let currentUpdatesUnsubscribe = null;
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
    if (!userId) return () => { }; // Return an empty unsubscribe function

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

/**
 * Invites a user to a team by their email.
 * @param {string} teamID - The ID of the team.
 * @param {string} teamName - The name of the new team.
 * @param {string} email - The email of the user to invite.
 */
export async function inviteMemberByEmail(teamID, teamName, email) {
    const user = auth.currentUser;
    if (!email) return Promise.reject("Email cannot be empty.");

    const lowerCaseEmail = email.toLowerCase(); // The email being invited

    try {
        // --- PERMISSION CHECK 1: Is user the admin? ---
        const teamRef = db.collection('teams').doc(teamID);
        const teamDoc = await teamRef.get();

        if (!teamDoc.exists) {
            return Promise.reject("This team does not exist.");
        }
        const teamData = teamDoc.data();
        if (teamData.createdBy !== user.uid) {
            return Promise.reject("Only the team admin can send invites.");
        }

        // --- ROBUST CHECK 2: Is user already a member? ---
        const memberUIDs = teamData.members;
        const memberDocs = await Promise.all(
            memberUIDs.map(uid => db.collection('users').doc(uid).get())
        );
        const memberEmails = memberDocs.map(doc =>
            (doc.exists && doc.data().email) ? doc.data().email.toLowerCase() : null
        );
        if (memberEmails.includes(lowerCaseEmail)) {
            return Promise.reject("This user is already a member of the team.");
        }

        // --- NEW CHECK 3: Is an invite already pending? ---
        const inviteRef = db.collection('invites').doc(lowerCaseEmail);
        const inviteDoc = await inviteRef.get();

        if (inviteDoc.exists) {
            // Check if an invite for this *specific team* is already pending
            const pendingInvites = inviteDoc.data().pendingInvites || [];
            if (pendingInvites.some(invite => invite.teamID === teamID)) {
                return Promise.reject("An invite has already been sent to this user for this team.");
            }
        }
        // --- END NEW CHECK ---

        // If all checks pass, send the invite
        const invite = {
            teamID: teamID,
            teamName: teamName,
            invitedByEmail: user.email
        };

        await inviteRef.set({
            pendingInvites: FieldValue.arrayUnion(invite)
        }, { merge: true });

    } catch (error) {
        console.error("Error sending invite:", error);
        return Promise.reject(error.message);
    }
}
/**
 * Gets a real-time stream of pending invites for the current user.
 * @param {function} callback - Function to run when invites change.
 */
export function getInvitesForUser(callback) {
    const user = auth.currentUser;
    if (!user) return () => { };

    // Listen for changes to the invites doc matching the user's email
    return db.collection('invites').doc(user.email.toLowerCase())
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                callback(data.pendingInvites || []);
            } else {
                callback([]);
            }
        });
}

/**
 * Accepts a pending invite, joining the team.
 * @param {object} invite - The invite object {teamID, teamName, ...}.
 */
export async function acceptInvite(invite) {
    const user = auth.currentUser;
    if (!user || !invite) return Promise.reject("Invalid invite.");

    try {
        const teamID = invite.teamID;

        // 1. Add user to the team's 'members' array
        await db.collection('teams').doc(teamID).update({
            members: FieldValue.arrayUnion(user.uid)
        });

        // 2. Add team to the user's 'teams' array
        await db.collection('users').doc(user.uid).set({
            teams: FieldValue.arrayUnion(teamID)
        }, { merge: true });

        // 3. Remove the invite from the 'invites' collection
        const inviteRef = db.collection('invites').doc(user.email.toLowerCase());
        await inviteRef.update({
            pendingInvites: FieldValue.arrayRemove(invite)
        });

    } catch (error) {
        console.error("Error accepting invite:", error);
        return Promise.reject(error.message);
    }
}

/**
 * Declines a pending invite.
 * @param {object} invite - The invite object {teamID, teamName, ...}.
 */
export async function declineInvite(invite) {
    const user = auth.currentUser;
    if (!user || !invite) return Promise.reject("Invalid invite.");

    try {
        // Remove the invite from the 'invites' collection
        const inviteRef = db.collection('invites').doc(user.email.toLowerCase());
        await inviteRef.update({
            pendingInvites: FieldValue.arrayRemove(invite)
        });
    } catch (error) {
        console.error("Error declining invite:", error);
        return Promise.reject(error.message);
    }
}
/**
 * Adds a new task to a team's subcollection.
 * @param {string} teamId - The ID of the team.
 * @param {object} taskData - { title, dueDate, priority }
 * @param {string} userId - The UID of the user creating the task.
 */
export async function addTeamTask(teamId, taskData, userId) {
    if (!taskData.title || !taskData.dueDate || !teamId || !userId) {
        return Promise.reject("Missing data to create a team task.");
    }

    return db.collection('teams').doc(teamId).collection('tasks').add({
        title: taskData.title,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        createdBy: userId, // The user who clicked "Add Task"
        completed: false,
        assignedTo: null, // We can implement this feature next
        status: 'Pending',
        createdAt: FieldValue.serverTimestamp()
    });
}
/**
 * Stops the real-time listener for team tasks.
 */
export function unsubscribeFromTeamTasks() {
    if (currentTeamTasksUnsubscribe) {
        currentTeamTasksUnsubscribe();
        currentTeamTasksUnsubscribe = null;
    }
}
/**
 * Gets a real-time stream of updates for a specific task.
 * @param {string} teamId - The ID of the team.
 * @param {string} taskId - The ID of the task.
 * @param {function} callback - Function to run when updates change.
 */
export function getTaskUpdates(teamId, taskId, callback) {
    if (currentUpdatesUnsubscribe) {
        currentUpdatesUnsubscribe();
    }

    const updatesRef = db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('updates')
        .orderBy('createdAt', 'asc'); // Show oldest first

    currentUpdatesUnsubscribe = updatesRef.onSnapshot(snapshot => {
        const updates = [];
        snapshot.forEach(doc => {
            updates.push({ id: doc.id, ...doc.data() });
        });
        callback(updates);
    });
}

/**
 * Adds a new progress update to a task.
 * @param {string} teamId - The ID of the team.
 * @param {string} taskId - The ID of the task.
 * @param {string} updateText - The content of the update.
 */
export async function addTaskUpdate(teamId, taskId, updateText) {
    const user = auth.currentUser;
    if (!user || !updateText) return Promise.reject("No update text or user.");

    const update = {
        text: updateText,
        createdByEmail: user.email,
        createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('updates').add(update);
}

/**
 * Stops the real-time listener for task updates.
 */
export function unsubscribeFromTaskUpdates() {
    if (currentUpdatesUnsubscribe) {
        currentUpdatesUnsubscribe();
        currentUpdatesUnsubscribe = null;
    }
}
//  Get Team Tasks
export function getTeamTasks(teamId, filters, renderCallback, taskListElement) {

    let tasksRef = db.collection('teams').doc(teamId).collection('tasks');

    // Apply filters
    if (filters.status === 'pending') {
        tasksRef = tasksRef.where('completed', '==', false);
    } else if (filters.status === 'completed') {
        tasksRef = tasksRef.where('completed', '==', true);
    }

    // Apply sorting
    if (filters.sort === 'dueDate') {
        tasksRef = tasksRef.orderBy('dueDate');
    } else {
        tasksRef = tasksRef.orderBy('createdAt', 'desc'); // Default sort
    }

    currentTeamTasksUnsubscribe = tasksRef.onSnapshot(snapshot => {
        const tasks = [];
        snapshot.forEach(doc => {
            tasks.push({ id: doc.id, ...doc.data() });
        });

        // Client-side sort for priority
        if (filters.sort === 'priority') {
            const priorityMap = { "High": 0, "Medium": 1, "Low": 2 };
            tasks.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority]);
        }

        // Pass both tasks and the element to the callback
        renderCallback(tasks, taskListElement);
    });
}

// TODO: Add functions for getTeamTasks, addTeamTask, inviteMember, etc.