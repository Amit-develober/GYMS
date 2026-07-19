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

// --- DEBOUNCE HELPER ---
const debounce = (func, delay = 100) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

// --- CONSTANTS & HELPERS ---
let currencySymbol = localStorage.getItem("gym_currency") || "₹";

const updateDOMCurrencySymbols = () => {
  document.querySelectorAll(".currency-label-symbol").forEach((el) => {
    el.innerText = currencySymbol;
  });
};

// Format date to local readable format
const formatLocalDate = (dateStr) => {
  if (!dateStr) return "N/A";
  // If date-only format, append local time prefix to prevent UTC shift
  const formattedStr = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`;
  const options = { year: "numeric", month: "short", day: "numeric" };
  return new Date(formattedStr).toLocaleDateString(undefined, options);
};

// Check if a date string falls in the current calendar month
const isCurrentMonth = (dateStr) => {
  if (!dateStr) return false;
  const formattedStr = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`;
  const date = new Date(formattedStr);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

// Format a Date object as YYYY-MM-DD using local timezone (avoids UTC shift)
const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Calculate membership expiry date: enrollment + duration in calendar months
const calcExpiryDate = (enrollDateStr, months) => {
  const date = new Date(`${enrollDateStr}T00:00:00`);
  const m = parseInt(months);
  
  // Store target day of the month
  const targetDay = date.getDate();
  
  // Set day to 1 first to prevent overflow when changing month
  date.setDate(1);
  date.setMonth(date.getMonth() + m);
  
  // Find maximum days in the target month (e.g. 28, 29, 30, or 31)
  const maxDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  
  // Set day to target day, capped at max days of the month
  date.setDate(Math.min(targetDay, maxDays));
  
  return toLocalDateString(date);
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
  if (!dateStrStart || !dateStrEnd) return 0;
  // Strip time component to calculate absolute calendar days difference in UTC
  const start = new Date(dateStrStart.split("T")[0]);
  const end = new Date(dateStrEnd.split("T")[0]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
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
  toast.style.background = "#111928";
  toast.style.border = `1px solid ${type === "success" ? "var(--accent-green)" : type === "warning" ? "var(--accent-yellow)" : "var(--accent-red)"}`;
  toast.style.padding = "0.85rem 1.5rem";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "var(--shadow-card)";
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
    window.lucide.createIcons({ root: toast });
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
      
      // Clean up modal states so they do not overlay the login screen
      document.getElementById("onboarding-modal")?.classList.remove("active");
      document.getElementById("pending-fees-modal")?.classList.remove("active");
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

const handleRouting = async () => {
  const hash = window.location.hash.replace("#", "") || "dashboard";
  currentRoute = hash;

  // Loophole check: verify if the gym profile onboarding has been completed
  const profile = await dbAPI.getGymProfile();
  if (!profile) {
    const onboardingModal = document.getElementById("onboarding-modal");
    if (onboardingModal) {
      onboardingModal.classList.add("active");
    }
    // Block routing by resetting URL hash to dashboard
    if (window.location.hash !== "" && window.location.hash !== "#dashboard") {
      window.location.hash = "#dashboard";
    }
    return;
  }

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
        document.getElementById("enroll-date").setAttribute("min", getTodayDateString());
        updateEnrollExpiry();
        await loadEnrollDirectory();
        break;
      case "expenses":
        document.getElementById("expense-date").value = getTodayDateString();
        document.getElementById("expense-date").setAttribute("min", getTodayDateString());
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
  const activeSec = document.getElementById(`view-${route}`);
  if (window.lucide && activeSec) {
    window.lucide.createIcons({ root: activeSec });
  }
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

  // 3. Pending Fee Count (expiryDate < today or paymentStatus === "Unpaid", exclude Out students)
  const unpaidCount = students.filter((s) => !s.isOut && (s.paymentStatus === "Unpaid" || s.expiryDate < today)).length;
  document.getElementById("stat-pending-fees").innerText = unpaidCount;

  // Expiring Soon Count (expiring in next 7 days, exclude Out students and unpaid students)
  const expiringCount = students.filter((s) => !s.isOut && s.paymentStatus !== "Unpaid" && s.expiryDate >= today && getDaysDiff(today, s.expiryDate) <= 7).length;
  const expiringSoonEl = document.getElementById("stat-expiring-soon");
  if (expiringSoonEl) {
    expiringSoonEl.innerText = expiringCount;
  }

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
  searchInput.oninput = debounce((e) => {
    const query = e.target.value.toLowerCase().trim();
    const filteredStudents = studentsList.filter(
      (s) => s.name.toLowerCase().includes(query) || s.mobile.includes(query)
    );
    renderAttendanceList(filteredStudents, attendanceList);
  }, 100);
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
    const isExpired = s.paymentStatus === "Unpaid" || s.expiryDate < today;
    const statusBadge = isExpired
      ? `<span class="badge badge-danger">Unpaid</span>`
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
  tbody.querySelectorAll(".attendance-toggle").forEach((el) => {
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

  if (window.lucide) {
    window.lucide.createIcons({ root: tbody });
  }

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

  // Pre-calculate present count for all students in O(N) time
  const presentCounts = {};
  allAttendance.forEach((a) => {
    if (a.status === "present") {
      presentCounts[a.studentId] = (presentCounts[a.studentId] || 0) + 1;
    }
  });

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
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No members found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s) => {
      // Calculate attendance rate (presentCount / elapsedDays) using O(1) lookups
      const presentCount = presentCounts[s.id] || 0;
      const start = s.enrollmentDate || s.createdAt || today;
      const elapsedDays = Math.max(1, getDaysDiff(start, today) + 1);
      const attendanceRateText = `${presentCount} / ${elapsedDays}`;

      // Payment Status Badge
      const isPaid = s.paymentStatus !== "Unpaid" && s.expiryDate >= today;
      const paymentBadge = isPaid
        ? `<span class="badge badge-success">Paid</span>`
        : `<span class="badge badge-danger">Unpaid</span>`;

      // Status Badge
      let statusBadge = "";
      if (s.isOut) {
        statusBadge = `<span class="badge badge-danger">Out</span>`;
      } else if (s.paymentStatus === "Unpaid" || s.expiryDate < today) {
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

      // Report download button
      const reportBtn = `
        <button class="icon-btn btn-download-report" data-id="${s.id}" style="color: var(--accent-cyan); display: inline-flex; align-items: center; justify-content: center; padding: 4px; margin-right: 8px;" title="Download Report">
          <i data-lucide="file-text" style="width: 18px; height: 18px;"></i>
        </button>
      `;

      return `
        <tr>
          <td style="font-weight: 500;">${s.name}</td>
          <td>${s.mobile}</td>
          <td>${formatLocalDate(s.enrollmentDate)}</td>
          <td>${s.membershipMonths} Month${s.membershipMonths > 1 ? "s" : ""}</td>
          <td>${attendanceRateText}</td>
          <td>${paymentBadge}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
            ${reportBtn}
            ${actionBtn}
          </td>
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

    // Bind Download Report Buttons
    tbody.querySelectorAll(".btn-download-report").forEach((btn) => {
      btn.onclick = async (e) => {
        const studentId = e.currentTarget.getAttribute("data-id");
        await downloadStudentReport(studentId);
      };
    });

    if (window.lucide) {
      window.lucide.createIcons({ root: tbody });
    }
  };

  // Bind live search & filter events with debounce
  searchInput.oninput = debounce(renderList, 100);
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
    enrollDateInput.addEventListener("change", (e) => {
      const today = getTodayDateString();
      if (e.target.value && e.target.value < today) {
        showToast("Enrollment date cannot be a past date.", "danger");
        e.target.value = today;
      }
      updateEnrollExpiry();
    });
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
      const feeCollected = parseFloat(document.getElementById("enroll-fee").value) || 0;
      const paymentStatus = document.getElementById("enroll-status").value;
      const paymentMethod = "Default"; // Removed from form

      const today = getTodayDateString();
      if (enrollDate && enrollDate < today) {
        showToast("Enrollment date cannot be a past date.", "danger");
        return;
      }

      let expiryDate;
      const expiryInput = document.getElementById("enroll-expiry");
      expiryDate = expiryInput && expiryInput.value ? expiryInput.value : calcExpiryDate(enrollDate, months);

      try {
        // 1. Save student details
        const newStudent = await dbAPI.addStudent({
          name,
          mobile,
          enrollmentDate: enrollDate,
          membershipMonths: parseInt(months),
          expiryDate,
          feeAmount: feeCollected,
          paymentStatus
        });

        // 2. Add payment record only if Paid and fee is greater than 0
        if (paymentStatus === "Paid" && feeCollected > 0) {
          await dbAPI.addPayment({
            studentId: newStudent.id,
            studentName: name,
            amount: feeCollected,
            date: enrollDate,
            paymentMethod: "Cash",
            type: "enrollment"
          });
        }

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
    
    const today = getTodayDateString();
    if (date && date < today) {
      showToast("Expense date cannot be a past date.", "danger");
      return;
    }

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
      document.getElementById("expense-date").setAttribute("min", getTodayDateString());
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
      const ownerName = document.getElementById("onboard-gym-owner").value.trim();

      try {
        await dbAPI.saveGymProfile({
          gymName,
          address,
          phone,
          ownerName
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

  const expiringModal = document.getElementById("expiring-soon-modal");
  const expiringCard = document.getElementById("card-expiring-soon");
  const closeExpiringHeader = document.getElementById("btn-close-expiring-modal");
  const closeExpiringFooter = document.getElementById("btn-close-expiring-modal-footer");

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

  // Show Expiring Soon Modal
  if (expiringCard) {
    expiringCard.addEventListener("click", async () => {
      await loadExpiringSoonModal();
      expiringModal.classList.add("active");
    });
  }

  // Close Expiring Modal triggers
  const closeExpiringModal = () => {
    expiringModal.classList.remove("active");
    loadDashboard();
  };
  if (closeExpiringHeader) closeExpiringHeader.addEventListener("click", closeExpiringModal);
  if (closeExpiringFooter) closeExpiringFooter.addEventListener("click", closeExpiringModal);
  if (expiringModal) {
    expiringModal.addEventListener("click", (e) => {
      if (e.target === expiringModal) closeExpiringModal();
    });
  }

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
    const studentName = document.getElementById("renew-student-name").getAttribute("data-name") || "Student";
    const paymentDate = document.getElementById("renew-date").value;
    
    const today = getTodayDateString();
    if (paymentDate && paymentDate < today) {
      showToast("Payment date cannot be a past date.", "danger");
      return;
    }

    const paymentMethod = document.getElementById("renew-method").value;
    const renewMonths = document.getElementById("renew-months").value;
    const amountCollected = parseFloat(document.getElementById("renew-amount").value) || 0;

    const newExpiryDate = calcExpiryDate(paymentDate, renewMonths);

    try {
      // 1. Update Student record in DB
      await dbAPI.updateStudent(studentId, {
        expiryDate: newExpiryDate,
        membershipMonths: parseInt(renewMonths),
        paymentStatus: "Paid"
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

const sendWhatsAppReminder = async (s) => {
  const profile = await dbAPI.getGymProfile();
  const gymName = (profile && profile.gymName) ? profile.gymName : "ApexGym";
  const today = getTodayDateString();
  const isExpired = s.expiryDate < today;
  const message = `Hi ${s.name}, this is a gentle reminder regarding your ${gymName} membership. Your fee of ${currencySymbol}${s.feeAmount || 1000} is pending, and your membership ${isExpired ? "has expired" : "is expiring soon"} on ${formatLocalDate(s.expiryDate)}. Please pay at your earliest convenience.`;
  
  if (confirm(`Review drafted WhatsApp Message:\n\n"${message}"\n\nClick OK to confirm and send.`)) {
    // Strip non-numeric/non-plus characters from mobile
    const cleanMobile = s.mobile.replace(/[^\d+]/g, "");
    window.open(`https://wa.me/${cleanMobile}?text=${encodeURIComponent(message)}`, "_blank");
  }
};

const downloadStudentReport = async (studentId) => {
  let student = studentsList.find((s) => s.id === studentId);
  if (!student) {
    const students = await dbAPI.getStudents();
    student = students.find((s) => s.id === studentId);
  }
  
  if (!student) {
    showToast("Student records not found.", "danger");
    return;
  }

  const profile = await dbAPI.getGymProfile();
  const gymName = (profile && profile.gymName) ? profile.gymName : "ApexGym";
  const gymAddress = (profile && profile.address) ? profile.address : "";
  const gymPhone = (profile && profile.phone) ? profile.phone : "";
  const gymOwner = (profile && profile.ownerName) ? profile.ownerName : "";

  const allAttendance = await dbAPI.getAllAttendance();
  const studentAttendance = allAttendance
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Please allow popups to generate reports.", "danger");
    return;
  }

  // Calculate statistics
  const presentCount = studentAttendance.filter((a) => a.status === "present").length;
  const elapsedDays = Math.max(1, getDaysDiff(student.enrollmentDate || student.createdAt, getTodayDateString()) + 1);
  const attendanceRate = ((presentCount / elapsedDays) * 100).toFixed(0);

  // Calculate monthly attendance (current calendar month)
  const monthlyPresentCount = studentAttendance.filter(
    (a) => a.status === "present" && isCurrentMonth(a.date)
  ).length;

  // Membership status calculation
  const today = getTodayDateString();
  const isActive = student.paymentStatus !== "Unpaid" && student.expiryDate >= today && !student.isOut;
  const statusText = isActive ? "Active" : student.isOut ? "Out/Inactive" : "Unpaid/Expired";

  // Generate monthly aggregated rows for the attendance table
  const monthlyGroups = {};
  studentAttendance.forEach((a) => {
    // a.date is YYYY-MM-DD
    const dateObj = new Date(`${a.date}T00:00:00`);
    const monthName = dateObj.toLocaleString("default", { month: "long" }); // e.g. "July"
    const year = dateObj.getFullYear(); // e.g. 2026
    const groupKey = `${monthName} ${year}`; // e.g. "July 2026"
    
    if (!monthlyGroups[groupKey]) {
      monthlyGroups[groupKey] = {
        present: 0,
        total: 0
      };
    }
    
    monthlyGroups[groupKey].total++;
    if (a.status === "present") {
      monthlyGroups[groupKey].present++;
    }
  });

  let attendanceRows = "";
  const groupKeys = Object.keys(monthlyGroups);
  if (groupKeys.length === 0) {
    attendanceRows = `
      <tr>
        <td colspan="2" style="text-align: center; color: #94a3b8; padding: 1.5rem; font-style: italic;">
          No attendance records logged yet.
        </td>
      </tr>
    `;
  } else {
    attendanceRows = groupKeys.map((key) => {
      const stats = monthlyGroups[key];
      const rate = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(0) : 0;
      return `
        <tr>
          <td style="padding: 0.85rem 1rem; border-bottom: 1px solid #f1f5f9; font-weight: 500;">${key}</td>
          <td style="padding: 0.85rem 1rem; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600; color: var(--primary-color);">
            ${stats.present} / ${stats.total} Days <span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 400; margin-left: 8px;">(${rate}%)</span>
          </td>
        </tr>
      `;
    }).join("");
  }

  const todayStr = formatLocalDate(getTodayDateString());

  // HTML content of the report
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Report - ${student.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-color: #0f172a;
      --accent-color: #FF6A1C;
      --text-main: #334155;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --bg-light: #f8fafc;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', sans-serif;
      color: var(--text-main);
      background-color: #ffffff;
      line-height: 1.5;
      padding: 0;
    }

    /* Print utility banner */
    .utility-banner {
      background: #1e293b;
      color: #ffffff;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      position: sticky;
      top: 0;
      z-index: 100;
      font-family: 'Outfit', sans-serif;
    }
    
    .utility-title {
      font-size: 1rem;
      font-weight: 600;
    }
    
    .utility-title span {
      color: var(--accent-color);
    }
    
    .btn-print {
      background: var(--accent-color);
      color: white;
      border: none;
      padding: 0.6rem 1.2rem;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(255, 106, 28, 0.2);
    }
    
    .btn-print:hover {
      background: #e0530f;
      transform: translateY(-1px);
    }

    /* Report Container */
    .report-container {
      max-width: 800px;
      margin: 2.5rem auto;
      padding: 3rem;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.05);
      background: #ffffff;
      position: relative;
    }

    /* Header */
    .report-header {
      text-align: center;
      margin-bottom: 2.5rem;
      position: relative;
    }
    
    .gym-name {
      font-family: 'Outfit', sans-serif;
      font-size: 2.25rem;
      font-weight: 800;
      color: var(--primary-color);
      letter-spacing: -0.5px;
      margin-bottom: 0.25rem;
      text-transform: uppercase;
      text-align: center;
    }
    
    .powered-by {
      font-family: 'Outfit', sans-serif;
      font-size: 0.75rem;
      color: var(--text-muted);
      letter-spacing: 2px;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 1.5rem;
      display: block;
      text-align: center;
    }

    .powered-by span {
      color: var(--accent-color);
      font-weight: 800;
    }
    
    .report-title-badge {
      display: inline-block;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--accent-color);
      background: rgba(255, 106, 28, 0.06);
      padding: 6px 16px;
      border-radius: 30px;
      border: 1px dashed rgba(255, 106, 28, 0.3);
      margin-bottom: 1rem;
    }
    
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, var(--border-color) 20%, var(--border-color) 80%, transparent);
      width: 100%;
      margin: 1.5rem 0;
    }

    /* Meta Info */
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
      padding: 0 0.5rem;
    }

    /* Profile Grid */
    .profile-section {
      background: var(--bg-light);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      padding: 1.75rem;
      margin-bottom: 2.5rem;
    }

    .profile-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--primary-color);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .profile-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }
    
    .profile-item {
      display: flex;
      flex-direction: column;
    }
    
    .profile-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 0.25rem;
    }
    
    .profile-value {
      font-size: 0.95rem;
      color: var(--primary-color);
      font-weight: 600;
    }

    /* Attendance Section */
    .attendance-section {
      margin-bottom: 2rem;
    }
    
    .attendance-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--primary-color);
      margin-bottom: 1.25rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--border-color);
    }
    
    .attendance-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    
    .attendance-table th {
      padding: 0.75rem 1rem;
      background: var(--bg-light);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-color);
      text-align: left;
    }
    
    .attendance-table th:last-child {
      text-align: right;
    }

    .attendance-table td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #f1f5f9;
    }
    
    .attendance-table tr:hover td {
      background: #fdfdfd;
    }

    /* Classy Footer decoration */
    .report-footer {
      text-align: center;
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-color);
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      letter-spacing: 1px;
    }

    /* Printing rules */
    @media print {
      body {
        background: #ffffff;
      }
      .utility-banner {
        display: none !important;
      }
      .report-container {
        margin: 0;
        padding: 0;
        border: none;
        box-shadow: none;
        max-width: 100%;
      }
      .btn-print {
        display: none !important;
      }
      @page {
        margin: 1.5cm;
      }
    }
  </style>
</head>
<body>

  <div class="utility-banner">
    <div class="utility-title">ApexGYM Report <span>System</span></div>
    <button class="btn-print" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      Print / Save as PDF
    </button>
  </div>

  <div class="report-container">
    <div class="report-header">
      <h1 class="gym-name">${gymName}</h1>
      <span class="powered-by">powered by <span>ApexGYM</span></span>
      <div class="report-title-badge">Membership & Attendance Report</div>
      <div class="divider"></div>
    </div>
    
    <div class="meta-row">
      <div><strong>Location:</strong> ${gymAddress || 'N/A'}</div>
      <div><strong>Generated:</strong> ${todayStr}</div>
    </div>
    
    <div class="profile-section">
      <h2 class="profile-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px; color: var(--accent-color);"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        Member Profile Details
      </h2>
      <div class="profile-grid">
        <div class="profile-item">
          <span class="profile-label">Student Name</span>
          <span class="profile-value">${student.name}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Mobile Number</span>
          <span class="profile-value">${student.mobile}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Enrollment Date</span>
          <span class="profile-value">${formatLocalDate(student.enrollmentDate)}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Membership Duration</span>
          <span class="profile-value">${student.membershipMonths} Month${student.membershipMonths > 1 ? 's' : ''}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Expiry Date</span>
          <span class="profile-value">${formatLocalDate(student.expiryDate)}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Monthly Attendance</span>
          <span class="profile-value">${monthlyPresentCount} / 30 Days</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Attendance Rate</span>
          <span class="profile-value">${presentCount} Days Present (${attendanceRate}%)</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Membership Status</span>
          <span class="profile-value" style="color: ${isActive ? '#10b981' : '#ef4444'};">${statusText}</span>
        </div>
      </div>
    </div>
    
    <div class="attendance-section">
      <h2 class="attendance-title">Monthly Attendance Summary</h2>
      <table class="attendance-table">
        <thead>
          <tr>
            <th>Month</th>
            <th style="text-align: right;">Presents / Total Logged</th>
          </tr>
        </thead>
        <tbody>
          ${attendanceRows}
        </tbody>
      </table>
    </div>
    
    <div class="report-footer">
      Generated by ${gymName}
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

const getExpiryHighlightStatus = (expiryDate, today) => {
  if (expiryDate < today) {
    const days = getDaysDiff(expiryDate, today);
    return `<span style="color: var(--accent-red); font-weight: 600;">Expired (${days} ${days === 1 ? 'Day' : 'Days'} Ago)</span>`;
  } else if (expiryDate === today) {
    return `<span style="color: var(--accent-purple); font-weight: 600;">Expires Today</span>`;
  } else {
    const days = getDaysDiff(today, expiryDate);
    return `<span style="color: var(--text-secondary); font-weight: 600;">${days} ${days === 1 ? 'Day' : 'Days'} Left</span>`;
  }
};

const loadPendingFeesModal = async () => {
  const students = await dbAPI.getStudents();
  const today = getTodayDateString();

  // Filter unpaid students or expired students (exclude Out students)
  const unpaidStudents = students.filter(
    (s) => !s.isOut && (s.paymentStatus === "Unpaid" || s.expiryDate < today)
  );

  const tbody = document.getElementById("unpaid-members-list");
  if (unpaidStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No members with pending fees.</td></tr>`;
    return;
  }

  tbody.innerHTML = unpaidStudents.map((s) => {
    const isUnpaidRegistration = s.paymentStatus === "Unpaid";
    // If registered as unpaid and not yet expired, they are unpaid since enrollment; otherwise since expiry date
    const unpaidSinceDate = (isUnpaidRegistration && s.expiryDate >= today) ? s.enrollmentDate : s.expiryDate;
    const daysUnpaid = getDaysDiff(unpaidSinceDate, today);
    return `
      <tr>
        <td style="font-weight: 600;">${s.name}</td>
        <td>${s.mobile}</td>
        <td style="color: #dc2626; font-weight: 500;">${formatLocalDate(unpaidSinceDate)}</td>
        <td><span style="color: #334155; font-weight: 600;">${daysUnpaid} ${daysUnpaid === 1 ? 'Day' : 'Days'}</span></td>
        <td style="text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
          <button class="icon-btn btn-whatsapp-reminder" data-id="${s.id}" style="color: var(--accent-green); display: inline-flex; align-items: center; justify-content: center; padding: 4px;" title="Send WhatsApp Reminder">
            <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
          </button>
          <button class="btn btn-primary btn-sm btn-renew-member" 
            data-id="${s.id}" 
            data-name="${s.name}" 
            data-fee="${s.feeAmount || 1000}" 
            data-months="${s.membershipMonths || 1}">
            Mark Paid
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Bind WhatsApp buttons
  tbody.querySelectorAll(".btn-whatsapp-reminder").forEach((btn) => {
    btn.onclick = (e) => {
      const studentId = e.currentTarget.getAttribute("data-id");
      const student = students.find((st) => st.id === studentId);
      if (student) {
        sendWhatsAppReminder(student);
      }
    };
  });

  // Bind Renew/Mark as Paid buttons
  tbody.querySelectorAll(".btn-renew-member").forEach((btn) => {
    btn.onclick = (e) => {
      const studentId = e.currentTarget.getAttribute("data-id");
      const studentName = e.currentTarget.getAttribute("data-name");
      const baseFee = e.currentTarget.getAttribute("data-fee");
      const baseMonths = e.currentTarget.getAttribute("data-months") || 1;

      // Open drawer & populate fields
      const renewalDrawer = document.getElementById("renewal-drawer");
      document.getElementById("renew-student-id").value = studentId;
      const nameEl = document.getElementById("renew-student-name");
      nameEl.innerText = studentName;
      nameEl.setAttribute("data-name", studentName);
      document.getElementById("renew-date").value = getTodayDateString();
      document.getElementById("renew-date").setAttribute("min", getTodayDateString());
      document.getElementById("renew-months").value = baseMonths;
      
      const renewAmountInput = document.getElementById("renew-amount");
      renewAmountInput.value = baseFee;
      document.getElementById("renew-original-fee").value = baseFee; // track base fee

      // Update amount dynamically if months change
      document.getElementById("renew-months").onchange = (ev) => {
        const factor = parseInt(ev.target.value) / (parseInt(baseMonths) || 1);
        renewAmountInput.value = Math.round(parseFloat(baseFee) * factor);
      };

      renewalDrawer.style.display = "block";
      renewalDrawer.scrollIntoView({ behavior: "smooth" });
    };
  });

  if (window.lucide) {
    window.lucide.createIcons({ root: tbody });
  }
};

const loadExpiringSoonModal = async () => {
  const students = await dbAPI.getStudents();
  const today = getTodayDateString();

  // Filter expiring soon students (exclude Out students and unpaid students)
  const expiringStudents = students.filter(
    (s) => !s.isOut && s.paymentStatus !== "Unpaid" && s.expiryDate >= today && getDaysDiff(today, s.expiryDate) <= 7
  );

  const tbody = document.getElementById("expiring-members-list");
  if (expiringStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No memberships expiring soon.</td></tr>`;
    return;
  }

  tbody.innerHTML = expiringStudents.map((s) => {
    const statusHighlight = getExpiryHighlightStatus(s.expiryDate, today);
    return `
      <tr>
        <td style="font-weight: 600;">${s.name}</td>
        <td>${s.mobile}</td>
        <td>${formatLocalDate(s.expiryDate)}</td>
        <td>${statusHighlight}</td>
        <td style="text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
          <button class="icon-btn btn-whatsapp-reminder" data-id="${s.id}" style="color: var(--accent-green); display: inline-flex; align-items: center; justify-content: center; padding: 4px;" title="Send WhatsApp Reminder">
            <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
          </button>
          <button class="btn btn-primary btn-sm btn-renew-member-expiring" 
            data-id="${s.id}" 
            data-name="${s.name}" 
            data-fee="${s.feeAmount || 1000}" 
            data-months="${s.membershipMonths || 1}">
            Mark Paid
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Bind WhatsApp buttons
  tbody.querySelectorAll(".btn-whatsapp-reminder").forEach((btn) => {
    btn.onclick = (e) => {
      const studentId = e.currentTarget.getAttribute("data-id");
      const student = students.find((st) => st.id === studentId);
      if (student) {
        sendWhatsAppReminder(student);
      }
    };
  });

  // Bind Renew/Mark as Paid buttons (Switching modals to trigger drawer)
  tbody.querySelectorAll(".btn-renew-member-expiring").forEach((btn) => {
    btn.onclick = async (e) => {
      const studentId = e.currentTarget.getAttribute("data-id");
      const studentName = e.currentTarget.getAttribute("data-name");
      const baseFee = e.currentTarget.getAttribute("data-fee");
      const baseMonths = e.currentTarget.getAttribute("data-months") || 1;

      // Close expiring modal, open pending modal
      document.getElementById("expiring-soon-modal").classList.remove("active");
      await loadPendingFeesModal();
      document.getElementById("pending-fees-modal").classList.add("active");

      // Open drawer & populate fields in pending modal
      const renewalDrawer = document.getElementById("renewal-drawer");
      document.getElementById("renew-student-id").value = studentId;
      const nameEl = document.getElementById("renew-student-name");
      nameEl.innerText = studentName;
      nameEl.setAttribute("data-name", studentName);
      document.getElementById("renew-date").value = getTodayDateString();
      document.getElementById("renew-date").setAttribute("min", getTodayDateString());
      document.getElementById("renew-months").value = baseMonths;
      
      const renewAmountInput = document.getElementById("renew-amount");
      renewAmountInput.value = baseFee;
      document.getElementById("renew-original-fee").value = baseFee;

      document.getElementById("renew-months").onchange = (ev) => {
        const factor = parseInt(ev.target.value) / (parseInt(baseMonths) || 1);
        renewAmountInput.value = Math.round(parseFloat(baseFee) * factor);
      };

      renewalDrawer.style.display = "block";
      renewalDrawer.scrollIntoView({ behavior: "smooth" });
    };
  });

  if (window.lucide) {
    window.lucide.createIcons({ root: tbody });
  }
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
      const ownerName = profile.ownerName || "";
      
      document.getElementById("header-gym-name").innerText = gymName;
      document.getElementById("mobile-header-gym-name").innerText = gymName;
      document.getElementById("about-gym-title").innerText = `${gymName} Manager v1.0.0`;
      document.getElementById("about-gym-address").innerText = `Location: ${gymAddress}`;
      
      if (ownerName) {
        const usernameEl = document.getElementById("sidebar-username");
        const avatarEl = document.getElementById("sidebar-avatar");
        if (usernameEl) usernameEl.innerText = ownerName;
        if (avatarEl) avatarEl.innerText = ownerName.charAt(0).toUpperCase();
      }
      
      const roleEl = document.getElementById("sidebar-userrole");
      if (roleEl) {
        roleEl.innerText = "Gym Operator";
      }
      
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

const enforceDateRestrictions = () => {
  const dateFields = [
    { id: "enroll-date", label: "Enrollment date" },
    { id: "expense-date", label: "Expense date" },
    { id: "renew-date", label: "Payment date" }
  ];

  dateFields.forEach(({ id, label }) => {
    const field = document.getElementById(id);
    if (!field) return;

    field.setAttribute("min", getTodayDateString());

    field.addEventListener("change", (e) => {
      const today = getTodayDateString();
      if (e.target.value && e.target.value < today) {
        showToast(`${label} cannot be a past date.`, "danger");
        e.target.value = today;
        if (id === "enroll-date") {
          updateEnrollExpiry();
        }
      }
    });
  });
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

// Debounced dashboard loader to prevent double renders
let dashboardTimeout = null;
const debounceLoadDashboard = () => {
  if (dashboardTimeout) clearTimeout(dashboardTimeout);
  dashboardTimeout = setTimeout(() => {
    loadDashboard();
  }, 100);
};

// Listen to SWR background cache updates to keep UI synchronized
window.addEventListener("db-update", (e) => {
  const { type, data } = e.detail;
  
  if (type === "students") {
    studentsList = data;
    if (currentRoute === "attendance") {
      const searchInput = document.getElementById("attendance-search");
      const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
      const filteredStudents = studentsList.filter(
        (s) => s.name.toLowerCase().includes(query) || s.mobile.includes(query)
      );
      renderAttendanceList(filteredStudents, attendanceList);
    } else if (currentRoute === "enroll") {
      loadEnrollDirectory();
    }
  } else if (type === "expenses") {
    expensesList = data;
    if (currentRoute === "expenses") {
      loadExpenses();
    }
  } else if (type === "payments") {
    paymentsList = data;
  } else if (type === "attendance") {
    const today = getTodayDateString();
    if (data && data.date === today) {
      attendanceList = data.data;
      if (currentRoute === "attendance") {
        const searchInput = document.getElementById("attendance-search");
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const filteredStudents = studentsList.filter(
          (s) => s.name.toLowerCase().includes(query) || s.mobile.includes(query)
        );
        renderAttendanceList(filteredStudents, attendanceList);
      }
    }
  } else if (type === "gymProfile") {
    if (data) {
      const gymName = data.gymName || "ApexGym";
      const gymAddress = data.address || "";
      const ownerName = data.ownerName || "";
      
      const headerName = document.getElementById("header-gym-name");
      const mobileHeaderName = document.getElementById("mobile-header-gym-name");
      const aboutTitle = document.getElementById("about-gym-title");
      const aboutAddress = document.getElementById("about-gym-address");
      const roleEl = document.getElementById("sidebar-userrole");
      const usernameEl = document.getElementById("sidebar-username");
      const avatarEl = document.getElementById("sidebar-avatar");
      
      if (headerName) headerName.innerText = gymName;
      if (mobileHeaderName) mobileHeaderName.innerText = gymName;
      if (aboutTitle) aboutTitle.innerText = `${gymName} Manager v1.0.0`;
      if (aboutAddress) aboutAddress.innerText = `Location: ${gymAddress}`;
      if (roleEl) roleEl.innerText = "Gym Operator";
      
      if (ownerName) {
        if (usernameEl) usernameEl.innerText = ownerName;
        if (avatarEl) avatarEl.innerText = ownerName.charAt(0).toUpperCase();
      }
    }
  }
  
  if (currentRoute === "dashboard") {
    debounceLoadDashboard();
  }
});

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
  enforceDateRestrictions();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
