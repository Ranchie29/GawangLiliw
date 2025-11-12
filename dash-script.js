// Updated import - get everything from the v10 config
import { 
  db, 
  auth, 
  signOut,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  startAfter
} from './firebase-config.js';

// ========== Global Variables ==========
let salesChart = null;
let revenueChart = null;
let initialAdminLoad = true;
let isDashboardInitialized = false;
let lastVisibleUser = null;
let usersPerPage = 10;
let currentPage = 1;
let totalUsersCount = 0;

function generateUniqueColors(count) {
  // Predefined palette of distinct, accessible colors (optimized for light/dark themes)
  const predefinedColors = [
     '#FF6B6B',
     '#F564A9',
     '#799EFF',
     '#FFB22C',
     '#78C841',
     '#FF9B17',
     '#DE3163',
     '#921A40',
  ];

  const colors = [];
  for (let i = 0; i < count; i++) {
    if (i < predefinedColors.length) {
      // Use predefined color for the first 10 stores
      colors.push(predefinedColors[i]);
    } else {
      // Fallback to HSL for additional stores
      const hue = (i * 360 / count) % 360; // Spread hues evenly
      const saturation = 70 + (i % 3) * 10; // Vary saturation slightly (70%, 80%, 90%)
      const lightness = 50 + (i % 2) * 10; // Vary lightness slightly (50%, 60%)
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
  }
  return colors;
}
// ========== UI Initialization ==========
function initializeUI() {
  const mobileMenuButton = document.getElementById('mobile-menu-button');
  const sidebar = document.getElementById('sidebar');
  let backdrop = document.querySelector('.backdrop');

  // Create backdrop if it doesn't exist
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    document.body.appendChild(backdrop);
  }

  if (mobileMenuButton && sidebar) {
    mobileMenuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('show');
      backdrop.classList.toggle('show');
      console.log('Mobile menu toggled:', sidebar.classList.contains('show') ? 'Opened' : 'Closed');
    });

    // Close sidebar when clicking on backdrop
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('show');
      backdrop.classList.remove('show');
      console.log('Backdrop clicked, sidebar closed');
    });

    // Close sidebar when clicking on nav links
    const navLinks = sidebar.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('show');
        backdrop.classList.remove('show');
        console.log('Nav link clicked, sidebar closed');
      });
    });
  } else {
    console.warn('Mobile menu button or sidebar not found:', {
      mobileMenuButton: !!mobileMenuButton,
      sidebar: !!sidebar
    });
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  

  const pendingCard = document.querySelector('#Pending');
  if (pendingCard) {
    pendingCard.closest('.metric-card').addEventListener('click', () => {
      window.location.href = 'store.html#seller-requests';
    });
  }

  const approvedCard = document.querySelector('#seller-approveds');
  if (approvedCard) {
    approvedCard.closest('.metric-card').addEventListener('click', () => {
      window.location.href = 'store.html#seller-history';
    });
  }

  const notificationBtn = document.getElementById('notification-button');
  const notificationContent = document.getElementById('notification-content');

  if (notificationBtn && notificationContent) {
    notificationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notificationContent.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!notificationContent.contains(e.target) && e.target !== notificationBtn) {
        notificationContent.classList.remove('open');
      }
    });
  }

  const totalUsersCard = document.querySelector('.metric-card:has(#total-users)');
  if (totalUsersCard) {
    totalUsersCard.addEventListener('click', () => {
      showUsersModal();
    });
  }

  // Logout button
  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) {
    // Remove any existing listeners to be safe
    logoutButton.replaceWith(logoutButton.cloneNode(true));
    const newLogoutButton = document.getElementById("logoutButton");
    newLogoutButton.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Logout button clicked"); // Debug log
      logout();
    });
  } else {
    console.error("Logout button not found in DOM"); // Debug log
  }

  initializeSalesTabs();
}

// ========== Toast Notification Functions ==========
function showSuccessMessage(message) {
  let successMsg = document.querySelector(".success-message");
  if (!successMsg) {
    successMsg = document.createElement("div");
    successMsg.className = "success-message alert alert-success";
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

function showErrorMessage(message) {
  let errorMsg = document.querySelector(".error-message");
  if (!errorMsg) {
    errorMsg = document.createElement("div");
    errorMsg.className = "error-message alert alert-danger";
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

// ========== Logout Function ==========
window.logout = function () {
  console.log("Logout function triggered"); // Debug log

  // Check if Bootstrap is loaded
  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error("Bootstrap Modal is not available. Ensure Bootstrap JS is loaded.");
    showErrorMessage("Failed to display logout modal: Bootstrap is not loaded.");
    return;
  }

  // Check if modal already exists
  let modalElement = document.getElementById('logoutConfirmModal');
  let modal;

  if (modalElement) {
    // If modal exists, get its instance and show it
    modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("Existing logout modal found and reused"); // Debug log
  } else {
    // Create new modal
    const modalHTML = `
      <div class="modal fade" id="logoutConfirmModal" tabindex="-1" aria-labelledby="logoutConfirmModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="logoutConfirmModalLabel">Confirm Logout</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p>Are you sure you want to log out?</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelLogoutBtn" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirmLogoutBtn">Log Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log("Logout modal HTML added to DOM"); // Debug log

    modalElement = document.getElementById('logoutConfirmModal');
    if (!modalElement) {
      console.error("Logout modal element not found in DOM after creation");
      showErrorMessage("Failed to display logout modal: Modal element not found.");
      return;
    }

    // Initialize modal
    modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: true });
    console.log("New logout modal created and initialized"); // Debug log
  }

  try {
    // Show the modal
    modal.show();

    const confirmBtn = document.getElementById('confirmLogoutBtn');
    const cancelBtn = document.getElementById('cancelLogoutBtn');

    if (!confirmBtn || !cancelBtn) {
      console.error("Logout buttons not found");
      showErrorMessage("Failed to display logout modal: Buttons not found.");
      modal.hide();
      return;
    }

    // Clear any existing listeners to prevent duplicates
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));

    // Re-select buttons after cloning
    const newConfirmBtn = document.getElementById('confirmLogoutBtn');
    const newCancelBtn = document.getElementById('cancelLogoutBtn');

    // Handle confirm logout
    newConfirmBtn.addEventListener('click', async function handler() {
      console.log("Confirm logout button clicked"); // Debug log
      newConfirmBtn.disabled = true;
      newConfirmBtn.textContent = 'Logging out...';

      try {
        await signOut(auth);
        console.log("User signed out successfully"); // Debug log
        
        modal.hide();
        modalElement.remove(); // Remove modal from DOM after logout
        window.location.href = 'index.html';
      } catch (error) {
        console.error('Error during logout:', error);
        showErrorMessage('Failed to log out: ' + error.message);
        newConfirmBtn.disabled = false;
        newConfirmBtn.textContent = 'Log Out';
      }
    });

    // Handle cancel button
    newCancelBtn.addEventListener('click', function handler() {
      console.log("Cancel logout button clicked"); // Debug log
      modal.hide();
      // Remove modal from DOM after cancel
      modalElement.remove();
    });

    // Handle modal hidden event to clean up
    modalElement.addEventListener('hidden.bs.modal', function handler() {
      console.log("Logout modal hidden, cleaning up"); // Debug log
      modal.dispose(); // Dispose of the modal instance
      modalElement.remove(); // Remove modal from DOM
    }, { once: true });

  } catch (error) {
    console.error("Error displaying logout modal:", error);
    showErrorMessage("Failed to display logout modal: " + error.message);
    if (modalElement) {
      modalElement.remove(); // Clean up on error
    }
  }
};

// ========== Users Modal Functionality ==========
async function showUsersModal() {
  const modal = document.getElementById('usersModal');
  if (!modal) {
    console.error('Users modal element not found');
    return;
  }

  // Reset pagination
  currentPage = 1;
  lastVisibleUser = null;
  
  // Show modal
  modal.style.display = 'block';
  
  // Fetch initial page of users
  await fetchUsersPage(currentPage);
}

async function fetchUsersPage(page) {
  const userList = document.getElementById('userList');
  const paginationInfo = document.getElementById('paginationInfo');
  if (!userList || !paginationInfo) {
    console.error('User list or pagination info element not found');
    return;
  }

  try {
    userList.innerHTML = '<li class="text-center">Loading...</li>';

    const usersRef = collection(db, 'users');
    let usersQuery = query(usersRef, orderBy('username'), limit(usersPerPage)); // Use 'username' as a fallback
    if (page > 1 && lastVisibleUser) {
      usersQuery = query(usersRef, orderBy('username'), startAfter(lastVisibleUser), limit(usersPerPage));
    }

    const usersSnap = await getDocs(usersQuery);
    console.log('Query snapshot size:', usersSnap.size, 'Docs:', usersSnap.docs.map(doc => doc.data()));
    const users = [];
    usersSnap.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    lastVisibleUser = usersSnap.docs[usersSnap.docs.length - 1];

    userList.innerHTML = '';
    if (users.length === 0) {
      userList.innerHTML = '<li class="text-center text-muted">No users found</li>';
    } else {
      users.forEach(user => {
        const createdAt = user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : 'No date';
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
          <div class="user-details">
            <div><strong>${user.username || 'Unknown User'}</strong></div>
            <div>Email: ${user.email || 'N/A'}</div>
            <div>Gender: ${user.gender || 'N/A'}</div>
            <div>Phone: ${user.phone || 'N/A'}</div>
            <small class="text-muted">Joined: ${createdAt}</small>
          </div>
        `;
        userList.appendChild(li);
      });
    }

    const start = (page - 1) * usersPerPage + 1;
    const end = Math.min(page * usersPerPage, totalUsersCount);
    paginationInfo.textContent = `Showing ${start} to ${end} of ${totalUsersCount} users`;

    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn && nextBtn) {
      prevBtn.disabled = page === 1;
      nextBtn.disabled = users.length < usersPerPage || end >= totalUsersCount;
    }

    console.log(`Fetched page ${page} with ${users.length} users`);

  } catch (error) {
    console.error('Error fetching users:', error);
    userList.innerHTML = '<li class="text-center text-danger">Error loading users</li>';
  }
}

function setupModalEvents() {
  const modal = document.getElementById('usersModal');
  const closeBtn = document.querySelector('.modal-close');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      if (currentPage > 1) {
        currentPage--;
        await fetchUsersPage(currentPage);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      if (currentPage * usersPerPage < totalUsersCount) {
        currentPage++;
        await fetchUsersPage(currentPage);
      }
    });
  }

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
}

// ========== Sales Period Tabs ==========
function initializeSalesTabs() {
  const tabsContainer = document.getElementById('sales-tabs');
  const yearSelect = document.getElementById('year-select');
  const monthSelect = document.getElementById('month-select');
  const weekSelect = document.getElementById('week-select');
  if (!tabsContainer || !yearSelect || !monthSelect || !weekSelect) {
    console.warn('Sales tabs or filter elements not found', {
      tabsContainer: !!tabsContainer,
      yearSelect: !!yearSelect,
      monthSelect: !!monthSelect,
      weekSelect: !!weekSelect
    });
    return;
  }

  // Populate year dropdown
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let year = currentYear - 5; year <= currentYear; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
  yearSelect.value = currentYear.toString();

  const tabs = tabsContainer.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const period = tab.getAttribute('data-period');

      yearSelect.style.display = period === 'yearly' ? 'inline-block' : 'inline-block';
      monthSelect.style.display = period === 'monthly' || period === 'weekly' ? 'inline-block' : 'none';
      weekSelect.style.display = period === 'weekly' ? 'inline-block' : 'none';

      const selectedYear = yearSelect.value ? parseInt(yearSelect.value) : currentYear;
      const selectedMonth = monthSelect.value ? parseInt(monthSelect.value) : null;
      const selectedWeek = weekSelect.value ? parseInt(weekSelect.value) : null;

      console.log('Selected period:', period, 'Year:', selectedYear, 'Month:', selectedMonth, 'Week:', selectedWeek);
      updateRevenueCharts(period, selectedYear, selectedMonth, selectedWeek);
    });
  });

  const updateOnFilterChange = () => {
    const activeTab = tabsContainer.querySelector('.tab.active');
    const period = activeTab.getAttribute('data-period');
    const selectedYear = yearSelect.value ? parseInt(yearSelect.value) : currentYear;
    const selectedMonth = monthSelect.value ? parseInt(monthSelect.value) : null;
    const selectedWeek = weekSelect.value ? parseInt(weekSelect.value) : null;
    updateRevenueCharts(period, selectedYear, selectedMonth, selectedWeek);
  };

  yearSelect.addEventListener('change', updateOnFilterChange);
  monthSelect.addEventListener('change', () => {
    updateWeekDropdown(yearSelect.value, monthSelect.value);
    updateOnFilterChange();
  });
  weekSelect.addEventListener('change', updateOnFilterChange);

  console.log('Sales tabs and filters initialized');
}

function updateWeekDropdown(selectedYear, selectedMonth) {
  const weekSelect = document.getElementById('week-select');
  if (!weekSelect || selectedMonth === '') return;

  const year = selectedYear ? parseInt(selectedYear) : new Date().getFullYear();
  const month = parseInt(selectedMonth);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil(lastDay / 7);

  weekSelect.innerHTML = '<option value="">Select Week</option>';
  for (let i = 1; i <= weeks; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Week ${i}`;
    weekSelect.appendChild(option);
  }
}

// ========== CSS Variables ==========
function getCSSVariables() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue('--primary').trim() || '#007bff',
    info: styles.getPropertyValue('--info').trim() || '#17a2b8',
    success: styles.getPropertyValue('--success').trim() || '#28a745',
    danger: styles.getPropertyValue('--danger').trim() || '#dc3545',
    warning: styles.getPropertyValue('--warning').trim() || '#ffc107',
    textPrimary: styles.getPropertyValue('--text-primary').trim() || '#333'
  };
}

// ========== Charts Initialization ==========
function initializeCharts() {
  const colors = getCSSVariables();
  
  const salesChartCanvas = document.getElementById('sales-chart');
  if (salesChartCanvas && typeof Chart !== 'undefined') {
    try {
      if (salesChart) {
        salesChart.destroy();
        salesChart = null;
        console.log('Destroyed existing sales chart');
      }
      
      const salesChartCtx = salesChartCanvas.getContext('2d');
      salesChart = new Chart(salesChartCtx, {
        type: 'bar',
        data: {
          labels: ['Loading...'],
          datasets: [{
            label: 'Revenue',
            data: [0],
            backgroundColor: colors.primary,
            borderRadius: 4,
            barThickness: 30,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { 
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return '₱' + value.toLocaleString();
                }
              }
            },
            x: { 
              grid: { display: false },
              ticks: {
                callback: function(value, index, values) {
                  const label = this.getLabelForValue(value);
                  if (label.match(/^\d{4}-\d{2}$/)) {
                    const [year, month] = label.split('-');
                    return new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
                  }
                  return label;
                }
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff',
              titleColor: colors.textPrimary,
              bodyColor: colors.textPrimary,
              borderColor: '#DBEEF7',
              borderWidth: 1,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: context => `Revenue: ₱${context.raw.toLocaleString()}`
              }
            }
          }
        }
      });
      console.log('Sales chart initialized successfully');
    } catch (error) {
      console.error('Error initializing sales chart:', error);
    }
  } else {
    console.warn('Sales chart canvas not found or Chart.js not loaded');
  }

  const revenueChartCanvas = document.getElementById('revenue-chart');
  if (revenueChartCanvas && typeof Chart !== 'undefined') {
    try {
      if (revenueChart) {
        revenueChart.destroy();
        revenueChart = null;
        console.log('Destroyed existing order count chart');
      }
      
      const revenueChartCtx = revenueChartCanvas.getContext('2d');
      revenueChart = new Chart(revenueChartCtx, {
        type: 'doughnut',
        data: {
          labels: ['Loading...'],
          datasets: [{
            data: [1],
            backgroundColor: ['#e9ecef'],
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { 
                font: { size: 12 },
                filter: function(legendItem) {
                  return legendItem.text !== 'Loading...' && legendItem.text !== 'No Data';
                }
              }
            },
            tooltip: {
              backgroundColor: '#fff',
              titleColor: colors.textPrimary,
              bodyColor: colors.textPrimary,
              borderColor: '#DBEEF7',
              borderWidth: 1,
              cornerRadius: 8,
              displayColors: false,
              filter: function(tooltipItem) {
                return tooltipItem.label !== 'Loading...' && tooltipItem.label !== 'No Data';
              },
              callbacks: {
                label: context => {
                  if (context.label === 'Loading...' || context.label === 'No Data') {
                    return context.label;
                  }
                  return `${context.label}: ${context.raw.toLocaleString()} orders`;
                }
              }
            }
          }
        }
      });
      console.log('Order count chart initialized successfully');
    } catch (error) {
      console.error('Error initializing order count chart:', error);
    }
  } else {
    console.warn('Order count chart canvas not found or Chart.js not loaded');
  }
}

// ========== Date Filter Utilities ==========
function getDateRange(period, selectedYear = null, selectedMonth = null, selectedWeek = null) {
  const now = new Date();
  const startDate = new Date();
  const endDate = new Date();
  const year = selectedYear || now.getFullYear();

  switch (period) {
    case 'yearly':
      if (selectedYear) {
        startDate.setFullYear(selectedYear, 0, 1);
        endDate.setFullYear(selectedYear, 11, 31);
      } else {
        startDate.setFullYear(now.getFullYear() - 5);
        endDate.setTime(now.getTime());
      }
      break;
    case 'monthly':
      const month = selectedMonth !== null ? selectedMonth : now.getMonth();
      startDate.setFullYear(year, month, 1);
      endDate.setFullYear(year, month + 1, 0);
      break;
    case 'weekly':
      const selectedMonthForWeek = selectedMonth !== null ? selectedMonth : now.getMonth();
      startDate.setFullYear(year, selectedMonthForWeek, 1);
      endDate.setFullYear(year, selectedMonthForWeek + 1, 0);
      if (selectedWeek) {
        const weekStartDay = (selectedWeek - 1) * 7 + 1;
        const weekEndDay = Math.min(weekStartDay + 6, endDate.getDate());
        startDate.setDate(weekStartDay);
        endDate.setDate(weekEndDay);
      }
      break;
    default:
      startDate.setFullYear(year, now.getMonth(), 1);
      endDate.setFullYear(year, now.getMonth() + 1, 0);
  }

  return { startDate, endDate };
}

function isOrderInDateRange(order, startDate, endDate) {
  let orderDate;
  
  if (order.createdAt) {
    orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
  } else if (order.timestamp) {
    orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
  } else if (order.date) {
    orderDate = order.date.toDate ? order.date.toDate() : new Date(order.date);
  } else if (order.orderDate) {
    orderDate = order.orderDate.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
  } else {
    return true;
  }
  
  return orderDate >= startDate && orderDate <= endDate;
}
async function fetchStoreOrderCounts(period = 'weekly', selectedYear = null, selectedMonth = null, selectedWeek = null) {
  try {
    console.log(`Fetching store order counts for ${period} period...`);
    
    const { startDate, endDate } = getDateRange(period, selectedYear, selectedMonth, selectedWeek);
    console.log(`Date range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    
    const ordersRef = collection(db, 'orders');
    const ordersQuery = query(
      ordersRef,
      where("status", "==", "Completed") // Fixed query syntax for completed orders
    );
    
    const [ordersSnap, staffSnap] = await Promise.all([
      getDocs(ordersQuery),
      getDocs(collection(db, 'admin'))
    ]);

    const storeMap = new Map();
    staffSnap.forEach(doc => {
      const data = doc.data();
      if (data.role === 'staff') {
        storeMap.set(doc.id, {
          id: doc.id,
          name: data.shopName || data.name || data.username || 'Unknown Store',
          approved: data.approved || false
        });
      }
    });

    console.log('Found stores:', storeMap.size);

    const timeOrderCount = new Map();
    let totalOrdersProcessed = 0;
    let ordersWithoutSeller = 0;
    let ordersOutsideRange = 0;

    ordersSnap.forEach(doc => {
      const order = doc.data();
      
      if (!isOrderInDateRange(order, startDate, endDate)) {
        ordersOutsideRange++;
        return;
      }
      
      const sellerId = order.sellerId;
      if (!sellerId) {
        ordersWithoutSeller++;
        return;
      }

      let timeKey;
      const orderDate = order.timestamp ? new Date(order.timestamp) : new Date();
      
      if (period === 'yearly') {
        timeKey = selectedYear ? `Stores in ${selectedYear}` : orderDate.getFullYear().toString();
      } else if (period === 'monthly') {
        timeKey = selectedMonth !== null 
          ? new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })
          : `${orderDate.getFullYear()}-${(orderDate.getMonth() + 1).toString().padStart(2, '0')}`;
      } else if (period === 'weekly') {
        if (selectedWeek) {
          timeKey = `Week ${selectedWeek}`;
        } else {
          const firstDayOfMonth = new Date(orderDate.getFullYear(), orderDate.getMonth(), 1);
          const daysSinceFirst = Math.floor((orderDate - firstDayOfMonth) / (1000 * 60 * 60 * 24));
          const weekNumber = Math.floor(daysSinceFirst / 7) + 1;
          timeKey = `Week ${weekNumber}`;
        }
      }

      if (!timeOrderCount.has(timeKey)) {
        timeOrderCount.set(timeKey, new Map());
      }
      const storeOrderCount = timeOrderCount.get(timeKey);
      const currentOrderCount = storeOrderCount.get(sellerId) || 0;
      storeOrderCount.set(sellerId, currentOrderCount + 1); // Increment order count
      totalOrdersProcessed++;
    });

    console.log(`Processed ${totalOrdersProcessed} orders for ${period}`);
    console.log(`Orders outside date range: ${ordersOutsideRange}`);
    console.log(`Orders without seller: ${ordersWithoutSeller}`);

    return {
      storeMap,
      timeOrderCount,
      totalOrdersProcessed,
      ordersWithoutSeller,
      period
    };

  } catch (error) {
    console.error('Error fetching store order counts:', error);
    return {
      storeMap: new Map(),
      timeOrderCount: new Map(),
      totalOrdersProcessed: 0,
      ordersWithoutSeller: 0,
      period
    };
  }
}

// ========== Fetch Store Sales Data ==========
async function fetchStoreSalesData(period = 'weekly', selectedYear = null, selectedMonth = null, selectedWeek = null) {
  try {
    console.log(`Fetching store sales data for ${period} period...`);
    
    const { startDate, endDate } = getDateRange(period, selectedYear, selectedMonth, selectedWeek);
    console.log(`Date range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    
    const ordersRef = collection(db, 'orders');
    // If you need to match "Completed" OR "completed"
const ordersQuery = query(
  ordersRef,
  where("status", "in", ["Completed", "completed"])
);
    
    const [ordersSnap, staffSnap] = await Promise.all([
      getDocs(ordersQuery),
      getDocs(collection(db, 'admin'))
    ]);

    const storeMap = new Map();
    staffSnap.forEach(doc => {
      const data = doc.data();
      if (data.role === 'staff') {
        storeMap.set(doc.id, {
          id: doc.id,
          name: data.shopName || data.name || data.username || 'Unknown Store',
          approved: data.approved || false
        });
      }
    });

    console.log('Found stores:', storeMap.size);

    const timeRevenue = new Map();
    const timeOrderCount = new Map(); // New map to track order counts
    let totalOrdersProcessed = 0;
    let ordersWithoutSeller = 0;
    let ordersOutsideRange = 0;

    ordersSnap.forEach(doc => {
      const order = doc.data();
      
      if (!isOrderInDateRange(order, startDate, endDate)) {
        ordersOutsideRange++;
        return;
      }
      
      const sellerId = order.sellerId;
      const amount = parseFloat(order.totalAmount || 0);

      if (!sellerId) {
        ordersWithoutSeller++;
        return;
      }

      if (isNaN(amount) || amount <= 0) {
        return;
      }

      let timeKey;
      const orderDate = order.timestamp ? new Date(order.timestamp) : new Date();
      
      if (period === 'yearly') {
        timeKey = selectedYear ? `Stores in ${selectedYear}` : orderDate.getFullYear().toString();
      } else if (period === 'monthly') {
        timeKey = selectedMonth !== null 
          ? new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })
          : `${orderDate.getFullYear()}-${(orderDate.getMonth() + 1).toString().padStart(2, '0')}`;
      } else if (period === 'weekly') {
        if (selectedWeek) {
          timeKey = `Week ${selectedWeek}`;
        } else {
          const firstDayOfMonth = new Date(orderDate.getFullYear(), orderDate.getMonth(), 1);
          const daysSinceFirst = Math.floor((orderDate - firstDayOfMonth) / (1000 * 60 * 60 * 24));
          const weekNumber = Math.floor(daysSinceFirst / 7) + 1;
          timeKey = `Week ${weekNumber}`;
        }
      }

      if (!timeRevenue.has(timeKey)) {
        timeRevenue.set(timeKey, new Map());
        timeOrderCount.set(timeKey, new Map()); // Initialize order count map
      }
      const storeRevenue = timeRevenue.get(timeKey);
      const storeOrderCount = timeOrderCount.get(timeKey);
      const currentRevenue = storeRevenue.get(sellerId) || 0;
      const currentOrderCount = storeOrderCount.get(sellerId) || 0;
      storeRevenue.set(sellerId, currentRevenue + amount);
      storeOrderCount.set(sellerId, currentOrderCount + 1); // Increment order count
      totalOrdersProcessed++;
    });

    console.log(`Processed ${totalOrdersProcessed} orders for ${period}`);
    console.log(`Orders outside date range: ${ordersOutsideRange}`);
    console.log(`Orders without seller: ${ordersWithoutSeller}`);

    return {
      storeMap,
      timeRevenue,
      timeOrderCount, // Return order count data
      totalOrdersProcessed,
      ordersWithoutSeller,
      period
    };

  } catch (error) {
    console.error('Error fetching store sales data:', error);
    return {
      storeMap: new Map(),
      timeRevenue: new Map(),
      timeOrderCount: new Map(),
      totalOrdersProcessed: 0,
      ordersWithoutSeller: 0,
      period
    };
  }
}

// ========== Update Revenue Charts ==========
// ... (Previous code remains unchanged until updateRevenueCharts function)

async function updateRevenueCharts(period = 'weekly', selectedYear = null, selectedMonth = null, selectedWeek = null) {
  if (!salesChart || !revenueChart) {
    console.warn('Charts not initialized yet');
    return;
  }

  try {
    console.log(`Updating revenue and order percentage charts for ${period} period...`, { selectedYear, selectedMonth, selectedWeek });
    
    // Fetch data for sales chart (revenue) and order count chart separately
    const salesData = await fetchStoreSalesData(period, selectedYear, selectedMonth, selectedWeek);
    const orderCountData = await fetchStoreOrderCounts(period, selectedYear, selectedMonth, selectedWeek);
    const { storeMap: salesStoreMap, timeRevenue } = salesData;
    const { storeMap: orderStoreMap, timeOrderCount } = orderCountData;

    // Update Sales Chart (Revenue) - Unchanged
    if (timeRevenue.size === 0) {
      console.warn('No sales data found');
      salesChart.data.labels = ['No Data'];
      salesChart.data.datasets[0].data = [0];
      salesChart.update();
    } else {
      const colors = getCSSVariables();
      const periodTitle = period.charAt(0).toUpperCase() + period.slice(1);

      const timeLabels = Array.from(timeRevenue.keys()).sort();
      const allStoreRevenue = [];

      timeLabels.forEach(timeKey => {
        const storeRevenue = timeRevenue.get(timeKey);
        let total = 0;
        salesStoreMap.forEach((_, storeId) => {
          total += storeRevenue.get(storeId) || 0;
        });
        allStoreRevenue.push(total);
      });

      salesChart.data.labels = timeLabels;
      salesChart.data.datasets[0].data = allStoreRevenue;
      salesChart.data.datasets[0].label = `${periodTitle} Revenue`;
      
      const barColors = allStoreRevenue.map((_, index) => {
        const colorKeys = ['primary', 'info', 'success', 'danger', 'warning'];
        return colors[colorKeys[index % colorKeys.length]];
      });
      salesChart.data.datasets[0].backgroundColor = barColors;
      
      salesChart.options.plugins.tooltip.callbacks.label = function(context) {
        return `${periodTitle} Revenue: ₱${context.raw.toLocaleString()}`;
      };

      salesChart.options.scales.x.ticks.callback = function(value, index, values) {
        const label = this.getLabelForValue(value);
        if (period === 'monthly' && !selectedMonth && label.match(/^\d{4}-\d{2}$/)) {
          const [year, month] = label.split('-');
          return new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
        }
        return label;
      };
      
      salesChart.update();
      console.log(`Bar chart updated with ${timeLabels.length} time periods for ${period}`);
    }

    // Update Order Percentage Chart (with Order Counts)
    if (timeOrderCount.size === 0) {
      console.warn('No order count data found');
      revenueChart.data.labels = ['No Data'];
      revenueChart.data.datasets[0].data = [1];
      revenueChart.data.datasets[0].backgroundColor = ['#e9ecef'];
      revenueChart.update();
    } else {
      const colors = getCSSVariables();
      const periodTitle = period.charAt(0).toUpperCase() + period.slice(1);

      // Calculate total orders across all stores for the period
      const totalStoreOrderCount = new Map();
      let totalOrders = 0;
      orderStoreMap.forEach((store, storeId) => {
        let storeTotal = 0;
        timeOrderCount.forEach(storeOrderCount => {
          storeTotal += storeOrderCount.get(storeId) || 0;
        });
        totalStoreOrderCount.set(storeId, storeTotal);
        totalOrders += storeTotal;
      });

      // Calculate percentages and retain raw order counts for top 5 stores
      const storesWithOrders = Array.from(totalStoreOrderCount.entries())
        .filter(([_, orderCount]) => orderCount > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (storesWithOrders.length === 0 || totalOrders === 0) {
        revenueChart.data.labels = [`No ${periodTitle} Orders`];
        revenueChart.data.datasets[0].data = [1];
        revenueChart.data.datasets[0].backgroundColor = ['#e9ecef'];
      } else {
        const topStoreNames = storesWithOrders.map(([storeId, _]) => 
          orderStoreMap.get(storeId)?.name || 'Unknown Store'
        );
        const topStoreOrderCounts = storesWithOrders.map(([_, orderCount]) => orderCount);
        // Calculate percentages (rounded to 2 decimal places)
        const topStorePercentages = topStoreOrderCounts.map(orderCount => 
          Number(((orderCount / totalOrders) * 100).toFixed(2))
        );

        // Ensure percentages sum to 100 by adjusting the largest percentage if needed
        const currentSum = topStorePercentages.reduce((sum, percentage) => sum + percentage, 0);
        if (currentSum !== 100 && topStorePercentages.length > 0) {
          const adjustment = 100 - currentSum;
          const maxIndex = topStorePercentages.indexOf(Math.max(...topStorePercentages));
          topStorePercentages[maxIndex] = Number((topStorePercentages[maxIndex] + adjustment).toFixed(2));
        }

        // Generate unique colors for each store
        const storeColors = generateUniqueColors(storesWithOrders.length);
        
        revenueChart.data.labels = topStoreNames;
        revenueChart.data.datasets[0].data = topStorePercentages;
        revenueChart.data.datasets[0].backgroundColor = storeColors;
        // Store raw order counts as a custom property for use in tooltips and legend
        revenueChart.data.datasets[0].rawOrderCounts = topStoreOrderCounts;
      }

      revenueChart.options.plugins.tooltip.callbacks.label = function(context) {
        if (context.label.includes('No') && context.label.includes('Orders')) {
          return context.label;
        }
        const percentage = context.raw;
        const orderCount = context.dataset.rawOrderCounts[context.dataIndex] || 0;
        return `Product sold: ${percentage}% (${orderCount.toLocaleString()} orders)`;
      };

      revenueChart.options.plugins.legend.labels.generateLabels = function(chart) {
        const data = chart.data;
        if (data.labels.length && data.datasets.length) {
          return data.labels.map((label, i) => {
            if (label.includes('No') && label.includes('Orders')) {
              return {
                text: label,
                fillStyle: data.datasets[0].backgroundColor[i],
                hidden: false,
                index: i
              };
            }
            const percentage = data.datasets[0].data[i];
            const orderCount = data.datasets[0].rawOrderCounts[i] || 0;
            return {
              text: `${label}: ${percentage}% `,
              fillStyle: data.datasets[0].backgroundColor[i],
              hidden: false,
              index: i
            };
          });
        }
        return [];
      };

      revenueChart.update();
      console.log(`Doughnut chart updated with ${revenueChart.data.labels.length} top stores for ${period} order percentages and counts`);
    }

  } catch (error) {
    console.error("Error updating charts:", error);
  }
}

// ... (Rest of the original code remains unchanged)


// ========== Fetch Approved Seller Accounts ==========
async function fetchApprovedSellerAccounts() {
  const approvedElement = document.getElementById("seller-approveds");

  if (!approvedElement) {
    console.error("Missing approved seller accounts element");
    return;
  }

  try {
    console.log('Setting up real-time listener for approved seller accounts...');
    const adminRef = collection(db, 'admin');
    const approvedQuery = query(
      adminRef,
      where("role", "==", "staff"),
      where("approved", "==", true)
    );

    onSnapshot(approvedQuery, (approvedSnap) => {
      const approvedCount = approvedSnap.size;
      approvedElement.textContent = approvedCount.toLocaleString();
      console.log(`Approved seller accounts: ${approvedCount}`);
    });

  } catch (error) {
    console.error("Error fetching approved seller accounts:", error);
    approvedElement.textContent = "—";
  }
}

// ========== Fetch Account Approval Metrics ==========
async function fetchAccountApprovalMetrics() {
  const pendingElement = document.getElementById("Pending");

  if (!pendingElement) {
    console.error("Missing pending accounts element");
    return;
  }

  try {
    console.log('Setting up real-time listener for pending accounts...');
    const adminRef = collection(db, 'admin');
    const pendingQuery = query(
      adminRef,
      where("role", "==", "staff"),
      where("approved", "==", false)
    );

    onSnapshot(pendingQuery, (pendingSnap) => {
      let pendingCount = 0;
      pendingSnap.forEach(doc => {
        const data = doc.data();
        if (!data.rejectedAt) {
          pendingCount++;
        }
      });
      pendingElement.textContent = pendingCount.toLocaleString();
      console.log(`Pending accounts (not rejected): ${pendingCount}`);
    });

  } catch (error) {
    console.error("Error fetching pending accounts:", error);
    pendingElement.textContent = "—";
  }
}

// ========== Dashboard Metrics ==========
async function fetchDashboardMetrics() {
  try {
    await Promise.all([
      fetchTotalUsers(),
      fetchAccountApprovalMetrics(),
      fetchApprovedSellerAccounts(),
    ]);

    console.log('Dashboard metrics updated successfully');

  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
  }
}

// ========== Fetch Total Users ==========
async function fetchTotalUsers() {
  const totalUsersElement = document.getElementById("total-users");
  
  if (!totalUsersElement) {
    console.error("Total users element not found");
    return;
  }

  try {
    console.log('Fetching total users...');
    
    const usersSnap = await getDocs(collection(db, 'users'));
    
    totalUsersCount = usersSnap.size;
    totalUsersElement.textContent = totalUsersCount.toLocaleString();
    
    console.log(`Total users: ${totalUsersCount}`);
    return totalUsersCount;
    
  } catch (error) {
    console.error("Error fetching total users:", error);
    totalUsersElement.textContent = "—";
    return 0;
  }
}
// Add these helper functions before fetchPendingNotifications
function isStaffPending(staff) {
  // Simple check - return true if it's a pending staff member
  return staff && staff.approved === false && !staff.rejectedAt;
}

function sortStaffData(staffArray, direction = 'desc') {
  return staffArray.sort((a, b) => {
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
    
    if (direction === 'desc') {
      return dateB - dateA;
    } else {
      return dateA - dateB;
    }
  });
}

function formatDate(timestamp) {
  if (!timestamp) return 'No date';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
// ========== Fetch and Render Notifications ==========
// ========== Fetch and Render Notifications ==========
async function fetchPendingNotifications() {
  const notifList = document.getElementById("notifList");
  const notifBadge = document.getElementById("notifBadge");
  const noNotif = document.getElementById("noNotif");

  if (!notifList || !notifBadge || !noNotif) {
    console.warn('Notification elements not found:', {
      notifList: !!notifList,
      notifBadge: !!notifBadge,
      noNotif: !!noNotif
    });
    return;
  }

  try {
    console.log('Setting up real-time listener for pending notifications...');
    const notifRef = collection(db, "admin");
    const notifQuery = query(
      notifRef,
      where("role", "==", "staff"),
      where("approved", "==", false)
    );

    onSnapshot(notifQuery, (querySnapshot) => {
      // Clear previous notification items (keep header, divider, and #noNotif)
      const items = notifList.querySelectorAll("li:not(.dropdown-header):not(hr):not(#noNotif)");
      items.forEach(item => item.remove());

      // Filter for pending notifications (not rejected)
      const pendingNotifications = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.rejectedAt && isStaffPending({ id: docSnap.id, ...data })) {
          pendingNotifications.push({
            id: docSnap.id,
            ...data
          });
        }
      });

      if (pendingNotifications.length === 0) {
        notifBadge.classList.add("d-none");
        noNotif.classList.remove("d-none");
        console.log('No pending seller requests found');
        return;
      }

      // Sort notifications by creation date (newest first)
      const sortedNotifications = sortStaffData(pendingNotifications, 'desc');

      let notifCount = 0;
      noNotif.classList.add("d-none");

      sortedNotifications.forEach((notification) => {
        const createdAt = formatDate(notification.createdAt);
        notifCount++;

        const li = document.createElement("li");
        li.innerHTML = `
          <a class="dropdown-item d-flex align-items-start gap-2" href="store.html?staffId=${notification.id}">
            <i class='bx bx-user-plus fs-4 text-warning'></i>
            <div>
              <div><strong>${notification.username || notification.shopName || "New Seller"}</strong> is requesting approval</div>
              <small class="text-muted">${createdAt}</small>
            </div>
          </a>
        `;
        notifList.appendChild(li);
      });

      notifBadge.classList.remove("d-none");
      notifBadge.textContent = notifCount.toString();
      console.log(`Rendered ${notifCount} pending seller requests in notifList`);
    }, (error) => {
      console.error("❌ Error in pending notification snapshot listener:", error);
      notifBadge.classList.add("d-none");
      noNotif.classList.remove("d-none");
    });

  } catch (error) {
    console.error("❌ Error setting up pending notifications listener:", error);
    notifBadge.classList.add("d-none");
    noNotif.classList.remove("d-none");
  }
}

// ========== Notification Dropdown ==========
window.toggleNotifDropdown = function () {
  document.getElementById("notifList").classList.toggle("show");
};

window.onclick = function (event) {
  const notifList = document.getElementById("notifList");
  if (!event.target.closest(".bx-bell") && !event.target.closest("#notifList")) {
    notifList?.classList.remove("show");
  }
};

// ========== Window Functions ==========
window.refreshDashboard = function() {
  console.log('Manually refreshing dashboard...');
  fetchDashboardMetrics();
  updateRevenueCharts();
  fetchPendingNotifications();
};

window.debugStoreSales = async function(period = 'weekly') {
  console.log(`=== DEBUGGING STORE SALES DATA (${period.toUpperCase()}) ===`);
  
  const { storeMap, storeRevenue, totalOrdersProcessed, ordersWithoutSeller } = await fetchStoreSalesData(period);
  
  console.log('Store Map:', Array.from(storeMap.entries()));
  console.log('Store Revenue:', Array.from(storeRevenue.entries()));
  console.log('Total Orders Processed:', totalOrdersProcessed);
  console.log('Orders Without Seller:', ordersWithoutSeller);
  
  const { startDate, endDate } = getDateRange(period);
  console.log(`Date Range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
  
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    console.log('Sample orders (first 5):');
    ordersSnap.docs.slice(0, 5).forEach(doc => {
      const data = doc.data();
      const orderDate = data.createdAt?.toDate ? data.createdAt.toDate() : 
                       data.timestamp?.toDate ? data.timestamp.toDate() : 
                       data.date?.toDate ? data.date.toDate() : 'No date';
      console.log({
        id: doc.id,
        sellerId: data.sellerId,
        staffId: data.staffId,
        userId: data.userId,
        totalPrice: data.totalPrice,
        total: data.total,
        amount: data.amount,
        price: data.price,
        date: orderDate
      });
    });
  } catch (error) {
    console.error('Error fetching sample orders:', error);
  }
  
  console.log('=== END DEBUG ===');
};

window.debugApprovedSellers = async function() {
  console.log('=== DEBUGGING APPROVED SELLER ACCOUNTS ===');
  
  try {
    const adminRef = collection(db, 'admin');
    const approvedQuery = query(
      adminRef,
      where("role", "==", "staff"),
      where("approved", "==", true)
    );
    const approvedSnap = await getDocs(approvedQuery);

    console.log('Approved seller accounts count:', approvedSnap.size);
    const approvedAccounts = [];
    approvedSnap.forEach(doc => {
      const data = doc.data();
      approvedAccounts.push({
        id: doc.id,
        name: data.name,
        username: data.username,
        role: data.role,
        approved: data.approved,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'No date'
      });
    });
    console.log('Approved seller accounts:', approvedAccounts);

  } catch (error) {
    console.error('Debug error:', error);
  }
  
  console.log('=== END DEBUG ===');
};

window.debugPendingSellers = async function() {
  console.log('=== DEBUGGING PENDING SELLER ACCOUNTS ===');
  try {
    const adminRef = collection(db, 'admin');
    const pendingQuery = query(
      adminRef,
      where("role", "==", "staff"),
      where("approved", "==", false)
    );
    const pendingSnap = await getDocs(pendingQuery);
    const pendingAccounts = [];
    pendingSnap.forEach(doc => {
      const data = doc.data();
      if (!data.rejectedAt) {
        pendingAccounts.push({
          id: doc.id,
          username: data.username || 'Unknown',
          shopName: data.shopName || 'Unknown Store',
          email: data.email,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'No date',
          rejectedAt: data.rejectedAt ? data.rejectedAt.toDate().toLocaleString() : 'Not rejected'
        });
      }
    });
    console.log('Pending seller accounts count (not rejected):', pendingAccounts.length);
    console.log('Pending seller accounts:', pendingAccounts);
  } catch (error) {
    console.error('Debug error:', error);
  }
  console.log('=== END DEBUG ===');
};

if (typeof window.viewStaffDetails === 'undefined') {
  window.viewStaffDetails = function(staffId) {
    console.log('Viewing staff details for:', staffId);
    if (typeof bootstrap !== 'undefined') {
      console.log('Opening staff details modal for:', staffId);
    } else {
      window.location.href = `store.html?staffId=${staffId}`;
    }
  };
}

// ========== Initialization ==========
async function initializeDashboard() {
  if (isDashboardInitialized) {
    console.log('Dashboard already initialized, skipping...');
    return;
  }
  isDashboardInitialized = true;
  
  console.log("Initializing dashboard...");
  
  try {
    initializeUI();
    setupModalEvents();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    initializeCharts();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await Promise.all([
      fetchDashboardMetrics(),
      updateRevenueCharts(),
      fetchPendingNotifications()
    ]);
    
    console.log("Dashboard initialized successfully");
    
  } catch (error) {
    console.error("Error initializing dashboard:", error);
  }
}

// ========== Init ==========
function setupDashboard() {
  if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('User authenticated, initializing dashboard...');
        initializeDashboard();
        // Fixed: Changed fetchNotifications to fetchPendingNotifications
        setInterval(fetchPendingNotifications, 30000);  // ← Correct function name
      } else {
        console.log('User not authenticated');
        window.location.href = 'index.html'; // Redirect to login if not authenticated
      }
    });
  } else {
    console.log('Auth not available, initializing dashboard directly...');
    initializeDashboard();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupDashboard);
} else {
  setupDashboard();
}

console.log("Enhanced dashboard script loaded with proper store sales analytics. Use window.debugStoreSales() to debug sales data.");