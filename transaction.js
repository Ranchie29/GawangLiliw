import { db, auth } from './firebase-config.js';
import { 
  query, 
  getDocs, 
  collection, 
  updateDoc, 
  doc, 
  orderBy, 
  where, 
  getDoc 
} from './firebase-config.js';
import { onAuthStateChanged } from './firebase-config.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

function escapeHtml(unsafe) {
  try {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "&apos;")
      .replace(/"/g, "&quot;")
  } catch (error) {
    console.error("Error in escapeHtml:", error);
    return unsafe;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const userNameEl = document.getElementById('userName');
  const transactionTableBody = document.getElementById('transactionTableBody');
  const statusFilter = document.getElementById('status');
  const paymentFilter = document.getElementById('paymentMethod');
  const completedOrdersEl = document.getElementById('completedOrders');
  const pendingOrdersEl = document.getElementById('pendingOrders');
  const totalRevenueEl = document.getElementById('totalRevenue');
  const exportButton = document.getElementById('exportButton');
  const fromDateFilter = document.getElementById('fromDate');
  const toDateFilter = document.getElementById('toDate');
  const clearDatesBtn = document.getElementById('clearDates');
  const completedOrdersCard = document.getElementById('completedOrdersCard');
  const pendingOrdersCard = document.getElementById('pendingOrdersCard');
  const completedOrdersModal = document.getElementById('completedOrdersModal');
  const completedOrdersTableBody = document.getElementById('completedOrdersTableBody');
  const closeCompletedModal = document.getElementById('closeCompletedModal');
  const pendingOrdersModal = document.getElementById('pendingOrdersModal');
  const pendingOrdersTableBody = document.getElementById('pendingOrdersTableBody');
  const closePendingModal = document.getElementById('closePendingModal');
  const orderDetailsModal = document.getElementById('orderDetailsModal');
  const closeOrderDetailsModal = document.getElementById('closeOrderDetailsModal');
  const completedOrdersPaginationNumbers = document.getElementById('completed-orders-pagination-numbers');
  const pendingOrdersPaginationNumbers = document.getElementById('pending-orders-pagination-numbers');
  const today = new Date().toISOString().split('T')[0];

  const rowsPerPageSelect = document.getElementById('rowsPerPage');
  const prevPageBtn = document.querySelector('.prev-page');
  const nextPageBtn = document.querySelector('.next-page');
  const pageIndicator = document.querySelector('.pagination span');

  let allTransactions = [];
  let completedOrders = [];
  let pendingOrders = [];
  let currentPage = 1;
  let completedOrdersPage = 1;
  let pendingOrdersPage = 1;
  let rowsPerPage = parseInt(rowsPerPageSelect?.value || "10");
  let completedOrdersPerPage = 5;
  let pendingOrdersPerPage = 5;
  let currentUser = null;

  const urlParams = new URLSearchParams(window.location.search);
  const highlightOrderId = escapeHtml(urlParams.get('highlightOrder') || '');
  console.log(`Parsed highlightOrderId from URL: ${highlightOrderId}`);

 
  async function highlightOrder(orderId) {
    if (!orderId) {
      console.warn('No orderId provided for highlighting');
      return;
    }

    console.log(`Attempting to highlight order: ${orderId}`);

    try {
      // Fetch transactions without filters
      await fetchTransactions(true);

      // Log allTransactions
      console.log('All transactions:', allTransactions.map(t => ({
        id: t.id,
        status: t.data.status,
        sellerId: t.data.sellerId,
        timestamp: t.data.timestamp
      })));

      // Find the order
      const orderIndex = allTransactions.findIndex(t => t.id === orderId);
      if (orderIndex === -1) {
        console.warn(`Order ${orderId} not found in allTransactions`);
        // Fetch the specific order directly
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          console.log(`Order ${orderId} found in Firestore:`, orderData);
          showToast('Order Found', `Order ${orderId} exists but was not fetched. SellerId: ${orderData.sellerId || 'unset'}, Expected: ${currentUser?.uid || 'no user'}`);
          // Add the order to allTransactions if sellerId matches or is unset and not already present
          if ((!orderData.sellerId || orderData.sellerId === currentUser?.uid) && !allTransactions.some(t => t.id === orderId)) {
            allTransactions.push({ data: orderData, id: orderId });
            console.log(`Added order ${orderId} to allTransactions`);
            // Update Firestore if sellerId is unset
            if (!orderData.sellerId && currentUser?.uid) {
              await updateDoc(doc(db, 'orders', orderId), { sellerId: currentUser.uid });
              console.log(`Updated order ${orderId} with sellerId: ${currentUser.uid}`);
            }
          } else {
            console.warn(`Order ${orderId} not added. SellerId mismatch or already exists. Order sellerId: ${orderData.sellerId}, currentUser.uid: ${currentUser?.uid}`);
            return;
          }
        } else {
          console.warn(`Order ${orderId} does not exist in Firestore`);
          showToast('Order Not Found', `Order ${orderId} does not exist in the database.`);
          return;
        }
      }

      // Log unique transactions
      console.log(`Total unique transactions after highlight: ${allTransactions.length}`);

      // Recalculate page
      const finalOrderIndex = allTransactions.findIndex(t => t.id === orderId);
      if (finalOrderIndex !== -1) {
        currentPage = Math.floor(finalOrderIndex / rowsPerPage) + 1;
        console.log(`Setting currentPage to ${currentPage} for order ${orderId}`);
      }

      // Render the table
      renderTable();

      // Wait for DOM update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the row
      const orderRow = document.querySelector(`#transactionTableBody tr td:first-child[data-order-id="${orderId}"]`)?.parentElement;
      if (orderRow) {
        console.log(`Found order row for ${orderId} in DOM`);
        orderRow.classList.add('highlight');
        orderRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          orderRow.classList.add('fade-out');
          setTimeout(() => {
            orderRow.classList.remove('highlight', 'fade-out');
          }, 2000);
        }, 5000);
        showToast('Order Approved', `Order ${orderId} has been successfully approved.`);
      } else {
        console.warn(`Order row for ${orderId} not found in DOM after rendering`);
        showToast('Order Not Found', `Order ${orderId} could not be found in the transaction list.`);
      }
    } catch (error) {
      console.error('Error highlighting order:', error);
      showToast('Error', `Error highlighting order: ${error.message}`);
    }
  }

  function showToast(title, message) {
    const notificationToast = document.getElementById('notificationToast');
    if (notificationToast) {
      notificationToast.querySelector('.notification-toast-title').textContent = title;
      notificationToast.querySelector('.notification-toast-body').textContent = message;
      notificationToast.classList.add('show');
      setTimeout(() => {
        notificationToast.classList.remove('show');
      }, 5000);
    }
  }

  // Initialize highlighting if highlightOrderId exists
  
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

  // Function to update follower count in the UI
  function updateFollowerCount(count) {
    const followerCountElement = document.getElementById("followerCount");
    if (followerCountElement) {
      followerCountElement.textContent = `Followers: ${count}`;
    }
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;
    userNameEl.textContent = user.displayName || 'User';
    await fetchTransactions();
    await updateOrderStats();
    await updateStockForPendingOrders();
    await countFollowers();

  });

  document.getElementById("refreshBtn").addEventListener("click", function() {
    location.reload();
  });

  // Event listeners for date inputs
  if (fromDateFilter) {
    fromDateFilter.max = today;
    fromDateFilter.addEventListener('change', function() {
      if (this.value > today) {
        this.value = today;
      }
      if (toDateFilter && toDateFilter.value && this.value > toDateFilter.value) {
        toDateFilter.value = this.value;
      }
      fetchTransactions();
    });
  }
  if (toDateFilter) {
    toDateFilter.max = today;
    toDateFilter.addEventListener('change', function() {
      if (this.value > today) {
        this.value = today;
      }
      if (fromDateFilter && fromDateFilter.value && this.value < fromDateFilter.value) {
        fromDateFilter.value = this.value;
      }
      fetchTransactions();
    });
  }
  if (clearDatesBtn) {
    clearDatesBtn.addEventListener('click', clearDateFilters);
  }

  // Event listener for completed orders card
  if (completedOrdersCard) {
    completedOrdersCard.addEventListener('click', async () => {
      await fetchCompletedOrders();
      completedOrdersModal.style.display = 'block';
    });
  }

  // Event listener for pending orders card
  if (pendingOrdersCard) {
    pendingOrdersCard.addEventListener('click', async () => {
      await fetchPendingOrders();
      pendingOrdersModal.style.display = 'block';
    });
  }

  // Event listener for closing completed orders modal
  if (closeCompletedModal) {
    closeCompletedModal.addEventListener('click', () => {
      completedOrdersModal.style.display = 'none';
    });
  }

  // Event listener for closing pending orders modal
  if (closePendingModal) {
    closePendingModal.addEventListener('click', () => {
      pendingOrdersModal.style.display = 'none';
    });
  }

  // Event listener for closing order details modal
  if (closeOrderDetailsModal) {
    closeOrderDetailsModal.addEventListener('click', () => {
      orderDetailsModal.style.display = 'none';
    });
  }

  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === completedOrdersModal) {
      completedOrdersModal.style.display = 'none';
    }
    if (e.target === pendingOrdersModal) {
      pendingOrdersModal.style.display = 'none';
    }
    if (e.target === orderDetailsModal) {
      orderDetailsModal.style.display = 'none';
    }
  });

  function clearDateFilters() {
    if (fromDateFilter) fromDateFilter.value = '';
    if (toDateFilter) toDateFilter.value = '';
    fetchTransactions();
  }

  async function getOrderStats() {
    if (!currentUser) return { completed: 0, pending: 0, revenue: 0 };
    
    let completed = 0, pending = 0, revenue = 0;
    
    const snap = await getDocs(collection(db, 'orders'));
    
    snap.forEach(d => {
      const o = d.data();
      if (o.sellerId === currentUser.uid) {
        if (o.status?.toLowerCase() === 'completed') {
          completed++;
          revenue += o.totalAmount || 0;
        } else if (o.status?.toLowerCase() === 'pending') {
          pending++;
        }
      }
    });
    
    return { completed, pending, revenue };
  }

  async function updateOrderStats() {
    const { completed, pending, revenue } = await getOrderStats();
    completedOrdersEl.textContent = completed;
    pendingOrdersEl.textContent = pending;
    totalRevenueEl.textContent = `₱${revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  async function fetchTransactions(bypassFilters = false) {
    if (!currentUser) {
      console.warn('No current user, cannot fetch transactions');
      return;
    }

    console.log(`Fetching transactions for sellerId: ${currentUser.uid}, bypassFilters: ${bypassFilters}`);
    allTransactions = [];

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    try {
      const snap = await getDocs(ordersQuery);
      console.log(`Fetched ${snap.size} orders from Firestore`);

      snap.forEach(d => {
        const o = d.data();
        console.log(`Processing order ${d.id}:`, { 
          status: o.status, 
          sellerId: o.sellerId, 
          timestamp: o.timestamp 
        });
        if ((bypassFilters || applyFilters(o)) && !allTransactions.some(t => t.id === d.id)) {
          allTransactions.push({ data: o, id: d.id });
        }
      });

      console.log(`Total unique transactions after filtering: ${allTransactions.length}`);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      showToast('Error', `Failed to fetch transactions: ${error.message}`);
    }

    // Reset to first page unless highlighting
    if (!highlightOrderId) {
      currentPage = 1;
    }

    renderTable();
    await updateOrderStats();
  }

  // Initialize
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log('No user logged in, redirecting to login');
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;
    console.log(`User authenticated: ${user.uid}, displayName: ${user.displayName}`);
    userNameEl.textContent = user.displayName || 'User';
    
    // Fetch transactions for general initialization
    await fetchTransactions();
    await updateOrderStats();
    await updateStockForPendingOrders();
    await countFollowers();

    // Highlight order if specified
    if (highlightOrderId) {
      console.log(`Initializing highlight for order: ${highlightOrderId}`);
      await highlightOrder(highlightOrderId);
    }
  });

  // Initialize
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log('No user logged in, redirecting to login');
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;
    console.log(`User authenticated: ${user.uid}, displayName: ${user.displayName}`);
    userNameEl.textContent = user.displayName || 'User';
    
    // Only fetch transactions if not highlighting to avoid duplicate calls
    if (!highlightOrderId) {
      await fetchTransactions();
    }
    await updateOrderStats();
    await updateStockForPendingOrders();
    await countFollowers();

    // Highlight order after user is set
    if (highlightOrderId) {
      console.log(`Initializing highlight for order: ${highlightOrderId}`);
      await highlightOrder(highlightOrderId);
    }
  });

  // Initialize highlighting if highlightOrderId exists
  if (highlightOrderId) {
    console.log(`Initializing highlight for order: ${highlightOrderId}`);
    await highlightOrder(highlightOrderId);
  }

  async function fetchCompletedOrders() {
    if (!currentUser) return;

    completedOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    
    const completedOrdersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentUser.uid),
      where('status', '==', 'Completed'),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(completedOrdersQuery);
    console.log(`Found ${snap.size} completed orders for completed orders modal`);

    completedOrders = [];
    snap.forEach(docSnap => {
      completedOrders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (completedOrders.length === 0) {
      completedOrdersTableBody.innerHTML = '<tr><td colspan="6">No completed orders found</td></tr>';
      if (completedOrdersPaginationNumbers) completedOrdersPaginationNumbers.innerHTML = '';
      return;
    }

    completedOrdersPage = 1;
    renderCompletedOrdersPage(completedOrdersPage);
  }

  async function fetchPendingOrders() {
    if (!currentUser) return;

    pendingOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    
    const pendingOrdersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentUser.uid),
      where('status', '==', 'Pending'),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(pendingOrdersQuery);
    console.log(`Found ${snap.size} pending orders for pending orders modal`);

    pendingOrders = [];
    snap.forEach(docSnap => {
      pendingOrders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (pendingOrders.length === 0) {
      pendingOrdersTableBody.innerHTML = '<tr><td colspan="6">No pending orders found</td></tr>';
      if (pendingOrdersPaginationNumbers) pendingOrdersPaginationNumbers.innerHTML = '';
      return;
    }

    pendingOrdersPage = 1;
    renderPendingOrdersPage(pendingOrdersPage);
  }

  function renderCompletedOrdersPage(page) {
    completedOrdersTableBody.innerHTML = '';
    const start = (page - 1) * completedOrdersPerPage;
    const end = start + completedOrdersPerPage;
    const paginatedOrders = completedOrders.slice(start, end);

    paginatedOrders.forEach(order => {
      addCompletedOrderRow(order, order.id);
    });

    const totalPages = Math.ceil(completedOrders.length / completedOrdersPerPage);
    if (completedOrdersPaginationNumbers) {
      completedOrdersPaginationNumbers.innerHTML = '';
      const prevBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="prev"]');
      const nextBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="next"]');

      if (prevBtn) prevBtn.disabled = page === 1;
      if (nextBtn) nextBtn.disabled = page === totalPages;

      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
          completedOrdersPage = i;
          renderCompletedOrdersPage(completedOrdersPage);
        });
        completedOrdersPaginationNumbers.appendChild(pageBtn);
      }
    }
  }

  function renderPendingOrdersPage(page) {
    pendingOrdersTableBody.innerHTML = '';
    const start = (page - 1) * pendingOrdersPerPage;
    const end = start + pendingOrdersPerPage;
    const paginatedOrders = pendingOrders.slice(start, end);

    paginatedOrders.forEach(order => {
      addPendingOrderRow(order, order.id);
    });

    const totalPages = Math.ceil(pendingOrders.length / pendingOrdersPerPage);
    if (pendingOrdersPaginationNumbers) {
      pendingOrdersPaginationNumbers.innerHTML = '';
      const prevBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="prev"]');
      const nextBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="next"]');

      if (prevBtn) prevBtn.disabled = page === 1;
      if (nextBtn) nextBtn.disabled = page === totalPages;

      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
          pendingOrdersPage = i;
          renderPendingOrdersPage(pendingOrdersPage);
        });
        pendingOrdersPaginationNumbers.appendChild(pageBtn);
      }
    }
  }

  async function addCompletedOrderRow(o, id) {
    const tr = document.createElement('tr');

    const timestamp = o.timestamp ? new Date(o.timestamp) : null;
    const date = timestamp ? timestamp.toLocaleDateString() : '—';

    const rawStatus = (o.status || '').toLowerCase();
    const displayStatus = rawStatus === 'cancelled' ? 'Canceled Order' :
                          rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : '—';

    let username = o.username || o.userId;

    if (o.userId && !o.username) {
      try {
        const userRef = doc(db, "users", o.userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          username = userData?.username || 
                     userData?.displayName || 
                     (userData?.email?.split('@')[0]) || 
                     'Customer';
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    }

    tr.innerHTML = `
      <td>${escapeHtml(id)}</td>
      <td>
        <div class="customer-info">${escapeHtml(username || 'Customer')}</div>
      </td>
      <td>${date}</td>
      <td>
        <span class="status-badge ${rawStatus}">
          ${displayStatus}
        </span>
      </td>
      <td>₱${(o.totalAmount || 0).toFixed(2)}</td>
      <td>
        <button class="btn view-info" data-id="${escapeHtml(id)}">View Info</button>
      </td>
    `;

    completedOrdersTableBody.appendChild(tr);
    return tr;
  }

  async function addPendingOrderRow(o, id) {
    const tr = document.createElement('tr');

    const timestamp = o.timestamp ? new Date(o.timestamp) : null;
    const date = timestamp ? timestamp.toLocaleDateString() : '—';

    const rawStatus = (o.status || '').toLowerCase();
    const displayStatus = rawStatus === 'cancelled' ? 'Canceled Order' :
                          rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : '—';

    let username = o.username || o.userId;

    if (o.userId && !o.username) {
      try {
        const userRef = doc(db, "users", o.userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          username = userData?.username || 
                     userData?.displayName || 
                     (userData?.email?.split('@')[0]) || 
                     'Customer';
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    }

    tr.innerHTML = `
      <td>${escapeHtml(id)}</td>
      <td>
        <div class="customer-info">${escapeHtml(username || 'Customer')}</div>
      </td>
      <td>${date}</td>
      <td>
        <span class="status-badge ${rawStatus}">
          ${displayStatus}
        </span>
      </td>
      <td>₱${(o.totalAmount || 0).toFixed(2)}</td>
      <td>
        <button class="btn view-info" data-id="${escapeHtml(id)}">View Info</button>
      </td>
    `;

    pendingOrdersTableBody.appendChild(tr);
    return tr;
  }

  async function populateOrderDetails(orderId) {
    const detailsTableBody = document.getElementById('orderDetailsTableBody');
    const itemsTableBody = document.getElementById('orderItemsTableBody');
    if (!detailsTableBody || !itemsTableBody) {
      console.error('Order details table bodies not found');
      return;
    }

    detailsTableBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    itemsTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    try {
      const orderDoc = await getDoc(doc(db, 'orders', orderId));
      if (!orderDoc.exists()) {
        detailsTableBody.innerHTML = '<tr><td colspan="5">Order not found</td></tr>';
        itemsTableBody.innerHTML = '<tr><td colspan="6">No items</td></tr>';
        return;
      }

      const order = orderDoc.data();
      const statusRaw = (order.status || '').toLowerCase().trim();
      const statusDisplay = statusRaw === 'cancelled' ? 'Canceled' :
                           statusRaw === 'pending' ? 'Pending' :
                           statusRaw === 'topay' ? 'To Pay' :
                           statusRaw === 'toship' ? 'To Ship' :
                           statusRaw === 'toreceive' ? 'To Receive' :
                           statusRaw === 'return' || statusRaw === 'refunded' ? 'Return/Refunded' :
                           statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
      const totalAmount = parseFloat(order.totalAmount) || 0;
      const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

      let username = order.username || order.userId;
      if (order.userId && !order.username) {
        try {
          const userRef = doc(db, "users", order.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            username = userData?.username || 
                       userData?.displayName || 
                       (userData?.email?.split('@')[0]) || 
                       'Customer';
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }

      detailsTableBody.innerHTML = `
        <tr>
          <td>${escapeHtml(orderId)}</td>
          <td>${escapeHtml(username || 'Customer')}</td>
          <td>${date}</td>
          <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
          <td>₱${totalAmount.toFixed(2)}</td>
        </tr>
      `;

      itemsTableBody.innerHTML = '';
      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length === 0) {
        itemsTableBody.innerHTML = '<tr><td colspan="6">No items found</td></tr>';
        return;
      }

      items.forEach(item => {
        const quantity = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const subtotal = (quantity * price).toFixed(2);
        const size = item.size ? escapeHtml(item.size) : 'N/A';
        const color = item.color ? escapeHtml(item.color) : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${escapeHtml(item.name || 'Unknown')}</td>
          <td>${size}</td>
          <td>${color}</td>
          <td>${quantity}</td>
          <td>₱${price.toFixed(2)}</td>
          <td>₱${subtotal}</td>
        `;
        itemsTableBody.appendChild(row);
      });
    } catch (error) {
      console.error('Error populating order details:', error);
      detailsTableBody.innerHTML = `<tr><td colspan="5">Error loading order: ${escapeHtml(error.message)}</td></tr>`;
      itemsTableBody.innerHTML = `<tr><td colspan="6">Error loading items</td></tr>`;
    }
  }

  function applyFilters(o) {
    const statusVal = statusFilter.value.toLowerCase();
    const paymentVal = paymentFilter.value.toLowerCase();
    const fromDate = fromDateFilter ? fromDateFilter.value : null;
    const toDate = toDateFilter ? toDateFilter.value : null;
  
    if (statusVal !== 'all' && o.status?.toLowerCase() !== statusVal) return false;
  
    if (paymentVal !== 'all') {
      const orderPayment = o.paymentMethod?.toLowerCase();
      if (paymentVal === 'cash' && orderPayment !== 'cash' && orderPayment !== 'cash on delivery') return false;
      if (paymentVal === 'gcash' && orderPayment !== 'gcash') return false;
    }

    const od = o.timestamp ? new Date(o.timestamp) : null;
    if (!od) return false;

    if (!fromDate && !toDate) return true;

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);
    
    if (from && od < from) return false;
    if (to && od > to) return false;
    
    return true;
  }

  function renderTable() {
    transactionTableBody.innerHTML = '';
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = allTransactions.slice(start, end);
    pageItems.forEach(({ data, id }) => addTransactionRow(data, id));

    const totalPages = Math.ceil(allTransactions.length / rowsPerPage);
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  async function addTransactionRow(o, id) {
    const tr = document.createElement('tr');
  
    const timestamp = o.timestamp ? new Date(o.timestamp) : null;
    const date = timestamp ? timestamp.toLocaleDateString() : '—';
  
    const names = Array.isArray(o.items) ? o.items.map(i => i.name).join(', ') : '—';
  
    const rawStatus = (o.status || '').toLowerCase();
    const displayStatus = rawStatus === 'cancelled' ? 'Canceled Order' :
                          rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : '—';
  
    let username = o.username || o.userId;
  
    if (o.userId && !o.username) {
      try {
        const userRef = doc(db, "users", o.userId);
        const userSnap = await getDoc(userRef);
  
        if (userSnap.exists()) {
          const userData = userSnap.data();
          username = userData?.username || 
                     userData?.displayName || 
                     (userData?.email?.split('@')[0]) || 
                     'Customer';
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    }
  
    tr.innerHTML = `
      <td data-order-id="${escapeHtml(id)}">
        <div class="customer-info">${escapeHtml(username || 'Customer')}</div>
      </td>
      <td>${escapeHtml(names)}</td>
      <td>${date}</td>
      <td>₱${(o.totalAmount || 0).toFixed(2)}</td>
      <td>
        <span class="payment-method ${o.paymentMethod?.toLowerCase() || ''}">
          ${o.paymentMethod || '—'}
        </span>
      </td>
      <td>
        <span class="status-badge ${rawStatus}">
          ${displayStatus}
        </span>
      </td>
      <td>
        <button class="btn view-info" data-id="${escapeHtml(id)}">View Info</button>
      </td>
    `;
  
    transactionTableBody.appendChild(tr);
    return tr;
  }

  transactionTableBody.addEventListener('click', async e => {
    const btn = e.target;
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('view-info')) {
      window.location.href = `orders.html?id=${id}`;
    }
  });

  completedOrdersTableBody.addEventListener('click', async e => {
    const btn = e.target;
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('view-info')) {
      await populateOrderDetails(id);
      orderDetailsModal.style.display = 'block';
    }
  });

  pendingOrdersTableBody.addEventListener('click', async e => {
    const btn = e.target;
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('view-info')) {
      await populateOrderDetails(id);
      orderDetailsModal.style.display = 'block';
    }
  });

  const prevCompletedBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="prev"]');
  const nextCompletedBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="next"]');

  const prevPendingBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="prev"]');
  const nextPendingBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="next"]');

  if (prevCompletedBtn) {
    prevCompletedBtn.addEventListener('click', () => {
      if (completedOrdersPage > 1) {
        completedOrdersPage--;
        renderCompletedOrdersPage(completedOrdersPage);
      }
    });
  }

  if (nextCompletedBtn) {
    nextCompletedBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(completedOrders.length / completedOrdersPerPage);
      if (completedOrdersPage < totalPages) {
        completedOrdersPage++;
        renderCompletedOrdersPage(completedOrdersPage);
      }
    });
  }

  if (prevPendingBtn) {
    prevPendingBtn.addEventListener('click', () => {
      if (pendingOrdersPage > 1) {
        pendingOrdersPage--;
        renderPendingOrdersPage(pendingOrdersPage);
      }
    });
  }

  if (nextPendingBtn) {
    nextPendingBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(pendingOrders.length / pendingOrdersPerPage);
      if (pendingOrdersPage < totalPages) {
        pendingOrdersPage++;
        renderPendingOrdersPage(pendingOrdersPage);
      }
    });
  }

  [statusFilter, paymentFilter].forEach(el =>
    el.addEventListener('change', fetchTransactions)
  );

  rowsPerPageSelect.addEventListener('change', () => {
    rowsPerPage = parseInt(rowsPerPageSelect.value, 10);
    currentPage = 1;
    renderTable();
  });

  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(allTransactions.length / rowsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  async function exportTable(exportAll = false) {
    if (allTransactions.length === 0) {
        alert("No transactions to export!");
        return;
    }

    // Create a temporary table for export
    const tableHead = document.querySelector("thead");
    const exportTable = document.createElement("table");
    const exportThead = tableHead.cloneNode(true);
    const exportTbody = document.createElement("tbody");

    // Remove last column (Actions) if it exists
    exportThead.querySelectorAll("th").forEach((th, index, arr) => {
        if (index === arr.length - 1 && th.textContent.trim().toLowerCase() === "actions") {
            th.remove();
        }
    });

    // Add transaction rows
    if (exportAll) {
        for (const { data, id } of allTransactions) {
            const row = await addTransactionRow(data, id);
            const newRow = row.cloneNode(true);
            // Remove last cell if it's the actions cell
            if (newRow.cells.length > 0 && 
                newRow.cells[newRow.cells.length - 1].querySelector('.view-info')) {
                newRow.deleteCell(newRow.cells.length - 1);
            }
            exportTbody.appendChild(newRow);
        }
    } else {
        const tableBody = document.querySelector("#transactionTableBody");
        Array.from(tableBody.rows).forEach(row => {
            const newRow = row.cloneNode(true);
            // Remove last cell if it's the actions cell
            if (newRow.cells.length > 0 && 
                newRow.cells[newRow.cells.length - 1].querySelector('.view-info')) {
                newRow.deleteCell(newRow.cells.length - 1);
            }
            exportTbody.appendChild(newRow);
        });
    }

    exportTable.appendChild(exportThead);
    exportTable.appendChild(exportTbody);

    // Create new workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(exportTable);

    // Get current date and user information with Philippines time zone
    const exportDate = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Manila",
        dateStyle: "full",
        timeStyle: "short"
    });
    const userName = currentUser?.displayName || "User";
    const columnCount = exportThead.querySelectorAll("th").length;

    // ===== HEADER SECTION =====
    // Title and subtitle rows
    const headerRows = [
        ["TRANSACTION REPORT"], // Main title
        [`Exported by: ${userName}`], // Subtitle
        [`Export Date: ${exportDate}`], // Subtitle
        [""], // Empty row for spacing
    ];
    
    XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: "A1" });

    // Merge title cells
    const wsMerges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } }, // Main title
        { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } }, // Exported by
        { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } }, // Export date
    ];

    // Style for main title
    if (ws["A1"]) {
        ws["A1"].s = {
            font: { 
                bold: true, 
                sz: 18, 
                color: { rgb: "FFFFFF" },
                name: "Arial"
            },
            fill: { 
                fgColor: { rgb: "2F5496" }, // Dark blue background
                patternType: "solid"
            },
            alignment: { 
                horizontal: "center", 
                vertical: "center",
                wrapText: true
            }
        };
    }

    // Style for subtitles
    if (ws["A2"]) {
        ws["A2"].s = {
            font: { 
                bold: true, 
                sz: 12, 
                color: { rgb: "000000" },
                name: "Arial"
            },
            alignment: { 
                horizontal: "left", 
                vertical: "center" 
            }
        };
    }
    
    if (ws["A3"]) {
        ws["A3"].s = {
            font: { 
                sz: 11, 
                color: { rgb: "000000" },
                name: "Arial"
            },
            alignment: { 
                horizontal: "left", 
                vertical: "center" 
            }
        };
    }

    // ===== TABLE DATA SECTION =====
    // Table starts after headers (row 4 because we have 4 header rows)
    const tableStartRow = 4;
    const wsData = XLSX.utils.table_to_sheet(exportTable, { origin: `A${tableStartRow}` });

    // Copy data to the worksheet
    Object.keys(wsData).forEach(cell => {
        if (cell !== "!ref" && cell !== "!merges" && cell !== "!cols") {
            ws[cell] = wsData[cell];
        }
    });

    // Style header row (first row of the actual table)
    const tableHeaderRow = tableStartRow;
    const headerCells = Array.from({ length: columnCount }, (_, i) => String.fromCharCode(65 + i));
    
    headerCells.forEach(cell => {
        const cellRef = `${cell}${tableHeaderRow}`;
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { 
                    bold: true, 
                    color: { rgb: "FFFFFF" },
                    name: "Arial",
                    sz: 11
                },
                fill: { 
                    fgColor: { rgb: "4472C4" }, // Medium blue
                    patternType: "solid"
                },
                alignment: { 
                    horizontal: "center", 
                    vertical: "center",
                    wrapText: true
                },
                border: {
                    top: { style: "medium", color: { rgb: "FFFFFF" } },
                    bottom: { style: "medium", color: { rgb: "FFFFFF" } },
                    left: { style: "medium", color: { rgb: "FFFFFF" } },
                    right: { style: "medium", color: { rgb: "FFFFFF" } },
                },
            };
        }
    });

    // Style data rows
    const tableRows = exportAll
        ? allTransactions
        : allTransactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    tableRows.forEach((_, index) => {
        const rowNum = tableStartRow + 1 + index;
        headerCells.forEach(cell => {
            const cellRef = `${cell}${rowNum}`;
            if (ws[cellRef]) {
                // Base style
                ws[cellRef].s = {
                    font: { 
                        name: "Arial",
                        sz: 10
                    },
                    fill: { 
                        fgColor: { rgb: index % 2 === 0 ? "FFFFFF" : "F2F2F2" } // White and light gray alternating
                    },
                    border: {
                        top: { style: "thin", color: { rgb: "D9D9D9" } },
                        bottom: { style: "thin", color: { rgb: "D9D9D9" } },
                        left: { style: "thin", color: { rgb: "D9D9D9" } },
                        right: { style: "thin", color: { rgb: "D9D9D9" } },
                    },
                    alignment: { 
                        horizontal: "left", 
                        vertical: "center",
                        wrapText: true
                    }
                };

                // Special formatting for specific columns
                if (cell === "D" && ws[cellRef].v) { // Amount column (assuming D is amount)
                    ws[cellRef].z = '"₱"#,##0.00;[Red]"₱"#,##0.00'; // Negative in red
                    ws[cellRef].s.numFmt = '"₱"#,##0.00;[Red]"₱"#,##0.00';
                    ws[cellRef].s.alignment.horizontal = "right";
                }
                
                if (cell === "C" && ws[cellRef].v && ws[cellRef].v !== "—") { // Date column (assuming C is date)
                    ws[cellRef].z = "mm/dd/yyyy";
                    ws[cellRef].s.alignment.horizontal = "center";
                }
                
                // Highlight important values
                if (cell === "D" && parseFloat(ws[cellRef].v) > 10000) { // Large amounts
                    ws[cellRef].s.font.bold = true;
                    ws[cellRef].s.fill.fgColor = { rgb: "FFF2CC" }; // Light yellow
                }
            }
        });
    });

    // ===== SUMMARY SECTION =====
    const preFooterRow = tableStartRow + tableRows.length + 2;
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: `A${preFooterRow}` });

    const { completed, pending, revenue } = await getOrderStats();
    const footerRows = [
        ["SUMMARY STATISTICS"],
        [`Total Transactions: ${tableRows.length}`],
        [`Completed Orders: ${completed}`],
        [`Pending Orders: ${pending}`],
        [`Total Revenue: ₱${revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ];
    
    const footerStartRow = preFooterRow + 1;
    XLSX.utils.sheet_add_aoa(ws, footerRows, { origin: `A${footerStartRow}` });

    // Style summary title
    if (ws[`A${footerStartRow}`]) {
        ws[`A${footerStartRow}`].s = {
            font: { 
                bold: true, 
                sz: 14, 
                color: { rgb: "FFFFFF" },
                name: "Arial"
            },
            fill: { 
                fgColor: { rgb: "2F5496" }, // Matching header color
                patternType: "solid"
            },
            alignment: { 
                horizontal: "left", 
                vertical: "center" 
            },
            border: {
                top: { style: "medium", color: { rgb: "FFFFFF" } },
                bottom: { style: "medium", color: { rgb: "FFFFFF" } },
            },
        };
    }

    // Style summary items
    for (let i = 1; i < footerRows.length; i++) {
        const cellRef = `A${footerStartRow + i}`;
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { 
                    sz: 11,
                    name: "Arial"
                },
                fill: { 
                    fgColor: { rgb: i % 2 === 0 ? "E2EFDA" : "FFFFFF" } // Light green and white alternating
                },
                alignment: { 
                    horizontal: "left", 
                    vertical: "center" 
                },
                border: {
                    left: { style: "thin", color: { rgb: "D9D9D9" } },
                    right: { style: "thin", color: { rgb: "D9D9D9" } },
                },
            };
            
            // Format the revenue value specially
            if (i === footerRows.length - 1) {
                ws[cellRef].z = '"₱"#,##0.00';
                ws[cellRef].s.font.bold = true;
                ws[cellRef].s.fill.fgColor = { rgb: "C6E0B4" }; // Darker green
            }
        }
    }

    // Merge summary cells
    wsMerges.push(
        { s: { r: footerStartRow, c: 0 }, e: { r: footerStartRow, c: columnCount - 1 } },
        { s: { r: footerStartRow + 1, c: 0 }, e: { r: footerStartRow + 1, c: columnCount - 1 } },
        { s: { r: footerStartRow + 2, c: 0 }, e: { r: footerStartRow + 2, c: columnCount - 1 } },
        { s: { r: footerStartRow + 3, c: 0 }, e: { r: footerStartRow + 3, c: columnCount - 1 } },
        { s: { r: footerStartRow + 4, c: 0 }, e: { r: footerStartRow + 4, c: columnCount - 1 } }
    );

    ws["!merges"] = wsMerges;

    // ===== WORKSHEET SETTINGS =====
    // Set column widths (adjust based on your actual columns)
    ws["!cols"] = [
        { wch: 25 }, // Customer column
        { wch: 40 }, // Items column
        { wch: 15 }, // Date column
        { wch: 15 }, // Amount column
        { wch: 20 }, // Payment column
        { wch: 15 }, // Status column
    ];

    // Set print settings
    ws["!margins"] = { 
        left: 0.7, 
        right: 0.7, 
        top: 0.75, 
        bottom: 0.75, 
        header: 0.3, 
        footer: 0.3 
    };

    // Freeze header row and set print area
    ws["!views"] = [{ state: "frozen", ySplit: tableStartRow }];
    ws["!print"] = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        gridLines: false
    };

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");

    // Generate filename with current date
    const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `Transaction_Report_${userName.replace(/\s+/g, '_')}_${currentDate}.xlsx`;
    
    // Export the file
   XLSX.writeFile(wb, `Transaction_Report_${currentDate}.xlsx`);
}

// Event listener for export button
exportButton.addEventListener('click', () => {
    const confirmed = confirm("Do you want to export all transactions?\n\nClick OK for all transactions\nClick Cancel for current page only");
    exportTable(confirmed);
});

  async function updateStockForPendingOrders() {
    if (!currentUser) return;
    
    const pendingOrdersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentUser.uid),
      where('status', '==', 'Pending')
    );
    
    const pendingOrdersSnap = await getDocs(pendingOrdersQuery);
    
    for (const orderDoc of pendingOrdersSnap.docs) {
      const order = orderDoc.data();
      
      if (!order.items || !Array.isArray(order.items)) continue;
      
      for (const item of order.items) {
        try {
          const productRef = doc(db, 'products', item.productId);
          const productSnap = await getDoc(productRef);
          
          if (productSnap.exists()) {
            const productData = productSnap.data();
            const currentStock = productData.stock || 0;
            const orderedQuantity = item.quantity || 0;
            
            if (currentStock >= orderedQuantity) {
              await updateDoc(productRef, {
                stock: currentStock - orderedQuantity
              });
            }
          }
        } catch (error) {
          console.error(`Error updating stock for product ${item.productId}:`, error);
        }
      }
    }
  }
});