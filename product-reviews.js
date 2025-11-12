import { db, auth, collection, onSnapshot, query, orderBy, doc, getDoc, getDocs, where } from './firebase-config.js';
console.log("Imported db:", db, "auth:", auth); // Debug Firebase imports

document.addEventListener("DOMContentLoaded", () => {
  const loadMoreBtn = document.getElementById("loadMore");
  const showLessBtn = document.getElementById("showLess");
  const reviewsContainer = document.getElementById("reviews");
  const summaryRating = document.querySelector(".summary-card h2");
  const summaryStars = document.querySelector(".summary-card .stars");
  const summaryCount = document.querySelector(".summary-card small");
  const ratingBreakdown = document.querySelector(".rating-breakdown");
  const helpfulReview = document.querySelector(".summary-card:nth-child(3)");
  const sidebarProfilePicture = document.getElementById("sidebar-profile-picture");
  const followerCountElement = document.getElementById("followerCount");
  const filterButtons = document.querySelectorAll(".filter-options .filter-btn");
  const sortSelect = document.getElementById("sortSelect");

  let reviews = [];
  let displayedReviews = 0;
  const reviewsPerLoad = 5;
  let cachedReviews = null;
  let currentFilter = null; // Track current filter (null for "All Reviews", 1-5 for star ratings)
  let currentSort = "newest"; // Track current sort option

  // Set dynamic animation delay for review cards
  function setReviewCardAnimationDelays() {
    const reviewCards = document.querySelectorAll(".review-card");
    reviewCards.forEach((card, index) => {
      card.style.setProperty("--index", index);
    });
  }

  // Check Firebase initialization
  if (!db || !collection || !onSnapshot || !query || !orderBy || !doc || !getDoc || !where || !auth) {
    console.error("Firebase not fully initialized. Check firebase-config.js. Available exports:", { db, collection, onSnapshot, query, orderBy, doc, getDoc, where, auth });
    if (reviewsContainer) {
      reviewsContainer.innerHTML = "<p>Firebase not initialized. <button id='retry'>Retry</button></p>";
      document.getElementById("retry")?.addEventListener("click", () => auth.onAuthStateChanged(user => setupReviewsListener(user)));
    }
    if (sidebarProfilePicture) {
      sidebarProfilePicture.src = "static/photos/default-profile.png";
    }
    if (followerCountElement) {
      followerCountElement.textContent = "Followers: -";
    }
    return;
  }

  // Function to set up profile picture listener (realtime)
  function setupProfilePictureListener(user) {
    if (!user) {
      if (sidebarProfilePicture) {
        sidebarProfilePicture.src = "static/photos/default-profile.png";
      }
      return () => {};
    }

    console.log("Setting up profile picture listener for user UID:", user.uid);
    const adminDocRef = doc(db, "admin", user.uid);
    return onSnapshot(adminDocRef, (adminDoc) => {
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const profilePictureUrl = adminData.profilePicture || "static/photos/default-profile.png";
        console.log("Profile picture URL:", profilePictureUrl);
        if (sidebarProfilePicture) {
          sidebarProfilePicture.src = profilePictureUrl;
        }
      } else {
        console.warn("No admin document found for user UID:", user.uid);
        if (sidebarProfilePicture) {
          sidebarProfilePicture.src = "static/photos/default-profile.png";
        }
      }
    }, (error) => {
      console.error("Error fetching profile picture:", error);
      if (sidebarProfilePicture) {
        sidebarProfilePicture.src = "static/photos/default-profile.png";
      }
    });
  }

  // Function to set up follower count listener (realtime)
  function setupFollowerCountListener(user) {
    if (!user) {
      if (followerCountElement) {
        followerCountElement.textContent = "Followers: -";
      }
      return () => {};
    }

    console.log("Setting up follower count listener for user UID:", user.uid);
    const followersDocRef = doc(db, "followers", user.uid);
    return onSnapshot(followersDocRef, (followersDoc) => {
      let followerCount = 0;
      if (followersDoc.exists()) {
        const followersData = followersDoc.data();
        followerCount = followersData.totalFollowers || 0;
        console.log("Follower count:", followerCount);
      } else {
        console.warn("No followers document found for user UID:", user.uid);
      }
      if (followerCountElement) {
        followerCountElement.textContent = `Followers: ${followerCount}`;
      }
    }, (error) => {
      console.error("Error fetching follower count:", error);
      if (followerCountElement) {
        followerCountElement.textContent = "Followers: -";
      }
    });
  }

  // Function to set up reviews listener (realtime, filtered by sellerId)
  function setupReviewsListener(user) {
    if (!user) {
      console.warn("No user provided for reviews listener");
      if (reviewsContainer) {
        reviewsContainer.innerHTML = "<p>Please log in to view reviews. <a href='index.html'>Go to Login</a></p>";
      }
      return () => {};
    }

    if (reviewsContainer) {
      reviewsContainer.innerHTML = "<p>Loading reviews...</p>";
    }
    const reviewsQuery = query(
      collection(db, "reviews"),
      where("sellerId", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    return onSnapshot(reviewsQuery, async (querySnapshot) => {
      if (querySnapshot.empty) {
        console.log("No reviews found for sellerId:", user.uid);
        if (reviewsContainer) {
          reviewsContainer.innerHTML = "<p>No reviews found for your products. <button id='retry'>Refresh</button></p>";
          document.getElementById("retry")?.addEventListener("click", () => setupReviewsListener(user));
        }
        cachedReviews = [];
        applyFilterAndSort(currentFilter, currentSort);
        return;
      }

      cachedReviews = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
        const reviewData = docSnapshot.data();
        if (!reviewData.userId || !reviewData.productRating) {
          console.warn(`Invalid review data (missing userId or productRating):`, reviewData);
          return null;
        }
        // Use fallback timestamp if missing
        if (!reviewData.timestamp) {
          console.warn(`Missing timestamp in review, using current date:`, reviewData);
          reviewData.timestamp = new Date();
        }
        let username = "Anonymous";
        let productImageUrl = "";
        let reviewImageUrl = reviewData.reviewImageUrl || "";

        try {
          const userRef = doc(db, "users", reviewData.userId);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            username = userData.username || userData.Username || userData.name || "Anonymous";
          } else {
            console.warn(`No user found for userId: ${reviewData.userId}`);
          }

          const productsQuery = query(collection(db, "products"), where("name", "==", reviewData.productName));
          const productsSnapshot = await getDocs(productsQuery);
          if (!productsSnapshot.empty) {
            const productDoc = productsSnapshot.docs[0];
            const productData = productDoc.data();
            productImageUrl = productData.imageUrls && productData.imageUrls.length > 0 ? productData.imageUrls[0] : "";
          } else {
            console.warn(`No product found for productName: ${reviewData.productName}`);
          }
        } catch (error) {
          console.error(`Error fetching user or product for review:`, error);
        }
        const rating = Number(reviewData.productRating);
        console.log(`Fetched review: productRating=${rating}, raw=${reviewData.productRating}`);
        return { ...reviewData, username, productImageUrl, reviewImageUrl, productRating: rating };
      }));

      cachedReviews = cachedReviews.filter(review => review !== null);
      console.log("Fetched reviews for sellerId:", user.uid, cachedReviews);
      applyFilterAndSort(currentFilter, currentSort);
    }, (error) => {
      console.error("Error fetching reviews:", error);
      if (reviewsContainer) {
        reviewsContainer.innerHTML = "<p>Failed to load reviews. <button id='retry'>Retry</button></p>";
        document.getElementById("retry")?.addEventListener("click", () => setupReviewsListener(user));
      }
    });
  }

  // Function to set up review filter buttons
  function setupReviewFilters() {
    if (filterButtons.length === 0) {
      console.error("No filter buttons found with selector '.filter-options .filter-btn'");
      return;
    }
    filterButtons.forEach(button => {
      button.addEventListener("click", () => {
        console.log("Filter button clicked:", button.textContent);
        filterButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        const filterText = button.textContent.trim();
        if (filterText === "All Reviews") {
          currentFilter = null;
        } else {
          // Handle variations like "3 Stars", "3 Star", "3★"
          const starsMatch = filterText.match(/^(\d+)(?:\s*(?:Star|Stars|★))?$/i);
          const stars = starsMatch ? parseInt(starsMatch[1]) : NaN;
          console.log(`Parsed filter text '${filterText}': stars=${stars}`);
          if (isNaN(stars) || stars < 1 || stars > 5) {
            console.warn(`Invalid star rating in filter button: ${filterText}, defaulting to All Reviews`);
            currentFilter = null;
            filterButtons.forEach(btn => btn.classList.remove("active"));
            filterButtons[0].classList.add("active");
          } else {
            currentFilter = stars;
          }
        }

        console.log("Current filter set to:", currentFilter);
        applyFilterAndSort(currentFilter, currentSort);
      });
    });
  }

  // Function to set up sort options
  function setupSortOptions() {
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        currentSort = sortSelect.value;
        if (!["newest", "oldest", "highest", "lowest", "helpful"].includes(currentSort)) {
          console.warn(`Invalid sort value: ${currentSort}, defaulting to newest`);
          currentSort = "newest";
          sortSelect.value = "newest";
        }
        console.log("Sort option changed:", currentSort);
        applyFilterAndSort(currentFilter, currentSort);
      });
    } else {
      console.error("Sort select element not found");
    }
  }

  // Function to apply filter and sort
  function applyFilterAndSort(stars, sort) {
    console.log("Applying filter:", stars, "sort:", sort);
    if (!cachedReviews) {
      reviews = [];
      console.log("No cached reviews, setting reviews to empty");
    } else if (stars === null) {
      reviews = [...cachedReviews];
    } else {
      reviews = cachedReviews.filter(review => {
        const rating = Math.floor(Number(review.productRating));
        console.log(`Filtering review: rating=${rating}, raw=${review.productRating}, target=${stars}`);
        return rating === stars;
      });
    }

    console.log("Filtered reviews:", reviews.length, reviews);

    // Sort reviews based on the selected option
    reviews.sort((a, b) => {
      switch (sort) {
        case "newest":
          return (b.timestamp?.toDate?.()?.getTime() || Date.now()) - (a.timestamp?.toDate?.()?.getTime() || Date.now());
        case "oldest":
          return (a.timestamp?.toDate?.()?.getTime() || Date.now()) - (b.timestamp?.toDate?.()?.getTime() || Date.now());
        case "highest":
          return (Number(b.productRating) || 0) - (Number(a.productRating) || 0) || 
                 (b.timestamp?.toDate?.()?.getTime() || Date.now()) - (a.timestamp?.toDate?.()?.getTime() || Date.now());
        case "lowest":
          return (Number(a.productRating) || 0) - (Number(b.productRating) || 0) || 
                 (b.timestamp?.toDate?.()?.getTime() || Date.now()) - (a.timestamp?.toDate?.()?.getTime() || Date.now());
        case "helpful":
          return (b.helpfulVotes || 0) - (a.helpfulVotes || 0) || 
                 (b.timestamp?.toDate?.()?.getTime() || Date.now()) - (a.timestamp?.toDate?.()?.getTime() || Date.now());
        default:
          console.warn(`Unknown sort option: ${sort}, using newest`);
          return (b.timestamp?.toDate?.()?.getTime() || Date.now()) - (a.timestamp?.toDate?.()?.getTime() || Date.now());
      }
    });

    displayedReviews = 0;
    updateSummary();
    displayReviews();
  }

  // Listen for authentication state changes
  let profilePictureUnsubscribe, followerCountUnsubscribe, reviewsUnsubscribe;
  auth.onAuthStateChanged((user) => {
    if (profilePictureUnsubscribe) profilePictureUnsubscribe();
    if (followerCountUnsubscribe) followerCountUnsubscribe();
    if (reviewsUnsubscribe) reviewsUnsubscribe();

    if (user) {
      console.log("User is logged in:", user.uid);
      profilePictureUnsubscribe = setupProfilePictureListener(user);
      followerCountUnsubscribe = setupFollowerCountListener(user);
      reviewsUnsubscribe = setupReviewsListener(user);
      setupReviewFilters();
      setupSortOptions();
    } else {
      console.warn("No user is logged in, redirecting to login page");
      if (sidebarProfilePicture) {
        sidebarProfilePicture.src = "static/photos/default-profile.png";
      }
      if (followerCountElement) {
        followerCountElement.textContent = "Followers: -";
      }
      if (reviewsContainer) {
        reviewsContainer.innerHTML = "<p>Please log in to view reviews. <a href='index.html'>Go to Login</a></p>";
      }
      window.location.href = "index.html";
    }
  });

  // Update review summary
  function updateSummary() {
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? (reviews.reduce((sum, review) => sum + (Number(review.productRating) || 0), 0) / totalReviews).toFixed(1)
      : 0;

    if (summaryRating) {
      summaryRating.textContent = totalReviews > 0 ? `${averageRating}/5.0` : "No reviews yet";
    } else {
      console.error("summaryRating element not found");
    }
    if (summaryStars) {
      summaryStars.textContent = totalReviews > 0 ? getStars(averageRating) : "☆☆☆☆☆";
    } else {
      console.error("summaryStars element not found");
    }
    if (summaryCount) {
      summaryCount.textContent = `${totalReviews} reviews`;
    } else {
      console.error("summaryCount element not found");
    }

    if (ratingBreakdown) {
      const ratingCounts = [0, 0, 0, 0, 0];
      reviews.forEach(review => {
        const rating = Math.floor(Number(review.productRating));
        if (rating >= 1 && rating <= 5) {
          ratingCounts[rating - 1]++;
        }
      });

      const countElements = [
        document.getElementById("count5"),
        document.getElementById("count4"),
        document.getElementById("count3"),
        document.getElementById("count2"),
        document.getElementById("count1")
      ];
      const progressFills = [
        document.getElementById("rating5"),
        document.getElementById("rating4"),
        document.getElementById("rating3"),
        document.getElementById("rating2"),
        document.getElementById("rating1")
      ];

      ratingBreakdown.querySelectorAll(".breakdown-content .bar").forEach((bar, index) => {
        const rating = 5 - index;
        const count = ratingCounts[rating - 1];
        const percentage = totalReviews > 0 ? (count / totalReviews * 100).toFixed(0) : 0;
        const starLabel = bar.querySelector("span:first-child");
        const countElement = countElements[index];
        const progressFill = progressFills[index];

        if (starLabel) {
          starLabel.textContent = `${rating}★`;
        } else {
          console.error(`Star label for ${rating}★ not found`);
        }
        if (countElement) {
          countElement.textContent = count;
        } else {
          console.error(`Count element #count${rating} not found`);
        }
        if (progressFill) {
          progressFill.style.width = `${percentage}%`;
        } else {
          console.error(`Progress fill element #rating${rating} not found`);
        }
      });
    } else {
      console.error("ratingBreakdown element not found");
    }

    const helpful = reviews.find(review => review.helpfulVotes > 0 && review.timestamp) || 
                   reviews.find(review => Math.floor(Number(review.productRating)) === 5 && review.timestamp) || 
                   reviews.find(review => review.timestamp) || null;
    if (helpfulReview) {
      const helpfulStars = helpfulReview.querySelector(".stars");
      const helpfulText = helpfulReview.querySelector("p");
      const helpfulAuthor = helpfulReview.querySelector("small");
      
      if (helpfulStars) {
        helpfulStars.textContent = helpful ? getStars(Number(helpful.productRating) || 0) : "☆☆☆☆☆";
      } else {
        console.error("helpfulStars element not found");
      }
      if (helpfulText) {
        helpfulText.innerHTML = helpful ? `<b>"${helpful.reviewText || 'No review text provided'}"</b>` : "<b>No helpful review available</b>";
      } else {
        console.error("helpfulText element not found");
      }
      if (helpfulAuthor) {
        helpfulAuthor.textContent = helpful ? `- ${helpful.username || 'Anonymous'}, ${formatTimestamp(helpful.timestamp)}` : "- No reviewer";
      } else {
        console.error("helpfulAuthor element not found");
      }
    } else {
      console.error("helpfulReview element not found");
    }
  }

  // Convert rating to stars
  function getStars(rating) {
    const fullStars = Math.floor(Number(rating));
    const halfStar = Number(rating) % 1 >= 0.5 ? "☆" : "";
    return "⭐".repeat(fullStars) + halfStar + "☆".repeat(5 - fullStars - (halfStar ? 1 : 0));
  }

  // Format timestamp
  function formatTimestamp(timestamp) {
    if (!timestamp) {
      console.warn("Missing timestamp");
      return "Unknown date";
    }
  
    try {
      let date;
      if (typeof timestamp === 'string') {
        const cleanedTimestamp = timestamp.replace(/\u202f/g, ' ');
        const regex = /^(\w+\s\d{1,2},\s\d{4})\sat\s(\d{1,2}:\d{2}:\d{2}\s[AP]M)\s(UTC[+-]\d{1,2})$/;
        const match = cleanedTimestamp.match(regex);
        
        if (!match) {
          console.warn("Invalid timestamp format:", timestamp);
          return "Unknown date";
        }
  
        const [_, datePart, timePart, timezonePart] = match;
        const dateTimeString = `${datePart} ${timePart}`;
        date = new Date(dateTimeString);
        
        if (isNaN(date.getTime())) {
          console.warn("Failed to parse date:", dateTimeString);
          return "Unknown date";
        }
  
        const offsetMatch = timezonePart.match(/UTC([+-])(\d+)/);
        if (offsetMatch) {
          const sign = offsetMatch[1] === '+' ? 1 : -1;
          const hours = parseInt(offsetMatch[2], 10);
          const offsetMinutes = hours * 60 * sign;
          date.setMinutes(date.getMinutes() - offsetMinutes);
        }
      } else if (timestamp.toDate) {
        date = timestamp.toDate();
      } else {
        date = new Date(timestamp);
      }
  
      if (isNaN(date.getTime())) {
        console.warn("Invalid timestamp format:", timestamp);
        return "Unknown date";
      }
  
      const now = new Date();
      const pstOffset = now.getTimezoneOffset() === 420 ? 420 : 480;
      const nowInUTC = new Date(now.getTime() + pstOffset * 60 * 1000);
      
      const diffMs = nowInUTC - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays <= 7) return `${diffDays} days ago`;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error("Error formatting timestamp:", error, timestamp);
      return "Unknown date";
    }
  }

  // Display reviews
  function displayReviews() {
    if (reviewsContainer) {
      reviewsContainer.innerHTML = reviews.length === 0 ? "<p>No reviews available.</p>" : "";
      const reviewsToShow = reviews.slice(0, displayedReviews + reviewsPerLoad);
      
      reviewsToShow.forEach((review, index) => {
        const reviewCard = document.createElement("div");
        reviewCard.className = "review-card";
        reviewCard.style.setProperty("--index", index); // Set dynamic animation delay
        reviewCard.innerHTML = `
          <div class="review-header">
            <div class="avatar" style="background-color: ${getAvatarColor(review.username)}">${review.username?.charAt(0) || 'A'}</div>
            <div class="reviewer-info">
              <h4>${review.username || 'Anonymous'}</h4>
              <div class="review-meta">
                <span class="stars">${getStars(Number(review.productRating) || 0)}</span>
                <span class="date">${formatTimestamp(review.timestamp)}</span>
              </div>
            </div>
          </div>
          <div class="review-content">
            <p>${review.reviewText || 'No review text provided'}</p>
          </div>
        `;
        reviewCard.addEventListener("click", () => openModal(review));
        reviewsContainer.appendChild(reviewCard);
        setTimeout(() => reviewCard.classList.add("visible"), index * 100);
      });

      displayedReviews = reviewsToShow.length;
      updateButtonVisibility();
    } else {
      console.error("reviewsContainer element not found");
    }
  }

  // Open modal with review details
  function openModal(review) {
    let existingModal = document.getElementById("reviewModal");
    if (existingModal) existingModal.remove();
  
    // Backdrop
    const modal = document.createElement("div");
    modal.id = "reviewModal";
    modal.className = "modal";
    modal.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(17, 24, 39, 0.55);
      backdrop-filter: blur(12px) saturate(150%);
      z-index: 1050;
      animation: fadeInBackdrop 0.35s ease-out;
      padding: 20px;
    `;
  
    // Modal Content
    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 28px 28px 36px;
      width: 100%;
      max-width: 500px;
      border-radius: 24px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.25);
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      animation: slideUpModal 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    `;
  
    // Close Button (top-right)
    const closeBtn = document.createElement("div");
    closeBtn.id = "closeModal";
    closeBtn.textContent = "×";
    closeBtn.style.cssText = `
      position: absolute;
      top: 14px;
      right: 14px;
      width: 36px;
      height: 36px;
      background: rgba(0, 0, 0, 0.65);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      cursor: pointer;
      transition: all 0.25s ease;
    `;
    closeBtn.addEventListener("mouseover", () => closeBtn.style.background = "rgba(0,0,0,0.8)");
    closeBtn.addEventListener("mouseout", () => closeBtn.style.background = "rgba(0,0,0,0.65)");
    closeBtn.addEventListener("click", () => modal.remove());
  
    // Product Image (Hero)
      const productImg = document.createElement("img");
      productImg.src = review.productImageUrl || "";
      productImg.alt = "Product Image";
      productImg.style.cssText = `
        width: 100%;
        max-width: 220px;
        border-radius: 20px;
        object-fit: cover;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
        margin-top: 20px;
        margin-bottom: 20px;
        transition: transform 0.35s ease;
      `;
      productImg.addEventListener("mouseover", () => productImg.style.transform = "scale(1.05)");
      productImg.addEventListener("mouseout", () => productImg.style.transform = "scale(1)");
  
    // Title
    const title = document.createElement("h2");
    title.textContent = "Review Details";
    title.style.cssText = `
      font-size: 1.6rem;
      font-weight: 700;
      color: #111827;
      margin: 0 0 16px;
      text-align: center;
    `;
  
    // Detail line generator
    const makeDetailLine = (label, value) => {
      const p = document.createElement("p");
      p.innerHTML = `<strong style="color:#111827">${label}:</strong> ${value}`;
      p.style.cssText = `
        font-size: 1rem;
        color: #374151;
        margin: 8px 0;
        text-align: center;
        line-height: 1.4;
      `;
      return p;
    };
  
    const productNameP = makeDetailLine("Product", review.productName || "Unknown Product");
    const reviewerNameP = makeDetailLine("Reviewer", review.username || "Anonymous");
  
    // Review Text box
    const reviewTextBox = document.createElement("div");
    reviewTextBox.style.cssText = `
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 14px 16px;
      margin-top: 14px;
      width: 100%;
      color: #374151;
      font-size: 0.95rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      text-align: left;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
    `;
    reviewTextBox.textContent = review.reviewText || "No review text provided";
  
    // Review Image (optional)
    if (review.reviewImageUrl) {
      const reviewImg = document.createElement("img");
      reviewImg.src = review.reviewImageUrl;
      reviewImg.alt = "Review Image";
      reviewImg.style.cssText = `
        width: 100%;
        max-width: 220px;
        border-radius: 20px;
        object-fit: cover;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
        margin-top: 20px;
        transition: transform 0.35s ease;
      `;
      reviewImg.addEventListener("mouseover", () => reviewImg.style.transform = "scale(1.05)");
      reviewImg.addEventListener("mouseout", () => reviewImg.style.transform = "scale(1)");
      modalContent.appendChild(reviewImg);
    }
  
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(productImg);
    modalContent.appendChild(title);
    modalContent.appendChild(productNameP);
    modalContent.appendChild(reviewerNameP);
    modalContent.appendChild(reviewTextBox);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  
    // Animations
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      @keyframes fadeInBackdrop {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUpModal {
        from { opacity: 0; transform: translateY(30px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
  
      @media (max-width: 500px) {
        #reviewModal > div {
          padding: 20px 18px 30px;
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  

  // Get avatar color
  function getAvatarColor(name) {
    const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96c93d", "#f7b731"];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Update button visibility
  function updateButtonVisibility() {
    if (loadMoreBtn) {
      loadMoreBtn.style.display = displayedReviews < reviews.length ? "inline-block" : "none";
    }
    if (showLessBtn) {
      showLessBtn.style.display = displayedReviews > reviewsPerLoad ? "inline-block" : "none";
    }
  }

  // Event listeners
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      displayReviews();
    });
  }
  if (showLessBtn) {
    showLessBtn.addEventListener("click", () => {
      displayedReviews = Math.max(reviewsPerLoad, displayedReviews - reviewsPerLoad);
      displayReviews();
    });
  }

  // Google Analytics
  if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost' && typeof gtag === 'function') {
    gtag('config', 'G-MFRED6BJX5');
  }
});