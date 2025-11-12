import { db, collection, getDocs, updateDoc, doc, deleteDoc, auth, onAuthStateChanged, addDoc, getDoc, storage, ref, uploadBytes, getDownloadURL, serverTimestamp, onSnapshot,increment } from "./firebase-config.js";

// DOM Elements
const messageList = document.querySelector('.message-list');
const messagePlaceholder = document.querySelector('.message-placeholder');
const messageContent = document.querySelector('.message-content');
const filterTabs = document.querySelectorAll('.tab-btn');
const refreshBtn = document.querySelector('.refresh-btn');
const searchInput = document.querySelector('.search-container input');
const replyBtn = document.querySelector('.reply-btn');
const userNameEl = document.getElementById('userName');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');

// Collection name
const chatsRef = collection(db, "chats");

// State
let currentFilter = 'all';
let selectedMessageId = null;
let searchQuery = '';
let messages = [];
let currentUser = null;
let processedMessageIds = new Set(); // For deduplication
let unsubscribeChats = null; // Store the chats collection listener
let messageListeners = new Map(); // Store listeners for each chat's messages subcollection

async function countFollowers() {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.warn("No user ID found for current user");
      updateFollowerCount(0);
      return 0;
    }
    const followersDocRef = doc(db, "followers", user.uid);
    const followersDoc = await getDoc(followersDocRef);
    let followerCount = 0;
    if (followersDoc.exists()) {
      followerCount = followersDoc.data().totalFollowers || 0;
    } else {
      console.warn("No followers document found for user:", user.uid);
    }
    updateFollowerCount(followerCount);
    return followerCount;
  } catch (error) {
    console.error("Error counting followers:", error);
    updateFollowerCount(0);
    return 0;
  }
}

function updateFollowerCount(count) {
  const followerCountElement = document.getElementById("followerCount");
  if (followerCountElement) {
    followerCountElement.textContent = `Followers: ${count}`;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("User not authenticated, redirecting to login");
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;
  if (userNameEl) {
    userNameEl.textContent = user.displayName || user.email?.split('@')[0] || 'User';
  } else {
    console.warn("Element #userName not found in DOM");
  }
  const profilePicElement = document.getElementById('sidebar-profile-picture');
  if (profilePicElement && user.photoURL) {
    profilePicElement.src = user.photoURL;
  }
  await countFollowers();
  await fetchMessages();
  attachImagePreviewListener();
});

async function getUserDisplayName(userId) {
  if (!userId) return "Unknown User";
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log(`User data for ${userId}:`, userData);
      return userData.username || userData.email?.split('@')[0] || `User (${userData.phone?.substring(0, 6)}...)` || `User ${userId.substring(0, 6)}`;
    }
    const adminDoc = await getDoc(doc(db, "admin", userId));
    if (adminDoc.exists()) {
      const adminData = adminDoc.data();
      console.log(`Admin data for ${userId}:`, adminData);
      return adminData.username || adminData.email?.split('@')[0] || `User (${adminData.phone?.substring(0, 6)}...)` || `User ${userId.substring(0, 6)}`;
    }
    console.warn(`No user or admin data found for ${userId}`);
    return `User ${userId.substring(0, 6)}`;
  } catch (error) {
    console.error("Error fetching user display name:", error);
    return `User ${userId.substring(0, 6)}`;
  }
}

async function fetchMessages() {
  try {
    if (!auth.currentUser) {
      console.error("User not logged in");
      alert("Please log in to view messages.");
      return;
    }
    // Clean up existing listeners
    if (unsubscribeChats) {
      unsubscribeChats();
      console.log("Unsubscribed from previous chats listener");
    }
    messageListeners.forEach((unsubscribe) => unsubscribe());
    messageListeners.clear();
    processedMessageIds.clear();
    messages = [];

    // Listen for real-time updates to chats collection
    unsubscribeChats = onSnapshot(chatsRef, async (querySnapshot) => {
      console.log("Chats snapshot received, changes:", querySnapshot.docChanges().length);
      const chatPromises = [];
      for (const change of querySnapshot.docChanges()) {
        const docSnap = change.doc;
        const chatId = docSnap.id;
        const chatMeta = docSnap.data();

        if (change.type === "removed") {
          messages = messages.filter((msg) => msg.id !== chatId);
          messageListeners.delete(chatId);
          console.log(`Chat ${chatId} removed`);
          continue;
        }

        const participants = chatMeta.participants || [];
        if (!participants.includes(auth.currentUser.uid)) {
          continue;
        }

        // Listen for real-time updates to messages subcollection
        chatPromises.push(new Promise((resolve) => {
          const messagesRef = collection(db, "chats", chatId, "messages");
          const unsubscribe = onSnapshot(messagesRef, async (messageSnapshot) => {
            console.log(`Messages snapshot for chat ${chatId}, changes: ${messageSnapshot.docChanges().length}`);
            const chatMessages = messageSnapshot.docs
              .map((m) => ({ id: m.id, ...m.data() }))
              .filter((m) => !processedMessageIds.has(m.id)) // Deduplicate
              .sort((a, b) => toJsDate(a.timestamp) - toJsDate(b.timestamp)); // Oldest first

            // Add new message IDs to processed set
            chatMessages.forEach((m) => processedMessageIds.add(m.id));

            if (chatMessages.length === 0) {
              // If no messages, check if chat should be removed
              if (messageSnapshot.empty) {
                messages = messages.filter((msg) => msg.id !== chatId);
              }
              resolve();
              return;
            }

            const latestMessage = chatMessages[chatMessages.length - 1];
            const otherParticipantId = participants.find((id) => id !== auth.currentUser.uid);
            const [otherParticipantName, senderName] = await Promise.all([
              getUserDisplayName(otherParticipantId),
              getUserDisplayName(latestMessage.senderId),
            ]);
            const fullContent = chatMessages.map((m) => m.message || '').join(' ');

            // Update or add message to messages array
            const existingIndex = messages.findIndex((msg) => msg.id === chatId);
            const messageData = {
              id: chatId,
              messageId: latestMessage.id,
              sender: senderName,
              subject: latestMessage.message ? 'Message' : '(No Subject)',
              preview: latestMessage.message || '',
              date: toJsDate(chatMeta.lastMessageTimestamp || latestMessage.timestamp).toISOString(),
              isRead: latestMessage.isRead || false,
              isImportant: false,
              isFlagged: false,
              isStarred: chatMeta.isStarred || false,
              tags: [],
              body: latestMessage.message || '',
              attachments: latestMessage.attachments || [],
              email: await getEmailFromId(latestMessage.senderId) || '',
              senderId: latestMessage.senderId || '',
              receiverId: latestMessage.receiverId || '',
              participantName: otherParticipantName,
              participantId: otherParticipantId,
              fullContent,
            };

            if (existingIndex >= 0) {
              messages[existingIndex] = messageData;
            } else {
              messages.push(messageData);
            }

            resolve();
          }, (error) => {
            console.error(`Error in messages snapshot for chat ${chatId}:`, error);
            resolve(); // Continue processing other chats
          });

          messageListeners.set(chatId, unsubscribe);
        }));
      }

      await Promise.all(chatPromises);
      messages.sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first
      renderMessageList();
      updateMessageCount();

      // If a message is selected, refresh its conversation view
      if (selectedMessageId) {
        selectMessage(selectedMessageId);
      }
    }, (error) => {
      console.error("Error in chats snapshot:", error);
      alert("Failed to load messages in real-time: " + (error.message || error.code || "Unknown error"));
    });
  } catch (error) {
    console.error("Error setting up real-time message fetching:", error);
    alert("Failed to initialize message fetching: " + (error.message || error.code || "Unknown error"));
  }
}

async function getSenderName(userId) {
  return await getUserDisplayName(userId);
}

async function getEmailFromId(userId) {
  if (!userId) return "";
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists() && userDoc.data().email) {
      return userDoc.data().email;
    }
    const adminDoc = await getDoc(doc(db, "admin", userId));
    if (adminDoc.exists() && adminDoc.data().email) {
      return adminDoc.data().email;
    }
    return "";
  } catch (error) {
    console.error("Error fetching email:", error);
    return "";
  }
}

function renderMessageList() {
  messageList.innerHTML = '';
  const filtered = messages.filter((msg) => {
    if (currentFilter === 'unread' && msg.isRead) return false;
    if (currentFilter === 'important' && !msg.isImportant) return false;
    if (currentFilter === 'flagged' && !msg.isFlagged) return false;
    if (searchQuery) {
      const combined = `${msg.sender} ${msg.participantName} ${msg.email} ${msg.subject} ${msg.preview} ${msg.fullContent}`.toLowerCase();
      return combined.includes(searchQuery.toLowerCase());
    }
    return true;
  });
  if (filtered.length === 0) {
    messageList.innerHTML = `
      <div class="empty-state">
        <i class="far fa-folder-open"></i>
        <p>No messages found</p>
      </div>`;
    return;
  }
  filtered.forEach((msg) => {
    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${msg.isRead ? '' : 'unread'} ${selectedMessageId === msg.id ? 'selected' : ''}`;
    messageItem.setAttribute('data-id', msg.id);
    const displayName = msg.participantName || msg.sender;
    const formattedDate = formatDate(msg.date);
    messageItem.innerHTML = `
      <div class="avatar">
        <span class="initials">${getInitials(displayName)}</span>
      </div>
      <div class="message-content-preview">
        <div class="message-header">
          <span class="message-sender">${displayName}</span>
          <span class="message-date">${formattedDate}</span>
        </div>
        <div class="message-preview">${msg.subject}: ${msg.preview}</div>
      </div>
      <div class="message-actions">
        <div class="dropdown">
          <button class="btn btn-icon" type="button" id="dropdownMenuButton-${msg.id}" data-bs-toggle="dropdown" aria-expanded="false" title="More options">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownMenuButton-${msg.id}">
            <li><a class="dropdown-item mark-unread-btn" href="#" data-id="${msg.id}">Mark as ${msg.isRead ? 'Unread' : 'Read'}</a></li>
            <li><a class="dropdown-item delete-msg-btn" href="#" data-id="${msg.id}">Delete</a></li>
          </ul>
        </div>
      </div>
    `;
    messageItem.addEventListener('click', () => selectMessage(msg.id));
    const markUnreadBtn = messageItem.querySelector('.mark-unread-btn');
    markUnreadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReadStatus(msg.id);
    });
    const deleteBtn = messageItem.querySelector('.delete-msg-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(msg.id);
    });
    messageList.appendChild(messageItem);
  });
}

async function toggleReadStatus(id) {
  const msg = messages.find((m) => m.id === id);
  if (msg) {
    try {
      const messagesRef = collection(db, "chats", id, "messages");
      const snapshot = await getDocs(messagesRef);
      const latestMessage = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => toJsDate(b.timestamp) - toJsDate(a.timestamp))[0];
      if (latestMessage) {
        const newReadStatus = !msg.isRead;
        await updateDoc(doc(db, "chats", id, "messages", latestMessage.id), { isRead: newReadStatus });
        // Update local state (onSnapshot will handle further updates)
        msg.isRead = newReadStatus;
        renderMessageList();
        updateMessageCount();
      }
    } catch (error) {
      console.error("Error updating read status:", error);
      alert("Failed to update message status: " + (error.message || error.code || "Unknown error"));
    }
  }
}

async function selectMessage(id) {
  selectedMessageId = id;
  const msg = messages.find((m) => m.id === id);
  if (!msg) {
    console.error("Message not found for id:", id);
    return;
  }
  try {
    if (!msg.isRead) {
      const messagesRef = collection(db, "chats", id, "messages");
      const snapshot = await getDocs(messagesRef);
      const latestMessage = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => toJsDate(b.timestamp) - toJsDate(b.timestamp))[0];
      if (latestMessage) {
        await updateDoc(doc(db, "chats", id, "messages", latestMessage.id), { isRead: true });
        // Local state will be updated by onSnapshot
      }
    }
    const currentUser = auth.currentUser;
    let otherParticipantName = msg.participantName;
    const otherParticipantId = msg.participantId || (msg.senderId === currentUser.uid ? msg.receiverId : msg.senderId);
    if (!otherParticipantName) {
      otherParticipantName = await getUserDisplayName(otherParticipantId);
    }
    const messagesRef = collection(db, "chats", id, "messages");
    const snapshot = await getDocs(messagesRef);
    const conversation = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => toJsDate(a.timestamp) - toJsDate(b.timestamp)); // Oldest first
    messageContent.innerHTML = `
      <div class="conversation-header">
        <h2>${otherParticipantName}</h2>
      </div>
      <div class="conversation-body">
        ${conversation.map((m) => `
          <div class="chat-message ${m.senderId === currentUser?.uid ? 'sent' : 'received'}">
            <div class="message-bubble">
              ${m.message ? `<p>${m.message}</p>` : ''}
              ${Array.isArray(m.attachments) ? m.attachments.map((url) => `
                <img src="${url}" class="chat-image" alt="attachment" />
              `).join('') : ''}
              <small>${formatDate(m.timestamp)}</small>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="reply-box" id="replyBox">
        <textarea id="replyText" placeholder="Type your reply..."></textarea>
        <label for="imageInput" title="Attach image">📎</label>
        <input type="file" id="imageInput" accept="image/*" multiple />
        <div id="imagePreview" class="image-preview"></div>
        <button class="reply-send-btn" onclick="sendReply('${otherParticipantId}')">Send</button>
      </div>
    `;
    messagePlaceholder.classList.add('hidden');
    messageContent.classList.remove('hidden');
    const inboxContainer = document.querySelector('.inbox-container');
    const messageDetailContainer = document.querySelector('.message-detail-container');
    if (window.innerWidth <= 900) {
      inboxContainer.style.display = 'none';
      messageDetailContainer.style.display = 'flex';
    } else {
      inboxContainer.style.display = 'flex';
      messageDetailContainer.style.display = 'flex';
    }
    window.currentRecipientId = otherParticipantId;
    const conversationBody = document.querySelector('.conversation-body');
    if (conversationBody) {
      conversationBody.scrollTop = conversationBody.scrollHeight;
    }
    console.log("Re-attaching image preview listener after selectMessage");
    attachImagePreviewListener();
  } catch (error) {
    console.error("Error loading conversation:", error);
    alert("Failed to load conversation: " + (error.message || error.code || "Unknown error"));
  }
}

function getPersistentParticipantName(userId) {
  if (selectedMessageId && messages.find((msg) => msg.id === selectedMessageId)?.participantName) {
    return messages.find((msg) => msg.id === selectedMessageId).participantName;
  }
  return `User ${userId.substring(0, 6)}`;
}

function formatDate(input) {
  try {
    let date;
    if (!input) return "Invalid date";
    if (typeof input.toDate === 'function') {
      date = input.toDate();
    } else if (typeof input === 'string' || typeof input === 'number') {
      date = new Date(input);
    } else if (input instanceof Date) {
      date = input;
    } else {
      return "Invalid date";
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
}

function toJsDate(timestamp) {
  if (!timestamp) return new Date();
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  return new Date();
}

function getInitials(name) {
  if (!name) return "U";
  return name.split(' ').map((n) => n.charAt(0).toUpperCase()).join('').substring(0, 2);
}

async function toggleStar(id) {
  const msg = messages.find((m) => m.id === id);
  if (msg) {
    try {
      const newStarStatus = !msg.isStarred;
      await updateDoc(doc(db, 'chats', id), { isStarred: newStarStatus });
      // Local state will be updated by onSnapshot
    } catch (error) {
      console.error("Error updating star status:", error);
      alert("Failed to update star status: " + (error.message || error.code || "Unknown error"));
    }
  }
}

async function deleteMessage(id) {
  const confirmDelete = confirm("Are you sure you want to delete this message and its conversation?");
  if (!confirmDelete) return;
  try {
    const messagesRef = collection(db, "chats", id, "messages");
    const messageDocs = await getDocs(messagesRef);
    const deletePromises = messageDocs.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deletePromises);
    await deleteDoc(doc(db, 'chats', id));
    // Local state will be updated by onSnapshot
    selectedMessageId = null;
    messageContent.classList.add('hidden');
    messagePlaceholder.classList.remove('hidden');
  } catch (error) {
    console.error("Error deleting chat and messages:", error);
    alert("Failed to delete the message and conversation: " + (error.message || error.code || "Unknown error"));
  }
}

async function sendReply(recipientId) {
  const replyText = document.getElementById('replyText').value.trim();
  const imageInput = document.getElementById('imageInput');
  const imageFiles = Array.from(imageInput.files);
  if (!replyText && imageFiles.length === 0) {
    alert("Please write a message or select an image.");
    return;
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    alert("You must be logged in to send a message.");
    return;
  }
  const receiverId = recipientId || window.currentRecipientId;
  const chatId = selectedMessageId;
  if (!receiverId || !chatId) {
    alert("Missing recipient or chat ID.");
    return;
  }
  let imageUrls = [];
  if (imageFiles.length > 0) {
    try {
      for (const file of imageFiles) {
        if (file.type.startsWith('image/')) {
          const imageRef = ref(storage, `chat_images/${chatId}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(imageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          imageUrls.push(downloadURL);
          console.log(`Uploaded image ${file.name}, URL: ${downloadURL}`);
        }
      }
    } catch (error) {
      console.error("Image upload failed:", error);
      alert("Failed to upload image(s): " + (error.message || error.code || "Unknown error"));
      return;
    }
  }
  try {
    const messageData = {
      senderId: currentUser.uid,
      receiverId,
      message: replyText,
      timestamp: serverTimestamp(),
      attachments: imageUrls,
      isRead: false,
    };
    const messageRef = await addDoc(collection(db, "chats", chatId, "messages"), messageData);
    // Update unread counts
    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: replyText || (imageUrls.length > 0 ? "Image sent" : ""),
      lastMessageTimestamp: serverTimestamp(),
      [`unreadCounts.${receiverId}`]: increment(1),
      [`unreadCounts.${currentUser.uid}`]: 0,
    });
    console.log("Message sent with ID:", messageRef.id);
    document.getElementById('replyText').value = "";
    imageInput.value = "";
    imagePreview.innerHTML = '';
    // selectMessage(chatId); // onSnapshot will handle UI update
  } catch (error) {
    console.error("Failed to send reply:", error);
    alert("Failed to send message: " + (error.message || error.code || "Unknown error"));
  }
}

function updateMessageCount() {
  document.querySelector('.message-count').textContent = `${messages.length} messages`;
  document.querySelector('.unread-count').textContent = `${messages.filter((m) => !m.isRead).length} unread`;
}

filterTabs.forEach((tab) => tab.addEventListener('click', function () {
  filterTabs.forEach((t) => t.classList.remove('active'));
  this.classList.add('active');
  currentFilter = this.dataset.filter;
  renderMessageList();
}));

refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('fa-spin');
  setTimeout(() => {
    refreshBtn.classList.remove('fa-spin');
    // No need to call fetchMessages; onSnapshot keeps data fresh
    renderMessageList();
  }, 1000);
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  renderMessageList();
});

if (replyBtn) {
  replyBtn.addEventListener('click', () => {
    toggleReplyBox();
  });
}

function attachImagePreviewListener() {
  const imageInput = document.getElementById('imageInput');
  const imagePreview = document.getElementById('imagePreview');
  if (imageInput && imagePreview) {
    console.log("Attaching image preview listener");
    imageInput.removeEventListener('change', handleImageChange);
    imageInput.addEventListener('change', handleImageChange);
  } else {
    console.error("Failed to attach image preview listener: imageInput or imagePreview not found", {
      imageInput: !!imageInput,
      imagePreview: !!imagePreview,
    });
  }
}

function handleImageChange() {
  const imageInput = document.getElementById('imageInput');
  const imagePreview = document.getElementById('imagePreview');
  if (!imageInput || !imagePreview) {
    console.error("DOM elements missing in handleImageChange", {
      imageInput: !!imageInput,
      imagePreview: !!imagePreview,
    });
    return;
  }
  console.log("Image input changed, files selected:", imageInput.files.length);
  const files = Array.from(imageInput.files);
  imagePreview.innerHTML = '';
  if (files.length > 0) {
    files.forEach((file, index) => {
      if (file && file.type.startsWith('image/')) {
        console.log(`Processing file ${index + 1}: ${file.name}, type: ${file.type}`);
        const reader = new FileReader();
        reader.onload = (e) => {
          console.log(`FileReader loaded for ${file.name}, data URL length: ${e.target.result.length}`);
          const imgContainer = document.createElement('div');
          imgContainer.className = 'preview-item';
          imgContainer.innerHTML = `
            <img src="${e.target.result}" alt="Image Preview" />
            <button class="remove-preview-btn" data-index="${index}" title="Remove Image">×</button>
          `;
          imagePreview.appendChild(imgContainer);
          const removeBtn = imgContainer.querySelector('.remove-preview-btn');
          removeBtn.addEventListener('click', () => removeImagePreview(index));
        };
        reader.onerror = (e) => {
          console.error(`FileReader error for ${file.name}:`, e);
        };
        reader.readAsDataURL(file);
      } else {
        console.warn(`Skipping file ${file.name}: not an image`);
      }
    });
  }
}

function removeImagePreview(index) {
  const imageInput = document.getElementById('imageInput');
  if (!imageInput) {
    console.error("Failed to remove image preview: imageInput not found");
    return;
  }
  console.log(`Removing image at index ${index}`);
  const dt = new DataTransfer();
  const files = Array.from(imageInput.files).filter((_, i) => i !== index);
  files.forEach((file) => dt.items.add(file));
  imageInput.files = dt.files;
  handleImageChange();
}

function clearFileInput() {
  const imageInput = document.getElementById('imageInput');
  const imagePreview = document.getElementById('imagePreview');
  if (imageInput && imagePreview) {
    console.log("Clearing file input and preview");
    imageInput.value = '';
    imagePreview.innerHTML = '';
  } else {
    console.error("Failed to clear file input: imageInput or imagePreview not found", {
      imageInput: !!imageInput,
      imagePreview: !!imagePreview,
    });
  }
}

async function addDemoMessages() {
  if (messages.length === 0) {
    console.log("Adding demo messages");
    if (!auth.currentUser) {
      console.error("Cannot add demo messages: User not logged in");
      return;
    }
    const currentUserId = auth.currentUser.uid;
    const demoMessages = [
      {
        message: "Thank you for your recent order #12345. Your items will be shipped within 2 business days.",
        senderId: "demoSender1",
        receiverId: currentUserId,
        timestamp: serverTimestamp(),
        isRead: false,
      },
      {
        message: "Hi there, just a reminder about our meeting tomorrow at 2pm. Please bring your presentation materials.",
        senderId: "demoSender2",
        receiverId: currentUserId,
        timestamp: serverTimestamp(),
        isRead: false,
      },
    ];
    try {
      for (const msg of demoMessages) {
        const chatDoc = await addDoc(collection(db, "chats"), {
          participants: [msg.senderId, msg.receiverId],
          isStarred: false,
          unreadCounts: { [msg.senderId]: 0, [msg.receiverId]: 1 },
          lastMessage: msg.message,
          lastMessageTimestamp: serverTimestamp(),
        });
        await addDoc(collection(db, "chats", chatDoc.id, "messages"), msg);
      }
      // No need to call fetchMessages; onSnapshot will handle updates
    } catch (error) {
      console.error("Error adding demo messages:", error);
      alert("Failed to add demo messages: " + (error.message || error.code || "Unknown error"));
    }
  }
}

window.toggleReplyBox = toggleReplyBox;
window.sendReply = sendReply;
window.addDemoMessages = addDemoMessages;
window.clearFileInput = clearFileInput;

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded, initializing image preview listener");
  attachImagePreviewListener();
});