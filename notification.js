// Notification System for Transaction Management
import {
  db,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from './firebase-config.js';

class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.notificationSound = new Audio('/sounds/notification.mp3');
    this.bellIcon = document.getElementById('notificationToggle');
    this.countElement = document.getElementById('notificationCount');
    this.listElement = document.getElementById('notificationList');
    this.dropdown = document.getElementById('notificationDropdown');
    this.maxNotifications = 50;

    this.loadFromStorage();
    this.setupDOMFix();
    this.setupSoundFix();

    // Start listening to notifications collection
    this.startListening();
  }

  setupDOMFix() {
    if (!this.bellIcon || !this.countElement || !this.listElement || !this.dropdown) {
      window.addEventListener('DOMContentLoaded', () => this.setupDOMElements());
    } else {
      this.setupEventListeners();
    }
  }

  setupDOMElements() {
    this.bellIcon = document.getElementById('notificationToggle');
    this.countElement = document.getElementById('notificationCount');
    this.listElement = document.getElementById('notificationList');
    this.dropdown = document.getElementById('notificationDropdown');
    this.setupEventListeners();
  }

  setupSoundFix() {
    document.addEventListener('click', () => {
      this.notificationSound.play().then(() => {
        this.notificationSound.pause();
        this.notificationSound.currentTime = 0;
      }).catch(() => { });
    }, { once: true });
  }

  setupEventListeners() {
    this.bellIcon.addEventListener('click', () => {
      this.dropdown.classList.toggle('show');
      if (this.dropdown.classList.contains('show')) {
        this.markAllAsRead();
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.bellIcon.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.dropdown.classList.remove('show');
      }
    });

    const clearBtn = document.getElementById('clearNotifications');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }
  }

  startListening() {
    const notificationsRef = collection(db, 'notifications');
    const notificationsQuery = query(notificationsRef, orderBy('timestamp', 'desc'), limit(50));

    this.unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const newNotifications = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        data.timestamp = data.timestamp?.toDate?.() || new Date();
        newNotifications.push(data);
      });

      // Detect new ones
      if (this.notifications.length > 0) {
        const existingIds = new Set(this.notifications.map(n => n.id));
        newNotifications.forEach(n => {
          if (!existingIds.has(n.id)) {
            this.addNotification(n);
          }
        });
      }

      this.notifications = newNotifications;
      this.updateUI();
      this.saveToStorage();
    }, (error) => {
      console.error("Error listening to notifications:", error);
    });
  }

  stopListening() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  addNotification(notification) {
    this.notifications.unshift(notification);
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }
    this.unreadCount++;
    this.playNotificationSound();
    this.bellIcon.classList.add('new-notification');
    this.updateUI();
    this.saveToStorage();
    return notification;
  }

  updateUI() {
    this.countElement.textContent = this.unreadCount;
    this.countElement.style.display = this.unreadCount > 0 ? 'block' : 'none';

    if (this.unreadCount > 0) {
      this.bellIcon.classList.add('has-notifications');
    } else {
      this.bellIcon.classList.remove('has-notifications');
    }

    this.listElement.innerHTML = '';

    if (this.notifications.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.classList.add('empty-notification');
      emptyItem.textContent = 'No notifications yet';
      this.listElement.appendChild(emptyItem);
      return;
    }

    this.notifications.forEach((notification, index) => {
      const item = document.createElement('li');

      if (!notification.read) {
        item.classList.add('unread');
      }

      if (notification.type) {
        item.classList.add(`notification-${notification.type}`);
      }

      const timeStr = this.formatTime(notification.timestamp);

      item.innerHTML = `
        <div class="notification-content">
          <div class="notification-header">
            <strong>${notification.title}</strong>
            <span class="notification-time">${timeStr}</span>
          </div>
          <p>${notification.message}</p>
          ${notification.orderId ?
          `<a href="orders.html?id=${notification.orderId}" class="notification-action">View Order</a>` :
          ''
        }
        </div>
      `;

      item.addEventListener('click', () => {
        this.markAsRead(index);
      });

      this.listElement.appendChild(item);
    });
  }

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  markAsRead(index) {
    if (index >= 0 && index < this.notifications.length && !this.notifications[index].read) {
      this.notifications[index].read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.updateUI();
      this.saveToStorage();
    }
  }

  markAllAsRead() {
    let changed = false;
    this.notifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        changed = true;
      }
    });

    if (changed) {
      this.unreadCount = 0;
      this.updateUI();
      this.saveToStorage();
    }
  }

  clearAll() {
    this.notifications = [];
    this.unreadCount = 0;
    this.updateUI();
    this.saveToStorage();
    this.dropdown.classList.remove('show');
  }

  playNotificationSound() {
    const muted = localStorage.getItem('notificationsMuted') === 'true';
    if (muted) return;

    try {
      this.notificationSound.currentTime = 0;
      this.notificationSound.play().catch(err => {
        console.log('Could not play notification sound', err);
      });
    } catch (err) {
      console.log('Error playing notification sound', err);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('notifications', JSON.stringify(this.notifications));
      localStorage.setItem('unreadCount', this.unreadCount.toString());
    } catch (err) {
      console.error('Failed to save notifications to storage', err);
    }
  }

  loadFromStorage() {
    try {
      const savedNotifications = localStorage.getItem('notifications');
      if (savedNotifications) {
        this.notifications = JSON.parse(savedNotifications);
        this.notifications.forEach(notification => {
          if (notification.timestamp) {
            notification.timestamp = new Date(notification.timestamp);
          }
        });
      }

      const savedCount = localStorage.getItem('unreadCount');
      if (savedCount) {
        this.unreadCount = parseInt(savedCount, 10);
      }

      this.updateUI();
    } catch (err) {
      console.error('Failed to load notifications from storage', err);
      this.notifications = [];
      this.unreadCount = 0;
    }
  }
}

const notificationSystem = new NotificationSystem();
export default notificationSystem;
