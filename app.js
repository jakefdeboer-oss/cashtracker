/**
 * DayTrack - Daily Finance Tracker
 * Logic for calculations, persistence, forecast timeline, and file/Drive sync.
 */

let state = {
  transactions: [],
  theme: 'light',
  selectedPeriodIndex: null,
  bankOffset: 0
};

const STORAGE_KEY = 'daytrack_transactions_v1';
const THEME_KEY = 'daytrack_theme_v1';
const BANK_OFFSET_KEY = 'daytrack_bank_offset_v1';

// DOM Elements
const walletBalanceEl = document.getElementById('wallet-balance');
const bankBalanceEl = document.getElementById('bank-balance');
const periodSelectEl = document.getElementById('period-select');
const btnPeriodPrev = document.getElementById('btn-period-prev');
const btnPeriodNext = document.getElementById('btn-period-next');
const txListEl = document.getElementById('transaction-list');
const txCountBadgeEl = document.getElementById('tx-count-badge');
const categoryBreakdownListEl = document.getElementById('category-breakdown-list');
const currentDateLabelEl = document.getElementById('current-date-label');

// Modals
const modalDeposit = document.getElementById('modal-deposit');
const modalWithdraw = document.getElementById('modal-withdraw');
const modalSettings = document.getElementById('modal-settings');

// Inputs
const depositAmount = document.getElementById('deposit-amount');
const depositDate = document.getElementById('deposit-date');
const depositSource = document.getElementById('deposit-source');

const withdrawAmount = document.getElementById('withdraw-amount');
const withdrawDate = document.getElementById('withdraw-date');
const withdrawDesc = document.getElementById('withdraw-desc');
const withdrawCategory = document.getElementById('withdraw-category');

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function getDayBefore(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPayPeriods() {
  const paydays = state.transactions
    .filter(tx => tx.type === 'income')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (paydays.length === 0) return [];

  const distinctPaydays = [];
  paydays.forEach(p => {
    const existing = distinctPaydays.find(d => d.date === p.date);
    if (existing) {
      existing.amount += p.amount;
      existing.description += `, ${p.description}`;
    } else {
      distinctPaydays.push({ ...p });
    }
  });

  const periods = [];
  for (let i = 0; i < distinctPaydays.length; i++) {
    const currentPayday = distinctPaydays[i];
    const nextPayday = distinctPaydays[i + 1];

    const startDate = currentPayday.date;
    const endDate = nextPayday ? getDayBefore(nextPayday.date) : null;
    const isCurrent = (i === distinctPaydays.length - 1);

    const dateRangeLabel = endDate 
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : `${formatDate(startDate)} – Present`;

    periods.push({
      index: i,
      id: `period_${i}`,
      startDate: startDate,
      endDate: endDate,
      paydayId: currentPayday.id,
      description: currentPayday.description,
      amount: currentPayday.amount,
      label: dateRangeLabel,
      isCurrent: isCurrent
    });
  }

  return periods;
}

function init() {
  const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  const storedData = localStorage.getItem(STORAGE_KEY);
  if (storedData) {
    try {
      state.transactions = JSON.parse(storedData);
    } catch (e) {
      console.error('Error parsing stored transactions:', e);
      state.transactions = [];
    }
  }

  const savedOffset = localStorage.getItem(BANK_OFFSET_KEY);
  if (savedOffset !== null) {
    state.bankOffset = parseFloat(savedOffset) || 0;
  }

  const todayStr = getTodayStr();
  depositDate.value = todayStr;
  withdrawDate.value = todayStr;

  const now = new Date();
  currentDateLabelEl.textContent = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  setupEventListeners();
  render();
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function setupEventListeners() {
  // Theme Toggle inside Settings Modal
  document.getElementById('btn-modal-theme-toggle').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('btn-close-deposit').addEventListener('click', () => closeModal(modalDeposit));
  document.getElementById('btn-close-withdraw').addEventListener('click', () => closeModal(modalWithdraw));
  document.getElementById('btn-close-settings').addEventListener('click', () => closeModal(modalSettings));

  btnPeriodPrev.addEventListener('click', () => {
    const periods = getPayPeriods();
    if (periods.length === 0) return;
    let curIdx = (state.selectedPeriodIndex === null || state.selectedPeriodIndex === 'current')
      ? periods.length - 1
      : (state.selectedPeriodIndex === 'all' ? periods.length - 1 : Number(state.selectedPeriodIndex));
    if (curIdx > 0) {
      state.selectedPeriodIndex = curIdx - 1;
      render();
    }
  });

  btnPeriodNext.addEventListener('click', () => {
    const periods = getPayPeriods();
    if (periods.length === 0) return;
    let curIdx = (state.selectedPeriodIndex === null || state.selectedPeriodIndex === 'current')
      ? periods.length - 1
      : (state.selectedPeriodIndex === 'all' ? 0 : Number(state.selectedPeriodIndex));
    if (curIdx < periods.length - 1) {
      state.selectedPeriodIndex = curIdx + 1;
      render();
    }
  });

  periodSelectEl.addEventListener('change', (e) => {
    state.selectedPeriodIndex = e.target.value;
    render();
  });

  document.getElementById('btn-open-deposit').addEventListener('click', () => {
    if (!depositDate.value) depositDate.value = getTodayStr();
    openModal(modalDeposit);
  });
  document.getElementById('btn-open-withdraw').addEventListener('click', () => {
    if (!withdrawDate.value) withdrawDate.value = getTodayStr();
    openModal(modalWithdraw);
  });
  document.getElementById('btn-open-settings').addEventListener('click', () => openModal(modalSettings));

  document.getElementById('btn-edit-bank').addEventListener('click', () => {
    const currentBank = lifetimeBalance + state.bankOffset;
    const newVal = prompt('Enter new BANK balance ($):', currentBank.toFixed(2));
    if (newVal !== null) {
      const amount = parseFloat(newVal);
      if (!isNaN(amount)) {
        state.bankOffset = amount - lifetimeBalance;
        localStorage.setItem(BANK_OFFSET_KEY, state.bankOffset);
        render();
      } else {
        alert('Please enter a valid number.');
      }
    }
  });

  [modalDeposit, modalWithdraw, modalSettings].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.getElementById('form-deposit').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount.value);
    const date = depositDate.value || getTodayStr();
    const source = (depositSource.value || 'Allowance').trim();

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    state.transactions.push({
      id: 'tx_' + Date.now(),
      type: 'income',
      amount: amount,
      date: date,
      description: source,
      category: 'Payday / Income'
    });

    state.selectedPeriodIndex = null;
    saveToStorage();
    depositAmount.value = '';
    depositSource.value = '';
    closeModal(modalDeposit);
    render();
  });

  document.getElementById('form-withdraw').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount.value);
    const date = withdrawDate.value || getTodayStr();
    const desc = (withdrawDesc.value || 'Expense').trim();
    const cat = withdrawCategory.value || 'Shopping & Miscellaneous';

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    state.transactions.push({
      id: 'tx_' + Date.now(),
      type: 'expense',
      amount: amount,
      date: date,
      description: desc,
      category: cat
    });

    saveToStorage();
    withdrawAmount.value = '';
    withdrawDesc.value = '';
    closeModal(modalWithdraw);
    render();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      document.getElementById('tab-content-ledger').style.display = target === 'ledger' ? 'block' : 'none';
      document.getElementById('tab-content-breakdown').style.display = target === 'breakdown' ? 'block' : 'none';
    });
  });

  document.getElementById('btn-export-json').addEventListener('click', exportToGoogleDriveFile);
  document.getElementById('btn-trigger-import').addEventListener('click', () => {
    document.getElementById('file-import-input').click();
  });
  document.getElementById('file-import-input').addEventListener('change', importFromFile);
  document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);

  document.getElementById('btn-load-sample').addEventListener('click', loadSampleData);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all transactions?')) {
      state.transactions = [];
      state.selectedPeriodIndex = null;
      saveToStorage();
      closeModal(modalSettings);
      render();
    }
  });
}

function openModal(modal) {
  modal.classList.add('open');
}

function closeModal(modal) {
  modal.classList.remove('open');
}

let lifetimeBalance = 0;

function render() {
  state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  let lifetimeIncome = 0;
  let lifetimeWithdrawals = 0;
  lifetimeBalance = 0;

  state.transactions.forEach(tx => {
    if (tx.type === 'income') {
      lifetimeIncome += tx.amount;
      lifetimeBalance += tx.amount;
    } else {
      lifetimeWithdrawals += tx.amount;
      lifetimeBalance -= tx.amount;
    }
  });

  const periods = getPayPeriods();

  const periodStats = periods.map(p => {
    let inc = 0;
    let exp = 0;
    state.transactions.forEach(tx => {
      if (tx.date >= p.startDate && (!p.endDate || tx.date <= p.endDate)) {
        if (tx.type === 'income') inc += tx.amount;
        else exp += tx.amount;
      }
    });
    return {
      income: inc,
      expenses: exp,
      leftover: inc - exp
    };
  });

  let optionsHtml = '';
  if (periods.length === 0) {
    optionsHtml = '<option value="all">All Transactions</option>';
    btnPeriodPrev.disabled = true;
    btnPeriodNext.disabled = true;
    state.selectedPeriodIndex = 'all';
  } else {
    if (state.selectedPeriodIndex === null || state.selectedPeriodIndex === 'current') {
      state.selectedPeriodIndex = periods.length - 1;
    } else if (state.selectedPeriodIndex !== 'all') {
      const idx = Number(state.selectedPeriodIndex);
      if (isNaN(idx) || idx < 0 || idx >= periods.length) {
        state.selectedPeriodIndex = periods.length - 1;
      }
    }

    for (let i = periods.length - 1; i >= 0; i--) {
      const p = periods[i];
      const isSelected = (state.selectedPeriodIndex !== 'all' && Number(state.selectedPeriodIndex) === i);
      const tag = p.isCurrent ? ' (Current)' : '';
      optionsHtml += `<option value="${i}" ${isSelected ? 'selected' : ''}>${p.label}${tag}</option>`;
    }
    optionsHtml += `<option value="all" ${state.selectedPeriodIndex === 'all' ? 'selected' : ''}>All Transactions (Lifetime)</option>`;

    if (state.selectedPeriodIndex === 'all') {
      btnPeriodPrev.disabled = true;
      btnPeriodNext.disabled = true;
    } else {
      const curIdx = Number(state.selectedPeriodIndex);
      btnPeriodPrev.disabled = (curIdx <= 0);
      btnPeriodNext.disabled = (curIdx >= periods.length - 1);
    }
  }
  periodSelectEl.innerHTML = optionsHtml;

  let activeTransactions = [];
  let walletAmount = 0;
  let bankAmount = lifetimeBalance + state.bankOffset;

  if (periods.length === 0) {
    activeTransactions = [...state.transactions];
    walletAmount = 0;
  } else if (state.selectedPeriodIndex === 'all') {
    activeTransactions = [...state.transactions];
    const latestIdx = periods.length - 1;
    walletAmount = periodStats[latestIdx].leftover;
  } else {
    const curIdx = Number(state.selectedPeriodIndex);
    const curPeriod = periods[curIdx];
    activeTransactions = state.transactions.filter(tx => {
      if (tx.date < curPeriod.startDate) return false;
      if (curPeriod.endDate && tx.date > curPeriod.endDate) return false;
      return true;
    });

    walletAmount = periodStats[curIdx].leftover;
  }

  if (walletBalanceEl) walletBalanceEl.textContent = formatCurrency(walletAmount);
  if (bankBalanceEl) bankBalanceEl.textContent = formatCurrency(bankAmount);

  renderTransactionList(activeTransactions);
  renderCategoryBreakdown(activeTransactions);
}

function renderTransactionList(transactionsToDisplay) {
  const list = transactionsToDisplay || state.transactions;
  txCountBadgeEl.textContent = `${list.length} record${list.length === 1 ? '' : 's'}`;

  if (list.length === 0) {
    txListEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💳</span>
        <p>No transactions found for this period.</p>
        <p style="font-size: 13px; margin-top: 6px;">Tap <strong>+ Add Cash</strong> or <strong>&minus; Spend Cash</strong> to add an entry!</p>
      </div>
    `;
    return;
  }

  txListEl.innerHTML = list.map(tx => {
    const isIncome = tx.type === 'income';
    const icon = isIncome ? '💰' : getCategoryIcon(tx.category);
    return `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon ${isIncome ? 'income' : 'expense'}">${icon}</div>
          <div class="tx-details">
            <span class="tx-desc">${escapeHtml(tx.description)}</span>
            <span class="tx-sub">
              <span>${formatDate(tx.date)}</span>
              ${tx.category ? `<span class="tx-category-tag">${escapeHtml(tx.category)}</span>` : ''}
            </span>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
          </span>
          <button class="tx-delete-btn" onclick="deleteTransaction('${tx.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteTransaction = function(id) {
  state.transactions = state.transactions.filter(tx => tx.id !== id);
  saveToStorage();
  render();
};

function renderCategoryBreakdown(transactionsToDisplay) {
  const list = transactionsToDisplay || state.transactions;
  const categoryTotals = {};
  let totalExpenses = 0;

  list.filter(tx => tx.type === 'expense').forEach(tx => {
    const cat = tx.category || 'Other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
    totalExpenses += tx.amount;
  });

  const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);

  if (categories.length === 0) {
    categoryBreakdownListEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏷️</span>
        <p>No withdrawals recorded in this pay period.</p>
      </div>
    `;
    return;
  }

  categoryBreakdownListEl.innerHTML = categories.map(cat => {
    const amount = categoryTotals[cat];
    const pct = totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
    return `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-icon expense">${getCategoryIcon(cat)}</div>
          <div class="tx-details">
            <span class="tx-desc">${escapeHtml(cat)}</span>
            <span class="tx-sub">${pct}% of period spending</span>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount expense">${formatCurrency(amount)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getCategoryIcon(category) {
  if (!category) return '💸';
  if (category.includes('Groceries')) return '🛒';
  if (category.includes('Housing') || category.includes('Rent')) return '🏠';
  if (category.includes('Utilities') || category.includes('Bills')) return '⚡';
  if (category.includes('Transport') || category.includes('Gas')) return '🚗';
  if (category.includes('Dining') || category.includes('Entertainment')) return '🍿';
  if (category.includes('Health')) return '💊';
  if (category.includes('Subscription')) return '📱';
  return '🛍️';
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function exportToGoogleDriveFile() {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    transactions: state.transactions
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const fileName = `DayTrack_Finance_Backup_${getTodayStr()}.json`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'DayTrack Finance JSON File',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      alert('Saved successfully!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed.transactions)) {
        state.transactions = parsed.transactions;
      } else if (Array.isArray(parsed)) {
        state.transactions = parsed;
      } else {
        alert('Invalid backup file format.');
        return;
      }
      saveToStorage();
      closeModal(modalSettings);
      render();
      alert('Backup loaded successfully!');
    } catch (err) {
      alert('Could not parse file.');
    }
  };
  reader.readAsText(file);
}

function exportToCSV() {
  if (state.transactions.length === 0) {
    alert('No transactions to export.');
    return;
  }

  const headers = ['ID', 'Date', 'Type', 'Amount', 'Description', 'Category'];
  const rows = state.transactions.map(tx => [
    `"${tx.id}"`,
    `"${tx.date}"`,
    `"${tx.type}"`,
    tx.amount.toFixed(2),
    `"${tx.description.replace(/"/g, '""')}"`,
    `"${(tx.category || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DayTrack_Transactions_${getTodayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadSampleData() {
  const today = new Date();
  
  const formatDateOffset = (offset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  state.transactions = [
    { id: 'tx_sample_1', type: 'income', amount: 500.00, date: formatDateOffset(-14), description: 'Bi-Weekly Allowance', category: 'Payday / Income' },
    { id: 'tx_sample_2', type: 'expense', amount: 65.00, date: formatDateOffset(-12), description: 'Groceries & Household', category: 'Groceries & Food' },
    { id: 'tx_sample_3', type: 'expense', amount: 45.00, date: formatDateOffset(-9), description: 'Gas Station Refill', category: 'Transportation & Gas' },
    { id: 'tx_sample_4', type: 'expense', amount: 35.00, date: formatDateOffset(-6), description: 'Weekend Dining Out', category: 'Dining & Entertainment' },
    { id: 'tx_sample_5', type: 'expense', amount: 14.99, date: formatDateOffset(-4), description: 'Streaming Subscription', category: 'Subscriptions' },
    { id: 'tx_sample_6', type: 'income', amount: 500.00, date: formatDateOffset(-2), description: 'Bi-Weekly Allowance', category: 'Payday / Income' },
    { id: 'tx_sample_7', type: 'expense', amount: 42.50, date: formatDateOffset(-1), description: 'Coffee & Lunch', category: 'Dining & Entertainment' },
    { id: 'tx_sample_8', type: 'expense', amount: 55.00, date: formatDateOffset(0), description: 'Grocery Essentials', category: 'Groceries & Food' }
  ];

  state.selectedPeriodIndex = null;
  saveToStorage();
  closeModal(modalSettings);
  render();
}

document.addEventListener('DOMContentLoaded', init);