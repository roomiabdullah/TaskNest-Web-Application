// /src/js/dashboard.js

import { auth, db } from '../firebase-config.js';
import { getPersonalTasks, addPersonalTask, renderTasks as renderTasksUtil, unsubscribeFromPersonalTasks } from './taskManager.js';
import { setupNotificationListener } from './notifications.js';
import {
    createTeam, 
    getTeamsForUser, 
    inviteMemberByEmail,
    getInvitesForUser, 
    acceptInvite, 
    declineInvite,
    getTeamTasks, 
    addTeamTask, 
    unsubscribeFromTeamTasks,
    getTaskUpdates, 
    addTaskUpdate, 
    unsubscribeFromTaskUpdates,
    addSubTask, 
    toggleSubTaskStatus, 
    listenToSubtasksForProgress,
    unsubscribeFromInvites,
    deleteTeam, 
    removeMember
} from './teamManager.js';

// --- Global State ---
let currentUserId = null;      //  Current session in play
let currentUserName = null;    //  Username 
let currentView = 'personal';  // 'personal' or 'team'
let currentTeamId = null;      //  ID of the current team
let currentTeam = null;        //  The current team object
let currentDetailTaskId = null;
let currentDetailTaskTitle = null;
let activeSubtaskListeners = {}; // (to manage all progress bars)
let currentInvitesUnsubscribe = null;
let currentSubtasksUnsubscribe = null; // listener for the details modal subtasks
let currentTeamsUnsubscribe = null;
let currentNotificationsUnsubscribe = null;

// --- DOM Elements ---
const userEmailDisplay = document.getElementById('user-email-display');
const logoutButton = document.getElementById('logout-button');
const contentTitle = document.getElementById('content-title');
const navPersonalTasks = document.getElementById('nav-personal-tasks');
const addTaskFormContainer = document.getElementById('add-task-container');

// -- Task Elements --
const taskTitleInput = document.getElementById('task-title');
const taskDatetimeInput = document.getElementById('task-datetime');
const taskPriorityInput = document.getElementById('task-priority');
const addTaskButton = document.getElementById('add-task-button');
const taskList = document.getElementById('task-list');
const filterStatus = document.getElementById('filter-status');
const sortTasks = document.getElementById('sort-tasks');

// -- Edit Task Modal --
const editModal = document.getElementById('edit-modal');
const closeModalButton = document.getElementById('close-modal-button');
const editTaskForm = document.getElementById('edit-task-form');
const editTaskId = document.getElementById('edit-task-id');
const editTaskTitle = document.getElementById('edit-task-title');
const editTaskDatetime = document.getElementById('edit-task-datetime');
const editTaskPriority = document.getElementById('edit-task-priority');

// -- Team Elements --
const teamsListNav = document.getElementById('teams-list-nav');
const showCreateTeamModalBtn = document.getElementById('show-create-team-modal');
const createTeamModal = document.getElementById('create-team-modal');
const newTeamNameInput = document.getElementById('new-team-name');
const confirmCreateTeamBtn = document.getElementById('confirm-create-team');
const cancelCreateTeamBtn = document.getElementById('cancel-create-team');
const inviteMemberButton = document.getElementById('invite-member-button');
const deleteTeamButton = document.getElementById('delete-team-button');
const inviteModal = document.getElementById('invite-modal');
const inviteTeamName = document.getElementById('invite-team-name');
const inviteEmailInput = document.getElementById('invite-email-input');
const cancelInviteBtn = document.getElementById('cancel-invite-btn');
const confirmInviteBtn = document.getElementById('confirm-invite-btn');
const pendingInvitesList = document.getElementById('pending-invites-list');

// NEW: Details Modal Elements
const detailsModal = document.getElementById('details-modal');
const detailsTaskTitle = document.getElementById('details-task-title');
const closeDetailsModal = document.getElementById('close-details-modal');
const addUpdateForm = document.getElementById('add-update-form');
const updateText = document.getElementById('update-text');
const updatesList = document.getElementById('updates-list');

// NEW: Manage Members Modal Elements
const manageMembersBtn = document.getElementById('manage-members-btn');
const manageMembersModal = document.getElementById('manage-members-modal');
const closeManageMembers = document.getElementById('close-manage-members');
const doneManageMembers = document.getElementById('done-manage-members');
const membersListContainer = document.getElementById('members-list-container');

// NEW: Sub-task Elements
const addSubtaskForm = document.getElementById('add-subtask-form');
const subtaskTitle = document.getElementById('subtask-title');
const subtaskAssignee = document.getElementById('subtask-assignee');
const subtasksList = document.getElementById('subtasks-list');

// --- Authentication Check ---
auth.onAuthStateChanged(user => {
    if (user) {
        // User is logged in
        currentUserId = user.uid;

        // --- NEW LOGIC TO FETCH USER NAME ---
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                // Get the name, but fallback to email if (for some reason) it doesn't exist
                const nameToDisplay = userData.displayName || user.email;

                userEmailDisplay.textContent = nameToDisplay;
                currentUserName = nameToDisplay; // Save for later
            } else {
                // This case is for old users who signed up before you added names
                userEmailDisplay.textContent = user.email;
                currentUserName = user.email;
            }

            // Initialize the rest of the dashboard AFTER getting the name
            initializeDashboard(user.uid);

        }).catch(err => {
            console.error("Error fetching user document:", err);
            // Fallback on error
            userEmailDisplay.textContent = user.email;
            currentUserName = user.email;
            initializeDashboard(user.uid);
        });
        // --- END OF NEW LOGIC ---

    } else {
        // User is logged out, redirect to login
        window.location.href = 'login.html';
    }
});

// --- Dashboard Initialization ---
function initializeDashboard(userId) {
    // Load personal tasks by default
    loadPersonalTasks();
    // Start listening for teams
    if (currentTeamsUnsubscribe) currentTeamsUnsubscribe();
    currentTeamsUnsubscribe = getTeamsForUser(userId, renderTeamsNav);
    // NEW: Start listening for invites
    if (currentInvitesUnsubscribe) currentInvitesUnsubscribe();
    currentInvitesUnsubscribe = getInvitesForUser(renderInvites);
    // Start listening for notifications
    if (currentNotificationsUnsubscribe) currentNotificationsUnsubscribe();
    currentNotificationsUnsubscribe = setupNotificationListener(userId, (notifications) => {
        // TODO: Update a "bell icon"
        console.log(`Unread notifications: ${notifications.length}`);
    });
}

// --- View Switching ---
// --- Task Loading ---
// Load Personal Tasks
function loadPersonalTasks() {
    unsubscribeFromTeamTasks();
    currentView = 'personal';
    currentTeamId = null;
    currentTeam = null;
    contentTitle.textContent = "My Personal Tasks";
    inviteMemberButton.classList.add('hidden'); // Hide invite button
    addTaskFormContainer.classList.remove('hidden');
    deleteTeamButton.classList.add('hidden'); // <-- Force hide the delete button
    manageMembersBtn.classList.add('hidden');
    reloadTasks();
}
// Load Team Tasks
function loadTeamTasks(team) {
    unsubscribeFromPersonalTasks();
    currentView = 'team';
    currentTeamId = team.id;
    currentTeam = team;
    contentTitle.textContent = `Team: ${team.name}`;

    const user = auth.currentUser;

    // Check if the user is the admin for this team
    if (user && team.createdBy === user.uid) {
        // User is ADMIN
        inviteMemberButton.classList.remove('hidden');
        deleteTeamButton.classList.remove('hidden');
        manageMembersBtn.classList.remove('hidden'); // <-- SHOW BUTTON
        addTaskFormContainer.classList.remove('hidden'); 
    } else {
        // User is MEMBER
        inviteMemberButton.classList.add('hidden');
        deleteTeamButton.classList.add('hidden');
        manageMembersBtn.classList.add('hidden'); // <-- HIDE BUTTON
        addTaskFormContainer.classList.add('hidden'); 
    }

    inviteTeamName.textContent = team.name; // Set modal title
    reloadTasks();
}


// Function to stop all progress listeners
function stopAllProgressListeners() {
    // We loop through all the listener functions we've stored
    Object.values(activeSubtaskListeners).forEach(unsubscribe => {
        try {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        } catch (e) {
            console.warn('Error while unsubscribing from subtask listener', e);
        }
    });
    // Finally, clear the object
    activeSubtaskListeners = {};
}
// Function to reload tasks
function reloadTasks() {
    const filters = {
        status: filterStatus.value,
        sort: sortTasks.value
    };

    // Stop all old listeners before getting new tasks
    stopAllProgressListeners();

    if (currentView === 'personal') {
        getPersonalTasks(currentUserId, filters, (tasks, listElement) =>
            renderTasksUtil(tasks, listElement, 'personal')
            , taskList);

    } else if (currentView === 'team') {
        let userRole = 'member';
        if (currentTeam && currentTeam.createdBy === currentUserId) {
            userRole = 'admin';
        }

        getTeamTasks(currentTeamId, filters, (tasks, listElement) => {
            // 1. Render the main tasks (this creates the HTML with the new text span)
            renderTasksUtil(tasks, listElement, userRole);

            // 2. NOW, attach listeners to update BOTH the bar and the text
            tasks.forEach(task => {
                const progressBar = document.getElementById(`progress-bar-${task.id}`);
                const progressText = document.getElementById(`progress-text-${task.id}`); // <-- SELECT THE NEW TEXT ID

                if (progressBar) {
                    const unsubscribe = listenToSubtasksForProgress(currentTeamId, task.id, (progress) => {
                        // Update Width
                        progressBar.style.width = `${progress}%`;
                        
                        // Update Text (This is the missing piece!)
                        if (progressText) {
                            progressText.textContent = `${progress}%`;
                        }
                    });
                    activeSubtaskListeners[task.id] = unsubscribe;
                }
            });
        }, taskList);
    }
}

// --- Render Functions ---
function renderInvites(invites) {
    pendingInvitesList.innerHTML = ''; // Clear old invites
    if (invites.length === 0) {
        pendingInvitesList.innerHTML = '<span class="text-xs text-gray-500">No pending invites.</span>';
        return;
    }

    invites.forEach(invite => {
        const inviteDiv = document.createElement('div');
        inviteDiv.className = 'p-2 bg-gray-200 dark:bg-gray-700 rounded';

        inviteDiv.innerHTML = `
            <span class="text-sm font-semibold">Join "${invite.teamName}"</span>
            <div class="mt-1">
                <button class="accept-invite-btn text-xs text-green-500 hover:underline">Accept</button>
                <button class="decline-invite-btn text-xs text-red-500 ml-2 hover:underline">Decline</button>
            </div>
        `;

        // Add event listeners directly
        inviteDiv.querySelector('.accept-invite-btn').addEventListener('click', async () => {
            try {
                await acceptInvite(invite);
                // The listener will auto-update the UI
            } catch (error) {
                alert(`Error accepting invite: ${error.message}`);
            }
        });

        inviteDiv.querySelector('.decline-invite-btn').addEventListener('click', async () => {
            try {
                await declineInvite(invite);
                // The listener will auto-update the UI
            } catch (error) {
                alert(`Error declining invite: ${error.message}`);
            }
        });

        pendingInvitesList.appendChild(inviteDiv);
    });
}
// --- Render Functions ---
function renderTeamsNav(teams) {
    teamsListNav.innerHTML = ''; // Clear list
    teams.forEach(team => {
        const teamLink = document.createElement('a');
        teamLink.href = '#';
        teamLink.className = "team-nav-link p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex";
        teamLink.textContent = team.name;
        teamLink.dataset.teamId = team.id;

        teamLink.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(e.currentTarget); // <-- ADD THIS
            loadTeamTasks(team);
        });

        teamsListNav.appendChild(teamLink);
    });
}

// Render the list of updates (notes)
function renderTaskUpdates(updates) {
    updatesList.innerHTML = ''; // Clear old list
    if (updates.length === 0) {
        updatesList.innerHTML = '<p class="text-sm text-gray-500">No updates posted yet.</p>';
        return;
    }
    updates.forEach(update => {
        const updateDiv = document.createElement('div');
        updateDiv.className = 'p-3 bg-white dark:bg-gray-700 rounded shadow-sm';
        const date = update.createdAt ? update.createdAt.toDate().toLocaleString() : 'Just now';
        updateDiv.innerHTML = `
            <p class="text-sm">${update.text}</p>
            <span class="text-xs text-gray-500">by ${update.createdByName} on ${date}</span> 
        `; // <-- CHANGED from update.createdByEmail
        updatesList.appendChild(updateDiv);
    });
    updatesList.scrollTop = updatesList.scrollHeight; // Auto-scroll
}

// 5. Render a single sub-task
function renderSubTask(subtask, id) {
    const div = document.createElement('div');
    div.className = 'flex items-center p-2 bg-white dark:bg-gray-700 rounded';

    const isCompleted = subtask.completed;
    const isAssignedToMe = (subtask.assignedTo_uid === currentUserId);

    let checkbox = `<input type="checkbox" disabled ${isCompleted ? 'checked' : ''}>`;
    if (isAssignedToMe) {
        // This user is assigned, so make the checkbox clickable
        checkbox = `<input type="checkbox" class="subtask-checkbox" data-id="${id}" data-status="${isCompleted}" ${isCompleted ? 'checked' : ''}>`;
    }

    div.innerHTML = `
        ${checkbox}
        <label class="ml-2 flex-grow ${isCompleted ? 'line-through text-gray-500' : ''}">${subtask.title}</label>
        <span class="text-xs text-gray-400">(${subtask.assignedTo_name})</span>
    `; // <-- CHANGED from assignedTo_email
    subtasksList.appendChild(div);
}

function setActiveNav(activeElement) {
    // 1. Remove active class from all team links
    document.querySelectorAll('.team-nav-link').forEach(link => {
        link.classList.remove('bg-gray-200', 'dark:bg-gray-700');
    });
    // 2. Remove active class from personal tasks link
    navPersonalTasks.classList.remove('bg-gray-200', 'dark:bg-gray-700');

    // 3. Add active class to the one that was clicked
    activeElement.classList.add('bg-gray-200', 'dark:bg-gray-700');
}
// Function for loading Sub Tasks in Team Tasks
async function loadSubtasksAndMembers() {
    // 1. Clear old data
    subtasksList.innerHTML = '';
    subtaskAssignee.innerHTML = '<option value="">Assign to a member...</option>';

    // 2. Check if user is admin
    if (currentTeam && currentTeam.createdBy === currentUserId) {
        addSubtaskForm.classList.remove('hidden');

        // 3. Load member emails into the dropdown
        for (const uid of currentTeam.members) {
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data(); // <-- Get user data
                // Use displayName, fallback to email for old users
                const nameToDisplay = userData.displayName || userData.email;
                const option = new Option(nameToDisplay, uid); // <-- Use name
                subtaskAssignee.add(option);
            }
        }
    } else {
        addSubtaskForm.classList.add('hidden');
    }

    // 4. Listen for sub-tasks and render them
    if (currentSubtasksUnsubscribe) currentSubtasksUnsubscribe();
    currentSubtasksUnsubscribe = db.collection('teams').doc(currentTeamId).collection('tasks').doc(currentDetailTaskId).collection('subTasks')
        .onSnapshot(snapshot => {
            subtasksList.innerHTML = ''; // Clear list on each update
            if (snapshot.empty) {
                subtasksList.innerHTML = '<p class="text-sm text-gray-500">No sub-tasks created yet.</p>';
                return;
            }
            snapshot.forEach(doc => {
                renderSubTask(doc.data(), doc.id);
            });
        });

    return currentSubtasksUnsubscribe;
}

// --- Event Listeners ---
// navigation personal tasks
navPersonalTasks.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveNav(e.currentTarget);
    loadPersonalTasks();
});
// Logout
logoutButton.addEventListener('click', () => {
    unsubscribeFromPersonalTasks();
    unsubscribeFromTeamTasks();
    unsubscribeFromTaskUpdates();
    unsubscribeFromInvites();
    stopAllProgressListeners();
    auth.signOut();
});

// Reload tasks when filters change
filterStatus.addEventListener('change', reloadTasks);
sortTasks.addEventListener('change', reloadTasks);

// Add Task
addTaskButton.addEventListener('click', async () => {
    const taskData = {
        title: taskTitleInput.value,
        dueDate: taskDatetimeInput.value,
        priority: taskPriorityInput.value
    };

    try {
        if (currentView === 'personal') {
            await addPersonalTask(currentUserId, taskData);
            taskTitleInput.value = '';
            taskDatetimeInput.value = '';
        } else {
            // Call the new addTeamTask function
            await addTeamTask(currentTeamId, taskData, currentUserId);
            // Clear the inputs
            taskTitleInput.value = '';
            taskDatetimeInput.value = '';
        }
    } catch (error) {
        alert(error.message || String(error));
    }
});

// --- Team Management ---
showCreateTeamModalBtn.addEventListener('click', () => {
    createTeamModal.classList.remove('hidden');
});
cancelCreateTeamBtn.addEventListener('click', () => {
    createTeamModal.classList.add('hidden');
    newTeamNameInput.value = '';
});

confirmCreateTeamBtn.addEventListener('click', async () => {
    const teamName = newTeamNameInput.value;
    try {
        await createTeam(teamName);
        newTeamNameInput.value = '';
        createTeamModal.classList.add('hidden');
    } catch (error) {
        alert(error.message || String(error));
    }
});
// --- Invite Management ---
inviteMemberButton.addEventListener('click', () => {
    inviteModal.classList.remove('hidden');
});

cancelInviteBtn.addEventListener('click', () => {
    inviteModal.classList.add('hidden');
    inviteEmailInput.value = '';
});

confirmInviteBtn.addEventListener('click', async () => {
    const email = inviteEmailInput.value;
    const teamName = inviteTeamName.textContent;

    try {
        await inviteMemberByEmail(currentTeamId, teamName, email);
        alert(`Invite sent to ${email}!`);
        inviteModal.classList.add('hidden');
        inviteEmailInput.value = '';
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
});
// Moved up in the end of all functions
// --- Task List & Modal Logic (from your app.js) ---
taskList.addEventListener('click', (e) => {
    if (!currentUserId) return;

    const taskElement = e.target.closest('[data-id]');
    if (!taskElement) return;

    const taskId = taskElement.dataset.id;

    // Determine the correct path to the task
    let taskRef;
    if (currentView === 'personal') {
        taskRef = db.collection('users').doc(currentUserId).collection('tasks').doc(taskId);
    } else {
        taskRef = db.collection('teams').doc(currentTeamId).collection('tasks').doc(taskId);
    }

    // Open Edit Modal
    if (e.target.classList.contains('edit-task-button')) {
        taskRef.get().then(doc => {
            if (doc.exists) {
                const task = doc.data();
                editTaskId.value = taskId;
                editTaskTitle.value = task.title;
                editTaskDatetime.value = task.dueDate;
                editTaskPriority.value = task.priority;
                editModal.classList.remove('hidden');
            }
        });
    }

    // Toggle Status
    if (e.target.classList.contains('toggle-status-button')) {
        taskRef.get().then(doc => {
            if (doc.exists) {
                taskRef.update({ completed: !doc.data().completed });
            }
        });
    }

    // Delete Task
    if (e.target.classList.contains('delete-task-button')) {
        if (confirm("Are you sure you want to delete this task?")) {
            taskRef.delete().catch(error => console.error("Error deleting task: ", error));
        }
    }

    // NEW: Open Details Modal
    if (e.target.classList.contains('view-details-button')) {
        const taskTitle = taskElement.querySelector('[data-task-title="true"]').textContent;

        currentDetailTaskId = taskId;
        currentDetailTaskTitle = taskTitle;

        detailsTaskTitle.textContent = taskTitle;
        detailsModal.classList.remove('hidden');

        // Start listening for updates
        getTaskUpdates(currentTeamId, currentDetailTaskId, renderTaskUpdates);

        // FIX: Handle the async function correctly
        // We call the async function, and when it finishes, we store the result (the unsubscribe function)
        loadSubtasksAndMembers().then(unsubscribeFn => {
            currentSubtasksUnsubscribe = unsubscribeFn;
        }).catch(err => console.error("Error loading subtasks:", err));
    }
});

closeModalButton.addEventListener('click', () => {
    editModal.classList.add('hidden');
});

// --- ADD THIS BLOCK (Fixes the 'Save' button) ---
editTaskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const taskId = editTaskId.value;
    if (!currentUserId || !taskId) return;

    let taskRef;
    if (currentView === 'personal') {
        taskRef = db.collection('users').doc(currentUserId).collection('tasks').doc(taskId);
    } else {
        taskRef = db.collection('teams').doc(currentTeamId).collection('tasks').doc(taskId);
    }

    // Create the object of updates
    let updates = {
        title: editTaskTitle.value,
        dueDate: editTaskDatetime.value,
        priority: editTaskPriority.value
    };

    // Save the updates
    taskRef.update(updates)
        .then(() => {
            editModal.classList.add('hidden');
        })
        .catch(error => console.error("Error updating task: ", error));
});

closeDetailsModal.addEventListener('click', () => {
    detailsModal.classList.add('hidden');
    updatesList.innerHTML = ''; 
    subtasksList.innerHTML = ''; 
    currentDetailTaskId = null;
    currentDetailTaskTitle = null;
    
    unsubscribeFromTaskUpdates(); 

    // FIX: Check if it's actually a function before calling
    if (typeof currentSubtasksUnsubscribe === 'function') {
        try { 
            currentSubtasksUnsubscribe(); 
        } catch (e) { 
            console.warn('Error unsubscribing subtasks', e); 
        }
    }
    currentSubtasksUnsubscribe = null;
});

// Handle posting a new update (note)
addUpdateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = updateText.value;
    if (!text || !currentTeamId || !currentDetailTaskId) return;

    try {
        // Pass the user's name as a new argument
        await addTaskUpdate(currentTeamId, currentDetailTaskId, text, currentUserName); // <-- MODIFY THIS
        updateText.value = ''; // Clear the form
    } catch (error) {
        alert(`Error posting update: ${error.message}`);
    }
});

// 6. Handle adding a new sub-task
addSubtaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedOption = subtaskAssignee.options[subtaskAssignee.selectedIndex];

    const subTaskData = {
        title: subtaskTitle.value,
        assignedTo: {
            uid: selectedOption.value,
            name: selectedOption.text // <-- CHANGED from email
        }
    };

    try {
        await addSubTask(currentTeamId, currentDetailTaskId, subTaskData);
        subtaskTitle.value = '';
        subtaskAssignee.value = '';
    } catch (error) {
        alert(`Error adding sub-task: ${error.message}`);
    }
});

// 7. Handle toggling a sub-task
subtasksList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('subtask-checkbox')) {
        const subTaskId = e.target.dataset.id;
        const currentStatus = e.target.dataset.status === 'true';

        try {
            // This will toggle the 'completed' field
            await toggleSubTaskStatus(currentTeamId, currentDetailTaskId, subTaskId, currentStatus);
            // The listener will auto-update the UI
        } catch (error) {
            alert(`Error updating sub-task: ${error.message}`);
        }
    }
});
deleteTeamButton.addEventListener('click', async () => {
    if (!currentTeamId) return;

    const confirmed = confirm(`Are you sure you want to delete the team "${currentTeam ? currentTeam.name : ''}"?\nThis action cannot be undone.`);
    
    if (confirmed) {
        try {
            // 1. Capture the ID before we switch views
            const teamIdToDelete = currentTeamId;

            // 2. CRITICAL FIX: Switch to Personal View FIRST.
            // This runs 'unsubscribeFromTeamTasks()' immediately, killing the listeners 
            // SOONER than the deletion happens. No listeners = No errors.
            loadPersonalTasks();

            // 3. NOW delete the team from the database
            await deleteTeam(teamIdToDelete);
            
            alert("Team deleted successfully.");
            
            // 4. Force refresh the nav to remove the old name
            getTeamsForUser(currentUserId, renderTeamsNav); 

        } catch (error) {
            const errorMessage = error.message || error;
            console.error("Delete failed:", error);
            // If it failed, we might want to show the error, 
            // but we are already on the personal screen, which is safe.
            alert(`Error deleting team: ${errorMessage}`);
        }
    }
});
manageMembersBtn.addEventListener('click', async () => {
    if (!currentTeam) return;
    
    manageMembersModal.classList.remove('hidden');
    membersListContainer.innerHTML = '<p class="text-gray-500">Loading...</p>';

    try {
        // 1. Fetch latest team data to get member UIDs
        const teamDoc = await db.collection('teams').doc(currentTeam.id).get();
        const memberIds = teamDoc.data().members;

        // 2. Fetch User Profiles for these IDs
        const promises = memberIds.map(uid => db.collection('users').doc(uid).get());
        const userDocs = await Promise.all(promises);

        membersListContainer.innerHTML = ''; // Clear loading text

        userDocs.forEach(doc => {
            if (!doc.exists) return;
            const userData = doc.data();
            const uid = doc.id;
            const name = userData.displayName || userData.email;
            const isMe = (uid === currentUserId);
            
            // Create UI Row
            const row = document.createElement('div');
            row.className = "flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded";
            
            let actionBtn = '';
            // Only show Remove button if it's NOT the admin themselves
            if (!isMe) {
                actionBtn = `<button class="remove-member-btn text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded" data-uid="${uid}" data-name="${name}">Remove</button>`;
            } else {
                actionBtn = `<span class="text-xs text-gray-400 font-bold">(You)</span>`;
            }

            row.innerHTML = `
                <span class="text-sm font-medium">${name}</span>
                ${actionBtn}
            `;
            membersListContainer.appendChild(row);
        });

        // 3. Attach Listeners to Remove Buttons
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uidToRemove = e.target.dataset.uid;
                const nameToRemove = e.target.dataset.name;
                
                if(confirm(`Are you sure you want to remove ${nameToRemove} from the team?`)) {
                    try {
                        await removeMember(currentTeam.id, uidToRemove);
                        
                        // 1. Update the Manage Members List UI
                        e.target.closest('div').remove(); 
                        
                        // 2. FIX: Update the local 'currentTeam' data immediately
                        // This ensures that next time you open a modal, the array is fresh.
                        if (currentTeam && currentTeam.members) {
                            currentTeam.members = currentTeam.members.filter(uid => uid !== uidToRemove);
                        }

                        // 3. FIX: Update the "Assign To" dropdown if it's currently open
                        const assigneeDropdown = document.getElementById('subtask-assignee');
                        if (assigneeDropdown) {
                            for (let i = 0; i < assigneeDropdown.options.length; i++) {
                                if (assigneeDropdown.options[i].value === uidToRemove) {
                                    assigneeDropdown.remove(i);
                                    break; 
                                }
                            }
                        }

                        alert(`${nameToRemove} removed.`);
                    } catch(err) {
                        alert("Error: " + err.message);
                    }
                }
            });
        });

    } catch (error) {
        console.error(error);
        membersListContainer.innerHTML = '<p class="text-red-500">Error loading members.</p>';
    }
});

// Close Modal Logic
const closeMembersModalParams = () => manageMembersModal.classList.add('hidden');
closeManageMembers.addEventListener('click', closeMembersModalParams);
doneManageMembers.addEventListener('click', closeMembersModalParams);