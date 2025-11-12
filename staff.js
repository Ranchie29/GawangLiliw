import {
  db,
  query,
  getDocs,
  collection,
  updateDoc,
  doc,
  orderBy,
  limit,
  getDoc,
  where,
  auth,
  onSnapshot,
  storage,
  ref,
  getDownloadURL,
} from './firebase-config.js';
import { onAuthStateChanged, signOut } from './firebase-config.js';
import { analytics, logEvent } from './firebase-config.js';

// Function to fetch and display event announcements for sellers
async function fetchEventAnnouncements() {
  const announcementContainer = document.querySelector('.event-announcement');
  if (!announcementContainer) {
    console.error('Event announcement container not found');
    return;
  }

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData?.sellerId;
    const today = new Date().toISOString().split('T')[0];

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      announcementContainer.style.display = 'none';
      return;
    }

    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('audience', '==', 'seller'),
      where('validUntil', '>=', today),
      orderBy('validUntil', 'asc'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    onSnapshot(announcementsQuery, (announcementsSnapshot) => {
      console.log(`Found ${announcementsSnapshot.size} announcements for sellers`);

      if (announcementsSnapshot.empty) {
        console.log('No announcements found for sellers');
        announcementContainer.style.display = 'none';
        return;
      }

      announcementContainer.style.display = 'block';
      const announcement = announcementsSnapshot.docs[0].data();
      console.log('Announcement data:', announcement);

      const titleElement = announcementContainer.querySelector('h2');
      const textElement = announcementContainer.querySelector('p:not(.event-date)');
      const dateElement = announcementContainer.querySelector('.event-date');

      if (titleElement) {
        titleElement.textContent = 'Upcoming Event: ' + (announcement.title ? escapeHtml(announcement.title) : 'N/A');
      } else {
        console.warn('Event announcement title element not found');
      }

      if (textElement) {
        textElement.textContent = announcement.text ? escapeHtml(announcement.text) : 'No description available';
      } else {
        console.warn('Event announcement text element not found');
      }

      if (dateElement) {
        const date = announcement.validUntil
          ? new Date(announcement.validUntil).toLocaleDateString()
          : 'N/A';
        dateElement.textContent = `Date: ${date}`;
      } else {
        console.warn('Event announcement date element not found');
      }
    }, (error) => {
      console.error('Error in snapshot for event announcements:', error);
      announcementContainer.style.display = 'none';
    });
  } catch (error) {
    console.error('Error fetching event announcements:', error);
    announcementContainer.style.display = 'none';
  }
}

// Existing functions (unchanged)
async function fetchSalesOverview() {
  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData?.sellerId;

    if (!currentSellerId) {
      console.warn("No seller ID found for current user");
      updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
      return;
    }

    const periodFilter = document.getElementById('periodFilter');
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    const weekFilter = document.getElementById('weekFilter');
    const dayFilter = document.getElementById('dayFilter');

    if (!periodFilter) {
      console.error("Period filter not found");
      updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
      return;
    }

    const period = periodFilter.value;
    let startDate, endDate;

    const now = new Date();
    switch (period) {
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        if (yearFilter?.value) {
          const selectedYear = parseInt(yearFilter.value);
          startDate = new Date(selectedYear, 0, 1);
          endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        }
        break;
      case 'monthly':
        const selectedMonth = monthFilter?.value ? parseInt(monthFilter.value.split('-')[1]) - 1 : now.getMonth();
        const selectedYearForMonth = monthFilter?.value ? parseInt(monthFilter.value.split('-')[0]) : now.getFullYear();
        startDate = new Date(selectedYearForMonth, selectedMonth, 1);
        endDate = new Date(selectedYearForMonth, selectedMonth + 1, 0, 23, 59, 59, 999);
        break;
      case 'weekly':
        const selectedWeek = weekFilter?.value ? parseInt(weekFilter.value.split('-')[1]) : getWeekNumber(now);
        const selectedYearForWeek = weekFilter?.value ? parseInt(weekFilter.value.split('-')[0]) : now.getFullYear();
        const firstDayOfWeek = getFirstDayOfWeek(selectedYearForWeek, selectedWeek);
        startDate = firstDayOfWeek;
        endDate = new Date(firstDayOfWeek);
        endDate.setDate(firstDayOfWeek.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'daily':
        startDate = dayFilter?.value ? new Date(dayFilter.value) : new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        console.warn("Invalid period selected");
        updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
        return;
    }

    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    const ordersQuery = query(
      collection(db, "orders"),
      where("sellerId", "==", currentSellerId),
      where("status", "==", "Completed"),
      where("timestamp", ">=", startTimestamp),
      where("timestamp", "<=", endTimestamp)
    );

    const ordersSnapshot = await getDocs(ordersQuery);
    console.log(`Found ${ordersSnapshot.size} completed orders for sales overview`);
    console.log("Query parameters:", {
      sellerId: currentSellerId,
      status: "Completed",
      startTimestamp,
      endTimestamp,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    ordersSnapshot.forEach(doc => console.log(`Order ${doc.id}:`, doc.data()));

    let totalSales = 0;
    let totalOrders = 0;
    let topProduct = "None";
    const productSalesCount = new Map();
    const salesData = [];

    let labels;
    if (period === 'yearly') {
      labels = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('default', { month: 'short' }));
      salesData.length = 12;
      salesData.fill(0);
    } else if (period === 'monthly') {
      const daysInMonth = endDate.getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
      salesData.length = daysInMonth;
      salesData.fill(0);
    } else if (period === 'weekly') {
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      salesData.length = 7;
      salesData.fill(0);
    } else {
      labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      salesData.length = 24;
      salesData.fill(0);
    }

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const orderDate = new Date(order.timestamp);
      if (isNaN(orderDate.getTime())) {
        console.warn(`Invalid timestamp in order ${doc.id}: ${order.timestamp}`);
        return;
      }

      const orderAmount = parseFloat(order.totalAmount) || 0;
      totalSales += orderAmount;
      totalOrders++;

      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length === 0) {
        console.warn(`No items in order ${doc.id}`);
      }
      items.forEach(item => {
        const productId = item.productId?.trim() || "";
        const itemName = item.name?.trim() || "Unknown";
        const quantity = parseInt(item.quantity) || 0;
        if (!productId || quantity <= 0) {
          console.warn(`Invalid item in order ${doc.id}:`, item);
          return;
        }
        if (!productSalesCount.has(productId)) {
          productSalesCount.set(productId, { name: itemName, count: 0 });
        }
        productSalesCount.get(productId).count += quantity;
      });

      let index;
      if (period === 'yearly') {
        index = orderDate.getMonth();
      } else if (period === 'monthly') {
        index = orderDate.getDate() - 1;
      } else if (period === 'weekly') {
        index = orderDate.getDay() === 0 ? 6 : orderDate.getDay() - 1;
      } else {
        index = orderDate.getHours();
      }
      if (index >= 0 && index < salesData.length) {
        salesData[index] += orderAmount;
      } else {
        console.warn(`Invalid index ${index} for period ${period} in order ${doc.id}`);
      }
    });

    const avgOrderValue = totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : 0;

    let maxCount = 0;
    productSalesCount.forEach((data, id) => {
      if (data.count > maxCount) {
        maxCount = data.count;
        topProduct = data.name;
      }
    });

    console.log("Sales overview results:", {
      totalSales,
      avgOrderValue,
      totalOrders,
      topProduct,
      salesData,
      labels
    });

    updateSalesOverviewChart(salesData, totalSales, avgOrderValue, topProduct, labels, period);
  } catch (error) {
    console.error("Error fetching sales overview:", error);
    updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
  }
}

function updateSalesOverviewChart(salesData, totalRevenue, avgRevenuePerPeriod, topProduct, labels, period) {
  console.log("Updating sales chart with:", { salesData, totalRevenue, avgRevenuePerPeriod, topProduct, labels, period });
  const ctx = document.getElementById('salesChart')?.getContext('2d');
  if (!ctx) {
      console.error("Sales chart canvas not found");
      return;
  }

  if (window.salesChart instanceof Chart) {
      window.salesChart.destroy();
  }

  window.salesChart = new Chart(ctx, {
      type: 'bar',
      data: {
          labels: labels,
          datasets: [{
              label: 'Sales Revenue',
              data: salesData,
              backgroundColor: 'rgba(52, 152, 219, 0.6)',
              borderColor: '#3498db',
              borderWidth: 1
          }]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
              y: {
                  beginAtZero: true,
                  title: {
                      display: true,
                      text: 'Revenue (₱)'
                  }
              },
              x: {
                  title: {
                      display: true,
                      text: period === 'yearly' ? 'Month' :
                            period === 'monthly' ? 'Day' :
                            period === 'weekly' ? 'Day of Week' : 'Hour'
                  }
              }
          },
          plugins: {
              legend: {
                  display: false
              },
              tooltip: {
                  callbacks: {
                      label: function(context) {
                          return `₱${context.parsed.y.toFixed(2)}`;
                      }
                  }
              }
          }
      }
  });

  const totalRevenueElement = document.getElementById('totalSales');
  const avgRevenueElement = document.getElementById('avgOrderValue');
  const topProductElement = document.getElementById('topProduct');

  if (totalRevenueElement) totalRevenueElement.textContent = `₱${totalRevenue.toFixed(2)}`;
  if (avgRevenueElement) avgRevenueElement.textContent = `₱${avgRevenuePerPeriod}`;
  if (topProductElement) topProductElement.textContent = topProduct || 'None';
}

async function fetchSalesData() {
  try {
      const userData = await getCurrentUserData();
      const currentSellerId = userData?.sellerId;

      if (!currentSellerId) {
          console.warn("No seller ID found for current user");
          updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
          return;
      }

      const periodFilter = document.getElementById('periodFilter');
      const yearFilter = document.getElementById('yearFilter');
      const monthFilter = document.getElementById('monthFilter');
      const weekFilter = document.getElementById('weekFilter');
      const dayFilter = document.getElementById('dayFilter');

      if (!periodFilter) {
          console.error("Period filter not found");
          updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
          return;
      }

      const period = periodFilter.value;
      let startDate, endDate;

      const now = new Date();
      switch (period) {
          case 'yearly':
              startDate = new Date(now.getFullYear(), 0, 1);
              endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
              if (yearFilter?.value) {
                  const selectedYear = parseInt(yearFilter.value);
                  startDate = new Date(selectedYear, 0, 1);
                  endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
              }
              break;
          case 'monthly':
              const selectedMonth = monthFilter?.value ? parseInt(monthFilter.value.split('-')[1]) - 1 : now.getMonth();
              const selectedYearForMonth = monthFilter?.value ? parseInt(monthFilter.value.split('-')[0]) : now.getFullYear();
              startDate = new Date(selectedYearForMonth, selectedMonth, 1);
              endDate = new Date(selectedYearForMonth, selectedMonth + 1, 0, 23, 59, 59, 999);
              break;
          case 'weekly':
              const selectedWeek = weekFilter?.value ? parseInt(weekFilter.value.split('-')[1]) : getWeekNumber(now);
              const selectedYearForWeek = weekFilter?.value ? parseInt(weekFilter.value.split('-')[0]) : now.getFullYear();
              const firstDayOfWeek = getFirstDayOfWeek(selectedYearForWeek, selectedWeek);
              startDate = firstDayOfWeek;
              endDate = new Date(firstDayOfWeek);
              endDate.setDate(firstDayOfWeek.getDate() + 6);
              endDate.setHours(23, 59, 59, 999);
              break;
          case 'daily':
              startDate = dayFilter?.value ? new Date(dayFilter.value) : new Date(now.setHours(0, 0, 0, 0));
              endDate = new Date(startDate);
              endDate.setHours(23, 59, 59, 999);
              break;
          default:
              console.warn("Invalid period selected");
              updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
              return;
      }

      const startTimestamp = startDate.getTime();
      const endTimestamp = endDate.getTime();

      const ordersQuery = query(
          collection(db, "orders"),
          where("sellerId", "==", currentSellerId),
          where("status", "==", "Completed"),
          where("timestamp", ">=", startTimestamp),
          where("timestamp", "<=", endTimestamp)
      );

      const ordersSnapshot = await getDocs(ordersQuery);
      console.log(`Found ${ordersSnapshot.size} completed orders for sales data`);

      let totalRevenue = 0;
      let topProduct = "None";
      const productRevenue = new Map();
      const salesData = [];

      let labels;
      if (period === 'yearly') {
          labels = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('default', { month: 'short' }));
          salesData.length = 12;
          salesData.fill(0);
      } else if (period === 'monthly') {
          const daysInMonth = endDate.getDate();
          labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
          salesData.length = daysInMonth;
          salesData.fill(0);
      } else if (period === 'weekly') {
          labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          salesData.length = 7;
          salesData.fill(0);
      } else {
          labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
          salesData.length = 24;
          salesData.fill(0);
      }

      ordersSnapshot.forEach(doc => {
          const order = doc.data();
          const orderDate = new Date(order.timestamp);
          if (isNaN(orderDate.getTime())) {
              console.warn(`Invalid timestamp in order ${doc.id}: ${order.timestamp}`);
              return;
          }

          const amount = parseFloat(order.totalAmount) || 0;
          totalRevenue += amount;

          (order.items || []).forEach(item => {
              const productId = item.productId?.trim() || "";
              const quantity = parseInt(item.quantity) || 0;
              const price = parseFloat(item.price) || 0;
              const itemRevenue = quantity * price;
              if (!productRevenue.has(productId)) {
                  productRevenue.set(productId, { name: item.name?.trim() || "Unknown", revenue: 0 });
              }
              productRevenue.get(productId).revenue += itemRevenue;
          });

          let index;
          if (period === 'yearly') {
              index = orderDate.getMonth();
          } else if (period === 'monthly') {
              index = orderDate.getDate() - 1;
          } else if (period === 'weekly') {
              index = orderDate.getDay() === 0 ? 6 : orderDate.getDay() - 1;
          } else {
              index = orderDate.getHours();
          }
          if (index >= 0 && index < salesData.length) {
              salesData[index] += amount;
          } else {
              console.warn(`Invalid index ${index} for period ${period} in order ${doc.id}`);
          }
      });

      let maxRevenue = 0;
      productRevenue.forEach((data, id) => {
          if (data.revenue > maxRevenue) {
              maxRevenue = data.revenue;
              topProduct = data.name;
          }
      });

      const avgRevenuePerPeriod = salesData.length > 0 ? (totalRevenue / salesData.length).toFixed(2) : 0;

      console.log("Sales data results:", {
          totalRevenue,
          avgRevenuePerPeriod,
          topProduct,
          salesData,
          labels
      });

      updateSalesOverviewChart(salesData, totalRevenue, avgRevenuePerPeriod, topProduct, labels, period);
  } catch (error) {
      console.error("Error fetching sales data:", error);
      updateSalesOverviewChart([], 0, 0, "None", [], 'yearly');
  }
}

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getFirstDayOfWeek(year, week) {
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getDay();
  const firstMonday = dayOfWeek <= 1 ? 1 : 9 - dayOfWeek;
  const targetWeekStart = new Date(year, 0, firstMonday + (week - 1) * 7);
  return targetWeekStart;
}

function initializeFilterDropdowns() {
  const yearFilter = document.getElementById('yearFilter');
  const monthFilter = document.getElementById('monthFilter');
  const weekFilter = document.getElementById('weekFilter');
  const dayFilter = document.getElementById('dayFilter');
  const periodFilter = document.getElementById('periodFilter');

  if (!yearFilter || !monthFilter || !weekFilter || !dayFilter || !periodFilter) {
    console.warn("One or more filter dropdowns not found");
    return;
  }

  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= currentYear - 4; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  }
  yearFilter.value = currentYear;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  months.forEach((month, index) => {
    const option = document.createElement('option');
    option.value = `${currentYear}-${(index + 1).toString().padStart(2, '0')}`;
    option.textContent = month;
    monthFilter.appendChild(option);
  });
  monthFilter.value = `${currentYear}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;

  function populateWeeks(year, month) {
    weekFilter.innerHTML = '';
    const weeks = getWeeksInMonth(year, month);
    weeks.forEach((week, index) => {
      const option = document.createElement('option');
      option.value = `${year}-${week.weekNumber}`;
      option.textContent = `Week ${week.weekNumber} (${week.startDate.toLocaleDateString()} - ${week.endDate.toLocaleDateString()})`;
      weekFilter.appendChild(option);
    });
  }

  function getWeeksInMonth(year, month) {
    const weeks = [];
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    let currentDate = new Date(firstDayOfMonth);

    while (currentDate <= lastDayOfMonth) {
      const weekNumber = getWeekNumber(currentDate);
      const firstDayOfWeek = getFirstDayOfWeek(year, weekNumber);
      const endDayOfWeek = new Date(firstDayOfWeek);
      endDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);

      if (firstDayOfWeek <= lastDayOfMonth && endDayOfWeek >= firstDayOfMonth) {
        weeks.push({
          weekNumber,
          startDate: new Date(Math.max(firstDayOfWeek, firstDayOfMonth)),
          endDate: new Date(Math.min(endDayOfWeek, lastDayOfMonth))
        });
      }

      currentDate.setDate(currentDate.getDate() + 7);
    }

    return weeks;
  }

  const initialYear = currentYear;
  const initialMonth = new Date().getMonth() + 1;
  populateWeeks(initialYear, initialMonth);

  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const option = document.createElement('option');
    option.value = date.toISOString().split('T')[0];
    option.textContent = date.toLocaleDateString();
    dayFilter.appendChild(option);
  }
  dayFilter.value = today.toISOString().split('T')[0];

  periodFilter.value = 'daily';

  periodFilter.addEventListener('change', () => {
    yearFilter.style.display = periodFilter.value === 'yearly' ? 'inline-block' : 'none';
    monthFilter.style.display = periodFilter.value === 'monthly' || periodFilter.value === 'weekly' ? 'inline-block' : 'none';
    weekFilter.style.display = periodFilter.value === 'weekly' ? 'inline-block' : 'none';
    dayFilter.style.display = periodFilter.value === 'daily' ? 'inline-block' : 'none';
    if (periodFilter.value === 'weekly') {
      const [year, month] = monthFilter.value.split('-').map(Number);
      populateWeeks(year, month);
    }
    fetchSalesData();
    fetchSalesOverview();
  });

  monthFilter.addEventListener('change', () => {
    if (periodFilter.value === 'weekly') {
      const [year, month] = monthFilter.value.split('-').map(Number);
      populateWeeks(year, month);
    }
    fetchSalesData();
    fetchSalesOverview();
  });

  [yearFilter, weekFilter, dayFilter].forEach(filter => {
    filter.addEventListener('change', () => {
      fetchSalesData();
      fetchSalesOverview();
    });
  });

  yearFilter.style.display = 'none';
  monthFilter.style.display = 'none';
  weekFilter.style.display = 'none';
  dayFilter.style.display = 'inline-block';

  fetchSalesData();
  fetchSalesOverview();
}

function escapeHtml(unsafe) {
  try {
    return unsafe
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/'/g, "'")
  } catch (error) {
    console.error("Error in escapeHtml:", error);
    return unsafe;
  }
}

async function calculateShopRating() {
  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      updateRatingSummary(0.0, 0);
      updateRatingBreakdown({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, 0);
      return 0.0;
    }

    console.log('Querying reviews for sellerId:', currentSellerId);

    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('sellerId', '==', currentSellerId)
    );
    const reviewsSnapshot = await getDocs(reviewsQuery);

    console.log('Number of reviews found:', reviewsSnapshot.size);
    console.log('Reviews data:', reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })));

    if (reviewsSnapshot.empty) {
      console.warn('No reviews found for the seller');
      updateRatingSummary(0.0, 0);
      updateRatingBreakdown({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, 0);
      return 0.0;
    }

    let totalRating = 0;
    let ratingCount = 0;
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    reviewsSnapshot.forEach(doc => {
      const review = doc.data();
      const rating = parseFloat(review.sellerRating);
      if (!isNaN(rating) && rating >= 1 && rating <= 5) {
        totalRating += rating;
        ratingCount++;
        ratingCounts[Math.floor(rating)]++;
      } else {
        console.warn(`Invalid or missing rating in review ${doc.id}: ${review.sellerRating}`);
      }
    });

    const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 0.0;
    console.log('Calculated average rating:', averageRating, 'Total reviews:', ratingCount);

    updateRatingSummary(averageRating, ratingCount);
    updateRatingBreakdown(ratingCounts, ratingCount);
    return averageRating;
  } catch (error) {
    console.error('Error calculating shop rating:', error);
    updateRatingSummary(0.0, 0);
    updateRatingBreakdown({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, 0);
    return 0.0;
  }
}

function updateRatingSummary(averageRating, totalReviews) {
  console.log('Updating rating summary with:', { averageRating, totalReviews });

  const shopRatingsContainer = document.querySelector('.dashboard-card.shop-ratings');
  if (!shopRatingsContainer) {
    console.error('Dashboard shop ratings container (.dashboard-header .shop-ratings) not found');
    return;
  }

  const ratingNumberElement = shopRatingsContainer.querySelector('.rating-number');
  const ratingCountElement = shopRatingsContainer.querySelector('.rating-count');
  const ratingStarsContainer = shopRatingsContainer.querySelector('.rating-stars');

  console.log('Rating summary elements found:', {
    ratingNumber: !!ratingNumberElement,
    ratingCount: !!ratingCountElement,
    ratingStars: !!ratingStarsContainer
  });

  if (!ratingNumberElement || !ratingCountElement || !ratingStarsContainer) {
    console.error('One or more rating summary elements not found in dashboard .shop-ratings');
    return;
  }

  ratingNumberElement.textContent = parseFloat(averageRating).toFixed(1);
  ratingCountElement.textContent = totalReviews === 1
    ? 'Based on 1 review'
    : `Based on ${totalReviews} reviews`;

  ratingStarsContainer.innerHTML = '';
  const fullStars = Math.floor(averageRating);
  const hasHalfStar = averageRating % 1 >= 0.5;

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('i');
    if (i <= fullStars) {
      star.className = 'fas fa-star';
    } else if (i === fullStars + 1 && hasHalfStar) {
      star.className = 'fas fa-star-half-alt';
    } else {
      star.className = 'far fa-star';
    }
    ratingStarsContainer.appendChild(star);
  }

  ratingStarsContainer.style.display = 'none';
  ratingStarsContainer.offsetHeight;
  ratingStarsContainer.style.display = 'inline-block';
}

function updateRatingBreakdown(ratingCounts, totalReviews) {
  console.log('Updating rating breakdown with:', { ratingCounts, totalReviews });

  if (!ratingCounts || typeof totalReviews !== 'number') {
    console.error('Invalid ratingCounts or totalReviews:', { ratingCounts, totalReviews });
    return;
  }

  const shopRatingsContainer = document.querySelector('.dashboard-card.shop-ratings');
  if (!shopRatingsContainer) {
    console.error('Dashboard shop ratings container (.dashboard-header .shop-ratings) not found');
    return;
  }

  for (let i = 5; i >= 1; i--) {
    const percentage = totalReviews > 0 ? Math.round((ratingCounts[i] || 0) / totalReviews * 100) : 0;
    console.log(`Processing ${i}-star rating: ${ratingCounts[i] || 0} reviews, ${percentage}%`);

    const row = shopRatingsContainer.querySelector(`.rating-breakdown .rating-row:nth-child(${6 - i})`);
    if (!row) {
      console.warn(`Rating row for ${i} stars not found. Selector: .rating-breakdown .rating-row:nth-child(${6 - i})`);
      continue;
    }

    const progressBar = row.querySelector('.progress-bar');
    const percentageElement = row.querySelector('.percentage');

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
      progressBar.offsetHeight;
      console.log(`Set progress bar width to ${percentage}% for ${i}-star rating`);
    } else {
      console.warn(`Progress bar not found for ${i}-star rating`);
    }

    if (percentageElement) {
      percentageElement.textContent = `${percentage}%`;
      console.log(`Set percentage text to ${percentage}% for ${i}-star rating`);
    } else {
      console.warn(`Percentage element not found for ${i}-star rating`);
    }
  }

  shopRatingsContainer.style.display = 'none';
  shopRatingsContainer.offsetHeight;
  shopRatingsContainer.style.display = 'block';
}

async function getCurrentUserData() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("Authenticated user UID:", user.uid);
        try {
          const userDoc = await getDoc(doc(db, "admin", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("User data from admin collection:", userData);
            resolve({ ...userData, sellerId: user.uid });
          } else {
            console.warn("No admin doc for UID:", user.uid);
            resolve({ sellerId: user.uid });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          reject(error);
        }
      } else {
        console.warn("No authenticated user found");
        resolve({ sellerId: null });
      }
    });
  });
}

async function fetchTopSellingProducts() {
  const productList = document.querySelector(".product-list");
  const fullList = document.getElementById("fullProductList");

  if (!productList || !fullList) {
    console.error("Product list elements not found:", { productList: !!productList, fullList: !!fullList });
    return;
  }

  try {
    productList.innerHTML = '<div class="text-center py-4">Loading...</div>';
    fullList.innerHTML = '<div class="text-center py-4">Loading...</div>';

    const userData = await getCurrentUserData();
    const currentSellerId = userData?.sellerId;
    if (!currentSellerId) {
      console.warn("No seller ID found");
      productList.innerHTML = '<div class="text-center py-4 text-red-500">No seller data available</div>';
      fullList.innerHTML = '<div class="text-center py-4 text-red-500">No seller data available</div>';
      return;
    }

    // Fetch orders
    const ordersQuery = query(
      collection(db, "orders"),
      where("sellerId", "==", currentSellerId),
      where("status", "==", "Completed")
    );
    const ordersSnapshot = await getDocs(ordersQuery);
    const productSales = new Map();

    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        const productId = item.productId?.trim();
        const quantity = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        // Prioritize imageUrls[0] from order item
        const imageUrl = Array.isArray(item.imageUrls) && item.imageUrls.length > 0 ? item.imageUrls[0]?.trim() : item.firstImageUrl?.trim() || "";
        if (!productId || quantity <= 0 || price <= 0) {
          console.warn("Invalid item data in order:", { orderId: doc.id, item });
          return;
        }
        if (!productSales.has(productId)) {
          productSales.set(productId, {
            name: item.name?.trim() || "Unknown",
            quantity: 0,
            revenue: 0,
            imageUrl: imageUrl
          });
        }
        const productData = productSales.get(productId);
        productData.quantity += quantity;
        productData.revenue += price * quantity;
        if (imageUrl && !productData.imageUrl) productData.imageUrl = imageUrl;
      });
    });

    const productSalesArray = Array.from(productSales.entries()).map(([id, data]) => ({ id, ...data }));
    if (productSalesArray.length === 0) {
      console.warn("No product sales found");
      productList.innerHTML = '<div class="text-center py-4 text-gray-500">No products sold yet</div>';
      fullList.innerHTML = '<div class="text-center py-4 text-gray-500">No products sold yet</div>';
      return;
    }

    // Fetch product details for fallback
    const productsQuery = query(collection(db, "products"), where("sellerId", "==", currentSellerId));
    const productsSnapshot = await getDocs(productsQuery);
    const productsMap = new Map();
    productsSnapshot.forEach(doc => {
      const productData = doc.data();
      productsMap.set(doc.id, {
        name: productData.name?.trim() || "Unknown",
        price: parseFloat(productData.price) || 0,
        imageUrl: Array.isArray(productData.imageUrls) && productData.imageUrls.length > 0
          ? productData.imageUrls[0]?.trim()
          : productData.firstImageUrl?.trim() || ""
      });
    });

    // Process image URLs
    for (const product of productSalesArray) {
      const productDetails = productsMap.get(product.id);
      let imageUrl = product.imageUrl;

      console.log(`Processing product ${product.name} (ID: ${product.id}):`, { orderImageUrl: product.imageUrl });

      // Use product collection image as fallback
      if (!imageUrl || !isValidUrl(imageUrl)) {
        if (productDetails && productDetails.imageUrl) {
          imageUrl = productDetails.imageUrl;
          console.log(`Falling back to product collection image URL: ${imageUrl}`);
        }
      }

      // Convert Firebase Storage path to download URL if necessary
      if (imageUrl && imageUrl.startsWith('gs://')) {
        try {
          const imageRef = ref(storage, imageUrl);
          imageUrl = await getDownloadURL(imageRef);
          console.log(`Resolved Firebase Storage URL for ${product.name}: ${imageUrl}`);
        } catch (error) {
          console.warn(`Failed to resolve Firebase Storage URL for ${product.name}: ${error.message}`);
          imageUrl = '';
        }
      }

      // Final validation: use placeholder if no valid image URL
      if (!imageUrl || !isValidUrl(imageUrl)) {
        console.warn(`No valid image URL for ${product.name}, using placeholder`);
        imageUrl = 'https://placehold.co/80x80';
      }

      product.imageUrl = imageUrl;
      if (productDetails) {
        product.name = productDetails.name; // Update name from products collection
        product.price = productDetails.price; // Update price if needed
      }
      console.log(`Final product ${product.id}:`, { name: product.name, imageUrl: product.imageUrl, price: product.price });
    }

    // Sort products by quantity
    const sortedProducts = productSalesArray.sort((a, b) => b.quantity - a.quantity);

    // Render top 5 products
    productList.innerHTML = "";
    const topContainer = document.createElement("div");
    topContainer.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";
    sortedProducts.slice(0, 5).forEach(product => {
      const card = document.createElement("div");
      card.className = "custom-card";
      card.innerHTML = `
        <div class="flex-shrink-0 mr-4">
          <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" class="w-20 h-20 object-cover rounded" loading="lazy" onerror="this.src='https://placehold.co/80x80'; console.warn('Failed to load image for ${escapeHtml(product.name)}: ${product.imageUrl}');">
        </div>
        <div class="product-container">
          <h1 class="product-name">${escapeHtml(product.name)}</h1>
          <p class="product-sold">Sold: ${product.quantity}</p>
          <p class="product-revenue">Revenue: ₱${product.revenue.toFixed(2)}</p>
        </div>
      `;
      topContainer.appendChild(card);
    });
    productList.appendChild(topContainer);

    // Render full product list
    fullList.innerHTML = "";
    const fullContainer = document.createElement("div");
    fullContainer.className = "space-y-4 max-h-[60vh] overflow-y-auto p-4";
    sortedProducts.forEach(product => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between p-3 bg-white rounded-md shadow-sm border-b border-gray-200";
      row.innerHTML = `
        <div class="flex items-center space-x-4 w-3/4">
          <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" class="w-12 h-12 object-cover rounded" loading="lazy" onerror="this.src='https://placehold.co/50x50'; console.warn('Failed to load image for ${escapeHtml(product.name)}: ${product.imageUrl}');">
          <span class="text-gray-800 font-medium truncate">${escapeHtml(product.name)}</span>
        </div>
        <span class="text-gray-600 text-center w-1/4">${product.quantity} sold</span>
      `;
      fullContainer.appendChild(row);
    });
    fullList.appendChild(fullContainer);
  } catch (err) {
    console.error("Error in fetchTopSellingProducts:", err);
    productList.innerHTML = '<div class="text-center py-4 text-red-500">Error loading products</div>';
    fullList.innerHTML = '<div class="text-center py-4 text-red-500">Error loading products</div>';
  }
}

// Enhanced URL validation function
function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch (error) {
    console.warn(`URL validation failed for ${url}: ${error.message}`);
    return false;
  }
}

async function countFollowers() {
  try {
    const userData = await getCurrentUserData();
    const currentUserId = userData.sellerId;

    if (!currentUserId) {
      console.warn("No user ID found for current user");
      updateFollowerCount(0);
      return 0;
    }

    const followersDocRef = doc(db, "followers", currentUserId);
    const followersDoc = await getDoc(followersDocRef);
    let followerCount = 0;

    if (followersDoc.exists()) {
      followerCount = followersDoc.data().totalFollowers || 0;
    } else {
      console.warn("No followers document found for user:", currentUserId);
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
  const followerCountElement = document.getElementById('followerCount');
  if (followerCountElement) {
    followerCountElement.textContent = `Followers: ${count}`;
  } else {
    console.warn("Follower count element not found");
  }
}

function updateNotificationButton(count) {
  const notificationBtn = document.querySelector('.notification-btn');
  const notificationBadge = document.getElementById('notificationCount');
  if (notificationBadge && notificationBtn) {
    console.log('Updating notification badge with count:', count);
    notificationBadge.textContent = count;
    notificationBadge.style.display = count > 0 ? 'flex' : 'none';
    notificationBtn.replaceWith(notificationBtn.cloneNode(true));
    const newBtn = document.querySelector('.notification-btn');
    newBtn.addEventListener('click', () => {
      window.openAllOrdersModal();
    });
  } else {
    console.warn("Notification elements not found");
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const ref = doc(db, 'orders', orderId);
    await updateDoc(ref, { status: newStatus });
    console.log(`Order ${orderId} updated to status: ${newStatus}`);
    await Promise.all([
      loadOrders(),
      loadOrderOverview(),
      fetchOrderStats(),
      loadOrderStatusOverview(),
      fetchPendingOrders(),
    ]);
  } catch (error) {
    console.error('Error updating order status:', error);
    alert('Error updating order: ' + error.message);
  }
}

async function fetchOrderStats() {
  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;
    if (!currentSellerId) {
      console.warn("No seller ID found for current user");
      updateNotificationButton(0);
      updateStatValues(0, 0, 0, 0, 0, 0);
      return;
    }

    const ordersQuery = query(
      collection(db, "orders"),
      where("sellerId", "==", currentSellerId)
    );

    onSnapshot(ordersQuery, (snapshot) => {
      let totalRevenue = 0;
      let totalOrders = 0;
      let pendingOrders = 0;
      let completedOrders = 0;
      let cancelledOrders = 0;
      let returnRefundOrders = 0;
      let toPayOrders = 0;
      let toShipOrders = 0;
      let toReceiveOrders = 0;

      console.log('Orders snapshot:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      snapshot.forEach(doc => {
        const order = doc.data();
        totalOrders++;
        const amount = parseFloat(order.totalAmount) || 0;
        if (isNaN(amount)) {
          console.warn(`Invalid totalAmount for order ${doc.id}: ${order.totalAmount}`);
          return;
        }
        const status = (order.status || "").toLowerCase().trim();

        switch (status) {
          case "completed":
            completedOrders++;
            totalRevenue += amount;
            break;
          case "pending":
            pendingOrders++;
            break;
          case "to pay":
          case "topay":
            toPayOrders++;
            break;
          case "to ship":
          case "toship":
            toShipOrders++;
            break;
          case "to receive":
          case "toreceive":
          case "to received":
            toReceiveOrders++;
            break;
          case "cancelled":
            cancelledOrders++;
            break;
          case "return":
          case "refunded":
            returnRefundOrders++;
            break;
          default:
            console.warn(`Unknown status for order ${doc.id}: ${status}`);
        }
      });

      console.log(`Total Revenue: ₱${totalRevenue.toFixed(2)}, Total Orders: ${totalOrders}, Pending: ${pendingOrders}, To Pay: ${toPayOrders}, To Ship: ${toShipOrders}, To Receive: ${toReceiveOrders}, Completed: ${completedOrders}, Cancelled: ${cancelledOrders}, Return/Refund: ${returnRefundOrders}`);

      updateStatValues(totalRevenue, totalOrders, pendingOrders, completedOrders, cancelledOrders, returnRefundOrders, toPayOrders, toShipOrders, toReceiveOrders);
    });
  } catch (error) {
    console.error("Error fetching order stats:", error);
    updateNotificationButton(0);
    updateStatValues(0, 0, 0, 0, 0, 0);
  }
}

function updateStatValues(totalRevenue, totalOrders, pendingOrders, completedOrders, cancelledOrders, returnRefundOrders, toPayOrders, toShipOrders, toReceiveOrders) {
  const statValues = document.querySelectorAll(".stat-value");
  if (statValues.length >= 9) {
    statValues[0].textContent = `₱${totalRevenue.toFixed(2)}`;
    statValues[1].textContent = totalOrders;
    statValues[2].textContent = pendingOrders;
    statValues[3].textContent = completedOrders;
    statValues[4].textContent = cancelledOrders;
    statValues[5].textContent = returnRefundOrders;
    statValues[6].textContent = toPayOrders;
    statValues[7].textContent = toShipOrders;
    statValues[8].textContent = toReceiveOrders;
  } else {
    console.warn(`Insufficient stat-value elements found: ${statValues.length} available, 9 required`);
    if (statValues[0]) statValues[0].textContent = `₱${totalRevenue.toFixed(2)}`;
    if (statValues[1]) statValues[1].textContent = totalOrders;
    if (statValues[2]) statValues[2].textContent = pendingOrders;
    if (statValues[3]) statValues[3].textContent = completedOrders;
    if (statValues[4]) statValues[4].textContent = cancelledOrders;
    if (statValues[5]) statValues[5].textContent = returnRefundOrders;
    if (statValues[6]) statValues[6].textContent = toPayOrders;
    if (statValues[7]) statValues[7].textContent = toShipOrders;
    if (statValues[8]) statValues[8].textContent = toReceiveOrders;
  }
}

async function loadOrders() {
  const ordersTbody = document.getElementById('ordersTableBody');
  const paginationContainer = document.getElementById('orders-pagination-numbers');
  if (!ordersTbody) {
    console.error('Orders table body not found');
    return;
  }

  ordersTbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn("No seller ID found for current user");
      ordersTbody.innerHTML = '<tr><td colspan="5">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    console.log("Querying pending orders for seller ID:", currentSellerId);
    const ordersQuery = query(
      collection(db, 'orders'),
      where("sellerId", "==", currentSellerId),
      where("status", "==", "Pending"),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} pending orders for all orders modal`);

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (orders.length === 0) {
      ordersTbody.innerHTML = '<tr><td colspan="5">No pending orders found</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const itemsPerPage = 5;
    let currentPage = 1;
    const totalPages = Math.ceil(orders.length / itemsPerPage);

    function renderPage(page) {
      ordersTbody.innerHTML = '';
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const paginatedOrders = orders.slice(start, end);

      paginatedOrders.forEach(order => {
        const raw = (order.status || '').toLowerCase();
        const disp = raw.charAt(0).toUpperCase() + raw.slice(1);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
          <td>${order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A'}</td>
          <td><span class="status ${raw}">${disp}</span></td>
          <td>
            <button class="btn confirm" data-id="${escapeHtml(order.id)}">Approve</button>
            <button class="btn cancel-order" data-id="${escapeHtml(order.id)}">Cancel Order</button>
            <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
          </td>
        `;
        ordersTbody.appendChild(tr);
      });

      document.querySelectorAll('.details-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          const orderId = icon.dataset.orderId;
          console.log(`Opening details for order ID: ${orderId}`);
          openOrderDetailsModal(orderId);
        });
      });

      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const prevBtn = document.querySelector('#orders-pagination .pagination-btn[data-page="prev"]');
        const nextBtn = document.querySelector('#orders-pagination .pagination-btn[data-page="next"]');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        for (let i = 1; i <= totalPages; i++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
          pageBtn.textContent = i;
          pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
          });
          paginationContainer.appendChild(pageBtn);
        }
      } else {
        console.warn('Orders pagination container not found');
      }
    }

    renderPage(currentPage);

    const prevBtn = document.querySelector('#orders-pagination .pagination-btn[data-page="prev"]');
    const nextBtn = document.querySelector('#orders-pagination .pagination-btn[data-page="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage(currentPage);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage(currentPage);
        }
      });
    }
  } catch (error) {
    console.error('Error loading orders:', error);
    ordersTbody.innerHTML = `<tr><td colspan="5">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}

async function fetchCompletedOrders() {
  const completedOrdersTableBody = document.getElementById('completedOrdersTableBody');
  const paginationContainer = document.getElementById('completed-orders-pagination-numbers');
  if (!completedOrdersTableBody) {
    console.error('Completed orders table body not found');
    return;
  }

  completedOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      completedOrdersTableBody.innerHTML = '<tr><td colspan="6">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentSellerId),
      where('status', '==', 'Completed'),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} completed orders for completed orders modal`);

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (orders.length === 0) {
      completedOrdersTableBody.innerHTML = '<tr><td colspan="6">No completed orders found</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const itemsPerPage = 5;
    let currentPage = 1;
    const totalPages = Math.ceil(orders.length / itemsPerPage);

    function renderPage(page) {
      completedOrdersTableBody.innerHTML = '';
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const paginatedOrders = orders.slice(start, end);

      paginatedOrders.forEach(order => {
        const statusRaw = (order.status || '').toLowerCase().trim();
        const statusDisplay = statusRaw === 'completed' ? 'Completed' :
                             statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
        const totalAmount = parseFloat(order.totalAmount) || 0;
        const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
          <td>${date}</td>
          <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
          <td>₱${totalAmount.toFixed(2)}</td>
          <td>
            <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
          </td>
        `;
        completedOrdersTableBody.appendChild(tr);
      });

      document.querySelectorAll('.details-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          const orderId = icon.dataset.orderId;
          openOrderDetailsModal(orderId);
        });
      });

      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const prevBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="prev"]');
        const nextBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="next"]');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        for (let i = 1; i <= totalPages; i++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
          pageBtn.textContent = i;
          pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
          });
          paginationContainer.appendChild(pageBtn);
        }
      } else {
        console.warn('Completed orders pagination container not found');
      }
    }

    renderPage(currentPage);

    const prevBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="prev"]');
    const nextBtn = document.querySelector('#completed-orders-pagination .pagination-btn[data-page="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage(currentPage);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage(currentPage);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching completed orders:', error);
    completedOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}

function openCompletedOrdersModal() {
  const modal = document.getElementById('completedOrdersModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    fetchCompletedOrders();
  } else {
    console.error('Completed orders modal not found');
  }
}

window.closeCompletedOrdersModal = function () {
  const modal = document.getElementById('completedOrdersModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  } else {
    console.error('Completed orders modal not found');
  }
};

window.openCompletedOrdersModal = openCompletedOrdersModal;

async function fetchCancelledOrders() {
  const cancelledOrdersTableBody = document.getElementById('cancelledOrdersTableBody');
  const paginationContainer = document.getElementById('cancelled-orders-pagination-numbers');
  if (!cancelledOrdersTableBody) {
    console.error('Cancelled orders table body not found');
    return;
  }

  cancelledOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      cancelledOrdersTableBody.innerHTML = '<tr><td colspan="6">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentSellerId),
      where('status', '==', 'Cancelled'),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} cancelled orders for cancelled orders modal`);

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (orders.length === 0) {
      cancelledOrdersTableBody.innerHTML = '<tr><td colspan="6">No cancelled orders found</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const itemsPerPage = 5;
    let currentPage = 1;
    const totalPages = Math.ceil(orders.length / itemsPerPage);

    function renderPage(page) {
      cancelledOrdersTableBody.innerHTML = '';
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const paginatedOrders = orders.slice(start, end);

      paginatedOrders.forEach(order => {
        const statusRaw = (order.status || '').toLowerCase().trim();
        const statusDisplay = statusRaw === 'cancelled' ? 'Canceled' :
                             statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
        const totalAmount = parseFloat(order.totalAmount) || 0;
        const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
          <td>${date}</td>
          <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
          <td>₱${totalAmount.toFixed(2)}</td>
          <td>
            <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
          </td>
        `;
        cancelledOrdersTableBody.appendChild(tr);
      });

      document.querySelectorAll('.details-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          const orderId = icon.dataset.orderId;
          openOrderDetailsModal(orderId);
        });
      });

      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const prevBtn = document.querySelector('#cancelled-orders-pagination .pagination-btn[data-page="prev"]');
        const nextBtn = document.querySelector('#cancelled-orders-pagination .pagination-btn[data-page="next"]');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        for (let i = 1; i <= totalPages; i++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
          pageBtn.textContent = i;
          pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
          });
          paginationContainer.appendChild(pageBtn);
        }
      } else {
        console.warn('Cancelled orders pagination container not found');
      }
    }

    renderPage(currentPage);

    const prevBtn = document.querySelector('#cancelled-orders-pagination .pagination-btn[data-page="prev"]');
    const nextBtn = document.querySelector('#cancelled-orders-pagination .pagination-btn[data-page="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage(currentPage);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage(currentPage);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching cancelled orders:', error);
    cancelledOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}

function openCancelledOrdersModal() {
  const modal = document.getElementById('cancelledOrdersModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    fetchCancelledOrders();
  } else {
    console.error('Cancelled orders modal not found');
  }
}

window.openCancelledOrdersModal = openCancelledOrdersModal;

window.closeCancelledOrdersModal = function () {
  const modal = document.getElementById('cancelledOrdersModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  } else {
    console.error('Cancelled orders modal not found');
  }
};

async function fetchReturnRefundOrders() {
  const returnRefundOrdersTableBody = document.getElementById('returnRefundOrdersTableBody');
  const paginationContainer = document.getElementById('return-refund-orders-pagination-numbers');
  if (!returnRefundOrdersTableBody) {
    console.error('Return/Refund orders table body not found');
    return;
  }

  returnRefundOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      returnRefundOrdersTableBody.innerHTML = '<tr><td colspan="6">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentSellerId),
      where('status', 'in', ['Return', 'Refunded']),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} return/refunded orders for return/refunded orders modal`);

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (orders.length === 0) {
      returnRefundOrdersTableBody.innerHTML = '<tr><td colspan="6">No return/refunded orders found</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const itemsPerPage = 5;
    let currentPage = 1;
    const totalPages = Math.ceil(orders.length / itemsPerPage);

    function renderPage(page) {
      returnRefundOrdersTableBody.innerHTML = '';
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const paginatedOrders = orders.slice(start, end);

      paginatedOrders.forEach(order => {
        const statusRaw = (order.status || '').toLowerCase().trim();
        const statusDisplay = statusRaw === 'return' || statusRaw === 'refunded' ? 'Return/Refunded' :
                             statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
        const totalAmount = parseFloat(order.totalAmount) || 0;
        const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
          <td>${date}</td>
          <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
          <td>₱${totalAmount.toFixed(2)}</td>
          <td>
            <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
          </td>
        `;
        returnRefundOrdersTableBody.appendChild(tr);
      });

      document.querySelectorAll('.details-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          const orderId = icon.dataset.orderId;
          openOrderDetailsModal(orderId);
        });
      });

      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const prevBtn = document.querySelector('#return-refund-orders-pagination .pagination-btn[data-page="prev"]');
        const nextBtn = document.querySelector('#return-refund-orders-pagination .pagination-btn[data-page="next"]');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        for (let i = 1; i <= totalPages; i++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
          pageBtn.textContent = i;
          pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
          });
          paginationContainer.appendChild(pageBtn);
        }
      } else {
        console.warn('Return/Refund orders pagination container not found');
      }
    }

    renderPage(currentPage);

    const prevBtn = document.querySelector('#return-refund-orders-pagination .pagination-btn[data-page="prev"]');
    const nextBtn = document.querySelector('#return-refund-orders-pagination .pagination-btn[data-page="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage(currentPage);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage(currentPage);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching return/refunded orders:', error);
    returnRefundOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}

function openReturnRefundOrdersModal() {
  const modal = document.getElementById('returnRefundOrdersModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    fetchReturnRefundOrders();
  } else {
    console.error('Return/Refund orders modal not found');
  }
}

window.openReturnRefundOrdersModal = openReturnRefundOrdersModal;

window.closeReturnRefundOrdersModal = function () {
  const modal = document.getElementById('returnRefundOrdersModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  } else {
    console.error('Return/Refund orders modal not found');
  }
};

async function loadOrderOverview() {
  const orderOverviewTableBody = document.getElementById('orderOverviewTableBody');
  if (!orderOverviewTableBody) return;

  orderOverviewTableBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    console.log("Current seller ID for overview:", currentSellerId);

    if (!currentSellerId) {
      console.warn("No seller ID found for current user");
      orderOverviewTableBody.innerHTML = '<tr><td colspan="3">Please log in as a seller to view orders</td></tr>';
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where("sellerId", "==", currentSellerId)
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} orders for overview`);

    orderOverviewTableBody.innerHTML = '';

    if (snap.empty) {
      orderOverviewTableBody.innerHTML = '<tr><td colspan="3">No recent orders.</td></tr>';
      return;
    }

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    orders.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp) : a.date ? new Date(a.date) : new Date(0);
      const dateB = b.timestamp ? new Date(b.timestamp) : b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    const recentOrders = orders.slice(0, 5);

    if (recentOrders.length === 0) {
      orderOverviewTableBody.innerHTML = '<tr><td colspan="3">No recent orders.</td></tr>';
      return;
    }

    recentOrders.forEach(order => {
      const statusRaw = (order.status || '').toLowerCase();
      const statusDisplay = statusRaw === 'cancelled' ? 'Canceled' : statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${order.id}</td>
        <td>${order.username || order.customerName || 'Unknown'}</td>
        <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
      `;
      orderOverviewTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading order overview:', error);
    orderOverviewTableBody.innerHTML = '<tr><td colspan="3">Error loading orders: ' + error.message + '</td></tr>';
  }
}



async function loadOrderStatusOverview() {
  console.log("Starting loadOrderStatusOverview");
  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData?.sellerId;

    if (!currentSellerId) {
      console.warn("No seller ID found for current user");
      updateTableWithNoData();
      return;
    }

    console.log(`Fetching orders for seller ID: ${currentSellerId}`);

    const ordersQuery = query(
      collection(db, "orders"),
      where("sellerId", "==", currentSellerId)
    );

    onSnapshot(ordersQuery, (ordersSnapshot) => {
      console.log(`Received snapshot with ${ordersSnapshot.size} orders`);

      const statusCounts = {
        "pending": { orders: 0, cancelled: 0 },
        "to pay": { orders: 0, cancelled: 0 },
        "to ship": { orders: 0, cancelled: 0 },
        "to receive": { orders: 0, cancelled: 0 },
        "completed": { orders: 0, cancelled: 0 },
        "cancelled": { orders: 0, cancelled: 0 },
        "return/refunded": { orders: 0, cancelled: 0 }
      };

      let totalOrders = 0;

      ordersSnapshot.forEach(doc => {
        const order = doc.data();
        let status = (order.status || "").toLowerCase().trim();

        // Normalize statuses
        if (status === "topay") {
          status = "to pay";
        } else if (status === "toship") {
          status = "to ship";
        } else if (status === "toreceive" || status === "to received") { // Add handling for "to received"
          status = "to receive";
        } else if (status === "return" || status === "refunded") {
          status = "return/refunded";
        }

        console.log(`Processing order ${doc.id} with status: ${status} (original: ${order.status})`);

        if (!order.status) {
          console.warn(`Order ${doc.id} has no status field`);
          return;
        }

        totalOrders++;

        if (statusCounts[status]) {
          statusCounts[status].orders++;
          if (status === "cancelled" || status === "return/refunded") {
            statusCounts[status].cancelled++;
          }
        } else {
          console.warn(`Unrecognized status for order ${doc.id}: ${status} (original: ${order.status})`);
        }
      });

      const tbody = document.querySelector(".order-status-overview tbody");
      if (!tbody) {
        console.error("Order status overview table body not found");
        return;
      }

      const statusMapping = {
        "Pending": "pending",
        "To Pay": "to pay",
        "To Ship": "to ship",
        "To Receive": "to receive",
        "Completed": "completed",
        "Cancelled": "cancelled",
        "Refund/Return": "return/refunded"
      };

      let rowsFound = 0;
      tbody.querySelectorAll("tr").forEach((row, index) => {
        const statusText = row.children[0]?.textContent?.trim();
        if (!statusText) {
          console.warn(`Row ${index} has no status text`);
          return;
        }

        const normalizedStatus = statusMapping[statusText];
        if (!normalizedStatus) {
          console.warn(`No mapping found for status: ${statusText}`);
          row.children[1].textContent = "0";
          row.children[2].textContent = "0";
          const progressFill = row.querySelector(".performance-fill");
          if (progressFill) progressFill.style.width = "0%";
          return;
        }

        rowsFound++;
        const { orders, cancelled } = statusCounts[normalizedStatus] || { orders: 0, cancelled: 0 };
        row.children[1].textContent = orders || "0";
        row.children[2].textContent = cancelled || "0";

        let progressPercent = totalOrders > 0 ? (orders / totalOrders) * 100 : 0;
        progressPercent = Math.min(progressPercent, 100).toFixed(0);

        const progressFill = row.querySelector(".performance-fill");
        if (progressFill) {
          progressFill.style.width = `${progressPercent}%`;
          console.log(`Updated ${statusText}: ${orders} orders, ${cancelled} cancelled, ${progressPercent}% progress`);
        } else {
          console.warn(`Progress fill not found for status: ${statusText}`);
        }
      });

      if (rowsFound === 0) {
        console.error("No valid rows found in order-status-overview table");
      }

      if (totalOrders === 0) {
        console.log("No orders found for the seller");
        updateTableWithNoData();
      }
    }, (error) => {
      console.error("Error in onSnapshot for order status overview:", error);
      updateTableWithNoData("Error");
    });
  } catch (error) {
    console.error("Error loading order status overview:", error);
    updateTableWithNoData("Error");
  }
}

function updateTableWithNoData(errorText = "0") {
  const tbody = document.querySelector(".order-status-overview tbody");
  if (tbody) {
    tbody.querySelectorAll("tr").forEach(row => {
      row.children[1].textContent = errorText;
      row.children[2].textContent = errorText;
      const progressFill = row.querySelector(".performance-fill");
      if (progressFill) progressFill.style.width = "0%";
    });
  } else {
    console.error("Order status overview table body not found in updateTableWithNoData");
  }
}

async function fetchTotalOrders() {
  const totalOrdersTableBody = document.getElementById('totalOrdersTableBody');
  const paginationContainer = document.getElementById('orders-pagination-numbers');
  if (!totalOrdersTableBody) {
    console.error('Total orders table body not found');
    return;
  }

  totalOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      totalOrdersTableBody.innerHTML = '<tr><td colspan="6">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentSellerId),
      orderBy('timestamp', 'desc')
    );

    const snap = await getDocs(ordersQuery);
    console.log(`Found ${snap.size} orders for total orders modal`);

    const orders = [];
    snap.forEach(docSnap => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (orders.length === 0) {
      totalOrdersTableBody.innerHTML = '<tr><td colspan="6">No orders found</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const itemsPerPage = 5;
    let currentPage = 1;
    const totalPages = Math.ceil(orders.length / itemsPerPage);

    function renderPage(page) {
      totalOrdersTableBody.innerHTML = '';
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const paginatedOrders = orders.slice(start, end);

      paginatedOrders.forEach(order => {
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(order.id)}</td>
          <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
          <td>${date}</td>
          <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
          <td>₱${totalAmount.toFixed(2)}</td>
          <td>
            <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
          </td>
        `;
        totalOrdersTableBody.appendChild(tr);
      });

      // Attach event listeners for details icons
      document.querySelectorAll('.details-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          const orderId = icon.dataset.orderId;
          openOrderDetailsModal(orderId);
        });
      });

      if (paginationContainer) {
        paginationContainer.innerHTML = '';
        const prevBtn = document.querySelector('.pagination-btn[data-page="prev"]');
        const nextBtn = document.querySelector('.pagination-btn[data-page="next"]');

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        // Create pagination buttons
        for (let i = 1; i <= totalPages; i++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
          pageBtn.textContent = i;
          pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderPage(currentPage);
          });
          paginationContainer.appendChild(pageBtn);
        }
      } else {
        console.warn('Pagination container not found');
      }
    }

    renderPage(currentPage);

    // Attach event listeners for prev/next buttons
    const prevBtn = document.querySelector('.pagination-btn[data-page="prev"]');
    const nextBtn = document.querySelector('.pagination-btn[data-page="next"]');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage(currentPage);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage(currentPage);
        }
      });
    } 
  } catch (error) {
    console.error('Error fetching total orders:', error);
    totalOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}

async function fetchPendingOrders() {
  const pendingOrdersTableBody = document.getElementById('pendingOrdersTableBody');
  const paginationContainer = document.getElementById('pending-orders-pagination-numbers');
  if (!pendingOrdersTableBody) {
    console.error('Pending orders table body not found');
    return;
  }

  pendingOrdersTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const userData = await getCurrentUserData();
    const currentSellerId = userData.sellerId;

    if (!currentSellerId) {
      console.warn('No seller ID found for current user');
      pendingOrdersTableBody.innerHTML = '<tr><td colspan="6">Please log in as a seller to view orders</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
      updateNotificationButton(0);
      return;
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('sellerId', '==', currentSellerId),
      where('status', '==', 'Pending'),
      orderBy('timestamp', 'desc')
    );

    onSnapshot(ordersQuery, (snap) => {
      console.log(`Found ${snap.size} pending orders for pending orders modal`);
      const orders = [];
      snap.forEach(docSnap => {
        orders.push({ id: docSnap.id, ...docSnap.data() });
      });

      updateNotificationButton(orders.length);

      if (orders.length === 0) {
        pendingOrdersTableBody.innerHTML = '<tr><td colspan="6">No pending orders found</td></tr>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }

      const itemsPerPage = 5;
      let currentPage = 1;
      const totalPages = Math.ceil(orders.length / itemsPerPage);

      function renderPage(page) {
        pendingOrdersTableBody.innerHTML = '';
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedOrders = orders.slice(start, end);

        paginatedOrders.forEach(order => {
          const statusRaw = (order.status || '').toLowerCase().trim();
          const statusDisplay = statusRaw === 'pending' ? 'Pending' :
                               statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
          const totalAmount = parseFloat(order.totalAmount) || 0;
          const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHtml(order.id)}</td>
            <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
            <td>${date}</td>
            <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
            <td>₱${totalAmount.toFixed(2)}</td>
            <td>
              <i class="fas fa-info-circle details-icon" data-order-id="${escapeHtml(order.id)}"></i>
            </td>
          `;
          pendingOrdersTableBody.appendChild(tr);
        });

        document.querySelectorAll('.details-icon').forEach(icon => {
          icon.addEventListener('click', () => {
            const orderId = icon.dataset.orderId;
            openOrderDetailsModal(orderId);
          });
        });

        if (paginationContainer) {
          paginationContainer.innerHTML = '';
          paginationContainer.classList.add('pagination-centered'); // Add class for centering

          const prevBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="prev"]');
          const nextBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="next"]');

          if (prevBtn) prevBtn.disabled = currentPage === 1;
          if (nextBtn) nextBtn.disabled = currentPage === totalPages;

          // Create pagination buttons
          for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => {
              currentPage = i;
              renderPage(currentPage);
            });
            paginationContainer.appendChild(pageBtn);
          }
        } else {
          console.warn('Pending orders pagination container not found');
        }
      }

      renderPage(currentPage);

      const prevBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="prev"]');
      const nextBtn = document.querySelector('#pending-orders-pagination .pagination-btn[data-page="next"]');

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            renderPage(currentPage);
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            renderPage(currentPage);
          }
        });
      }
    }, (error) => {
      console.error('Error in onSnapshot for pending orders:', error);
      pendingOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
      if (paginationContainer) paginationContainer.innerHTML = '';
      updateNotificationButton(0);
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    pendingOrdersTableBody.innerHTML = `<tr><td colspan="6">Error loading orders: ${escapeHtml(error.message)}</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
    updateNotificationButton(0);
  }
}

window.openTotalOrdersModal = function () {
  const modal = document.getElementById('totalOrdersModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    fetchTotalOrders();
  } else {
    console.error('Total orders modal not found');
  }
};

window.closeTotalOrdersModal = function () {
  const modal = document.getElementById('totalOrdersModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
};

window.openPendingOrdersModal = function () {
  const modal = document.getElementById('pendingOrdersModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    fetchPendingOrders();
  } else {
    console.error('Pending orders modal not found');
  }
};

window.closePendingOrdersModal = function () {
  const modal = document.getElementById('pendingOrdersModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
};

window.openOrderDetailsModal = async function (orderId) {
  const modal = document.getElementById('orderDetailsModal');
  if (!modal) {
    console.error('Order details modal not found');
    return;
  }
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  await populateOrderDetails(orderId);
};

window.closeOrderDetailsModal = function () {
  const modal = document.getElementById('orderDetailsModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
};

async function populateOrderDetails(orderId) {
  const detailsTableBody = document.getElementById('orderDetailsTableBody');
  const itemsTableBody = document.getElementById('orderItemsTableBody');
  const paymentProofContainer = document.getElementById('paymentProofContainer');
  if (!detailsTableBody || !itemsTableBody || !paymentProofContainer) {
    console.error('Order details table bodies or payment proof container not found');
    return;
  }

  detailsTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  itemsTableBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  paymentProofContainer.innerHTML = '<p>Loading payment proof...</p>';

  try {
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      console.warn(`Order ${orderId} not found`);
      detailsTableBody.innerHTML = '<tr><td colspan="6">Order not found</td></tr>';
      itemsTableBody.innerHTML = '<tr><td colspan="7">No items</td></tr>';
      paymentProofContainer.innerHTML = '<p>Order not found</p>';
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
    const paymentMethod = order.paymentMethod ? escapeHtml(order.paymentMethod) : 'N/A';

    detailsTableBody.innerHTML = `
      <tr>
        <td>${escapeHtml(orderId)}</td>
        <td>${escapeHtml(order.username || order.customerName || 'Unknown')}</td>
        <td>${date}</td>
        <td><span class="status ${statusRaw}">${statusDisplay}</span></td>
        <td>₱${totalAmount.toFixed(2)}</td>
        <td>${paymentMethod}</td>
      </tr>
    `;

    itemsTableBody.innerHTML = '';
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) {
      console.warn(`No items found for order ${orderId}`);
      itemsTableBody.innerHTML = '<tr><td colspan="7">No items found</td></tr>';
    } else {
      for (const item of items) {
        const quantity = parseInt(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const subtotal = (quantity * price).toFixed(2);
        const size = item.size ? escapeHtml(item.size) : 'N/A';
        const color = item.color ? escapeHtml(item.color) : 'N/A';
        let imageUrl = '';

        console.log(`Processing item ${item.name || 'Unknown'} (productId: ${item.productId || 'N/A'})`);

        // Check imageUrls array first
        if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
          imageUrl = item.imageUrls[0]?.trim() || '';
          console.log(`Found image URL in order item: ${imageUrl}`);
        }

        // If no valid imageUrl from item.imageUrls, try firstImageUrl
        if (!imageUrl || !isValidUrl(imageUrl)) {
          imageUrl = item.firstImageUrl?.trim() || '';
          console.log(`Using firstImageUrl from order item: ${imageUrl}`);
        }

        // If no valid image URL, try fetching from products collection
        if (!imageUrl || !isValidUrl(imageUrl)) {
          if (item.productId) {
            try {
              const productDoc = await getDoc(doc(db, 'products', item.productId));
              if (productDoc.exists()) {
                const productData = productDoc.data();
                imageUrl = productData.firstImageUrl?.trim() || '';
                console.log(`Fetched product image URL for ${item.productId}: ${imageUrl}`);
              } else {
                console.warn(`Product ${item.productId} not found in products collection`);
              }
            } catch (error) {
              console.warn(`Error fetching product ${item.productId}: ${error.message}`);
            }
          }
        }

        // If imageUrl is a Firebase Storage path (gs://), convert to download URL
        if (imageUrl && !imageUrl.startsWith('https://') && imageUrl.startsWith('gs://')) {
          try {
            const imageRef = ref(storage, imageUrl);
            imageUrl = await getDownloadURL(imageRef);
            console.log(`Resolved Firebase Storage URL for ${item.name || 'Unknown'}: ${imageUrl}`);
          } catch (error) {
            console.warn(`Failed to get download URL for ${item.name || 'Unknown'}: ${error.message}`);
            imageUrl = '';
          }
        }

        // Final validation: use placeholder if no valid image URL
        if (!imageUrl || !isValidUrl(imageUrl)) {
          imageUrl = 'https://placehold.co/50x50';
          console.log(`Using placeholder image for ${item.name || 'Unknown'}`);
        }

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name || 'Unknown')}" class="w-12 h-12 object-cover rounded" loading="lazy" onerror="this.src='https://placehold.co/50x50'; console.warn('Failed to load image for ${escapeHtml(item.name || 'Unknown')}: ${imageUrl}');">
          </td>
          <td>${escapeHtml(item.name || 'Unknown')}</td>
          <td>${size}</td>
          <td>${color}</td>
          <td>${quantity}</td>
          <td>₱${price.toFixed(2)}</td>
          <td>₱${subtotal}</td>
        `;
        itemsTableBody.appendChild(row);
      }
    }

    // Handle payment proof
    let paymentProofUrl = order.paymentProofUrl?.trim() || '';
    if (paymentProofUrl && !paymentProofUrl.startsWith('https://') && paymentProofUrl.startsWith('gs://')) {
      try {
        const imageRef = ref(storage, paymentProofUrl);
        paymentProofUrl = await getDownloadURL(imageRef);
        console.log(`Resolved payment proof URL: ${paymentProofUrl}`);
      } catch (error) {
        console.warn(`Failed to get payment proof download URL: ${error.message}`);
        paymentProofUrl = '';
      }
    }

    if (paymentProofUrl && isValidUrl(paymentProofUrl)) {
      paymentProofContainer.innerHTML = `
        <div class="payment-proof">
          <img src="${escapeHtml(paymentProofUrl)}" alt="Payment Proof" class="payment-proof-image cursor-pointer" loading="lazy" onclick="openFullImageModal('${escapeHtml(paymentProofUrl)}')" onerror="this.src='https://placehold.co/300x200'; console.warn('Failed to load payment proof image: ${escapeHtml(paymentProofUrl)}');">
        </div>
      `;
    } else {
      console.log(`No valid payment proof URL for order ${orderId}`);
      paymentProofContainer.innerHTML = '<p>No payment proof available</p>';
    }
  } catch (error) {
    console.error('Error populating order details:', error);
    detailsTableBody.innerHTML = `<tr><td colspan="6">Error loading order: ${escapeHtml(error.message)}</td></tr>`;
    itemsTableBody.innerHTML = `<tr><td colspan="7">Error loading items</td></tr>`;
    paymentProofContainer.innerHTML = `<p>Error loading payment proof: ${escapeHtml(error.message)}</p>`;
  }
}

window.openFullImageModal = function (imageUrl) {
  const modal = document.getElementById('fullImageModal');
  const fullImage = document.getElementById('fullImage');
  if (modal && fullImage) {
    fullImage.src = imageUrl;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  } else {
    console.error('Full image modal or image element not found');
  }
};

window.closeFullImageModal = function () {
  const modal = document.getElementById('fullImageModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
};

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    closeTotalOrdersModal();
    closePendingOrdersModal();
    closeOrderDetailsModal();
    closeAllOrdersModal();
    window.closeCompletedOrdersModal();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const shopRatingCard = document.getElementById('shopRatingCard');
const shopRatingModal = document.getElementById('shopRatingModal');
const closeShopRatingModal = document.getElementById('closeShopRatingModal');
  if (analytics) {
    logEvent(analytics, 'page_view', {
        page_title: 'Seller | Dashboard',
        page_location: window.location.href,
        page_path: window.location.pathname
    });
}
  initializeFilterDropdowns();
  await fetchSalesData();
  await fetchSalesOverview();
  const completedOrdersCard = document.getElementById('completedOrdersCard');
  if (completedOrdersCard) {
    completedOrdersCard.addEventListener('click', openCompletedOrdersModal);
  }
  const orderStatusCard = document.querySelector('.order-status-overview');
  if (orderStatusCard) {
    console.log('Order status overview card is present in DOM');
    orderStatusCard.style.display = 'block';
  } else {
    console.error('Order status overview card not found in DOM');
  }

  const totalOrdersCard = document.getElementById('totalOrdersCard');
  if (totalOrdersCard) {
    totalOrdersCard.addEventListener('click', openTotalOrdersModal);
  } else {
    console.warn('Total orders card not found');
  }

  const pendingOrdersCard = document.getElementById('pendingOrdersCard');
  if (pendingOrdersCard) {
    pendingOrdersCard.addEventListener('click', openPendingOrdersModal);
  } else {
    console.warn('Pending orders card not found');
  }

  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.overlay');
  const sidebarClose = document.querySelector('.sidebar-close');
  const mainContent = document.querySelector('.main-content');

  if (mobileMenuToggle && sidebar && overlay && sidebarClose && mainContent) {
    mobileMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
      mainContent.style.marginLeft = sidebar.classList.contains('active') ? '280px' : '0';
    });

    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      mainContent.style.marginLeft = '0';
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      mainContent.style.marginLeft = '0';
    });

    sidebar.querySelectorAll('nav a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('active');
          overlay.classList.remove('active');
          mainContent.style.marginLeft = '0';
        }
      });
    });

    if (window.innerWidth <= 768) {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      mainContent.style.marginLeft = '0';
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        mainContent.style.marginLeft = '280px';
      } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        mainContent.style.marginLeft = '0';
      }
    });
  }

  
  const ordersTbody = document.getElementById('ordersTableBody');
  const orderOverviewTableBody = document.getElementById('orderOverviewTableBody');

  

  setTimeout(() => {
    document.querySelectorAll('.dashboard-card').forEach(c => c.style.opacity = '1');
  }, 300);

  document.querySelectorAll('.product-item, .activity-item').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--grey-light)');
    item.addEventListener('mouseleave', () => item.style.backgroundColor = '');
  });

  const btnPrimary = document.querySelector('.btn-primary');
  if (btnPrimary) {
    btnPrimary.addEventListener('click', () => alert('New Order form would open here'));
  }

  const dateRange = document.getElementById('date-range');
  if (dateRange) {
    dateRange.addEventListener('change', function () {
      if (this.value === 'custom') alert('Custom date range picker would open here');
    });
  }

  const allOrdersModal = document.getElementById('allOrdersModal');
  if (allOrdersModal) {
    window.openAllOrdersModal = () => {
      allOrdersModal.classList.add('show');
      document.body.style.overflow = 'hidden';
      loadOrders();
    };
    window.closeAllOrdersModal = () => {
      allOrdersModal.classList.remove('show');
      document.body.style.overflow = '';
    };
  }

  if (ordersTbody) {
    ordersTbody.addEventListener('click', async (e) => {
      const btn = e.target;
      const id = btn.dataset.id;
      if (!id) return;
      try {
        if (btn.classList.contains('confirm')) {
          btn.disabled = true;
          btn.textContent = 'Approving...';
          try {
            console.log(`Approving order ${id} for sellerId: ${auth.currentUser.uid}`);
            await updateDoc(doc(db, 'orders', id), {
              status: 'To Pay',
              sellerId: auth.currentUser.uid
            });
            window.location.href = `transaction.html?highlightOrder=${encodeURIComponent(id)}`;
          } catch (error) {
            console.error('Error approving order:', error);
            alert('Failed to approve order: ' + error.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Approve';
          }
        }
        if (btn.classList.contains('cancel-order')) {
          await updateOrderStatus(id, 'Cancelled');
        }
      } catch (error) {
        console.error('Error handling order action:', error);
        alert('Error handling order: ' + error.message);
      }
    });
  }

  const reviewList = document.getElementById('review-list');
  const fullReviewList = document.getElementById('full-review-list');
  const modal = document.getElementById('all-reviews-modal');
  const viewAllBtn = document.getElementById('view-all-reviews');
  const closeModalBtn = document.getElementById('close-modal');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const noReviewsMessage = document.getElementById('no-reviews-message');
  const sortDropdown = document.getElementById('sort-reviews');
  const modalSortDropdown = document.getElementById('modal-sort-reviews');
  const searchInput = document.getElementById('search-reviews');
  const searchButton = document.getElementById('search-button');
  const paginationContainer = document.getElementById('pagination-numbers');
  const prevPageBtn = document.querySelector('.pagination-btn[data-page="prev"]');
  const nextPageBtn = document.querySelector('.pagination-btn[data-page="next"]');

  const reviews = [
    {
      id: 1,
      customerName: "CJ Ardeza",
      initials: "CA",
      avatar: null,
      rating: 5,
      title: "Absolutely love these slippers!",
      product: "Abaca Slippers",
      comment: "These slippers are so comfortable and well-made! The natural materials feel great on my feet and they're holding up well after several weeks of use. Will definitely buy again.",
      date: "2023-05-15T10:30:00",
      verified: true,
      helpful: 0,
      notHelpful: 0,
      userVote: null
    }
  ];

  if (reviewList) {
    let currentPage = 1;
    const reviewsPerPage = 5;
    let filteredReviews = [...reviews];

    populateReviewList();

    function renderStars(rating) {
      let starsHtml = '';
      for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
          starsHtml += '<i class="fas fa-star"></i>';
        } else if (i - 0.5 <= rating && i > rating) {
          starsHtml += '<i class="fas fa-star-half-alt"></i>';
        } else {
          starsHtml += '<i class="far fa-star"></i>';
        }
      }
      return starsHtml;
    }

    function formatDate(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
      return `${Math.floor(diffDays / 365)} years ago`;
    }

    function renderReviewItem(review) {
      let avatarHtml = review.avatar
        ? `<img src="${review.avatar}" alt="${review.customerName}">`
        : review.initials;
      const verifiedBadge = review.verified
        ? `<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified Purchase</span>`
        : '';
      const helpfulActive = review.userVote === 'helpful' ? 'active' : '';
      const notHelpfulActive = review.userVote === 'not-helpful' ? 'active' : '';

      return `
        <div class="review-item" data-id="${review.id}" data-rating="${review.rating}">
          <div class="review-avatar">${avatarHtml}</div>
          <div class="review-content">
            <div class="review-header">
              <div class="reviewer-info">
                <span class="reviewer-name">${review.customerName}</span>
                <span class="review-date">${formatDate(review.date)}</span>
              </div>
              <div class="review-rating">
                <div class="review-stars">${renderStars(review.rating)}</div>
                ${verifiedBadge}
              </div>
            </div>
            <h4 class="review-title">${review.title}</h4>
            <p class="review-text">${review.comment}</p>
            <span class="review-product">${review.product}</span>
            <div class="review-footer">
              <div class="review-helpful">
                <span class="helpful-text">Was this review helpful?</span>
                <div class="helpful-buttons">
                  <button class="helpful-btn ${helpfulActive}" data-vote="helpful" data-review-id="${review.id}">
                    <i class="fas fa-thumbs-up"></i> Yes
                    <span class="helpful-count">(${review.helpful})</span>
                  </button>
                  <button class="helpful-btn ${notHelpfulActive}" data-vote="not-helpful" data-review-id="${review.id}">
                    <i class="fas fa-thumbs-down"></i> No
                    <span class="helpful-count">(${review.notHelpful})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function populateReviewList() {
      if (!reviewList) return;
      reviewList.innerHTML = '';
      const sortValue = sortDropdown?.value || 'recent';
      const sortedReviews = sortReviews([...reviews], sortValue);
      const displayedReviews = sortedReviews.slice(0, 4);

      displayedReviews.forEach(review => {
        reviewList.innerHTML += renderReviewItem(review);
      });
      addHelpfulButtonListeners();
    }

    function populateFullReviewList() {
      if (!fullReviewList || !noReviewsMessage) return;
      fullReviewList.innerHTML = '';

      if (filteredReviews.length === 0) {
        noReviewsMessage.style.display = 'block';
        fullReviewList.style.display = 'none';
        if (document.getElementById('reviews-pagination')) {
          document.getElementById('reviews-pagination').style.display = 'none';
        }
      } else {
        noReviewsMessage.style.display = 'none';
        fullReviewList.style.display = 'flex';
        if (document.getElementById('reviews-pagination')) {
          document.getElementById('reviews-pagination').style.display = 'flex';
        }

        const startIndex = (currentPage - 1) * reviewsPerPage;
        const endIndex = startIndex + reviewsPerPage;
        const paginatedReviews = filteredReviews.slice(startIndex, endIndex);

        paginatedReviews.forEach(review => {
          fullReviewList.innerHTML += renderReviewItem(review);
        });

        updatePagination();
        addHelpfulButtonListeners();
      }
    }

    function sortReviews(reviewsToSort, sortOption) {
      switch (sortOption) {
        case 'recent':
          return reviewsToSort.sort((a, b) => new Date(b.date) - new Date(a.date));
        case 'highest':
          return reviewsToSort.sort((a, b) => b.rating - a.rating);
        case 'lowest':
          return reviewsToSort.sort((a, b) => a.rating - b.rating);
        case 'helpful':
          return reviewsToSort.sort((a, b) => b.helpful - a.helpful);
        default:
          return reviewsToSort;
      }
    }

    function filterReviewsByRating(rating) {
      if (rating === 'all') {
        filteredReviews = [...reviews];
      } else {
        filteredReviews = reviews.filter(review => review.rating === parseInt(rating));
      }

      if (modalSortDropdown) {
        filteredReviews = sortReviews(filteredReviews, modalSortDropdown.value);
      }

      currentPage = 1;
      populateFullReviewList();
    }

    function searchReviews(query) {
      if (!query.trim()) {
        filteredReviews = [...reviews];
      } else {
        query = query.toLowerCase();
        filteredReviews = reviews.filter(
          review =>
            review.title.toLowerCase().includes(query) ||
            review.comment.toLowerCase().includes(query) ||
            review.product.toLowerCase().includes(query) ||
            review.customerName.toLowerCase().includes(query)
        );
      }

      const activeFilter = document.querySelector('.filter-btn.active')?.dataset.rating;
      if (activeFilter && activeFilter !== 'all') {
        filteredReviews = filteredReviews.filter(review => review.rating === parseInt(activeFilter));
      }

      filteredReviews = sortReviews(filteredReviews, modalSortDropdown?.value || 'recent');
      currentPage = 1;
      populateFullReviewList();
    }

    function updatePagination() {
      if (!paginationContainer) return;
      const totalPages = Math.ceil(filteredReviews.length / reviewsPerPage);
      paginationContainer.innerHTML = '';

      if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
      if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;

      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + 4);

      if (endPage - startPage < 4 && startPage > 1) {
        startPage = Math.max(1, endPage - 4);
      }

      for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage ? 'active' : '';
        paginationContainer.innerHTML += `
          <button class="page-number ${isActive}" data-page="${i}">${i}</button>
        `;
      }

      document.querySelectorAll('.page-number').forEach(btn => {
        btn.addEventListener('click', () => {
          currentPage = parseInt(btn.dataset.page);
          populateFullReviewList();
        });
      });
    }

    function addHelpfulButtonListeners() {
      document.querySelectorAll('.helpful-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const reviewId = parseInt(btn.dataset.reviewId);
          const voteType = btn.dataset.vote;
          const review = reviews.find(r => r.id === reviewId);

          if (review) {
            if (review.userVote === voteType) {
              if (voteType === 'helpful') review.helpful--;
              else review.notHelpful--;
              review.userVote = null;
            } else if (review.userVote) {
              if (review.userVote === 'helpful') {
                review.helpful--;
                review.notHelpful++;
              } else {
                review.helpful++;
                review.notHelpful--;
              }
              review.userVote =
              review.userVote = voteType;
            } else {
              if (voteType === 'helpful') review.helpful++;
              else review.notHelpful++;
              review.userVote = voteType;
            }

            if (modal?.classList.contains('active')) {
              populateFullReviewList();
            } else {
              populateReviewList();
            }
          }
        });
      });
    }

    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        filterBtns.forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.rating === 'all') btn.classList.add('active');
        });

        if (modalSortDropdown && sortDropdown) modalSortDropdown.value = sortDropdown.value;
        filteredReviews = sortReviews([...reviews], modalSortDropdown?.value || 'recent');
        currentPage = 1;

        populateFullReviewList();
        if (modal) {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    }

    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => {
        if (modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
        populateReviewList();
      });
    }

    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
          populateReviewList();
        }
      });
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterReviewsByRating(btn.dataset.rating);
      });
    });

    if (sortDropdown) {
      sortDropdown.addEventListener('change', () => {
        populateReviewList();
      });
    }

    if (modalSortDropdown) {
      modalSortDropdown.addEventListener('change', () => {
        filteredReviews = sortReviews(filteredReviews, modalSortDropdown.value);
        populateFullReviewList();
      });
    }

    if (searchButton) {
      searchButton.addEventListener('click', () => {
        if (searchInput) searchReviews(searchInput.value);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('keyup', e => {
        if (e.key === 'Enter') {
          searchReviews(searchInput.value);
        }
      });
    }

    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          populateFullReviewList();
        }
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredReviews.length / reviewsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          populateFullReviewList();
        }
      });
    }
  }

  const topBtn = document.getElementById('viewAllTopProductsBtn');
  const topModal = document.getElementById('viewAllTopProductsModal');
  const topClose = document.getElementById('closeTopProductsModal');
  
  if (topBtn && topModal && topClose) {
    topBtn.addEventListener('click', () => {
      topModal.classList.add('show');
      document.body.style.overflow = 'hidden';
      fetchTopSellingProducts();
    });
    topClose.addEventListener('click', () => {
      topModal.classList.remove('show');
      document.body.style.overflow = '';
    });
    window.addEventListener('click', e => {
      if (e.target === topModal) {
        topModal.classList.remove('show');
        document.body.style.overflow = '';
      }
    });
  }

  async function initializeOrderFunctions() {
    try {
      if (orderOverviewTableBody) await loadOrderOverview();
      if (ordersTbody) await loadOrders();
      await loadOrderStatusOverview();
      await fetchPendingOrders();
      await fetchEventAnnouncements();
    } catch (error) {
      console.error('Error initializing order functions:', error);
    }
  }

  await initializeOrderFunctions();
  await fetchTopSellingProducts();
  await calculateShopRating();
  await countFollowers();
  await fetchOrderStats();
});