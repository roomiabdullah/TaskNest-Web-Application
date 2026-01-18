import { styles } from '../ui-styles.js';

export class UIManager {
    constructor() {
        // Cache DOM elements
        this.taskListElement = document.getElementById('task-list');
        this.teamsListNav = document.getElementById('teams-list-nav');
        this.subtasksList = document.getElementById('subtasks-list');
        this.updatesList = document.getElementById('updates-list');
        this.membersListContainer = document.getElementById('members-list-container');
        this.subtaskAssigneeSelect = document.getElementById('subtask-assignee');

        // Modals
        this.createTeamModal = document.getElementById('create-team-modal');
        this.inviteModal = document.getElementById('invite-modal');
        this.editModal = document.getElementById('edit-modal');
        this.detailsModal = document.getElementById('details-modal');
        this.manageMembersModal = document.getElementById('manage-members-modal');
        // New Profile Modals
        this.profileModal = document.getElementById('profile-modal');
        this.transferModal = document.getElementById('transfer-modal');
        this.deleteConfirmModal = document.getElementById('delete-confirm-modal');

        // Mobile Menus & Sidebar
        this.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('mobile-sidebar-overlay');

        // Mobile Tabs (Details Modal)
        this.tabSubtasks = document.getElementById('tab-subtasks');
        this.tabUpdates = document.getElementById('tab-updates');
        this.colSubtasks = document.getElementById('subtasks-column');
        this.colUpdates = document.getElementById('updates-column');

        // Setup Global Modal Listeners (ESC & Click Outside)
        this.setupGlobalModalListeners();
    }

    // ===========================
    // MODAL MANAGEMENT
    // ===========================

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            // Apply flex to ALL modals to ensure centering works
            modal.classList.add('flex');
        }
    }

    setupGlobalModalListeners() {
        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
                openModals.forEach(modal => {
                    // Don't close if it's the specific "Delete Confirm" on top of another? 
                    // Simple stack behavior: Close the top-most or all. Let's close all for simplicity or verify z-index.
                    // Actually, closing the last opened is better, but closing all is safe for now.
                    this.hideModal(modal.id);
                });
            }
        });

        // Close on Click Outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('fixed') && e.target.classList.contains('inset-0')) {
                // The target IS the overlay background
                this.hideModal(e.target.id);
            }
        });
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    toggleMobileMenu() {
        // Toggle Sidebar
        const isClosed = this.sidebar.classList.contains('-translate-x-full');
        if (isClosed) {
            this.sidebar.classList.remove('-translate-x-full');
            if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('hidden');
        } else {
            this.sidebar.classList.add('-translate-x-full');
            if (this.sidebarOverlay) this.sidebarOverlay.classList.add('hidden');
        }
    }

    closeMobileMenu() {
        // Only if it's open (not containing the class)
        if (!this.sidebar.classList.contains('-translate-x-full')) {
            this.sidebar.classList.add('-translate-x-full');
            if (this.sidebarOverlay) this.sidebarOverlay.classList.add('hidden');
        }
    }

    setupMobileTabListeners() {
        if (!this.tabSubtasks || !this.tabUpdates) return;

        this.tabSubtasks.addEventListener('click', () => {
            // Show Subtasks, Hide Updates
            this.colSubtasks.classList.remove('hidden');
            this.colSubtasks.classList.add('flex');
            this.colUpdates.classList.add('hidden');
            this.colUpdates.classList.remove('flex');

            // Update Tab Styles
            this.tabSubtasks.classList.add('text-blue-600', 'border-blue-600');
            this.tabSubtasks.classList.remove('text-gray-500', 'border-transparent');
            this.tabUpdates.classList.remove('text-blue-600', 'border-blue-600');
            this.tabUpdates.classList.add('text-gray-500', 'border-transparent');
        });

        this.tabUpdates.addEventListener('click', () => {
            // Show Updates, Hide Subtasks
            this.colUpdates.classList.remove('hidden');
            this.colUpdates.classList.add('flex');
            this.colSubtasks.classList.add('hidden');
            this.colSubtasks.classList.remove('flex');

            // Update Tab Styles
            this.tabUpdates.classList.add('text-blue-600', 'border-blue-600');
            this.tabUpdates.classList.remove('text-gray-500', 'border-transparent');
            this.tabSubtasks.classList.remove('text-blue-600', 'border-blue-600');
            this.tabSubtasks.classList.add('text-gray-500', 'border-transparent');
        });
    }

    // ===========================
    // RENDERING TASKS
    // ===========================

    renderTasks(tasks, userRole = 'personal', onEditClick, onCompleteClick, onDetailsClick) {
        this.taskListElement.innerHTML = '';

        if (tasks.length === 0) {
            this.taskListElement.innerHTML = '<p class="text-gray-500 text-center py-8">No tasks found. Try changing your filters!</p>';
            return;
        }

        tasks.forEach(task => {
            const taskElement = document.createElement('div');
            // taskElement.dataset.id = task.id; // Optional, useful for debugging

            const containerClass = task.completed
                ? `${styles.taskCard.container} ${styles.taskCard.completedModifier}`
                : styles.taskCard.container;
            taskElement.className = containerClass;

            // Date Formatting
            let formattedDate = 'No due date';
            if (task.dueDate) {
                try {
                    const date = new Date(task.dueDate);
                    formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                } catch (e) { console.warn('Invalid date'); }
            }

            // Buttons
            let actionButtons = '';
            // Admin/Personal Actions
            if (userRole === 'admin' || userRole === 'personal') {
                actionButtons += `
                    <button class="edit-btn ${styles.taskCard.actionButton}" title="Edit Task">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button class="complete-btn ${task.completed ? styles.taskCard.undoButton : styles.taskCard.completeButton}"
                        title="${task.completed ? 'Mark as Pending' : 'Mark as Completed'}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    </button>
                `;
            }

            // Details Button (For Team Views)
            if (userRole !== 'personal') {
                actionButtons += `
                    <button class="details-btn ml-2 text-gray-400 hover:text-blue-600 transition-colors" title="View Details">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    </button>
                `;
            }

            // Progress bar for team tasks
            let progressBarHtml = '';
            if (userRole !== 'personal') {
                progressBarHtml = `
                    <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>Subtask Progress</span>
                            <span id="progress-text-${task.id}">0%</span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div id="progress-bar-${task.id}" class="progress-gradient h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>
                `;
            }

            taskElement.innerHTML = `
                <div class="${styles.taskCard.leftContent}">
                    <h3 class="${styles.text.title}">${task.title}</h3>
                    <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <div class="flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            ${formattedDate}
                        </div>
                        ${task.assignedTo ? `<span class="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-medium">@${task.assignedTo}</span>` : ''}
                    </div>
                    ${progressBarHtml}
                </div>
                <div class="${styles.taskCard.rightContent}">
                    <div class="${styles.badge.base} ${styles.badge[task.priority]}">
                        ${task.priority}
                    </div>
                    <div class="flex items-center gap-2">
                        ${actionButtons}
                    </div>
                </div>
            `;

            // Event Listeners
            const editBtn = taskElement.querySelector('.edit-btn');
            const completeBtn = taskElement.querySelector('.complete-btn');
            const detailsBtn = taskElement.querySelector('.details-btn');

            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onEditClick(task);
                });
            }
            if (completeBtn) {
                completeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onCompleteClick(task);
                });
            }
            if (detailsBtn) {
                detailsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (onDetailsClick) onDetailsClick(task);
                });
            }

            this.taskListElement.appendChild(taskElement);
        });
    }

    // ===========================
    // RENDERING TEAMS (Sidebar)
    // ===========================

    renderTeamList(teams, currentTeamId, onTeamClick) {
        this.teamsListNav.innerHTML = '';

        // Update "My Tasks" nav styling based on whether a team is selected
        const navPersonal = document.getElementById('nav-personal-tasks');
        if (navPersonal) {
            if (currentTeamId) {
                // Team is selected - deactivate personal nav
                navPersonal.className = 'flex items-center px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white transition-all group';
            } else {
                // Personal view is active
                navPersonal.className = 'nav-active flex items-center px-3 py-2.5 rounded-xl bg-blue-600 text-white font-medium shadow-lg shadow-blue-500/30 transition-all group';
            }
        }

        teams.forEach(team => {
            const button = document.createElement('button');
            const isActive = team.id === currentTeamId;

            button.className = `team-nav-link w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 group ${isActive
                ? 'nav-active bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white'
                }`;

            button.innerHTML = `
                <div class="${isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-600 dark:text-gray-500 dark:group-hover:text-blue-400'}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                </div>
                <span class="font-medium truncate">${team.name}</span>
                ${isActive ? '' : '<span class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-400">→</span>'}
            `;

            button.addEventListener('click', () => onTeamClick(team));
            this.teamsListNav.appendChild(button);
        });
    }

    // ===========================
    // RENDERING SUBTASKS
    // ===========================

    renderSubtasks(subtasks, currentUserId, onToggle, teamMembers = [], isAdmin = false, onDelete = null) {
        this.subtasksList.innerHTML = '';
        subtasks.forEach(subtask => {
            const div = document.createElement('div');
            div.className = 'flex items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700';

            const isAssignedToMe = (subtask.assignedTo_uid === currentUserId);
            const isPastMember = subtask.assignedTo_uid && teamMembers.length > 0 && !teamMembers.includes(subtask.assignedTo_uid);

            // Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = subtask.completed;
            checkbox.className = "w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 cursor-pointer";
            // Allow toggle if assigned to me OR if I'm admin
            if (!isAssignedToMe && !isAdmin) checkbox.disabled = true;
            else checkbox.addEventListener('change', () => onToggle(subtask));

            const label = document.createElement('span');
            label.className = `ml-3 flex-grow text-sm ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`;
            label.textContent = subtask.title;

            const assignee = document.createElement('span');
            assignee.className = 'text-xs text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-100 dark:border-gray-600 ml-2';
            const pastBadge = isPastMember ? ' (past)' : '';
            assignee.textContent = (subtask.assignedTo_name || 'Unknown') + pastBadge;
            if (isPastMember) assignee.classList.add('text-orange-500');

            div.appendChild(checkbox);
            div.appendChild(label);
            div.appendChild(assignee);

            // Delete button for admins (especially useful for past member subtasks)
            if (isAdmin && onDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'ml-2 text-red-500 hover:text-red-700 text-xs';
                deleteBtn.innerHTML = '✕';
                deleteBtn.title = 'Delete subtask';
                deleteBtn.addEventListener('click', () => onDelete(subtask));
                div.appendChild(deleteBtn);
            }

            this.subtasksList.appendChild(div);
        });
    }

    // ===========================
    // RENDERING UPDATES
    // ===========================

    renderUpdates(updates, currentTeamMembers = []) {
        this.updatesList.innerHTML = '';
        updates.forEach(update => {
            const div = document.createElement('div');
            div.className = 'bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700';

            const date = update.createdAt ? new Date(update.createdAt.seconds * 1000).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Just now';

            // Check if member is still in team
            const isPastMember = update.createdBy_uid && currentTeamMembers.length > 0 && !currentTeamMembers.includes(update.createdBy_uid);
            const pastMemberBadge = isPastMember ? '<span class="text-[10px] text-gray-400 bg-gray-200 dark:bg-gray-600 px-1 rounded ml-1">(past member)</span>' : '';

            div.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="font-semibold text-xs text-blue-600 dark:text-blue-400">${update.createdByName}${pastMemberBadge}</span>
                    <span class="text-[10px] text-gray-400">${date}</span>
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${update.text}</p>
            `;
            this.updatesList.appendChild(div);
        });
    }

    // ===========================
    // FORM HELPERS
    // ===========================

    populateMembersDropdown(members) {
        this.subtaskAssigneeSelect.innerHTML = '<option value="">Assign to...</option>';
        members.forEach(member => {
            const option = new Option(member.displayName || member.email, member.uid);
            this.subtaskAssigneeSelect.add(option);
        });
    }

    renderMembers(members, currentTeam, currentUser, onRemove, onPromote) {
        if (!this.membersListContainer) return;
        this.membersListContainer.innerHTML = '';

        const admins = currentTeam.admins || [currentTeam.createdBy];
        const isUserAdmin = admins.includes(currentUser.uid);

        members.forEach(member => {
            const el = document.createElement('div');
            el.className = "flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-lg";

            const isMemberAdmin = admins.includes(member.uid);
            const memberInitial = (member.displayName || member.email).charAt(0).toUpperCase();

            let actions = '';
            // Only admins can see actions
            if (isUserAdmin && member.uid !== currentUser.uid) {
                // Remove Member Button
                actions += `<button class="text-red-500 hover:text-red-700 text-xs font-medium remove-member-btn transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20" data-uid="${member.uid}">Remove</button>`;

                // Promote to Admin Button (if not already admin)
                if (!isMemberAdmin) {
                    actions += `<button class="text-blue-600 hover:text-blue-800 text-xs font-medium ml-2 promote-btn transition-colors px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20" data-uid="${member.uid}">Make Admin</button>`;
                }
            }

            el.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full ${isMemberAdmin ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'} flex items-center justify-center text-sm font-bold shadow-sm">
                        ${memberInitial}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                             <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${member.displayName || 'User'}</p>
                             ${isMemberAdmin ? '<span class="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800 font-semibold uppercase tracking-wide">Admin</span>' : ''}
                        </div>
                        <p class="text-xs text-gray-500 truncate max-w-[150px]">${member.email}</p>
                    </div>
                </div>
                <div class="flex items-center">
                    ${actions}
                </div>
            `;

            const removeBtn = el.querySelector('.remove-member-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => onRemove(member.uid));
            }

            const promoteBtn = el.querySelector('.promote-btn');
            if (promoteBtn) {
                promoteBtn.addEventListener('click', () => onPromote(member.uid));
            }

            this.membersListContainer.appendChild(el);
        });
    }
}
