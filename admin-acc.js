import {
  app,
  db,
  auth,
  doc,
  getDoc,
  setDoc,
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  onSnapshot,
  analytics,
  logEvent,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "./firebase-config.js";

// Global variables to store current user data
let currentUser = null;
let isUserLoaded = false;
let notifications = [];
let isEditMode = false;

// DOM elements
const avatarUpload = document.getElementById("avatarUpload");
const avatarImage = document.getElementById("avatarImage");
const profileForm = document.getElementById("profileForm");
const passwordForm = document.getElementById("passwordForm");
const notificationButton = document.getElementById("notification-button");
const notificationList = document.querySelector(".notification-list");
const notificationBadge = document.querySelector(".notification-badge");
const editBtn = document.getElementById("editBtn");
const cancelBtn = document.getElementById("cancelBtn");
const saveBtn = document.getElementById("saveBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const uploadSection = document.querySelector(".upload-section");
const actionButtons = document.querySelector(".action-buttons");
const passwordActionButtons = document.querySelector(".password-action-buttons");
const toggleCurrentPassword = document.getElementById("toggleCurrentPassword");
const toggleNewPassword = document.getElementById("toggleNewPassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");
const phoneInput = document.getElementById("phone");

// Validation functions
function validateUsername(username) {
  if (!username) {
    return "Username is required.";
  }
  if (username.length < 3 || username.length > 20) {
    return "Username must be between 3 and 20 characters.";
  }
  if (!/^[a-zA-Z0-9\s_-]+$/.test(username)) {
    return "Username can only contain letters, numbers, spaces, underscores, or hyphens.";
  }
  return "";
}

function validateEmail(email) {
  if (!email) {
    return "Email is required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }
  return "";
}

function validatePhone(phone) {
  if (!phone) {
    return ""; // Phone is optional
  }

  // Check for invalid characters (allow only digits, +, -, (, ), and spaces)
  if (!/^[0-9\s-+()]+$/.test(phone)) {
    return "Phone number can only contain digits, spaces, hyphens, parentheses, or a leading +.";
  }

  // Strip spaces, hyphens, parentheses, and plus sign for validation
  const cleanPhone = phone.replace(/[\s-()+]/g, "");

  // Valid Philippine mobile prefixes (as of 2025)
  const validPrefixes = [
    "905", "906", "907", "908", "909", "910", "911", "912", "913", "914", 
    "915", "916", "917", "918", "919", "920", "921", "922", "923", "924", 
    "925", "926", "927", "928", "929", "930", "931", "932", "933", "934", 
    "935", "936", "937", "938", "939", "940", "941", "942", "943", "944", 
    "945", "946", "947", "948", "949", "950", "951", "952", "953", "954", 
    "955", "956", "957", "958", "959", "960", "961", "962", "963", "964", 
    "965", "966", "967", "968", "969", "970", "971", "972", "973", "974", 
    "975", "976", "977", "978", "979", "980", "981", "982", "983", "984", 
    "985", "986", "987", "988", "989", "990", "991", "992", "993", "994", 
    "995", "996", "997", "998", "999"
  ];

  // Check if the number starts with +63 or 0, followed by a valid prefix and 7 digits
  if (cleanPhone.startsWith("63") && cleanPhone.length === 12) {
    const prefix = cleanPhone.slice(2, 5); // Extract prefix after +63
    if (!validPrefixes.includes(prefix)) {
      return "Invalid Philippine mobile prefix.";
    }
    return "";
  } else if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
    const prefix = cleanPhone.slice(1, 4); // Extract prefix after 0
    if (!validPrefixes.includes(prefix)) {
      return "Invalid Philippine mobile prefix.";
    }
    return "";
  } else {
    return "Philippine phone number must be 10 digits (starting with 0) or 12 digits (starting with +63).";
  }
}

function validateLocation(location) {
  if (!location) {
    return ""; // Location is optional
  }
  if (location.length < 2 || location.length > 100) {
    return "Location must be between 2 and 100 characters.";
  }
  if (!/^[a-zA-Z0-9\s,.-]+$/.test(location)) {
    return "Location can only contain letters, numbers, spaces, commas, periods, or hyphens.";
  }
  return "";
}

function validatePassword(password, isNewPassword = false) {
  if (!password) {
    return "Password is required.";
  }
  if (password.length < 8 || password.length > 20) {
    return "Password must be between 8 and 20 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (isNewPassword && !/[_!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return "New password must contain at least one special character (e.g., _!@#$%^&*).";
  }
  return "";
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Edit button
  if (editBtn) {
    editBtn.addEventListener("click", toggleEditMode);
  }

  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener("click", cancelEdit);
  }

  // Avatar upload
  if (avatarUpload) {
    avatarUpload.addEventListener("change", handleAvatarUpload);
  }

  // Profile form submission
  if (profileForm) {
    profileForm.addEventListener("submit", handleProfileFormSubmit);
  }

  // Password form submission
  if (passwordForm) {
    passwordForm.addEventListener("submit", handlePasswordFormSubmit);
  }

  // Notification button toggle
  if (notificationButton) {
    notificationButton.addEventListener("click", toggleNotificationDropdown);
  }

  // Clear notifications
  const clearNotifications = document.getElementById("clearNotifications");
  if (clearNotifications) {
    clearNotifications.addEventListener("click", () => {
      notifications = [];
      updateNotificationList();
      if (analytics) {
        logEvent(analytics, "notifications_cleared", { userId: currentUser?.uid });
      }
    });
  }

  // Logout button
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    logoutButton.replaceWith(logoutButton.cloneNode(true));
    const newLogoutButton = document.getElementById("logoutButton");
    newLogoutButton.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Logout button clicked");
      logout();
    });
  } else {
    console.error("Logout button not found in DOM");
  }

  // Password visibility toggles
  if (toggleCurrentPassword) {
    toggleCurrentPassword.addEventListener("click", () => togglePasswordVisibility("currentPassword", "toggleCurrentPassword"));
  }
  if (toggleNewPassword) {
    toggleNewPassword.addEventListener("click", () => togglePasswordVisibility("newPassword", "toggleNewPassword"));
  }
  if (toggleConfirmPassword) {
    toggleConfirmPassword.addEventListener("click", () => togglePasswordVisibility("confirmPassword", "toggleConfirmPassword"));
  }

  // Real-time phone input validation
  if (phoneInput) {
    phoneInput.addEventListener("input", (e) => {
      const value = e.target.value;
      // Allow only digits, +, -, (, ), and spaces
      if (value && !/^[0-9\s-+()]*$/.test(value)) {
        e.target.value = value.replace(/[^0-9\s-+()]/g, "");
        showErrorMessage("Phone number can only contain digits, spaces, hyphens, parentheses, or a leading +.");
      }
    });
  }

  // Drag and drop functionality for avatar
  if (avatarImage) {
    avatarImage.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isEditMode) {
        avatarImage.style.border = "2px dashed #007bff";
      }
    });

    avatarImage.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      avatarImage.style.border = "4px solid #e1e5e9";
    });

    avatarImage.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      avatarImage.style.border = "4px solid #e1e5e9";

      if (isEditMode) {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith("image/")) {
          if (files[0].size > 5 * 1024 * 1024) {
            showErrorMessage("Image size must be less than 5MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            avatarImage.src = e.target.result;
          };
          reader.readAsDataURL(files[0]);
          avatarUpload.files = files;
        } else {
          showErrorMessage("Please upload a valid image file.");
        }
      }
    });
  }
}

// Toggle password visibility
function togglePasswordVisibility(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (input && toggle) {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    toggle.classList.toggle("fa-eye", !isPassword);
    toggle.classList.toggle("fa-eye-slash", isPassword);
    addNotification(`Password visibility ${isPassword ? "shown" : "hidden"} for ${inputId}`);
  }
}

// Toggle edit mode
function toggleEditMode() {
  isEditMode = !isEditMode;

  // Toggle input fields' disabled state for profile form only
  const profileInputs = profileForm?.querySelectorAll("input") || [];
  profileInputs.forEach((input) => {
    input.disabled = !isEditMode;
  });

  // Toggle visibility of buttons and upload section
  if (editBtn) {
    editBtn.style.display = isEditMode ? "none" : "inline-block";
  }
  if (actionButtons) {
    actionButtons.style.display = isEditMode ? "flex" : "none";
  }
  if (uploadSection) {
    uploadSection.style.display = isEditMode ? "block" : "none";
  }

  if (isEditMode) {
    addNotification("Entered edit mode");
  } else {
    cancelEdit();
  }
}

// Cancel edit mode
function cancelEdit() {
  isEditMode = false;

  // Reset profile form to original values
  if (currentUser) {
    const adminRef = doc(db, "admin", currentUser.uid);
    getDoc(adminRef).then((adminSnap) => {
      if (adminSnap.exists()) {
        const data = adminSnap.data();
        setInputValue("username", data.username || "");
        setInputValue("email", data.email || currentUser.email || "");
        setInputValue("phone", data.phone || "");
        setInputValue("location", data.location || "");
        setInputValue("currentPassword", "");
        setInputValue("newPassword", "");
        setInputValue("confirmPassword", "");
        if (data.profilePicture && avatarImage) {
          avatarImage.src = data.profilePicture;
        }
      }
    }).catch((error) => {
      console.error("Error fetching admin data on cancel:", error);
      showErrorMessage("Failed to reset form data.");
    });

    // Clear avatar upload
    if (avatarUpload) {
      avatarUpload.value = "";
    }
  }

  // Toggle input fields' disabled state for profile form only
  const profileInputs = profileForm?.querySelectorAll("input") || [];
  profileInputs.forEach((input) => {
    input.disabled = true;
  });

  // Toggle visibility of buttons and upload section
  if (editBtn) {
    editBtn.style.display = "inline-block";
  }
  if (actionButtons) {
    actionButtons.style.display = "none";
  }
  if (uploadSection) {
    uploadSection.style.display = "none";
  }

  addNotification("Edit mode cancelled");
}

// Handle avatar upload
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      showErrorMessage("Image size must be less than 5MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showErrorMessage("Please upload a valid image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

// Upload profile picture to Firebase Storage
async function uploadProfilePicture(file, uid) {
  try {
    const storageRef = ref(storage, `profile_pictures/${uid}/${file.name}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    throw new Error("Failed to upload profile picture.");
  }
}

// Toggle notification dropdown
function toggleNotificationDropdown() {
  const notificationContainer = document.querySelector(".notification-content");
  if (notificationContainer) {
    notificationContainer.classList.toggle("open");
  }
}

// Add notification to list
function addNotification(message) {
  notifications.push({
    message,
    timestamp: new Date().toISOString(),
  });
  updateNotificationList();
  if (analytics) {
    logEvent(analytics, "notification_added", { message, userId: currentUser?.uid });
  }
}

// Update notification list in UI
function updateNotificationList() {
  if (notificationList && notificationBadge) {
    notificationBadge.textContent = notifications.length;
    notificationList.innerHTML = notifications.length > 0
      ? notifications
          .map(
            (n) => `
        <li class="notification-item">
          <div class="notification-title">${n.message}</div>
          <div class="notification-time">${new Date(n.timestamp).toLocaleString()}</div>
        </li>
      `
          )
          .join("")
      : '<li class="notification-item">No notifications</li>';
  }
}

// Show success modal
function showSuccessModal(title, message) {
  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error("Bootstrap Modal is not available. Ensure Bootstrap JS is loaded.");
    showErrorMessage("Failed to display success modal: Bootstrap is not loaded.");
    return;
  }

  let modalElement = document.getElementById('successModal');
  let modal;

  if (modalElement) {
    modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("Existing success modal found and reused");
  } else {
    const modalHTML = `
      <div class="modal fade" id="successModal" tabindex="-1" aria-labelledby="successModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" style="background-color: #d4edda; border: 1px solid #c3e6cb;">
            <div class="modal-header" style="border-bottom: none;">
              <h5 class="modal-title" id="successModalLabel" style="color: #155724;">${title}</h5>
            </div>
            <div class="modal-body" style="color: #155724;">
              <span>${message}</span>
            </div>
            <div class="modal-footer" style="border-top: none;">
              <button type="button" class="btn btn-primary" id="successOkBtn">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log("Success modal HTML added to DOM");

    modalElement = document.getElementById('successModal');
    if (!modalElement) {
      console.error("Success modal element not found in DOM after creation");
      showErrorMessage("Failed to display success modal: Modal element not found.");
      return;
    }

    modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("New success modal created and initialized");
  }

  try {
    modal.show();

    const okBtn = document.getElementById('successOkBtn');

    if (!okBtn) {
      console.error("Success modal OK button not found");
      showErrorMessage("Failed to display success modal: OK button not found.");
      modal.hide();
      return;
    }

    okBtn.replaceWith(okBtn.cloneNode(true));
    const newOkBtn = document.getElementById('successOkBtn');

    newOkBtn.addEventListener('click', () => {
      console.log("Success modal OK button clicked");
      modal.hide();
      modalElement.remove();
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      console.log("Success modal hidden, cleaning up");
      modal.dispose();
      modalElement.remove();
    }, { once: true });

  } catch (error) {
    console.error("Error displaying success modal:", error);
    showErrorMessage("Failed to display success modal: " + error.message);
    if (modalElement) {
      modalElement.remove();
    }
  }
}

// Logout function
window.logout = function () {
  console.log("Logout function triggered");

  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error("Bootstrap Modal is not available. Ensure Bootstrap JS is loaded.");
    showErrorMessage("Failed to display logout modal: Bootstrap is not loaded.");
    return;
  }

  let modalElement = document.getElementById('logoutConfirmModal');
  let modal;

  if (modalElement) {
    modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("Existing logout modal found and reused");
  } else {
    const modalHTML = `
      <div class="modal fade" id="logoutConfirmModal" tabindex="-1" aria-labelledby="logoutConfirmModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="logoutConfirmModalLabel">Confirm Logout</h5>
            </div>
            <div class="modal-body">
              <span>Are you sure you want to log out?</span>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelLogoutBtn" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirmLogoutBtn">Log Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log("Logout modal HTML added to DOM");

    modalElement = document.getElementById('logoutConfirmModal');
    if (!modalElement) {
      console.error("Logout modal element not found in DOM after creation");
      showErrorMessage("Failed to display logout modal: Modal element not found.");
      return;
    }

    modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("New logout modal created and initialized");
  }

  try {
    modal.show();

    const confirmBtn = document.getElementById('confirmLogoutBtn');
    const cancelBtn = document.getElementById('cancelLogoutBtn');

    if (!confirmBtn || !cancelBtn) {
      console.error("Logout buttons not found");
      showErrorMessage("Failed to display logout modal: Buttons not found.");
      modal.hide();
      return;
    }

    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));

    const newConfirmBtn = document.getElementById('confirmLogoutBtn');
    const newCancelBtn = document.getElementById('cancelLogoutBtn');

    newConfirmBtn.addEventListener('click', async () => {
      console.log("Confirm logout button clicked");
      newConfirmBtn.disabled = true;
      newConfirmBtn.textContent = 'Logging out...';

      try {
        addNotification("User logged out");
        await signOut(auth);
        console.log("User signed out successfully");
        modal.hide();
        modalElement.remove();
        window.location.href = 'index.html';
      } catch (error) {
        console.error('Error during logout: ', error);
        showErrorMessage('Failed to log out: ' + error.message);
        newConfirmBtn.disabled = false;
        newConfirmBtn.textContent = 'Log Out';
      }
    });

    newCancelBtn.addEventListener('click', () => {
      console.log("Cancel logout button clicked");
      modal.hide();
      modalElement.remove();
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      console.log("Logout modal hidden, cleaning up");
      modal.dispose();
      modalElement.remove();
    }, { once: true });

  } catch (error) {
    console.error("Error displaying logout modal:", error);
    showErrorMessage("Failed to display logout modal: " + error.message);
    if (modalElement) {
      modalElement.remove();
    }
  }
};

// Handle profile form submission
async function handleProfileFormSubmit(event) {
  event.preventDefault();

  if (!currentUser) {
    showErrorMessage("Please log in to update your profile.");
    return;
  }

  try {
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    const formData = new FormData(profileForm);
    const profileData = {
      username: formData.get("username")?.trim() || "",
      email: formData.get("email")?.trim() || "",
      phone: formData.get("phone")?.trim() || "",
      location: formData.get("location")?.trim() || "",
      role: "admin",
      uid: currentUser.uid,
      updatedAt: new Date().toISOString(),
    };

    // Validate profile fields
    const usernameError = validateUsername(profileData.username);
    if (usernameError) {
      showErrorMessage(usernameError);
      saveBtn.textContent = "SAVE";
      saveBtn.disabled = false;
      return;
    }

    const emailError = validateEmail(profileData.email);
    if (emailError) {
      showErrorMessage(emailError);
      saveBtn.textContent = "SAVE";
      saveBtn.disabled = false;
      return;
    }

    const phoneError = validatePhone(profileData.phone);
    if (phoneError) {
      showErrorMessage(phoneError);
      saveBtn.textContent = "SAVE";
      saveBtn.disabled = false;
      return;
    }

    const locationError = validateLocation(profileData.location);
    if (locationError) {
      showErrorMessage(locationError);
      saveBtn.textContent = "SAVE";
      saveBtn.disabled = false;
      return;
    }

    const adminRef = doc(db, "admin", currentUser.uid);
    const adminSnap = await getDoc(adminRef);
    const existingData = adminSnap.exists() ? adminSnap.data() : {};

    // Check for changes and add notifications
    if (existingData.username !== profileData.username && profileData.username) {
      addNotification(`Username updated to ${profileData.username}`);
    }
    if (existingData.email !== profileData.email && profileData.email) {
      addNotification(`Email updated to ${profileData.email}`);
    }
    if (existingData.phone !== profileData.phone && profileData.phone) {
      addNotification(`Phone updated to ${profileData.phone}`);
    }
    if (existingData.location !== profileData.location && profileData.location) {
      addNotification(`Location updated to ${profileData.location}`);
    }

    // Handle avatar upload
    if (avatarUpload.files.length > 0) {
      const file = avatarUpload.files[0];
      profileData.profilePicture = await uploadProfilePicture(file, currentUser.uid);
      avatarImage.src = profileData.profilePicture;
      addNotification("Profile picture updated");
    }

    // Update Firebase profile
    await updateProfile(currentUser, { displayName: profileData.username });
    if (profileData.email !== currentUser.email) {
      await updateEmail(currentUser, profileData.email);
    }

    // Save to Firestore
    await setDoc(doc(db, "admin", currentUser.uid), profileData, { merge: true });

    const userNameElement = document.getElementById("userName");
    if (userNameElement && profileData.username) {
      userNameElement.textContent = profileData.username;
    }

    // Show success modal and notification
    showSuccessModal("Profile Updated", "Your profile has been updated successfully!");
    showSuccessMessage("Profile updated successfully!");
    if (analytics) {
      logEvent(analytics, "profile_updated", { userId: currentUser.uid });
    }

    // Exit edit mode after saving
    toggleEditMode();

    saveBtn.textContent = "SAVE";
    saveBtn.disabled = false;
  } catch (error) {
    console.error("Error updating profile:", error);
    showErrorMessage("Failed to update profile: " + error.message);
    saveBtn.textContent = "SAVE";
    saveBtn.disabled = false;
  }
}

// New function to change user password
async function changeUserPassword(currentPassword, newPassword, confirmPassword) {
  if (!currentUser) {
    throw new Error("Please log in to update your password.");
  }

  // Validate password fields
  const currentPasswordError = validatePassword(currentPassword, false);
  if (currentPasswordError) {
    throw new Error(currentPasswordError);
  }

  const newPasswordError = validatePassword(newPassword, true);
  if (newPasswordError) {
    throw new Error(newPasswordError);
  }

  if (newPassword !== confirmPassword) {
    throw new Error("New password and confirm password do not match!");
  }

  if (currentPassword === newPassword) {
    throw new Error("New password cannot be the same as the current password.");
  }

  try {
    // Re-authenticate user
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);

    // Update password
    await updatePassword(currentUser, newPassword);

    // Log analytics event
    if (analytics) {
      logEvent(analytics, "password_updated", { userId: currentUser.uid });
    }

    addNotification("Password updated successfully");
    return true;
  } catch (error) {
    console.error("Error updating password:", error);
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      throw new Error("Current password is incorrect.");
    }
    throw new Error("Failed to update password: " + error.message);
  }
}

// Handle password form submission
async function handlePasswordFormSubmit(event) {
  event.preventDefault();

  try {
    changePasswordBtn.textContent = "Updating...";
    changePasswordBtn.disabled = true;

    const formData = new FormData(passwordForm);
    const currentPassword = formData.get("currentPassword")?.trim() || "";
    const newPassword = formData.get("newPassword")?.trim() || "";
    const confirmPassword = formData.get("confirmPassword")?.trim() || "";

    await changeUserPassword(currentPassword, newPassword, confirmPassword);

    // Clear password fields
    setInputValue("currentPassword", "");
    setInputValue("newPassword", "");
    setInputValue("confirmPassword", "");

    // Show success modal and notification
    showSuccessModal("Password Updated", "Your password has been changed successfully!");
    showSuccessMessage("Password updated successfully!");
  } catch (error) {
    showErrorMessage(error.message);
  } finally {
    changePasswordBtn.textContent = "Change Password";
    changePasswordBtn.disabled = false;
  }
}

// Load admin data when authenticated and listen for changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    isUserLoaded = true;
    addNotification("User logged in");
    if (analytics) {
      logEvent(analytics, "user_login", { userId: user.uid });
    }
    try {
      const adminRef = doc(db, "admin", user.uid);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        const data = adminSnap.data();

        setInputValue("username", data.username || "");
        setInputValue("email", data.email || user.email || "");
        setInputValue("phone", data.phone || "");
        setInputValue("location", data.location || "");

        if (data.profilePicture && avatarImage) {
          avatarImage.src = data.profilePicture;
        }

        const userNameElement = document.getElementById("userName");
        if (userNameElement && data.username) {
          userNameElement.textContent = data.username;
        }

        console.log("Admin data loaded successfully");
      } else {
        console.log("No admin document found, creating with default data");
        setInputValue("email", user.email || "");

        const initialData = {
          email: user.email || "",
          role: "admin",
          uid: user.uid,
          createdAt: new Date().toISOString(),
        };

        await setDoc(doc(db, "admin", user.uid), initialData);
        showSuccessMessage("Profile initialized successfully!");
        addNotification("Profile initialized");
      }

      onSnapshot(doc(db, "admin", user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const existingData = {
            username: document.getElementById("username")?.value || "",
            email: document.getElementById("email")?.value || "",
            phone: document.getElementById("phone")?.value || "",
            location: document.getElementById("location")?.value || "",
            profilePicture: avatarImage?.src || "",
          };

          if (data.username !== existingData.username && data.username) {
            addNotification(`Username updated to ${data.username}`);
          }
          if (data.email !== existingData.email && data.email) {
            addNotification(`Email updated to ${data.email}`);
          }
          if (data.phone !== existingData.phone && data.phone) {
            addNotification(`Phone updated to ${data.phone}`);
          }
          if (data.location !== existingData.location && data.location) {
            addNotification(`Location updated to ${data.location}`);
          }
          if (data.profilePicture !== existingData.profilePicture && data.profilePicture) {
            addNotification("Profile picture updated");
          }

          setInputValue("username", data.username || "");
          setInputValue("email", data.email || user.email || "");
          setInputValue("phone", data.phone || "");
          setInputValue("location", data.location || "");
          if (data.profilePicture && avatarImage) {
            avatarImage.src = data.profilePicture;
          }
        }
      });
    } catch (error) {
      console.error("Error loading admin data:", error);
      showErrorMessage("Failed to load profile data.");
    }
  } else {
    console.log("User not authenticated");
    window.location.href = "login.html";
    showErrorMessage("Please log in to access your profile.");
  }
});

// Helper function to safely set input values
function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

// Show success message
function showSuccessMessage(message) {
  let successMsg = document.querySelector(".success-message");
  if (!successMsg) {
    successMsg = document.createElement("div");
    successMsg.className = "success-message alert alert-success";
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      padding: 12px 20px;
      border-radius: 4px;
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(successMsg);
  }

  successMsg.textContent = message;
  successMsg.style.opacity = "1";

  setTimeout(() => {
    successMsg.style.opacity = "0";
    setTimeout(() => {
      if (successMsg.parentNode) {
        successMsg.parentNode.removeChild(successMsg);
      }
    }, 300);
  }, 3000);
}

// Show error message
function showErrorMessage(message) {
  let errorMsg = document.querySelector(".error-message");
  if (!errorMsg) {
    errorMsg = document.createElement("div");
    errorMsg.className = "error-message alert alert-danger";
    errorMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      padding: 12px 20px;
      border-radius: 4px;
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(errorMsg);
  }

  errorMsg.textContent = message;
  errorMsg.style.opacity = "1";

  setTimeout(() => {
    errorMsg.style.opacity = "0";
    setTimeout(() => {
      if (errorMsg.parentNode) {
        errorMsg.parentNode.removeChild(errorMsg);
      }
    }, 300);
  }, 3000);
}