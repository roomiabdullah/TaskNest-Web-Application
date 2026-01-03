// /src/js/teamManager.js
import { db, auth, FieldValue } from '../firebase-config.js';
let currentTeamTasksUnsubscribe = null;
let currentUpdatesUnsubscribe = null;
let currentInvitesUnsubscribe = null;
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
/**
 * Gets a real-time stream of the user's teams AND cleans up stale data.
 */
export function getTeamsForUser(userId, callback) {
    if (!userId) return () => { };

    return db.collection('users').doc(userId)
        .onSnapshot(async (doc) => {
            const userData = doc.data();
            if (userData && userData.teams && userData.teams.length > 0) {
                
                const staleTeamIds = []; // IDs we need to remove
                const validTeams = [];   // Teams we will display

                // Check every team in the list
                const teamPromises = userData.teams.map(async (teamID) => {
                    try {
                        const teamDoc = await db.collection('teams').doc(teamID).get();
                        
                        // Case 1: Team exists and we have access
                        if (teamDoc.exists) {
                            return { id: teamDoc.id, ...teamDoc.data() };
                        } else {
                            // Case 2: Team was DELETED
                            staleTeamIds.push(teamID);
                            return null;
                        }
                    } catch (error) {
                        // Case 3: We were KICKED (Permission Denied)
                        // If we can't read the doc, we shouldn't have the ID.
                        if (error.code === 'permission-denied') {
                             staleTeamIds.push(teamID);
                        }
                        return null;
                    }
                });

                // Wait for all checks to finish
                const results = await Promise.all(teamPromises);
                const teams = results.filter(t => t !== null);

                // --- SELF-CLEANING BLOCK ---
                // If we found dead IDs, remove them from the User's profile immediately
                if (staleTeamIds.length > 0) {
                    console.log("Cleaning up stale teams:", staleTeamIds);
                    db.collection('users').doc(userId).update({
                        teams: FieldValue.arrayRemove(...staleTeamIds)
                    }).catch(e => console.warn("Cleanup warning:", e));
                }
                // ---------------------------

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
    if (currentInvitesUnsubscribe) currentInvitesUnsubscribe();
    currentInvitesUnsubscribe = db.collection('invites').doc(user.email.toLowerCase())
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                callback(data.pendingInvites || []);
            } else {
                callback([]);
            }
        }, err => {
            console.error('Invites listener error for', user.email && user.email.toLowerCase(), err && err.message ? err.message : err);
            callback([]);
        });

    return currentInvitesUnsubscribe;
}

/**
 * Stops the real-time listener for invites.
 */
export function unsubscribeFromInvites() {
    if (currentInvitesUnsubscribe) {
        currentInvitesUnsubscribe();
        currentInvitesUnsubscribe = null;
    }
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
    }, err => {
        console.error('Task updates listener error for', teamId, taskId, err && err.message ? err.message : err);
    });
}

/**
 * Adds a new progress update to a task.
 * @param {string} teamId - The ID of the team.
 * @param {string} taskId - The ID of the task.
 * @param {string} updateText - The content of the update.
 */
// Add 'userName' as the last argument
export async function addTaskUpdate(teamId, taskId, updateText, userName) {
    const user = auth.currentUser;
    if (!user || !updateText) return Promise.reject("No update text or user.");

    const update = {
        text: updateText,
        createdByName: userName, // <-- This now uses the name you passed
        createdBy_uid: user.uid, // <-- Store UID for security rules
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
    if (currentTeamTasksUnsubscribe) currentTeamTasksUnsubscribe();

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
    }, err => {
        console.error('Team tasks listener error for team', teamId, err && err.message ? err.message : err);
    });
}
/**
 * Adds a new sub-task to a main task.
 * @param {string} teamId
 * @param {string} taskId
 * @param {object} subTaskData - { title, assignedTo: { uid, email } }
 */
export async function addSubTask(teamId, taskId, subTaskData) {
    const user = auth.currentUser;
    if (!user || !subTaskData.title || !subTaskData.assignedTo) {
        return Promise.reject("Missing data for sub-task.");
    }

    await db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks').add({
        title: subTaskData.title,
        assignedTo_uid: subTaskData.assignedTo.uid,
        assignedTo_name: subTaskData.assignedTo.name, // <-- CHANGED from assignedTo_email
        completed: false,
        createdBy: user.uid
    });
}

/**
 * Toggles the 'completed' status of a sub-task.
 * @param {string} teamId
 * @param {string} taskId
 * @param {string} subTaskId
 * @param {boolean} currentStatus
 */
export async function toggleSubTaskStatus(teamId, taskId, subTaskId, currentStatus) {
    const user = auth.currentUser;

    // Security check: Make sure user is assigned to this task (or is admin)
    // For now, we'll just toggle.
    if (!user) return Promise.reject("No user found.");

    await db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks').doc(subTaskId).update({
        completed: !currentStatus
    });
}

/**
 * Listens to all sub-tasks for a main task and updates the progress bar.
 * @param {string} teamId
 * @param {string} taskId
 * @param {function} progressCallback - A function to call with the calculated percentage.
 */
export function listenToSubtasksForProgress(teamId, taskId, progressCallback) {
    // We removed the "if (currentSubtasksUnsubscribe)" line

    const subtasksRef = db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks');

    // ADD "return" HERE:
    return subtasksRef.onSnapshot(snapshot => {
        if (snapshot.empty) {
            progressCallback(0); // No sub-tasks, 0% complete
            return;
        }

        let completedCount = 0;
        snapshot.forEach(doc => {
            if (doc.data().completed) {
                completedCount++;
            }
        });

        const progress = (completedCount / snapshot.size) * 100;
        progressCallback(Math.round(progress));
    }, err => {
        console.error('Subtasks listener error for', teamId, taskId, err && err.message ? err.message : err);
    });
}
/**
 * Permanently deletes a team.
 * @param {string} teamId - The ID of the team to delete.
 */
export async function deleteTeam(teamId) {
    const user = auth.currentUser;
    if (!user || !teamId) return Promise.reject("Invalid data.");

    try {
        const teamRef = db.collection('teams').doc(teamId);
        const doc = await teamRef.get();
        
        if (!doc.exists) return Promise.reject("Team not found.");
        if (doc.data().createdBy !== user.uid) {
            return Promise.reject("Only the Team Admin can delete this team.");
        }

        // 1. Delete the Team Document
        await teamRef.delete();

        // 2. IMMEDIATE CLEANUP: Remove ID from the Admin's own profile
        await db.collection('users').doc(user.uid).update({
            teams: FieldValue.arrayRemove(teamId)
        });

    } catch (error) {
        console.error("Error deleting team:", error);
        return Promise.reject(error.message);
    }
}
/**
 * Removes a member from a team.
 * @param {string} teamId 
 * @param {string} memberId 
 */
/**
 * Removes a member from a team.
 * @param {string} teamId 
 * @param {string} memberId 
 */
export async function removeMember(teamId, memberId) {
    // Security check: simple client-side check
    if (!teamId || !memberId) return Promise.reject("Invalid IDs.");

    try {
        // 1. Remove the UID from the 'members' array in the Team document
        await db.collection('teams').doc(teamId).update({
            members: FieldValue.arrayRemove(memberId)
        });
        
        // Note: The 'getTeamsForUser' fix we added earlier handles the rest 
        // (hiding the team from the kicked user's sidebar automatically).
        
    } catch (error) {
        console.error("Error removing member:", error);
        throw error;
    }
} 
// End of teamManager helpers