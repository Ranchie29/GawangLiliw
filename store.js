import { 
  auth, 
  db,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit
} from './firebase-config.js';

// ========== Global Variables ==========
let currentStaffData = [];
let currentSortOrder = 'desc'; // 'asc' for old to new, 'desc' for new to old
let currentHistorySortOrder = 'desc'; // For seller history
// ========== Helper function to fetch admin username by UID ==========
async function getAdminUsername(uid) {
  try {
    const adminDocRef = doc(db, "admin", uid);
    const adminDoc = await getDoc(adminDocRef);
    if (adminDoc.exists()) {
      const adminData = adminDoc.data();
      return adminData.username || "Unknown Admin";
    }
    return "Unknown Admin";
  } catch (error) {
    console.error("Error fetching admin username:", error);
    return "Unknown Admin";
  }
}
// ========== Utility Functions ==========
function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  
  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleString();
  }
  
  if (typeof timestamp === "string") {
    return timestamp;
  }
  
  if (timestamp instanceof Date) {
    return timestamp.toLocaleString();
  }
  
  return "N/A";
}

function getTimestampForSorting(timestamp) {
  if (!timestamp) return 0;
  
  if (timestamp.toDate) {
    return timestamp.toDate().getTime();
  }
  
  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  return 0;
}

function sortStaffData(data, order = 'desc') {
  return [...data].sort((a, b) => {
    const aTime = getTimestampForSorting(a.createdAt);
    const bTime = getTimestampForSorting(b.createdAt);
    
    if (order === 'asc') {
      return aTime - bTime; // old to new
    } else {
      return bTime - aTime; // new to old
    }
  });
}

// ========== Helper function to check if staff is approved ==========
function isStaffApproved(staff) {
  // Check for both boolean true and string "true"
  return staff.approved === true || staff.approved === "true";
}

// ========== Helper function to check if staff is pending ==========
function isStaffPending(staff) {
  // A staff is pending if:
  // 1. approved is false or "false" or undefined
  // 2. AND status is not "rejected"
  const notApproved = staff.approved === false || staff.approved === "false" || staff.approved === undefined;
  const notRejected = staff.status !== "rejected";
  return notApproved && notRejected;
}

// ========== Email Service Function ==========
// ========== Email Service Function with EmailJS ==========
async function sendRejectionEmail(staffEmail, staffName, rejectionReason) {
  try {
    const templateParams = {
      to_email: staffEmail,
      to_name: staffName || "Staff Member",
      rejection_reason: rejectionReason,
      from_name: "Your Application Team", // Customize as needed
      reply_to: "your-email@example.com", // Customize as needed
    };

    const response = await emailjs.send(
      "service_3pghgav", // Replace with your EmailJS Service ID
      "template_2z5mppg", // Replace with your EmailJS Template ID
      templateParams
    );

    console.log('Rejection email sent to:', staffEmail, response);
    console.log('Rejection reason:', rejectionReason);
  } catch (error) {
    console.error('Error sending rejection email:', error);
    throw error;
  }
} 
// ========== Approval Email Service Function with EmailJS ==========
async function sendApprovalEmail(staffEmail, staffName) {
  try {
    const templateParams = {
      to_email: staffEmail,
      to_name: staffName || "Staff Member",
      from_name: "Lili Cooperitiva", // Customize as needed
      reply_to: "your-email@example.com", // Customize as needed
    };

    const response = await emailjs.send(
      "service_3pghgav", // Replace with your EmailJS Service ID
      "template_dfqhzp4", // Replace with your EmailJS Approval Template ID
      templateParams
    );

    console.log('Approval email sent to:', staffEmail, response);
  } catch (error) {
    console.error('Error sending approval email:', error);
    throw error;
  }
}

// ========== Show Rejection Reason Modal ==========
function showRejectionModal(staffId, staffData) {
  // Create modal HTML dynamically
  const modalHTML = `
    <div class="modal fade" id="rejectionReasonModal" tabindex="-1" aria-labelledby="rejectionReasonModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="rejectionReasonModalLabel">Reject Staff Application</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p><strong>Staff:</strong> ${staffData.username || 'Unknown'}</p>
            <p><strong>Email:</strong> ${staffData.email || 'Unknown'}</p>
            <hr>
            <div class="mb-3">
              <label for="rejectionReason" class="form-label">Reason for rejection:</label>
              <select class="form-select" id="rejectionReason" required>
                <option value="">Select a reason...</option>
                <option value="Blurry documents">Blurry documents</option>
                <option value="Incomplete information">Incomplete information</option>
                <option value="Invalid documents">Invalid documents</option>
                <option value="Duplicate application">Duplicate application</option>
                <option value="Does not meet requirements">Does not meet requirements</option>
                <option value="Suspicious activity">Suspicious activity</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="mb-3" id="customReasonDiv" style="display: none;">
              <label for="customReason" class="form-label">Please specify (100-300 characters):</label>
              <textarea class="form-control" id="customReason" rows="3" placeholder="Enter custom reason..." minlength="100" maxlength="300"></textarea>
              <small id="charCount" class="form-text text-muted">0/300 characters</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirmRejectionBtn">Reject Application</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if it exists
  const existingModal = document.getElementById('rejectionReasonModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Show/hide custom reason textarea based on selection
  const reasonSelect = document.getElementById('rejectionReason');
  const customReasonDiv = document.getElementById('customReasonDiv');
  const customReasonInput = document.getElementById('customReason');
  const charCount = document.getElementById('charCount');
  
  reasonSelect.addEventListener('change', function() {
    if (this.value === 'Other') {
      customReasonDiv.style.display = 'block';
    } else {
      customReasonDiv.style.display = 'none';
    }
  });

  // Update character count in real-time
  if (customReasonInput) {
    customReasonInput.addEventListener('input', function() {
      const length = this.value.length;
      charCount.textContent = `${length}/300 characters`;
      if (length >= 100 && length <= 300) {
        charCount.classList.remove('text-danger');
        charCount.classList.add('text-success');
      } else {
        charCount.classList.remove('text-success');
        charCount.classList.add('text-danger');
      }
    });
  }

  // Handle rejection confirmation
  const confirmBtn = document.getElementById('confirmRejectionBtn');
  confirmBtn.addEventListener('click', async function() {
    const selectedReason = reasonSelect.value;
    const customReason = customReasonInput ? customReasonInput.value : '';
    
    if (!selectedReason) {
      alert('Please select a reason for rejection.');
      return;
    }
    
    if (selectedReason === 'Other' && (customReason.length < 100 || customReason.length > 300)) {
      alert('Custom reason must be between 100 and 300 characters.');
      return;
    }
    
    const finalReason = selectedReason === 'Other' ? customReason : selectedReason;
    
    // Disable button to prevent double-clicking
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';
    
    try {
      await processRejection(staffId, staffData, finalReason);
      
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('rejectionReasonModal'));
      modal.hide();
      
    } catch (error) {
      console.error('Error processing rejection:', error);
      alert('Failed to reject staff application. Please try again.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Reject Application';
    }
  });

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById('rejectionReasonModal'));
  modal.show();
}

// ========== Process Rejection ==========
async function processRejection(staffId, staffData, rejectionReason) {
  try {
    // Update staff record in database
    const staffDocRef = doc(db, "admin", staffId);
    await updateDoc(staffDocRef, {
      approved: false,
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: auth.currentUser?.uid || "unknown",
      rejectionReason: rejectionReason
    });

    // Send rejection email
    if (staffData.email) {
      await sendRejectionEmail(staffData.email, staffData.username, rejectionReason);
    }

    alert("Staff application rejected and notification email sent.");
    
    // Refresh data
    await Promise.all([
      fetchPendingStaff(),
      updateStaffStats(),
      fetchNotifications(),
      fetchStoreHistory()
    ]);

  } catch (error) {
    console.error("Error processing rejection:", error);
    throw error;
  }
}

// ========== Fetch Pending Staff ==========
async function fetchPendingStaff() {
  const tbody = document.getElementById("staffTableBody");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='7' class='text-center'>Loading requests...</td></tr>";

  try {
    const pendingRef = collection(db, "admin");
    const pendingQuery = query(
      pendingRef,
      where("role", "==", "staff")
    );
    const querySnapshot = await getDocs(pendingQuery);

    if (querySnapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No requests found.</td></tr>`;
      currentStaffData = [];
      updatePagination(0);
      handleAutoScroll(); // Call here to ensure scroll after empty table
      return;
    }

    const staffData = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const staffMember = {
        id: docSnap.id,
        ...data
      };
      
      if (isStaffPending(staffMember)) {
        staffData.push(staffMember);
      }
    });

    currentStaffData = staffData;
    renderStaffTable();
    handleAutoScroll(); // Call here to ensure scroll after table is populated

  } catch (error) {
    console.error("Error fetching pending staff:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error loading requests.</td></tr>`;
    currentStaffData = [];
    updatePagination(0);
    handleAutoScroll(); // Call here to ensure scroll even on error
  }
}

// ========== Render Staff Table ==========
function renderStaffTable() {
  const tbody = document.getElementById("staffTableBody");
  if (!tbody) return;

  if (currentStaffData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No pending requests found.</td></tr>`;
    updatePagination(0);
    return;
  }
  
  // Sort data based on current sort order
  const sortedData = sortStaffData(currentStaffData, currentSortOrder);
  
  tbody.innerHTML = "";
  let count = 0;

  sortedData.forEach((staffMember) => {
    const requestedAt = formatDate(staffMember.createdAt);
    count++;

    const row = `
      <tr>
        <td>${staffMember.shopName || "Not specified"}</td>
        <td>${staffMember.username || "Not specified"}</td>
        <td>${staffMember.city || "Unknown"}, ${staffMember.province || ""}</td>
        <td>${requestedAt}</td>
        <td><span class="badge bg-warning">Pending</span></td>
        <td>
         <div class="btn-group-modern">
  <button class="action-btn approve" title="Approve" onclick="approveStaff('${staffMember.id}')">
    <i class='bx bx-check'></i>
  </button>
  <button class="action-btn reject" title="Reject" onclick="rejectStaff('${staffMember.id}')">
    <i class='bx bx-x'></i>
  </button>
  <button class="action-btn view" title="View Details" onclick="viewStaffDetails('${staffMember.id}')">
    <i class='bx bx-info-circle'></i>
  </button>
</div>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", row);
  });

  updatePagination(count);
}

// ========== Update Pagination Info ==========
function updatePagination(count) {
  const startEntry = document.getElementById("startEntry");
  const endEntry = document.getElementById("endEntry");
  const totalEntries = document.getElementById("totalEntries");
  
  if (startEntry) startEntry.textContent = count > 0 ? "1" : "0";
  if (endEntry) endEntry.textContent = count.toString();
  if (totalEntries) totalEntries.textContent = count.toString();
}

// ========== Date Sorting Functions ==========
window.toggleDateSort = function() {
  currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
  renderStaffTable();
  updateSortIndicator();
};

function updateSortIndicator() {
  const sortBtn = document.getElementById("dateSortBtn");
  if (sortBtn) {
    const icon = sortBtn.querySelector('i');
    if (icon) {
      icon.className = currentSortOrder === 'desc' ? 'bx bx-sort-down' : 'bx bx-sort-up';
    }
    sortBtn.title = currentSortOrder === 'desc' ? 'Sort: New to Old' : 'Sort: Old to New';
  }
}

// ========== Approve Staff ==========
window.approveStaff = async function (staffId) {
  if (!confirm("Are you sure you want to approve this staff member?")) return;

  const approveBtn = document.querySelector(`button[onclick="approveStaff('${staffId}')"]`);
  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';
  }

  try {
    const staffDocRef = doc(db, "admin", staffId);
    const staffDoc = await getDoc(staffDocRef);
    
    if (!staffDoc.exists()) {
      alert("Staff request not found.");
      return;
    }

    const staffData = staffDoc.data();

    await updateDoc(staffDocRef, {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy: auth.currentUser?.uid || "unknown",
      status: "approved"
    });

    if (staffData.email) {
      await sendApprovalEmail(staffData.email, staffData.username);
    }

    const modalElement = document.getElementById("staffDetailsModal");
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      if (modal) modal.hide();
    }

    alert("Staff approved successfully and notification email sent!");
    
    await Promise.all([
      fetchPendingStaff(),
      updateStaffStats(),
      fetchNotifications(),
      fetchStoreHistory()
    ]);

  } catch (error) {
    console.error("Error approving staff:", error);
    alert("Failed to approve staff: " + error.message);
  } finally {
    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.innerHTML = '<i class="bx bx-check"></i>';
    }
  }
};

// ========== Reject Staff - UPDATED ==========
window.rejectStaff = async function (staffId) {
  try {
    // Get staff data first
    const staffDocRef = doc(db, "admin", staffId);
    const staffDoc = await getDoc(staffDocRef);
    
    if (!staffDoc.exists()) {
      alert("Staff request not found.");
      return;
    }

    const staffData = staffDoc.data();
    
    // Show rejection reason modal
    showRejectionModal(staffId, staffData);

  } catch (error) {
    console.error("Error preparing rejection:", error);
    alert("Failed to load staff data: " + error.message);
  }
};

// ========== View Staff Details - UPDATED to match history format ==========
window.viewStaffDetails = async function (staffId) {
  try {
    const staffDocRef = doc(db, "admin", staffId);
    const staffDoc = await getDoc(staffDocRef);
    
    if (!staffDoc.exists()) {
      alert("Staff request not found.");
      return;
    }

    const data = staffDoc.data();

    // Create detailed staff modal HTML
    const modalHTML = `
      <div class="modal fade" id="staffDetailsModal" tabindex="-1" aria-labelledby="staffDetailsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content modern-modal">
            <div class="modal-header border-0 pb-1">
              <div>
                <h5 class="modal-title fw-semibold" id="staffDetailsModalLabel">Seller Request Details</h5>
                <p class="text-muted mb-0 small">Review and manage seller request information</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body pt-0">
              <div class="row gy-4">
                <div class="col-md-6">
                  <h6 class="section-title">Basic Information</h6>
                  <ul class="info-list">
                    <li><strong>Shop Name:</strong> ${data.shopName || "Not specified"}</li>
                    <li><strong>Username:</strong> ${data.username || "Not specified"}</li>
                    <li><strong>Email:</strong> ${data.email || "Not specified"}</li>
                    <li><strong>Phone:</strong> ${data.phone || data.contactNumber || "Not provided"}</li>
                  </ul>
                </div>
                <div class="col-md-6">
                  <h6 class="section-title">Address Information</h6>
                  <ul class="info-list">
                    <li><strong>Barangay:</strong> ${data.barangay || data.address || "Not provided"}</li>
                    <li><strong>City:</strong> ${data.city || "Not provided"}</li>
                    <li><strong>Province:</strong> ${data.province || "Not provided"}</li>
                    <li><strong>Postal Code:</strong> ${data.postalCode || data.zipCode || "Not provided"}</li>
                  </ul>
                </div>
                <div class="col-md-6">
                  <h6 class="section-title">Status Information</h6>
                  <ul class="info-list">
                    <li><strong>Status:</strong> 
                      ${isStaffApproved(data) 
                        ? '<span class="badge bg-success">Approved</span>'
                        : data.status === "rejected"
                          ? '<span class="badge bg-danger">Rejected</span>'
                          : '<span class="badge bg-warning text-dark">Pending</span>'
                      }
                    </li>
                    <li><strong>Request Date:</strong> ${formatDate(data.createdAt)}</li>
                    ${data.approvedAt ? `<li><strong>Approved:</strong> ${formatDate(data.approvedAt)}</li>` : ''}
                    ${data.rejectedAt ? `<li><strong>Rejected:</strong> ${formatDate(data.rejectedAt)}</li>` : ''}
                  </ul>
                </div>
                <div class="col-md-6">
                  <h6 class="section-title">Document Information</h6>
                  <ul class="info-list">
                    <li><strong>DTI Certificate:</strong> 
                      ${data.documents?.dtiCertificate 
                        ? `<a href="${data.documents.dtiCertificate}" target="_blank">View DTI Certificate</a>` 
                        : "Not provided"}
                    </li>
                    <li><strong>Mayor's Permit:</strong> 
                      ${data.documents?.mayorsPermit 
                        ? `<a href="${data.documents.mayorsPermit}" target="_blank">View Mayor's Permit</a>` 
                        : "Not provided"}
                    </li>
                  </ul>
                </div>
                
              </div>
              ${data.status === "rejected" && data.rejectionReason ? `
                <hr>
                <div class="mt-3">
                  <h6 class="section-title text-danger">Rejection Information</h6>
                  <ul class="info-list">
                    <li><strong>Reason:</strong> ${data.rejectionReason}</li>
                    ${data.rejectedBy ? `<li><strong>Rejected by:</strong> ${data.rejectedBy}</li>` : ''}
                  </ul>
                </div>
              ` : ''}
            </div>
            <div class="modal-footer border-0 mt-2">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if it exists
    const existingModal = document.getElementById('staffDetailsModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('staffDetailsModal'));
    modal.show();

  } catch (error) {
    console.error("Error fetching staff details:", error);
    alert("Failed to load staff details: " + error.message);
  }
};
// ========== NEW: View History Details (for seller history) ==========
window.viewHistoryDetails = async function (staffId) {
  try {
    const staffDocRef = doc(db, "admin", staffId);
    const staffDoc = await getDoc(staffDocRef);
    
    if (!staffDoc.exists()) {
      alert("Staff data not found.");
      return;
    }

    const data = staffDoc.data();

    // Fetch admin username for rejectedBy field
    let rejectedByUsername = "";
    if (data.status === "rejected" && data.rejectedBy) {
      rejectedByUsername = await getAdminUsername(data.rejectedBy);
    }

    // Create detailed history modal HTML
    const modalHTML = `
      <div class="modal fade" id="historyDetailsModal" tabindex="-1" aria-labelledby="historyDetailsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content seller-history-modal">
            <div class="modal-header">
              <h5 class="modal-title" id="historyDetailsModalLabel">Seller Details</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="row">
                <div class="col-md-6">
                  <h6 class="section-title">Basic Information</h6>
                  <p><strong>Shop Name:</strong> ${data.shopName || "Not specified"}</p>
                  <p><strong>Username:</strong> ${data.username || "Not specified"}</p>
                  <p><strong>Email:</strong> ${data.email || "Not specified"}</p>
                  <p><strong>Phone:</strong> ${data.phone || data.contactNumber || "Not provided"}</p>
                </div>
                <div class="col-md-6">
                  <h6 class="section-title">Address Information</h6>
                  <p><strong>Barangay:</strong> ${data.barangay || data.address || "Not provided"}</p>
                  <p><strong>City:</strong> ${data.city || "Not provided"}</p>
                  <p><strong>Province:</strong> ${data.province || "Not provided"}</p>
                  <p><strong>Postal Code:</strong> ${data.postalCode || data.zipCode || "Not provided"}</p>
                </div>
              </div>
              <hr>
              <div class="row">
                <div class="col-md-6">
                  <h6 class="section-title">Status Information</h6>
                  <p><strong>Status:</strong> 
                    ${isStaffApproved(data) 
                      ? '<span class="badge bg-success">Approved</span>'
                      : data.status === "rejected"
                        ? '<span class="badge bg-danger">Rejected</span>'
                        : '<span class="badge bg-warning text-dark">Pending</span>'
                    }
                  </p>
                  <p><strong>Created:</strong> ${formatDate(data.createdAt)}</p>
                  ${data.approvedAt ? `<p><strong>Approved:</strong> ${formatDate(data.approvedAt)}</p>` : ''}
                  ${data.rejectedAt ? `<p><strong>Rejected:</strong> ${formatDate(data.rejectedAt)}</p>` : ''}
                </div>
                <div class="col-md-6">
                  <h6 class="section-title">Document Information</h6>
                  <p><strong>DTI Certificate:</strong> 
                    ${data.documents?.dtiCertificate 
                      ? `<a href="${data.documents.dtiCertificate}" target="_blank">View DTI Certificate</a>` 
                      : "Not provided"}
                  </p>
                  <p><strong>Mayor's Permit:</strong> 
                    ${data.documents?.mayorsPermit 
                      ? `<a href="${data.documents.mayorsPermit}" target="_blank">View Mayor's Permit</a>` 
                      : "Not provided"}
                  </p>
                </div>
              </div>
              <hr>
              <div class="row">
                <div class="col-md-6">
                  <h6 class="section-title">Additional Information</h6>
                  ${data.businessType ? `<p><strong>Business Type:</strong> ${data.businessType}</p>` : ''}
                  ${data.businessRegistration ? `<p><strong>Business Registration:</strong> ${data.businessRegistration}</p>` : ''}
                  ${data.taxId ? `<p><strong>Tax ID:</strong> ${data.taxId}</p>` : ''}
                  ${data.website ? `<p><strong>Website:</strong> <a href="${data.website}" target="_blank">${data.website}</a></p>` : ''}
                  ${data.description ? `<p><strong>Description:</strong> ${data.description}</p>` : ''}
                </div>
              </div>
              ${data.status === "rejected" && data.rejectionReason ? `
                <hr>
                <div class="row">
                  <div class="col-12">
                    <h6 class="text-danger">Rejection Information</h6>
                    <p><strong>Reason:</strong> ${data.rejectionReason}</p>
                    <p><strong>Rejected by:</strong> ${rejectedByUsername}</p>
                  </div>
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if it exists
    const existingModal = document.getElementById('historyDetailsModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('historyDetailsModal'));
    modal.show();

  } catch (error) {
    console.error("Error fetching staff history details:", error);
    alert("Failed to load staff details: " + error.message);
  }
};

// ========== Update Staff Stats ==========
async function updateStaffStats() {
  const pendingStaffEl = document.querySelector(".pending-staff")?.closest(".stat-card")?.querySelector(".stat-value");
  const approvedStaffEl = document.querySelector(".approved-staff")?.closest(".stat-card")?.querySelector(".stat-value");

  if (!pendingStaffEl || !approvedStaffEl) return;

  try {
    // Get all staff records and count them properly
    const allStaffQuery = query(collection(db, "admin"), where("role", "==", "staff"));
    const allStaffSnapshot = await getDocs(allStaffQuery);

    let pendingCount = 0;
    let approvedCount = 0;

    allStaffSnapshot.forEach((doc) => {
      const data = doc.data();
      
      if (isStaffApproved(data)) {
        approvedCount++;
      } else if (isStaffPending(data)) {
        pendingCount++;
      }
    });

    pendingStaffEl.textContent = pendingCount;
    approvedStaffEl.textContent = approvedCount;
    
  } catch (error) {
    console.error("Error updating staff stats:", error);
    pendingStaffEl.textContent = "—";
    approvedStaffEl.textContent = "—";
  }
}

// ========== Fetch and Render Store History - UPDATED ==========
async function fetchStoreHistory() {
  const container = document.querySelector('.store-history');
  if (!container) return;

  container.innerHTML = `<div class="p-4 text-center">Loading history...</div>`;

  try {
    const staffQuery = query(collection(db, "admin"), where("role", "==", "staff"));
    const staffSnapshot = await getDocs(staffQuery);

    if (staffSnapshot.empty) {
      container.innerHTML = `<div class="p-4 text-center text-muted">No staff found.</div>`;
      return;
    }

    // Collect and sort staff data
    const staffData = [];
    staffSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      staffData.push({
        id: docSnap.id,
        ...data
      });
    });

    // Sort by creation date based on current history sort order
    const sortedStaff = sortStaffData(staffData, currentHistorySortOrder);

    let html = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Seller History</h5>
        <button class="refresh-btn" onclick="toggleHistorySort()" id="historySortBtn" title="Sort: ${currentHistorySortOrder === 'desc' ? 'New to Old' : 'Old to New'}">
          <i class='bx ${currentHistorySortOrder === 'desc' ? 'bx-sort-down' : 'bx-sort-up'}'></i>
        </button>
      </div>
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead>
            <tr>
              <th>Shop Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Contact</th>
              <th>Location</th>
              <th>Status</th>
              <th>Date Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedStaff.forEach(staff => {
      // Use our helper functions for consistent status checking
      const isApproved = isStaffApproved(staff);
      const isRejected = staff.status === "rejected";
      const isPending = isStaffPending(staff);
      
      const statusBadge = isApproved
        ? '<span class="badge bg-success">Approved</span>'
        : isRejected
          ? '<span class="badge bg-danger">Rejected</span>'
          : '<span class="badge bg-warning">Pending</span>';

      html += `
        <tr>
          <td>${staff.shopName || "N/A"}</td>
          <td>${staff.username || "N/A"}</td>
          <td>${staff.email || "N/A"}</td>
          <td>${staff.phone || staff.contactNumber || "N/A"}</td>
          <td>${staff.city || "N/A"}${staff.province ? ', ' + staff.province : ''}</td>
          <td>${statusBadge}</td>
          <td>${formatDate(staff.createdAt)}</td>
          <td>
            <button class="action-btn view" onclick="viewHistoryDetails('${staff.id}')" title="View Full Details">
              <i class='bx bx-info-circle'></i> 
            </button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
    
  } catch (error) {
    console.error("Error fetching staff history:", error);
    container.innerHTML = `<div class="p-4 text-center text-danger">Failed to load staff history.</div>`;
  }
}

// ========== Toggle History Sort - UPDATED ==========
window.toggleHistorySort = function() {
  currentHistorySortOrder = currentHistorySortOrder === 'desc' ? 'asc' : 'desc';
  fetchStoreHistory();
};

// ========== Fetch and Render Notifications ==========
async function fetchNotifications() {
  const notifList = document.getElementById("notifList");
  const notifBadge = document.getElementById("notifBadge");
  const noNotif = document.getElementById("noNotif");

  if (!notifList || !notifBadge || !noNotif) return;

  try {
    // Get all staff records and filter for pending ones
    const notifRef = collection(db, "admin");
    const notifQuery = query(
      notifRef,
      where("role", "==", "staff")
    );
    const querySnapshot = await getDocs(notifQuery);

    // Clear previous notification items (keep header, divider, and #noNotif)
    const items = notifList.querySelectorAll("li:not(.dropdown-header):not(hr):not(#noNotif)");
    items.forEach(item => item.remove());

    // Filter for pending notifications
    const pendingNotifications = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const notification = {
        id: docSnap.id,
        ...data
      };
      
      // Only include pending staff in notifications
      if (isStaffPending(notification)) {
        pendingNotifications.push(notification);
      }
    });

    if (pendingNotifications.length === 0) {
      notifBadge.classList.add("d-none");
      noNotif.classList.remove("d-none");
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
        <a class="dropdown-item d-flex align-items-start gap-2" href="#!" onclick="viewStaffDetails('${notification.id}')">
          <i class='bx bx-user-plus fs-4 text-warning'></i>
          <div>
            <div><strong>${notification.username || "New Staff"}</strong> is requesting approval</div>
            <small class="text-muted">${createdAt}</small>
          </div>
        </a>
      `;
      notifList.appendChild(li);
    });

    notifBadge.classList.remove("d-none");
    notifBadge.textContent = notifCount.toString();

  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    // Reset notification UI on error
    notifBadge.classList.add("d-none");
    noNotif.classList.remove("d-none");
  }
}

// ========== Notification Dropdown ==========
window.toggleNotifDropdown = function () {
  const notifList = document.getElementById("notifList");
  if (notifList) {
    notifList.classList.toggle("show");
  }
};

// ========== Global Click Handler ==========
window.onclick = function (event) {
  const notifList = document.getElementById("notifList");
  if (notifList && 
      !event.target.closest(".bx-bell") && 
      !event.target.closest("#notifList")) {
    notifList.classList.remove("show");
  }
};

// ========== Refresh Functions ==========
window.refreshPendingStaff = function() {
  fetchPendingStaff();
};

window.refreshStaffHistory = function() {
  fetchStoreHistory();
};

window.refreshNotifications = function() {
  fetchNotifications();
};
window.logout = function () {
  console.log("Logout function triggered"); // Debug log

  // Check if Bootstrap is loaded
  if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error("Bootstrap Modal is not available. Ensure Bootstrap JS is loaded.");
    alert("Failed to display logout modal: Bootstrap is not loaded.");
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
      alert("Failed to display logout modal: Modal element not found.");
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
      alert("Failed to display logout modal: Buttons not found.");
      modal.hide();
      return;
    }

    // Clear any existing listeners to prevent duplicates (using a single event listener)
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
        alert('Failed to log out: ' + error.message);
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
    alert("Failed to display logout modal: " + error.message);
    if (modalElement) {
      modalElement.remove(); // Clean up on error
    }
  }
};




// ========== Initialize Everything ==========
// Update initializeStaffManagement to remove duplicate event listener
function initializeStaffManagement() {
  // Set up sort indicator
  updateSortIndicator();

  // Add logout button event listener (single instance)
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    // Remove any existing listeners to be safe
    logoutButton.replaceWith(logoutButton.cloneNode(true));
    const newLogoutButton = document.getElementById('logoutButton');
    newLogoutButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log("Logout button clicked"); // Debug log
      logout();
    });
  } else {
    console.error("Logout button not found in DOM"); // Debug log
  }

  // Fetch all data
  Promise.all([
    fetchPendingStaff(),
    fetchStoreHistory(),
    updateStaffStats(),
    fetchNotifications()
  ]).then(() => {
    // Call auto-scroll after data is loaded
    handleAutoScroll();
  }).catch(error => {
    console.error("Error during initialization:", error);
  });
}
// Function to handle auto-scroll to Seller Requests section
function handleAutoScroll() {
  if (window.location.hash === '#seller-requests') {
    const sellerRequestsSection = document.querySelector('.table-container');
    if (sellerRequestsSection) {
      sellerRequestsSection.scrollIntoView({ behavior: 'smooth' });
      // Add temporary highlight
      sellerRequestsSection.style.transition = 'background-color 0.5s';
      sellerRequestsSection.style.backgroundColor = '#e6f3ff';
      setTimeout(() => {
        sellerRequestsSection.style.backgroundColor = '';
      }, 2000);
    } else {
      console.warn('Seller Requests section not found for auto-scroll');
    }
  }
}

// ========== DOM Content Loaded ==========
document.addEventListener("DOMContentLoaded", () => {
 // Function to initialize EmailJS with retries
// Function to initialize EmailJS with retries
function initializeEmailJS(retries = 5, delay = 1000) {
  if (typeof emailjs !== 'undefined') {
    try {
      emailjs.init({
        publicKey: "327ti8D9pbv6JQG33",
      });
      console.log("EmailJS initialized successfully");
    } catch (error) {
      console.error("Error initializing EmailJS:", error);
      if (retries > 0) {
        console.warn(`Retrying EmailJS initialization... (${retries} attempts left)`);
        setTimeout(() => initializeEmailJS(retries - 1, delay * 2), delay);
      } else {
        console.error("Failed to initialize EmailJS after retries.");
      }
    }
  } else if (retries > 0) {
    console.warn(`EmailJS SDK not loaded, retrying... (${retries} attempts left)`);
    setTimeout(() => initializeEmailJS(retries - 1, delay * 2), delay);
  } else {
    console.error("EmailJS SDK is not loaded after retries. Please check the CDN script.");
  }
}

// Start EmailJS initialization
initializeEmailJS();
auth.onAuthStateChanged((user) => {
  console.log("Auth state changed:", user ? "User logged in" : "No user"); // Debug log
  if (user) {
    initializeStaffManagement();
  } else {
    console.log("User not authenticated");
    window.location.href = 'index.html';
  }
});
});

// ========== Export functions for testing ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDate,
    sortStaffData,
    getTimestampForSorting,
    isStaffApproved,
    isStaffPending
  };
} 