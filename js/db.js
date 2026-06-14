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

export const dbAPI = {
  // --- GYM PROFILE / ONBOARDING ---
  async getGymProfile() {
    const userId = getUserId();
    if (firestore && db) {
      const docRef = firestore.doc(db, "gym_profiles", userId);
      const docSnap = await firestore.getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } else {
      const profiles = getLocal("gym_profiles");
      return profiles.find((p) => p.userId === userId) || null;
    }
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
      return profile;
    } else {
      const profiles = getLocal("gym_profiles");
      const index = profiles.findIndex((p) => p.userId === userId);
      if (index !== -1) {
        profiles[index] = { ...profiles[index], ...profile };
      } else {
        profiles.push(profile);
      }
      setLocal("gym_profiles", profiles);
      return profile;
    }
  },

  // --- STUDENTS ---
  async addStudent(student) {
    const studentData = {
      ...student,
      userId: getUserId(),
      createdAt: new Date().toISOString(),
    };

    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "students"), studentData);
      return { id: docRef.id, ...studentData };
    } else {
      const students = getLocal("gym_students");
      const newStudent = { id: generateId(), ...studentData };
      students.push(newStudent);
      setLocal("gym_students", students);
      return newStudent;
    }
  },

  async getStudents() {
    const userId = getUserId();
    if (firestore && db) {
      // Simple query to avoid composite index requirements
      const q = firestore.query(
        firestore.collection(db, "students"),
        firestore.where("userId", "==", userId)
      );
      const querySnapshot = await firestore.getDocs(q);
      const students = [];
      querySnapshot.forEach((doc) => {
        students.push({ id: doc.id, ...doc.data() });
      });
      // Sort client-side to prevent Firestore "missing index" errors
      return students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      return getLocal("gym_students")
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  },

  async updateStudent(id, updatedData) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "students", id);
      await firestore.updateDoc(docRef, updatedData);
      return { id, ...updatedData };
    } else {
      const students = getLocal("gym_students");
      const index = students.findIndex((s) => s.id === id);
      if (index !== -1) {
        students[index] = { ...students[index], ...updatedData };
        setLocal("gym_students", students);
        return students[index];
      }
      throw new Error("Student not found");
    }
  },

  async deleteStudent(id) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "students", id);
      await firestore.deleteDoc(docRef);
      return id;
    } else {
      let students = getLocal("gym_students");
      students = students.filter((s) => s.id !== id);
      setLocal("gym_students", students);
      return id;
    }
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
      return { id: recordId, ...attendanceData };
    } else {
      const attendance = getLocal("gym_attendance");
      const index = attendance.findIndex((a) => a.studentId === studentId && a.date === date);
      if (index !== -1) {
        attendance[index] = { ...attendance[index], ...attendanceData };
      } else {
        attendance.push({ id: recordId, ...attendanceData });
      }
      setLocal("gym_attendance", attendance);
      return { id: recordId, ...attendanceData };
    }
  },

  async getAttendance(date) {
    const userId = getUserId();
    if (firestore && db) {
      const q = firestore.query(
        firestore.collection(db, "attendance"),
        firestore.where("date", "==", date),
        firestore.where("userId", "==", userId)
      );
      const querySnapshot = await firestore.getDocs(q);
      const attendance = [];
      querySnapshot.forEach((doc) => {
        attendance.push({ id: doc.id, ...doc.data() });
      });
      return attendance;
    } else {
      const attendance = getLocal("gym_attendance");
      return attendance.filter((a) => a.date === date && a.userId === userId);
    }
  },

  // --- EXPENSES ---
  async addExpense(expense) {
    const expenseData = {
      ...expense,
      amount: parseFloat(expense.amount),
      userId: getUserId(),
      timestamp: new Date().toISOString()
    };

    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "expenses"), expenseData);
      return { id: docRef.id, ...expenseData };
    } else {
      const expenses = getLocal("gym_expenses");
      const newExpense = { id: generateId(), ...expenseData };
      expenses.push(newExpense);
      setLocal("gym_expenses", expenses);
      return newExpense;
    }
  },

  async getExpenses() {
    const userId = getUserId();
    if (firestore && db) {
      const q = firestore.query(
        firestore.collection(db, "expenses"),
        firestore.where("userId", "==", userId)
      );
      const querySnapshot = await firestore.getDocs(q);
      const expenses = [];
      querySnapshot.forEach((doc) => {
        expenses.push({ id: doc.id, ...doc.data() });
      });
      return expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      return getLocal("gym_expenses")
        .filter((e) => e.userId === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  },

  async deleteExpense(id) {
    if (firestore && db) {
      const docRef = firestore.doc(db, "expenses", id);
      await firestore.deleteDoc(docRef);
      return id;
    } else {
      let expenses = getLocal("gym_expenses");
      expenses = expenses.filter((e) => e.id !== id);
      setLocal("gym_expenses", expenses);
      return id;
    }
  },

  // --- PAYMENTS ---
  async addPayment(payment) {
    const paymentData = {
      ...payment,
      amount: parseFloat(payment.amount),
      userId: getUserId(),
      timestamp: new Date().toISOString()
    };

    if (firestore && db) {
      const docRef = await firestore.addDoc(firestore.collection(db, "payments"), paymentData);
      return { id: docRef.id, ...paymentData };
    } else {
      const payments = getLocal("gym_payments");
      const newPayment = { id: generateId(), ...paymentData };
      payments.push(newPayment);
      setLocal("gym_payments", payments);
      return newPayment;
    }
  },

  async getPayments() {
    const userId = getUserId();
    if (firestore && db) {
      const q = firestore.query(
        firestore.collection(db, "payments"),
        firestore.where("userId", "==", userId)
      );
      const querySnapshot = await firestore.getDocs(q);
      const payments = [];
      querySnapshot.forEach((doc) => {
        payments.push({ id: doc.id, ...doc.data() });
      });
      return payments.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      return getLocal("gym_payments")
        .filter((p) => p.userId === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }
};
