// /src/js/dashboard.js
import { db } from '../firebase-config.js';
import { AuthService } from './services/AuthService.js';
import { TaskService } from './services/TaskService.js';
import { TeamService } from './services/TeamService.js';
import { UIManager } from './ui/UIManager.js';

// --- INITIALIZATION ---
const authService = new AuthService();
const taskService = new TaskService();
const teamService = new TeamService();
const ui = new UIManager();

let currentUser = null;
let currentView = 'personal'; // 'personal' | 'team'
let currentTeam = null;
let currentTaskDetailId = null; // For the details modal

// --- AUTH STATE OBSERVER ---
authService.observeAuthState(
    async (user) => {
        // User Logged In - create a mutable wrapper object
        currentUser = {
            uid: user.uid,
            email: user.email,
            firebaseUser: user, // Store the Firebase User object
            displayName: user.email // Default to email
        };

        // Fetch full user profile (for display name)
        try {
            const userDoc = await authService.getUserData(user.uid);
            if (userDoc) {
                currentUser.displayName = userDoc.displayName || user.email;
                currentUser.firstName = userDoc.firstName;
                currentUser.lastName = userDoc.lastName;
            } else {
                // GHOST USER CHECK:
                // If the user exists in Auth but has no Firestore profile, and is not "brand new",
                // it means Account Deletion partially failed (data gone, auth remains).
                const creationTime = new Date(user.metadata.creationTime).getTime();
                const now = Date.now();
                // Give a 10s buffer for new account creation latency
                if (now - creationTime > 10000) {
                    // Attempt to self-destruct if this is a zombie session
                    try {
                        await user.delete();
                        alert("Account deletion finalized.");
                        // user.delete() triggers onAuthStateChanged -> returns null -> redirects to login
                    } catch (err) {
                        if (err.code === 'auth/requires-recent-login') {
                            alert("Account data deleted. Please log in again to verify final removal.");
                        } else {
                            console.error("Auto-delete failed", err);
                            alert("Account data removed. Logging out.");
                        }
                        await authService.logout();
                    }
                }
            }
        } catch (e) { console.warn("Profile fetch error", e); }

        // Update UI Header
        const nameDisplay = document.getElementById('user-name-display');
        const emailDisplay = document.getElementById('user-email-display');
        const initialsDisplay = document.getElementById('user-initials');

        if (nameDisplay) nameDisplay.textContent = currentUser.displayName;
        if (emailDisplay) emailDisplay.textContent = currentUser.email;
        if (initialsDisplay) initialsDisplay.textContent = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();

        // Initialize App
        initializeDashboard();
    },
    () => {
        // User Logged Out
        window.location.href = 'login.html';
    }
);

// --- DASHBOARD LOGIC ---

function initializeDashboard() {
    // 1. Load Personal Tasks by default
    switchToPersonalView();

    // 2. Subscribe to Teams List
    teamService.subscribeToUserTeams(currentUser.uid, (teams) => {
        ui.renderTeamList(teams, currentTeam ? currentTeam.id : null, (selectedTeam) => {
            switchToTeamView(selectedTeam);
        });

        // REAL-TIME PERMISSION UPDATE:
        if (currentView === 'team' && currentTeam) {
            const updatedTeam = teams.find(t => t.id === currentTeam.id);
            if (updatedTeam) {
                currentTeam = updatedTeam;
                updateTeamPermissionsUI(updatedTeam);

                // If Manage Members modal is open, refresh it
                const manageModal = document.getElementById('manage-members-modal');
                if (manageModal && !manageModal.classList.contains('hidden')) {
                    refreshMembersList(currentTeam.id);
                }

                // FIX: Real-time update for Subtask Assignee Dropdown
                // If Task Details modal is open, refresh the assignee dropdown to reflect membership changes
                const detailsModal = document.getElementById('details-modal');
                if (detailsModal && !detailsModal.classList.contains('hidden')) {
                    populateSubtaskAssignees();
                }

                // Check for admin status change
                const admins = updatedTeam.admins || [updatedTeam.createdBy];
                const newRole = admins.includes(currentUser.uid) ? 'admin' : 'member';
                switchToTeamView(updatedTeam); // Re-render to ensure consistency
            } else {
                switchToPersonalView();
            }
        }
    });

    // 3. Subscribe to Invites
    teamService.subscribeToInvites(currentUser.email, (invites) => {
        // We need a render method for invites in UIManager?
        // I checked UIManager, I didn't verify renderInvites explicitly but I can add it or handle it here.
        // Wait, looking back at my UIManager trace, I didn't see renderInvites. 
        // I might have missed it or I need to add it.
        // For safety, I'll inline the render logic or rely on existing DOM elements if UIManager exposed them.
        renderInvites(invites);
    });

    // 4. Setup Mobile Tabs
    ui.setupMobileTabListeners();

    // 5. Sidebar Navigation
    const navPersonal = document.getElementById('nav-personal-tasks');
    if (navPersonal) {
        navPersonal.addEventListener('click', (e) => {
            e.preventDefault();
            switchToPersonalView();
        });
    }
}

function switchToPersonalView() {
    currentView = 'personal';
    currentTeam = null;
    taskService.unsubscribeFromTeam(); // Stop team tasks listener
    teamService.unsubscribeFromTeam(); // Stop team details listener
    ui.closeMobileMenu(); // Close sidebar on selection

    // Update UI State
    const contentTitle = document.getElementById('content-title');
    if (contentTitle) contentTitle.textContent = "My Personal Tasks";

    document.getElementById('add-task-container').classList.remove('hidden');
    document.getElementById('invite-member-button').classList.add('hidden');
    document.getElementById('delete-team-button').classList.add('hidden');
    document.getElementById('manage-members-btn').classList.add('hidden');

    // Subscribe
    const filters = getFilters();
    // Set default date to current time
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('task-datetime').value = now.toISOString().slice(0, 16);

    taskService.subscribeToPersonalTasks(currentUser.uid, filters, (tasks) => {
        ui.renderTasks(tasks, 'personal', handleEditTaskClick, handleToggleTaskStatus, null);
    });
}

// --- DETAILS MODAL & SUBTASKS LOGIC ---

let currentSubtaskUnsubscribe = null;

function handleDetailsClick(task) {
    currentTaskDetailId = task.id;
    document.getElementById('details-task-title').textContent = task.title;
    ui.showModal('details-modal');

    // 1. Subscribe to Updates (Notes)
    taskService.subscribeToTaskUpdates(currentTeam.id, task.id, (updates) => {
        ui.renderUpdates(updates, currentTeam.members || []);
    }, (error) => {
        // Handle permission error (member removed)
        if (error.code === 'permission-denied' || error.message.includes('permission')) {
            ui.hideModal('details-modal');
            // We rely on the team subsciption to redirect the user, but we close modal immediately to avoid "stuck" state
        }
    });

    // 2. Subscribe to Subtasks
    // This will handle the list rendering AND the progress calculation
    if (currentSubtaskUnsubscribe) currentSubtaskUnsubscribe();

    // Check if current user is admin
    const admins = currentTeam.admins || [currentTeam.createdBy];
    const isAdmin = admins.includes(currentUser.uid);

    currentSubtaskUnsubscribe = taskService.subscribeToSubtasks(currentTeam.id, task.id,
        (progress) => {
            // Update Progress UI in Modal (if exists)
            // console.log("Progress:", progress);
        },
        (subtasks) => {
            ui.renderSubtasks(
                subtasks,
                currentUser.uid,
                handleToggleSubtask,
                currentTeam.members || [],
                isAdmin,
                async (subtaskToDelete) => {
                    if (confirm('Delete this subtask?')) {
                        await taskService.deleteSubTask(currentTeam.id, task.id, subtaskToDelete.id);
                    }
                }
            );
        },
        (error) => {
            // Handle permission error
            if (error.code === 'permission-denied' || error.message.includes('permission')) {
                ui.hideModal('details-modal');
            }
        }
    );

    // 3. Populate Assignee Dropdown (Admin only)
    if (isAdmin) {
        document.getElementById('add-subtask-form').classList.remove('hidden');
        populateSubtaskAssignees();
    } else {
        document.getElementById('add-subtask-form').classList.add('hidden');
    }
}

async function populateSubtaskAssignees() {
    const members = [];
    for (const uid of currentTeam.members) {
        try {
            const user = await teamService.getUserDetails(uid);
            if (user) members.push({ uid, ...user });
        } catch (e) { console.warn("Member fetch error", e); }
    }
    ui.populateMembersDropdown(members);
}

async function handleToggleSubtask(subtask) {
    try {
        await taskService.toggleSubTaskStatus(currentTeam.id, currentTaskDetailId, subtask.id, subtask.completed);
    } catch (e) { alert(e.message); }
}

// Add Subtask Form
document.getElementById('add-subtask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('subtask-title').value;
    const assigneeSelect = document.getElementById('subtask-assignee');
    const uid = assigneeSelect.value;
    const name = assigneeSelect.options[assigneeSelect.selectedIndex].text;

    if (!title || !uid) return;

    try {
        await taskService.addSubTask(currentTeam.id, currentTaskDetailId, {
            title,
            assignedTo: { uid, name }
        }, currentUser.uid);
        document.getElementById('subtask-title').value = '';
        assigneeSelect.value = '';
    } catch (e) { alert(e.message); }
});

// Add Update/Note Form
document.getElementById('add-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const textInput = document.getElementById('update-text');
    const text = textInput.value.trim();

    if (!text || !currentTeam || !currentTaskDetailId) return;

    try {
        await taskService.addTaskUpdate(currentTeam.id, currentTaskDetailId, text, currentUser);
        textInput.value = '';
    } catch (err) { alert(err.message); }
});

// Close Details Modal Cleanup
document.getElementById('close-details-modal').addEventListener('click', () => {
    ui.hideModal('details-modal');
    taskService.unsubscribeFromUpdates();
    if (currentSubtaskUnsubscribe) {
        currentSubtaskUnsubscribe();
        currentSubtaskUnsubscribe = null;
    }
    currentTaskDetailId = null;
});

// Sidebar Toggle Logic (Delegated to UIManager)
// Just ensure the Close button calls the toggle method if not handled by UIManager? 
// UIManager handles the logical class switch, but we need to bind the click.
// UIManager constructor found the buttons, but where did we bind the click?
// In UIManager? No, `ui.toggleMobileMenu` exists but who calls it?
// dashboard.js line 336 binds `mobile-menu-btn` to `ui.toggleMobileMenu()`.
// We need to bind the close button and overlay too.

const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const overlay = document.getElementById('mobile-sidebar-overlay');

if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => ui.toggleMobileMenu());
}
if (overlay) {
    overlay.addEventListener('click', () => ui.toggleMobileMenu());
}

function updateTeamPermissionsUI(team) {
    const admins = team.admins || [team.createdBy];
    const isAdmin = admins.includes(currentUser.uid);

    const method = isAdmin ? 'remove' : 'add';
    document.getElementById('invite-member-button').classList[method]('hidden');
    document.getElementById('delete-team-button').classList[method]('hidden');
    document.getElementById('manage-members-btn').classList[method]('hidden');
    document.getElementById('add-task-container').classList[method]('hidden');
}

function switchToTeamView(team) {
    currentView = 'team';
    currentTeam = team;
    taskService.unsubscribeFromPersonal(); // Stop personal listener
    ui.closeMobileMenu(); // Close sidebar on selection

    // Update UI State
    const contentTitle = document.getElementById('content-title');
    if (contentTitle) contentTitle.textContent = `Team: ${team.name}`;
    document.getElementById('invite-team-name').textContent = team.name;

    updateTeamPermissionsUI(team);

    // Subscribe to Real-time Team Updates (Members, etc.)
    teamService.subscribeToTeam(team.id, (updatedTeam) => {
        if (!updatedTeam) {
            alert("This team was deleted.");
            switchToPersonalView();
            return;
        }
        currentTeam = updatedTeam;
        updateTeamPermissionsUI(updatedTeam);

        // Real-time Dropdown Refresh
        const detailsModal = document.getElementById('details-modal');
        if (detailsModal && !detailsModal.classList.contains('hidden')) {
            populateSubtaskAssignees();
        }

        // Real-time Member List Refresh
        const manageModal = document.getElementById('manage-members-modal');
        if (manageModal && !manageModal.classList.contains('hidden')) {
            refreshMembersList(currentTeam.id);
        }

    }, (error) => {
        if (error.code === 'permission-denied') {
            switchToPersonalView();
        }
    });

    const admins = team.admins || [team.createdBy];
    const isAdmin = admins.includes(currentUser.uid);
    const role = isAdmin ? 'admin' : 'member';

    // Set default date
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('task-datetime').value = now.toISOString().slice(0, 16);

    // Subscribe
    const filters = getFilters();
    taskService.subscribeToTeamTasks(team.id, filters, (tasks) => {
        ui.renderTasks(tasks, role, handleEditTaskClick, handleToggleTaskStatus, handleDetailsClick);

        tasks.forEach(task => {
            taskService.subscribeToSubtasks(team.id, task.id, (progress) => {
                const bar = document.getElementById(`progress-bar-${task.id}`);
                const text = document.getElementById(`progress-text-${task.id}`);
                if (bar) bar.style.width = `${progress}%`;
                if (text) text.textContent = `${progress}%`;
            });
        });
    }, (error) => {
        // Silently handle permission errors (e.g., removed from team)
        if (error.code === 'permission-denied' || error.message.includes('permissions')) {
            console.warn("User lost access to team. Switching to personal view.");
            switchToPersonalView();
        } else {
            console.error("Task subscription error:", error);
        }
    });
}

function getFilters() {
    return {
        status: document.getElementById('filter-status').value,
        sort: document.getElementById('sort-tasks').value
    };
}

// --- EVENT HANDLERS (Delegated/Wired) ---

/* Filtering & Sorting */
document.getElementById('filter-status').addEventListener('change', () => reloadCurrentView());
document.getElementById('sort-tasks').addEventListener('change', () => reloadCurrentView());

function reloadCurrentView() {
    if (currentView === 'personal') switchToPersonalView();
    else switchToTeamView(currentTeam);
}

/* Task Actions */
// Note: UIManager attaches these to the buttons
async function handleToggleTaskStatus(task) {
    try {
        if (currentView === 'personal') {
            await taskService.updatePersonalTask(currentUser.uid, task.id, { completed: !task.completed });
        } else {
            // Team task toggle
            await taskService.updateTeamTask(currentTeam.id, task.id, { completed: !task.completed });
        }
    } catch (e) { alert(e.message); }
}

function handleEditTaskClick(task) {
    // Populate and show Modal via UIManager?
    // UIManager has the modal elements but maybe not the inputs cached publically?
    // I can access them by ID here.
    const editModal = document.getElementById('edit-modal');
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-datetime').value = task.dueDate;
    document.getElementById('edit-task-priority').value = task.priority;

    ui.showModal('edit-modal');
}

/* Add Task */
document.getElementById('add-task-button').addEventListener('click', async () => {
    const title = document.getElementById('task-title').value;
    if (!title.trim()) {
        alert("Task title cannot be empty.");
        return;
    }
    const date = document.getElementById('task-datetime').value;
    const priority = document.getElementById('task-priority').value;

    try {
        const taskData = { title, dueDate: date, priority };
        if (currentView === 'personal') {
            await taskService.addPersonalTask(currentUser.uid, taskData);
        } else {
            await taskService.addTeamTask(currentTeam.id, taskData, currentUser.uid);
        }
        // Clear inputs
        document.getElementById('task-title').value = '';
        document.getElementById('task-datetime').value = '';
    } catch (e) { alert(e.message); }
});

/* Create Team */
document.getElementById('show-create-team-modal').addEventListener('click', () => ui.showModal('create-team-modal'));
document.getElementById('cancel-create-team').addEventListener('click', () => ui.hideModal('create-team-modal'));
document.getElementById('confirm-create-team').addEventListener('click', async () => {
    const name = document.getElementById('new-team-name').value;
    try {
        await teamService.createTeam(name, currentUser);
        ui.hideModal('create-team-modal');
        document.getElementById('new-team-name').value = '';
    } catch (e) { alert(e.message); }
});

/* Invite Member */
document.getElementById('invite-member-button').addEventListener('click', () => ui.showModal('invite-modal'));
document.getElementById('cancel-invite-btn').addEventListener('click', () => ui.hideModal('invite-modal'));
document.getElementById('confirm-invite-btn').addEventListener('click', async () => {
    const email = document.getElementById('invite-email-input').value;
    try {
        await teamService.inviteMember(currentTeam.id, currentTeam.name, email, currentUser);
        ui.hideModal('invite-modal');
        document.getElementById('invite-email-input').value = '';
        alert("Invite sent!");
    } catch (e) { alert(e.message); }
});

/* Delete Team */
document.getElementById('delete-team-button').addEventListener('click', async () => {
    if (!currentTeam) return;
    if (confirm(`Are you sure you want to delete the team "${currentTeam.name}"? This cannot be undone.`)) {
        try {
            // Unsubscribe from listeners BEFORE deleting to prevent permission errors
            taskService.unsubscribeFromTeam();
            await teamService.deleteTeam(currentTeam.id, currentUser.uid);
            switchToPersonalView();
        } catch (e) { alert(e.message); }
    }
});

/* Logout */
document.getElementById('logout-button').addEventListener('click', () => {
    authService.logout();
});


/* Mobile Menu */
document.getElementById('mobile-menu-btn').addEventListener('click', () => ui.toggleMobileMenu());

// --- HELPER RENDERS (that were missing in UIManager) ---
function renderInvites(invites) {
    const list = document.getElementById('pending-invites-list');
    list.innerHTML = '';
    // ... invite render logic inline or simplified ...
    if (invites.length === 0) {
        list.innerHTML = '<div class="text-sm text-gray-400">No pending invites.</div>';
        return;
    }
    invites.forEach(invite => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg";
        item.innerHTML = `
            <span class="font-medium text-gray-700 dark:text-gray-200">${invite.teamName}</span>
            <div class="flex gap-2">
                <button class="accept-btn text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Accept</button>
                <button class="decline-btn text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Decline</button>
            </div>
        `;
        item.querySelector('.accept-btn').addEventListener('click', () => teamService.acceptInvite(invite, currentUser.uid, currentUser.email));
        item.querySelector('.decline-btn').addEventListener('click', () => teamService.declineInvite(invite, currentUser.email));
        list.appendChild(item);
    });
}

// --- MISSING EVENT LISTENERS ---

// 1. Edit Task Modal
const closeModalBtn = document.getElementById('close-modal-button');
if (closeModalBtn) closeModalBtn.addEventListener('click', () => ui.hideModal('edit-modal'));

document.getElementById('edit-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-task-id').value;
    const title = document.getElementById('edit-task-title').value;
    const date = document.getElementById('edit-task-datetime').value;
    const priority = document.getElementById('edit-task-priority').value;

    try {
        const updates = { title, dueDate: date, priority };
        if (currentView === 'personal') {
            await taskService.updatePersonalTask(currentUser.uid, id, updates);
        } else {
            // Check permissions? Usually handled by backend rules, but UI should be safe.
            await taskService.updateTeamTask(currentTeam.id, id, updates);
        }
        ui.hideModal('edit-modal');
    } catch (e) { alert(e.message); }
});

// 2. Task Details Modal
const closeDetailsBtn = document.getElementById('close-details-modal');
if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', () => {
    ui.hideModal('details-modal');
    // Unsubscribe from real-time updates when closing
    taskService.unsubscribeFromUpdates();
    if (currentSubtaskUnsubscribe) {
        currentSubtaskUnsubscribe();
        currentSubtaskUnsubscribe = null;
    }
});

// 3. Manage Members Modal
const manageMembersBtn = document.getElementById('manage-members-btn');
if (manageMembersBtn) {
    manageMembersBtn.addEventListener('click', async () => {
        ui.showModal('manage-members-modal');
        const container = document.getElementById('members-list-container');
        // Only show loading if empty to prevent flash on re-open if cached? 
        // Actually always nice to show loading on fresh fetch.
        container.innerHTML = '<p class="text-sm text-gray-500">Loading...</p>';
        await refreshMembersList(currentTeam.id);
    });
}


// 4. Profile & Delete Account
const profileBtn = document.getElementById('profile-section-btn');
if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        // Populate form
        let first = currentUser.firstName || '';
        let last = currentUser.lastName || '';

        // Fallback if firstName/lastName not stored but displayName exists
        if (!first && !last && currentUser.displayName && currentUser.displayName !== currentUser.email) {
            const names = currentUser.displayName.split(' ');
            first = names[0] || '';
            last = names.slice(1).join(' ') || '';
        }

        document.getElementById('profile-firstname').value = first;
        document.getElementById('profile-lastname').value = last;
        document.getElementById('profile-email').value = currentUser.email;
        ui.showModal('profile-modal');
    });
}

document.getElementById('close-profile-modal').addEventListener('click', () => ui.hideModal('profile-modal'));

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const first = document.getElementById('profile-firstname').value;
    const last = document.getElementById('profile-lastname').value;

    try {
        const newName = await authService.updateProfile(currentUser, first, last);

        // Update local state
        currentUser.displayName = newName;
        currentUser.firstName = first;
        currentUser.lastName = last;

        // Force update UI text immediately for better UX
        document.getElementById('user-name-display').textContent = newName;
        // Update initials
        document.getElementById('user-initials').textContent = newName.charAt(0).toUpperCase();

        ui.hideModal('profile-modal');
        alert("Profile updated!");
    } catch (e) { alert(e.message); }
});

// Delete Account Flow
document.getElementById('init-delete-account-btn').addEventListener('click', async () => {
    // 1. Check for Sole Admin Teams
    try {
        const soleAdminTeams = await teamService.checkSoleAdminTeams(currentUser.uid);

        if (soleAdminTeams.length > 0) {
            // SHOW TRANSFER MODAL
            ui.hideModal('profile-modal'); // Switch modals
            ui.showModal('transfer-modal');

            const list = document.getElementById('transfer-list-container');
            list.innerHTML = '';

            // Render rows for each team
            for (const team of soleAdminTeams) {
                const row = document.createElement('div');
                row.className = "p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50";
                row.innerHTML = `
                    <p class="font-bold text-gray-800 dark:text-gray-200 mb-2">${team.name}</p>
                    <select class="w-full p-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-sm transfer-select" data-team-id="${team.id}">
                        <option value="">Select new admin...</option>
                    </select>
                `;

                // Load members for this team to populate dropdown
                // We need to fetch team members again
                // Optimization: could be heavy if many teams.
                const tDoc = await db.collection('teams').doc(team.id).get();
                const memberIds = tDoc.data().members || [];
                // Filter out self
                const otherMemberIds = memberIds.filter(uid => uid !== currentUser.uid);

                const select = row.querySelector('select');

                if (otherMemberIds.length === 0) {
                    // No one else in team! Just delete team? 
                    // Policy: If no one else, team gets deleted or orphaned. 
                    // Let's allow deleting account without transfer if 0 members.
                    row.innerHTML += `<p class="text-xs text-red-500 mt-1">No other members. Team will be deleted.</p>`;
                    select.disabled = true;
                    // Mark as no-transfer needed (null)
                } else {
                    for (const mid of otherMemberIds) {
                        const mUser = await teamService.getUserDetails(mid);
                        if (mUser) {
                            const opt = new Option(mUser.displayName || mUser.email, mid);
                            select.add(opt);
                        }
                    }
                }
                list.appendChild(row);
            }

        } else {
            // No conflicts
            ui.hideModal('profile-modal');
            ui.showModal('delete-confirm-modal');
        }
    } catch (e) {
        console.error(e);
        alert("Error checking team status.");
    }
});

// Transfer Modal Buttons
document.getElementById('cancel-transfer-btn').addEventListener('click', () => ui.hideModal('transfer-modal'));

document.getElementById('confirm-transfer-delete-btn').addEventListener('click', async () => {
    // Collect transfers
    const transferMap = {};
    const selects = document.querySelectorAll('.transfer-select');
    let valid = true;
    const soleAdminTeams = await teamService.checkSoleAdminTeams(currentUser.uid); // Re-fetch to be safe/have objects

    selects.forEach(sel => {
        if (!sel.disabled && !sel.value) valid = false;
        if (sel.value) transferMap[sel.dataset.teamId] = sel.value;
    });

    if (!valid) {
        alert("Please select a new admin for all teams.");
        return;
    }

    if (confirm("Transfers will be made and your account will be deleted immediately. Continue?")) {
        try {
            await authService.deleteAccount(currentUser.firebaseUser, transferMap, soleAdminTeams);
            // Auth listener handles redirect
        } catch (e) { alert(e.message); }
    }
});

// Final Delete Modal Buttons
document.getElementById('cancel-delete-final').addEventListener('click', () => ui.hideModal('delete-confirm-modal'));

document.getElementById('confirm-delete-final').addEventListener('click', async () => {
    try {
        await authService.deleteAccount(currentUser.firebaseUser); // No transfers needed
    } catch (e) { alert(e.message); }
});

const closeManageMembersBtn = document.getElementById('close-manage-members');
if (closeManageMembersBtn) closeManageMembersBtn.addEventListener('click', () => ui.hideModal('manage-members-modal'));

const doneManageMembersBtn = document.getElementById('done-manage-members');
if (doneManageMembersBtn) doneManageMembersBtn.addEventListener('click', () => ui.hideModal('manage-members-modal'));


// --- GLOBAL HELPERS FOR MEMBER MANAGEMENT ---

async function refreshMembersList(teamId) {
    if (!teamId) return;
    const container = document.getElementById('members-list-container');

    try {
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) return;

        const teamData = teamDoc.data();
        const memberIds = teamData.members || [];

        // Update global currentTeam if it matches
        // (This ensures when we click remove/promote, the 'currentTeam' passed to actions is fresh)
        if (currentTeam && currentTeam.id === teamId) {
            currentTeam = { id: teamId, ...teamData };
        }

        const members = [];
        for (const uid of memberIds) {
            const user = await teamService.getUserDetails(uid);
            if (user) members.push({ uid, ...user });
        }

        // Pass callbacks
        ui.renderMembers(members, { id: teamId, ...teamData }, currentUser,
            handleRemoveMember,
            handlePromoteMember
        );
    } catch (e) {
        if (container) container.innerHTML = '<p class="text-red-500 text-sm">Error loading members</p>';
        console.error("Error refreshing members", e);
    }
}

async function handleRemoveMember(uid) {
    if (confirm('Remove this member?')) {
        try {
            await teamService.removeMember(currentTeam.id, uid, currentUser.uid);
            // We await the refresh to ensure UI matches DB
            await refreshMembersList(currentTeam.id);
        } catch (e) { alert(e.message); }
    }
}

async function handlePromoteMember(uid) {
    if (confirm('Promote this member to Admin?')) {
        try {
            await teamService.promoteToAdmin(currentTeam.id, uid, currentUser.uid);
            await refreshMembersList(currentTeam.id);
        } catch (e) { alert(e.message); }
    }
}

