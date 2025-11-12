import { db, auth, collection, onSnapshot, addDoc, doc, getDoc, getDocs, Timestamp, deleteDoc, updateDoc, query, where } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', async function() {
  // Test Firestore connection
  try {
    const testSnapshot = await getDocs(collection(db, 'promos'));
    console.log(`Firestore connection test: Retrieved ${testSnapshot.size} promos`);
  } catch (error) {
    console.error('Firestore connection test failed:', error);
    alert('Failed to connect to Firestore. Check console for details.');
  }

  const sidebarProfilePicture = document.getElementById('sidebar-profile-picture');
  const followerCountElement = document.getElementById('followerCount');

  // Check Firebase initialization
  if (!db || !collection || !onSnapshot || !addDoc || !doc || !getDoc || !getDocs || !Timestamp || !deleteDoc || !updateDoc || !auth) {
    console.error('Firebase not fully initialized. Check firebase-config.js. Available exports:', { db, collection, onSnapshot, addDoc, doc, getDoc, getDocs, Timestamp, deleteDoc, updateDoc, auth });
    sidebarProfilePicture.src = 'static/photos/default-profile.png';
    followerCountElement.textContent = 'Followers: -';
    return;
  }

  // Function to fetch and set the current user's profile picture (realtime)
  function setupProfilePictureListener(user) {
    if (!user) {
      sidebarProfilePicture.src = 'static/photos/default-profile.png';
      return;
    }

    console.log('Setting up profile picture listener for user UID:', user.uid);
    const adminDocRef = doc(db, 'admin', user.uid);
    return onSnapshot(adminDocRef, (adminDoc) => {
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const profilePictureUrl = adminData.profilePicture || 'static/photos/default-profile.png';
        console.log('Profile picture URL:', profilePictureUrl);
        sidebarProfilePicture.src = profilePictureUrl;
      } else {
        console.warn('No admin document found for user UID:', user.uid);
        sidebarProfilePicture.src = 'static/photos/default-profile.png';
      }
    }, (error) => {
      console.error('Error fetching profile picture:', error);
      sidebarProfilePicture.src = 'static/photos/default-profile.png';
    });
  }

  // Function to fetch the count of followers (realtime)
  function setupFollowerCountListener(user) {
    if (!user) {
      followerCountElement.textContent = 'Followers: -';
      return;
    }

    console.log('Setting up follower count listener for user UID:', user.uid);
    const followersDocRef = doc(db, 'followers', user.uid);
    return onSnapshot(followersDocRef, (followersDoc) => {
      let followerCount = 0;
      if (followersDoc.exists()) {
        const followersData = followersDoc.data();
        followerCount = followersData.totalFollowers || 0;
        console.log('Follower count:', followerCount);
      } else {
        console.warn('No followers document found for user UID:', user.uid);
      }
      followerCountElement.textContent = `Followers: ${followerCount}`;
    }, (error) => {
      console.error('Error fetching follower count:', error);
      followerCountElement.textContent = 'Followers: -';
    });
  }

  // Listen for authentication state changes
  let profilePictureUnsubscribe, followerCountUnsubscribe;
  auth.onAuthStateChanged((user) => {
    if (profilePictureUnsubscribe) profilePictureUnsubscribe();
    if (followerCountUnsubscribe) followerCountUnsubscribe();

    if (user) {
      console.log('User is logged in:', user.uid);
      profilePictureUnsubscribe = setupProfilePictureListener(user);
      followerCountUnsubscribe = setupFollowerCountListener(user);
    } else {
      console.warn('No user is currently logged in, redirecting to login page');
      sidebarProfilePicture.src = 'static/photos/default-profile.png';
      followerCountElement.textContent = 'Followers: -';
      window.location.href = 'index.html';
    }
  });

  // Tab functionality
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.getAttribute('data-view');
      console.log(`Switching to view: ${view}`);
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      if (promosUnsubscribe) promosUnsubscribe();
      setupPromosListener(view);
    });
  });

  // Mobile navigation toggle
  const navToggle = document.querySelector('.nav-toggle');
  const sidebar = document.querySelector('.sidebar');
  navToggle.addEventListener('click', () => {
    sidebar.classList.toggle('show');
    navToggle.innerHTML = sidebar.classList.contains('show') 
      ? '<i class="bx bx-x"></i>' 
      : '<i class="bx bx-menu"></i>';
  });

  // Modal functionality
  const createPromoBtn = document.getElementById('createPromoBtn');
  const createPromoModal = document.getElementById('createPromoModal');
  const closePromoModal = document.getElementById('closePromoModal');
  const cancelPromoForm = document.getElementById('cancelPromoForm');
  const createPromoForm = document.getElementById('createPromoForm');
  const modalTitle = document.getElementById('modalTitle');
  const submitButton = createPromoForm.querySelector('.submit-button');

  createPromoBtn.addEventListener('click', () => {
    console.log('Opening create promo modal');
    modalTitle.innerHTML = '<i class="fas fa-tag"></i> Create Product Promotion';
    submitButton.innerHTML = '<i class="bx bx-check"></i> Apply Promotion';
    document.getElementById('promoId').value = '';
    createPromoForm.reset();
    document.getElementById('promoType').value = 'percentage';
    onPromoTypeChange();
    setupProductsForPromoListener();
    createPromoModal.classList.add('active');
  });

  closePromoModal.addEventListener('click', closeModal);
  cancelPromoForm.addEventListener('click', closeModal);

  function closeModal() {
    console.log('Closing modal');
    createPromoModal.classList.remove('active');
    createPromoForm.reset();
    document.querySelectorAll('.error-message').forEach(span => span.textContent = '');
    document.getElementById('originalPrice').value = '';
    document.getElementById('promoPrice').value = '';
    document.getElementById('promoId').value = '';
    document.getElementById('promoType').value = 'percentage';
    onPromoTypeChange();
    modalTitle.innerHTML = '<i class="fas fa-tag"></i> Create Product Promotion';
    submitButton.innerHTML = '<i class="bx bx-check"></i> Apply Promotion';
  }

  window.addEventListener('click', (e) => {
    if (e.target === createPromoModal) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && createPromoModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Promo type change handler
  function onPromoTypeChange() {
    const type = document.getElementById('promoType').value;
    const discountPercentageInput = document.getElementById('discountPercentage');
    const quantityInput = document.getElementById('quantity');
    const fixedPriceInput = document.getElementById('fixedPrice');

    console.log(`Promo type changed to: ${type}`);
    document.getElementById('percentageFields').style.display = type === 'percentage' ? 'block' : 'none';
    document.getElementById('bundleFields').style.display = type === 'bundle' ? 'block' : 'none';

    // Toggle required attributes
    if (type === 'percentage') {
      discountPercentageInput.setAttribute('required', '');
      quantityInput.removeAttribute('required');
      fixedPriceInput.removeAttribute('required');
      quantityInput.value = ''; // Clear bundle fields
      fixedPriceInput.value = '';
    } else if (type === 'bundle') {
      discountPercentageInput.removeAttribute('required');
      quantityInput.setAttribute('required', '');
      fixedPriceInput.setAttribute('required', '');
      discountPercentageInput.value = ''; // Clear percentage field
    }
    calculatePromoPrice();
  }

  document.getElementById('promoType').addEventListener('change', onPromoTypeChange);

  // Discount calculation
  const discountPercentageInput = document.getElementById('discountPercentage');
  const originalPriceInput = document.getElementById('originalPrice');
  const promoPriceInput = document.getElementById('promoPrice');
  const promoProductSelect = document.getElementById('promoProduct');
  const quantityInput = document.getElementById('quantity');
  const fixedPriceInput = document.getElementById('fixedPrice');

  discountPercentageInput.addEventListener('input', calculatePromoPrice);
  quantityInput.addEventListener('input', calculatePromoPrice);
  fixedPriceInput.addEventListener('input', calculatePromoPrice);

  promoProductSelect.addEventListener('change', function() {
    if (this.value) {
      const productPrice = getProductPrice(this.value);
      console.log(`Selected product price: ${productPrice}`);
      originalPriceInput.value = productPrice.toFixed(2);
      calculatePromoPrice();
    } else {
      originalPriceInput.value = '';
      promoPriceInput.value = '';
    }
  });

  function calculatePromoPrice() {
    const type = document.getElementById('promoType').value;
    const originalPrice = parseFloat(originalPriceInput.value);
    
    if (isNaN(originalPrice) || originalPrice <= 0) {
      promoPriceInput.value = '';
      console.log('Invalid original price, clearing promo price');
      return;
    }

    if (type === 'percentage') {
      const discountPercentage = parseFloat(discountPercentageInput.value) || 0;
      if (discountPercentage >= 0 && discountPercentage <= 100) {
        const discountAmount = originalPrice * (discountPercentage / 100);
        const promoPrice = originalPrice - discountAmount;
        promoPriceInput.value = promoPrice.toFixed(2);
        console.log(`Calculated percentage promo price: ${promoPrice}`);
      } else {
        promoPriceInput.value = '';
        console.log('Invalid discount percentage, clearing promo price');
      }
    } else if (type === 'bundle') {
      const quantity = parseInt(quantityInput.value) || 0;
      const fixedPrice = parseFloat(fixedPriceInput.value) || 0;
      if (quantity >= 2 && fixedPrice > 0) {
        const promoPrice = fixedPrice / quantity;
        promoPriceInput.value = promoPrice.toFixed(2);
        console.log(`Calculated bundle promo price: ${promoPrice} (Quantity: ${quantity}, Fixed Price: ${fixedPrice})`);
      } else {
        promoPriceInput.value = '';
        console.log('Invalid bundle inputs, clearing promo price');
      }
    } else {
      promoPriceInput.value = '';
      console.log('Unknown promo type, clearing promo price');
    }
  }

  // Form submission with create/edit logic
  let isSubmitting = false;
  createPromoForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (isSubmitting) {
      console.warn('Submission in progress, please wait...');
      return;
    }
  
    console.log('Form submission triggered');
    document.querySelectorAll('.error-message').forEach(span => span.textContent = '');
    let isValid = true;
  
    const promoTypeSelect = document.getElementById('promoType');
    const promoStartDate = document.getElementById('promoStartDate');
    const promoEndDate = document.getElementById('promoEndDate');
    const promoId = document.getElementById('promoId').value;
    const type = promoTypeSelect.value;
  
    // Log input values for debugging
    console.log('Form inputs:', {
      product: promoProductSelect.value,
      type: type,
      quantity: quantityInput.value,
      fixedPrice: fixedPriceInput.value,
      discountPercentage: discountPercentageInput.value,
      startDate: promoStartDate.value,
      endDate: promoEndDate.value,
      promoId: promoId
    });
  
    // Validate inputs
    if (!promoProductSelect.value) {
      document.getElementById('promoProductError').textContent = 'Please select a product';
      console.error('Validation failed: No product selected');
      isValid = false;
    }
    if (!promoTypeSelect.value) {
      document.getElementById('promoTypeError').textContent = 'Please select a promo type';
      console.error('Validation failed: No promo type selected');
      isValid = false;
    }
    if (type === 'percentage') {
      const discountValue = parseFloat(discountPercentageInput.value);
      if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
        document.getElementById('discountPercentageError').textContent = 'Enter a valid percentage (0-100)';
        console.error('Validation failed: Invalid discount percentage');
        isValid = false;
      }
    } else if (type === 'bundle') {
      const quantity = parseInt(quantityInput.value);
      const fixedPrice = parseFloat(fixedPriceInput.value);
      if (isNaN(quantity) || quantity < 2) {
        document.getElementById('quantityError').textContent = 'Quantity must be at least 2';
        console.error('Validation failed: Invalid quantity');
        isValid = false;
      }
      if (isNaN(fixedPrice) || fixedPrice <= 0) {
        document.getElementById('fixedPriceError').textContent = 'Fixed price must be greater than 0';
        console.error('Validation failed: Invalid fixed price');
        isValid = false;
      }
    }
    if (!promoStartDate.value) {
      document.getElementById('promoStartDateError').textContent = 'Please select a start date';
      console.error('Validation failed: No start date');
      isValid = false;
    }
    if (!promoEndDate.value) {
      document.getElementById('promoEndDateError').textContent = 'Please select an end date';
      console.error('Validation failed: No end date');
      isValid = false;
    }
    if (promoStartDate.value && promoEndDate.value && new Date(promoStartDate.value) >= new Date(promoEndDate.value)) {
      document.getElementById('promoEndDateError').textContent = 'End date must be after start date';
      console.error('Validation failed: End date not after start date');
      isValid = false;
    }
    if (promoStartDate.value && new Date(promoStartDate.value) < new Date() && !promoId) {
      document.getElementById('promoStartDateError').textContent = 'Start date cannot be in the past';
      console.error('Validation failed: Start date in the past');
      isValid = false;
    }
  
    if (!isValid) {
      console.log('Form validation failed, submission aborted');
      return;
    }
  
    console.log('Form validation passed, proceeding with submission');
    const confirmApply = confirm(`Are you sure you want to ${promoId ? 'update' : 'apply'} this promotion?`);
    if (!confirmApply) {
      console.log('Submission cancelled by user');
      return;
    }
  
    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = promoId ? 'Updating...' : 'Saving...';
  
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No authenticated user found');
      }
      const sellerId = user.uid; // Get the sellerId from the authenticated user
      const productId = promoProductSelect.value;
      const promoPrice = parseFloat(promoPriceInput.value);
      const startDate = new Date(promoStartDate.value);
      const endDate = new Date(promoEndDate.value);
      const now = new Date();
  
      let status = 'upcoming';
      if (now >= startDate && now <= endDate) {
        status = 'active';
      } else if (now > endDate) {
        status = 'inactive';
      }
  
      const promoData = {
        type,
        productId,
        sellerId, // Include sellerId in promoData
        promoPrice,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        status,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
  
      if (type === 'percentage') {
        promoData.discountPercentage = parseFloat(discountPercentageInput.value);
      } else if (type === 'bundle') {
        promoData.quantity = parseInt(quantityInput.value);
        promoData.fixedPrice = parseFloat(fixedPriceInput.value);
      }
  
      console.log('Saving promo data:', promoData);
  
      if (promoId) {
        await updateDoc(doc(db, 'promos', promoId), promoData);
        console.log(`Promo ${promoId} updated successfully with sellerId: ${sellerId}`);
      } else {
        const docRef = await addDoc(collection(db, 'promos'), promoData);
        console.log(`Promo created successfully with ID: ${docRef.id}, sellerId: ${sellerId}`);
      }
  
      closeModal();
      alert('Promotion saved successfully!');
    } catch (error) {
      console.error(`Error ${promoId ? 'updating' : 'saving'} promo:`, error);
      alert(`Failed to ${promoId ? 'update' : 'create'} promo: ${error.message}`);
    } finally {
      setTimeout(() => {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="bx bx-check"></i> Apply Promotion';
      }, 2000);
    }
  });

  // Realtime products for promo
  let productsUnsubscribe;
  function setupProductsForPromoListener() {
    const promoProductSelect = document.getElementById('promoProduct');
    promoProductSelect.innerHTML = '<option value="">Select a product</option>';

    const user = auth.currentUser;
    if (!user) {
      console.warn('No authenticated user, cannot load products');
      promoProductSelect.innerHTML = '<option value="">Please log in to view your products</option>';
      return;
    }

    const userId = user.uid;
    console.log(`Setting up products listener for userId: ${userId}`);
    productsUnsubscribe = onSnapshot(query(collection(db, 'products'), where('userId', '==', userId)), (productsSnapshot) => {
      console.log(`Loaded ${productsSnapshot.size} products for userId: ${userId}`);
      promoProductSelect.innerHTML = '<option value="">Select a product</option>';
      if (productsSnapshot.empty) {
        promoProductSelect.innerHTML = '<option value="">No products found</option>';
      }
      productsSnapshot.forEach(doc => {
        const product = doc.data();
        const productId = doc.id;
        const productName = product.name;
        const productPrice = product.price;

        if (product.stock > 0) {
          const option = document.createElement('option');
          option.value = productId;
          option.textContent = `${productName} (${product.category})`;
          option.dataset.price = productPrice;
          promoProductSelect.appendChild(option);
        }
      });
    }, (error) => {
      console.error('Error loading products from Firestore:', error);
      promoProductSelect.innerHTML = '<option value="">Failed to load products</option>';
      alert('Failed to load products. Please try again later.');
    });
  }

  // Realtime promos loading
  let promosUnsubscribe;
  function setupPromosListener(view) {
    const tableBody = document.getElementById('promoTableBody');
    tableBody.innerHTML = '';

    const user = auth.currentUser;
    if (!user) {
      console.warn('No authenticated user, cannot load promos');
      tableBody.innerHTML = '<tr><td colspan="8">Please log in to view your promotions.</td></tr>';
      return;
    }

    const sellerId = user.uid;
    console.log(`Setting up promos listener for sellerId: ${sellerId}, view: ${view}`);
    promosUnsubscribe = onSnapshot(query(collection(db, 'promos'), where('sellerId', '==', sellerId)), (promosSnapshot) => {
      console.log(`Received ${promosSnapshot.size} promos for view: ${view}, sellerId: ${sellerId}`);
      tableBody.innerHTML = '';
      if (promosSnapshot.empty) {
        tableBody.innerHTML = '<tr><td colspan="8">No promotions found.</td></tr>';
      }
      promosSnapshot.forEach(doc => {
        const promo = { ...doc.data(), id: doc.id };
        console.log('Promo data:', promo);
        const startDate = promo.startDate.toDate ? promo.startDate.toDate() : new Date(promo.startDate);
        const endDate = promo.endDate.toDate ? promo.endDate.toDate() : new Date(promo.endDate);
        let status = 'upcoming';
        if (new Date() >= startDate && new Date() <= endDate) {
          status = 'active';
        } else if (new Date() > endDate) {
          status = 'inactive';
        }

        if (view === status || (view === 'expired' && status === 'inactive')) {
          addPromoToTable(promo, doc.id);
        }
      });
    }, (error) => {
      console.error('Error loading promos:', error);
      tableBody.innerHTML = '<tr><td colspan="8">Failed to load promotions. Please try again.</td></tr>';
      alert('Failed to load promos. Please try again.');
    });
  }

  function getProductPrice(productId) {
    const select = document.getElementById('promoProduct');
    const selectedOption = select.querySelector(`option[value="${productId}"]`);
    const price = selectedOption ? parseFloat(selectedOption.dataset.price) || 0 : 0;
    console.log(`Retrieved price for product ${productId}: ${price}`);
    return price;
  }

  async function addPromoToTable(promoData, promoId) {
    const tableBody = document.getElementById('promoTableBody');

    try {
      const productDoc = await getDoc(doc(db, 'products', promoData.productId));
      if (!productDoc.exists()) {
        console.error('Product not found:', promoData.productId);
        return;
      }

      const product = productDoc.data();
      const originalPrice = product.price;

      const row = document.createElement('tr');
      row.dataset.promoId = promoId;

      const now = new Date();
      const startDate = promoData.startDate.toDate ? promoData.startDate.toDate() : new Date(promoData.startDate);
      const endDate = promoData.endDate.toDate ? promoData.endDate.toDate() : new Date(promoData.endDate);

      let status = 'upcoming';
      if (now >= startDate && now <= endDate) {
        status = 'active';
      } else if (now > endDate) {
        status = 'inactive';
      }

      let promoTypeDisplay = '';
      if (promoData.type === 'percentage') {
        promoTypeDisplay = `${promoData.discountPercentage}%`;
      } else if (promoData.type === 'bundle') {
        promoTypeDisplay = `Buy ${promoData.quantity} for ₱${promoData.fixedPrice.toFixed(2)}`;
      }

      row.innerHTML = `
        <td>
          <div class="product-info">
            <img src="${product.imageUrls && product.imageUrls[0] ? product.imageUrls[0] : 'https://via.placeholder.com/60'}" alt="${product.name}" class="product-image">
            <div>
              <div class="product-name">${product.name}</div>
              <div class="product-category">${product.category}</div>
            </div>
          </div>
        </td>
        <td>₱${originalPrice.toFixed(2)}</td>
        <td>${promoTypeDisplay}</td>
        <td>₱${promoData.promoPrice.toFixed(2)}${promoData.type === 'bundle' ? ' (per unit)' : ''}</td>
        <td><span class="status-badge status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
        <td>${formatDate(startDate)}</td>
        <td>${formatDate(endDate)}</td>
        <td>
          <button class="action-btn btn-secondary" data-action="edit" data-promo-id="${promoId}"><i class='bx bx-edit'></i></button>
          <button class="action-btn btn-danger" data-action="delete" data-promo-id="${promoId}"><i class='bx bx-trash'></i></button>
        </td>
      `;

      console.log(`Added promo to table: ID=${promoId}, Type=${promoData.type}, SellerId=${promoData.sellerId}`);

      row.querySelector('[data-action="edit"]').addEventListener('click', () => editPromo(promoId, promoData));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deletePromo(promoId, row));

      tableBody.appendChild(row);
    } catch (error) {
      console.error('Error adding promo to table:', error);
    }
  }

  async function editPromo(promoId, promoData) {
    try {
      console.log(`Editing promo: ${promoId}`);
      modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Product Promotion';
      submitButton.innerHTML = '<i class="bx bx-check"></i> Update Promotion';
      document.getElementById('promoId').value = promoId;

      if (productsUnsubscribe) productsUnsubscribe();
      setupProductsForPromoListener();

      document.getElementById('promoProduct').value = promoData.productId;
      const productPrice = getProductPrice(promoData.productId);
      document.getElementById('originalPrice').value = productPrice.toFixed(2);

      const promoTypeSelect = document.getElementById('promoType');
      promoTypeSelect.value = promoData.type || 'percentage';
      onPromoTypeChange();

      if (promoData.type === 'percentage') {
        document.getElementById('discountPercentage').value = promoData.discountPercentage || '';
      } else if (promoData.type === 'bundle') {
        document.getElementById('quantity').value = promoData.quantity || '';
        document.getElementById('fixedPrice').value = promoData.fixedPrice ? promoData.fixedPrice.toFixed(2) : '';
      }

      document.getElementById('promoPrice').value = promoData.promoPrice ? promoData.promoPrice.toFixed(2) : '';

      const startDate = promoData.startDate.toDate ? promoData.startDate.toDate() : new Date(promoData.startDate);
      const endDate = promoData.endDate.toDate ? promoData.endDate.toDate() : new Date(promoData.endDate);

      document.getElementById('promoStartDate').value = startDate.toISOString().slice(0, 16);
      document.getElementById('promoEndDate').value = endDate.toISOString().slice(0, 16);

      createPromoModal.classList.add('active');
    } catch (error) {
      console.error('Error loading promo for edit:', error);
      alert('Failed to load promo for editing. Please try again.');
    }
  }

  async function deletePromo(promoId, row) {
    const confirmDelete = confirm('Are you sure you want to delete this promotion?');
    if (!confirmDelete) {
      console.log('Deletion cancelled by user');
      return;
    }

    try {
      await deleteDoc(doc(db, 'promos', promoId));
      row.remove();
      console.log(`Promo ${promoId} deleted successfully`);
      alert('Promotion deleted successfully.');
    } catch (error) {
      console.error('Error deleting promo:', error);
      alert('Failed to delete promo. Please try again.');
    }
  }

  function formatDate(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Initial setup
  setupProductsForPromoListener();
  setupPromosListener('active');
});