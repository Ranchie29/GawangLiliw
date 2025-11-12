import { auth, db, storage } from './firebase-config.js';
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', function () {
  // Toggle password visibility
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', function () {
      const input = document.getElementById(this.getAttribute('data-target'));
      input.type = input.type === 'password' ? 'text' : 'password';
      this.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });

  // Image preview
  const handlePreview = (inputId, previewId) => {
    document.getElementById(inputId).addEventListener('change', e => {
      const file = e.target.files[0];
      const preview = document.getElementById(previewId);
      if (file && file.type.startsWith('image/') && file.size <= 100 * 1024 * 1024) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
      } else {
        alert('Invalid image file (must be image and <= 100MB)');
        e.target.value = '';
        preview.style.display = 'none';
      }
    });
  };

  handlePreview('shop-profile-image', 'shop-profile-preview');
  handlePreview('shop-banner', 'shop-banner-preview');

  const showError = (id, msg) => {
    let elem = document.getElementById(id);
    let error = elem.nextElementSibling;
    if (!error || !error.classList.contains('input-error')) {
      error = document.createElement('div');
      error.className = 'input-error';
      elem.parentNode.insertBefore(error, elem.nextSibling);
    }
    error.textContent = msg;
  };

  const clearErrors = () => {
    document.querySelectorAll('.input-error').forEach(e => e.remove());
  };

  document.getElementById('signup-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('seller-name').value.trim();
    const email = document.getElementById('seller-email').value.trim();
    const password = document.getElementById('seller-password').value;
    const confirmPassword = document.getElementById('seller-confirm-password').value;
    const shopName = document.getElementById('shop-name').value.trim();
    const profileImg = document.getElementById('shop-profile-image').files[0];
    const bannerImg = document.getElementById('shop-banner').files[0];

    let hasError = false;

    if (!name.match(/^[A-Za-z]+ [A-Z]\. [A-Za-z]+$/)) {
      showError('seller-name', 'Enter a valid full name (e.g., Menchie G. Cosio).');
      hasError = true;
    }
    

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      showError('seller-email', 'Enter a valid email.');
      hasError = true;
    }

    if (!password) {
      showError('seller-password', 'Password is required.');
      hasError = true;
    }

    if (password !== confirmPassword) {
      showError('seller-confirm-password', 'Passwords do not match.');
      hasError = true;
    }

    if (!shopName) {
      showError('shop-name', 'Shop name is required.');
      hasError = true;
    }

    if (!profileImg || !profileImg.type.startsWith('image/') || profileImg.size > 100 * 1024 * 1024) {
      showError('shop-profile-image', 'Valid profile image required.');
      hasError = true;
    }

    if (!bannerImg || !bannerImg.type.startsWith('image/') || bannerImg.size > 100 * 1024 * 1024) {
      showError('shop-banner', 'Valid banner image required.');
      hasError = true;
    }

    if (hasError) return;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      const profileRef = ref(storage, `adminImages/${userId}/profile.jpg`);
      await uploadBytes(profileRef, profileImg);
      const profileUrl = await getDownloadURL(profileRef);

      const bannerRef = ref(storage, `adminImages/${userId}/banner.jpg`);
      await uploadBytes(bannerRef, bannerImg);
      const bannerUrl = await getDownloadURL(bannerRef);

      await setDoc(doc(db, "admin", userId), {
        name,
        email,
        role: 'staff',
        shopName,
        profilePicture: profileUrl,
        bannerImageUrl: bannerUrl,
        approved: false,        // <-- Add this line
        createdAt: serverTimestamp()
      });
      

      alert("Account created successfully!");
      this.reset();
      document.getElementById('shop-profile-preview').style.display = 'none';
      document.getElementById('shop-banner-preview').style.display = 'none';

    } catch (error) {
      alert("Signup Error: " + error.message);
      console.error("Signup error", error);
    }
  });
});
