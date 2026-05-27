from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash, make_response
from flask_bcrypt import Bcrypt
from flask_wtf.csrf import CSRFProtect
from database import get_db_connection, init_db
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import os
import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'gympro-secure-key-2026')
bcrypt = Bcrypt(app)
csrf = CSRFProtect(app)

# Ensure DB is initialized
init_db()

# --- Middleware/Helpers ---
def is_logged_in():
    return 'owner_id' in session

def check_and_create_fees(owner_id):
    """Ensure all active students have a fee record for the current month."""
    current_month = datetime.now().strftime('%Y-%m')
    conn = get_db_connection()
    # Bulk insert missing fees in a single database round-trip
    conn.execute('''
        INSERT INTO fees (owner_id, student_id, month, amount, status)
        SELECT s.owner_id, s.id, ?, s.monthly_fee, 'PENDING'
        FROM students s
        LEFT JOIN fees f ON s.id = f.student_id AND f.month = ?
        WHERE s.owner_id = ? AND s.is_active = 1 AND f.id IS NULL
    ''', (current_month, current_month, owner_id))
    conn.commit()
    conn.close()


@app.context_processor
def inject_now():
    return {'now': datetime.utcnow()}

# --- Helpers ---
def calculate_membership_info(date_enrolled, duration_months):
    enrolled_date = datetime.strptime(date_enrolled, '%Y-%m-%d').date()
    # 1 month = 30 days as per user request
    total_days = int(duration_months) * 30
    expiry_date = enrolled_date + timedelta(days=total_days)
    today = datetime.now().date()
    days_left = (expiry_date - today).days
    return expiry_date, days_left

# --- Routes ---

@app.route('/')
def index():
    if is_logged_in():
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/enroll/download-pdf/<int:student_id>')
def download_student_pdf(student_id):
    if not is_logged_in():
        return redirect(url_for('login'))
    
    owner_id = session['owner_id']
    conn = get_db_connection()
    
    # Get owner/gym info
    owner = conn.execute('SELECT owner_name, gym_name, gym_address FROM owners WHERE id = ?', (owner_id,)).fetchone()
    
    # Get student info
    student = conn.execute('SELECT * FROM students WHERE id = ? AND owner_id = ?', (student_id, owner_id)).fetchone()
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Get fee history
    fees = conn.execute('SELECT * FROM fees WHERE student_id = ? ORDER BY month DESC', (student_id,)).fetchall()
    
    # Get attendance summary
    attendance_count = conn.execute('SELECT COUNT(*) FROM attendance WHERE student_id = ?', (student_id,)).fetchone()[0]
    # Get attendance for the current membership cycle (last 30 days or based on duration)
    recent_attendance = conn.execute('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 30', (student_id,)).fetchall()
    
    # Calculate Expiry using 30-day month logic
    enrolled_date = datetime.strptime(student['date_enrolled'], '%Y-%m-%d').date()
    duration_months = int(student['membership_duration'])
    expiry_date, _ = calculate_membership_info(student['date_enrolled'], duration_months)
    
    conn.close()
    
    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Gym Header
    elements.append(Paragraph(f"{owner['gym_name'] or owner['owner_name']}", styles['Title']))
    elements.append(Paragraph(f"Owner: {owner['owner_name']}", styles['Normal']))
    elements.append(Paragraph(f"Address: {owner['gym_address']}", styles['Normal']))
    elements.append(Paragraph("<i>Powered by GymPro</i>", styles['Normal']))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("<hr/>", styles['Normal']))
    elements.append(Spacer(1, 12))
    
    # Report Title
    elements.append(Paragraph(f"Student Report: {student['name']}", styles['Heading1']))
    elements.append(Spacer(1, 12))
    
    # Basic Info
    info_data = [
        ["Name", student['name']],
        ["Mobile", student['mobile']],
        ["Enrolled Date", student['date_enrolled']],
        ["Membership Duration", f"{student['membership_duration']} Months"],
        ["Expiry Date", expiry_date.strftime('%Y-%m-%d')],
        ["Total Attendance Days", str(attendance_count)]
    ]
    t = Table(info_data, colWidths=[150, 300])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), colors.whitesmoke),
        ('GRID', (0,0), (-1,-1), 1, colors.grey),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 24))
    
    # Payment History
    elements.append(Paragraph("Payment History", styles['Heading2']))
    elements.append(Spacer(1, 6))
    fee_data = [["Month", "Amount", "Status", "Method", "Date Paid"]]
    for f in fees:
        fee_data.append([
            f['month'], 
            f"Rs. {f['amount']}", 
            f['status'], 
            f['payment_method'] or "-", 
            f['payment_date'] or "-"
        ])
    
    ft = Table(fee_data, colWidths=[100, 80, 80, 120, 100])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.orange),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('GRID', (0,0), (-1,-1), 1, colors.grey),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(ft)
    elements.append(Spacer(1, 24))
    
    # Recent Attendance
    elements.append(Paragraph("Recent Attendance (Last 30 Logs)", styles['Heading2']))
    elements.append(Spacer(1, 6))
    att_data = [["Date", "Entry Time", "Exit Time"]]
    for a in recent_attendance:
        att_data.append([a['date'], a['entry_time'] or "-", a['exit_time'] or "-"] )
    
    if not recent_attendance:
        elements.append(Paragraph("No attendance records found.", styles['Normal']))
    else:
        at = Table(att_data, colWidths=[150, 150, 150])
        at.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.dodgerblue),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('GRID', (0,0), (-1,-1), 1, colors.grey),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(at)
    
    doc.build(elements)
    
    buffer.seek(0)
    response = make_response(buffer.getvalue())
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename={student["name"]}_Report.pdf'
    return response
@app.route('/login', methods=['GET', 'POST'])
def login():
    if is_logged_in():
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        user_id = request.form.get('user_id')
        password = request.form.get('password')
        
        conn = get_db_connection()
        owner = conn.execute('SELECT * FROM owners WHERE user_id = ?', (user_id,)).fetchone()
        conn.close()
        
        if owner and bcrypt.check_password_hash(owner['password_hash'], password):
            session['owner_id'] = owner['id']
            session['user_id'] = owner['user_id']
            session['owner_name'] = owner['owner_name']
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid User ID or Password. Please try again.', 'error')
            
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if is_logged_in():
        return redirect(url_for('dashboard'))
        
    if request.method == 'POST':
        owner_name = request.form.get('owner_name')
        gym_name = request.form.get('gym_name')
        gym_address = request.form.get('gym_address')
        user_id = request.form.get('user_id')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if not all([owner_name, gym_name, gym_address, user_id, password, confirm_password]):
            flash('All fields are required.', 'error')
        elif password != confirm_password:
            flash('Passwords do not match.', 'error')
        elif len(password) < 6:
            flash('Password must be minimum 6 characters.', 'error')
        else:
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            conn = get_db_connection()
            try:
                conn.execute('INSERT INTO owners (owner_name, gym_name, gym_address, user_id, password_hash) VALUES (?, ?, ?, ?, ?)',
                            (owner_name, gym_name, gym_address, user_id, hashed_password))
                conn.commit()
                flash('Account created successfully! Please login.', 'success')
                return redirect(url_for('login'))
            except Exception as e:
                flash('User ID already exists or database error.', 'error')
            finally:
                conn.close()
                
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if not is_logged_in():
        return redirect(url_for('login'))
    
    owner_id = session['owner_id']
    check_and_create_fees(owner_id)
    
    today = datetime.now().strftime('%Y-%m-%d')
    current_month = datetime.now().strftime('%Y-%m')
    
    conn = get_db_connection()
    
    # Card 1: Today's Students
    today_count = conn.execute('SELECT COUNT(DISTINCT student_id) FROM attendance WHERE owner_id = ? AND date = ?', 
                             (owner_id, today)).fetchone()[0]
    
    # Card 2: Monthly Students
    monthly_count = conn.execute("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE owner_id = ? AND strftime('%Y-%m', date) = ?", 
                               (owner_id, current_month)).fetchone()[0]
    
    # Card 3: Total Enrolled
    total_enrolled = conn.execute('SELECT COUNT(*) FROM students WHERE owner_id = ? AND is_active = 1', 
                                (owner_id,)).fetchone()[0]
    
    # Card 4: Pending Fees
    pending_fees_count = conn.execute('SELECT COUNT(*) FROM fees WHERE owner_id = ? AND status = "PENDING" AND month = ?', 
                                    (owner_id, current_month)).fetchone()[0]
    
    # Financial Stats
    # Revenue: Paid fees for the current month
    total_revenue = conn.execute('SELECT SUM(amount) FROM fees WHERE owner_id = ? AND status = "PAID" AND month = ?',
                               (owner_id, current_month)).fetchone()[0] or 0
    
    # Expenses: Expenses for the current month
    total_expenses = conn.execute("SELECT SUM(amount) FROM expenses WHERE owner_id = ? AND strftime('%Y-%m', date) = ?",
                                (owner_id, current_month)).fetchone()[0] or 0
    
    # Net profit calculation
    net_profit = total_revenue - total_expenses
    
    # Total Pending Fees Amount for current month
    pending_fees_amount = conn.execute('SELECT SUM(amount) FROM fees WHERE owner_id = ? AND status = "PENDING" AND month = ?',
                                      (owner_id, current_month)).fetchone()[0] or 0
    
    # 7-Day Attendance Trend
    start_date = (datetime.now() - timedelta(days=6)).strftime('%Y-%m-%d')
    attendance_data = conn.execute('''
        SELECT date, COUNT(*) 
        FROM attendance 
        WHERE owner_id = ? AND date >= ?
        GROUP BY date
    ''', (owner_id, start_date)).fetchall()
    
    attendance_map = {row[0]: row[1] for row in attendance_data}
    
    attendance_trend_dates = []
    attendance_trend_counts = []
    for i in range(6, -1, -1):
        date_obj = datetime.now() - timedelta(days=i)
        date_str = date_obj.strftime('%Y-%m-%d')
        display_date = date_obj.strftime('%a %d')
        attendance_trend_dates.append(display_date)
        attendance_trend_counts.append(attendance_map.get(date_str, 0))

    
    # Pending Fees Table for current month
    pending_list = conn.execute('''
        SELECT f.id, s.id as student_id, s.name, s.mobile, f.month, f.amount, f.status 
        FROM fees f 
        JOIN students s ON f.student_id = s.id 
        WHERE f.owner_id = ? AND f.status = "PENDING" AND f.month = ?
    ''', (owner_id, current_month)).fetchall()
    
    conn.close()
    
    return render_template('dashboard.html', 
                           today_count=today_count, 
                           monthly_count=monthly_count, 
                           total_enrolled=total_enrolled, 
                           pending_fees_count=pending_fees_count,
                           pending_fees_amount=pending_fees_amount,
                           total_revenue=total_revenue,
                           total_expenses=total_expenses,
                           net_profit=net_profit,
                           pending_list=pending_list,
                           attendance_trend_dates=attendance_trend_dates,
                           attendance_trend_counts=attendance_trend_counts,
                           current_month_name=datetime.now().strftime('%B %Y'))


@app.route('/expenses')
def expenses():
    if not is_logged_in():
        return redirect(url_for('login'))
    
    owner_id = session['owner_id']
    current_month = datetime.now().strftime('%Y-%m')
    
    conn = get_db_connection()
    expenses_list = conn.execute("SELECT * FROM expenses WHERE owner_id = ? ORDER BY date DESC", (owner_id,)).fetchall()
    
    monthly_expenses = conn.execute("SELECT SUM(amount) FROM expenses WHERE owner_id = ? AND strftime('%Y-%m', date) = ?",
                                   (owner_id, current_month)).fetchone()[0] or 0
    
    # Expense category breakdown for current month
    category_data = conn.execute('''
        SELECT IFNULL(category, 'Other') as cat, SUM(amount) as total 
        FROM expenses 
        WHERE owner_id = ? AND strftime('%Y-%m', date) = ?
        GROUP BY cat
    ''', (owner_id, current_month)).fetchall()
    
    expense_categories = [row['cat'] for row in category_data]
    expense_category_totals = [row['total'] for row in category_data]
    
    conn.close()
    
    return render_template('expenses.html', 
                           expenses=expenses_list, 
                           monthly_expenses=monthly_expenses,
                           expense_categories=expense_categories,
                           expense_category_totals=expense_category_totals,
                           current_month_name=datetime.now().strftime('%B %Y'))


@app.route('/expenses/add', methods=['POST'])
def add_expense():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
    
    owner_id = session['owner_id']
    description = request.form.get('description')
    amount = request.form.get('amount')
    date = request.form.get('date')
    category = request.form.get('category')
    custom_category = request.form.get('custom_category')
    
    if category == 'Other' and custom_category:
        category = custom_category
    
    if not all([description, amount, date]):
        flash('Description, amount, and date are required.', 'error')
        return redirect(url_for('expenses'))
    
    conn = get_db_connection()
    conn.execute('INSERT INTO expenses (owner_id, description, amount, date, category) VALUES (?, ?, ?, ?, ?)',
                (owner_id, description, amount, date, category))
    conn.commit()
    conn.close()
    
    flash('Expense added successfully!', 'success')
    return redirect(url_for('expenses'))

@app.route('/today')
def today_management():
    if not is_logged_in():
        return redirect(url_for('login'))
    
    owner_id = session['owner_id']
    check_and_create_fees(owner_id)
    
    today = datetime.now().strftime('%Y-%m-%d')
    current_month = datetime.now().strftime('%Y-%m')
    
    conn = get_db_connection()
    students = conn.execute('SELECT id, name FROM students WHERE owner_id = ? AND is_active = 1', (owner_id,)).fetchall()
    
    attendance_records = conn.execute('''
        SELECT a.id, s.id as student_id, s.name, s.mobile, a.entry_time, a.exit_time, f.status as fee_status
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        LEFT JOIN fees f ON a.student_id = f.student_id AND f.month = ?
        WHERE a.owner_id = ? AND a.date = ?
    ''', (current_month, owner_id, today)).fetchall()
    
    conn.close()
    
    return render_template('today_management.html', 
                           students=students, 
                           attendance_records=attendance_records,
                           today_display=datetime.now().strftime('%A, %d %B %Y'))

@app.route('/today/add', methods=['POST'])
def add_attendance():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
        
    owner_id = session['owner_id']
    student_id = request.form.get('student_id')
    entry_time = request.form.get('entry_time')
    exit_time = request.form.get('exit_time')
    today = datetime.now().strftime('%Y-%m-%d')
    
    conn = get_db_connection()
    existing = conn.execute('SELECT id FROM attendance WHERE owner_id = ? AND student_id = ? AND date = ?', 
                          (owner_id, student_id, today)).fetchone()
    
    if existing:
        conn.close()
        flash('This student is already marked for today.', 'error')
        return redirect(url_for('today_management'))
    
    conn.execute('INSERT INTO attendance (owner_id, student_id, date, entry_time, exit_time) VALUES (?, ?, ?, ?, ?)',
                (owner_id, student_id, today, entry_time, exit_time))
    conn.commit()
    conn.close()
    return redirect(url_for('today_management'))

@app.route('/enroll')
def enroll_student():
    if not is_logged_in():
        return redirect(url_for('login'))
    
    owner_id = session['owner_id']
    check_and_create_fees(owner_id)
    
    filter_status = request.args.get('filter', 'all')
    
    conn = get_db_connection()
    query = 'SELECT * FROM students WHERE owner_id = ?'
    params = [owner_id]
    
    if filter_status == 'active':
        query += ' AND is_active = 1'
    elif filter_status == 'out':
        query += ' AND is_active = 0'
        
    students_rows = conn.execute(query, params).fetchall()
    
    students = []
    for row in students_rows:
        student = dict(row)
        # Calculate Expiry
        duration_months = int(student['membership_duration'])
        expiry_date, days_left = calculate_membership_info(student['date_enrolled'], duration_months)
        
        student['expiry_date'] = expiry_date.strftime('%Y-%m-%d')
        student['days_left'] = days_left
        students.append(student)
        
    conn.close()
    
    return render_template('enroll_student.html', students=students, current_filter=filter_status)

@app.route('/enroll/add', methods=['POST'])
def add_student():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
        
    owner_id = session['owner_id']
    name = request.form.get('name')
    mobile = request.form.get('mobile')
    date_enrolled = request.form.get('date_enrolled')
    membership_duration = request.form.get('membership_duration', 1)
    monthly_fee = request.form.get('monthly_fee')
    current_month = datetime.now().strftime('%Y-%m')
    
    if not mobile.isdigit() or len(mobile) != 10:
        flash('Mobile number must be exactly 10 digits and numeric.', 'error')
        return redirect(url_for('enroll_student'))
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO students (owner_id, name, mobile, date_enrolled, membership_duration, monthly_fee) VALUES (?, ?, ?, ?, ?, ?)',
                (owner_id, name, mobile, date_enrolled, membership_duration, monthly_fee))
    student_id = cursor.lastrowid
    
    # Auto-create fee record
    cursor.execute('INSERT INTO fees (owner_id, student_id, month, amount, status) VALUES (?, ?, ?, ?, "PENDING")',
                (owner_id, student_id, current_month, monthly_fee))
    
    conn.commit()
    conn.close()
    flash('Student enrolled successfully!', 'success')
    return redirect(url_for('enroll_student'))

@app.route('/enroll/toggle-status', methods=['POST'])
def toggle_status():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
        
    owner_id = session['owner_id']
    student_id = request.form.get('student_id')
    new_status = int(request.form.get('status'))
    current_month = datetime.now().strftime('%Y-%m')
    
    conn = get_db_connection()
    conn.execute('UPDATE students SET is_active = ? WHERE id = ? AND owner_id = ?', 
                (new_status, student_id, owner_id))
    
    if new_status == 1:
        # Re-enroll: check if fee record exists for current month
        existing_fee = conn.execute('SELECT id FROM fees WHERE owner_id = ? AND student_id = ? AND month = ?',
                                  (owner_id, student_id, current_month)).fetchone()
        if not existing_fee:
            student = conn.execute('SELECT monthly_fee FROM students WHERE id = ?', (student_id,)).fetchone()
            conn.execute('INSERT INTO fees (owner_id, student_id, month, amount, status) VALUES (?, ?, ?, ?, "PENDING")',
                        (owner_id, student_id, current_month, student['monthly_fee']))
    
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/change-password', methods=['GET', 'POST'])
def change_password():
    if not is_logged_in():
        return redirect(url_for('login'))

    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')

        if not all([current_password, new_password, confirm_password]):
            flash('All fields are required.', 'error')
        elif new_password != confirm_password:
            flash('New passwords do not match.', 'error')
        elif len(new_password) < 6:
            flash('New password must be at least 6 characters.', 'error')
        else:
            owner_id = session['owner_id']
            conn = get_db_connection()
            owner = conn.execute('SELECT * FROM owners WHERE id = ?', (owner_id,)).fetchone()
            if owner and bcrypt.check_password_hash(owner['password_hash'], current_password):
                new_hash = bcrypt.generate_password_hash(new_password).decode('utf-8')
                conn.execute('UPDATE owners SET password_hash = ? WHERE id = ?', (new_hash, owner_id))
                conn.commit()
                conn.close()
                flash('Password changed successfully!', 'success')
                return redirect(url_for('change_password'))
            else:
                conn.close()
                flash('Current password is incorrect.', 'error')

    return render_template('change_password.html')

@app.route('/about')
def about():
    if not is_logged_in():
        return redirect(url_for('login'))
    return render_template('about.html')

# --- API Routes ---

@app.route('/api/pending-fees')
def get_pending_fees():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
    
    owner_id = session['owner_id']
    current_month = datetime.now().strftime('%Y-%m')
    
    conn = get_db_connection()
    pending = conn.execute('''
        SELECT f.id, s.id as student_id, s.name, s.mobile, f.month, f.amount, f.status 
        FROM fees f 
        JOIN students s ON f.student_id = s.id 
        WHERE f.owner_id = ? AND f.status = "PENDING" AND f.month = ?
    ''', (owner_id, current_month)).fetchall()
    conn.close()
    
    result = []
    for row in pending:
        result.append({
            'id': row['id'],
            'student_id': row['student_id'],
            'name': row['name'],
            'mobile': row['mobile'],
            'month': datetime.strptime(row['month'], '%Y-%m').strftime('%B %Y'),
            'amount': row['amount'],
            'status': row['status']
        })
    return jsonify(result)

@app.route('/api/mark-paid', methods=['POST'])
def mark_paid():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    fee_id = data.get('fee_id')
    payment_method = data.get('payment_method')
    payment_date = data.get('payment_date')
    owner_id = session['owner_id']
    
    conn = get_db_connection()
    conn.execute('UPDATE fees SET status = "PAID", payment_method = ?, payment_date = ? WHERE id = ? AND owner_id = ?', 
                (payment_method, payment_date, fee_id, owner_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/update-exit-time', methods=['POST'])
def update_exit_time():
    if not is_logged_in():
        return jsonify({'error': 'Unauthorized'}), 401
    
    attendance_id = request.json.get('attendance_id')
    exit_time = request.json.get('exit_time')
    owner_id = session['owner_id']
    
    conn = get_db_connection()
    conn.execute('UPDATE attendance SET exit_time = ? WHERE id = ? AND owner_id = ?', 
                (exit_time, attendance_id, owner_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
