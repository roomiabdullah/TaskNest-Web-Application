// /src/js/taskManager.js
import { styles } from './ui-styles.js';
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
    taskListElement.innerHTML = ''; 

    if (tasks.length === 0) {
        taskListElement.innerHTML = '<p class="text-gray-500 text-center py-8">No tasks found. Try changing your filters!</p>';
        return;
    }

    tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.dataset.id = task.id;

        // --- 1. CONTAINER STYLE ---
        const containerClass = task.completed 
            ? `${styles.taskCard.container} ${styles.taskCard.completedModifier}`
            : styles.taskCard.container;
        taskElement.className = containerClass;

        // --- 2. DATE FORMATTING ---
        let formattedDate = 'No due date';
        if (task.dueDate) {
            try {
                const date = new Date(task.dueDate);
                formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (e) { console.warn(`Invalid date task ${task.id}`); }
        }

        // --- 3. BUTTONS LOGIC (The Fix) ---
        let adminButtons = '';
        let detailsButton = '';

        // A. Admin Buttons (Visible to Personal user OR Team Admin)
        if (userRole === 'personal' || userRole === 'admin') {
            const statusText = task.completed ? 'Undo' : 'Complete';
            const statusClass = task.completed ? styles.buttons.undo : styles.buttons.complete;

            adminButtons = `
                <button class="toggle-status-button ${styles.buttons.base} ${statusClass}">
                    ${statusText}
                </button>
                <button class="edit-task-button ${styles.buttons.base} ${styles.buttons.edit} ml-2">
                    Edit
                </button>
                <button class="delete-task-button ${styles.buttons.base} ${styles.buttons.delete} ml-2">
                    Delete
                </button>
            `;
        }

        // B. Details Button (Visible to ANYONE in a Team, including Admin)
        // We only hide it if userRole is strictly 'personal'
        if (userRole !== 'personal') {
            detailsButton = `
                <button class="view-details-button ${styles.buttons.base} ${styles.buttons.details} ml-2">
                    Details
                </button>
            `;
        }

        // --- 4. PROGRESS BAR ---
        let progressBarHTML = '';
        if (userRole !== 'personal') {
            const progress = task.progress || 0;
            progressBarHTML = `
            <div class="${styles.progressBar.wrapper}">
                <div class="${styles.progressBar.header}">
                    <span class="${styles.progressBar.label}">Progress</span>
                    <span id="progress-text-${task.id}" class="${styles.progressBar.percentageText}">${progress}%</span>
                </div>
                <div class="${styles.progressBar.track}">
                    <div id="progress-bar-${task.id}" class="${styles.progressBar.fill}" style="width: ${progress}%"></div>
                </div>
            </div>
            `;
        }

        // --- 5. PRIORITY BADGE ---
        const priorityKey = (task.priority || 'low').toLowerCase();
        const badgeClass = styles.badge[priorityKey] || styles.badge.low;

        // --- 6. INJECT HTML ---
        taskElement.innerHTML = `
            <div class="${styles.taskCard.leftContent}">
                <h3 class="${styles.text.title}" data-task-title="true">${task.title}</h3>
                <p class="${styles.text.date}">📅 ${formattedDate}</p>
                ${progressBarHTML}
            </div>

            <div class="${styles.taskCard.rightContent}">
                <span class="${styles.badge.base} ${badgeClass}">${task.priority}</span>
                <div class="flex items-center flex-wrap gap-y-2 justify-end">
                    ${adminButtons}
                    ${detailsButton} </div>
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