import { db, FieldValue } from '../../firebase-config.js';

export class TaskService {
    constructor() {
        this.unsubscribePersonal = null;
        this.unsubscribeTeam = null;
        this.unsubscribeUpdates = null;
    }

    // ===========================
    // PERSONAL TASKS
    // ===========================

    subscribeToPersonalTasks(userId, filters, onUpdate) {
        if (this.unsubscribePersonal) this.unsubscribePersonal();

        let tasksRef = db.collection('users').doc(userId).collection('tasks');

        if (filters.status === 'pending') tasksRef = tasksRef.where('completed', '==', false);
        else if (filters.status === 'completed') tasksRef = tasksRef.where('completed', '==', true);

        if (filters.sort === 'dueDate') tasksRef = tasksRef.orderBy('dueDate');
        else tasksRef = tasksRef.orderBy('createdAt', 'desc');

        this.unsubscribePersonal = tasksRef.onSnapshot(snapshot => {
            const tasks = [];
            snapshot.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
            this._sortTasksByPriority(tasks, filters.sort);
            onUpdate(tasks);
        }, error => {
            console.error("Error fetching personal tasks:", error);
            onUpdate([]);
        });
    }

    async addPersonalTask(userId, taskData) {
        return db.collection('users').doc(userId).collection('tasks').add({
            title: taskData.title,
            dueDate: taskData.dueDate,
            priority: taskData.priority,
            completed: false,
            createdAt: FieldValue.serverTimestamp()
        });
    }

    async updatePersonalTask(userId, taskId, updates) {
        return db.collection('users').doc(userId).collection('tasks').doc(taskId).update(updates);
    }

    async deletePersonalTask(userId, taskId) {
        return db.collection('users').doc(userId).collection('tasks').doc(taskId).delete();
    }

    // ===========================
    // TEAM TASKS
    // ===========================

    unsubscribeFromTeam() {
        if (this.unsubscribeTeam) {
            this.unsubscribeTeam();
            this.unsubscribeTeam = null;
        }
    }

    subscribeToTeamTasks(teamId, filters, onUpdate, onError) {
        this.unsubscribeFromTeam(); // Stop existing

        let tasksRef = db.collection('teams').doc(teamId).collection('tasks');

        if (filters.status === 'pending') tasksRef = tasksRef.where('completed', '==', false);
        else if (filters.status === 'completed') tasksRef = tasksRef.where('completed', '==', true);

        if (filters.sort === 'dueDate') tasksRef = tasksRef.orderBy('dueDate');
        else tasksRef = tasksRef.orderBy('createdAt', 'desc');

        this.unsubscribeTeam = tasksRef.onSnapshot(snapshot => {
            const tasks = [];
            snapshot.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
            this._sortTasksByPriority(tasks, filters.sort);
            onUpdate(tasks);
        }, error => {
            if (error.code !== 'permission-denied' && !error.message.includes('permission')) {
                console.error("Error fetching team tasks:", error);
            }
            if (onError) onError(error);
            onUpdate([]);
        });
    }

    async addTeamTask(teamId, taskData, userId) {
        return db.collection('teams').doc(teamId).collection('tasks').add({
            title: taskData.title,
            dueDate: taskData.dueDate,
            priority: taskData.priority,
            createdBy: userId,
            completed: false,
            assignedTo: null,
            status: 'Pending',
            createdAt: FieldValue.serverTimestamp()
        });
    }

    async updateTeamTask(teamId, taskId, updates) {
        return db.collection('teams').doc(teamId).collection('tasks').doc(taskId).update(updates);
    }

    // ===========================
    // UPDATES & SUBTASKS
    // ===========================

    subscribeToTaskUpdates(teamId, taskId, onUpdate, onError) {
        if (this.unsubscribeUpdates) this.unsubscribeUpdates();

        const updatesRef = db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('updates')
            .orderBy('createdAt', 'asc');

        this.unsubscribeUpdates = updatesRef.onSnapshot(snapshot => {
            const updates = [];
            snapshot.forEach(doc => updates.push({ id: doc.id, ...doc.data() }));
            onUpdate(updates);
        }, error => {
            if (error.code !== 'permission-denied' && !error.message.includes('permission')) {
                console.error("Error fetching updates:", error);
            }
            if (onError) onError(error);
        });
    }

    async addTaskUpdate(teamId, taskId, updateText, user) {
        return db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('updates').add({
            text: updateText,
            createdByName: user.displayName || user.email,
            createdBy_uid: user.uid,
            createdAt: FieldValue.serverTimestamp()
        });
    }

    async addSubTask(teamId, taskId, subTaskData, userId) {
        return db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks').add({
            title: subTaskData.title,
            assignedTo_uid: subTaskData.assignedTo.uid,
            assignedTo_name: subTaskData.assignedTo.name,
            completed: false,
            createdBy: userId
        });
    }

    subscribeToSubtasks(teamId, taskId, onProgressUpdate, onListUpdate, onError) {
        // Returns the unsubscribe function directly to the caller
        const subtasksRef = db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks');

        return subtasksRef.onSnapshot(snapshot => {
            const subtasks = [];
            let completedCount = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                subtasks.push({ id: doc.id, ...data });
                if (data.completed) completedCount++;
            });

            if (onListUpdate) onListUpdate(subtasks);

            const progress = snapshot.size === 0 ? 0 : Math.round((completedCount / snapshot.size) * 100);
            if (onProgressUpdate) onProgressUpdate(progress);
        }, error => {
            // Suppress console error for expected permission denials (e.g. member removed)
            if (error.code !== 'permission-denied' && !error.message.includes('permission')) {
                console.error("Error fetching subtasks:", error);
            }
            if (onError) onError(error);
        });
    }

    async toggleSubTaskStatus(teamId, taskId, subTaskId, currentStatus) {
        return db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks').doc(subTaskId).update({
            completed: !currentStatus
        });
    }

    async deleteSubTask(teamId, taskId, subTaskId) {
        return db.collection('teams').doc(teamId).collection('tasks').doc(taskId).collection('subTasks').doc(subTaskId).delete();
    }

    // ===========================
    // HELPERS
    // ===========================

    _sortTasksByPriority(tasks, sortType) {
        if (sortType === 'priority') {
            const priorityMap = { "High": 0, "Medium": 1, "Low": 2 };
            tasks.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority]);
        }
    }

    unsubscribeAll() {
        this.unsubscribeFromPersonal();
        this.unsubscribeFromTeam();
        this.unsubscribeFromUpdates();
    }

    unsubscribeFromPersonal() {
        if (this.unsubscribePersonal) {
            this.unsubscribePersonal();
            this.unsubscribePersonal = null;
        }
    }

    unsubscribeFromTeam() {
        if (this.unsubscribeTeam) {
            this.unsubscribeTeam();
            this.unsubscribeTeam = null;
        }
    }

    unsubscribeFromUpdates() {
        if (this.unsubscribeUpdates) {
            this.unsubscribeUpdates();
            this.unsubscribeUpdates = null;
        }
    }
}
