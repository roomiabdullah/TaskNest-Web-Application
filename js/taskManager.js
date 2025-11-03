// /src/js/taskManager.js
import { db, FieldValue } from '../firebase-config.js';

let currentTasksUnsubscribe = null;

/**
 * Fetches and listens for personal tasks for a user.
 * @param {string} userId - The UID of the current user.
 * @param {object} filters - An object { status: 'all'/'pending'/'completed', sort: 'priority'/'dueDate' }
 * @param {function} renderCallback - The function to call with the new list of tasks.
 */
export function getPersonalTasks(userId, filters, renderCallback) {
    if (currentTasksUnsubscribe) {
        currentTasksUnsubscribe(); // Stop previous listener
    }

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

        renderCallback(tasks);
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
export function renderTasks(tasks, taskListElement) {
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

        taskElement.innerHTML = `
            <div class="flex-grow">
                <h3 class="font-semibold text-lg">${task.title}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">Due: ${formattedDate}</p>
            </div>
            <div class="flex items-center gap-4">
                <span class="priority-badge priority-${String(task.priority).toLowerCase()}">${task.priority}</span>
                <button class="toggle-status-button text-sm font-semibold p-2 rounded ${isCompleted ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors">${isCompleted ? 'Undo' : 'Complete'}</button>
                <button class="edit-task-button text-sm font-semibold p-2 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors">Edit</button>
                <button class="delete-task-button text-sm font-semibold p-2 rounded bg-red-500 hover:bg-red-600 text-white transition-colors">Delete</button>
            </div>
        `;
        taskListElement.appendChild(taskElement);
    });
}