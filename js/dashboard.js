// /src/js/dashboard.js

import { auth, db } from '../firebase-config.js';
import { getPersonalTasks, addPersonalTask, renderTasks as renderTasksUtil, unsubscribeFromPersonalTasks } from './taskManager.js';
import { setupNotificationListener } from './notifications.js';
import {
    createTeam, getTeamsForUser, inviteMemberByEmail,
    getInvitesForUser, acceptInvite, declineInvite,
    getTeamTasks, addTeamTask, unsubscribeFromTeamTasks,
    getTaskUpdates, addTaskUpdate, unsubscribeFromTaskUpdates
} from './teamManager.js';


// --- Global State ---
let currentUserId = null;
let currentView = 'personal'; // 'personal' or 'team'
let currentTeamId = null;
let currentTeam = null;
let currentUpdateTaskId = null;
let currentTasksUnsubscribe = null;
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
// NEW: Progress Slider Elements
const progressSliderContainer = document.getElementById('progress-slider-container');
const editTaskProgress = document.getElementById('edit-task-progress');
const progressValueLabel = document.getElementById('progress-value-label');

// -- Team Elements --
const teamsListNav = document.getElementById('teams-list-nav');
const showCreateTeamModalBtn = document.getElementById('show-create-team-modal');
const createTeamModal = document.getElementById('create-team-modal');
const newTeamNameInput = document.getElementById('new-team-name');
const confirmCreateTeamBtn = document.getElementById('confirm-create-team');
const cancelCreateTeamBtn = document.getElementById('cancel-create-team');
const inviteMemberButton = document.getElementById('invite-member-button');
const inviteModal = document.getElementById('invite-modal');
const inviteTeamName = document.getElementById('invite-team-name');
const inviteEmailInput = document.getElementById('invite-email-input');
const cancelInviteBtn = document.getElementById('cancel-invite-btn');
const confirmInviteBtn = document.getElementById('confirm-invite-btn');
const pendingInvitesList = document.getElementById('pending-invites-list');

// NEW: Updates Modal Elements
const updatesModal = document.getElementById('updates-modal');
const updatesTaskTitle = document.getElementById('updates-task-title');
const closeUpdatesModal = document.getElementById('close-updates-modal');
const updatesList = document.getElementById('updates-list');
const addUpdateForm = document.getElementById('add-update-form');
const updateText = document.getElementById('update-text');

// NEW: Update slider label on input
editTaskProgress.addEventListener('input', () => {
    progressValueLabel.textContent = `${editTaskProgress.value}%`;
});

// --- Authentication Check ---
auth.onAuthStateChanged(user => {
    if (user) {
        // User is logged in
        currentUserId = user.uid;
        userEmailDisplay.textContent = user.email;
        initializeDashboard(user.uid);
    } else {
        // User is logged out, redirect to login
        window.location.href = 'login.html';
    }
});

// --- Dashboard Initialization ---
function initializeDashboard(userId) {
    // Load personal tasks by default
    loadPersonalTasks();
    currentTeamsUnsubscribe = getTeamsForUser(userId, renderTeamsNav);

    // Start listening for teams
    if (currentTeamsUnsubscribe) currentTeamsUnsubscribe();
    currentTeamsUnsubscribe = getTeamsForUser(userId, renderTeamsNav);
    // NEW: Start listening for invites
    getInvitesForUser(renderInvites);
    // Start listening for notifications
    if (currentNotificationsUnsubscribe) currentNotificationsUnsubscribe();
    currentNotificationsUnsubscribe = setupNotificationListener(userId, (notifications) => {
        // TODO: Update a "bell icon"
        console.log(`Unread notifications: ${notifications.length}`);
    });
}

// --- View Switching ---
function loadPersonalTasks() {
    unsubscribeFromTeamTasks();
    currentView = 'personal';
    currentTeamId = null;
    currentTeam = null;
    contentTitle.textContent = "My Personal Tasks";
    inviteMemberButton.classList.add('hidden'); // NEW: Hide invite button
    addTaskFormContainer.classList.remove('hidden');
    reloadTasks();
}

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
        addTaskFormContainer.classList.remove('hidden'); // <-- SHOW add task form
    } else {
        // User is a regular MEMBER
        inviteMemberButton.classList.add('hidden');
        addTaskFormContainer.classList.add('hidden'); // <-- HIDE add task form
    }

    inviteTeamName.textContent = team.name; // Set modal title
    reloadTasks();
}

// --- Task Loading ---
function reloadTasks() {
    const filters = {
        status: filterStatus.value,
        sort: sortTasks.value
    };

    if (currentView === 'personal') {
        // Personal tasks, so the user is always the "admin" of their own tasks
        getPersonalTasks(currentUserId, filters, (tasks, listElement) =>
            renderTasksUtil(tasks, listElement, 'personal') // Pass 'personal' role
            , taskList);

    } else if (currentView === 'team') {
        // Team tasks, so check the user's role
        let userRole = 'member'; // Default to member
        if (currentTeam && currentTeam.createdBy === currentUserId) {
            userRole = 'admin'; // User is the admin!
        }

        // Pass the user's role to the render function
        getTeamTasks(currentTeamId, filters, (tasks, listElement) =>
            renderTasksUtil(tasks, listElement, userRole) // Pass the determined role
            , taskList);
    }
}
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

// --- Event Listeners ---

navPersonalTasks.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveNav(e.currentTarget); // <-- ADD THIS
    loadPersonalTasks();
});
// Logout
logoutButton.addEventListener('click', () => {
    unsubscribeFromPersonalTasks();
    unsubscribeFromTeamTasks();
    unsubscribeFromTaskUpdates(); // <-- ADD THIS
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
        alert(error);
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
        alert(`Error: ${error}`);
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
// --- Task List & Modal Logic ---
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

                // NEW: Handle Progress Slider
                const progress = task.progress || 0;
                editTaskProgress.value = progress;
                progressValueLabel.textContent = `${progress}%`;

                // Show slider ONLY if user is a team admin
                if (currentView === 'team' && currentTeam.createdBy === currentUserId) {
                    progressSliderContainer.classList.remove('hidden');
                } else {
                    progressSliderContainer.classList.add('hidden');
                }

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
    // NEW: Open Updates Modal
    if (e.target.classList.contains('view-updates-button')) {
        const taskTitle = taskElement.querySelector('[data-task-title="true"]').textContent;

        // Store the task ID we're looking at
        currentUpdateTaskId = taskId;

        // Set modal title and show it
        updatesTaskTitle.textContent = taskTitle;
        updatesModal.classList.remove('hidden');

        // Start listening for updates for this specific task
        getTaskUpdates(currentTeamId, currentUpdateTaskId, renderTaskUpdates);
    }
});

// Close Modal
closeUpdatesModal.addEventListener('click', () => {
    updatesModal.classList.add('hidden');
    updatesList.innerHTML = ''; // Clear list
    currentUpdateTaskId = null; // Clear current task
    unsubscribeFromTaskUpdates(); // Stop listening
});

// Close Edit Modal
closeModalButton.addEventListener('click', () => {
    editModal.classList.add('hidden');
});

// Save Edited Task
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

    // Add progress to updates ONLY if it was visible
    if (!progressSliderContainer.classList.contains('hidden')) {
        updates.progress = parseInt(editTaskProgress.value, 10);
    }

    // Save the updates
    taskRef.update(updates)
        .then(() => {
            editModal.classList.add('hidden');
        })
        .catch(error => console.error("Error updating task: ", error));
});
addUpdateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = updateText.value;
    if (!text || !currentTeamId || !currentUpdateTaskId) return;

    try {
        await addTaskUpdate(currentTeamId, currentUpdateTaskId, text);
        updateText.value = ''; // Clear the form
    } catch (error) {
        alert(`Error posting update: ${error.message}`);
    }
});
// Render the list of updates
function renderTaskUpdates(updates) {
    updatesList.innerHTML = ''; // Clear old list

    if (updates.length === 0) {
        updatesList.innerHTML = '<p class="text-sm text-gray-500">No updates posted for this task yet.</p>';
        return;
    }

    updates.forEach(update => {
        const updateDiv = document.createElement('div');
        updateDiv.className = 'p-3 bg-white dark:bg-gray-700 rounded shadow-sm';

        const date = update.createdAt ? update.createdAt.toDate().toLocaleString() : 'Just now';

        updateDiv.innerHTML = `
            <p class="text-sm">${update.text}</p>
            <span class="text-xs text-gray-500">by ${update.createdByEmail} on ${date}</span>
        `;
        updatesList.appendChild(updateDiv);
    });

    // Auto-scroll to the bottom
    updatesList.scrollTop = updatesList.scrollHeight;
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
