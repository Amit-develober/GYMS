// ApexGym - Single Page Application Core Controller
import { authAPI } from "./auth.js";
import { dbAPI } from "./db.js";
import { isFirebaseConnected } from "./firebase-config.js";

// --- GLOBAL STATE ---
let currentRoute = "dashboard";
let studentsList = [];
let paymentsList = [];
let expensesList = [];
let attendanceList = [];

// --- CONSTANTS & HELPERS ---
let currencySymbol = localStorage.getItem("gym_currency") || "$";

const updateDOMCurrencySymbols = () => {
  document.querySelectorAll(".currency-label-symbol").forEach((el) => {
    el.innerText = currencySymbol;
  });
};

// Format date to local readable format
const formatLocalDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const options = { year: "numeric", month: "short", day: "numeric" };
  return new Date(dateStr).toLocaleDateString(undefined, options);
};

// Check if a date string falls in the current calendar month
const isCurrentMonth = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

// Calculate membership expiry date: enrollment + months * 30 days
const calcExpiryDate = (enrollDateStr, months) => {
  const date = new Date(enrollDateStr);
  date.setDate(date.getDate() + (parseInt(months) * 30));
  return date.toISOString().split("T")[0];
};

const updateEnrollExpiry = () => {
  const enrollDate = document.getElementById("enroll-date")?.value;
  const months = document.getElementById("enroll-membership")?.value;
  const expiryInput = document.getElementById("enroll-expiry");
  if (enrollDate && months && expiryInput) {
    expiryInput.value = calcExpiryDate(enrollDate, months);
  }
};

// Calculate number of days between two dates
const getDaysDiff = (dateStrStart, dateStrEnd) => {
  const start = new Date(dateStrStart);
  const end = new Date(dateStrEnd);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Toast notification module
const showToast = (message, type = "success") => {
  // Remove existing toasts first to prevent stacking issues
  const existingToasts = document.querySelectorAll(".notification-toast");
  existingToasts.forEach((t) => t.remove());

  const toast = document.createElement("div");
  toast.className = `notification-toast toast-${type}`;
  toast.style.position = "fixed";
  toast.style.bottom = "2rem";
  toast.style.right = "2rem";
  toast.style.zIndex = "9999";
  toast.style.background = "rgba(17, 25, 40, 0.9)";
  toast.style.border = `1px solid ${type === "success" ? "var(--accent-green)" : type === "warning" ? "var(--accent-yellow)" : "var(--accent-red)"}`;
  toast.style.padding = "0.85rem 1.5rem";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "var(--shadow-card)";
  toast.style.backdropFilter = "blur(20px)";
  toast.style.color = "#fff";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "0.75rem";
  toast.style.animation = "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
  
  const icon = type === "success" ? "check-circle" : type === "warning" ? "alert-triangle" : "alert-circle";
  const iconColor = type === "success" ? "var(--accent-green)" : type === "warning" ? "var(--accent-yellow)" : "var(--accent-red)";
  toast.innerHTML = `<i data-lucide="${icon}" style="color:${iconColor}"></i> <span>${message}</span>`;
  
  document.body.appendChild(toast);
  if (window.lucide) {
    window.lucide.createIcons();
  }
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Get today's local date in YYYY-MM-DD
const getTodayDateString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split("T")[0];
};



// Watch online/offline statuses
const setupNetworkListeners = () => {
  const checkStatus = () => {
    const offlineBanner = document.getElementById("offline-banner");
    if (navigator.onLine) {
      offlineBanner.style.display = "none";
    } else {
      offlineBanner.style.display = "flex";
      showToast("Offline mode: changes will save locally.", "warning");
    }
  };
  window.addEventListener("online", checkStatus);
  window.addEventListener("offline", checkStatus);
  checkStatus(); // Init check
};

// Watch login states
const setupAuthListeners = () => {
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");
  const demoBanner = document.getElementById("demo-banner");

  authAPI.onAuthStateChanged(async (user) => {
    if (user) {
      // User logged in
      authScreen.style.display = "none";
      appScreen.style.display = "flex";
      
      // Show local storage demo warning if needed
      demoBanner.style.display = isFirebaseConnected ? "none" : "flex";

      // Setup user details
      const email = user.email || "Admin Operator";
      document.getElementById("sidebar-username").innerText = email.split("@")[0];
      document.getElementById("sidebar-avatar").innerText = email.charAt(0).toUpperCase();

      // Check gym profile onboarding status
      await checkGymProfileOnboarding();
    } else {
      // User logged out
      appScreen.style.display = "none";
      authScreen.style.display = "flex";
    }
    if (window.lucide) window.lucide.createIcons();
  });

  // Auth toggle signup / login link
  let isSignupMode = false;
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authSubtitle = document.getElementById("auth-subtitle");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authSwitchText = document.getElementById("auth-switch-text");
  const authSwitchLink = document.getElementById("auth-switch-link");

  authSwitchLink.addEventListener("click", () => {
    isSignupMode = !isSignupMode;
    if (isSignupMode) {
      authTitle.innerText = "Register Admin";
      authSubtitle.innerText = "Create a new operator account for ApexGym";
      authSubmitBtn.innerText = "Register";
      authSwitchText.innerText = "Already have an account?";
      authSwitchLink.innerText = "Login Here";
    } else {
      authTitle.innerText = "Welcome to ApexGym";
      authSubtitle.innerText = "Login to access your gym operations dashboard";
      authSubmitBtn.innerText = "Login";
      authSwitchText.innerText = "Don't have an admin account?";
      authSwitchLink.innerText = "Register Here";
    }
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;

    try {
      if (isSignupMode) {
        await authAPI.signup(email, password);
        showToast("Registration successful!", "success");
      } else {
        await authAPI.login(email, password);
        showToast("Logged in successfully!", "success");
      }
    } catch (err) {
      showToast(err.message, "danger");
    }
  });

  // Logout buttons
  document.getElementById("btn-logout-desktop").addEventListener("click", () => authAPI.logout());
  document.getElementById("btn-logout-mobile").addEventListener("click", () => authAPI.logout());

  // Google Login button binding
  const googleBtn = document.getElementById("btn-google-login");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await authAPI.loginWithGoogle();
        showToast("Signed in successfully!", "success");
      } catch (err) {
        showToast(err.message, "danger");
      }
    });
  }
};

// --- SPA ROUTING ---
const setupNavigation = () => {
  window.addEventListener("hashchange", handleRouting);
};

const handleRouting = () => {
  const hash = window.location.hash.replace("#", "") || "dashboard";
  currentRoute = hash;

  // Active navigation items (Desktop Sidebar / Mobile Drawer)
  document.querySelectorAll(".sidebar .nav-item").forEach((el) => {
    if (el.getAttribute("data-target") === hash) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Close mobile sidebar drawer if open
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  if (sidebar && sidebar.classList.contains("active")) {
    sidebar.classList.remove("active");
  }
  if (sidebarOverlay && sidebarOverlay.classList.contains("active")) {
    sidebarOverlay.classList.remove("active");
  }

  // Swap pages
  document.querySelectorAll(".page-section").forEach((sec) => {
    sec.classList.remove("active");
  });
  const activeSec = document.getElementById(`view-${hash}`);
  if (activeSec) {
    activeSec.classList.add("active");
    // Trigger route loaders
    loadRouteData(hash);
  }
};

const loadRouteData = async (route) => {
  try {
    switch (route) {
      case "dashboard":
        await loadDashboard();
        break;
      case "attendance":
        await loadAttendance();
        break;
      case "enroll":
        document.getElementById("enroll-date").value = getTodayDateString();
        updateEnrollExpiry();
        await loadEnrollDirectory();
        break;
      case "expenses":
        document.getElementById("expense-date").value = getTodayDateString();
        await loadExpenses();
        break;
      case "settings":
        const selectEl = document.getElementById("settings-currency");
        if (selectEl) {
          selectEl.value = currencySymbol;
        }
        break;
      case "about":
        break;
    }
  } catch (err) {
    console.error(`Error loading data for route: ${route}`, err);
    showToast("Failed to fetch records.", "danger");
  }
  if (window.lucide) window.lucide.createIcons();
};

// --- DASHBOARD ROUTE ---
const loadDashboard = async () => {
  // Parallel fetch records
  const [students, expenses, payments, attendance] = await Promise.all([
    dbAPI.getStudents(),
    dbAPI.getExpenses(),
    dbAPI.getPayments(),
    dbAPI.getAttendance(getTodayDateString())
  ]);

  studentsList = students;
  expensesList = expenses;
  paymentsList = payments;
  attendanceList = attendance;

  const today = getTodayDateString();

  // 1. Total Students (exclude Out students)
  document.getElementById("stat-total-students").innerText = students.filter((s) => !s.isOut).length;

  // 2. Today Attendance
  const presentCount = attendance.filter((a) => a.status === "present").length;
  document.getElementById("stat-today-attendance").innerText = presentCount;

  // 3. Pending Fee Count (expiryDate < today, exclude Out students)
  const unpaidCount = students.filter((s) => !s.isOut && s.expiryDate < today).length;
  document.getElementById("stat-pending-fees").innerText = unpaidCount;

  // 4. Financial computations (This month)
  let monthRevenue = 0;
  payments.forEach((p) => {
    if (isCurrentMonth(p.date)) {
      monthRevenue += parseFloat(p.amount) || 0;
    }
  });

  let monthExpenses = 0;
  expenses.forEach((e) => {
    if (isCurrentMonth(e.date)) {
      monthExpenses += parseFloat(e.amount) || 0;
    }
  });

  document.getElementById("stat-month-expenses").innerText = `${currencySymbol}${monthExpenses.toFixed(2)}`;

  let profit = 0;
  let loss = 0;
  if (monthRevenue > monthExpenses) {
    profit = monthRevenue - monthExpenses;
  } else {
    loss = monthExpenses - monthRevenue;
  }

  document.getElementById("stat-month-profit").innerText = `${currencySymbol}${profit.toFixed(2)}`;
  document.getElementById("stat-month-loss").innerText = `${currencySymbol}${loss.toFixed(2)}`;

  // 5. Render Recent Payment Table
  const recentPaymentsTbody = document.getElementById("dashboard-recent-payments");
  if (payments.length === 0) {
    recentPaymentsTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No payments recorded.</td></tr>`;
  } else {
    recentPaymentsTbody.innerHTML = payments
      .slice(0, 5)
      .map((p) => `
        <tr>
          <td>${p.studentName}</td>
          <td>${formatLocalDate(p.date)}</td>
          <td>${p.paymentMethod}</td>
          <td style="color: var(--accent-green); font-weight:600;">+${currencySymbol}${parseFloat(p.amount).toFixed(2)}</td>
        </tr>
      `).join("");
  }

  // 6. Render Recent Expenses Table
  const recentExpensesTbody = document.getElementById("dashboard-recent-expenses");
  if (expenses.length === 0) {
    recentExpensesTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No expenses logged.</td></tr>`;
  } else {
    recentExpensesTbody.innerHTML = expenses
      .slice(0, 5)
      .map((e) => `
        <tr>
          <td>${e.description || e.category}</td>
          <td>${formatLocalDate(e.date)}</td>
          <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border-light);">${e.category}</span></td>
          <td style="color: var(--accent-red); font-weight:600;">-${currencySymbol}${parseFloat(e.amount).toFixed(2)}</td>
        </tr>
      `).join("");
  }
};

// --- ATTENDANCE ROUTE ---
const loadAttendance = async () => {
  const today = getTodayDateString();
  
  // Format long date display
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  document.getElementById("attendance-date-display").innerText = `Date: ${new Date().toLocaleDateString(undefined, options)}`;

  // Parallel fetch students & today attendance
  const [students, todayAttendance] = await Promise.all([
    dbAPI.getStudents(),
    dbAPI.getAttendance(today)
  ]);

  studentsList = students.filter((s) => !s.isOut);
  attendanceList = todayAttendance;

  renderAttendanceList(studentsList, attendanceList);

  // Setup live search filter
  const searchInput = document.getElementById("attendance-search");
  searchInput.value = ""; // clear previous search
  searchInput.oninput = (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filteredStudents = studentsList.filter(
      (s) => s.name.toLowerCase().includes(query) || s.mobile.includes(query)
    );
    renderAttendanceList(filteredStudents, attendanceList);
  };
};

const renderAttendanceList = (students, attendance) => {
  const tbody = document.getElementById("attendance-member-list");
  const today = getTodayDateString();

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No members found.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((s) => {
    // Determine status badge
    const isExpired = s.expiryDate < today;
    const statusBadge = isExpired
      ? `<span class="badge badge-danger">Expired</span>`
      : `<span class="badge badge-success">Active</span>`;
    
    // Check attendance check-in status
    const record = attendance.find((a) => a.studentId === s.id);
    const isPresent = record && record.status === "present";

    return `
      <tr>
        <td style="font-weight: 500;">${s.name}</td>
        <td>${s.mobile}</td>
        <td>${statusBadge}</td>
        <td>${formatLocalDate(s.expiryDate)}</td>
        <td style="text-align: right;">
          <label class="switch">
            <input type="checkbox" class="attendance-toggle" data-id="${s.id}" data-name="${s.name}" ${isPresent ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </td>
      </tr>
    `;
  }).join("");

  // Bind Switch Event Listeners
  document.querySelectorAll(".attendance-toggle").forEach((el) => {
    el.addEventListener("change", async (e) => {
      const studentId = e.target.getAttribute("data-id");
      const studentName = e.target.getAttribute("data-name");
      const isChecked = e.target.checked;
      const status = isChecked ? "present" : "absent";
      const date = getTodayDateString();

      try {
        await dbAPI.markAttendance(studentId, studentName, date, status);
        showToast(`${studentName} marked ${status}.`, "success");
      } catch (err) {
        showToast("Error logging attendance.", "danger");
        e.target.checked = !isChecked; // Revert checkbox
      }
    });
  });
};

// --- EXPENSES ROUTE ---
const loadExpenses = async () => {
  const expenses = await dbAPI.getExpenses();
  expensesList = expenses;
  
  const tbody = document.getElementById("expenses-list");
  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No expenses logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map((e) => `
    <tr>
      <td>${formatLocalDate(e.date)}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border-light);">${e.category}</span></td>
      <td>${e.description || "-"}</td>
      <td style="color: var(--accent-red); font-weight:600;">-${currencySymbol}${parseFloat(e.amount).toFixed(2)}</td>
      <td style="text-align: right;">
        <button class="icon-btn delete btn-delete-expense" data-id="${e.id}">
          <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
        </button>
      </td>
    </tr>
  `).join("");

  if (window.lucide) window.lucide.createIcons();

  // Bind Delete buttons
  document.querySelectorAll(".btn-delete-expense").forEach((btn) => {
    btn.onclick = async (e) => {
      const btnEl = e.currentTarget;
      const id = btnEl.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this expense?")) {
        try {
          await dbAPI.deleteExpense(id);
          showToast("Expense deleted.", "success");
          await loadExpenses();
        } catch (err) {
          showToast("Failed to delete expense.", "danger");
        }
      }
    };
  });
};

// --- MEMBER DIRECTORY ROUTE ---
const loadEnrollDirectory = async () => {
  const [students, allAttendance] = await Promise.all([
    dbAPI.getStudents(),
    dbAPI.getAllAttendance()
  ]);

  const searchInput = document.getElementById("enroll-student-search");
  const statusFilter = document.getElementById("enroll-student-status-filter");

  if (!searchInput || !statusFilter) return;

  const renderList = () => {
    const query = searchInput.value.toLowerCase().trim();
    const statusVal = statusFilter.value;
    const today = getTodayDateString();

    const filtered = students.filter((s) => {
      // 1. Status Filter
      if (statusVal === "active" && s.isOut) return false;
      if (statusVal === "out" && !s.isOut) return false;

      // 2. Search Query (name or mobile)
      const nameMatch = s.name.toLowerCase().includes(query);
      const mobileMatch = s.mobile.includes(query);
      return nameMatch || mobileMatch;
    });

    const tbody = document.getElementById("enroll-student-list");
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No members found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s) => {
      // Calculate attendance rate (presentCount / elapsedDays)
      const presentCount = allAttendance.filter((a) => a.studentId === s.id && a.status === "present").length;
      const start = s.enrollmentDate || s.createdAt || today;
      const elapsedDays = Math.max(1, getDaysDiff(start, today) + 1);
      const attendanceRateText = `${presentCount} / ${elapsedDays}`;

      // Status Badge
      let statusBadge = "";
      if (s.isOut) {
        statusBadge = `<span class="badge badge-danger">Out</span>`;
      } else if (s.expiryDate < today) {
        statusBadge = `<span class="badge badge-warning">Unpaid</span>`;
      } else {
        statusBadge = `<span class="badge badge-success">Active</span>`;
      }

      // Action Button
      let actionBtn = "";
      if (s.isOut) {
        actionBtn = `
          <button class="btn btn-primary btn-toggle-status" data-id="${s.id}" data-action="activate" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">
            Re-activate
          </button>
        `;
      } else {
        actionBtn = `
          <button class="btn btn-secondary btn-toggle-status" data-id="${s.id}" data-action="out" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #f87171;">
            Mark Out
          </button>
        `;
      }

      return `
        <tr>
          <td style="font-weight: 500;">${s.name}</td>
          <td>${s.mobile}</td>
          <td>${formatLocalDate(s.enrollmentDate)}</td>
          <td>${s.membershipMonths} Month${s.membershipMonths > 1 ? "s" : ""}</td>
          <td>${attendanceRateText}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">${actionBtn}</td>
        </tr>
      `;
    }).join("");

    // Bind Toggle Status Buttons
    tbody.querySelectorAll(".btn-toggle-status").forEach((btn) => {
      btn.onclick = async (e) => {
        const studentId = e.currentTarget.getAttribute("data-id");
        const action = e.currentTarget.getAttribute("data-action");
        const isOut = action === "out";

        try {
          await dbAPI.updateStudent(studentId, { isOut });
          showToast(`Student marked as ${isOut ? "Out" : "Active"}.`, "success");
          
          // Update local copy of students list and re-render
          const idx = students.findIndex((stud) => stud.id === studentId);
          if (idx !== -1) {
            students[idx].isOut = isOut;
          }
          renderList();
        } catch (err) {
          console.error(err);
          showToast("Failed to update student status.", "danger");
        }
      };
    });
  };

  // Bind live search & filter events
  searchInput.oninput = renderList;
  statusFilter.onchange = renderList;

  // Initial render
  renderList();
};

// --- FORMS HANDLING ---
const setupFormHandlers = () => {
  // Dynamic Expiry Calculation listeners
  const enrollDateInput = document.getElementById("enroll-date");
  const enrollMembershipInput = document.getElementById("enroll-membership");
  if (enrollDateInput) {
    enrollDateInput.addEventListener("change", updateEnrollExpiry);
  }
  if (enrollMembershipInput) {
    enrollMembershipInput.addEventListener("change", updateEnrollExpiry);
  }

  // Enroll Form Submit
  const enrollForm = document.getElementById("enroll-form");
  if (enrollForm) {
    enrollForm.addEventListener("reset", () => {
      setTimeout(updateEnrollExpiry, 0);
    });

    enrollForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("enroll-name").value.trim();
      const mobile = document.getElementById("enroll-mobile").value.trim();
      const enrollDate = document.getElementById("enroll-date").value;
      const months = document.getElementById("enroll-membership").value;
      const feeCollected = parseFloat(document.getElementById("enroll-fee").value);
      const paymentMethod = "Default"; // Removed from form

      // Set to one day before enrollment date so they start strictly expired/unpaid
      const yesterday = new Date(enrollDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const expiryDate = yesterday.toISOString().split("T")[0];

      try {
        // 1. Save student details
        await dbAPI.addStudent({
          name,
          mobile,
          enrollmentDate: enrollDate,
          membershipMonths: months,
          expiryDate,
          feeAmount: feeCollected
        });

        showToast(`Successfully enrolled ${name}!`, "success");
        enrollForm.reset();
        await loadEnrollDirectory();
        
        // Redirect to dashboard
        window.location.hash = "#dashboard";
      } catch (err) {
        console.error(err);
        showToast("Enrollment failed. Please check input values.", "danger");
      }
    });
  }

  // Expense Form Submit
  const expenseForm = document.getElementById("expense-form");
  expenseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = document.getElementById("expense-date").value;
    const amount = document.getElementById("expense-amount").value;
    const category = document.getElementById("expense-category").value;
    const description = document.getElementById("expense-desc").value.trim();

    try {
      await dbAPI.addExpense({
        date,
        amount,
        category,
        description
      });

      showToast("Expense logged successfully.", "success");
      expenseForm.reset();
      document.getElementById("expense-date").value = getTodayDateString();
      await loadExpenses();
    } catch (err) {
      showToast("Failed to log expense.", "danger");
    }
  });

  // Onboarding Form Submit
  const onboardingForm = document.getElementById("onboarding-form");
  if (onboardingForm) {
    onboardingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const gymName = document.getElementById("onboard-gym-name").value.trim();
      const address = document.getElementById("onboard-gym-address").value.trim();
      const phone = document.getElementById("onboard-gym-phone").value.trim();

      try {
        await dbAPI.saveGymProfile({
          gymName,
          address,
          phone
        });
        showToast("Gym Profile configured successfully!", "success");
        await checkGymProfileOnboarding();
      } catch (err) {
        showToast("Failed to save gym profile.", "danger");
      }
    });
  }
};

// --- MODAL & POPUP HANDLERS ---
const setupModalHandlers = () => {
  const pendingModal = document.getElementById("pending-fees-modal");
  const pendingCard = document.getElementById("card-pending-fees");
  const closeBtnHeader = document.getElementById("btn-close-pending-modal");
  const closeBtnFooter = document.getElementById("btn-close-pending-modal-footer");
  const renewalDrawer = document.getElementById("renewal-drawer");

  // Show Pending Fees Modal
  pendingCard.addEventListener("click", async () => {
    await loadPendingFeesModal();
    pendingModal.classList.add("active");
  });

  // Close Modal triggers
  const closeModal = () => {
    pendingModal.classList.remove("active");
    renewalDrawer.style.display = "none";
    loadDashboard(); // Refresh stats when modal closes
  };
  closeBtnHeader.addEventListener("click", closeModal);
  closeBtnFooter.addEventListener("click", closeModal);
  
  // Close on backdrop click
  pendingModal.addEventListener("click", (e) => {
    if (e.target === pendingModal) closeModal();
  });

  // Cancel Renewal inline form
  document.getElementById("btn-cancel-renewal").onclick = (e) => {
    e.preventDefault();
    renewalDrawer.style.display = "none";
  };

  // Renewal Form submit
  const renewalForm = document.getElementById("renewal-form");
  renewalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const studentId = document.getElementById("renew-student-id").value;
    const studentName = document.getElementById("renew-student-name").innerText.split(":")[1]?.trim() || "Student";
    const paymentDate = document.getElementById("renew-date").value;
    const paymentMethod = document.getElementById("renew-method").value;
    const renewMonths = document.getElementById("renew-months").value;
    const amountCollected = parseFloat(document.getElementById("renew-amount").value);

    const newExpiryDate = calcExpiryDate(paymentDate, renewMonths);

    try {
      // 1. Update Student record in DB
      await dbAPI.updateStudent(studentId, {
        expiryDate: newExpiryDate,
        membershipMonths: renewMonths
      });

      // 2. Save Payment record for Revenue count
      await dbAPI.addPayment({
        studentId,
        studentName,
        amount: amountCollected,
        date: paymentDate,
        paymentMethod,
        type: "renewal"
      });

      showToast(`Membership for ${studentName} renewed successfully!`, "success");
      
      // Reset & close drawer, reload lists
      renewalForm.reset();
      renewalDrawer.style.display = "none";
      await loadPendingFeesModal();
    } catch (err) {
      console.error(err);
      showToast("Renewal failed.", "danger");
    }
  });
};

const loadPendingFeesModal = async () => {
  const students = await dbAPI.getStudents();
  const today = getTodayDateString();

  // Filter expired students (exclude Out students)
  const unpaidStudents = students.filter((s) => !s.isOut && s.expiryDate < today);

  const tbody = document.getElementById("unpaid-members-list");
  if (unpaidStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No members with pending fees.</td></tr>`;
    return;
  }

  tbody.innerHTML = unpaidStudents.map((s) => {
    const daysUnpaid = getDaysDiff(s.expiryDate, today);
    return `
      <tr>
        <td style="font-weight: 600;">${s.name}</td>
        <td>${s.mobile}</td>
        <td style="color: var(--accent-red);">${formatLocalDate(s.expiryDate)}</td>
        <td><span style="color: var(--accent-yellow); font-weight: 500;">${daysUnpaid} Days</span></td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-renew-member" 
            data-id="${s.id}" 
            data-name="${s.name}" 
            data-fee="${s.feeAmount || 1000}" 
            data-months="${s.membershipMonths || 1}"
            style="padding: 0.45rem 0.85rem; font-size: 0.75rem;">
            Mark Paid
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Bind Renew/Mark as Paid buttons
  document.querySelectorAll(".btn-renew-member").forEach((btn) => {
    btn.onclick = (e) => {
      const studentId = e.currentTarget.getAttribute("data-id");
      const studentName = e.currentTarget.getAttribute("data-name");
      const baseFee = e.currentTarget.getAttribute("data-fee");
      const baseMonths = e.currentTarget.getAttribute("data-months") || 1;

      // Open drawer & populate fields
      const renewalDrawer = document.getElementById("renewal-drawer");
      document.getElementById("renew-student-id").value = studentId;
      document.getElementById("renew-student-name").innerText = `Renewing: ${studentName}`;
      document.getElementById("renew-date").value = getTodayDateString();
      document.getElementById("renew-months").value = baseMonths;
      
      const renewAmountInput = document.getElementById("renew-amount");
      renewAmountInput.value = baseFee;
      document.getElementById("renew-original-fee").value = baseFee; // track base fee

      // Update amount dynamically if months change
      document.getElementById("renew-months").onchange = (ev) => {
        const factor = parseInt(ev.target.value) / parseInt(baseMonths);
        renewAmountInput.value = Math.round(parseFloat(baseFee) * factor);
      };

      renewalDrawer.style.display = "block";
      renewalDrawer.scrollIntoView({ behavior: "smooth" });
    };
  });
};

// Onboarding and Profile Verification Gate
const checkGymProfileOnboarding = async () => {
  try {
    const profile = await dbAPI.getGymProfile();
    const onboardingModal = document.getElementById("onboarding-modal");
    
    if (!profile) {
      // Block dashboard access and show onboarding modal
      onboardingModal.classList.add("active");
    } else {
      // Hide onboarding modal
      onboardingModal.classList.remove("active");
      
      // Apply gym configuration dynamically to DOM
      const gymName = profile.gymName || "ApexGym";
      const gymAddress = profile.address || "";
      
      document.getElementById("header-gym-name").innerText = gymName;
      document.getElementById("mobile-header-gym-name").innerText = gymName;
      document.getElementById("about-gym-title").innerText = `${gymName} Manager v1.0.0`;
      document.getElementById("about-gym-address").innerText = `Location: ${gymAddress}`;
      
      // Launch router
      handleRouting();
    }
  } catch (err) {
    console.error("Onboarding check failed:", err);
    showToast("Error loading gym configuration.", "danger");
  }
};

// --- INITIALIZATION GATE ---
const setupMobileSidebar = () => {
  const sidebar = document.querySelector(".sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const hamburgerBtn = document.getElementById("btn-hamburger");
  const closeSidebarBtn = document.getElementById("btn-close-sidebar");

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", () => {
      sidebar.classList.add("active");
      sidebarOverlay.classList.add("active");
    });
  }

  const closeSidebar = () => {
    sidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
  };

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }
};

const setupSettingsHandlers = () => {
  const settingsForm = document.getElementById("settings-form");
  const resetBtn = document.getElementById("btn-reset-database");

  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const newSymbol = document.getElementById("settings-currency").value;
      currencySymbol = newSymbol;
      localStorage.setItem("gym_currency", newSymbol);
      
      // Update DOM labels instantly
      updateDOMCurrencySymbols();
      
      showToast("Settings saved successfully!", "success");
      
      // Refresh dashboard
      loadDashboard();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const confirm1 = confirm("⚠️ WARNING: Are you sure you want to reset the gym database? This will permanently delete all members, payments, expenses, and configuration data!");
      if (!confirm1) return;

      const confirm2 = confirm("🚨 FINAL CONFIRMATION: This action is completely irreversible. Are you absolutely certain you want to proceed with deleting all data?");
      if (!confirm2) return;

      try {
        showToast("Resetting database...", "warning");
        await dbAPI.resetData();
        showToast("Database successfully reset!", "success");
        
        // Reload page to force onboarding screen
        setTimeout(() => {
          window.location.hash = "#dashboard";
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error(err);
        showToast("Failed to reset database.", "danger");
      }
    });
  }
};

const enforceNumericInputs = () => {
  // Select phone/mobile fields that must contain ONLY digits
  const integerFields = [
    document.getElementById("enroll-mobile"),
    document.getElementById("onboard-gym-phone")
  ];

  integerFields.forEach((field) => {
    if (!field) return;
    field.setAttribute("inputmode", "numeric");
    field.setAttribute("pattern", "[0-9]*");

    field.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "");
    });
  });

  // Select fee/amount fields that must contain ONLY valid positive numbers/decimals
  const decimalFields = [
    document.getElementById("enroll-fee"),
    document.getElementById("expense-amount"),
    document.getElementById("renew-amount")
  ];

  decimalFields.forEach((field) => {
    if (!field) return;
    field.setAttribute("inputmode", "decimal");
    field.setAttribute("min", "0");

    field.addEventListener("keypress", (e) => {
      if (["e", "E", "+", "-"].includes(e.key)) {
        e.preventDefault();
      }
    });

    field.addEventListener("input", (e) => {
      let val = e.target.value;
      if (val && (val.includes("e") || val.includes("E") || val.includes("-") || val.includes("+"))) {
        val = val.replace(/[eE\-\+]/g, "");
        e.target.value = val;
      }
    });
  });
};

const initApp = () => {
  setupNetworkListeners();
  setupAuthListeners();
  setupNavigation();
  setupFormHandlers();
  setupModalHandlers();
  setupMobileSidebar();
  setupSettingsHandlers();
  updateDOMCurrencySymbols();
  enforceNumericInputs();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
