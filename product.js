import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";
import { auth, db, storage } from "./firebase-config.js";

let colorTags = [];
let sizeTags = [];
let selectedFiles = [];
let customCategories = ["leather", "sandals", "abaca"];
window.colorTags = colorTags;
window.sizeTags = sizeTags;

// Track form mode (add or edit) and product reference for edit
let formMode = "add";
let currentProductRef = null;
let currentOriginalProduct = null;
let inventoryCurrentPage = 1;
const inventoryItemsPerPage = 10;
let products = [];
let currentPage = 1;
const itemsPerPage = 12;

// DOM Elements
const uploadProductForm = document.getElementById("uploadProductForm");
const loader = document.getElementById("loader");
const fileInput = document.getElementById("productImage");
const fileLabel = document.querySelector(".file-label-text");
const genderInputs = document.querySelectorAll("input[name='gender']");
const historyGrid = document.querySelector(".product-grid");
const inventoryTableBody = document.querySelector(".inventory-table tbody");
const addProductBtn = document.getElementById("addProductButton");
const addProductModal = document.getElementById("addProductModal");
const closeModalBtn = document.querySelector(".close-btn");
const selectionInfo = document.querySelector(".selection-info");
const selectAllCheckbox = document.getElementById("select-all");
const paginationContainer = document.querySelector(".pagination");
const authStatusDisplay = document.getElementById("authStatus");
const filterCategoryInput = document.getElementById("filterCategory");
const filterGender = document.getElementById("filterGender");
const filterStock = document.getElementById("filterStock");
const filterSort = document.getElementById("filterSort");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const addColorBtn = document.getElementById("addColorBtn");
const hiddenColorInput = document.createElement("input");
hiddenColorInput.type = "hidden";
hiddenColorInput.name = "availableColors";
hiddenColorInput.id = "hiddenColors";

function updateImagePreview() {
  const previewContainer = document.getElementById("previewContainer");
  previewContainer.innerHTML = "";

  // Display existing images (from existingImageUrls)
  (window.existingImageUrls || []).forEach((url, index) => {
    const container = document.createElement("div");
    container.style.position = "relative";
    container.style.display = "inline-block";
    container.style.margin = "5px";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Existing Image ${index + 1}`;
    img.style.maxWidth = "100px";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "0";
    removeBtn.style.right = "0";
    removeBtn.style.background = "rgba(255, 0, 0, 0.7)";
    removeBtn.style.color = "white";
    removeBtn.style.border = "none";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.width = "20px";
    removeBtn.style.height = "20px";
    removeBtn.style.cursor = "pointer";
    removeBtn.title = "Remove image";
    removeBtn.onclick = () => {
      window.existingImageUrls.splice(index, 1); // Remove from existingImageUrls
      updateImagePreview(); // Re-render preview
      fileLabel.textContent =
        (selectedFiles.length + window.existingImageUrls.length) > 0
          ? `${selectedFiles.length + window.existingImageUrls.length} file${
              selectedFiles.length + window.existingImageUrls.length > 1 ? "s" : ""
            } selected`
          : "Choose up to 10 images...";
    };

    container.appendChild(img);
    container.appendChild(removeBtn);
    previewContainer.appendChild(container);
  });

  // Display new files (from selectedFiles)
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const container = document.createElement("div");
      container.style.position = "relative";
      container.style.display = "inline-block";
      container.style.margin = "5px";

      const img = document.createElement("img");
      img.src = e.target.result;
      img.alt = file.name;
      img.style.maxWidth = "100px";

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.style.position = "absolute";
      removeBtn.style.top = "0";
      removeBtn.style.right = "0";
      removeBtn.style.background = "rgba(255, 0, 0, 0.7)";
      removeBtn.style.color = "white";
      removeBtn.style.border = "none";
      removeBtn.style.borderRadius = "50%";
      removeBtn.style.width = "20px";
      removeBtn.style.height = "20px";
      removeBtn.style.cursor = "pointer";
      removeBtn.title = "Remove image";
      removeBtn.onclick = () => {
        selectedFiles.splice(index, 1); // Remove file from array
        updateImagePreview(); // Re-render preview
        fileLabel.textContent =
          (selectedFiles.length + (window.existingImageUrls?.length || 0)) > 0
            ? `${selectedFiles.length + (window.existingImageUrls?.length || 0)} file${
                selectedFiles.length + (window.existingImageUrls?.length || 0) > 1 ? "s" : ""
              } selected`
            : "Choose up to 10 images...";
      };

      container.appendChild(img);
      container.appendChild(removeBtn);
      previewContainer.appendChild(container);
    };
    reader.onerror = function () {
      console.error(`Error reading file: ${file.name}`);
      alert(`Failed to load image: ${file.name}`);
    };
    reader.readAsDataURL(file);
  });
}

// Helper function to load existing images in edit mode
function loadExistingImages(imageUrls) {
  const previewContainer = document.getElementById("previewContainer");
  previewContainer.innerHTML = "";
  selectedFiles = []; // Reset selectedFiles to avoid mixing with existing images

  // Store existing image URLs in a separate array to track them
  window.existingImageUrls = imageUrls || []; // Store in global scope for access in handleEditSubmission

  updateImagePreview(); // Use global updateImagePreview

  // Update file label based on existing images
  fileLabel.textContent =
    window.existingImageUrls.length > 0
      ? `${window.existingImageUrls.length} file${
          window.existingImageUrls.length > 1 ? "s" : ""
        } selected`
      : "Choose up to 10 images...";
}

function showLoader() {
  loader?.classList.add("show");
}

function hideLoader() {
  loader?.classList.remove("show");
}

function updateTagArrays() {
  colorTags = Array.from(document.querySelectorAll("#colorTags .tag")).map(
    (tag) => tag.dataset.value
  );
  sizeTags = Array.from(document.querySelectorAll("#sizeTags .tag")).map(
    (tag) => tag.dataset.value
  );
  hiddenColorInput.value = colorTags.join(",");
  window.colorTags = colorTags;
  window.sizeTags = sizeTags;
}

function setupColorInputListeners() {
  const colorInput = document.getElementById("colorInput");
  const addColorBtn = document.getElementById("addColorBtn");

  // Handle "Enter" key for desktop and mobile (if supported)
  colorInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submission
      addColor();
    }
  });

  // Handle button click for explicit tag addition (mobile-friendly)
  addColorBtn?.addEventListener("click", () => {
    addColor();
  });

  // Real-time validation feedback
  colorInput?.addEventListener("input", (e) => {
    const value = e.target.value.trim();
    if (value) {
      const validColorPattern = /^[A-Za-z]+(?: [A-Za-z]+)?$/;
      if (!validColorPattern.test(value)) {
        e.target.setCustomValidity("Please enter a valid color name (letters only, optionally one space).");
      } else {
        e.target.setCustomValidity("");
      }
    } else {
      e.target.setCustomValidity("");
    }
  });
}

function addColor() {
  const colorInput = document.getElementById("colorInput");
  const value = colorInput.value.trim();
  if (!value) {
    return;
  }

  const validColorPattern = /^[A-Za-z]+(?: [A-Za-z]+)?$/;
  if (!validColorPattern.test(value)) {
    alert("Please enter a valid color name (letters only, optionally one word followed by a single space and another word).");
    colorInput.value = "";
    return;
  }

  if (colorTags.includes(value.toLowerCase())) {
    alert(`The color '${value}' is already added.`);
    colorInput.value = "";
    return;
  }

  colorTags.push(value.toLowerCase());
  renderTags("colorTags");
  updateTagArrays();
  generateVariantGrid();
  colorInput.value = "";
}

function initializeModal() {
  addProductBtn?.addEventListener("click", () => {
    if (!auth.currentUser) {
      alert("You must be logged in to add products.");
      return;
    }
    const modal = addProductModal;
    modal.classList.add("show-modal");
    const modalTitle = modal.querySelector(".modal-content h2");
    modalTitle.textContent = "Add New Product";
    uploadProductForm.reset();
    clearTagContainers();
    generateVariantGrid();
    selectedFiles = [];
    window.existingImageUrls = []; // Clear existingImageUrls
    document.getElementById("previewContainer").innerHTML = "";
    document.querySelector(".file-label-text").textContent =
      "Choose up to 10 images...";
    // Restore 'required' attribute for add mode
    fileInput.setAttribute("required", "required");
    document.getElementById("orderLimit").value = ""; // Clear order limit
    formMode = "add";
    currentProductRef = null;
    currentOriginalProduct = null;
  });

  closeModalBtn?.addEventListener("click", () => {
    const modal = addProductModal;
    modal.classList.remove("show-modal");
    const modalTitle = modal.querySelector(".modal-content h2");
    modalTitle.textContent = "Add New Product";
    clearTagContainers();
    generateVariantGrid();
    selectedFiles = [];
    window.existingImageUrls = []; // Clear existingImageUrls
    document.getElementById("previewContainer").innerHTML = "";
    document.querySelector(".file-label-text").textContent =
      "Choose up to 10 images...";
    // Restore 'required' attribute for add mode
    fileInput.setAttribute("required", "required");
    document.getElementById("orderLimit").value = ""; // Clear order limit
    formMode = "add";
    currentProductRef = null;
    currentOriginalProduct = null;
    updateCategoryDropdowns();
  });

  window.addEventListener("click", (e) => {
    if (e.target === addProductModal) {
      const modal = addProductModal;
      modal.classList.remove("show-modal");
      const modalTitle = modal.querySelector(".modal-content h2");
      modalTitle.textContent = "Add New Product";
      clearTagContainers();
      generateVariantGrid();
      selectedFiles = [];
      window.existingImageUrls = []; // Clear existingImageUrls
      document.getElementById("previewContainer").innerHTML = "";
      document.querySelector(".file-label-text").textContent =
        "Choose up to 10 images...";
      // Restore 'required' attribute for add mode
      fileInput.setAttribute("required", "required");
      document.getElementById("orderLimit").value = ""; // Clear order limit
      formMode = "add";
      currentProductRef = null;
      currentOriginalProduct = null;
      updateCategoryDropdowns();
    }
  });

  // Setup color input listeners (replaces previous colorInput listeners)
  setupColorInputListeners();

  sizeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTagInput(e, "sizeTags");
      generateVariantGrid();
      updateTagArrays();
    }
  });

  // File input change handler
  fileInput?.addEventListener("change", (e) => {
    const newFiles = Array.from(e.target.files);
    const totalImages = (window.existingImageUrls?.length || 0) + selectedFiles.length + newFiles.length;

    // Validate total number of images
    if (totalImages === 0) {
      alert("Please select one or more files.");
      e.target.value = ""; // Clear the input
      return;
    }

    if (totalImages > 10) {
      alert("You can only upload up to 10 images (including existing images).");
      e.target.value = "";
      return;
    }

    // Validate file types and sizes
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    for (const file of newFiles) {
      if (!allowedTypes.includes(file.type)) {
        alert(`Invalid file type for ${file.name}. Only JPEG, PNG, GIF, and WebP are allowed.`);
        e.target.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert(`File ${file.name} is too large. Maximum size is 5MB.`);
        e.target.value = "";
        return;
      }
    }

    // Append new files to selectedFiles
    selectedFiles = [...selectedFiles, ...newFiles];
    updateImagePreview();
    fileLabel.textContent = `${totalImages} file${totalImages > 1 ? "s" : ""} selected`;
  });

  // Real-time price input validation
  document.getElementById('productPrice')?.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value === '' || isNaN(value) || parseFloat(value) < 0) {
      e.target.setCustomValidity('Please enter a valid non-negative number for the price.');
    } else {
      e.target.setCustomValidity('');
    }
  });

  // Real-time order limit input validation
  document.getElementById('orderLimit')?.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value === '' || isNaN(value) || parseInt(value) < 1) {
      e.target.setCustomValidity('Please enter a valid positive integer for the order limit.');
    } else {
      e.target.setCustomValidity('');
    }
  });

  // Prevent form submission on Enter key for all inputs except buttons
  uploadProductForm?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
    }
  });
}

function updateAuthStatusDisplay() {
  const user = auth.currentUser;
  if (authStatusDisplay) {
    authStatusDisplay.textContent = user
      ? `Logged in as: ${user.email}`
      : "Not logged in";
    if (user) {
      document
        .querySelectorAll(".requires-auth")
        .forEach((el) => (el.style.display = "block"));
      document
        .querySelectorAll(".requires-no-auth")
        .forEach((el) => (el.style.display = "none"));
    } else {
      document
        .querySelectorAll(".requires-auth")
        .forEach((el) => (el.style.display = "none"));
      document
        .querySelectorAll(".requires-no-auth")
        .forEach((el) => (el.style.display = "block"));
    }
  }
}

function detectCategory(name, selectedCategory) {
  const lower = name.toLowerCase();
  if (selectedCategory) return selectedCategory;
  if (lower.includes("sandals")) return "sandals";
  if (lower.includes("leather")) return "leather";
  if (lower.includes("abacca") || lower.includes("abaca")) return "abaca";
  return "all";
}

async function addNewProduct(
  name,
  description,
  price,
  imageFiles,
  selectedCategory,
  sizeQuantities,
  gender,
  colors = [],
  sizes = [],
  colorSizeVariants = {},
  orderLimit
) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("❌ Login required.");

    // Validate required fields
    if (
      !name ||
      !description ||
      isNaN(price) ||
      !imageFiles.length ||
      !Object.keys(sizeQuantities).length ||
      !gender ||
      !orderLimit
    ) {
      throw new Error("⚠️ Please fill in all required fields and select at least one image.");
    }

    // Validate price
    if (price < 0) {
      throw new Error("⚠️ Price cannot be negative.");
    }

    // Validate order limit
    if (isNaN(orderLimit) || orderLimit < 1) {
      throw new Error("⚠️ Order limit per buyer must be a positive integer.");
    }

    // Validate total number of images (1 to 10)
    if (imageFiles.length < 1) {
      throw new Error("⚠️ At least one image is required.");
    }
    if (imageFiles.length > 10) {
      throw new Error("⚠️ You can only upload up to 10 images.");
    }

    // Validate file types and sizes
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    for (const file of imageFiles) {
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`⚠️ Invalid file type for ${file.name}. Only JPEG, PNG, GIF, and WebP are allowed.`);
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        throw new Error(`⚠️ File ${file.name} is too large. Maximum size is 5MB.`);
      }
    }

    showLoader();

    // Run the operation in a transaction for atomicity
    let imageUrls = [];

    await runTransaction(db, async (transaction) => {
      const productRef = collection(db, "products"); // Move inside transaction if needed

      // Upload images and collect URLs
      for (const imageFile of imageFiles) {
        const imageRef = ref(
          storage,
          `products/${user.uid}/${Date.now()}-${crypto.randomUUID()}-${imageFile.name}`
        );
        await uploadBytes(imageRef, imageFile); // Note: uploadBytes is async but not transactional
        const imageUrl = await getDownloadURL(imageRef);
        imageUrls.push(imageUrl);
      }

      // Calculate total stock
      const totalStock = Object.values(sizeQuantities).reduce(
        (sum, qty) => sum + parseInt(qty || 0),
        0
      );

      // Determine category
      const categoryToUse = detectCategory(name, selectedCategory);
      if (!customCategories.includes(categoryToUse.toLowerCase())) {
        customCategories.push(categoryToUse.toLowerCase());
        updateCategoryDropdowns();
      }

      // Prepare product data
      const productData = {
        userId: user.uid,
        name,
        description,
        price,
        imageUrls,
        category: categoryToUse,
        sizeQuantities,
        sizes: sizes.length ? sizes : Object.keys(sizeQuantities),
        gender,
        colors,
        colorSizeVariants,
        stock: totalStock,
        orderLimit, // Add order limit to product data
        lastUpdated: new Date().toDateString(),
        timestamp: serverTimestamp(),
      };

      // Add the product to Firestore
      transaction.set(doc(productRef), productData);
    });

    alert("🎉 Product successfully uploaded");
  } catch (err) {
    console.error("❌ Error adding product:", err);
    alert(`Error: ${err.message}`);
  } finally {
    hideLoader();
    selectedFiles = []; // Clear selectedFiles after submission
    window.existingImageUrls = []; // Clear existingImageUrls
    updateImagePreview(); // Reset preview
    fileLabel.textContent = "Choose up to 10 images...";
  }
}

async function handleEditSubmission(productRef, originalProduct) {
  try {
    const name = document.getElementById("productName")?.value.trim() || "";
    const description =
      document.getElementById("productDescription")?.value.trim() || "";
    const price =
      parseFloat(document.getElementById("productPrice")?.value.trim()) || 0;
    const orderLimit =
      parseInt(document.getElementById("orderLimit")?.value.trim()) || 0;
    const imageFiles = selectedFiles || [];
    const existingImages = window.existingImageUrls || [];
    const selectedCategory = document.getElementById("productCategory")?.value || "";
    const gender = document.querySelector("input[name='gender']:checked")?.value || "";

    // Validate required fields
    if (!name || !description || isNaN(price) || !selectedCategory || !gender || !orderLimit) {
      alert("Please fill in all required fields.");
      return;
    }

    // Validate price
    if (price < 0) {
      alert("Price cannot be negative.");
      return;
    }

    // Validate order limit
    if (isNaN(orderLimit) || orderLimit < 1) {
      alert("Order limit per buyer must be a positive integer.");
      return;
    }

    // Validate total number of images (1 to 10)
    const totalImages = imageFiles.length + existingImages.length;
    if (totalImages < 1) {
      alert("At least one image is required. Please keep at least one existing image or upload a new one.");
      return;
    }
    if (totalImages > 10) {
      alert("You can only have up to 10 images (including existing images).");
      return;
    }

    // Validate file types and sizes for new images
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    for (const file of imageFiles) {
      if (!allowedTypes.includes(file.type)) {
        alert(`Invalid file type for ${file.name}. Only JPEG, PNG, GIF, and WebP are allowed.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert(`File ${file.name} is too large. Maximum size is 5MB.`);
        return;
      }
    }

    // Validate size and color variants
    const sizeQuantities = {};
    const colorSizeVariants = {};
    document.querySelectorAll("#variantGrid .size-row").forEach((row) => {
      const color = row.dataset.color;
      const size = row.children[1].textContent.trim();
      const qtyInput = row.querySelector("input[type='number']");
      const qty = parseInt(qtyInput.value, 10) || 0;
      if (qty > 0) {
        if (!sizeQuantities[size]) sizeQuantities[size] = 0;
        sizeQuantities[size] += qty;
        colorSizeVariants[`${color}-${size}`] = qty;
      }
    });

    if (Object.keys(sizeQuantities).length === 0) {
      alert("Please provide quantity for at least one size.");
      return;
    }

    // Validate size quantities
    for (const qty of Object.values(sizeQuantities)) {
      if (qty < 0) {
        alert("Size quantities cannot be negative.");
        return;
      }
    }

    // Confirm update
    if (
      !confirm(
        `Are you sure you want to update this product?\n\nProduct Name: ${name}\nPrice: ₱${price.toFixed(2)}\nOrder Limit: ${orderLimit}`
      )
    ) {
      return;
    }

    showLoader();

    // Determine category
    const categoryToUse = detectCategory(name, selectedCategory);
    if (!customCategories.includes(categoryToUse.toLowerCase())) {
      customCategories.push(categoryToUse.toLowerCase());
      updateCategoryDropdowns();
    }

    // Initialize imageUrls with existing images
    let imageUrls = [...existingImages];

    // Upload new images if any
    if (imageFiles.length > 0) {
      for (const imageFile of imageFiles) {
        const imageRef = ref(
          storage,
          `products/${auth.currentUser.uid}/${Date.now()}-${crypto.randomUUID()}-${imageFile.name}`
        );
        await uploadBytes(imageRef, imageFile);
        const imageUrl = await getDownloadURL(imageRef);
        imageUrls.push(imageUrl);
      }
    }

    // Delete old images that are no longer included
    if (originalProduct.imageUrls) {
      for (const oldImageUrl of originalProduct.imageUrls) {
        if (!imageUrls.includes(oldImageUrl)) {
          try {
            const oldImageRef = ref(storage, oldImageUrl);
            await deleteObject(oldImageRef);
          } catch (error) {
            console.warn(`Failed to delete old image ${oldImageUrl}:`, error);
            // Continue with other deletions to avoid blocking the update
          }
        }
      }
    }

    // Prepare update data
    const updateData = {
      name,
      description,
      price,
      category: categoryToUse,
      sizeQuantities,
      sizes: Object.keys(sizeQuantities),
      colors: colorTags,
      colorSizeVariants,
      stock: Object.values(sizeQuantities).reduce((sum, qty) => sum + qty, 0),
      gender,
      imageUrls,
      orderLimit, // Add order limit to update data
      lastUpdated: new Date().toDateString(),
      timestamp: serverTimestamp(),
    };

    // Update the product in Firestore
    await updateDoc(productRef, updateData);

    alert("✅ Product successfully updated");
  } catch (err) {
    console.error("Error updating product:", err);
    alert(`Error: ${err.message}`);
  } finally {
    hideLoader();
    window.existingImageUrls = []; // Clear existingImageUrls after submission
    selectedFiles = []; // Clear selectedFiles after submission
    updateImagePreview(); // Reset preview
    fileLabel.textContent = "Choose up to 10 images...";
  }
}

async function handleUnifiedFormSubmission(e) {
  e.preventDefault();
  e.stopPropagation();

  // Validate number of images (1 to 10)
  const totalImages = selectedFiles.length + (formMode === "edit" ? (window.existingImageUrls?.length || 0) : 0);
  if (totalImages < 1) {
    alert("Please select one or more files or keep at least one existing image.");
    return;
  }
  if (totalImages > 10) {
    alert("You can only select up to 10 images (including existing images).");
    return;
  }

  // Validate file types and sizes for new images
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  for (const file of selectedFiles) {
    if (!allowedTypes.includes(file.type)) {
      alert(`Invalid file type for ${file.name}. Only JPEG, PNG, GIF, and WebP are allowed.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert(`File ${file.name} is too large. Maximum size is 5MB.`);
      return;
    }
  }

  if (formMode === "edit" && currentProductRef && currentOriginalProduct) {
    await handleEditSubmission(currentProductRef, currentOriginalProduct);
  } else {
    const name = document.getElementById("productName")?.value.trim();
    const description = document.getElementById("productDescription")?.value.trim();
    const price = parseFloat(document.getElementById("productPrice")?.value.trim());
    const orderLimit = parseInt(document.getElementById("orderLimit")?.value.trim());
    const imageFiles = selectedFiles;
    const selectedCategory = document.getElementById("productCategory")?.value;
    const gender = document.querySelector("input[name='gender']:checked")?.value;

    const sizeQuantities = {};
    const colorSizeVariants = {};
    document.querySelectorAll("#variantGrid .size-row").forEach((row) => {
      const color = row.dataset.color;
      const size = row.children[1].textContent.trim();
      const qtyInput = row.querySelector("input[type='number']");
      const qty = parseInt(qtyInput.value, 10) || 0;
      if (qty >= 0) {
        if (!sizeQuantities[size]) sizeQuantities[size] = 0;
        sizeQuantities[size] += qty;
        colorSizeVariants[`${color}-${size}`] = qty;
      }
    });

    // Validate required fields
    if (
      !name ||
      !description ||
      isNaN(price) ||
      price < 0 ||
      !imageFiles.length ||
      !Object.keys(sizeQuantities).length ||
      !selectedCategory ||
      !gender ||
      !orderLimit
    ) {
      alert("Please fill in all required fields, ensure price is non-negative, and select one or more files.");
      return;
    }

    // Validate order limit
    if (isNaN(orderLimit) || orderLimit < 1) {
      alert("Order limit per buyer must be a positive integer.");
      return;
    }

    // Validate size quantities
    for (const qty of Object.values(sizeQuantities)) {
      if (qty < 0) {
        alert("Size quantities cannot be negative.");
        return;
      }
    }

    // Confirm addition
    if (
      !confirm(
        `Are you sure you want to upload this product?\n\nProduct Name: ${name}\nPrice: ₱${price.toFixed(2)}\nOrder Limit: ${orderLimit}`
      )
    ) {
      return;
    }

    await addNewProduct(
      name,
      description,
      price,
      imageFiles,
      selectedCategory,
      sizeQuantities,
      gender,
      colorTags,
      sizeTags,
      colorSizeVariants,
      orderLimit
    );
  }

  // Reset form and UI
  uploadProductForm.reset();
  clearTagContainers();
  generateVariantGrid();
  selectedFiles = [];
  window.existingImageUrls = [];
  document.getElementById("previewContainer").innerHTML = "";
  document.querySelector(".file-label-text").textContent = "Choose up to 10 images...";
  document.getElementById("orderLimit").value = ""; // Clear order limit
  const modal = addProductModal;
  modal.classList.remove("show-modal");
  modal.querySelector(".modal-content h2").textContent = "Add New Product";
  formMode = "add";
  currentProductRef = null;
  currentOriginalProduct = null;
  renderProducts();
}

async function openEditProductForm(productId) {
  try {
    showLoader();
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to edit products.");
      hideLoader();
      return;
    }

    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      alert("Product not found!");
      hideLoader();
      return;
    }

    const product = { id: productSnap.id, ...productSnap.data() };
    if (product.userId !== user.uid) {
      alert("You don't have permission to edit this product.");
      hideLoader();
      return;
    }

    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    const inventoryTabBtn = document.querySelector(".tab-btn[data-view='inventory']");
    const inventoryView = document.querySelector(".inventory-view");
    if (!inventoryTabBtn || !inventoryView) {
      console.error("Inventory tab or view not found");
      alert("UI error: Cannot switch to Inventory tab.");
      hideLoader();
      return;
    }
    inventoryTabBtn.classList.add("active");
    inventoryView.classList.add("active");

    const modal = addProductModal;
    if (!modal) {
      console.error("Modal element not found");
      alert("UI error: Modal not found.");
      hideLoader();
      return;
    }
    modal.classList.add("show-modal");
    const modalTitle = modal.querySelector(".modal-content h2");
    modalTitle.textContent = "Edit Product";

    uploadProductForm.reset();

    document.getElementById("productName").value = product.name || "";
    document.getElementById("productDescription").value = product.description || "";
    document.getElementById("productPrice").value = product.price || "";
    document.getElementById("orderLimit").value = product.orderLimit || ""; // Populate order limit
    document.getElementById("productCategory").value = product.category || "";
    document.getElementById("selectedCategory").textContent = product.category || "Select a category";

    colorTags = product.colors || [];
    sizeTags = product.sizes || [];
    renderTags("colorTags");
    renderTags("sizeTags");

    generateVariantGrid();
    const colorSizeVariants = product.colorSizeVariants || {};
    document.querySelectorAll("#variantGrid .size-row").forEach((row) => {
      const color = row.dataset.color;
      const size = row.children[1].textContent.trim();
      const qtyInput = row.querySelector("input[type='number']");
      const variantKey = `${color}-${size}`;
      qtyInput.value = colorSizeVariants[variantKey] || 0;
    });

    document.querySelectorAll("input[name='gender']").forEach((input) => {
      input.checked = input.value === product.gender;
      input.parentElement.classList.toggle("selected", input.checked);
    });

    // Load existing images into preview
    loadExistingImages(product.imageUrls || []);

    // Remove 'required' attribute from file input in edit mode
    fileInput.removeAttribute("required");
    // Keep 'required' attribute for orderLimit in edit mode
    document.getElementById("orderLimit").setAttribute("required", "required");

    formMode = "edit";
    currentProductRef = productRef;
    currentOriginalProduct = product;

    hideLoader();
  } catch (error) {
    console.error("Error in openEditProductForm:", error);
    alert("Failed to open edit form. Please check console for details.");
    hideLoader();
  }
}

function addCustomCategory(type) {
  const inputId = type === 'product' ? 'customCategoryInput' : 'filterCustomCategoryInput';
  const dropdownId = type === 'product' ? 'dropdownMenu' : 'filterDropdownMenu';
  const selectedId = type === 'product' ? 'selectedCategory' : 'selectedFilterCategory';
  const hiddenId = type === 'product' ? 'productCategory' : 'filterCategory';
  const input = document.getElementById(inputId);
  if (!input) return;
  const customValue = input.value.trim();
  if (!customValue) {
    alert("Please enter a category name.");
    return;
  }
  const lowerValue = customValue.toLowerCase();
  if (customCategories.includes(lowerValue)) {
    alert(`The category "${customValue}" already exists.`);
    input.value = "";
    return;
  }
  customCategories.push(lowerValue);
  updateCategoryDropdowns();
  const selected = document.getElementById(selectedId);
  if (selected) {
    selected.textContent = customValue.charAt(0).toUpperCase() + customValue.slice(1);
  }
  const hidden = document.getElementById(hiddenId);
  if (hidden) {
    hidden.value = lowerValue;
  }
  const dropdown = document.getElementById(dropdownId);
  if (dropdown) {
    dropdown.classList.remove("show");
  }
  input.value = "";
  if (type === 'filter') {
    refreshViews(true);
  }
}

function setupCategoryInputListeners() {
  const customCategoryInput = document.getElementById("customCategoryInput");
  const filterCustomCategoryInput = document.getElementById("filterCustomCategoryInput");

  if (customCategoryInput) {
    customCategoryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addCustomCategory('product');
      }
    });
  } else {
    console.warn("customCategoryInput not found in DOM");
  }

  if (filterCustomCategoryInput) {
    filterCustomCategoryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addCustomCategory('filter');
      }
    });
  } else {
    console.warn("filterCustomCategoryInput not found in DOM");
  }
}

function updateCategoryDropdowns() {
  const productDropdownMenu = document.getElementById("dropdownMenu");
  const filterDropdownMenu = document.getElementById("filterDropdownMenu");

  if (!productDropdownMenu || !filterDropdownMenu) {
    console.warn("Dropdown menus not found in DOM");
    return;
  }

  productDropdownMenu.innerHTML = `
    <div class="custom-dropdown-item" data-value="">Select a category</div>
    ${customCategories
      .map(
        (category) =>
          `<div class="custom-dropdown-item" data-value="${category}">${
            category.charAt(0).toUpperCase() + category.slice(1)
          }</div>`
      )
      .join("")}
    <input type="text" class="custom-category-input" id="customCategoryInput" placeholder="Enter new category" />
    <button type="button" class="add-category-btn" data-type="product">Add</button>
  `;

  filterDropdownMenu.innerHTML = `
    <div class="custom-dropdown-item" data-value="all">All Categories</div>
    ${customCategories
      .map(
        (category) =>
          `<div class="custom-dropdown-item" data-value="${category}">${
            category.charAt(0).toUpperCase() + category.slice(1)
          }</div>`
      )
      .join("")}
    <input type="text" class="custom-category-input" id="filterCustomCategoryInput" placeholder="Enter new category" />
    <button type="button" class="add-category-btn" data-type="filter">Add</button>
  `;

  // Reattach click listeners for dropdown items
  document.querySelectorAll("#dropdownMenu .custom-dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      const value = item.getAttribute("data-value");
      const selectedCategory = document.getElementById("selectedCategory");
      const productCategoryInput = document.getElementById("productCategory");
      selectedCategory.textContent = value === "" ? "Select a category" : item.textContent;
      productCategoryInput.value = value;
      productDropdownMenu.classList.remove("show");
    });
  });

  document.querySelectorAll("#filterDropdownMenu .custom-dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      const value = item.getAttribute("data-value");
      const selectedFilterCategory = document.getElementById("selectedFilterCategory");
      const filterCategoryInput = document.getElementById("filterCategory");
      selectedFilterCategory.textContent = value === "all" ? "All Categories" : item.textContent;
      filterCategoryInput.value = value;
      filterDropdownMenu.classList.remove("show");
      refreshViews(true);
    });
  });

  // Reattach add button listeners
  document.querySelectorAll('.add-category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      addCustomCategory(type);
    });
  });

  // Reattach input listeners
  setupCategoryInputListeners();
}

function renderProducts() {
  try {
    const user = auth.currentUser;
    if (!user) {
      historyGrid.innerHTML = `<div class="auth-required-message">Please login to view your products.</div>`;
      inventoryTableBody.innerHTML = `<tr><td colspan="7">Login required to view inventory.</td></tr>`;
      paginationContainer.innerHTML = "";
      hideLoader();
      return;
    }

    historyGrid.innerHTML = `<div class="loading-message">⏳ Loading...</div>`;
    inventoryTableBody.innerHTML = `<tr><td colspan="7">⏳ Loading...</td></tr>`;
    showLoader();

    const productsQuery = query(collection(db, "products"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        products.forEach((product) => {
          if (product.category && !customCategories.includes(product.category.toLowerCase())) {
            customCategories.push(product.category.toLowerCase());
          }
        });
        updateCategoryDropdowns();

        if (products.length === 0) {
          historyGrid.innerHTML = `<p>No products uploaded yet.</p>`;
          inventoryTableBody.innerHTML = `<tr><td colspan="7">No products found.</td></tr>`;
          paginationContainer.innerHTML = "";
          hideLoader();
          return;
        }

        // Reset currentPage when products change
        currentPage = 1;
        renderProductGrid(currentPage);
        renderInventoryTable(inventoryCurrentPage);
        hideLoader();
      },
      (error) => {
        console.error("❌ Real-time listener error:", error);
        hideLoader();
        historyGrid.innerHTML = `<p>Error loading products: ${error.message}</p>`;
        inventoryTableBody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("❌ Initial fetch error:", error);
    hideLoader();
    historyGrid.innerHTML = `<p>Error loading products: ${error.message}</p>`;
    inventoryTableBody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
  }
}

// Filter and sort products based on user-selected criteria
function applyFilters(products, forInventory = false) {
  let filteredProducts = [...products];

  // Apply category filter
  const selectedCategory = filterCategoryInput?.value || "all";
  if (selectedCategory !== "all") {
    filteredProducts = filteredProducts.filter(
      (product) => product.category?.toLowerCase() === selectedCategory.toLowerCase()
    );
  }

  // Apply gender filter
  const selectedGender = filterGender?.value || "all";
  if (selectedGender !== "all") {
    filteredProducts = filteredProducts.filter(
      (product) => product.gender?.toLowerCase() === selectedGender.toLowerCase()
    );
  }

  // Apply stock filter
  const selectedStock = filterStock?.value || "all";
  if (selectedStock !== "all") {
    filteredProducts = filteredProducts.filter((product) => {
      const stock = product.stock || 0;
      if (selectedStock === "low") return stock <= 3;
      if (selectedStock === "in") return stock > 0;
      if (selectedStock === "out") return stock === 0;
      return true;
    });
  }

  // Apply sorting
  const sortOption = filterSort?.value || "name-asc";
  filteredProducts.sort((a, b) => {
    switch (sortOption) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "stock-asc":
        return (a.stock || 0) - (b.stock || 0);
      case "stock-desc":
        return (b.stock || 0) - (a.stock || 0);
      case "newest":
        const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return bTime - aTime;
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return filteredProducts;
}

function renderProductGrid(page) {
  historyGrid.innerHTML = "";
  const filtered = applyFilters(products);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  // Validate currentPage
  currentPage = Math.max(1, Math.min(page, totalPages || 1));

  const startProduct = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(startProduct, startProduct + itemsPerPage);

  if (filtered.length === 0) {
    historyGrid.innerHTML = `<p>No matching products.</p>`;
    paginationContainer.innerHTML = "";
    return;
  }

  paginatedItems.forEach((product) => {
    const stockClass = getStockClass(product.stock);
    const div = document.createElement("div");
    div.className = "product-card";
    const imageUrl =
      Array.isArray(product.imageUrls) && product.imageUrls.length > 0
        ? product.imageUrls[0]
        : product.imageUrl || "";
    div.innerHTML = `
      <img src="${imageUrl}" alt="${product.name}" class="product-image">
      <div class="product-details">
        <h3 class="product-name">${product.name}</h3>
        <p class="product-category">Category: ${product.category}</p>
        <p class="product-price">₱${product.price.toFixed(2)}</p>
        <div class="stock-indicator">
          <div class="stock-bar ${stockClass}"></div>
          <span class="units-left">${product.stock} units left</span>
        </div>
        <div class="size-options">
          ${renderSizesWithStock(product)}
        </div>
      </div>`;

    div.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await openEditProductForm(product.id);
      } catch (error) {
        console.error("Error opening edit form from product card:", error);
        alert("Failed to open edit form. Please try again.");
      }
    });

    historyGrid.appendChild(div);
  });

  // Ensure pagination is updated after rendering the grid
  setupPagination();
}

function renderSizesWithStock(product) {
  const sizeQuantities = product.sizeQuantities || {};
  if (Object.keys(sizeQuantities).length === 0 && product.sizes) {
    return product.sizes.map((size) => `<button class="size-btn">${size}</button>`).join("");
  }
  return Object.entries(sizeQuantities)
    .filter(([_, qty]) => parseInt(qty) > 0)
    .map(([size, qty]) => {
      const sizeClass = parseInt(qty) <= 3 ? "low-stock" : "";
      return `<button class="size-btn ${sizeClass}" title="${qty} in stock">
        ${size}${parseInt(qty) <= 3 ? ` (${qty})` : ""}
      </button>`;
    })
    .join("");
}

function renderInventoryTable(page = 1) {
  inventoryTableBody.innerHTML = "";
  const filtered = applyFilters(products, true);

  if (filtered.length === 0) {
    inventoryTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">No products match your filters.</td></tr>`;
    renderInventoryPagination(1);
    return;
  }

  const totalPages = Math.ceil(filtered.length / inventoryItemsPerPage);
  inventoryCurrentPage = Math.max(1, Math.min(page, totalPages));
  const startIdx = (inventoryCurrentPage - 1) * inventoryItemsPerPage;
  const paginated = filtered.slice(startIdx, startIdx + inventoryItemsPerPage);

  paginated.forEach((product) => {
    const stockClass = getStockClass(product.stock);
    const stockTooltip = product.stock <= 3 ? 'title="Low stock! Consider restocking soon."' : "";
    const colorSizeVariants = product.colorSizeVariants || {};

    const variantList = Object.entries(colorSizeVariants)
      .filter(([_, qty]) => parseInt(qty) > 0)
      .map(([key, qty]) => {
        const [color, size] = key.split("-");
        return { color, size, qty };
      })
      .sort((a, b) => {
        const colorCompare = a.color.localeCompare(b.color);
        return colorCompare !== 0 ? colorCompare : a.size.localeCompare(b.size);
      });

    let variantsHTML = "";
    if (variantList.length === 0) {
      variantsHTML = '<div class="no-variants">No variants defined</div>';
    } else {
      const visibleVariants = variantList.slice(0, 3);
      const hiddenVariants = variantList.slice(3);
      variantsHTML = `
        <table class="variant-table">
          <thead>
            <tr>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            ${visibleVariants
              .map(({ color, size, qty }) => {
                const isLow = parseInt(qty) <= 3;
                const formattedColor = color.charAt(0).toUpperCase() + color.slice(1);
                const formattedSize = size.charAt(0).toUpperCase() + size.slice(1);
                return `
                  <tr class="${isLow ? "low-stock" : ""}" title="${
                  isLow ? "Low stock" : `${qty} in stock`
                }">
                    <td>${formattedColor}</td>
                    <td>${formattedSize}</td>
                    <td>${qty}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `;
      if (hiddenVariants.length > 0) {
        variantsHTML += `
          <div class="toggle-variants" data-hidden-count="${hiddenVariants.length}">
            <table class="variant-table hidden">
              <tbody>
                ${hiddenVariants
                  .map(({ color, size, qty }) => {
                    const isLow = parseInt(qty) <= 3;
                    const formattedColor = color.charAt(0).toUpperCase() + color.slice(1);
                    const formattedSize = size.charAt(0).toUpperCase() + size.slice(1);
                    return `
                      <tr class="${isLow ? "low-stock" : ""}" title="${
                      isLow ? "Low stock" : `${qty} in stock`
                    }">
                        <td>${formattedColor}</td>
                        <td>${formattedSize}</td>
                        <td>${qty}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
            <button class="toggle-btn" onclick="toggleVariants(this)">Show ${hiddenVariants.length} more</button>
          </div>
        `;
      }
    }

    const formattedDate = product.lastUpdated
      ? new Date(product.lastUpdated).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="checkbox" class="select-item" data-id="${product.id}"></td>
      <td>${product.name}</td>
      <td>${product.category}</td>
      <td><div class="variant-container">${variantsHTML}</div></td>
      <td><span class="stock-badge ${stockClass}" ${stockTooltip}>${product.stock}</span></td>
      <td>${formattedDate}</td>
      <td>
        <button class="action-btn edit-btn" data-id="${product.id}" title="Edit product"><i class="material-icons">edit</i></button>
        <button class="action-btn delete-btn" data-id="${product.id}" title="Delete product"><i class="material-icons">delete</i></button>
      </td>
    `;
    inventoryTableBody.appendChild(row);
  });

  renderInventoryPagination(totalPages);
  updateSelectionInfo();
}

window.toggleVariants = function (button) {
  const container = button.closest(".toggle-variants");
  const hiddenTable = container.querySelector(".variant-table");
  const hiddenCount = parseInt(container.dataset.hiddenCount) || 0;
  const topButton = container.querySelector(".toggle-btn:not(.bottom-toggle-btn)");
  const bottomButton = container.querySelector(".bottom-toggle-btn");

  if (hiddenTable) {
    const isHidden = hiddenTable.classList.contains("hidden");
    hiddenTable.classList.toggle("hidden");
    // Update both buttons' text
    const buttonText = isHidden ? "Show less" : `Show ${hiddenCount} more`;
    if (topButton) topButton.textContent = buttonText;
    if (bottomButton) bottomButton.textContent = buttonText;

    // Switch to inventory view
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    const inventoryTabBtn = document.querySelector(".tab-btn[data-view='inventory']");
    const inventoryView = document.querySelector(".inventory-view");
    if (inventoryTabBtn && inventoryView) {
      inventoryTabBtn.classList.add("active");
      inventoryView.classList.add("active");

      // Scroll to the product row
      const productRow = button.closest("tr");
      if (productRow) {
        productRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }
};

function renderInventoryPagination(totalPages) {
  const topPagination = document.querySelector("#inventoryPaginationTop");
  const bottomPagination = document.querySelector("#inventoryPaginationBottom");
  [topPagination, bottomPagination].forEach((container) => {
    if (!container) return;
    container.innerHTML = "";

    const prevButton = document.createElement("button");
    prevButton.className = "page-btn prev";
    prevButton.innerHTML = `<i class="material-icons bx bx-chevron-left"></i>`;
    prevButton.disabled = inventoryCurrentPage === 1;
    prevButton.addEventListener("click", () => {
      if (inventoryCurrentPage > 1) {
        inventoryCurrentPage--;
        renderInventoryTable(inventoryCurrentPage);
      }
    });
    container.appendChild(prevButton);

    for (let i = 1; i <= totalPages; i++) {
      const pageButton = document.createElement("button");
      pageButton.className = `page-btn ${i === inventoryCurrentPage ? "active" : ""}`;
      pageButton.textContent = i;
      pageButton.addEventListener("click", () => {
        inventoryCurrentPage = i;
        renderInventoryTable(inventoryCurrentPage);
      });
      container.appendChild(pageButton);
    }

    const nextButton = document.createElement("button");
    nextButton.className = "page-btn next";
    nextButton.innerHTML = `<i class="material-icons bx bx-chevron-right"></i>`;
    nextButton.disabled = inventoryCurrentPage === totalPages;
    nextButton.addEventListener("click", () => {
      if (inventoryCurrentPage < totalPages) {
        inventoryCurrentPage++;
        renderInventoryTable(inventoryCurrentPage);
      }
    });
    container.appendChild(nextButton);
  });
}

function setupPagination() {
  if (!paginationContainer) {
    console.error("Pagination container not found. Ensure '.pagination' element exists in HTML.");
    return;
  }

  paginationContainer.innerHTML = "";
  const filtered = applyFilters(products);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }

  const prevButton = document.createElement("button");
  prevButton.className = "page-btn prev";
  prevButton.innerHTML = `<i class="bx bx-chevron-left"></i>`;
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener("click", () => {
    console.log("Previous button clicked, currentPage:", currentPage);
    if (currentPage > 1) {
      currentPage--;
      renderProductGrid(currentPage);
      setupPagination();
    }
  });
  paginationContainer.appendChild(prevButton);

  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement("button");
    pageButton.className = `page-btn ${i === currentPage ? "active" : ""}`;
    pageButton.textContent = i;
    pageButton.addEventListener("click", () => {
      console.log("Page button clicked, page:", i);
      currentPage = i;
      renderProductGrid(currentPage);
      setupPagination();
    });
    paginationContainer.appendChild(pageButton);
  }

  const nextButton = document.createElement("button");
  nextButton.className = "page-btn next";
  nextButton.innerHTML = `<i class="bx bx-chevron-right"></i>`;
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener("click", () => {
    console.log("Next button clicked, currentPage:", currentPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderProductGrid(currentPage);
      setupPagination();
    }
  });
  paginationContainer.appendChild(nextButton);
}

function getStockClass(stock) {
  if (stock <= 3) return "stock-low";
  if (stock <= 10) return "stock-medium";
  return "stock-high";
}

async function deleteProduct(productId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to delete products.");
      return;
    }

    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      alert("Product not found!");
      return;
    }

    const product = productSnap.data();

    if (product.userId !== user.uid) {
      alert("You don't have permission to delete this product.");
      return;
    }

    if (!confirm("Are you sure you want to delete this product?")) return;

    await deleteDoc(productRef);
    alert("✅ Product deleted successfully.");
    renderProducts();
  } catch (err) {
    console.error("Error deleting product:", err);
    alert("❌ Failed to delete product.");
  }
}

async function performBulkAction(action) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to perform bulk actions.");
      return;
    }

    const selectedCheckboxes = document.querySelectorAll(".select-item:checked");
    if (selectedCheckboxes.length === 0) {
      alert("Please select at least one product to perform this action.");
      return;
    }

    const selectedIds = Array.from(selectedCheckboxes).map((cb) => cb.dataset.id);
    for (const id of selectedIds) {
      const productSnap = await getDoc(doc(db, "products", id));
      if (!productSnap.exists() || productSnap.data().userId !== user.uid) {
        alert("You don't have permission to modify one or more selected products.");
        return;
      }
    }

    switch (action) {
      case "delete":
        if (
          !confirm(
            `Are you sure you want to delete ${selectedIds.length} selected products?`
          )
        ) {
          return;
        }

        showLoader();
        for (const id of selectedIds) {
          await deleteDoc(doc(db, "products", id));
        }
        alert(`✅ ${selectedIds.length} products deleted successfully.`);
        break;

      default:
        alert("Invalid action not recognized.");
        return;
    }

    selectAllCheckbox.checked = false;
    renderProducts();
  } catch (err) {
    console.error("Error performing bulk action:", err);
    alert(`Error: ${err.message}`);
  } finally {
    hideLoader();
  }
}

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

function setupBulkActionButtons() {
  const bulkActionsContainer = document.querySelector(".bulk-actions");
  if (bulkActionsContainer) {
    bulkActionsContainer.innerHTML = `
      <button id="bulkDeleteBtn" class="btn btn-danger">Delete Selected</button>`;
    document.getElementById("bulkDeleteBtn").addEventListener("click", () => {
      performBulkAction("delete");
    });
  }
}

inventoryTableBody?.addEventListener("click", async function (e) {
  const editBtn = e.target.closest(".edit-btn");
  const deleteBtn = e.target.closest(".delete-btn");

  if (editBtn) {
    e.preventDefault();
    e.stopPropagation();

    const productId = editBtn.dataset.id;
    if (!productId) {
      console.error("No product ID found on edit button");
      return;
    }

    try {
      console.log("Opening edit form for product:", productId);
      await openEditProductForm(productId);
    } catch (error) {
      console.error("Error opening edit form:", error);
      alert("Failed to open edit form. Please check console for details.");
    }
    return;
  }

  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();

    const productId = deleteBtn.dataset.id;
    if (!productId) {
      console.error("No product ID found on delete button");
      return;
    }

    try {
      await deleteProduct(productId);
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product. Please check console for details.");
    }
    return;
  }
});

function setupAuthStateListener() {
  auth.onAuthStateChanged((user) => {
    updateAuthStatusDisplay();
    renderProducts();
    countFollowers();
  });
}

function updateSelectionInfo() {
  const count = document.querySelectorAll(".select-item:checked").length;
  if (selectionInfo) {
    selectionInfo.textContent = `${count} items selected`;
  }
}

function refreshViews(resetPage = false) {
  if (resetPage) {
    currentPage = 1;
    inventoryCurrentPage = 1;
  }
  renderProductGrid(currentPage);
  renderInventoryTable(inventoryCurrentPage);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeModal();
  setupAuthStateListener();
  setupBulkActionButtons();
  uploadProductForm?.appendChild(hiddenColorInput);
  updateCategoryDropdowns();

  uploadProductForm?.addEventListener("submit", handleUnifiedFormSubmission);

  filterGender?.addEventListener("change", () => refreshViews(true));
  filterStock?.addEventListener("change", () => refreshViews(true));
  filterSort?.addEventListener("change", () => refreshViews(false));

  selectAllCheckbox?.addEventListener("change", () => {
    const checked = selectAllCheckbox.checked;
    document.querySelectorAll(".select-item").forEach((checkbox) => {
      checkbox.checked = checked;
    });
    updateSelectionInfo();
  });

  inventoryTableBody?.addEventListener("change", (e) => {
    if (e.target.classList.contains("select-item")) {
      const allCheckboxes = document.querySelectorAll(".select-item");
      const allChecked = Array.from(allCheckboxes).every((checkbox) => checkbox.checked);
      selectAllCheckbox.checked = allChecked;
      updateSelectionInfo();
    }
  });
});

function generateVariantGrid() {
  const colors = Array.from(document.querySelectorAll("#colorTags .tag")).map(
    (tag) => tag.dataset.value
  );
  const sizes = Array.from(document.querySelectorAll("#sizeTags .tag")).map(
    (tag) => tag.dataset.value
  );

  const tbody = document.querySelector("#variantGrid tbody");
  tbody.innerHTML = "";

  if (colors.length === 0 || sizes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="no-variants">Add at least one color and one size</td></tr>';
    return;
  }

  colors.forEach((color) => {
    // Create color header row
    const colorRow = document.createElement("tr");
    colorRow.className = "color-header";
    colorRow.dataset.color = color;
    colorRow.innerHTML = `
      <td colspan="3">
        <span>${color.charAt(0).toUpperCase() + color.slice(1)}</span>
        <button type="button" onclick="toggleVariantRow(this)">
          <i class="bx bx-chevron-down"></i>
        </button>
      </td>
    `;
    tbody.appendChild(colorRow);

    // Create size rows for this color, sorted numerically or alphanumerically
    const sortedSizes = sizes.sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB; // Sort numerically if both are numbers
      }
      return a.localeCompare(b); // Otherwise, sort alphanumerically
    });

    sortedSizes.forEach((size) => {
      const sizeRow = document.createElement("tr");
      sizeRow.className = "size-row hidden";
      sizeRow.dataset.color = color;
      sizeRow.innerHTML = `
        <td></td>
        <td>${size.charAt(0).toUpperCase() + size.slice(1)}</td>
        <td><input type="number" min="0" value="0" data-variant="${color}-${size}" /></td>
      `;
      tbody.appendChild(sizeRow);
    });
  });

  // Add real-time validation for quantity inputs
  document.querySelectorAll("#variantGrid input[type='number']").forEach((input) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      if (value === '' || isNaN(value) || parseInt(value) < 0) {
        e.target.setCustomValidity('Please enter a valid non-negative integer for the quantity.');
      } else {
        e.target.setCustomValidity('');
      }
    });
  });
}

function handleTagInput(event, containerId) {
  if (event.key === "Enter") {
    event.preventDefault();
    const input = event.target;
    const value = input.value.trim();
    if (!value) {
      return;
    }

    if (containerId === "colorTags") {
      const validColorPattern = /^[A-Za-z]+(?: [A-Za-z]+)?$/;
      if (!validColorPattern.test(value)) {
        alert("Please enter a valid color name (letters only, optionally one word followed by a single space and another word).");
        input.value = "";
        return;
      }
    } else if (containerId === "sizeTags") {
      // Validate size input
      const validSizePattern = /^(\d+(\.\d)?|[SML](?:XL)?)$/i; // Matches numbers (e.g., "7", "8.5") or standard sizes (S, M, L, XL, XXL)
      if (!validSizePattern.test(value)) {
        alert("Please enter a valid size (e.g., number like '7' or '8.5').");
        input.value = "";
        return;
      }
    }

    const container = document.getElementById(containerId);
    const existingTags = Array.from(container.querySelectorAll(".tag")).map(
      (tag) => tag.dataset.value.toLowerCase()
    );
    if (existingTags.includes(value.toLowerCase())) {
      alert(`The ${containerId === "colorTags" ? "color" : "size"} '${value}' is already added.`);
      input.value = "";
      return;
    }

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.dataset.value = value;
    tag.textContent = value;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.marginLeft = "8px";
    removeBtn.style.border = "none";
    removeBtn.style.background = "transparent";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.fontWeight = "bold";
    removeBtn.onclick = () => {
      container.removeChild(tag);
      updateTagArrays();
      generateVariantGrid();
    };

    tag.appendChild(removeBtn);
    container.appendChild(tag);
    input.value = "";

    updateTagArrays();
    generateVariantGrid();
  }
}

function renderTags(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Container ${containerId} not found`);
    return;
  }

  const tags = containerId === "colorTags" ? colorTags : sizeTags;
  container.innerHTML = "";

  tags.forEach((value) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.dataset.value = value;
    tag.textContent = value;
    tag.setAttribute("aria-label", `${containerId === "colorTags" ? "Color" : "Size"} tag: ${value}, click to remove`);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.marginLeft = "8px";
    removeBtn.style.border = "none";
    removeBtn.style.background = "transparent";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.fontWeight = "bold";
    removeBtn.style.fontSize = "18px";
    removeBtn.style.minWidth = "24px";
    removeBtn.style.minHeight = "24px";
    removeBtn.style.display = "flex";
    removeBtn.style.alignItems = "center";
    removeBtn.style.justifyContent = "center";
    removeBtn.setAttribute("aria-label", `Remove ${value} ${containerId === "colorTags" ? "color" : "size"} tag`);
    removeBtn.onclick = () => {
      container.removeChild(tag);
      updateTagArrays();
      generateVariantGrid();
    };

    tag.appendChild(removeBtn);
    container.appendChild(tag);
  });
}

function clearTagContainers() {
  document.getElementById("colorTags").innerHTML = "";
  document.getElementById("sizeTags").innerHTML = "";
  colorTags = [];
  sizeTags = [];
}

window.toggleVariantRow = function (button) {
  const colorRow = button.closest(".color-header");
  const color = colorRow.dataset.color;
  const sizeRows = document.querySelectorAll(`#variantGrid .size-row[data-color="${color}"]`);
  const isHidden = sizeRows[0]?.classList.contains("hidden");
  sizeRows.forEach((row) => row.classList.toggle("hidden", !isHidden));
  button.querySelector("i").classList.toggle("bx-chevron-down", !isHidden);
  button.querySelector("i").classList.toggle("bx-chevron-up", isHidden);
};