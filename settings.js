import { storage, db, auth, setDoc, doc, getDoc } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { updatePassword, onAuthStateChanged, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

let currentMethod = "";

window.togglePassword = function(id) {
    const input = document.getElementById(id);
    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('bx-hide');
        icon.classList.add('bx-show');
    } else {
        input.type = 'password';
        icon.classList.remove('bx-show');
        icon.classList.add('bx-hide');
    }
};

// Function to count followers
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

// Function to update follower count in the DOM
function updateFollowerCount(count) {
    const followerCountElement = document.getElementById("followerCount");
    if (followerCountElement) {
        followerCountElement.textContent = `Followers: ${count}`;
    } else {
        console.warn("Follower count element not found in DOM");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Document fully loaded.");

    const changePasswordBtn = document.getElementById("changePasswordBtn");
    const saveQRBtn = document.getElementById("saveQRBtn");

    const notificationCheckboxes = document.querySelectorAll(".notification-settings input[type='checkbox']");
    const themeSelect = document.getElementById("theme");
    const fontSizeSelect = document.getElementById("fontSize");
    const languageSelect = document.getElementById("language");

    // Open payment form
    window.togglePaymentForm = function (method) {
        currentMethod = method;
        const form = document.getElementById("paymentForm");
        const numberInput = document.getElementById("paymentNumber");
        const qrPreview = document.getElementById("qrPreview");

        form.style.display = "block";

        const user = auth.currentUser;
        if (!user) return;

        getDoc(doc(db, "admin", user.uid)).then((docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                if (method === "gcash") {
                    numberInput.value = data.gcashNumber || "";
                    qrPreview.src = data.gcashQR || "";
                } else if (method === "maya") {
                    numberInput.value = data.mayaNumber || "";
                    qrPreview.src = data.mayaQR || "";
                }

                qrPreview.style.display = qrPreview.src ? "block" : "none";
            }
        });
    };

    // Preview selected QR
    function previewQR() {
        const file = document.getElementById("qrUpload").files[0];
        const reader = new FileReader();

        reader.onload = function (e) {
            const preview = document.getElementById("qrPreview");
            preview.src = e.target.result;
            preview.style.display = "block";
        };

        if (file) reader.readAsDataURL(file);
    }

    document.getElementById("qrUpload").addEventListener("change", previewQR);

    // Change password handler
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener("click", async () => {
            const user = auth.currentUser;
            if (!user) return alert("❌ You must be logged in to change your password.");

            const currentPassword = document.getElementById("currentPassword").value.trim();
            const newPassword = document.getElementById("newPassword").value.trim();
            const confirmPassword = document.getElementById("confirmPassword").value.trim();

            if (!currentPassword || !newPassword || !confirmPassword)
                return alert("⚠️ All fields are required.");

            if (newPassword !== confirmPassword)
                return alert("❌ New password and confirm password do not match.");

            try {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                alert("✅ Password updated successfully!");
                document.getElementById("currentPassword").value = "";
                document.getElementById("newPassword").value = "";
                document.getElementById("confirmPassword").value = "";
            } catch (error) {
                console.error("❌ Error changing password:", error);
                alert("❌ Failed to change password. " + error.message);
            }
        });
    }

    // Save payment details
    if (saveQRBtn) {
        saveQRBtn.addEventListener("click", async () => {
            if (!currentMethod) return alert("⚠️ Please select a payment method first.");

            const user = auth.currentUser;
            if (!user) return alert("❌ You must be logged in to save payment details.");

            const number = document.getElementById("paymentNumber").value.trim();
            const file = document.getElementById("qrUpload").files[0];

            if (!number) return alert("⚠️ Enter a payment number.");

            let qrUrl = "";

            try {
                saveQRBtn.textContent = "Saving...";
                saveQRBtn.disabled = true;

                if (file) {
                    const refPath = `qr_codes/${user.uid}/${currentMethod}_${Date.now()}_${file.name}`;
                    const storageRef = ref(storage, refPath);
                    await uploadBytes(storageRef, file);
                    qrUrl = await getDownloadURL(storageRef);
                }

                const updateData = {
                    [`${currentMethod}Number`]: number,
                };
                if (qrUrl) updateData[`${currentMethod}QR`] = qrUrl;

                await setDoc(doc(db, "admin", user.uid), updateData, { merge: true });

                alert("✅ Payment details saved!");
                document.getElementById("paymentForm").style.display = "none";
                document.getElementById("paymentNumber").value = "";
                document.getElementById("qrPreview").src = "";
                document.getElementById("qrPreview").style.display = "none";
                document.getElementById("qrUpload").value = "";

                loadPaymentDetails();
            } catch (error) {
                console.error("❌ Error saving payment:", error);
                alert("❌ Failed to save payment details.");
            } finally {
                saveQRBtn.textContent = "Save";
                saveQRBtn.disabled = false;
            }
        });
    }

    async function loadPaymentDetails() {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const userDoc = await getDoc(doc(db, "admin", user.uid));
            if (userDoc.exists()) {
                console.log("✅ Payment details loaded.");
            } else {
                console.log("ℹ️ No payment details found.");
            }
        } catch (error) {
            console.error("❌ Error loading payment details:", error);
        }
    }

    async function saveSettings() {
        const user = auth.currentUser;
        if (!user) return;

        const settings = {
            notifications: {
                orderUpdates: notificationCheckboxes[0]?.checked ?? true,
                paymentConfirmations: notificationCheckboxes[1]?.checked ?? true,
                productUpdates: notificationCheckboxes[2]?.checked ?? false,
                securityAlerts: notificationCheckboxes[3]?.checked ?? true,
                accountActivity: notificationCheckboxes[4]?.checked ?? true,
            },
        };

        try {
            await setDoc(doc(db, "admin", user.uid), { settings }, { merge: true });
            console.log("✅ Settings saved.");
        } catch (error) {
            console.error("❌ Failed to save settings:", error);
        }
    }

    async function loadSettings() {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const docSnap = await getDoc(doc(db, "admin", user.uid));
            if (docSnap.exists()) {
                const data = docSnap.data()?.settings || {};
                const n = data.notifications || {};

                console.log("✅ Settings loaded.");
            }
        } catch (error) {
            console.error("❌ Failed to load settings:", error);
        }
    }

    // Auto-save on changes
    notificationCheckboxes.forEach(cb => cb.addEventListener("change", saveSettings));
    themeSelect?.addEventListener("change", saveSettings);
    fontSizeSelect?.addEventListener("change", saveSettings);
    languageSelect?.addEventListener("change", saveSettings);

    // Firebase auth listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("✅ User logged in:", user.uid);
            loadPaymentDetails();
            loadSettings();
            countFollowers(); // Call countFollowers when user is logged in
        } else {
            console.log("⚠️ No user logged in.");
            updateFollowerCount(0); // Reset follower count when no user is logged in
        }
    });
});