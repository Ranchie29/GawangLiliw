import { db, doc, getDoc, updateDoc, auth, query, collection, where, getDocs, addDoc, onSnapshot } from './firebase-config.js';

document.addEventListener("DOMContentLoaded", () => {
  console.log("Orders.js script loaded");

  // DOM elements
  const statusSelect = document.getElementById("statusSelect");
  const confirmStatusBtn = document.getElementById("confirmStatusBtn");
  const editTrackingBtn = document.getElementById("editTrackingBtn");
  const saveTrackingBtn = document.getElementById("saveTrackingBtn");
  const trackingViewMode = document.getElementById("trackingViewMode");
  const trackingEditMode = document.getElementById("trackingEditMode");
  const courierSelect = document.getElementById("courierSelect");
  const trackingIdInput = document.getElementById("trackingIdInput");
  const emptyTrackingMsg = document.getElementById("emptyTrackingMsg");
  const trackingInfo = document.querySelector('.tracking-info');
  const statusPill = document.querySelector(".status-pill");
  const statusBadges = document.querySelectorAll(".status-badge");
  const statusUpdateSection = document.querySelector(".status-update-section");

  const trackingValidationMessage = document.createElement("div");
  if (trackingIdInput && trackingIdInput.parentNode) {
    trackingValidationMessage.className = "tracking-validation-message";
    trackingValidationMessage.style.color = "red";
    trackingValidationMessage.style.fontSize = "12px";
    trackingValidationMessage.style.marginTop = "4px";
    trackingValidationMessage.style.display = "none";
    trackingIdInput.parentNode.appendChild(trackingValidationMessage);
  }

  const courierDisplayElements = document.querySelectorAll("[id='courierDisplay']");
  const trackingIdDisplayElements = document.querySelectorAll("[id='trackingIdDisplay']");
  const orderIdDisplayTop = document.getElementById("orderIdDisplayTop") || { textContent: "" };
  const orderIdDisplayBottom = document.getElementById("orderIdDisplayBottom");
  const customerNameSummary = document.getElementById("customerNameSummary") || { textContent: "" };
  const customerNameDetails = document.getElementById("customerNameDetails");
  const addressDisplay = document.getElementById("addressDisplay");
  const paymentMethodDisplay = document.getElementById("paymentMethodDisplay");
  const orderDateDisplay = document.getElementById("orderDateDisplay");
  const orderStatusDisplay = document.getElementById("orderStatusDisplay");
  const productsTableBody = document.getElementById("productsTableBody");
  const totalDisplay = document.getElementById("orderTotal");

  let initialStatus, initialCourier, initialTrackingId;
  let orderData;

  if (!productsTableBody || !totalDisplay) {
    console.error("Critical DOM elements are missing. Check HTML structure.");
    alert("Error: Page elements not found. Please reload or contact support.");
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("id");

  if (!orderId) {
    console.error("No order ID found in URL");
    alert("No order ID found in URL. Please navigate from the transactions page.");
    return;
  }

  console.log("Attempting to fetch order:", orderId);

  if (!db) {
    console.error("Firebase database not initialized correctly");
    alert("Database connection error. Please refresh the page or try again later.");
    return;
  }

  // Function to populate courier dropdown with only J&T Express Philippines
  async function populateCourierDropdown() {
    if (!courierSelect) {
      console.error("Courier select element not found.");
      return;
    }

    try {
      const response = await fetch("http://localhost:3000/api/couriers", {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Proxy API response for couriers:", data);

      courierSelect.innerHTML = '<option value="" disabled selected>Select a courier</option>';

      if (data?.data?.couriers && Array.isArray(data.data.couriers)) {
        const jntCourier = data.data.couriers.find(courier => courier.name === "J&T Express Philippines");
        if (jntCourier) {
          const option = document.createElement("option");
          option.value = jntCourier.name;
          option.textContent = jntCourier.name;
          courierSelect.appendChild(option);

          if (initialCourier === "J&T Express Philippines") {
            courierSelect.value = initialCourier;
          }
        } else {
          console.warn("J&T Express Philippines not found in API response.");
          courierSelect.innerHTML = '<option value="" disabled selected>No couriers available</option>';
          saveTrackingBtn.disabled = true;
        }
      } else {
        console.warn("No couriers found in API response.");
        courierSelect.innerHTML = '<option value="" disabled selected>No couriers available</option>';
        saveTrackingBtn.disabled = true;
      }
    } catch (err) {
      console.error("Error fetching couriers from proxy API:", err);
      courierSelect.innerHTML = '<option value="" disabled selected>No couriers available</option>';
      saveTrackingBtn.disabled = true;
      alert("Failed to load courier options. Please try again later.");
    }
  }

  populateCourierDropdown();

  function validateJntTrackingId(trackingId) {
    const jntPattern = /^(JT|JX)\d{10,13}$/;
    return jntPattern.test(trackingId);
  }

  const courierFormats = {
    "J&T Express Philippines": {
      prefix: ["JT", "JX"],
      minLength: 13,
      maxLength: 15,
      pattern: /^(JT|JX)\d{10,13}$/,
      format: (value) => {
        let formatted = value.toUpperCase().replace(/[^JTX0-9]/g, "");
        if (formatted.length > 0 && !formatted.startsWith("JT") && !formatted.startsWith("JX")) {
          formatted = "JT" + formatted;
        }
        if (formatted.length > 15) formatted = formatted.substring(0, 15);
        return formatted;
      }
    },
    default: {
      format: (v) => v,
      pattern: /.*/
    }
  };

  const courierSlugs = {
    "J&T Express Philippines": "jtexpress-ph",
    default: "jtexpress-ph"
  };

  async function updateTrackingInfo(trackingId, title, note) {
    try {
      const response = await fetch(`http://localhost:3000/api/trackings/${trackingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: title,
          note: note
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("AfterShip tracking update response:", data);
      return data;
    } catch (err) {
      console.error("Failed to update tracking info for", trackingId, ":", err);
      throw err;
    }
  }

  async function checkTrackingStatus(trackingId) {
    try {
      const slug = "jtexpress-ph";
      const response = await fetch(`http://localhost:3000/api/trackings?tracking_numbers=${trackingId}&slug=${slug}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("AfterShip tracking status response:", data);

      const tracking = data?.data?.trackings?.find(t => t.tracking_number === trackingId);
      if (tracking) {
        const status = tracking.tag;
        console.log("Tracking Status for", trackingId, ":", status);

        if (status === "InTransit") {
          console.log("Package is In Transit.");
          const orderRef = doc(db, "orders", orderId);
          await updateDoc(orderRef, { status: "Shipped" });
          updateOrderStatus("Shipped");
          alert("Package is in transit and status updated to Shipped.");
          if (orderData.userId) {
            await sendStatusUpdateMessage(orderData.userId, orderId, "Shipped", orderData);
          }
        } else if (status === "OutForDelivery" || status === "Delivered") {
          if (status === "Delivered") {
            console.log("Package is Delivered.");
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, { status: "Completed" });
            updateOrderStatus("Completed");
            alert("Package has been delivered and status updated to Completed.");
            if (orderData.userId) {
              await sendStatusUpdateMessage(orderData.userId, orderId, "Completed", orderData);
            }
          } else if (status === "OutForDelivery") {
            console.log("Package is Out for Delivery.");
            const orderRef = doc(db, "orders", orderId);
            await updateDoc(orderRef, { status: "To Received" });
            updateOrderStatus("To Received");
            alert("Package is out for delivery and status updated to To Received.");
            if (orderData.userId) {
              await sendStatusUpdateMessage(orderData.userId, orderId, "To Received", orderData);
            }
          }
        } else {
          console.log("Package is not yet Shipped, To Received, or Delivered. Current status:", status);
          alert(`Current tracking status: ${status}. No action taken.`);
        }
      } else {
        console.log("No tracking data found for ID:", trackingId);
        alert(`No tracking data found for ID: ${trackingId}`);
      }
    } catch (err) {
      console.error("Failed to check tracking status for", trackingId, ":", err);
      alert(`Failed to check tracking status. Error: ${err.message}`);
    }
  }

  const orderRef = doc(db, "orders", orderId);
  const unsubscribe = onSnapshot(orderRef, async (orderSnap) => {
    try {
      if (!orderSnap.exists()) {
        console.error("Order not found in database:", orderId);
        alert("Order not found. It may have been deleted or the ID is incorrect.");
        unsubscribe();
        return;
      }

      console.log("Order data retrieved in real-time");
      orderData = orderSnap.data();
      console.log("Order data:", orderData);

      initialStatus = orderData.status || "To Pay";
      initialCourier = orderData.courier || "";
      initialTrackingId = orderData.trackingId || "";

      if (orderIdDisplayBottom) orderIdDisplayBottom.textContent = orderId;
      if (orderIdDisplayTop) orderIdDisplayTop.textContent = orderId;

      if (addressDisplay) {
        const phone = orderData.customerPhone || 'No phone provided';
        const address = orderData.customerAddress || 'No address provided';
        const label = orderData.customerLabel || 'No label provided';
        addressDisplay.textContent = `${address}\nPhone: ${phone}\nLabel: ${label}`;
        addressDisplay.style.whiteSpace = 'pre-line';
      }
      if (paymentMethodDisplay) paymentMethodDisplay.textContent = orderData.paymentMethod || "Not Available";

      if (orderDateDisplay && orderData.timestamp) {
        let orderDate;
        if (orderData.timestamp.toDate) {
          orderDate = orderData.timestamp.toDate();
        } else if (typeof orderData.timestamp.seconds === 'number') {
          orderDate = new Date(orderData.timestamp.seconds * 1000);
        } else {
          orderDate = new Date(orderData.timestamp);
        }
        orderDateDisplay.textContent = orderDate.toLocaleDateString(undefined, {
          year: 'numeric', month: 'long', day: 'numeric',
        });
      } else if (orderDateDisplay) {
        orderDateDisplay.textContent = "Not Available";
      }

      if (statusSelect) statusSelect.value = initialStatus;
      if (courierSelect && initialCourier === "J&T Express Philippines") courierSelect.value = initialCourier;
      if (trackingIdInput) trackingIdInput.value = initialTrackingId;

      updateTrackingDisplay(initialCourier, initialTrackingId);
      updateOrderStatus(initialStatus);

      await renderOrderDetails(orderData);
      checkStatusModifiable(initialStatus);

      if (orderData.userId) {
        try {
          const userRef = doc(db, "users", orderData.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const username = userData?.username || "No Username";
            if (customerNameSummary) customerNameSummary.textContent = username;
            if (customerNameDetails) customerNameDetails.textContent = username;
          } else {
            console.warn("User not found:", orderData.userId);
            if (customerNameSummary) customerNameSummary.textContent = "User not found";
            if (customerNameDetails) customerNameDetails.textContent = "User not found";
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          if (customerNameSummary) customerNameSummary.textContent = "Error Loading Name";
          if (customerNameDetails) customerNameDetails.textContent = "Error Loading Name";
        }
      } else {
        console.warn("User ID missing in order data");
        if (customerNameSummary) customerNameSummary.textContent = "User ID missing";
        if (customerNameDetails) customerNameDetails.textContent = "User ID missing";
      }

      if (initialCourier === "J&T Express Philippines" && initialTrackingId) {
        const isValid = validateJntTrackingId(initialTrackingId);
        if (!isValid) {
          console.warn("Stored J&T tracking ID is invalid:", initialTrackingId);
          alert(`Invalid J&T tracking ID stored: ${initialTrackingId}. Please update to a valid tracking ID.`);
        } else {
          await checkTrackingStatus(initialTrackingId);
        }
      }

      if (trackingIdInput && courierSelect) {
        const event = new Event('input', { bubbles: true });
        trackingIdInput.dispatchEvent(event);
      }

    } catch (error) {
      console.error("Error in order details real-time update:", error);
      alert("Failed to load order details in real-time. Please try again later.");
      unsubscribe();
    }
  }, (error) => {
    console.error("Real-time listener error:", error);
    alert("Real-time data connection lost. Please refresh the page.");
  });

  if (trackingIdInput) {
    trackingIdInput.addEventListener("input", function() {
      const selectedCourier = courierSelect.value;
      const formatRules = courierFormats[selectedCourier] || courierFormats.default;

      let value = formatRules.format(this.value);
      this.value = value;

      const isValid = formatRules.pattern.test(value);
      console.log(`Validating ${selectedCourier || 'no courier'} tracking ID:`, value, "Valid:", isValid);

      if (!selectedCourier || selectedCourier === "" || (value && !isValid)) {
        let message = selectedCourier ? `Invalid ${selectedCourier} tracking ID format.` : "Please select J&T Express Philippines.";
        if (selectedCourier === "J&T Express Philippines" && !value.startsWith("JT") && !value.startsWith("JX")) {
          message += " Must start with JT or JX.";
        } else if (value.length < (formatRules.minLength || 0)) {
          message += ` Need ${formatRules.minLength - value.length} more characters.`;
        }
        trackingValidationMessage.textContent = message;
        trackingValidationMessage.style.display = "block";
        saveTrackingBtn.disabled = true;
        this.style.borderColor = "#ff4d4f";
        this.style.backgroundColor = "#fff1f0";
      } else {
        trackingValidationMessage.style.display = "none";
        saveTrackingBtn.disabled = false;
        this.style.borderColor = "";
        this.style.backgroundColor = "";
      }
    });
  }

  if (courierSelect) {
    if (initialCourier === "J&T Express Philippines") {
      courierSelect.value = initialCourier;
      if (trackingIdInput && initialTrackingId) {
        const formatRules = courierFormats[initialCourier] || courierFormats.default;
        trackingIdInput.value = formatRules.format(initialTrackingId);
      }
    }
    courierSelect.addEventListener("change", function() {
      console.log("Courier changed to:", this.value);
      if (trackingIdInput) {
        const formatRules = courierFormats[this.value] || courierFormats.default;
        trackingIdInput.value = formatRules.format(trackingIdInput.value || "");
        const event = new Event('input', { bubbles: true });
        trackingIdInput.dispatchEvent(event);
      }
    });
  }

  if (editTrackingBtn) {
    editTrackingBtn.addEventListener("click", () => {
      if (trackingViewMode) trackingViewMode.style.display = "none";
      if (trackingEditMode) trackingEditMode.style.display = "grid";
      if (courierSelect && initialCourier === "J&T Express Philippines") courierSelect.value = initialCourier;
      if (trackingIdInput && initialTrackingId) {
        const formatRules = courierFormats[initialCourier] || courierFormats.default;
        trackingIdInput.value = formatRules.format(initialTrackingId || "");
      }
      if (trackingIdInput) {
        const event = new Event('input', { bubbles: true });
        trackingIdInput.dispatchEvent(event);
      }
      editTrackingBtn.style.display = "none";
    });
  }

  if (saveTrackingBtn) {
    saveTrackingBtn.addEventListener("click", async () => {
      if (!courierSelect || !trackingIdInput) {
        alert("Form elements not found.");
        return;
      }

      const courier = courierSelect.value.trim();
      const trackingId = trackingIdInput.value.trim();

      if (!courier || !trackingId) {
        alert(courier ? "Tracking ID must be provided." : "Please select J&T Express Philippines and provide a tracking ID.");
        return;
      }

      if (courier !== "J&T Express Philippines") {
        alert("Only J&T Express Philippines is supported.");
        return;
      }

      const formatRules = courierFormats[courier] || courierFormats.default;
      if (trackingId && !formatRules.pattern.test(trackingId)) {
        trackingValidationMessage.textContent = `Invalid ${courier} tracking ID format.`;
        trackingValidationMessage.style.display = "block";
        alert(`Cannot save: Invalid ${courier} tracking ID format.`);
        return;
      }

      try {
        // Step 1: Update Firebase
        const orderRef = doc(db, "orders", orderId);
        try {
          await updateDoc(orderRef, { courier, trackingId });
          console.log("Firebase updated successfully with courier:", courier, "trackingId:", trackingId);
          updateTrackingDisplay(courier, trackingId);
        } catch (firebaseError) {
          console.error("Failed to update Firebase:", firebaseError);
          alert(`Failed to update tracking info in database. Error: ${firebaseError.message}`);
          return;
        }

        // Step 2: Register with AfterShip
        const slug = "jtexpress-ph";
        const customer = orderData.userId ? await getCustomerDetails(orderData.userId) : {
          role: "buyer",
          name: "Unknown Buyer",
          email: "email@yourdomain.com",
          phone_number: "+18555072501",
          language: "en"
        };
        let shipDate;
        if (orderData.timestamp && orderData.timestamp.toDate) {
          shipDate = orderData.timestamp.toDate().toISOString().split('T')[0] + "T20:00:00+08:00";
        } else if (orderData.timestamp && typeof orderData.timestamp.seconds === 'number') {
          shipDate = new Date(orderData.timestamp.seconds * 1000).toISOString().split('T')[0] + "T20:00:00+08:00";
        } else {
          const now = new Date();
          now.setHours(20, 0, 0, 0);
          shipDate = now.toISOString().replace(/\.\d{3}Z$/, '+08:00');
        }
        const body = JSON.stringify({
          slug: slug,
          tracking_number: trackingId,
          title: `Order #${orderId}`,
          customers: [customer],
          last_mile: { slug: "ups", tracking_number: "61293150000079650811" },
          tracking_ship_date: shipDate,
          order_id: orderId,
          order_number: orderId,
          order_id_path: `http://yourdomain.com/order_id=${orderId}`,
          custom_fields: {
            product_name: orderData.items?.[0]?.name || "Unknown Product",
            product_price: orderData.items?.[0]?.price ? `USD${orderData.items[0].price}` : "USD19.99"
          },
          language: "en",
          order_promised_delivery_date: "2025-01-20",
          delivery_type: "pickup_at_store",
          pickup_location: "Flagship Store",
          pickup_note: "Reach out to our staff when you arrive at our store for shipment pickup",
          origin_country_region: "CHN",
          origin_state: "Beijing",
          origin_city: "Beijing",
          origin_postal_code: "065001",
          origin_raw_location: "Lihong Gardon 4A 2301, Chaoyang District, Beijing, BJ, 065001, CHN, China",
          destination_country_region: "USA",
          destination_state: "New York",
          destination_city: "New York City",
          destination_postal_code: "10001",
          destination_raw_location: "13th Street, New York, NY, 10011, USA, United States"
        });

        try {
          const response = await fetch("http://localhost:3000/api/trackings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: body
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
          }

          const responseData = await response.json();
          console.log("AfterShip tracking registration response:", responseData);

          // Step 3: Update tracking info with PUT request
          try {
            await updateTrackingInfo(trackingId, `Order #${orderId}`, "Tracking registered for order processing");
            console.log("Tracking info updated successfully for", trackingId);
          } catch (updateError) {
            console.warn("Tracking registered, but failed to update tracking info:", updateError);
            alert(`Tracking registered, but failed to update tracking info. Error: ${updateError.message}`);
          }

          alert("Tracking info updated and registered with AfterShip successfully.");

          if (trackingViewMode) trackingViewMode.style.display = "block";
          if (trackingEditMode) trackingEditMode.style.display = "none";
          if (editTrackingBtn) editTrackingBtn.style.display = "block";

          // Step 4: Check tracking status
          await checkTrackingStatus(trackingId);

        } catch (aftershipError) {
          console.error("Failed to register with AfterShip:", aftershipError);
          alert(`Tracking info saved to database, but failed to register with AfterShip. Error: ${aftershipError.message}`);
          return;
        }

      } catch (error) {
        console.error("Unexpected error in saveTrackingBtn:", error);
        alert(`Unexpected error occurred. Error: ${error.message}`);
      }
    });
  }

  if (confirmStatusBtn) {
    confirmStatusBtn.addEventListener("click", async () => {
      if (!statusSelect) {
        alert("Status selector not found.");
        return;
      }

      let newStatus = statusSelect.value;
      const currentStatus = initialStatus;

      if (!newStatus || newStatus.trim() === "") {
        alert("Please select a valid status before updating.");
        return;
      }

      if (currentStatus === "To Pay" && (newStatus === "To Received" || newStatus === "Completed" || newStatus === "Shipped")) {
        alert('Cannot change status to "To Received", "Delivered", or "Shipped" from "To Pay". Please select "To Shipped" first.');
        return;
      }

      if (currentStatus === "To Pay" && newStatus === "To Shipped") {
        if (!initialCourier || !initialTrackingId) {
          alert('Cannot update status to "To Shipped" without providing courier and tracking ID. Please fill out the Shipping & Tracking information first.');
          return;
        }
        if (initialCourier !== "J&T Express Philippines") {
          alert('Cannot update status to "To Shipped" without selecting J&T Express Philippines.');
          return;
        }
        if (!validateJntTrackingId(initialTrackingId)) {
          alert('Cannot update status to "To Shipped" with an invalid J&T tracking ID. Please provide a valid tracking ID (JT or JX followed by 10-13 digits).');
          return;
        }
      }

      if (newStatus === "Completed") {
        newStatus = "To Received";
      }

      if (isTerminalState(currentStatus)) {
        alert(`Order status cannot be changed because it is already ${currentStatus}.`);
        return;
      }

      try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, { status: newStatus });
        updateOrderStatus(newStatus);
        initialStatus = newStatus;
        checkStatusModifiable(newStatus);

        if (orderData.userId) {
          await sendStatusUpdateMessage(orderData.userId, orderId, newStatus, orderData);
        } else {
          console.warn("No userId found in order data. Skipping message send.");
        }

        alert(`Order status updated to: ${newStatus}`);
        window.location.href = "transaction.html";
      } catch (error) {
        console.error("Status update error:", error);
        alert("Failed to update order status. Please try again.");
      }
    });
  }

  async function sendStatusUpdateMessage(userId, orderId, newStatus, orderData) {
    if (!userId) {
      console.error("No user ID provided for messaging. Order data:", orderData);
      alert("Cannot send status update message: No user ID found in order data.");
      return;
    }

    try {
      const adminId = auth.currentUser?.uid;
      if (!adminId) {
        console.error("Admin not authenticated. Cannot send message.");
        alert("Cannot send message: Admin authentication required. Please log in again.");
        return;
      }

      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        console.error("User does not exist for userId:", userId);
        alert("Cannot send message: User not found in database.");
        return;
      }

      let chatId;
      const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", adminId)
      );
      const chatSnapshot = await getDocs(chatsQuery);

      for (const chatDoc of chatSnapshot.docs) {
        const chatData = chatDoc.data();
        if (chatData.participants.includes(userId)) {
          chatId = chatDoc.id;
          break;
        }
      }

      if (!chatId) {
        const newChatRef = await addDoc(collection(db, "chats"), {
          participants: [adminId, userId],
          isStarred: false,
          lastMessage: new Date(),
        });
        chatId = newChatRef.id;
        console.log("Created new chat with ID:", chatId);
      }

      let itemsList = "";
      if (orderData.items && Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          const productName = item.name || "Unnamed Product";
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const size = item.size || "Not specified";
          const color = item.color || "Not specified";
          const subtotal = quantity * price;
          itemsList += `- ${productName} (Qty: ${quantity}, Size: ${size}, Color: ${color}, Price: ₱${price.toFixed(2)}, Subtotal: ₱${subtotal.toFixed(2)})\n`;
        }
      } else {
        itemsList = "No items found.";
      }

      const shippingFee = 40;
      const totalAmount = orderData.items
        ? orderData.items.reduce((sum, item) => sum + (item.quantity * item.price), 0) + shippingFee
        : 0;

      const courier = orderData.courier || "Not specified";
      const trackingId = orderData.trackingId || "Not available";

      const messageText = `Order Update for Order #${orderId}\n` +
                          `Status: ${newStatus}\n\n` +
                          `Order Details:\n` +
                          `Items:\n${itemsList}` +
                          `Shipping Fee: ₱${shippingFee.toFixed(2)}\n` +
                          `Total: ₱${totalAmount.toFixed(2)}\n\n` +
                          `Shipping Information:\n` +
                          `Courier: ${courier}\n` +
                          `Tracking ID: ${trackingId}\n\n` +
                          `Thank you for shopping with us!`;

      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: adminId,
        receiverId: userId,
        message: messageText,
        timestamp: new Date(),
        isRead: false,
        attachments: [],
      });

      console.log("Status update message sent successfully to user:", userId);
    } catch (error) {
      console.error("Error sending status update message:", error);
      alert("Failed to send status update message. Please try again or contact support.");
    }
  }

  async function renderOrderDetails(orderData) {
    if (!productsTableBody || !totalDisplay) {
      console.error("Required DOM elements for order details not found.");
      return;
    }

    if (orderData.items && Array.isArray(orderData.items)) {
      let totalAmount = 0;
      const shippingFee = 40;
      productsTableBody.innerHTML = "";

      for (const item of orderData.items) {
        const { productId, quantity = 0, price = 0, size = "Not specified", color = "Not specified" } = item;
        let productName = item.name || "Unnamed Product";
        let productImage = "default-image.jpg";

        if (productId) {
          try {
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
              const productData = productSnap.data();
              productName = productData.name || productName;
              productImage = productData.imageUrls || productImage;
              if (!color || color === "Not specified") {
                item.color = productData.color || "Not specified";
              }
            }
          } catch (error) {
            console.warn("Error fetching product data:", error);
          }
        }

        const subtotal = Number(price) * Number(quantity);
        const rowSubtotal = subtotal;
        totalAmount += subtotal;

        const productRow = document.createElement("tr");
        productRow.innerHTML = `
          <td>
            <div class="product-cell">
              <img src="${productImage}" alt="${productName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; margin-right: 10px;">
              <div class="product-info">
                <div class="product-name">${productName}</div>
              </div>
            </td>
            <td>${quantity}</td>
            <td>₱${Number(price).toFixed(2)}</td>
            <td>${size}</td>
            <td>${color}</td>
            <td>₱${shippingFee.toFixed(2)}</td>
            <td>₱${rowSubtotal.toFixed(2)}</td>
        `;

        productsTableBody.appendChild(productRow);
      }

      totalAmount += shippingFee;
      totalDisplay.textContent = `₱${totalAmount.toFixed(2)} (including shipping fee of ₱${shippingFee})`;
    } else {
      productsTableBody.innerHTML = "<tr><td colspan='7'>No items found.</td></tr>";
      totalDisplay.textContent = "₱0.00";
    }
  }

  function isTerminalState(status) {
    const terminalStates = ["Completed", "Cancelled", "Returned"];
    return terminalStates.includes(status);
  }

  function checkStatusModifiable(status) {
    if (!statusSelect || !confirmStatusBtn || !statusUpdateSection) {
      console.error("Required elements for status modification check not found.");
      return;
    }

    const allOptions = statusSelect.querySelectorAll("option");
    allOptions.forEach((option) => {
      option.disabled = false;
    });

    const statusUpdateContent = statusUpdateSection.querySelector(".status-update-content");
    if (statusUpdateContent) {
      const existingMessages = statusUpdateContent.querySelectorAll(
        ".status-locked-message, .status-restriction-message, .cancel-restriction-message"
      );
      existingMessages.forEach((msg) => msg.remove());
    }

    if (isTerminalState(status)) {
      statusSelect.disabled = true;
      confirmStatusBtn.disabled = true;

      const statusMessage = document.createElement("div");
      statusMessage.className = "status-locked-message";
      statusMessage.innerHTML = `
        <div class="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          <span>Order status is ${status} and cannot be changed.</span>
        </div>
      `;
      statusUpdateContent.insertBefore(statusMessage, statusUpdateContent.firstChild);

      const statusSelection = statusUpdateSection.querySelector(".status-selection");
      if (statusSelection) {
        statusSelection.style.marginTop = "15px";
      }
    } else if (status === "To Pay") {
      const toReceivedOption = statusSelect.querySelector('option[value="To Received"]');
      const completedOption = statusSelect.querySelector('option[value="Completed"]');
      const shippedOption = statusSelect.querySelector('option[value="Shipped"]');
      if (toReceivedOption) toReceivedOption.disabled = true;
      if (completedOption) completedOption.disabled = true;
      if (shippedOption) shippedOption.disabled = true;

      const restrictionMessage = document.createElement("div");
      restrictionMessage.className = "status-restriction-message";
      restrictionMessage.innerHTML = `
        <div class="alert alert-info">
          <span>Cannot select "To Received", "Delivered", or "Shipped" when the order status is To Pay. Please update to "To Shipped" first.</span>
        </div>
      `;
      statusUpdateContent.insertBefore(restrictionMessage, statusUpdateContent.firstChild);
    } else if (status === "To Received") {
      const cancelledOption = statusSelect.querySelector('option[value="Cancelled"]');
      if (cancelledOption) {
        cancelledOption.disabled = true;
      }

      const restrictionMessage = document.createElement("div");
      restrictionMessage.className = "cancel-restriction-message";
      restrictionMessage.innerHTML = `
        <div class="alert alert-info">
          <span>Cancellation is not allowed when the order status is To Received.</span>
        </div>
      `;
      statusUpdateContent.insertBefore(restrictionMessage, statusUpdateContent.firstChild);
    }
  }

  function updateTrackingDisplay(courier, trackingId) {
    console.log("Updating tracking display:", courier, trackingId);

    if (!trackingInfo || !emptyTrackingMsg) {
      console.error("Required elements for tracking display not found.");
      return;
    }

    const hasCourier = courier && courier.trim() !== "";
    const hasTrackingId = trackingId && trackingId.trim() !== "";

    if (hasCourier || hasTrackingId) {
      courierDisplayElements.forEach(element => {
        element.textContent = hasCourier ? courier : "Not specified";
      });
      trackingIdDisplayElements.forEach(element => {
        element.textContent = hasTrackingId ? trackingId : "Not available";
      });
      trackingInfo.style.display = "block";
      emptyTrackingMsg.style.display = "none";
    } else {
      courierDisplayElements.forEach(element => {
        element.textContent = "Not specified";
      });
      trackingIdDisplayElements.forEach(element => {
        element.textContent = "Not available";
      });
      trackingInfo.style.display = "none";
      emptyTrackingMsg.style.display = "flex";
    }
  }

  function updateOrderStatus(status) {
    if (!orderStatusDisplay) {
      console.error("Required elements for status update not found.");
      return;
    }

    const className = "status-badge " + getStatusClass(status);
    orderStatusDisplay.className = className;
    orderStatusDisplay.textContent = status;
    statusBadges.forEach((badge) => {
      badge.className = className;
      badge.textContent = status;
    });
  }

  function getStatusClass(status) {
    if (!status) return "";

    switch (status.toLowerCase()) {
      case "to pay": return "to-pay";
      case "to received": return "to-received";
      case "to shipped": return "to-shipped";
      case "shipped": return "shipped";
      case "completed": return "completed";
      case "cancelled": return "cancelled";
      case "returned": return "returned";
      default: return "";
    }
  }

  async function getCustomerDetails(userId) {
    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        return {
          role: "buyer",
          name: userData.username || "Unknown Buyer",
          email: userData.email || "email@yourdomain.com",
          phone_number: userData.phone || "+18555072501",
          language: "en"
        };
      }
      return {
        role: "buyer",
        name: "Unknown Buyer",
        email: "email@yourdomain.com",
        phone_number: "+18555072501",
        language: "en"
      };
    } catch (error) {
      console.error("Error fetching customer details:", error);
      return {
        role: "buyer",
        name: "Unknown Buyer",
        email: "email@yourdomain.com",
        phone_number: "+18555072501",
        language: "en"
      };
    }
  }

  const checkStatusBtn = document.getElementById("checkStatusBtn");
  if (checkStatusBtn) {
    checkStatusBtn.addEventListener("click", () => {
      if (initialTrackingId && initialCourier === "J&T Express Philippines") {
        if (!validateJntTrackingId(initialTrackingId)) {
          alert(`Invalid tracking ID: ${initialTrackingId}. Please update to a valid J&T tracking ID.`);
          return;
        }
        checkTrackingStatus(initialTrackingId);
      } else {
        alert("No valid tracking ID or courier available to check.");
      }
    });
  }
});