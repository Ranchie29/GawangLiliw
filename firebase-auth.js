// Import Firebase authentication, Firestore, and Storage
import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from "./firebase-config.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { storage } from './firebase-config.js';

document.addEventListener("DOMContentLoaded", () => {
    const logoutButton = document.getElementById("logoutButton");
    const userNameElement = document.getElementById("userName");
    const sidebarProfilePicture = document.getElementById("sidebar-profile-picture");

    // Function to fetch and display username and profile picture
    async function loadUserData(user) {
        if (!user) return;

        const userDocRef = doc(db, "admin", user.uid);

        try {
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();

                // Update username
                const username = userData.username || "Unknown User";
                if (userNameElement) {
                    userNameElement.textContent = username;
                }

                // Update profile picture if it exists
                if (sidebarProfilePicture) {
                    if (userData.profilePicture) {
                        sidebarProfilePicture.src = userData.profilePicture;
                    } else {
                        // Set a default profile picture if none exists
                        sidebarProfilePicture.src = "default-profile.png"; // <-- Set your default image path
                    }
                }
            } else {
                console.warn("No user document found.");
                userNameElement.textContent = "Unknown User";
                if (sidebarProfilePicture) {
                    sidebarProfilePicture.src = "default-profile.png";
                }
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            userNameElement.textContent = "Unknown User";
            if (sidebarProfilePicture) {
                sidebarProfilePicture.src = "default-profile.png";
            }
        }
    }

    // Monitor authentication state
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadUserData(user);
        } else {
            window.location.href = "index.html"; // Redirect to login page
        }
    });

    // Logout button functionality
    
});
