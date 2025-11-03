// /src/js/notifications.js
import { db, auth, FieldValue } from '../firebase-config.js';

/**
 * Creates a notification for a specific user.
 * @param {string} targetUserID - The UID of the user to notify.
 * @param {string} message - The notification message.
 */
export async function createNotification(targetUserID, message) {
    if (!targetUserID) return;
    try {
        const userNotifRef = db.collection('notifications').doc(targetUserID).collection('userNotifications');
        await userNotifRef.add({
            message: message,
            read: false,
            createdAt: FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}

/**
 * Sets up a real-time listener for new notifications.
 * @param {string} userId - The UID of the current user.
 * @param {function} callback - Function to run with new notifications.
 */
export function setupNotificationListener(userId, callback) {
    if (!userId) return () => {}; // Return an empty unsubscribe function

    return db.collection('notifications').doc(userId).collection('userNotifications')
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            callback(notifications);
        });
}