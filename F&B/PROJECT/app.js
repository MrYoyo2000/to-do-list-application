
/* CONSTS */
const form = document.querySelector("#todoForm");
const input = document.querySelector("#todoInput");
const categorySelect = document.querySelector("#category");
const list = document.querySelector("#todoList");
const counter = document.querySelector("#counter");
const streakEl = document.querySelector("#streak");
const quoteEl = document.querySelector("#quote");
const footerYear = document.querySelector("#footerYear");
const clearDoneBtn = document.querySelector("#clearDone");

/* AI DOM (assist) */
const aiMode = document.querySelector("#aiMode");
const aiHint = document.querySelector("#aiHint");

/* AI DOM (command) */
const openAI = document.querySelector("#openAI");
const aiCommandBox = document.querySelector(".ai-command");
const aiInput = document.querySelector("#aiInput");
const aiSend = document.querySelector("#aiSend");

/* TIMER DOM */
const timerDisplay = document.querySelector("#timerDisplay");
const timerStart = document.querySelector("#timerStart");
const timerPause = document.querySelector("#timerPause");
const timerReset = document.querySelector("#timerReset");

/* CONFIG */
const STORAGE_KEY = "tfp_todos_v1";
const QUOTES = [
  "Discipline > Motivation",
  "Plan the trade. Trade the plan.",
  "Consistency beats intensity.",
  "Small wins, big results.",
];

/* API CONFIG (LOCAL DEV) */
const API_URL = "http://localhost:3000/api/chat";

/* STATE */
let todos = load();

/* HELPERS */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(cat) {
  const map = {
    study: "📚 Study",
    analysis: "📊 Analysis",
    trade: "💸 Trading",
    discipline: "🧘 Discipline",
  };
  return map[cat] || cat;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function clampMinutes(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 15;
  return Math.max(5, Math.min(180, Math.round(x)));
}

function normalizePriority(p) {
  const v = String(p || "").toLowerCase();
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  return "Low";
}

function normalizeCategory(c) {
  const v = String(c || "").toLowerCase();
  if (v === "analysis") return "analysis";
  if (v === "trade" || v === "trading") return "trade";
  if (v === "discipline") return "discipline";
  return "study";
}

/* AI ASSIST (local heuristic) */
function aiSuggest(rawText) {
  const text = (rawText || "").trim();
  const t = text.toLowerCase();

  const rules = [
    {
      category: "analysis",
      minutes: 120,
      priority: "high",
      keys: ["btc", "eth", "chart", "levels", "support", "resistance", "trend", "market", "news", "volume", "macro", "rsi", "ema"],
    },
    {
      category: "trade",
      minutes: 30,
      priority: "low",
      keys: ["entry", "exit", "stop", "sl", "tp", "risk", "position", "leverage", "order", "limit"],
    },
    {
      category: "study",
      minutes: 240,
      priority: "very high",
      keys: ["study", "learn", "revise", "js", "javascript", "course", "lesson", "exercise", "project", "homework", "read"],
    },
    {
      category: "discipline",
      minutes: 60,
      priority: "Medium",
      keys: ["workout", "gym", "run", "walk", "sleep", "meditate", "discipline", "routine", "stretch", "water"],
    },
  ];

  let best = null;
  let bestScore = 0;

  for (const r of rules) {
    const score = r.keys.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  const confidence = best ? Math.min(0.95, 0.35 + bestScore * 0.2) : 0.2;

  if (!best || bestScore === 0) {
    return { category: null, minutes: 15, priority: "Low", confidence };
  }

  return { category: best.category, minutes: best.minutes, priority: best.priority, confidence };
}

function aiUpdateHint(s) {
  if (!aiHint) return;
  if (!s) {
    aiHint.textContent = "";
    return;
  }
  // If we passed a string message (status), show it
  if (typeof s === "string") {
    aiHint.textContent = s;
    return;
  }

  const conf = Math.round((s.confidence || 0) * 100);
  const cat = s.category || "manual";
  aiHint.textContent = `AI: ${cat} • ${s.minutes}m • ${s.priority} (${conf}%)`;
}

/* SERVER AI CALL */
async function askServerAI(message) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt || "Server error");
  }

  const data = await r.json();
  return data.reply || "";
}

/* Try to parse JSON array of tasks from AI reply */
function tryParseTasks(reply) {
  if (!isNonEmptyString(reply)) return null;

  // Find first JSON array in reply (simple)
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  const slice = reply.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* Add tasks returned by AI */
function addTasksFromAI(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return 0;

  let added = 0;
  for (const item of tasks) {
    const text = item?.text ?? item?.task ?? item?.title;
    if (!isNonEmptyString(text)) continue;

    const category = normalizeCategory(item?.category);
    const minutes = clampMinutes(item?.minutes ?? 15);
    const priority = normalizePriority(item?.priority);

    addTodo(String(text), category, minutes, priority);
    added++;
  }
  return added;
}

/* STORAGE */
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function commit() {
  save();
  render();
}

/* STREAK */
function computeStreak() {
  const days = new Set(todos.filter(t => t.doneAt).map(t => t.doneAt));

  let d = new Date(todayStr());
  if (!days.has(todayStr())) d.setDate(d.getDate() - 1);

  let streak = 0;

  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

/* UI */
function setQuote() {
  const idx = new Date().getDate() % QUOTES.length;
  quoteEl.textContent = QUOTES[idx];
}

function updateStats() {
  const remaining = todos.filter(t => !t.done).length;
  counter.textContent = `${remaining} tasks remaining`;

  const streak = computeStreak();
  streakEl.textContent = `🔥 Streak: ${streak} day${streak === 1 ? "" : "s"}`;
}

function render() {
  list.innerHTML = "";

  todos.forEach(todo => {
    const li = document.createElement("li");
    if (todo.done) li.classList.add("done");

    const mins = todo.minutes ?? 15;
    const prio = todo.priority ?? "Low";

    li.innerHTML = `
      <label>
        <input type="checkbox"
          data-action="toggle"
          data-id="${todo.id}"
          ${todo.done ? "checked" : ""}>
        <span>${escapeHtml(todo.text)}</span>
      </label>

      <div class="right">
        <small class="tag">${categoryLabel(todo.category)} • ${mins}m • ${prio}</small>
        <button data-action="delete"
          data-id="${todo.id}" aria-label="Delete">✖</button>
      </div>
    `;

    list.appendChild(li);
  });

  setQuote();
  updateStats();
}

/* ACTIONS */
function addTodo(text, category, minutes = 15, priority = "Low") {
  if (!isNonEmptyString(text)) return;

  const todo = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    text: text.trim(),
    category: category || "study",
    minutes,
    priority,
    done: false,
    createdAt: todayStr(),
    doneAt: null,
  };

  todos.unshift(todo);
  commit();
}

function toggleTodo(id) {
  if (!Number.isFinite(id)) return;

  todos = todos.map(t => {
    if (t.id !== id) return t;

    const done = !t.done;
    return { ...t, done, doneAt: done ? todayStr() : null };
  });

  commit();
}

function deleteTodo(id) {
  if (!Number.isFinite(id)) return;

  todos = todos.filter(t => t.id !== id);
  commit();
}

function clearCompleted() {
  const before = todos.length;
  todos = todos.filter(t => !t.done);
  if (todos.length === before) return;
  commit();
}

/* EVENT HELPERS */
function getActionTarget(el) {
  return el.closest("[data-action]") || null;
}

function parseId(el) {
  const id = Number(el?.dataset?.id);
  return Number.isFinite(id) ? id : null;
}

/* TIMER */
let timerSeconds = 240 * 60;
let timerId = null;

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function renderTimer() {
  if (!timerDisplay) return;
  timerDisplay.textContent = formatTime(timerSeconds);
}

function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => {
    timerSeconds--;
    if (timerSeconds <= 0) {
      timerSeconds = 0;
      clearInterval(timerId);
      timerId = null;
      alert("⏱️ Time! Take a break.");
    }
    renderTimer();
  }, 1000);
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  timerSeconds = 240 * 60;
  renderTimer();
}

/* EVENTS */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!isNonEmptyString(text)) return;

  let cat = categorySelect.value;
  let minutes = 15;
  let priority = "Low";

  if (aiMode?.checked) {
    const s = aiSuggest(text);
    if (s.category && s.confidence >= 0.55) cat = s.category;
    minutes = s.minutes;
    priority = s.priority;
    aiUpdateHint(s);
  } else {
    aiUpdateHint(null);
  }

  addTodo(text, cat, minutes, priority);

  input.value = "";
  input.focus();
});

list.addEventListener("click", (e) => {
  const target = getActionTarget(e.target);
  if (!target) return;

  const id = parseId(target);
  if (id === null) return;

  if (target.dataset.action === "delete") {
    deleteTodo(id);
  }
});

list.addEventListener("change", (e) => {
  const cb = e.target;

  if (!(cb instanceof HTMLInputElement)) return;
  if (cb.type !== "checkbox") return;
  if (cb.dataset.action !== "toggle") return;

  const id = parseId(cb);
  if (id === null) return;

  toggleTodo(id);
});

/* Open/close AI command UI */
openAI?.addEventListener("click", () => {
  if (!aiCommandBox) return;

  const willOpen = aiCommandBox.hasAttribute("hidden");
  if (willOpen) aiCommandBox.removeAttribute("hidden");
  else aiCommandBox.setAttribute("hidden", "");

  if (willOpen) aiInput?.focus();
});

/* Send AI command (SERVER) */
aiSend?.addEventListener("click", async () => {
  const msg = aiInput?.value?.trim() || "";
  if (!msg) return;

  aiUpdateHint("🤖 Thinking...");

  try {
    const reply = await askServerAI(msg);

    // If AI returns JSON list of tasks -> add them
    const tasks = tryParseTasks(reply);
    if (tasks) {
      const added = addTasksFromAI(tasks);
      aiUpdateHint(added > 0 ? `✅ Added ${added} task(s).` : "ℹ️ No tasks detected.");
    } else {
      // Otherwise just show text reply
      aiUpdateHint(reply);
    }
  } catch (e) {
    aiUpdateHint("❌ AI error (server/KEY not ready?)");
    console.error(e);
  }

  aiInput.value = "";
});

/* Enter key = send */
aiInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    aiSend?.click();
  }
});

/* Timer events */
timerStart?.addEventListener("click", startTimer);
timerPause?.addEventListener("click", pauseTimer);
timerReset?.addEventListener("click", resetTimer);

/* INIT */
render();
renderTimer();

/* FOOTER */

if (footerYear) {
  footerYear.textContent = `© ${new Date().getFullYear()} create by yossef benamu  `;
}

clearDoneBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  todos = todos.filter(t => !t.done);
  commit();
});