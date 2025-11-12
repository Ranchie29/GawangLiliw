import {
    auth,
    db,
    storage,
    doc,
    updateDoc,
    getDoc,
    setDoc,
    collection,
    getDocs,
    addDoc,
    ref,
    uploadBytes,
    getDownloadURL,
    onAuthStateChanged,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut,
  } from './firebase-config.js';

console.log("Firebase profile, address, and settings management script loaded.");

// Elements
const profilePicture = document.getElementById('profile-picture');
const profileUploadInput = document.createElement('input');
profileUploadInput.type = 'file';
profileUploadInput.accept = 'image/*';
profileUploadInput.style.display = 'none';
document.body.appendChild(profileUploadInput);

const shopNameInput = document.getElementById('shop-name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const streetInput = document.getElementById('street');
const provinceInput = document.getElementById('province');
const municipalityInput = document.getElementById('municipality');
const barangaySelect = document.getElementById('barangay');
const toast = document.getElementById('toast');
const dtiPermitPreview = document.getElementById('dti-permit-preview');
const dtiUploadInput = document.getElementById('dti-upload');
const dtiUploadTrigger = document.getElementById('dti-upload-trigger');
const mayorsPermitPreview = document.getElementById('mayors-permit-preview');
const mayorsUploadInput = document.getElementById('mayors-upload');
const mayorsUploadTrigger = document.getElementById('mayors-upload-trigger');
const bannerImage = document.getElementById('banner-image');
const bannerUploadInput = document.getElementById('banner-upload');
const bannerUploadTrigger = document.getElementById('banner-upload-trigger');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const saveQRBtn = document.getElementById('saveQRBtn');
const logoutButton = document.getElementById('logoutButton');
const imageModal = document.getElementById('image-modal');
const fullScreenImage = document.getElementById('full-screen-image');
const closeImageModalBtn = document.getElementById('close-image-modal');
let currentMethod = "";

// Function to toggle upload buttons and inputs
function toggleUploads(isEditing) {
    if (profilePicture) {
        profilePicture.parentElement.style.pointerEvents = isEditing ? 'auto' : 'none';
        profilePicture.parentElement.style.opacity = isEditing ? '1' : '0.6';
        profileUploadInput.disabled = !isEditing;
    }
    if (bannerUploadTrigger) {
        bannerUploadTrigger.disabled = !isEditing;
        bannerUploadTrigger.style.opacity = isEditing ? '1' : '0.6';
        bannerUploadInput.disabled = !isEditing;
    }
    if (dtiUploadTrigger) {
        dtiUploadTrigger.disabled = !isEditing;
        dtiUploadTrigger.style.opacity = isEditing ? '1' : '0.6';
        dtiUploadInput.disabled = !isEditing;
    }
    if (mayorsUploadTrigger) {
        mayorsUploadTrigger.disabled = !isEditing;
        mayorsUploadTrigger.style.opacity = isEditing ? '1' : '0.6';
        mayorsUploadInput.disabled = !isEditing;
    }
    if (dtiPermitPreview) {
        dtiPermitPreview.style.pointerEvents = isEditing ? 'auto' : 'none';
        dtiPermitPreview.style.opacity = isEditing ? '1' : '0.6';
    }
    if (mayorsPermitPreview) {
        mayorsPermitPreview.style.pointerEvents = isEditing ? 'auto' : 'none';
        mayorsPermitPreview.style.opacity = isEditing ? '1' : '0.6';
    }
}

// Initialize uploads and previews as disabled
toggleUploads(false);

// Function to open full-screen image modal
function openImageModal(src) {
    if (!imageModal || !fullScreenImage) {
        console.error("Image modal elements not found.");
        return;
    }
    if (shopNameInput.disabled) {
        showToast('Please click Edit to view images in full screen.', true);
        return;
    }
    if (src.toLowerCase().endsWith('.pdf')) {
        showToast('PDF files cannot be viewed in full screen. Please download to view.', true);
        return;
    }
    fullScreenImage.src = src;
    imageModal.classList.add('show');
}

// Function to close full-screen image modal
function closeImageModal() {
    if (imageModal) {
        imageModal.classList.remove('show');
        fullScreenImage.src = '';
    }
}

// Close modal when clicking outside the image
if (imageModal) {
    imageModal.addEventListener('click', (e) => {
        if (e.target === imageModal) {
            closeImageModal();
        }
    });
}

// Close full-screen image modal
if (closeImageModalBtn) {
    closeImageModalBtn.addEventListener('click', closeImageModal);
}

// Password toggle function
window.togglePassword = function(id) {
    const input = document.getElementById(id);
    const icon = input.nextElementSibling;
    if (!input || !icon) return;
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

// Show toast notification
function showToast(message, isError = false) {
    if (!toast) return console.error("Toast element not found.");
    toast.querySelector('.toast-message').textContent = message;
    toast.classList.add('show');
    if (isError) toast.classList.add('error');
    setTimeout(() => {
        toast.classList.remove('show', 'error');
    }, 3000);
}

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
        showToast('Failed to load follower count.', true);
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

// Hamburger menu toggle
const hamburger = document.querySelector('.hamburger');
const sidebar = document.querySelector('.sidebar');
const navLinks = document.querySelectorAll('.sidebar nav a');

if (hamburger && sidebar) {
    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        hamburger.innerHTML = sidebar.classList.contains('show')
            ? '<i class="fas fa-times"></i>'
            : '<i class="fas fa-bars"></i>';
    });
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 992 && 
        sidebar && hamburger &&
        !sidebar.contains(e.target) && 
        !hamburger.contains(e.target) && 
        sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        hamburger.innerHTML = '<i class="fas fa-bars"></i>';
    }
});

// Close sidebar when clicking a nav link on mobile
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 992 && sidebar) {
            sidebar.classList.remove('show');
            if (hamburger) hamburger.innerHTML = '<i class="fas fa-bars"></i>';
        }
    });
});

// Profile picture change
if (profilePicture) {
    profilePicture.parentElement.addEventListener('click', () => {
        if (shopNameInput.disabled) {
            showToast('Please click Edit to enable profile picture upload.', true);
            return;
        }
        const confirmChange = confirm("Would you like to change your profile picture?");
        if (confirmChange) {
            console.log("Opening file selector...");
            profileUploadInput.click();
        } else {
            console.log("User cancelled profile picture change.");
        }
    });
}

profileUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const confirmUpload = confirm("Are you sure you want to change your profile picture?");
    if (!confirmUpload) {
        console.log("User cancelled profile picture change.");
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const storageRef = ref(storage, `profile_pictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(storageRef);
                await updateDoc(doc(db, 'admin', user.uid), { profilePicture: downloadURL });
                profilePicture.innerHTML = `<img src="${downloadURL}" alt="Profile Picture">`;
                console.log("Profile picture updated successfully.");
                showToast('Profile picture changed successfully.');
            } catch (error) {
                console.error('Upload error:', error);
                showToast('Profile picture upload failed.', true);
            }
        } else {
            showToast('You must be logged in to upload a profile picture.', true);
        }
    });
});

// Banner image upload
if (bannerUploadTrigger) {
    bannerUploadTrigger.addEventListener('click', () => {
        if (shopNameInput.disabled) {
            showToast('Please click Edit to enable banner image upload.', true);
            return;
        }
        const confirmChange = confirm("Would you like to change your banner image?");
        if (confirmChange) {
            bannerUploadInput.click();
        }
    });
}

if (bannerUploadInput) {
    bannerUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const confirmUpload = confirm("Are you sure you want to upload this banner image?");
        if (!confirmUpload) return;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const storageRef = ref(storage, `banner_images/${user.uid}`);
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    await updateDoc(doc(db, 'admin', user.uid), { bannerImage: downloadURL });
                    bannerImage.innerHTML = `<img src="${downloadURL}" alt="Banner Image">`;
                    console.log("Banner uploaded, URL:", downloadURL);
                    showToast('Banner image uploaded successfully.');
                } catch (error) {
                    console.error('Banner upload error:', error);
                    showToast('Banner image upload failed.', true);
                }
            } else {
                showToast('You must be logged in to upload a banner image.', true);
            }
        });
    });
}

// DTI Permit upload and full-screen view
if (dtiUploadTrigger) {
    dtiUploadTrigger.addEventListener('click', () => {
        if (shopNameInput.disabled) {
            showToast('Please click Edit to enable DTI Permit upload.', true);
            return;
        }
        const confirmChange = confirm("Would you like to change your DTI Permit?");
        if (confirmChange) {
            dtiUploadInput.click();
        }
    });
}

if (dtiUploadInput) {
    dtiUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const confirmUpload = confirm("Are you sure you want to upload this DTI Permit?");
        if (!confirmUpload) return;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const storageRef = ref(storage, `documents/${user.uid}/dti_permit_${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    await updateDoc(doc(db, 'admin', user.uid), { 
                        'documents.dtiCertificate': downloadURL 
                    });
                    dtiPermitPreview.innerHTML = file.name.toLowerCase().endsWith('.pdf') 
                        ? `<i class="fas fa-file-pdf"></i> DTI Permit (PDF)`
                        : `<img src="${downloadURL}" alt="DTI Permit">`;
                    console.log("DTI Permit uploaded, URL:", downloadURL);
                    showToast('DTI Permit uploaded successfully.');
                } catch (error) {
                    console.error('DTI Permit upload error:', error);
                    showToast('DTI Permit upload failed.', true);
                }
            } else {
                showToast('You must be logged in to upload a DTI Permit.', true);
            }
        });
    });
}

if (dtiPermitPreview) {
    dtiPermitPreview.addEventListener('click', () => {
        const img = dtiPermitPreview.querySelector('img');
        if (img && img.src) {
            openImageModal(img.src);
        }
    });
}

// Mayor's Permit upload and full-screen view
if (mayorsUploadTrigger) {
    mayorsUploadTrigger.addEventListener('click', () => {
        if (shopNameInput.disabled) {
            showToast('Please click Edit to enable Mayor\'s Permit upload.', true);
            return;
        }
        const confirmChange = confirm("Would you like to change your Mayor's Permit?");
        if (confirmChange) {
            mayorsUploadInput.click();
        }
    });
}

if (mayorsUploadInput) {
    mayorsUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const confirmUpload = confirm("Are you sure you want to upload this Mayor's Permit?");
        if (!confirmUpload) return;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const storageRef = ref(storage, `documents/${user.uid}/mayors_permit_${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    await updateDoc(doc(db, 'admin', user.uid), { 
                        'documents.mayorsPermit': downloadURL 
                    });
                    mayorsPermitPreview.innerHTML = file.name.toLowerCase().endsWith('.pdf') 
                        ? `<i class="fas fa-file-pdf"></i> Mayor's Permit (PDF)`
                        : `<img src="${downloadURL}" alt="Mayor's Permit">`;
                    console.log("Mayor's Permit uploaded, URL:", downloadURL);
                    showToast("Mayor's Permit uploaded successfully.");
                } catch (error) {
                    console.error("Mayor's Permit upload error:", error);
                    showToast("Mayor's Permit upload failed.", true);
                }
            } else {
                showToast('You must be logged in to upload a Mayor\'s Permit.', true);
            }
        });
    });
}

if (mayorsPermitPreview) {
    mayorsPermitPreview.addEventListener('click', () => {
        const img = mayorsPermitPreview.querySelector('img');
        if (img && img.src) {
            openImageModal(img.src);
        }
    });
}

// Load user data
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Fetching user data for:", user.uid);
        try {
            const userRef = doc(db, 'admin', user.uid);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("User data loaded:", data);
                if (data.profilePicture) {
                    profilePicture.innerHTML = `<img src="${data.profilePicture}" alt="Profile Picture">`;
                }
                if (data.bannerImage) {
                    bannerImage.innerHTML = `<img src="${data.bannerImage}">`;
                } else {
                    bannerImage.innerHTML = `<img src="static/photos/default-banner.png">`;
                }
                if (data.documents?.dtiCertificate) {
                    dtiPermitPreview.innerHTML = data.documents.dtiCertificate.toLowerCase().endsWith('.pdf') 
                        ? `<i class="fas fa-file-pdf"></i> DTI Permit (PDF)`
                        : `<img src="${data.documents.dtiCertificate}" alt="DTI Permit">`;
                }
                if (data.documents?.mayorsPermit) {
                    mayorsPermitPreview.innerHTML = data.documents.mayorsPermit.toLowerCase().endsWith('.pdf') 
                        ? `<i class="fas fa-file-pdf"></i> Mayor's Permit (PDF)`
                        : `<img src="${data.documents.mayorsPermit}" alt="Mayor's Permit">`;
                }
                shopNameInput.value = data.shopName || '-';
                emailInput.value = data.email || user.email || '-';
                phoneInput.value = data.phone || '-';
                streetInput.value = data.street || '';
                provinceInput.value = 'Laguna';
                municipalityInput.value = 'Liliw';
                barangaySelect.value = data.barangay || '';
                document.getElementById('userName').textContent = data.shopName || 'User';
                await countFollowers();
                await loadPaymentDetails();
            } else {
                console.warn("User document not found.");
                updateFollowerCount(0);
                provinceInput.value = 'Laguna';
                municipalityInput.value = 'Liliw';
            }
        } catch (err) {
            console.error('Error loading user data:', err);
            showToast('Failed to load user data.', true);
            updateFollowerCount(0);
        }
    } else {
        console.log("⚠️ No user logged in.");
        updateFollowerCount(0);
        provinceInput.value = 'Laguna';
        municipalityInput.value = 'Liliw';
    }
});

// Edit personal info
const editBtn = document.getElementById('edit-personal-info');
if (editBtn) {
    editBtn.addEventListener('click', () => {
        const isEditing = shopNameInput.disabled;
        if (isEditing) {
            const confirmEdit = confirm("Would you like to change your personal info?");
            if (!confirmEdit) {
                console.log("User cancelled editing personal info.");
                return;
            }
            shopNameInput.disabled = false;
            phoneInput.disabled = false;
            streetInput.disabled = false;
            barangaySelect.disabled = false;
            toggleUploads(true);
            editBtn.querySelector('span').textContent = 'Save';
        } else {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const shopName = shopNameInput.value.trim();
                    const phone = phoneInput.value.trim();
                    const street = streetInput.value.trim();
                    const barangay = barangaySelect.value;
                    if (!shopName || !phone || !barangay) {
                        showToast('Please fill out all required fields (Shop Name, Phone, Barangay).', true);
                        return;
                    }
                    const confirmSave = confirm("Are you sure you want to save these details?");
                    if (!confirmSave) {
                        console.log("User cancelled info update.");
                        return;
                    }
                    try {
                        await updateDoc(doc(db, 'admin', user.uid), {
                            shopName,
                            phone,
                            street,
                            province: 'Laguna',
                            municipality: 'Liliw',
                            barangay
                        });
                        shopNameInput.disabled = true;
                        phoneInput.disabled = true;
                        streetInput.disabled = true;
                        barangaySelect.disabled = true;
                        toggleUploads(false);
                        editBtn.querySelector('span').textContent = 'Edit';
                        document.getElementById('userName').textContent = shopName;
                        console.log("Personal info updated:", { shopName, phone, street, province: 'Laguna', municipality: 'Liliw', barangay });
                        showToast('Information updated successfully!');
                    } catch (err) {
                        console.error('Update failed:', err);
                        showToast('Failed to update info.', true);
                    }
                } else {
                    showToast('You must be logged in to update personal info.', true);
                }
            });
        }
    });
}

// Change password handler
if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) {
            return showToast('You must be logged in to change your password.', true);
        }

        const currentPassword = document.getElementById("currentPassword").value.trim();
        const newPassword = document.getElementById("newPassword").value.trim();
        const confirmPassword = document.getElementById("confirmPassword").value.trim();

        if (!currentPassword || !newPassword || !confirmPassword) {
            return showToast("All fields are required.", true);
        }

        if (newPassword !== confirmPassword) {
            return showToast("New password and confirm password do not match.", true);
        }

        if (newPassword.length < 6) {
            return showToast("New password must be at least 6 characters long.", true);
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            showToast('Password updated successfully!');
            document.getElementById("currentPassword").value = "";
            document.getElementById("newPassword").value = "";
            document.getElementById("confirmPassword").value = "";
        } catch (error) {
            console.error("Error changing password:", error);
            showToast('Failed to change password: ' + error.message, true);
        }
    });
}

// Open payment form
window.togglePaymentForm = function (method) {
    currentMethod = method;
    const form = document.getElementById("paymentForm");
    const numberInput = document.getElementById("paymentNumber");
    const qrPreview = document.getElementById("qrPreview");

    if (!form || !numberInput || !qrPreview) {
        console.error("Payment form elements not found.");
        return;
    }

    form.style.display = "block";

    const user = auth.currentUser;
    if (!user) {
        showToast("You must be logged in to edit payment details.", true);
        return;
    }

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
    }).catch((error) => {
        console.error("Error loading payment details:", error);
        showToast("Failed to load payment details.", true);
    });
};

// Preview selected QR
function previewQR() {
    const file = document.getElementById("qrUpload").files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById("qrPreview");
        preview.src = e.target.result;
        preview.style.display = "block";
    };
    reader.readAsDataURL(file);
}

if (document.getElementById("qrUpload")) {
    document.getElementById("qrUpload").addEventListener("change", previewQR);
}

// Save payment details
if (saveQRBtn) {
    saveQRBtn.addEventListener("click", async () => {
        if (!currentMethod) return showToast("Please select a payment method first.", true);

        const user = auth.currentUser;
        if (!user) return showToast("You must be logged in to save payment details.", true);

        const number = document.getElementById("paymentNumber").value.trim();
        const file = document.getElementById("qrUpload").files[0];

        if (!number) return showToast("Enter a payment number.", true);

        try {
            saveQRBtn.textContent = "Saving...";
            saveQRBtn.disabled = true;

            let qrUrl = "";
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

            showToast("Payment details saved!");
            document.getElementById("paymentForm").style.display = "none";
            document.getElementById("paymentNumber").value = "";
            document.getElementById("qrPreview").src = "";
            document.getElementById("qrPreview").style.display = "none";
            document.getElementById("qrUpload").value = "";

            await loadPaymentDetails();
        } catch (error) {
            console.error("Error saving payment:", error);
            showToast("Failed to save payment details.", true);
        } finally {
            saveQRBtn.textContent = "Save";
            saveQRBtn.disabled = false;
        }
    });
}

// Load payment details
async function loadPaymentDetails() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "admin", user.uid));
        if (userDoc.exists()) {
            console.log("Payment details loaded.");
        } else {
            console.log("No payment details found.");
        }
    } catch (error) {
        console.error("Error loading payment details:", error);
        showToast("Failed to load payment details.", true);
    }
}

// Modal actions
const addAddressBtn = document.getElementById('add-address-btn');
const addressModal = document.getElementById('address-modal');
const closeModalBtn = addressModal?.querySelector('.close-modal');
const saveAddressBtn = addressModal?.querySelector('.save-btn');
const cancelAddressBtn = addressModal?.querySelector('.cancel-btn');

if (addAddressBtn) {
    addAddressBtn.addEventListener('click', () => {
        console.log("Add address modal opened.");
        addressModal.classList.add('show');
        document.getElementById('modal-street').value = '';
        document.getElementById('modal-barangay').value = '';
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        addressModal.classList.remove('show');
    });
}

if (cancelAddressBtn) {
    cancelAddressBtn.addEventListener('click', () => {
        addressModal.classList.remove('show');
    });
}

// Save new address
if (saveAddressBtn) {
    saveAddressBtn.addEventListener('click', async () => {
        const street = document.getElementById('modal-street').value.trim();
        const barangay = document.getElementById('modal-barangay').value;

        if (!barangay) {
            showToast('Please select a barangay.', true);
            return;
        }

        const newAddress = {
            street,
            province: 'Laguna',
            municipality: 'Liliw',
            barangay,
            createdAt: new Date()
        };

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const addressRef = collection(db, 'users', user.uid, 'addresses');
                    await addDoc(addressRef, newAddress);
                    console.log("New address saved:", newAddress);
                    showToast('Address added successfully!');
                    addressModal.classList.remove('show');
                    await loadAddresses();
                } catch (err) {
                    console.error('Failed to add address:', err);
                    showToast('Failed to add address.', true);
                }
            } else {
                showToast('You must be logged in to add an address.', true);
            }
        });
    });
}

// Load all addresses (placeholder function, implement if needed)
async function loadAddresses() {
    console.log("Load addresses called (implement if needed).");
}

// Logout handler
if (logoutButton) {
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
       
       
            window.location.href = 'index.html';
       
    });
}
