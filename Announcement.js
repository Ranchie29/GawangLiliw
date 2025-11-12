import {
  auth,
  db,
  storage,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  ref,
  uploadBytes,
  getDownloadURL,
  onAuthStateChanged,
  Timestamp,
} from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  // Verify Firebase initialization
  if (!db || !auth || !storage) {
    console.error("Firebase not fully initialized. Check firebase-config.js", {
      db,
      auth,
      storage,
    });
    return;
  }

  const announcementForm = document.getElementById("announcementForm");
  if (!announcementForm) console.error("Announcement form not found");
  announcementForm?.addEventListener("submit", handleAnnouncementSubmission);

  const bannerInput = document.getElementById("bannerInput");
  if (!bannerInput) console.error("Banner input not found");
  bannerInput?.addEventListener("change", previewBanners);
  console.log("Banner input listener attached:", !!bannerInput);

  const audienceSelect = document.getElementById("audience");
  if (!audienceSelect) console.error("Audience select not found");
  audienceSelect?.addEventListener("change", updateAnnouncement);
  console.log("Audience select listener attached:", !!audienceSelect);

  const audienceFilter = document.getElementById("audienceFilter");
  if (!audienceFilter) console.error("Audience filter not found");
  audienceFilter?.addEventListener("change", filterAnnouncements);

  const createButton = document.querySelector(".create-button");
  if (!createButton) console.error("Create button not found");
  createButton?.addEventListener("click", openModal);

  const modalClose = document.querySelector(".modal-close");
  if (!modalClose) console.error("Modal close button not found");
  modalClose?.addEventListener("click", closeModal);

  const backdrop = document.getElementById("backdrop");
  if (!backdrop) console.error("Backdrop not found");
  backdrop?.addEventListener("click", closeModal);

  const prevBannerBtn = document.getElementById("prevBannerBtn");
  if (!prevBannerBtn) console.error("Previous banner button not found");
  prevBannerBtn?.addEventListener("click", prevBanner);

  const nextBannerBtn = document.getElementById("nextBannerBtn");
  if (!nextBannerBtn) console.error("Next banner button not found");
  nextBannerBtn?.addEventListener("click", nextBanner);

  updateAnnouncement();
  fetchAnnouncements();

  onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        const adminDocRef = doc(db, "admin", user.uid);
        const adminDoc = await getDoc(adminDocRef);

        if (adminDoc.exists()) {
          const adminData = adminDoc.data();
          const logoImage = document.querySelector(".logo-image");
          const userNameSpan = document.getElementById("userName");

          if (adminData.profilePicture && logoImage) {
            logoImage.src = adminData.profilePicture;
            logoImage.alt = adminData.username || "Gawang Liliw Logo";
          }

          if (adminData.username && userNameSpan) {
            userNameSpan.textContent = adminData.username;
          }
        } else {
          console.error("No admin document found for UID:", user.uid);
        }
      } else {
        console.error("No user is logged in.");
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
      alert("Failed to load admin data. Please try again.");
    }
  });
});

// Pagination variables
let currentPage = 1;
const itemsPerPage = 5; // Number of announcements per page
let currentBannerIndex = 0;
let banners = ["static/photos/default-banner.png"];
let selectedFiles = [];
let announcements = [];
let isSubmitting = false; // Flag to prevent multiple submissions

async function fetchAnnouncements() {
  try {
    const loader = document.getElementById("loader");
    if (loader) loader.classList.add("show");
    const announcementsRef = collection(db, "announcements");
    const q = query(announcementsRef, orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    announcements = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      announcements.push({ id: doc.id, ...data });
    });

    currentPage = 1; // Reset to first page on fetch
    populateAnnouncementTable();
    updatePaginationControls();
  } catch (err) {
    console.error("Error fetching announcements:", err);
    alert("Failed to load announcements. Please try again.");
  } finally {
    const loader = document.getElementById("loader");
    if (loader) loader.classList.remove("show");
  }
}

function populateAnnouncementTable() {
  const tableBody = document.getElementById("announcementTableBody");
  const filter = document.getElementById("audienceFilter")?.value || "all";
  if (!tableBody) {
    console.error("Announcement table body not found");
    return;
  }

  tableBody.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter announcements based on audience
  const filteredAnnouncements = announcements.filter(
    (announcement) => filter === "all" || announcement.audience === filter
  );

  // Calculate the start and end indices for the current page
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, endIndex);

  paginatedAnnouncements.forEach((announcement) => {
    const validUntilDate = announcement.validUntil.toDate ? announcement.validUntil.toDate() : new Date(announcement.validUntil);
    let status = "";
    const announcementDate = announcement.timestamp.toDate ? announcement.timestamp.toDate() : new Date(announcement.timestamp);
    if (validUntilDate < today) {
      status = "Ended";
    } else if (announcementDate > today) {
      status = "Upcoming";
    } else {
      status = "Ongoing";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${announcement.title}</td>
      <td>${announcement.audience.charAt(0).toUpperCase() + announcement.audience.slice(1)}</td>
      <td>${status}</td>
      <td>${validUntilDate.toLocaleDateString()}</td>
      <td class="action-buttons">
        <button class="edit-btn" data-id="${announcement.id}"><i class='bx bx-edit'></i></button>
        <button class="delete-btn" data-id="${announcement.id}"><i class='bx bx-trash'></i></button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  // Attach event listeners to action buttons
  document.querySelectorAll(".edit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const announcementId = button.getAttribute("data-id");
      editAnnouncement(announcementId);
    });
  });

  document.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const announcementId = button.getAttribute("data-id");
      deleteAnnouncement(announcementId);
    });
  });

  updatePaginationControls(filteredAnnouncements.length);
}

function updatePaginationControls(totalItems) {
  const paginationControls = document.getElementById("paginationControls");
  if (!paginationControls) {
    console.error("Pagination controls not found");
    return;
  }

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  paginationControls.innerHTML = "";

  // Previous button
  const prevButton = document.createElement("button");
  prevButton.textContent = "Previous";
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      populateAnnouncementTable();
    }
  });
  paginationControls.appendChild(prevButton);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement("button");
    pageButton.textContent = i;
    pageButton.className = i === currentPage ? "active" : "";
    pageButton.addEventListener("click", () => {
      currentPage = i;
      populateAnnouncementTable();
    });
    paginationControls.appendChild(pageButton);
  }

  // Next button
  const nextButton = document.createElement("button");
  nextButton.textContent = "Next";
  nextButton.disabled = currentPage === totalPages || totalPages === 0;
  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      populateAnnouncementTable();
    }
  });
  paginationControls.appendChild(nextButton);
}

async function deleteAnnouncement(announcementId) {
  if (!confirm('Are you sure you want to delete this announcement?')) return;

  try {
      const loader = document.getElementById('loader');
      if (loader) loader.classList.add('show');

      await deleteDoc(doc(db, 'announcements', announcementId));
      alert('Announcement deleted successfully!');
      await fetchAnnouncements(); // Refresh table
  } catch (err) {
      console.error('Error deleting announcement:', err);
      alert(`Error: ${err.message}`);
  } finally {
      const loader = document.getElementById('loader');
      if (loader) loader.classList.remove('show');
  }
}

async function editAnnouncement(announcementId) {
  try {
    const announcementDoc = await getDoc(doc(db, "announcements", announcementId));
    if (announcementDoc.exists()) {
      const data = announcementDoc.data();
      document.getElementById("announcementId").value = announcementId;
      document.getElementById("announcementTitleInput").value = data.title;
      document.getElementById("audience").value = data.audience;
      document.getElementById("announcementText").value = data.text;

      // Convert Firestore Timestamp to date string for input field
      const validUntilDate = data.validUntil.toDate ? data.validUntil.toDate() : new Date(data.validUntil);
      document.getElementById("validUntil").value = validUntilDate.toISOString().slice(0, 10); // Format as YYYY-MM-DD

      // Handle banners for buyer audience
      if (data.audience === "buyer") {
        banners = data.imageUrls || ["static/photos/default-banner.png"];
        selectedFiles = [];
        updateImagePreview();
        updatePreviewAndCarousel();
        document.getElementById("bannerUpload").style.display = "block";
      } else {
        banners = ["static/photos/default-banner.png"];
        selectedFiles = [];
        updateImagePreview();
        document.getElementById("bannerUpload").style.display = "none";
      }

      openModal();
      updateAnnouncement();
    } else {
      alert("Announcement not found.");
    }
  } catch (err) {
    console.error("Error fetching announcement for edit:", err);
    alert(`Error: ${err.message}`);
  }
}

function openModal() {
  const modal = document.getElementById('announcementModal');
  const backdrop = document.getElementById('backdrop');
  if (modal && backdrop) {
      modal.style.display = 'flex';
      backdrop.style.display = 'block';
  } else {
      console.error('Modal or backdrop not found');
  }
}

function closeModal() {
  const modal = document.getElementById('announcementModal');
  const backdrop = document.getElementById('backdrop');
  const announcementForm = document.getElementById('announcementForm');
  if (modal && backdrop && announcementForm) {
      modal.style.display = 'none';
      backdrop.style.display = 'none';
      announcementForm.reset();
      document.getElementById('announcementId').value = '';
      selectedFiles = [];
      updateImagePreview();
      updateAnnouncement();
  } else {
      console.error('Modal, backdrop, or form not found');
  }
}

function filterAnnouncements() {
  currentPage = 1; // Reset to first page on filter change
  populateAnnouncementTable();
}

function updateAnnouncement() {
  const audience = document.getElementById('audience')?.value || 'seller';
  const announcementTitleInput = document.getElementById('announcementTitleInput')?.value || '';
  const announcementText = document.getElementById('announcementText')?.value || '';
  const validUntil = document.getElementById('validUntil')?.value || '';
  const announcementTitle = document.getElementById('announcementTitle');
  const announcementContent = document.getElementById('announcementContent');
  const validUntilDisplay = document.getElementById('validUntilDisplay');
  const bannerUpload = document.getElementById('bannerUpload');
  const bannerCarousel = document.getElementById('bannerCarousel');
  const carouselControls = document.getElementById('carouselControls');
  const previewContainer = document.getElementById('previewContainer');
  const fileLabel = document.querySelector('.file-label-text');
  const bannerInput = document.getElementById('bannerInput');

  if (announcementTitle) {
      announcementTitle.textContent = announcementTitleInput || `Announcement for ${audience.charAt(0).toUpperCase() + audience.slice(1)}s`;
  }
  if (announcementContent) {
      announcementContent.textContent = announcementText || 'Enter your announcement details above.';
  }
  if (validUntilDisplay) {
      validUntilDisplay.textContent = validUntil ? `Valid until: ${validUntil}` : 'Valid until: Not set';
  }

  if (audience === 'buyer') {
      if (bannerUpload) bannerUpload.style.display = 'block';
      if (bannerCarousel) bannerCarousel.style.display = 'block';
      if (!selectedFiles.length && banners[0] === 'static/photos/default-banner.png') {
          if (previewContainer) previewContainer.innerHTML = '<p class="no-images">No images selected</p>';
          if (fileLabel) fileLabel.textContent = 'Choose up to 10 images...';
          if (bannerInput) bannerInput.value = '';
      }
      if (carouselControls) carouselControls.style.display = banners.length > 1 ? 'flex' : 'none';
      if (bannerCarousel) {
          bannerCarousel.innerHTML = '<img src="static/photos/default-banner.png" alt="Promotion Banner" class="banner active">';
          updateBannerDisplay();
      }
  } else {
      if (bannerUpload) bannerUpload.style.display = 'none';
      if (bannerCarousel) bannerCarousel.style.display = 'none';
      if (carouselControls) carouselControls.style.display = 'none';
      selectedFiles = [];
      banners = ['static/photos/default-banner.png'];
      if (previewContainer) previewContainer.innerHTML = '<p class="no-images">No images selected</p>';
      if (fileLabel) fileLabel.textContent = 'Choose up to 10 images...';
      if (bannerInput) bannerInput.value = '';
      if (bannerCarousel) {
          bannerCarousel.innerHTML = '<img src="static/photos/default-banner.png" alt="Promotion Banner" class="banner active">';
      }
      currentBannerIndex = 0;
  }
  updateBannerDisplay();
}

function updateImagePreview() {
  const previewContainer = document.getElementById('previewContainer');
  const fileLabel = document.querySelector('.file-label-text');
  if (!previewContainer || !fileLabel) {
      console.error('Preview container or file label not found');
      return;
  }

  previewContainer.innerHTML = '';

  if (selectedFiles.length === 0 && banners[0] !== 'static/photos/default-banner.png') {
      banners.forEach((src, index) => {
          const container = document.createElement('div');
          container.style.position = 'relative';
          container.style.display = 'inline-block';
          container.style.margin = '5px';

          const img = document.createElement('img');
          img.src = src;
          img.alt = `Banner ${index + 1}`;
          img.style.maxWidth = '100px';

          container.appendChild(img);
          previewContainer.appendChild(container);
      });
      fileLabel.textContent = `${banners.length} image${banners.length > 1 ? 's' : ''} loaded`;
      updatePreviewAndCarousel();
      return;
  }

  if (selectedFiles.length === 0) {
      previewContainer.innerHTML = '<p class="no-images">No images selected</p>';
      fileLabel.textContent = 'Choose up to 10 images...';
      banners = ['static/photos/default-banner.png'];
      updatePreviewAndCarousel();
      return;
  }

  selectedFiles.forEach((file, index) => {
      console.log(`Processing file: ${file.name}, size: ${file.size}, type: ${file.type}`);
      const reader = new FileReader();
      reader.onload = function(e) {
          const container = document.createElement('div');
          container.style.position = 'relative';
          container.style.display = 'inline-block';
          container.style.margin = '5px';

          const img = document.createElement('img');
          img.src = e.target.result;
          img.alt = file.name;
          img.style.maxWidth = '100px';

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.style.position = 'absolute';
          removeBtn.style.top = '0';
          removeBtn.style.right = '0';
          removeBtn.style.background = 'rgba(255, 0, 0, 0.7)';
          removeBtn.style.color = 'white';
          removeBtn.style.border = 'none';
          removeBtn.style.borderRadius = '50%';
          removeBtn.style.width = '20px';
          removeBtn.style.height = '20px';
          removeBtn.style.cursor = 'pointer';
          removeBtn.title = 'Remove image';
          removeBtn.onclick = () => {
              console.log(`Removing file at index: ${index}`);
              selectedFiles.splice(index, 1);
              updateImagePreview();
              updatePreviewAndCarousel();
          };

          container.appendChild(img);
          container.appendChild(removeBtn);
          previewContainer.appendChild(container);

          banners[index] = e.target.result;
          fileLabel.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`;
          console.log(`Updated banners: ${banners.length} images`);
          updatePreviewAndCarousel();
      };
      reader.onerror = function() {
          console.error(`Error reading file: ${file.name}`);
          alert(`Failed to load image: ${file.name}`);
      };
      reader.readAsDataURL(file);
  });
}

function previewBanners() {
  const bannerInput = document.getElementById('bannerInput');
  if (!bannerInput) {
      console.error('Banner input not found');
      return;
  }

  const newFiles = Array.from(bannerInput.files);
  console.log(`Selected ${newFiles.length} new files`);

  const totalImages = selectedFiles.length + newFiles.length;

  if (totalImages === 0) {
      console.warn('No files selected');
      alert('Please select one or more files.');
      bannerInput.value = '';
      return;
  }

  if (totalImages > 10) {
      console.warn(`Total images (${totalImages}) exceeds limit of 10`);
      alert('You can only upload up to 10 images.');
      bannerInput.value = '';
      return;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  for (const file of newFiles) {
      if (!allowedTypes.includes(file.type)) {
          console.warn(`Invalid file type: ${file.type} for ${file.name}`);
          alert(`Invalid file type for ${file.name}. Only JPEG, PNG, and GIF are allowed.`);
          bannerInput.value = '';
          return;
      }
      if (file.size > 5 * 1024 * 1024) {
          console.warn(`File too large: ${file.name}, size: ${file.size}`);
          alert(`File ${file.name} is too large. Maximum size is 5MB.`);
          bannerInput.value = '';
          return;
      }
  }

  selectedFiles = [...selectedFiles, ...newFiles];
  console.log(`Total selected files: ${selectedFiles.length}`);
  updateImagePreview();
  bannerInput.value = '';
}

function updatePreviewAndCarousel() {
  const bannerCarousel = document.getElementById('bannerCarousel');
  const carouselControls = document.getElementById('carouselControls');
  if (!bannerCarousel || !carouselControls) {
      console.error('Banner carousel or carousel controls not found');
      return;
  }

  bannerCarousel.innerHTML = '';

  if (banners.length === 1 && banners[0] === 'static/photos/default-banner.png') {
      bannerCarousel.innerHTML = '<img src="static/photos/default-banner.png" alt="Promotion Banner" class="banner active">';
      carouselControls.style.display = 'none';
  } else {
      banners.forEach((src, index) => {
          const carouselImg = document.createElement('img');
          carouselImg.src = src;
          carouselImg.alt = `Promotion Banner ${index + 1}`;
          carouselImg.className = 'banner' + (index === currentBannerIndex ? ' active' : '');
          bannerCarousel.appendChild(carouselImg);
      });
      carouselControls.style.display = banners.length > 1 ? 'flex' : 'none';
  }
  updateBannerDisplay();
}

function updateBannerDisplay() {
  const bannerCarousel = document.getElementById('bannerCarousel');
  const bannerIndex = document.getElementById('bannerIndex');
  if (!bannerCarousel || !bannerIndex) {
      console.error('Banner carousel or banner index not found');
      return;
  }

  const bannerImages = bannerCarousel.getElementsByClassName('banner');

  for (let i = 0; i < bannerImages.length; i++) {
      bannerImages[i].className = 'banner' + (i === currentBannerIndex ? ' active' : '');
  }
  bannerIndex.textContent = `${currentBannerIndex + 1} / ${banners.length}`;
}

function prevBanner() {
  if (banners.length > 1) {
      currentBannerIndex = (currentBannerIndex - 1 + banners.length) % banners.length;
      updateBannerDisplay();
  }
}

function nextBanner() {
  if (banners.length > 1) {
      currentBannerIndex = (currentBannerIndex + 1) % banners.length;
      updateBannerDisplay();
  }
}

async function handleAnnouncementSubmission(e) {
  e.preventDefault();
  e.stopPropagation();

  // Prevent multiple submissions
  if (isSubmitting) {
    console.warn("Submission in progress, please wait...");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in to create or update announcements.");
    return;
  }

  const announcementId = document.getElementById("announcementId").value;
  const audience = document.getElementById("audience")?.value;
  const announcementTitleInput = document.getElementById("announcementTitleInput")?.value.trim();
  const announcementText = document.getElementById("announcementText")?.value.trim();
  const validUntil = document.getElementById("validUntil")?.value;
  const submitButton = document.querySelector("#announcementForm .submit-button");

  if (!announcementTitleInput) {
    alert("Please enter an announcement title.");
    return;
  }

  if (!announcementText) {
    alert("Please enter announcement details.");
    return;
  }

  if (!validUntil) {
    alert("Please select a valid until date.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(validUntil);
  if (selectedDate < today) {
    alert("The validity date cannot be in the past.");
    return;
  }

  if (audience === "buyer" && selectedFiles.length === 0 && !announcementId) {
    alert("Please select at least one image for buyer announcements.");
    return;
  }

  if (selectedFiles.length > 10) {
    alert("You can only upload up to 10 images.");
    return;
  }

  // Set submitting state and disable button
  isSubmitting = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = announcementId ? "Updating..." : "Saving...";
  }

  try {
    const loader = document.getElementById("loader");
    if (loader) loader.classList.add("show");
    let imageUrls = [];

    if (audience === "buyer" && selectedFiles.length > 0) {
      for (const file of selectedFiles) {
        const imageRef = ref(storage, `announcements/${user.uid}/${Date.now()}-${crypto.randomUUID()}-${file.name}`);
        await uploadBytes(imageRef, file);
        const imageUrl = await getDownloadURL(imageRef);
        imageUrls.push(imageUrl);
      }
    } else if (audience === "seller") {
      imageUrls = ["static/photos/default-banner.png"];
    }

    const announcementData = {
      userId: user.uid,
      audience,
      title: announcementTitleInput,
      text: announcementText,
      imageUrls,
      validUntil: Timestamp.fromDate(new Date(validUntil)), // Convert to Timestamp
      timestamp: serverTimestamp(),
    };

    if (announcementId) {
      // Update existing announcement
      await updateDoc(doc(db, "announcements", announcementId), announcementData);
      alert("Announcement updated successfully!");
    } else {
      // Create new announcement
      await addDoc(collection(db, "announcements"), announcementData);
      alert("🎉 Announcement successfully posted!");
    }

    const announcementDisplay = document.getElementById("announcementDisplay");
    if (announcementDisplay) announcementDisplay.style.display = "block";

    banners = imageUrls.length > 0 ? imageUrls : ["static/photos/default-banner.png"];
    currentBannerIndex = 0;
    updatePreviewAndCarousel();
    fetchAnnouncements();

    closeModal();
  } catch (err) {
    console.error("Error posting or updating announcement:", err);
    alert(`Error: ${err.message}`);
  } finally {
    // Re-enable button after a delay (2 seconds)
    setTimeout(() => {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Announce";
      }
      const loader = document.getElementById("loader");
      if (loader) loader.classList.remove("show");
      selectedFiles = [];
      updateImagePreview();
      const announcementForm = document.getElementById("announcementForm");
      if (announcementForm) announcementForm.reset();
      document.getElementById("announcementId").value = "";
      const audienceSelect = document.getElementById("audience");
      if (audienceSelect) audienceSelect.value = "seller";
      const validUntilInput = document.getElementById("validUntil");
      if (validUntilInput) validUntilInput.value = "";
      updateAnnouncement();
    }, 2000);
  }
}