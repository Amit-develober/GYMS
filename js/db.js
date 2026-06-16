// Database Adapter - Unified Firestore / LocalStorage API with Multi-Tenant Isolation
import { db, auth, isFirebaseConnected } from "./firebase-config.js";

// Helper to generate IDs for local storage
const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

// Lazy-load Firestore operations only if Firebase is connected
let firestore = null;
if (isFirebaseConnected && db) {
  try {
    firestore = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
  } catch (err) {
    console.error("Failed to load Firebase Firestore module. Switching to Local Storage.", err);
  }
}

// Local Storage helpers
const getLocal = (key) => JSON.parse(localStorage.getItem(key)) || [];
const setLocal = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// Retrieve current logged in user ID dynamically
const getUserId = () => {
  if (isFirebaseConnected && auth && auth.currentUser) {
    return auth.currentUser.uid;
  }
  const localUser = JSON.parse(localStorage.getItem("gym_demo_user"));
  return localUser ? localUser.uid : "demo_global_admin";
};

// Local SWR Cache store
const cache = {
  students: null,
  expenses: null,
  payments: null,
  attendance: {}, // date -> list
  allAttendance: null,
  gymProfile: null
};

const lastFetchTimes = {
  students: 0,
  expenses: 0,
  payments: 0,
  allAttendance: 0,
  gymProfile: 0,
  attendance: {} // date -> timestamp
};

const MIN_BG_FETCH_INTERVAL = 5000; // 5 seconds

const triggerUpdate = (type, data) => {
  window.dispatchEvent(new CustomEvent("db-update", { detail: { type, data } }));
};

export const dbAPI = {
  // --- GYM PROFILE / ONBOARDING ---
  async getGymProfile() {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const docRef = firestore.doc(db, "gym_profiles", userId);
        const docSnap = await firestore.getDoc(docRef);
        freshData = docSnap.exists() ? docSnap.data() : null;
      } else {
        const profiles = getLocal("gym_profiles");
        freshData = profiles.find((p) => p.userId === userId) || null;
      }
      lastFetchTimes.gymProfile = Date.now();
      if (JSON.stringify(cache.gymProfile) !== JSON.stringify(freshData)) {
        cache.gymProfile = freshData;
        triggerUpdate("gymProfile", freshData);
      }
      return freshData;
    };

    if (cache.gymProfile !== null) {
      if (now - lastFetchTimes.gymProfile > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.gymProfile;
    }

    cache.gymProfile = await fetchFresh();
    return cache.gymProfile;
  },

  async saveGymProfile(profileData) {
    const userId = getUserId();
    const profile = {
      ...profileData,
      userId,
      updatedAt: new Date().toISOString()
    };

    if (firestore && db) {
      const docRef = firestore.doc(db, "gym_profiles", userId);
      await firestore.setDoc(docRef, profile, { merge: true });
    } else {
      const profiles = getLocal("gym_profiles");
      const index = profiles.findIndex((p) => p.userId === userId);
      if (index !== -1) {
        profiles[index] = { ...profiles[index], ...profile };
      } else {
        profiles.push(profile);
      }
      setLocal("gym_profiles", profiles);
    }

    cache.gymProfile = profile;
    lastFetchTimes.gymProfile = Date.now();
    triggerUpdate("gymProfile", profile);
    return profile;
  },

  // --- STUDENTS ---
  async addStudent(student) {
    const studentData = {
      ...student,
      userId: getUserId(),
      createdAt: new Date().toISOString(),
    };

    let newStudent;
    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "students"), studentData);
      newStudent = { id: docRef.id, ...studentData };
    } else {
      const students = getLocal("gym_students");
      const newStudentId = generateId();
      newStudent = { id: newStudentId, ...studentData };
      students.push(newStudent);
      setLocal("gym_students", students);
    }

    // Update cache
    if (cache.students) {
      cache.students.unshift(newStudent);
    } else {
      cache.students = [newStudent];
    }
    triggerUpdate("students", cache.students);
    return newStudent;
  },

  async getStudents() {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const q = firestore.query(
          firestore.collection(db, "students"),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        freshData = [];
        querySnapshot.forEach((doc) => {
          freshData.push({ id: doc.id, ...doc.data() });
        });
        freshData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else {
        freshData = getLocal("gym_students")
          .filter((s) => s.userId === userId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      lastFetchTimes.students = Date.now();
      if (JSON.stringify(cache.students) !== JSON.stringify(freshData)) {
        cache.students = freshData;
        triggerUpdate("students", freshData);
      }
      return freshData;
    };

    if (cache.students !== null) {
      if (now - lastFetchTimes.students > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.students;
    }

    cache.students = await fetchFresh();
    return cache.students;
  },

  async updateStudent(id, updatedData) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "students", id);
      await firestore.updateDoc(docRef, updatedData);
    } else {
      const students = getLocal("gym_students");
      const index = students.findIndex((s) => s.id === id);
      if (index !== -1) {
        students[index] = { ...students[index], ...updatedData };
        setLocal("gym_students", students);
      } else {
        throw new Error("Student not found");
      }
    }

    if (cache.students) {
      const index = cache.students.findIndex((s) => s.id === id);
      if (index !== -1) {
        cache.students[index] = { ...cache.students[index], ...updatedData };
      }
    }
    triggerUpdate("students", cache.students);
    return { id, ...updatedData };
  },

  async deleteStudent(id) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "students", id);
      await firestore.deleteDoc(docRef);
    } else {
      let students = getLocal("gym_students");
      students = students.filter((s) => s.id !== id);
      setLocal("gym_students", students);
    }

    if (cache.students) {
      cache.students = cache.students.filter((s) => s.id !== id);
    }
    triggerUpdate("students", cache.students);
    return id;
  },

  // --- ATTENDANCE ---
  async markAttendance(studentId, studentName, date, status) {
    const recordId = `${studentId}_${date}`;
    const attendanceData = {
      studentId,
      studentName,
      date, // YYYY-MM-DD
      status, // 'present' or 'absent'
      userId: getUserId(),
      timestamp: new Date().toISOString()
    };

    if (firestore && db) {
      const docRef = firestore.doc(db, "attendance", recordId);
      await firestore.setDoc(docRef, attendanceData);
    } else {
      const attendance = getLocal("gym_attendance");
      const index = attendance.findIndex((a) => a.studentId === studentId && a.date === date);
      if (index !== -1) {
        attendance[index] = { ...attendance[index], ...attendanceData };
      } else {
        attendance.push({ id: recordId, ...attendanceData });
      }
      setLocal("gym_attendance", attendance);
    }

    const newRecord = { id: recordId, ...attendanceData };

    // Update daily attendance cache
    if (cache.attendance[date]) {
      const index = cache.attendance[date].findIndex((a) => a.studentId === studentId);
      if (index !== -1) {
        cache.attendance[date][index] = newRecord;
      } else {
        cache.attendance[date].push(newRecord);
      }
    } else {
      cache.attendance[date] = [newRecord];
    }
    triggerUpdate("attendance", { date, data: cache.attendance[date] });

    // Update allAttendance cache
    if (cache.allAttendance) {
      const index = cache.allAttendance.findIndex((a) => a.studentId === studentId && a.date === date);
      if (index !== -1) {
        cache.allAttendance[index] = newRecord;
      } else {
        cache.allAttendance.push(newRecord);
      }
      triggerUpdate("allAttendance", cache.allAttendance);
    }

    return newRecord;
  },

  async getAttendance(date) {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const q = firestore.query(
          firestore.collection(db, "attendance"),
          firestore.where("date", "==", date),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        freshData = [];
        querySnapshot.forEach((doc) => {
          freshData.push({ id: doc.id, ...doc.data() });
        });
      } else {
        const attendance = getLocal("gym_attendance");
        freshData = attendance.filter((a) => a.date === date && a.userId === userId);
      }
      lastFetchTimes.attendance[date] = Date.now();
      if (JSON.stringify(cache.attendance[date]) !== JSON.stringify(freshData)) {
        cache.attendance[date] = freshData;
        triggerUpdate("attendance", { date, data: freshData });
      }
      return freshData;
    };

    if (cache.attendance[date] !== undefined) {
      const lastFetch = lastFetchTimes.attendance[date] || 0;
      if (now - lastFetch > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.attendance[date];
    }

    cache.attendance[date] = await fetchFresh();
    return cache.attendance[date];
  },

  // --- EXPENSES ---
  async addExpense(expense) {
    const expenseData = {
      ...expense,
      amount: parseFloat(expense.amount) || 0,
      userId: getUserId(),
      timestamp: new Date().toISOString()
    };

    let newExpense;
    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "expenses"), expenseData);
      newExpense = { id: docRef.id, ...expenseData };
    } else {
      const expenses = getLocal("gym_expenses");
      newExpense = { id: generateId(), ...expenseData };
      expenses.push(newExpense);
      setLocal("gym_expenses", expenses);
    }

    // Update cache
    if (cache.expenses) {
      cache.expenses.unshift(newExpense);
    } else {
      cache.expenses = [newExpense];
    }
    triggerUpdate("expenses", cache.expenses);
    return newExpense;
  },

  async getExpenses() {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const q = firestore.query(
          firestore.collection(db, "expenses"),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        freshData = [];
        querySnapshot.forEach((doc) => {
          freshData.push({ id: doc.id, ...doc.data() });
        });
        freshData.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else {
        freshData = getLocal("gym_expenses")
          .filter((e) => e.userId === userId)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
      }
      lastFetchTimes.expenses = Date.now();
      if (JSON.stringify(cache.expenses) !== JSON.stringify(freshData)) {
        cache.expenses = freshData;
        triggerUpdate("expenses", freshData);
      }
      return freshData;
    };

    if (cache.expenses !== null) {
      if (now - lastFetchTimes.expenses > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.expenses;
    }

    cache.expenses = await fetchFresh();
    return cache.expenses;
  },

  async deleteExpense(id) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "expenses", id);
      await firestore.deleteDoc(docRef);
    } else {
      let expenses = getLocal("gym_expenses");
      expenses = expenses.filter((e) => e.id !== id);
      setLocal("gym_expenses", expenses);
    }

    if (cache.expenses) {
      cache.expenses = cache.expenses.filter((e) => e.id !== id);
    }
    triggerUpdate("expenses", cache.expenses);
    return id;
  },

  // --- PAYMENTS ---
  async addPayment(payment) {
    const paymentData = {
      ...payment,
      amount: parseFloat(payment.amount) || 0,
      userId: getUserId(),
      timestamp: new Date().toISOString()
    };

    let newPayment;
    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "payments"), paymentData);
      newPayment = { id: docRef.id, ...paymentData };
    } else {
      const payments = getLocal("gym_payments");
      newPayment = { id: generateId(), ...paymentData };
      payments.push(newPayment);
      setLocal("gym_payments", payments);
    }

    // Update cache
    if (cache.payments) {
      cache.payments.unshift(newPayment);
    } else {
      cache.payments = [newPayment];
    }
    triggerUpdate("payments", cache.payments);
    return newPayment;
  },

  async getPayments() {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const q = firestore.query(
          firestore.collection(db, "payments"),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        freshData = [];
        querySnapshot.forEach((doc) => {
          freshData.push({ id: doc.id, ...doc.data() });
        });
        freshData.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else {
        freshData = getLocal("gym_payments")
          .filter((p) => p.userId === userId)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
      }
      lastFetchTimes.payments = Date.now();
      if (JSON.stringify(cache.payments) !== JSON.stringify(freshData)) {
        cache.payments = freshData;
        triggerUpdate("payments", freshData);
      }
      return freshData;
    };

    if (cache.payments !== null) {
      if (now - lastFetchTimes.payments > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.payments;
    }

    cache.payments = await fetchFresh();
    return cache.payments;
  },

  async getAllAttendance() {
    const userId = getUserId();
    const now = Date.now();

    const fetchFresh = async () => {
      let freshData;
      if (firestore && db) {
        const q = firestore.query(
          firestore.collection(db, "attendance"),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        freshData = [];
        querySnapshot.forEach((doc) => {
          freshData.push({ id: doc.id, ...doc.data() });
        });
      } else {
        const attendance = getLocal("gym_attendance");
        freshData = attendance.filter((a) => a.userId === userId);
      }
      lastFetchTimes.allAttendance = Date.now();
      if (JSON.stringify(cache.allAttendance) !== JSON.stringify(freshData)) {
        cache.allAttendance = freshData;
        triggerUpdate("allAttendance", freshData);
      }
      return freshData;
    };

    if (cache.allAttendance !== null) {
      if (now - lastFetchTimes.allAttendance > MIN_BG_FETCH_INTERVAL) {
        fetchFresh();
      }
      return cache.allAttendance;
    }

    cache.allAttendance = await fetchFresh();
    return cache.allAttendance;
  },

  async resetData() {
    const userId = getUserId();
    if (firestore && db) {
      const collections = ["students", "expenses", "payments", "attendance"];
      for (const colName of collections) {
        const q = firestore.query(
          firestore.collection(db, colName),
          firestore.where("userId", "==", userId)
        );
        const querySnapshot = await firestore.getDocs(q);
        const promises = [];
        querySnapshot.forEach((doc) => {
          promises.push(firestore.deleteDoc(doc.ref));
        });
        await Promise.all(promises);
      }
      const profileRef = firestore.doc(db, "gym_profiles", userId);
      await firestore.deleteDoc(profileRef);
    } else {
      const students = getLocal("gym_students").filter((s) => s.userId !== userId);
      setLocal("gym_students", students);
      
      const attendance = getLocal("gym_attendance").filter((a) => a.userId !== userId);
      setLocal("gym_attendance", attendance);
      
      const expenses = getLocal("gym_expenses").filter((e) => e.userId !== userId);
      setLocal("gym_expenses", expenses);
      
      const payments = getLocal("gym_payments").filter((p) => p.userId !== userId);
      setLocal("gym_payments", payments);
      
      const profiles = getLocal("gym_profiles").filter((p) => p.userId !== userId);
      setLocal("gym_profiles", profiles);
    }

    // Reset local cache
    cache.students = null;
    cache.expenses = null;
    cache.payments = null;
    cache.attendance = {};
    cache.allAttendance = null;
    cache.gymProfile = null;
    
    lastFetchTimes.students = 0;
    lastFetchTimes.expenses = 0;
    lastFetchTimes.payments = 0;
    lastFetchTimes.attendance = {};
    lastFetchTimes.allAttendance = 0;
    lastFetchTimes.gymProfile = 0;

    triggerUpdate("reset", null);
  }
};
