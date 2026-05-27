import sqlite3
import os

DB_NAME = 'gym.db'

def get_db_connection():
    conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), DB_NAME))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Owners Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS owners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_name TEXT NOT NULL,
            gym_name TEXT,
            gym_address TEXT NOT NULL,
            user_id TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    # Students Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            mobile TEXT NOT NULL,
            date_enrolled DATE NOT NULL,
            membership_duration INTEGER DEFAULT 1,
            monthly_fee REAL NOT NULL DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (owner_id) REFERENCES owners(id)
        )
    ''')

    # Attendance Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            date DATE NOT NULL,
            entry_time TIME,
            exit_time TIME,
            FOREIGN KEY (owner_id) REFERENCES owners(id),
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Fees Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS fees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            month TEXT NOT NULL,
            amount REAL,
            status TEXT DEFAULT "PENDING",
            payment_method TEXT,
            payment_date DATE,
            FOREIGN KEY (owner_id) REFERENCES owners(id),
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    ''')

    # Expenses Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            date DATE NOT NULL,
            category TEXT,
            FOREIGN KEY (owner_id) REFERENCES owners(id)
        )
    ''')

    # Migration: Add columns if they don't exist
    try:
        cursor.execute('ALTER TABLE owners ADD COLUMN gym_name TEXT')
    except sqlite3.OperationalError:
        pass # Column already exists

    try:
        cursor.execute('ALTER TABLE students ADD COLUMN membership_duration INTEGER DEFAULT 1')
    except sqlite3.OperationalError:
        pass # Column already exists

    try:
        cursor.execute('ALTER TABLE fees ADD COLUMN payment_method TEXT')
    except sqlite3.OperationalError:
        pass # Column already exists

    try:
        cursor.execute('ALTER TABLE fees ADD COLUMN payment_date DATE')
    except sqlite3.OperationalError:
        pass # Column already exists

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
