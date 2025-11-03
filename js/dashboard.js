// /src/js/dashboard.js
import { auth, db } from '../firebase-config.js';
import { getPersonalTasks, addPersonalTask, renderTasks } from './taskManager.js';
import { createTeam, getTeamsForUser } from './teamManager.js';
import { setupNotificationListener } from './notifications.js';

// --- Global State ---
let currentUserId = null;
let currentView = 'personal'; // 'personal' or 'team'
let currentTeamId = null;
let currentTasksUnsubscribe = null;
let currentTeamsUnsubscribe = null;
let currentNotificationsUnsubscribe = null;

// --- DOM Elements ---
const userEmailDisplay = document.getElementById('user-email-display');
const logoutButton = document.getElementById('logout-button');
const contentTitle = document.getElementById('content-title');

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
    
    // Start listening for teams
    if (currentTeamsUnsubscribe) currentTeamsUnsubscribe();
    currentTeamsUnsubscribe = getTeamsForUser(userId, renderTeamsNav);
    
    // Start listening for notifications
    if (currentNotificationsUnsubscribe) currentNotificationsUnsubscribe();
    currentNotificationsUnsubscribe = setupNotificationListener(userId, (notifications) => {
        // TODO: Update a "bell icon"
        console.log(`Unread notifications: ${notifications.length}`);
    });
}

// --- View Switching ---
function loadPersonalTasks() {
    currentView = 'personal';
    currentTeamId = null;
    contentTitle.textContent = "My Personal Tasks";
    reloadTasks();
}

function loadTeamTasks(team) {
    currentView = 'team';
    currentTeamId = team.id;
    contentTitle.textContent = `Team: ${team.name}`;
    reloadTasks();
}

// --- Task Loading ---
function reloadTasks() {
    const filters = {
        status: filterStatus.value,
        sort: sortTasks.value
    };

    if (currentView === 'personal') {
        getPersonalTasks(currentUserId, filters, (tasks) => renderTasks(tasks, taskList));
    } else if (currentView === 'team') {
        // TODO: Implement getTeamTasks
        console.log(`Loading tasks for team ${currentTeamId}`);
        // getTeamTasks(currentTeamId, filters, (tasks) => renderTasks(tasks, taskList));
        taskList.innerHTML = `<p class="text-center text-gray-500">Team task loading not implemented yet.</p>`;
    }
}

// --- Event Listeners ---

// Logout
logoutButton.addEventListener('click', () => {
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
            // TODO: Implement addTeamTask
            // await addTeamTask(currentTeamId, taskData);
            alert("Adding team tasks not implemented yet.");
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
            loadTeamTasks(team);
        });
        
        teamsListNav.appendChild(teamLink);
    });
}

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

    // Delete Task
    if (e.target.classList.contains('delete-task-button')) {
        if (confirm("Are you sure you want to delete this task?")) {
            taskRef.delete().catch(error => console.error("Error deleting task: ", error));
        }
    }

    // Toggle Status
    if (e.target.classList.contains('toggle-status-button')) {
        taskRef.get().then(doc => {
            if (doc.exists) {
                taskRef.update({ completed: !doc.data().completed });
            }
        });
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
});

// Close Modal
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

    taskRef.update({
        title: editTaskTitle.value,
        dueDate: editTaskDatetime.value,
        priority: editTaskPriority.value
    })
    .then(() => {
        editModal.classList.add('hidden');
    })
    .catch(error => console.error("Error updating task: ", error));
});