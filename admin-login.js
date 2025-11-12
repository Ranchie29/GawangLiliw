
import {
    auth, db, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
    createUserWithEmailAndPassword, sendEmailVerification, doc, getDoc, setDoc,
    collection, query, where, getDocs, storage, ref, uploadBytes, getDownloadURL,
    onAuthStateChanged
} from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", function () {
    console.log("📌 Script Loaded: admin-login.js");

    // Elements
    const loginForm = document.getElementById("login-form");
    const loginButton = document.querySelector(".upgrade-btn");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const rememberMeCheckbox = document.getElementById("remember-me");
    const togglePassword = document.querySelector(".toggle-password");
    const loader = document.getElementById("loader");

    const forgotPasswordLink = document.getElementById("forgot-password-link");
    const forgotPasswordModal = document.getElementById("forgot-password-modal");
    const forgotPasswordForm = document.getElementById("forgot-password-form");
    const resetEmailInput = document.getElementById("reset-email");
    const closeModalBtn = document.getElementById("close-modal");

    const signupModal = document.getElementById("signup-modal");
    const signupForm = document.getElementById("signup-form");
    const signupEmailInput = document.getElementById("signup-email");
    const signupPasswordInput = document.getElementById("signup-password");
    const openSignupLink = document.getElementById("open-signup-link");
    const closeSignupModalBtn = document.getElementById("close-signup-modal");
    const provinceSelect = document.getElementById("signup-province");
    const citySelect = document.getElementById("signup-city");
    const barangaySelect = document.getElementById("signup-barangay");

    // Check if required elements exist before proceeding
    if (!loginForm || !emailInput || !passwordInput) {
        console.error("❌ Required login elements not found");
        return;
    }

    // Helper function to show error messages
    function showError(input, message) {
        const group = input.parentElement;
        let errorDiv = group.querySelector(".error-message");
        if (!errorDiv) {
            errorDiv = document.createElement("div");
            errorDiv.className = "error-message";
            group.appendChild(errorDiv);
        }
        input.classList.add("error");
        input.classList.remove("valid");
        input.setAttribute("aria-invalid", "true");
        errorDiv.textContent = message;
        errorDiv.setAttribute("role", "alert");
        // Remove checkmark if present
        const checkmark = group.querySelector(".valid-icon");
        if (checkmark) checkmark.style.display = "none";
    }

    // Helper function to clear error messages and show valid state
    function clearError(input, isRequired = false) {
        const group = input.parentElement;
        const errorDiv = group.querySelector(".error-message");
        if (errorDiv) {
            errorDiv.textContent = "";
        }
        input.classList.remove("error");
        
        // Only mark as valid and show checkmark if the input is non-empty (for required fields)
        // or if the input is optional and passes validation
        if (!isRequired || (isRequired && input.value.trim())) {
            input.classList.add("valid");
            input.setAttribute("aria-invalid", "false");
            
            // Show checkmark for valid input
            let checkmark = group.querySelector(".valid-icon");
            if (!checkmark) {
                checkmark = document.createElement("span");
                checkmark.className = "valid-icon";
                checkmark.innerHTML = "";
                group.appendChild(checkmark);
            }
            checkmark.style.display = "inline-block";
        } else {
            // For required fields that are empty, remove valid class and hide checkmark
            input.classList.remove("valid");
            input.setAttribute("aria-invalid", "true");
            const checkmark = group.querySelector(".valid-icon");
            if (checkmark) checkmark.style.display = "none";
        }
    }

    // Helper function to show error summary
    function showErrorSummary(form, errors) {
        let summary = form.querySelector(".error-summary");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "error-summary";
            summary.setAttribute("role", "alert");
            form.insertBefore(summary, form.firstChild);
        }
        summary.innerHTML = `
            <p>Please fix the following errors:</p>
            <ul>${errors.map(error => `<li>${error}</li>`).join("")}</ul>
        `;
        summary.focus();
    }

    // Helper function to clear error summary
    function clearErrorSummary(form) {
        const summary = form.querySelector(".error-summary");
        if (summary) {
            summary.remove();
        }
    }

    // Helper function to validate email format
    function isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }

    // Helper function to validate password strength
    function isValidPassword(password) {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,20}$/;
        return passwordRegex.test(password);
    }

    // Helper function to check username uniqueness
    async function isUsernameUnique(username) {
        const q = query(collection(db, "admin"), where("username", "==", username));
        const snapshot = await getDocs(q);
        return snapshot.empty;
    }

    // Load remembered credentials for login form
    const savedEmail = localStorage.getItem("rememberedEmail");
    const savedPassword = localStorage.getItem("rememberedPassword");
    if (savedEmail && savedPassword) {
        emailInput.value = savedEmail;
        passwordInput.value = savedPassword;
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
    }

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
          passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
          const icon = togglePassword.querySelector('i');
          icon.className = passwordInput.type === 'text' ? 'fas fa-eye-slash' : 'fas fa-eye';
        });
      }

    // Real-time validation for login form
    if (emailInput) {
        emailInput.addEventListener("input", () => {
            const email = emailInput.value.trim();
            if (!email) {
                showError(emailInput, "Email is required.");
            } else if (!isValidEmail(email)) {
                showError(emailInput, "Please enter a valid email address.");
            } else {
                clearError(emailInput);
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener("input", () => {
            const password = passwordInput.value.trim();
            if (!password) {
                showError(passwordInput, "Password is required.");
            } else {
                clearError(passwordInput);
            }
        });
    }

    // Login Flow
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearErrorSummary(loginForm);
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const errors = [];

        if (!email) {
            showError(emailInput, "Email is required.");
            errors.push("Email is required.");
        } else if (!isValidEmail(email)) {
            showError(emailInput, "Please enter a valid email address.");
            errors.push("Please enter a valid email address.");
        }

        if (!password) {
            showError(passwordInput, "Password is required.");
            errors.push("Password is required.");
        }

        if (errors.length > 0) {
            showErrorSummary(loginForm, errors);
            return;
        }

        if (loader) loader.classList.remove("hidden");
        if (loginButton) loginButton.disabled = true;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                alert("📧 Please verify your email before logging in.");
                await signOut(auth);
                return;
            }

            if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                localStorage.setItem("rememberedEmail", email);
                localStorage.setItem("rememberedPassword", password);
            } else {
                localStorage.removeItem("rememberedEmail");
                localStorage.removeItem("rememberedPassword");
            }

            const userRef = doc(db, "admin", user.uid);
            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) throw new Error("no-user-data");

            const userData = userDoc.data();
            const userRole = userData.role || "unknown";

            if (userRole === "admin") {
                window.location.href = "Dashboard.html";
                return;
            }

            if (userData.approved !== true) {
                alert("⛔ Your account is awaiting admin approval.");
                await signOut(auth);
                return;
            }

            if (userRole === "staff") {
                window.location.href = "staff-dashboard.html";
                return;
            }

            alert("⚠️ Unable to identify user role. Contact support.");
            await signOut(auth);

        } catch (error) {
            console.error("❌ Login error:", error);
            let errorMessage = "Login failed. Please try again.";
            switch (error.code) {
                case "auth/invalid-login-credentials":
                    errorMessage = "Incorrect email or password.";
                    showError(emailInput, errorMessage);
                    showError(passwordInput, errorMessage);
                    errors.push(errorMessage);
                    break;
                case "auth/user-not-found":
                    errorMessage = "No account found with this email.";
                    showError(emailInput, errorMessage);
                    errors.push(errorMessage);
                    break;
                case "auth/wrong-password":
                    errorMessage = "Incorrect password.";
                    showError(passwordInput, errorMessage);
                    errors.push(errorMessage);
                    break;
                case "auth/invalid-email":
                    errorMessage = "Invalid email format.";
                    showError(emailInput, errorMessage);
                    errors.push(errorMessage);
                    break;
                case "auth/too-many-requests":
                    errorMessage = "Too many attempts. Try again later.";
                    errors.push(errorMessage);
                    break;
                default:
                    if (error.message === "no-user-data") {
                        errorMessage = "No user data found. Contact support.";
                        errors.push(errorMessage);
                    }
            }
            showErrorSummary(loginForm, errors);
        } finally {
            if (loader) loader.classList.add("hidden");
            if (loginButton) loginButton.disabled = false;
        }
    });

    // Forgot Password Flow
    if (forgotPasswordLink && forgotPasswordModal) {
        forgotPasswordLink.addEventListener("click", () => {
            forgotPasswordModal.classList.remove("hidden");
            clearErrorSummary(forgotPasswordForm);
        });
    }

    if (closeModalBtn && forgotPasswordModal && forgotPasswordForm) {
        closeModalBtn.addEventListener("click", () => {
            forgotPasswordModal.classList.add("hidden");
            forgotPasswordForm.reset();
            clearError(resetEmailInput);
            clearErrorSummary(forgotPasswordForm);
        });
    }

    // Real-time validation for forgot password form
    if (resetEmailInput) {
        resetEmailInput.addEventListener("input", () => {
            const email = resetEmailInput.value.trim();
            if (!email) {
                showError(resetEmailInput, "Email is required.");
            } else if (!isValidEmail(email)) {
                showError(resetEmailInput, "Please enter a valid email address.");
            } else {
                clearError(resetEmailInput);
            }
        });
    }

    if (forgotPasswordForm && resetEmailInput) {
        forgotPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearErrorSummary(forgotPasswordForm);
            const resetEmail = resetEmailInput.value.trim();
            const errors = [];

            if (!resetEmail) {
                showError(resetEmailInput, "Email is required.");
                errors.push("Email is required.");
            } else if (!isValidEmail(resetEmail)) {
                showError(resetEmailInput, "Please enter a valid email address.");
                errors.push("Please enter a valid email address.");
            }

            if (errors.length > 0) {
                showErrorSummary(forgotPasswordForm, errors);
                return;
            }

            if (loader) loader.classList.remove("hidden");
            try {
                await sendPasswordResetEmail(auth, resetEmail);
                alert("📧 Password reset email sent! Please check your inbox and spam folder.");
                forgotPasswordModal.classList.add("hidden");
                forgotPasswordForm.reset();
                clearError(resetEmailInput);
            } catch (error) {
                console.error("❌ Reset email error:", error.code, error.message);
                let resetErrorMessage = "Unable to send reset email.";
                switch (error.code) {
                    case "auth/user-not-found":
                        resetErrorMessage = "No account found with this email.";
                        showError(resetEmailInput, resetErrorMessage);
                        errors.push(resetErrorMessage);
                        break;
                    case "auth/invalid-email":
                        resetErrorMessage = "Invalid email format.";
                        showError(resetEmailInput, resetErrorMessage);
                        errors.push(resetErrorMessage);
                        break;
                    case "auth/too-many-requests":
                        resetErrorMessage = "Too many attempts. Please try again later.";
                        errors.push(resetErrorMessage);
                        break;
                    default:
                        resetErrorMessage = `Failed to send reset email: ${error.message}`;
                        errors.push(resetErrorMessage);
                }
                showErrorSummary(forgotPasswordForm, errors);
            } finally {
                if (loader) loader.classList.add("hidden");
            }
        });
    }

    // Province to City Mapping
    const provinceCityMap = {
        Laguna: ["Liliw"]
    };

    // Liliw Barangays List
    const liliwBarangays = [
        "Bagong Anyo (Poblacion)", "Bayate", "Bubukal", "Bongkol", "Cabuyao",
        "Calumpang", "Culoy", "Dagatan", "Daniw (Danliw)", "Dita",
        "Ibabang Palina", "Ibabang San Roque", "Ibabang Sungi", "Ibabang Taykin",
        "Ilayang Palina", "Ilayang San Roque", "Ilayang Sungi", "Ilayang Taykin",
        "Kanlurang Bukal", "Laguan", "Rizal (Poblacion)", "Luquin",
        "Malabo-Kalantukan", "Masikap (Poblacion)", "Maslun (Poblacion)",
        "Mojon", "Novaliches", "Oples", "Pag-Asa (Poblacion)", "Palayan",
        "San Isidro", "Silangang Bukal", "Tuy-Baanan"
    ];

    // Populate city dropdown when province changes
    if (provinceSelect) {
        provinceSelect.addEventListener("change", function () {
            const selectedProvince = this.value;
            if (citySelect) {
                citySelect.innerHTML = '<option value="" disabled>Select City</option>';
                if (provinceCityMap[selectedProvince]) {
                    provinceCityMap[selectedProvince].forEach(city => {
                        const option = document.createElement("option");
                        option.value = city;
                        option.textContent = city;
                        if (city === "Liliw") option.selected = true;
                        citySelect.appendChild(option);
                    });
                }
                citySelect.dispatchEvent(new Event("change"));
                if (!selectedProvince) {
                    showError(provinceSelect, "Province is required.");
                } else {
                    clearError(provinceSelect);
                }
            }
        });
        provinceSelect.value = "Laguna";
        provinceSelect.dispatchEvent(new Event("change"));
    }

    // Populate barangay dropdown when city changes
    if (citySelect) {
        citySelect.addEventListener("change", function () {
            const selectedCity = this.value;
            if (barangaySelect) {
                barangaySelect.innerHTML = '<option value="" disabled selected>Select Barangay</option>';
                if (selectedCity === "Liliw") {
                    liliwBarangays.forEach(barangay => {
                        const option = document.createElement("option");
                        option.value = barangay;
                        option.textContent = barangay;
                        barangaySelect.appendChild(option);
                    });
                }
                if (!selectedCity) {
                    showError(citySelect, "City is required.");
                } else {
                    clearError(citySelect);
                }
            }
        });
    }

    // Sign Up Flow
    if (openSignupLink && signupModal && signupForm) {
        openSignupLink.addEventListener("click", () => {
            signupModal.classList.remove("hidden");
            signupForm.reset();
            clearErrorSummary(signupForm);
            const inputs = signupForm.querySelectorAll("input, select");
            inputs.forEach(input => clearError(input));
            if (provinceSelect) {
                provinceSelect.value = "Laguna";
                provinceSelect.dispatchEvent(new Event("change"));
            }
            window.removeFile('dti-upload');
            window.removeFile('permit-upload');
        });
    }

    if (closeSignupModalBtn && signupModal && signupForm) {
        closeSignupModalBtn.addEventListener("click", () => {
            signupModal.classList.add("hidden");
            signupForm.reset();
            clearErrorSummary(signupForm);
            const inputs = signupForm.querySelectorAll("input, select");
            inputs.forEach(input => clearError(input));
            if (provinceSelect) {
                provinceSelect.value = "Laguna";
                provinceSelect.dispatchEvent(new Event("change"));
            }
            window.removeFile('dti-upload');
            window.removeFile('permit-upload');
        });
    }

    // Helper function to limit character length
    function limitCharacterLength(input, maxLength) {
        if (input.value.length > maxLength) {
            input.value = input.value.substring(0, maxLength);
            showError(input, `Maximum ${maxLength} characters allowed.`);
        }
    }

    // Real-time validation for signup fields
    const shopNameInput = document.getElementById("signup-shopname");
    if (shopNameInput) {
        shopNameInput.addEventListener("input", async () => {
            const value = shopNameInput.value.trim();
            if (!value) {
                showError(shopNameInput, "Shop name is required.");
            } else if (value.length > 30) {
                showError(shopNameInput, "Shop name must be 30 characters or less.");
            } else if (!/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(value)) {
                showError(shopNameInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
            } else {
                clearError(shopNameInput);
            }
        });
    }

    const usernameInput = document.getElementById("signup-username");
    if (usernameInput) {
        usernameInput.addEventListener("input", async () => {
            const value = usernameInput.value.trim();
            if (!value) {
                showError(usernameInput, "Username is required.");
            } else if (value.length > 20) {
                showError(usernameInput, "Username must be 20 characters or less.");
            } else if (!/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(value)) {
                showError(usernameInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
            } else if (!(await isUsernameUnique(value))) {
                showError(usernameInput, "Username is already taken.");
            } else {
                clearError(usernameInput);
            }
        });
    }

    const streetInput = document.getElementById("signup-street");
    if (streetInput) {
        streetInput.addEventListener("input", () => {
            const value = streetInput.value.trim();
            if (value && value.length > 50) {
                showError(streetInput, "Street/House number must be 50 characters or less.");
            } else if (value && !/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(value)) {
                showError(streetInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
            } else {
                clearError(streetInput, false); // Pass false for optional field
            }
        });
    }

    const phoneInput = document.getElementById("signup-phone");
    if (phoneInput) {
        phoneInput.addEventListener("input", () => {
            let value = phoneInput.value.replace(/\D/g, "");
            if (value.length > 11) value = value.slice(0, 11);
            phoneInput.value = value;
            if (!value) {
                showError(phoneInput, "Phone number is required.");
            } else if (value.length !== 11 || !value.startsWith("09")) {
                showError(phoneInput, "Please enter a valid Philippine phone number (09XXXXXXXXX).");
            } else {
                clearError(phoneInput);
            }
        });
    }

    if (signupEmailInput) {
        signupEmailInput.addEventListener("input", () => {
            const value = signupEmailInput.value.trim();
            if (!value) {
                showError(signupEmailInput, "Email is required.");
            } else if (!isValidEmail(value)) {
                showError(signupEmailInput, "Please enter a valid email address.");
            } else {
                clearError(signupEmailInput, true);
            }
        });
    }

    const passwordInputs = ["signup-password", "signup-confirmpass"];
    passwordInputs.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", () => {
                const value = input.value.trim();
                if (!value) {
                    showError(input, id === "signup-password" ? "Password is required." : "Confirm password is required.");
                } else if (value.length > 20) {
                    showError(input, "Password must be 20 characters or less.");
                } else if (id === "signup-password" && !isValidPassword(value)) {
                    showError(input, "Password must be 8-20 characters, including at least one uppercase letter, one lowercase letter, and one number.");
                } else if (id === "signup-confirmpass" && value !== signupPasswordInput.value.trim()) {
                    showError(input, "Passwords do not match.");
                } else {
                    clearError(input);
                }
            });
        }
    });

    if (barangaySelect) {
        barangaySelect.addEventListener("change", () => {
            if (!barangaySelect.value) {
                showError(barangaySelect, "Barangay is required.");
            } else {
                clearError(barangaySelect);
            }
        });
    }

    const fileInputs = ["dti-upload", "permit-upload"];
    fileInputs.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("change", () => {
                const file = input.files[0];
                if (!file) {
                    showError(input, id === "dti-upload" ? "DTI certificate is required." : "Mayor's permit is required.");
                } else if (file.size > 5 * 1024 * 1024) {
                    showError(input, "File size must be less than 5MB.");
                } else if (!['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(file.type)) {
                    showError(input, "Only PNG, JPG, JPEG, or PDF files are allowed.");
                } else {
                    clearError(input);
                }
            });
        }
    });

    // File Upload Helper Function
    async function uploadFile(file, path) {
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("File size must be less than 5MB.");
        }
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error("Only PNG, JPG, JPEG, or PDF files are allowed.");
        }
        try {
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            return await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("File upload error:", error);
            throw error;
        }
    }

    // Email Verification Listener
    // Email Verification Listener
    function setupEmailVerificationListener(user) {
        const checkInterval = setInterval(async () => {
            try {
                await user.reload();
                if (user.emailVerified) {
                    clearInterval(checkInterval);
                    const userRef = doc(db, "admin", user.uid);
                    await setDoc(userRef, {
                        emailVerified: true,
                        approved: false,
                        emailVerifiedAt: new Date()
                    }, { merge: true });
                    console.log("✅ Email verified! User approval set to false.");
                    alert("🎉 Your email has been verified! Your account is now awaiting admin approval.");
                }
            } catch (error) {
                console.error("Error checking email verification:", error.code, error.message);
            }
        }, 3000);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!user.emailVerified) {
                alert("⚠️ Email verification check timed out. Please click the verification link in your email or resend the verification email.");
            }
        }, 120000); // Reduced to 2 minutes
    }

    // Helper function to send email verification with retry logic
    async function sendVerificationEmailWithRetry(user, maxRetries = 3, delayMs = 5000) { // Increased to 5 seconds
        let attempts = 0;
        while (attempts < maxRetries) {
            try {
                await sendEmailVerification(user, {
                    url: window.location.origin + "/verify-email",
                    handleCodeInApp: true
                });
                console.log("📧 Verification email sent successfully to:", user.email);
                return true;
            } catch (error) {
                attempts++;
                console.error(`❌ Verification email attempt ${attempts} failed:`, error.code, error.message);
                if (attempts >= maxRetries) {
                    let errorMessage = "Failed to send verification email. Please try again later.";
                    if (error.code === "auth/too-many-requests") {
                        errorMessage = "Too many email attempts. Please wait a few minutes and try again.";
                    } else if (error.code === "auth/network-request-failed") {
                        errorMessage = "Network error. Please check your connection and try again.";
                    } else if (error.code === "auth/invalid-action-code") {
                        errorMessage = "Invalid verification URL. Please contact support.";
                    }
                    throw new Error(errorMessage);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return false;
    }

    // Signup Form Submission
    if (signupForm) {
        signupForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const submitButton = signupForm.querySelector("button[type='submit']");
            if (submitButton) submitButton.disabled = true; // Disable button
            clearErrorSummary(signupForm);
            const errors = [];

            const shopNameInput = document.getElementById("signup-shopname");
            const usernameInput = document.getElementById("signup-username");
            const cityInput = document.getElementById("signup-city");
            const provinceInput = document.getElementById("signup-province");
            const barangayInput = document.getElementById("signup-barangay");
            const streetInput = document.getElementById("signup-street");
            const phoneInput = document.getElementById("signup-phone");
            const emailInput = document.getElementById("signup-email");
            const passwordInput = document.getElementById("signup-password");
            const confirmPasswordInput = document.getElementById("signup-confirmpass");
            const dtiUpload = document.getElementById("dti-upload");
            const permitUpload = document.getElementById("permit-upload");

            if (!shopNameInput || !usernameInput || !cityInput || !provinceInput ||
                !barangayInput || !phoneInput || !emailInput || !passwordInput ||
                !confirmPasswordInput || !dtiUpload || !permitUpload) {
                alert("⚠️ Some form fields are missing. Please refresh the page.");
                return;
            }

            const shopName = shopNameInput.value.trim();
            const username = usernameInput.value.trim();
            const city = cityInput.value.trim();
            const province = provinceInput.value.trim();
            const barangay = barangayInput.value.trim();
            const street = streetInput ? streetInput.value.trim() : "";
            const phone = phoneInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            const confirmPassword = confirmPasswordInput.value.trim();

            // Comprehensive validation
            if (!shopName) {
                showError(shopNameInput, "Shop name is required.");
                errors.push("Shop name is required.");
            } else if (shopName.length > 30) {
                showError(shopNameInput, "Shop name must be 20 characters or less.");
                errors.push("Shop name must be 20 characters or less.");
            } else if (!/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(shopName)) {
                showError(shopNameInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
                errors.push("Shop name contains invalid characters.");
            }

            if (!username) {
                showError(usernameInput, "Username is required.");
                errors.push("Username is required.");
            } else if (username.length > 20) {
                showError(usernameInput, "Username must be 20 characters or less.");
                errors.push("Username must be 20 characters or less.");
            } else if (!/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(username)) {
                showError(usernameInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
                errors.push("Username contains invalid characters.");
            } else if (!(await isUsernameUnique(username))) {
                showError(usernameInput, "Username is already taken.");
                errors.push("Username is already taken.");
            }

            if (!province) {
                showError(provinceInput, "Province is required.");
                errors.push("Province is required.");
            }

            if (!city) {
                showError(cityInput, "City is required.");
                errors.push("City is required.");
            }

            if (!barangay) {
                showError(barangayInput, "Barangay is required.");
                errors.push("Barangay is required.");
            }

            if (street && street.length > 50) {
                showError(streetInput, "Street/House number must be 50 characters or less.");
                errors.push("Street/House number must be 50 characters or less.");
            } else if (street && !/^[A-Za-z0-9\s\-\@\#\$\%\^\&\*\_\.\!]+$/.test(street)) {
                showError(streetInput, "Only letters, numbers, and allowed special characters (-@#$%^&*_.!) are permitted.");
                errors.push("Street/House number contains invalid characters.");
            }

            if (!phone) {
                showError(phoneInput, "Phone number is required.");
                errors.push("Phone number is required.");
            } else if (phone.length !== 11 || !phone.startsWith("09")) {
                showError(phoneInput, "Please enter a valid Philippine phone number (09XXXXXXXXX).");
                errors.push("Please enter a valid Philippine phone number (09XXXXXXXXX).");
            }

            if (!email) {
                showError(emailInput, "Email is required.");
                errors.push("Email is required.");
            } else if (!isValidEmail(email)) {
                showError(emailInput, "Please enter a valid email address.");
                errors.push("Please enter a valid email address.");
            }

            if (!password) {
                showError(passwordInput, "Password is required.");
                errors.push("Password is required.");
            } else if (!isValidPassword(password)) {
                showError(passwordInput, "Password must be 8-20 characters, including at least one uppercase letter, one lowercase letter, and one number.");
                errors.push("Password must be 8-20 characters, including at least one uppercase letter, one lowercase letter, and one number.");
            }

            if (!confirmPassword) {
                showError(confirmPasswordInput, "Confirm password is required.");
                errors.push("Confirm password is required.");
            } else if (password !== confirmPassword) {
                showError(confirmPasswordInput, "Passwords do not match.");
                errors.push("Passwords do not match.");
            }

            if (!dtiUpload.files[0]) {
                showError(dtiUpload, "DTI certificate is required.");
                errors.push("DTI certificate is required.");
            } else if (dtiUpload.files[0].size > 5 * 1024 * 1024) {
                showError(dtiUpload, "DTI certificate must be less than 5MB.");
                errors.push("DTI certificate must be less than 5MB.");
            } else if (!['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(dtiUpload.files[0].type)) {
                showError(dtiUpload, "DTI certificate must be PNG, JPG, JPEG, or PDF.");
                errors.push("DTI certificate must be PNG, JPG, JPEG, or PDF.");
            }

            if (!permitUpload.files[0]) {
                showError(permitUpload, "Mayor's permit is required.");
                errors.push("Mayor's permit is required.");
            } else if (permitUpload.files[0].size > 5 * 1024 * 1024) {
                showError(permitUpload, "Mayor's permit must be less than 5MB.");
                errors.push("Mayor's permit must be less than 5MB.");
            } else if (!['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(permitUpload.files[0].type)) {
                showError(permitUpload, "Mayor's permit must be PNG, JPG, JPEG, or PDF.");
                errors.push("Mayor's permit must be PNG, JPG, JPEG, or PDF.");
            }

            if (errors.length > 0) {
                showErrorSummary(signupForm, errors);
                return;
            }

            if (loader) loader.classList.remove("hidden");

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                let dtiUrl = "";
                try {
                    const dtiPath = `documents/${user.uid}/dti_certificate_${Date.now()}_${dtiUpload.files[0].name}`;
                    dtiUrl = await uploadFile(dtiUpload.files[0], dtiPath);
                } catch (uploadError) {
                    console.error("DTI upload error:", uploadError);
                    errors.push(`Failed to upload DTI certificate: ${uploadError.message}`);
                    showErrorSummary(signupForm, errors);
                    return;
                }

                let permitUrl = "";
                try {
                    const permitPath = `documents/${user.uid}/mayors_permit_${Date.now()}_${permitUpload.files[0].name}`;
                    permitUrl = await uploadFile(permitUpload.files[0], permitPath);
                } catch (uploadError) {
                    console.error("Permit upload error:", uploadError);
                    errors.push(`Failed to upload Mayor's permit: ${uploadError.message}`);
                    showErrorSummary(signupForm, errors);
                    return;
                }

                try {
                    const emailSent = await sendVerificationEmailWithRetry(user);
                    if (!emailSent) {
                        throw new Error("Failed to send verification email after multiple attempts.");
                    }
                } catch (emailError) {
                    console.error("❌ Verification email error:", emailError.code, emailError.message);
                    errors.push(`Unable to send verification email: ${emailError.message}. Please wait a few minutes and try resending from your account settings or contact support.`);
                    showErrorSummary(signupForm, errors);
                    return;
                }

                const addressParts = [street, barangay, city, province].filter(part => part);
                const fullAddress = addressParts.join(", ");

                await setDoc(doc(db, "admin", user.uid), {
                    uid: user.uid,
                    shopName,
                    username,
                    address: fullAddress,
                    city,
                    province,
                    barangay,
                    street,
                    phone,
                    email,
                    role: "staff",
                    status: "active",
                    approved: false, // Changed from "waiting_verification" to false (Boolean)
                    emailVerified: false,
                    createdAt: new Date(),
                    profilePicture: "",
                    gcashNumber: "",
                    gcashQR: "",
                    documents: {
                        dtiCertificate: dtiUrl,
                        mayorsPermit: permitUrl
                    },
                    settings: {
                        appearance: {
                            fontSize: "medium",
                            language: "en",
                            theme: "light"
                        },
                        notifications: {
                            accountActivity: true,
                            orderUpdates: true,
                            paymentConfirmations: true,
                            productUpdates: false,
                            securityAlerts: true
                        }
                    }
                });

                setupEmailVerificationListener(user);

                alert("🎉 Account created successfully! Please check your email (including spam/junk folders) to verify your account. Your account will be sent for admin approval once verified.");
                signupModal.classList.add("hidden");
                signupForm.reset();
                const inputs = signupForm.querySelectorAll("input, select");
                inputs.forEach(input => clearError(input));
                if (provinceSelect) {
                    provinceSelect.value = "Laguna";
                    provinceSelect.dispatchEvent(new Event("change"));
                }
                window.removeFile('dti-upload');
                window.removeFile('permit-upload');

            } catch (error) {
                console.error("❌ Sign up error:", error.code, error.message);
                let signUpErrorMessage = "Unable to create account.";
                switch (error.code) {
                    case "auth/email-already-in-use":
                        showError(emailInput, "Email is already in use.");
                        errors.push("Email is already in use.");
                        break;
                    case "auth/weak-password":
                        showError(passwordInput, "Password should be at least 6 characters.");
                        errors.push("Password should be at least 6 characters.");
                        break;
                    case "auth/invalid-email":
                        showError(emailInput, "Invalid email format.");
                        errors.push("Invalid email format.");
                        break;
                    case "auth/too-many-requests":
                        signUpErrorMessage = "Too many attempts. Please try again later.";
                        errors.push(signUpErrorMessage);
                        break;
                    default:
                        signUpErrorMessage = `Sign up failed: ${error.message}`;
                        errors.push(signUpErrorMessage);
                }
                showErrorSummary(signupForm, errors);
            } finally {
                if (loader) loader.classList.add("hidden");
                if (submitButton) submitButton.disabled = false; // Re-enable button
            }
        });
    }

    // Toggle Password Visibility
    document.querySelectorAll(".signup-toggle-password").forEach((toggle) => {
        toggle.addEventListener("click", function () {
            const targetId = this.getAttribute("data-target");
            const input = document.getElementById(targetId);
            if (input) {
                const isHidden = input.type === "password";
                input.type = isHidden ? "text" : "password";
                const icon = this.querySelector("i");
                if (icon) {
                    icon.classList.toggle("fa-eye");
                    icon.classList.toggle("fa-eye-slash");
                }
            }
        });
    });

    // File Upload Handling
    const fileUploads = ['dti-upload', 'permit-upload'];
    fileUploads.forEach(uploadId => {
        const input = document.getElementById(uploadId);
        const container = document.getElementById(uploadId.replace('-upload', '-upload-container'));
        const preview = document.getElementById(uploadId.replace('-upload', '-preview'));
        const info = document.getElementById(uploadId.replace('-upload', '-info'));

        if (!input || !container || !preview || !info) return;

        container.addEventListener('click', () => input.click());

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('dragover');
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('dragover');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0], input, preview, info, container);
            }
        });

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], input, preview, info, container);
            }
        });
    });

    function handleFileUpload(file, input, preview, info, container) {
        if (file.size > 5 * 1024 * 1024) {
            showError(input, "File size must be less than 5MB.");
            input.value = '';
            return;
        }
    
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            showError(input, "Please upload only PNG, JPG, JPEG, or PDF files.");
            input.value = '';
            return;
        }
    
        clearError(input, true); // Required field, only clear error if file is valid
        container.style.borderColor = '#4CAF50';
        container.style.backgroundColor = '#f0f8ff';
    
        info.style.display = 'block';
        info.innerHTML = `
            <div><strong>File:</strong> ${file.name}</div>
            <div><strong>Size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</div>
            <div><strong>Type:</strong> ${file.type}</div>
            <button type="button" class="remove-file" onclick="removeFile('${input.id}')">Remove File</button>
        `;
    
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.style.display = 'block';
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        } else {
            preview.style.display = 'block';
            preview.innerHTML = `<div style="padding: 20px; text-align: center;"><i class="fas fa-file-pdf" style="font-size: 48px; color: #ff4444;"></i><br>PDF Document</div>`;
        }
    }

    window.removeFile = function(inputId) {
        const input = document.getElementById(inputId);
        const container = document.getElementById(inputId.replace('-upload', '-upload-container'));
        const preview = document.getElementById(inputId.replace('-upload', '-preview'));
        const info = document.getElementById(inputId.replace('-upload', '-info'));

        input.value = '';
        showError(input, inputId === 'dti-upload' ? "DTI certificate is required." : "Mayor's permit is required.");
        container.style.borderColor = '#ddd';
        container.style.backgroundColor = 'transparent';
        preview.style.display = 'none';
        preview.innerHTML = '';
        info.style.display = 'none';
        info.innerHTML = '';
    };

    // Fetch and display pending staff approvals
    async function fetchPendingApprovals() {
        try {
            const staffRef = collection(db, "admin");
            const q = query(
                staffRef,
                where("role", "==", "staff"),
                where("approved", "==", false), // Changed from "pending" to false
                where("emailVerified", "==", true)
            );
            const snapshot = await getDocs(q);
            const pendingCount = snapshot.size;
            const pendingBadge = document.getElementById("pendingApprovalCount");
            if (pendingBadge) {
                pendingBadge.textContent = pendingCount;
                pendingBadge.style.display = pendingCount > 0 ? "inline-block" : "none";
            }
        } catch (error) {
            console.error("Error fetching pending approvals:", error);
        }
    }

    fetchPendingApprovals();
});
// Add this in your signup success flow or create a separate button
async function resendVerificationEmail(user) {
    if (loader) loader.classList.remove("hidden");
    try {
        const emailSent = await sendVerificationEmailWithRetry(user);
        if (emailSent) {
            alert("📧 Verification email resent! Please check your inbox and spam folder.");
        } else {
            alert("⚠️ Failed to resend verification email. Please try again or contact support.");
        }
    } catch (error) {
        console.error("❌ Resend verification error:", error.code, error.message);
        alert(`⚠️ Failed to resend verification email: ${error.message}`);
    } finally {
        if (loader) loader.classList.add("hidden");
    }
}

// Example button in HTML
/*
<button id="resend-verification" class="btn" disabled>Resend Verification Email</button>
*/

// Add event listener for the button
const resendButton = document.getElementById("resend-verification");
if (resendButton) {
    resendButton.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (user) {
            await resendVerificationEmail(user);
        } else {
            alert("⚠️ No user is currently signed in.");
        }
    });
}

// Enable the button only for unverified users
onAuthStateChanged(auth, (user) => {
    if (user && resendButton) {
        resendButton.disabled = user.emailVerified;
    }
});
