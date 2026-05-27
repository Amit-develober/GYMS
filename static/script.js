function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// Toggle Password Visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    }
}

// Modal Logic
function openPendingFeesModal() {
    const modal = document.getElementById('fees-modal');
    const content = document.getElementById('modal-content');
    modal.classList.add('active');
    
    content.innerHTML = '<div class="loader">Loading pending fees...</div>';
    
    fetch('/api/pending-fees')
        .then(res => res.json())
        .then(data => {
            if (data.length === 0) {
                content.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-check-circle" style="font-size: 4rem; color: #3fb950; margin-bottom: 20px; display: block; text-align: center;"></i>
                        <p style="text-align: center; font-size: 1.2rem;">All students have paid for this month!</p>
                    </div>
                `;
                return;
            }
            
            let html = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Mobile</th>
                                <th>Month</th>
                                <th>Amount</th>
                                <th>Action</th>
                                <th>Report</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            data.forEach((fee, index) => {
                html += `
                    <tr id="fee-row-${fee.id}">
                        <td>${index + 1}</td>
                        <td>${fee.name}</td>
                        <td>${fee.mobile}</td>
                        <td>${fee.month}</td>
                        <td>₹${fee.amount}</td>
                        <td>
                            <button class="btn-sm btn-success" onclick="markAsPaid(${fee.id})">Mark as Paid</button>
                        </td>
                        <td>
                            <a href="/enroll/download-pdf/${fee.student_id}" class="btn-sm btn-pdf" title="Download Report">
                                <i class="fas fa-file-pdf"></i>
                            </a>
                        </td>
                    </tr>
                `;
            });
            
            html += `</tbody></table></div>`;
            content.innerHTML = html;
        })
        .catch(err => {
            content.innerHTML = '<p class="error">Failed to load data.</p>';
        });
}

function closePendingFeesModal() {
    document.getElementById('fees-modal').classList.remove('active');
}

// Close modal on click outside
window.onclick = function(event) {
    const modal = document.getElementById('fees-modal');
    if (event.target == modal) {
        closePendingFeesModal();
    }
}

// Mark Fee as Paid - Now opens a modal
function markAsPaid(feeId) {
    document.getElementById('payment-fee-id').value = feeId;
    document.getElementById('payment_date').valueAsDate = new Date();
    document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
}

function submitPayment(event) {
    event.preventDefault();
    
    if (!confirm("Are you absolutely sure? This action is IRREVERSIBLE and cannot be undone.")) {
        return;
    }
    
    const feeId = document.getElementById('payment-fee-id').value;
    const paymentWay = document.getElementById('payment_way').value;
    const paymentDate = document.getElementById('payment_date').value;
    
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "Processing...";
    
    fetch('/api/mark-paid', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ 
            fee_id: feeId,
            payment_method: paymentWay,
            payment_date: paymentDate
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closePaymentModal();
            const row = document.getElementById(`fee-row-${feeId}`);
            if (row) {
                row.style.opacity = '0';
                setTimeout(() => {
                    row.remove();
                    // Update dashboard badge if exists
                    const badge = document.getElementById('pending-fees-count-badge');
                    if (badge) {
                        badge.innerText = parseInt(badge.innerText) - 1;
                    }
                    
                    // If no rows left, show success msg
                    const rows = document.querySelectorAll('#modal-content tbody tr');
                    if (rows.length === 0) {
                        document.getElementById('modal-content').innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-check-circle" style="font-size: 4rem; color: #3fb950; margin-bottom: 20px; display: block; text-align: center;"></i>
                                <p style="text-align: center; font-size: 1.2rem;">All fees cleared for this month!</p>
                            </div>
                        `;
                    }
                }, 300);
            } else {
                // If it was from a page list not the modal, just reload or update UI
                location.reload();
            }
        }
    })
    .catch(err => {
        alert("Something went wrong!");
        btn.disabled = false;
        btn.innerText = "Confirm Payment";
    });
}

// Edit Exit Time Inline
function editExitTime(btn) {
    const cell = btn.parentElement;
    const timeVal = cell.querySelector('.time-val');
    const attendanceId = cell.getAttribute('data-id');
    const currentVal = timeVal.innerText === '—' ? '' : timeVal.innerText;
    
    cell.innerHTML = `
        <input type="time" class="inline-edit-input" value="${currentVal}">
        <button class="save-btn" onclick="saveExitTime(this, ${attendanceId})"><i class="fas fa-save"></i></button>
    `;
}

function saveExitTime(btn, attendanceId) {
    const cell = btn.parentElement;
    const input = cell.querySelector('input');
    const newVal = input.value;
    
    btn.disabled = true;
    
    fetch('/api/update-exit-time', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ attendance_id: attendanceId, exit_time: newVal })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            cell.innerHTML = `
                <span class="time-val">${newVal || '—'}</span>
                <button class="edit-btn" onclick="editExitTime(this)"><i class="fas fa-edit"></i></button>
            `;
        }
    });
}

// Toggle Student Status (Active/Out)
function toggleStudentStatus(studentId, newStatus) {
    const action = newStatus === 1 ? 'Activate' : 'Mark Out';
    if (!confirm(`Are you sure you want to ${action} this student?`)) {
        return;
    }

    const btn = event.target;
    btn.disabled = true;
    btn.innerText = "Wait...";
    
    const formData = new FormData();
    formData.append('student_id', studentId);
    formData.append('status', newStatus);
    formData.append('csrf_token', getCsrfToken());
    
    fetch('/enroll/toggle-status', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            location.reload(); // Simple reload to refresh table and counts
        }
    });
}

function toggleCustomCategory() {
    const categorySelect = document.getElementById('category');
    const customRow = document.getElementById('custom-category-row');
    const customInput = document.getElementById('custom_category');
    
    if (categorySelect.value === 'Other') {
        customRow.style.display = 'flex';
        customInput.required = true;
    } else {
        customRow.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
}

// Chart.js Initializations
document.addEventListener("DOMContentLoaded", () => {
    // Dashboard: Attendance Trend Chart
    const attendanceCtx = document.getElementById('attendanceChart');
    if (attendanceCtx) {
        initAttendanceChart(attendanceCtx);
    }
    
    // Dashboard: Financial Overview Chart
    const financialCtx = document.getElementById('financialChart');
    if (financialCtx) {
        initFinancialChart(financialCtx);
    }

    // Expenses: Category Breakdown Chart
    const expenseCtx = document.getElementById('expenseCategoryChart');
    if (expenseCtx) {
        initExpenseChart(expenseCtx);
    }
});

function initAttendanceChart(ctx) {
    const dates = window.attendanceTrendDates || [];
    const counts = window.attendanceTrendCounts || [];
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Attendance Count',
                data: counts,
                borderColor: '#ff6b00', // var(--primary) HSL 24
                backgroundColor: 'rgba(255, 107, 0, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ff6b00',
                pointBorderColor: '#ffffff',
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#ff6b00',
                pointHoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#8b949e', stepSize: 1 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8b949e' }
                }
            }
        }
    });
}

function initFinancialChart(ctx) {
    const rev = window.totalRevenue || 0;
    const exp = window.totalExpenses || 0;
    const pend = window.pendingFeesAmount || 0;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Collected Revenue', 'Expenses', 'Pending Fees'],
            datasets: [{
                data: [rev, exp, pend],
                backgroundColor: [
                    '#10b981', // green / success HSL 145
                    '#ef4444', // red / danger HSL 354
                    '#f59e0b'  // amber / pending HSL 42
                ],
                borderWidth: 2,
                borderColor: '#141a26',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e6edf3',
                        padding: 15,
                        font: { family: 'Outfit', size: 12 }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function initExpenseChart(ctx) {
    const categories = window.expenseCategories || [];
    const totals = window.expenseCategoryTotals || [];
    
    if (categories.length === 0) {
        ctx.parentElement.innerHTML = '<p class="empty-msg">No expense data to display</p>';
        return;
    }
    
    const colors = [
        '#00e1ff', // Cyan
        '#ff6b00', // Orange
        '#a855f7', // Purple
        '#3b82f6', // Blue
        '#eab308', // Yellow
        '#ec4899'  // Pink
    ];
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: totals,
                backgroundColor: colors.slice(0, categories.length),
                borderWidth: 2,
                borderColor: '#141a26',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e6edf3',
                        padding: 15,
                        font: { family: 'Outfit', size: 12 }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

