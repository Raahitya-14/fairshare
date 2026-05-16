const STORAGE_KEY = "fairshare-state-v1";
const SUPABASE_URL = "https://mdzrdxofxyxbuozdiewh.supabase.co";
const SUPABASE_KEY = "sb_publishable_MwzRQPWFxez7gmn_S9-1CA_bFIp_bL8";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
let syncTimer;

const CURRENCIES = [
  ["USD", "US Dollar"],
  ["EUR", "Euro"],
  ["SEK", "Swedish Krona"],
  ["INR", "Indian Rupee"],
  ["GBP", "British Pound"],
  ["NOK", "Norwegian Krone"],
  ["DKK", "Danish Krone"],
  ["CHF", "Swiss Franc"],
  ["CAD", "Canadian Dollar"],
  ["AUD", "Australian Dollar"],
  ["NZD", "New Zealand Dollar"],
  ["JPY", "Japanese Yen"],
  ["CNY", "Chinese Yuan"],
  ["HKD", "Hong Kong Dollar"],
  ["SGD", "Singapore Dollar"],
  ["AED", "UAE Dirham"],
  ["SAR", "Saudi Riyal"],
  ["TRY", "Turkish Lira"],
  ["PLN", "Polish Zloty"],
  ["BRL", "Brazilian Real"],
  ["MXN", "Mexican Peso"],
  ["ZAR", "South African Rand"],
  ["THB", "Thai Baht"],
  ["MYR", "Malaysian Ringgit"],
  ["IDR", "Indonesian Rupiah"],
  ["PHP", "Philippine Peso"],
  ["KRW", "South Korean Won"],
];

const seedState = {
  activeGroupId: "g1",
  groups: [
    {
      id: "g1",
      name: "Weekend Trip",
      currency: "USD",
      members: [
        { id: "m1", name: "You" },
        { id: "m2", name: "Alex" },
        { id: "m3", name: "Sam" },
      ],
      expenses: [
        {
          id: "e1",
          description: "Hotel",
          amount: 240,
          payerId: "m2",
          splitMemberIds: ["m1", "m2", "m3"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "e2",
          description: "Dinner",
          amount: 75,
          payerId: "m1",
          splitMemberIds: ["m1", "m2", "m3"],
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

let state = loadState();

const els = {
  groupForm: document.querySelector("#group-form"),
  groupName: document.querySelector("#group-name"),
  groupList: document.querySelector("#group-list"),
  activeGroupTitle: document.querySelector("#active-group-title"),
  currencySelect: document.querySelector("#currency-select"),
  syncStatus: document.querySelector("#sync-status"),
  totalSpent: document.querySelector("#total-spent"),
  yourBalance: document.querySelector("#your-balance"),
  expenseCount: document.querySelector("#expense-count"),
  memberForm: document.querySelector("#member-form"),
  memberName: document.querySelector("#member-name"),
  memberList: document.querySelector("#member-list"),
  expenseForm: document.querySelector("#expense-form"),
  expenseDescription: document.querySelector("#expense-description"),
  expenseAmount: document.querySelector("#expense-amount"),
  expensePayer: document.querySelector("#expense-payer"),
  splitMembers: document.querySelector("#split-members"),
  balanceList: document.querySelector("#balance-list"),
  debtList: document.querySelector("#debt-list"),
  expenseList: document.querySelector("#expense-list"),
  settleBtn: document.querySelector("#settle-btn"),
  shareBtn: document.querySelector("#share-btn"),
  exportBtn: document.querySelector("#export-btn"),
  importInput: document.querySelector("#import-input"),
  emptyTemplate: document.querySelector("#empty-state-template"),
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedState);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) return structuredClone(seedState);
    return normalizeState(parsed);
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(nextState) {
  nextState.groups.forEach((group) => {
    group.currency ||= "USD";
    group.members ||= [];
    group.expenses ||= [];
  });
  nextState.activeGroupId ||= nextState.groups[0].id;
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentShareCode() {
  return new URLSearchParams(window.location.search).get("g");
}

function isSharedMode() {
  return Boolean(activeGroup()?.shareCode);
}

function setSharedUrl(shareCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("g", shareCode);
  window.history.replaceState({}, "", url);
}

function setStatus(message) {
  els.syncStatus.textContent = message;
}

function normalizeRemoteGroup(group) {
  return {
    id: group.id,
    shareCode: group.shareCode,
    name: group.name,
    currency: group.currency || "USD",
    members: group.members || [],
    expenses: (group.expenses || []).map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: Number(expense.amount),
      payerId: expense.payerId,
      splitMemberIds: expense.splitMemberIds || [],
      createdAt: expense.createdAt,
    })),
  };
}

function replaceActiveGroup(group) {
  const normalized = normalizeRemoteGroup(group);
  const index = state.groups.findIndex((item) => item.id === normalized.id || item.shareCode === normalized.shareCode);
  if (index >= 0) {
    state.groups[index] = normalized;
  } else {
    state.groups.unshift(normalized);
  }
  state.activeGroupId = normalized.id;
  setSharedUrl(normalized.shareCode);
}

async function rpc(name, args) {
  if (!supabaseClient) throw new Error("Supabase client is not loaded");
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw error;
  if (!data) throw new Error("No group data returned");
  replaceActiveGroup(data);
  render();
  return data;
}

async function loadSharedGroup(shareCode, quiet = false) {
  try {
    if (!quiet) setStatus("Loading shared group...");
    await rpc("get_shared_group", { p_share_code: shareCode });
    setStatus("Shared group synced");
  } catch (error) {
    setStatus(`Supabase error: ${error.message}`);
  }
}

function startSync() {
  clearInterval(syncTimer);
  const shareCode = activeGroup()?.shareCode;
  if (!shareCode) return;
  syncTimer = setInterval(() => loadSharedGroup(shareCode, true), 5000);
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currencyHasDecimals(currency) ? 2 : 0,
  }).format(value);
}

function currencyHasDecimals(currency) {
  return !["JPY", "KRW", "IDR"].includes(currency);
}

function activeGroup() {
  return state.groups.find((group) => group.id === state.activeGroupId) || state.groups[0];
}

function memberName(group, memberId) {
  return group.members.find((member) => member.id === memberId)?.name || "Unknown";
}

function calculateBalances(group) {
  const balances = Object.fromEntries(group.members.map((member) => [member.id, 0]));

  group.expenses.forEach((expense) => {
    const participants = expense.splitMemberIds.filter((id) => balances[id] !== undefined);
    if (participants.length === 0 || balances[expense.payerId] === undefined) return;

    const share = expense.amount / participants.length;
    balances[expense.payerId] += expense.amount;
    participants.forEach((memberId) => {
      balances[memberId] -= share;
    });
  });

  return balances;
}

function simplifyDebts(group, balances) {
  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([memberId, balance]) => {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0) creditors.push({ memberId, amount: rounded });
    if (rounded < 0) debtors.push({ memberId, amount: Math.abs(rounded) });
  });

  const payments = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount >= 0.01) {
      payments.push({
        from: debtors[i].memberId,
        to: creditors[j].memberId,
        amount: Math.round(amount * 100) / 100,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.01) i += 1;
    if (creditors[j].amount < 0.01) j += 1;
  }

  return payments;
}

function renderEmpty(target, message = "Add items to continue.") {
  const node = els.emptyTemplate.content.cloneNode(true);
  node.querySelector("span").textContent = message;
  target.replaceChildren(node);
}

function captureExpenseDraft() {
  return {
    description: els.expenseDescription.value,
    amount: els.expenseAmount.value,
    payerId: els.expensePayer.value,
    splitMemberIds: [...els.splitMembers.querySelectorAll("input:checked")].map((input) => input.value),
    hasRenderedSplits: els.splitMembers.querySelectorAll("input").length > 0,
  };
}

function clearExpenseForm(group = activeGroup()) {
  els.expenseDescription.value = "";
  els.expenseAmount.value = "";
  els.expensePayer.value = group.members[0]?.id || "";
  els.splitMembers.querySelectorAll("input").forEach((input) => {
    input.checked = true;
  });
}

function render() {
  const group = activeGroup();
  const expenseDraft = captureExpenseDraft();
  state.activeGroupId = group.id;
  const balances = calculateBalances(group);
  const payments = simplifyDebts(group, balances);
  const total = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const youId = group.members[0]?.id;

  els.activeGroupTitle.textContent = group.name;
  renderCurrencySelect(group);
  els.totalSpent.textContent = money(total, group.currency);
  els.yourBalance.textContent = money(balances[youId] || 0, group.currency);
  els.yourBalance.className = (balances[youId] || 0) >= 0 ? "amount-positive" : "amount-negative";
  els.expenseCount.textContent = group.expenses.length.toString();

  renderGroups(group);
  renderMembers(group);
  renderExpenseForm(group, expenseDraft);
  renderBalances(group, balances, payments);
  renderExpenses(group);
  els.shareBtn.disabled = !group.shareCode;
  setStatus(group.shareCode ? "Shared group synced" : "Local mode");
  saveState();
  startSync();
}

function renderGroups(active) {
  els.groupList.replaceChildren(
    ...state.groups.map((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `group-item${group.id === active.id ? " active" : ""}`;
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong").textContent = group.name;
      button.querySelector("span").textContent =
        `${group.currency || "USD"} - ${group.members.length} people${group.shareCode ? " - shared" : ""}`;
      button.addEventListener("click", () => {
        state.activeGroupId = group.id;
        render();
      });
      return button;
    })
  );
}

function renderCurrencySelect(group) {
  els.currencySelect.replaceChildren(
    ...CURRENCIES.map(([code, name]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${code} - ${name}`;
      option.selected = code === group.currency;
      return option;
    })
  );
}

function renderMembers(group) {
  if (group.members.length === 0) {
    renderEmpty(els.memberList, "Add the first person in this group.");
    return;
  }

  els.memberList.replaceChildren(
    ...group.members.map((member) => {
      const row = document.createElement("div");
      row.className = "member";
      row.innerHTML = `<span class="member-name"></span><button class="delete-btn" type="button">Remove</button>`;
      row.querySelector(".member-name").textContent = member.name;
      row.querySelector("button").addEventListener("click", () => removeMember(group.id, member.id));
      return row;
    })
  );
}

function renderExpenseForm(group, draft = captureExpenseDraft()) {
  els.expensePayer.replaceChildren(
    ...group.members.map((member) => {
      const option = document.createElement("option");
      option.value = member.id;
      option.textContent = member.name;
      option.selected = member.id === draft.payerId;
      return option;
    })
  );
  if (!group.members.some((member) => member.id === els.expensePayer.value)) {
    els.expensePayer.value = group.members[0]?.id || "";
  }

  els.splitMembers.replaceChildren(
    ...group.members.map((member) => {
      const shouldCheck = draft.hasRenderedSplits ? draft.splitMemberIds.includes(member.id) : true;
      const label = document.createElement("label");
      label.className = "check-card";
      label.innerHTML = `<input type="checkbox" /><span></span>`;
      const checkbox = label.querySelector("input");
      checkbox.value = member.id;
      checkbox.checked = shouldCheck;
      label.querySelector("span").textContent = member.name;
      return label;
    })
  );

  els.expenseDescription.value = draft.description;
  els.expenseAmount.value = draft.amount;
}

function renderBalances(group, balances, payments) {
  if (group.members.length === 0) {
    renderEmpty(els.balanceList, "Balances appear after members are added.");
  } else {
    els.balanceList.replaceChildren(
      ...group.members.map((member) => {
        const balance = balances[member.id] || 0;
        const row = document.createElement("div");
        row.className = "balance";
        row.innerHTML = `<strong></strong><span></span>`;
        row.querySelector("strong").textContent = member.name;
        row.querySelector("span").textContent = money(balance, group.currency);
        row.querySelector("span").className =
          Math.abs(balance) < 0.01 ? "amount-neutral" : balance > 0 ? "amount-positive" : "amount-negative";
        return row;
      })
    );
  }

  if (payments.length === 0) {
    renderEmpty(els.debtList, "Everyone is settled.");
    return;
  }

  els.debtList.replaceChildren(
    ...payments.map((payment) => {
      const row = document.createElement("div");
      row.className = "debt";
      row.innerHTML = `<span></span><strong></strong>`;
      row.querySelector("span").textContent = `${memberName(group, payment.from)} pays ${memberName(group, payment.to)}`;
      row.querySelector("strong").textContent = money(payment.amount, group.currency);
      return row;
    })
  );
}

function renderExpenses(group) {
  if (group.expenses.length === 0) {
    renderEmpty(els.expenseList, "Add an expense to build the ledger.");
    return;
  }

  els.expenseList.replaceChildren(
    ...group.expenses
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((expense) => {
        const row = document.createElement("div");
        row.className = "expense";
        row.innerHTML = `
          <div>
            <div class="expense-title"></div>
            <div class="subtext"></div>
          </div>
          <div>
            <strong></strong>
            <button class="delete-btn" type="button">Delete</button>
          </div>
        `;
        row.querySelector(".expense-title").textContent = expense.description;
        row.querySelector(".subtext").textContent =
          `${memberName(group, expense.payerId)} paid, split ${expense.splitMemberIds.length} ways`;
        row.querySelector("strong").textContent = money(expense.amount, group.currency);
        row.querySelector("button").addEventListener("click", () => deleteExpense(expense.id));
        return row;
      })
  );
}

async function deleteExpense(expenseId) {
  const group = activeGroup();
  if (group.shareCode) {
    await rpc("delete_shared_expense", { p_share_code: group.shareCode, p_expense_id: expenseId });
    return;
  }

  group.expenses = group.expenses.filter((item) => item.id !== expenseId);
  render();
}

async function removeMember(groupId, memberId) {
  const group = state.groups.find((item) => item.id === groupId);
  const isUsed = group.expenses.some(
    (expense) => expense.payerId === memberId || expense.splitMemberIds.includes(memberId)
  );

  if (isUsed) {
    alert("This person is part of existing expenses. Delete those expenses first.");
    return;
  }

  if (group.shareCode) {
    await rpc("remove_group_member", { p_share_code: group.shareCode, p_member_id: memberId });
    return;
  }

  group.members = group.members.filter((member) => member.id !== memberId);
  render();
}

els.groupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.groupName.value.trim();
  if (!name) return;

  try {
    setStatus("Creating shared group...");
    if (supabaseClient) {
      await rpc("create_shared_group", { p_name: name, p_currency: activeGroup()?.currency || "USD" });
      els.groupName.value = "";
      return;
    }
  } catch (error) {
    setStatus(`Supabase error: ${error.message}`);
  }

  const group = { id: uid("g"), name, currency: activeGroup()?.currency || "USD", members: [{ id: uid("m"), name: "You" }], expenses: [] };
  state.groups.push(group);
  state.activeGroupId = group.id;
  els.groupName.value = "";
  render();
});

els.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.memberName.value.trim();
  if (!name) return;

  const group = activeGroup();
  if (group.shareCode) {
    await rpc("add_group_member", { p_share_code: group.shareCode, p_name: name });
    els.memberName.value = "";
    return;
  }

  group.members.push({ id: uid("m"), name });
  els.memberName.value = "";
  render();
});

els.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const group = activeGroup();
  const splitMemberIds = [...els.splitMembers.querySelectorAll("input:checked")].map((input) => input.value);
  const amount = Number(els.expenseAmount.value);

  if (!els.expenseDescription.value.trim() || !amount || splitMemberIds.length === 0) return;

  if (group.shareCode) {
    await rpc("add_shared_expense", {
      p_share_code: group.shareCode,
      p_description: els.expenseDescription.value.trim(),
      p_amount: amount,
      p_payer_id: els.expensePayer.value,
      p_split_member_ids: splitMemberIds,
    });
    clearExpenseForm();
    render();
    return;
  }

  group.expenses.push({
    id: uid("e"),
    description: els.expenseDescription.value.trim(),
    amount,
    payerId: els.expensePayer.value,
    splitMemberIds,
    createdAt: new Date().toISOString(),
  });

  clearExpenseForm(group);
  render();
});

els.currencySelect.addEventListener("change", async () => {
  const group = activeGroup();
  if (group.shareCode) {
    await rpc("update_group_currency", { p_share_code: group.shareCode, p_currency: els.currencySelect.value });
    return;
  }

  group.currency = els.currencySelect.value;
  render();
});

els.settleBtn.addEventListener("click", async () => {
  const group = activeGroup();
  if (group.shareCode) {
    await rpc("clear_shared_expenses", { p_share_code: group.shareCode });
    return;
  }

  group.expenses = [];
  render();
});

els.shareBtn.addEventListener("click", async () => {
  const group = activeGroup();
  if (!group.shareCode) {
    alert("Create a shared Supabase group first.");
    return;
  }

  await navigator.clipboard.writeText(window.location.href);
  setStatus("Group link copied");
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fairshare-backup.json";
  link.click();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.groups) || imported.groups.length === 0) throw new Error("Invalid data");
    state = normalizeState(imported);
    render();
  } catch {
    alert("That backup file could not be imported.");
  } finally {
    els.importInput.value = "";
  }
});

const initialShareCode = currentShareCode();
if (initialShareCode && supabaseClient) {
  loadSharedGroup(initialShareCode);
} else {
  render();
}
