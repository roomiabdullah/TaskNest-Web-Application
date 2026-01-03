// /src/js/taskManager.js
import { db, FieldValue } from '../firebase-config.js';

let currentTasksUnsubscribe = null;

/**
 * Fetches and listens for personal tasks for a user.
 * @param {string} userId - The UID of the current user.
 * @param {object} filters - An object { status: 'all'/'pending'/'completed', sort: 'priority'/'dueDate' }
 * @param {function} renderCallback - The function to call with the new list of tasks.
 */
export function getPersonalTasks(userId, filters, renderCallback, taskListElement) {
    if (currentTasksUnsubscribe) currentTasksUnsubscribe();

    let tasksRef = db.collection('users').doc(userId).collection('tasks');

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

    currentTasksUnsubscribe = tasksRef.onSnapshot(snapshot => {
        const tasks = [];
        snapshot.forEach(doc => {
            tasks.push({ id: doc.id, ...doc.data() });
        });

        // Client-side sort for priority
        if (filters.sort === 'priority') {
            const priorityMap = { "High": 0, "Medium": 1, "Low": 2 };
            tasks.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority]);
        }

        renderCallback(tasks, taskListElement); // Pass the taskListElement here
    });
}

/**
 * Adds a new personal task to Firestore.
 * @param {string} userId - The UID of the current user.
 *TA @param {object} taskData - { title, dueDate, priority }
 */
export function addPersonalTask(userId, taskData) {
    if (!taskData.title || !taskData.dueDate || !userId) {
        return Promise.reject("Please provide a title and a due date.");
    }

    return db.collection('users').doc(userId).collection('tasks').add({
        title: taskData.title,
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        completed: false,
        createdAt: FieldValue.serverTimestamp()
    });
}

/**
 * Renders the list of tasks into the DOM.
 * @param {Array} tasks - An array of task objects.
 * @param {HTMLElement} taskListElement - The DOM element to render tasks into.
 */
export function renderTasks(tasks, taskListElement, userRole = 'personal') {
    taskListElement.innerHTML = ''; // Clear existing tasks

    if (tasks.length === 0) {
        taskListElement.innerHTML = '<p class="text-gray-500 text-center">No tasks found. Try changing your filters!</p>';
        return;
    }

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.dataset.id = task.id;

        const isCompleted = task.completed;
        taskElement.className = `bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${isCompleted ? 'task-completed opacity-60' : ''}`;

        // Handle potential invalid date strings
        let formattedDate = 'No due date';
        if (task.dueDate) {
            try {
                const date = new Date(task.dueDate);
                formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                console.warn(`Invalid date format for task ${task.id}: ${task.dueDate}`);
            }
        }

        // --- Button Logic ---
        let adminButtons = ''; // Start with no buttons
        if (userRole === 'personal' || userRole === 'admin') {
            // If user is 'admin', create the button HTML
            adminButtons = `
                <button class="toggle-status-button text-sm font-semibold p-2 rounded ${isCompleted ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors">${isCompleted ? 'Undo' : 'Complete'}</button>
                <button class="edit-task-button text-sm font-semibold p-2 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors">Edit</button>
                <button class="delete-task-button text-sm font-semibold p-2 rounded bg-red-500 hover:bg-red-600 text-white transition-colors">Delete</button>
            `;
        }
        // --- Create Updates Button (if needed) ---
        let detailsButton = '';
        if (userRole !== 'personal') { // Hide for personal tasks
            detailsButton = `
            <button class="view-details-button text-sm font-semibold p-2 rounded bg-gray-500 hover:bg-gray-600 text-white transition-colors">
                Details
            </button>
            `;
        }
        // --- End Button Logic ---

        // --- Create Progress Bar (if needed) ---
        let progressBar = '';
        if (userRole !== 'personal') { // Only show for team tasks
            const progress = task.progress || 0; 
            
            // REPLACE THE OLD progressBar STRING WITH THIS:
            progressBar = `
            <div class="mt-2">
                <div class="flex justify-between mb-1">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Progress</span>
                    <span id="progress-text-${task.id}" class="text-xs font-medium text-blue-600 dark:text-blue-400">${progress}%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                    <div id="progress-bar-${task.id}" class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div>
                </div>
            </div>
            `;
        }

        taskElement.innerHTML = `
            <div class="flex-grow">
                <h3 class="font-semibold text-lg" data-task-title="true">${task.title}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">Due: ${formattedDate}</p>
                ${progressBar} 
            </div>

            <div class="flex items-center gap-4">
                <span class="priority-badge priority-${String(task.priority).toLowerCase()}">${task.priority}</span>
                ${adminButtons} 
                ${detailsButton} 
            </div>
        `;
        taskListElement.appendChild(taskElement);
    });
}
/**
 * Stops the real-time listener for personal tasks.
 */
export function unsubscribeFromPersonalTasks() {
    if (currentTasksUnsubscribe) {
        currentTasksUnsubscribe();
        currentTasksUnsubscribe = null;
    }
}
//