import { 
  auth, 
  db,
  signOut,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  onSnapshot
} from './firebase-config.js';


// Global variables
let activeSellerId = null;
let activeSellerName = null;
let messageListener = null;

// ========== Fetch Sellers ==========
async function fetchSellers() {
  const sellerList = document.getElementById("sellerList");
  if (!sellerList) return;

  sellerList.innerHTML = `<li class="list-group-item text-center">Loading sellers...</li>`;

  try {
    const sellersRef = collection(db, "admin");
    const sellersQuery = query(
      sellersRef,
      where("role", "==", "staff")
    );
    const querySnapshot = await getDocs(sellersQuery);

    if (querySnapshot.empty) {
      sellerList.innerHTML = `<li class="list-group-item text-center text-muted">No staff found.</li>`;
      return;
    }

    sellerList.innerHTML = "";
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const sellerId = docSnap.id;
      const sellerName = data.shopName || data.username || data.name || data.email || "Unknown Staff";
      const profilePicture = data.profilePicture || "";
      
      const listItem = document.createElement("li");
      listItem.className = "list-group-item list-group-item-action seller-item";
      listItem.setAttribute("data-seller-id", sellerId);
      listItem.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <div class="avatar me-2">
              ${profilePicture ? 
                `<img src="${profilePicture}" class="seller-profile-picture" alt="${sellerName}'s profile picture" />` :
                `<span class="initials">${getInitials(sellerName)}</span>`
              }
            </div>
            <div>
              <strong>${sellerName}</strong>
              <br>
              <small class="text-muted">${data.city || "Unknown"}, ${data.province || ""}</small>
            </div>
          </div>
          <span class="badge bg-secondary unread-count" id="unread-${sellerId}" style="display: none;">0</span>
        </div>
      `;
      
      listItem.addEventListener("click", () => selectSeller(sellerId, sellerName));
      sellerList.appendChild(listItem);
    });

    // Fetch unread message counts
    fetchUnreadCounts();

  } catch (error) {
    console.error("Error fetching staff:", error);
    sellerList.innerHTML = `<li class="list-group-item text-center text-danger">Error loading staff.</li>`;
  }
}

// ========== Utility: Get Initials ==========
function getInitials(name) {
  if (!name) return "U";
  return name.split(' ')
             .map(n => n.charAt(0).toUpperCase())
             .join('')
             .substring(0, 2);
}

// ========== Fetch Unread Message Counts ==========
async function fetchUnreadCounts() {
  try {
    const sellerItems = document.querySelectorAll(".seller-item");
    const currentUserId = auth.currentUser?.uid;

    for (const item of sellerItems) {
      const sellerId = item.getAttribute("data-seller-id");
      const unreadBadge = document.getElementById(`unread-${sellerId}`);
      
      if (unreadBadge && currentUserId) {
        const chatsRef = collection(db, "chats");
        const chatsQuery = query(
          chatsRef,
          where("participants", "array-contains", currentUserId)
        );
        const chatSnapshot = await getDocs(chatsQuery);
        
        let unreadCount = 0;
        for (const chatDoc of chatSnapshot.docs) {
          const chatData = chatDoc.data();
          if (chatData.participants.includes(sellerId)) {
            const messagesRef = collection(db, "chats", chatDoc.id, "messages");
            const unreadQuery = query(
              messagesRef,
              where("isRead", "==", false),
              where("senderId", "==", sellerId)
            );
            const unreadSnapshot = await getDocs(unreadQuery);
            unreadCount += unreadSnapshot.size;
          }
        }

        if (unreadCount > 0) {
          unreadBadge.textContent = unreadCount;
          unreadBadge.style.display = "inline";
        } else {
          unreadBadge.style.display = "none";
        }
      }
    }
  } catch (error) {
    console.error("Error fetching unread counts:", error);
  }
}

// ========== Select Seller ==========
async function selectSeller(sellerId, sellerName) {
  console.log("Selecting seller:", sellerId, sellerName);
  
  document.querySelectorAll(".seller-item").forEach(item => {
    item.classList.remove("active");
  });
  
  const selectedItem = document.querySelector(`[data-seller-id="${sellerId}"]`);
  if (selectedItem) {
    selectedItem.classList.add("active");
  }

  activeSellerId = sellerId;
  activeSellerName = sellerName;
  
  updateConversationHeader(sellerName);
  enableMessaging();
  markMessagesAsRead(sellerId);
  loadMessages(sellerId);
}

// ========== Update Conversation Header ==========
function updateConversationHeader(sellerName) {
  const conversationHeader = document.querySelector('.card-header h5');
  if (conversationHeader) {
    conversationHeader.textContent = `Conversation with ${sellerName}`;
  }
  
  const selectedSellerElement = document.getElementById("selectedSellerName");
  if (selectedSellerElement) {
    selectedSellerElement.textContent = sellerName;
  }
  
  const welcomeMessage = document.querySelector('.welcome-message');
  const chatInterface = document.querySelector('.chat-interface');
  
  if (welcomeMessage) {
    welcomeMessage.style.display = 'none';
  }
  if (chatInterface) {
    chatInterface.style.display = 'block';
  }
}

// ========== Enable Messaging ==========
function enableMessaging() {
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  
  if (messageInput) {
    messageInput.disabled = false;
    messageInput.placeholder = "Type your message here...";
  }
  
  if (sendButton) {
    sendButton.disabled = false;
  }
}

// ========== Load Messages ==========
async function loadMessages(sellerId) {
  const messageThread = document.getElementById("messageThread");
  
  if (!messageThread) {
    console.error("Message thread element not found");
    return;
  }
  
  if (messageListener) {
    messageListener();
  }
  
  console.log("Loading messages for seller:", sellerId);
  messageThread.innerHTML = `<div class="text-center p-3">Loading messages...</div>`;

  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      throw new Error("User not authenticated");
    }

    const chatId = await getOrCreateChat(currentUserId, sellerId);
    
    const messagesRef = collection(db, "chats", chatId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

    console.log("Setting up message listener for chat:", chatId);

    messageListener = onSnapshot(messagesQuery, (snapshot) => {
      console.log("Message snapshot received, size:", snapshot.size);
      
      messageThread.innerHTML = "";
      
      if (snapshot.empty) {
        messageThread.innerHTML = `
          <div class="text-center p-3 text-muted">
            <i class="fas fa-comment-slash fa-2x mb-2"></i>
            <p>No messages yet. Start the conversation!</p>
          </div>
        `;
        return;
      }

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        console.log("Message data:", data);
        
        const isAdmin = data.senderId === currentUserId;
        
        const messageDiv = document.createElement("div");
        messageDiv.className = `mb-3 ${isAdmin ? 'text-end' : ''}`;
        
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        messageDiv.innerHTML = `
          <div class="text-muted small mb-1">
            ${isAdmin ? 'You' : activeSellerName} - ${timestamp.toLocaleString()}
          </div>
          <div class="message-bubble ${isAdmin ? 'admin-message' : 'seller-message'} p-2 rounded d-inline-block" style="max-width: 70%; background-color: ${isAdmin ? '#007bff' : '#6c757d'}; color: white;">
            ${data.message}
            ${data.attachments && data.attachments.length ? data.attachments.map(url => `<img src="${url}" class="chat-image mt-2" alt="attachment" style="max-width: 100%;" />`).join('') : ''}
          </div>
        `;
        
        messageThread.appendChild(messageDiv);
      });

      messageThread.scrollTop = messageThread.scrollHeight;
    }, (error) => {
      console.error("Error in message listener:", error);
      messageThread.innerHTML = `<div class="text-center p-3 text-danger">Error loading messages: ${error.message}</div>`;
    });

  } catch (error) {
    console.error("Error setting up message listener:", error);
    messageThread.innerHTML = `<div class="text-center p-3 text-danger">Error loading messages: ${error.message}</div>`;
  }
}

// ========== Helper: Get or Create Chat ==========
async function getOrCreateChat(userId, sellerId) {
  try {
    const chatsRef = collection(db, "chats");
    const chatQuery = query(
      chatsRef,
      where("participants", "array-contains", userId)
    );
    const chatSnapshot = await getDocs(chatQuery);

    let chatId = null;
    chatSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.participants.includes(sellerId)) {
        chatId = docSnap.id;
      }
    });

    if (!chatId) {
      const chatData = {
        participants: [userId, sellerId],
        isStarred: false,
        timestamp: serverTimestamp()
      };
      const chatDocRef = await addDoc(chatsRef, chatData);
      chatId = chatDocRef.id;
    }

    return chatId;
  } catch (error) {
    console.error("Error getting or creating chat:", error);
    throw error;
  }
}

// ========== Mark Messages as Read ==========
async function markMessagesAsRead(sellerId) {
  try {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;

    const chatsRef = collection(db, "chats");
    const chatQuery = query(
      chatsRef,
      where("participants", "array-contains", currentUserId)
    );
    const chatSnapshot = await getDocs(chatQuery);

    const batch = [];
    for (const chatDoc of chatSnapshot.docs) {
      const chatData = docSnap.data();
      if (chatData.participants.includes(sellerId)) {
        const messagesRef = collection(db, "chats", chatDoc.id, "messages");
        const unreadQuery = query(
          messagesRef,
          where("isRead", "==", false),
          where("senderId", "==", sellerId)
        );
        const unreadSnapshot = await getDocs(unreadQuery);
        
        unreadSnapshot.forEach((docSnap) => {
          batch.push(updateDoc(doc(db, "chats", chatDoc.id, "messages", docSnap.id), { isRead: true }));
        });
      }
    }
    
    await Promise.all(batch);
    
    const unreadBadge = document.getElementById(`unread-${sellerId}`);
    if (unreadBadge) {
      unreadBadge.style.display = "none";
    }
    
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
}

// ========== Send Message ==========
async function sendMessage(message) {
  if (!activeSellerId || !message.trim()) {
    console.log("Cannot send message: missing seller ID or empty message");
    return;
  }

  if (!auth.currentUser) {
    console.error("No authenticated user");
    showToast("Please log in to send messages", "error");
    return;
  }

  console.log("Sending message to:", activeSellerId);

  try {
    const currentUserId = auth.currentUser.uid;
    const chatId = await getOrCreateChat(currentUserId, activeSellerId);
    
    const messagesRef = collection(db, "chats", chatId, "messages");
    
    const messageData = {
      senderId: currentUserId,
      receiverId: activeSellerId,
      message: message.trim(),
      timestamp: serverTimestamp(),
      isRead: false,
      attachments: []
    };
    
    console.log("Message data:", messageData);
    
    await addDoc(messagesRef, messageData);
    
    console.log("Message sent successfully");
    showToast("Message sent!");
    
  } catch (error) {
    console.error("Error sending message:", error);
    showToast(`Failed to send message: ${error.message}`, "error");
  }
}

// ========== Fetch Notifications ==========
async function fetchNotifications() {
  const notifList = document.getElementById("notificationList");
  const notifCount = document.getElementById("notificationCount");
  
  if (!notifList || !notifCount || !auth.currentUser) return;

  try {
    const currentUserId = auth.currentUser.uid;
    const chatsRef = collection(db, "chats");
    const chatQuery = query(
      chatsRef,
      where("participants", "array-contains", currentUserId)
    );
    const chatSnapshot = await getDocs(chatQuery);

    let totalUnread = 0;
    const notifications = [];

    for (const chatDoc of chatSnapshot.docs) {
      const chatData = chatDoc.data();
      const otherParticipantId = chatData.participants.find(id => id !== currentUserId);
      const messagesRef = collection(db, "chats", chatDoc.id, "messages");
      const unreadQuery = query(
        messagesRef,
        where("isRead", "==", false),
        where("receiverId", "==", currentUserId),
        orderBy("timestamp", "desc"),
        limit(10)
      );
      
      const unreadSnapshot = await getDocs(unreadQuery);
      
      for (const docSnap of unreadSnapshot.docs) {
        const data = docSnap.data();
        totalUnread++;
        
        let senderName = "Unknown Seller";
        try {
          const senderDoc = await getDoc(doc(db, "admin", data.senderId));
          if (senderDoc.exists()) {
            const senderData = senderDoc.data();
            senderName = senderData.shopName || senderData.username || "Unknown Seller";
          }
        } catch (err) {
          console.error("Error fetching sender info:", err);
        }
        
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        notifications.push({
          senderId: data.senderId,
          senderName,
          message: data.message,
          timestamp,
          chatId: chatDoc.id
        });
      }
    }

    notifications.sort((a, b) => b.timestamp - a.timestamp);

    notifList.innerHTML = "";
    
    if (notifications.length === 0) {
      notifCount.textContent = "0";
      notifList.innerHTML = `<li class="dropdown-item text-center text-muted">No new notifications</li>`;
      return;
    }
    
    notifications.slice(0, 10).forEach((notif) => {
      const timeAgo = getTimeAgo(notif.timestamp);
      const notifItem = document.createElement("li");
      notifItem.innerHTML = `
        <a class="dropdown-item d-flex align-items-start gap-2" href="#" onclick="openMessageFromNotif('${notif.senderId}', '${notif.senderName}', '${notif.chatId}')">
          <i class="fas fa-envelope text-primary"></i>
          <div>
            <div><strong>${notif.senderName}</strong></div>
            <small class="text-muted">${notif.message.substring(0, 30)}${notif.message.length > 30 ? '...' : ''}</small>
            <br>
            <small class="text-muted">${timeAgo}</small>
          </div>
        </a>
      `;
      notifList.appendChild(notifItem);
    });
    
    notifCount.textContent = totalUnread.toString();
    
  } catch (error) {
    console.error("Error fetching notifications:", error);
    notifCount.textContent = "0";
    notifList.innerHTML = `<li class="dropdown-item text-center text-danger">Error loading notifications</li>`;
  }
}

// ========== Open Message from Notification ==========
window.openMessageFromNotif = function(sellerId, sellerName, chatId) {
  selectSeller(sellerId, sellerName);
  
  const dropdown = document.getElementById("notificationDropdown");
  if (dropdown) {
    dropdown.classList.remove("show");
  }
};

// ========== Utility Functions ==========
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toastNotification");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");
  
  if (!toast || !toastMessage || !toastIcon) {
    alert(message);
    return;
  }
  
  toastMessage.textContent = message;
  
  if (type === "error") {
    toastIcon.className = "fas fa-exclamation-circle";
    toast.classList.add("toast-error");
  } else {
    toastIcon.className = "fas fa-check-circle";
    toast.classList.remove("toast-error");
  }
  
  toast.classList.add("show");
  setTimeout(() => closeToast(), 3000);
}

function closeToast() {
  const toast = document.getElementById("toastNotification");
  if (toast) {
    toast.classList.remove("show");
  }
}

// ========== Logout Function ==========
window.logout = function () {
  console.log("Logout function triggered"); // Debug log

  // Check if Bootstrap is loaded
  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error("Bootstrap Modal is not available. Ensure Bootstrap JS is loaded.");
    showToast("Failed to display logout modal: Bootstrap is not loaded.", "error");
    return;
  }

  // Check if modal already exists
  let modalElement = document.getElementById('logoutConfirmModal');
  let modal;

  if (modalElement) {
    // If modal exists, get its instance and show it
    modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("Existing logout modal found and reused"); // Debug log
  } else {
    // Create new modal
    const modalHTML = `
      <div class="modal fade" id="logoutConfirmModal" tabindex="-1" aria-labelledby="logoutConfirmModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="logoutConfirmModalLabel">Confirm Logout</h5>
              
            </div>
            <div class="modal-body">
              <p>Are you sure you want to log out?</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelLogoutBtn" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirmLogoutBtn">Log Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log("Logout modal HTML added to DOM"); // Debug log

    modalElement = document.getElementById('logoutConfirmModal');
    if (!modalElement) {
      console.error("Logout modal element not found in DOM after creation");
      showToast("Failed to display logout modal: Modal element not found.", "error");
      return;
    }

    // Initialize modal
    modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("New logout modal created and initialized"); // Debug log
  }

  try {
    // Show the modal
    modal.show();

    const confirmBtn = document.getElementById('confirmLogoutBtn');
    const cancelBtn = document.getElementById('cancelLogoutBtn');

    if (!confirmBtn || !cancelBtn) {
      console.error("Logout buttons not found");
      showToast("Failed to display logout modal: Buttons not found.", "error");
      modal.hide();
      return;
    }

    // Clear any existing listeners to prevent duplicates (using a single event listener)
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));

    // Re-select buttons after cloning
    const newConfirmBtn = document.getElementById('confirmLogoutBtn');
    const newCancelBtn = document.getElementById('cancelLogoutBtn');

    // Handle confirm logout
    newConfirmBtn.addEventListener('click', async function handler() {
      console.log("Confirm logout button clicked"); // Debug log
      newConfirmBtn.disabled = true;
      newConfirmBtn.textContent = 'Logging out...';

      try {
        await signOut(auth);
        console.log("User signed out successfully"); // Debug log
        modal.hide();
        modalElement.remove(); // Remove modal from DOM after logout
        window.location.href = 'index.html';
      } catch (error) {
        console.error('Error during logout:', error);
        showToast('Failed to log out: ' + error.message, "error");
        newConfirmBtn.disabled = false;
        newConfirmBtn.textContent = 'Log Out';
      }
    });

    // Handle cancel button
    newCancelBtn.addEventListener('click', function handler() {
      console.log("Cancel logout button clicked"); // Debug log
      modal.hide();
      // Remove modal from DOM after cancel
      modalElement.remove();
    });

    // Handle modal hidden event to clean up
    modalElement.addEventListener('hidden.bs.modal', function handler() {
      console.log("Logout modal hidden, cleaning up"); // Debug log
      modal.dispose(); // Dispose of the modal instance
      modalElement.remove(); // Remove modal from DOM
    }, { once: true });

  } catch (error) {
    console.error("Error displaying logout modal:", error);
    showToast("Failed to display logout modal: " + error.message, "error");
    if (modalElement) {
      modalElement.remove(); // Clean up on error
    }
  }
};

// ========== Notification Dropdown ==========
function toggleNotificationDropdown() {
  const dropdown = document.getElementById("notificationDropdown");
  if (dropdown) {
    dropdown.classList.toggle("show");
  }
}

// ========== Event Listeners ==========
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Content Loaded");
  
  // Message form submission
  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  
  if (messageForm) {
    messageForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      if (!activeSellerId) {
        showToast("Please select a seller first.", "error");
        return;
      }
      
      const message = messageInput.value.trim();
      if (message) {
        sendMessage(message);
        messageInput.value = "";
      }
    });
  }
  
  // Notification toggle
  const notificationToggle = document.getElementById("notificationToggle");
  if (notificationToggle) {
    notificationToggle.addEventListener("click", toggleNotificationDropdown);
  }
  
  // Toast close
  const toastClose = document.getElementById("toastClose");
  if (toastClose) {
    toastClose.addEventListener("click", closeToast);
  }
  
  // Logout button
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    // Remove any existing listeners to be safe
    logoutButton.replaceWith(logoutButton.cloneNode(true));
    const newLogoutButton = document.getElementById("logoutButton");
    newLogoutButton.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Logout button clicked"); // Debug log
      logout();
    });
  } else {
    console.error("Logout button not found in DOM"); // Debug log
  }
  
  // Global click handler for dropdown
  document.addEventListener("click", function(event) {
    const dropdown = document.getElementById("notificationDropdown");
    const notifBtn = document.getElementById("notificationToggle");
    
    if (dropdown && notifBtn && !notifBtn.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.classList.remove("show");
    }
  });
  
  // Auth state change
  auth.onAuthStateChanged((user) => {
    console.log("Auth state changed:", user ? "logged in" : "logged out");
    if (user) {
      fetchSellers();
      fetchNotifications();
      setInterval(fetchNotifications, 30000);
    } else {
      window.location.href = 'index.html';
    }
  });
});

// ========== Cleanup ==========
window.addEventListener("beforeunload", () => {
  if (messageListener) {
    messageListener();
  }
});