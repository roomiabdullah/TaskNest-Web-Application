import { db, FieldValue } from '../../firebase-config.js';

export class TeamService {
    constructor() {
        this.unsubscribeTeams = null;
        this.unsubscribeInvites = null;
    }

    /**
     * Create a new team.
     */
    async createTeam(teamName, user) {
        const teamRef = await db.collection('teams').add({
            name: teamName,
            createdBy: user.uid,
            members: [user.uid],
            admins: [user.uid], // Initialize with creator as admin
            teamCode: (Math.random().toString(36).substring(2, 8)).toUpperCase()
        });

        await db.collection('users').doc(user.uid).set({
            teams: FieldValue.arrayUnion(teamRef.id)
        }, { merge: true });

        return teamRef;
    }

    /**
     * Delete a team.
     */
    async deleteTeam(teamId, userId) {
        const teamRef = db.collection('teams').doc(teamId);
        const doc = await teamRef.get();

        if (!doc.exists) throw new Error("Team not found.");
        const data = doc.data();
        const admins = data.admins || [data.createdBy]; // Fallback for old teams
        if (!admins.includes(userId)) throw new Error("Only an Admin can delete this team.");

        // 1. Cascading Delete: Delete all Tasks (and their sub-collections)
        await this._deleteAllTeamTasks(teamId);

        // 2. Delete the team document
        await teamRef.delete();

        // 3. User references cleanup
        await db.collection('users').doc(userId).update({
            teams: FieldValue.arrayRemove(teamId)
        });
    }

    /**
     * Helper to delete all tasks and their subcollections recursively.
     */
    async _deleteAllTeamTasks(teamId) {
        const tasksRef = db.collection('teams').doc(teamId).collection('tasks');
        const tasksSnapshot = await tasksRef.get();

        if (tasksSnapshot.empty) return;

        // We process tasks in chunks or simply loop. 
        // For robustness, we handle subcollections for each task.
        const deletePromises = tasksSnapshot.docs.map(async (taskDoc) => {
            // Delete subTasks
            const subTasksSnapshot = await taskDoc.ref.collection('subTasks').get();
            if (!subTasksSnapshot.empty) {
                const batch = db.batch();
                subTasksSnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            // Delete updates
            const updatesSnapshot = await taskDoc.ref.collection('updates').get();
            if (!updatesSnapshot.empty) {
                const batch = db.batch();
                updatesSnapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            // Delete the task itself
            return taskDoc.ref.delete();
        });

        await Promise.all(deletePromises);
    }

    /**
     * Remove a member from a team.
     */
    async removeMember(teamId, memberId, currentUserUid) {
        // Permission check: Only admin can remove people (unless self leaving, but that's usually separate)
        // For simplicity, we assume UI handles "leave team" vs "remove member"
        // If removing someone else, must be admin.
        if (memberId !== currentUserUid) {
            const teamDoc = await db.collection('teams').doc(teamId).get();
            const admins = teamDoc.data().admins || [teamDoc.data().createdBy];
            if (!admins.includes(currentUserUid)) throw new Error("Only admins can remove members.");
        }

        await db.collection('teams').doc(teamId).update({
            members: FieldValue.arrayRemove(memberId),
            admins: FieldValue.arrayRemove(memberId) // Also remove from admins if they were one
        });

        // NOTE: We cannot remove the team from the user's document here because of security rules
        // (Only the user can write to their own document).
        // The user's 'subscribeToUserTeams' has self-cleaning logic that will remove this teamID
        // when they next try to fetch it and get permission-denied.
    }

    /**
     * Subscribe to a specific team's updates (Real-time).
     */
    subscribeToTeam(teamId, onUpdate, onError) {
        if (this.unsubscribeCurrentTeam) this.unsubscribeCurrentTeam();

        this.unsubscribeCurrentTeam = db.collection('teams').doc(teamId).onSnapshot(doc => {
            if (doc.exists) onUpdate({ id: doc.id, ...doc.data() });
            else onUpdate(null);
        }, error => {
            if (onError) onError(error);
        });
    }

    unsubscribeFromTeam() {
        if (this.unsubscribeCurrentTeam) {
            this.unsubscribeCurrentTeam();
            this.unsubscribeCurrentTeam = null;
        }
    }

    /**
     * Subscribe to user's teams list.
     */
    /**
     * Subscribe to user's teams list using a Query (Real-time & Robust).
     * Listens to 'teams' collection where 'members' contains userId.
     */
    subscribeToUserTeams(userId, onUpdate) {
        if (this.unsubscribeTeams) this.unsubscribeTeams();

        // FIX: Listen to the TEAMS collection directly.
        // This ensures that if I am removed from a team, this query updates INSTANTLY.
        // We do not rely on the potentially stale 'users/{id}' document for the list.
        this.unsubscribeTeams = db.collection('teams')
            .where('members', 'array-contains', userId)
            .onSnapshot(async (snapshot) => {
                const teams = [];
                const currentTeamIds = [];

                snapshot.forEach(doc => {
                    teams.push({ id: doc.id, ...doc.data() });
                    currentTeamIds.push(doc.id);
                });

                onUpdate(teams);

                // Self-cleaning: Ensure user document matches reality
                // We fetch the user doc once to check for discrepancies
                try {
                    const userDoc = await db.collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        const storedTeams = userDoc.data().teams || [];
                        // Find IDs that are in 'storedTeams' but NOT in 'currentTeamIds'
                        // (These are teams we were removed from)
                        const staleIds = storedTeams.filter(id => !currentTeamIds.includes(id));

                        if (staleIds.length > 0) {
                            // We found stale teams! Remove them from the User Doc.
                            // Since *we* (the user) are doing this write, it is allowed by rules.
                            await db.collection('users').doc(userId).update({
                                teams: FieldValue.arrayRemove(...staleIds)
                            });
                        }
                    }
                } catch (e) {
                    console.warn("Self-cleaning check failed:", e);
                }

            }, error => {
                console.error("Error fetching user teams:", error);
                onUpdate([]);
            });
    }

    // ===========================
    // INVITES
    // ===========================

    async inviteMember(teamId, teamName, email, currentUser) {
        const lowerCaseEmail = email.toLowerCase();

        // Check 1: Team Admin
        const teamRef = db.collection('teams').doc(teamId);
        const teamDoc = await teamRef.get();
        const admins = teamDoc.data().admins || [teamDoc.data().createdBy];
        if (!admins.includes(currentUser.uid)) throw new Error("Only admin can invite.");

        // Check 2: Check if potential member already exists in the team
        const members = teamDoc.data().members || [];
        // We need to resolve email to uid to check efficiently, OR check users collection.
        // But since we store members as UIDs, we first need to see if this EMAIL belongs to a UID that is in the list.
        // OR simpler: check if the 'users' collection has a doc with this email? 
        // Firebase Auth email search isn't directly available from client SDK easily without function.
        // WORKAROUND: We will rely on checking the Invites collection and also check if we can find the user.
        // Better approach for Client SDK: Check if the user is already in the team is hard if we only have email.
        // However, we CAN check if an invite is already pending.

        // Let's try to find if a user with this email exists in 'users' (requires us to query users by email if we set that up, which we didn't explicitly).
        // Standard NoSQL pattern: If we can't map email->uid easily, we just proceed to invite.
        // BUT, if the user accepts, we handle duplication there.
        // WAITING: The user said "if a member is already in a team".
        // Let's query the 'users' collection where email == lowerCaseEmail.
        // Note: This requires an index or enabling querying. Assuming simple setup:

        const userQuery = await db.collection('users').where('email', '==', lowerCaseEmail).get();
        if (!userQuery.empty) {
            const existingUser = userQuery.docs[0];
            if (members.includes(existingUser.id)) {
                throw new Error("User is already a member of this team.");
            }
            // Also check if they are already in the team's member list (if we missed it).
        }

        // Check 3: Check for pending duplicate invite
        const inviteRef = db.collection('invites').doc(lowerCaseEmail);
        const inviteDoc = await inviteRef.get();

        if (inviteDoc.exists) {
            const currentInvites = inviteDoc.data().pendingInvites || [];
            const isAlreadyInvited = currentInvites.some(inv => inv.teamID === teamId);
            if (isAlreadyInvited) throw new Error("User already has a pending invite.");
        }

        const invite = { teamID: teamId, teamName: teamName, invitedByEmail: currentUser.email };

        await inviteRef.set({
            pendingInvites: FieldValue.arrayUnion(invite)
        }, { merge: true });
    }

    subscribeToInvites(userEmail, onUpdate) {
        if (this.unsubscribeInvites) this.unsubscribeInvites();

        this.unsubscribeInvites = db.collection('invites').doc(userEmail.toLowerCase()).onSnapshot(doc => {
            if (doc.exists) onUpdate(doc.data().pendingInvites || []);
            else onUpdate([]);
        });
    }

    async acceptInvite(invite, userId, userEmail) {
        const teamID = invite.teamID;
        await db.collection('teams').doc(teamID).update({ members: FieldValue.arrayUnion(userId) });
        await db.collection('users').doc(userId).set({ teams: FieldValue.arrayUnion(teamID) }, { merge: true });

        const inviteRef = db.collection('invites').doc(userEmail.toLowerCase());
        await inviteRef.update({ pendingInvites: FieldValue.arrayRemove(invite) });
    }

    async declineInvite(invite, userEmail) {
        const inviteRef = db.collection('invites').doc(userEmail.toLowerCase());
        await inviteRef.update({ pendingInvites: FieldValue.arrayRemove(invite) });
    }

    /**
     * Get details of a single user (for member lists).
     */
    async getUserDetails(uid) {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? doc.data() : null;
    }

    /**
     * Promote a member to Admin.
     */
    async promoteToAdmin(teamId, memberId, currentUserUid) {
        const teamRef = db.collection('teams').doc(teamId);
        const doc = await teamRef.get();
        if (!doc.exists) throw new Error("Team not found");

        const data = doc.data();
        let admins = data.admins;

        // MIGRATION FIX: If 'admins' array doesn't exist yet, it's an old team.
        // The current admin is 'createdBy'. We must include them.
        if (!admins) {
            admins = [data.createdBy];
        }

        // Permission check
        if (!admins.includes(currentUserUid)) throw new Error("Only existing admins can promote others.");

        // If we are migrating (creating the field), we must set the whole array.
        // If we simply arrayUnion on a missing field, it creates [memberId] and drops createdBy.
        if (!data.admins) {
            await teamRef.update({
                admins: [data.createdBy, memberId]
            });
        } else {
            await teamRef.update({
                admins: FieldValue.arrayUnion(memberId)
            });
        }
    }

    /**
     * Check if user is the SOLE admin of any team.
     * Returns array of simple team objects {id, name} where they are sole admin.
     */
    async checkSoleAdminTeams(userId) {
        // We have to query teams where user is admin.
        // Since we can't easily query inside arrays with intricate logic client-side without potentially complex indexes,
        // and we already sync user's teams in dashboard...
        // ACTUALLY, we can just fetch the teams the user is in (from users collection) and check them.

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return []; // User document might be missing

        const teamIds = userDoc.data().teams || [];

        const soleAdminTeams = [];

        for (const teamId of teamIds) {
            const tDoc = await db.collection('teams').doc(teamId).get();
            if (!tDoc.exists) continue;

            const data = tDoc.data();
            const admins = data.admins || [data.createdBy];

            if (admins.includes(userId) && admins.length === 1) {
                soleAdminTeams.push({ id: teamId, name: data.name });
            }
        }
        return soleAdminTeams;
    }
}
