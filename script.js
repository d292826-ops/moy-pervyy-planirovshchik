"use strict";

/* CONFIG */
const CONFIG = Object.freeze({
  storageKey: "successfulCareerApp",
  schemaVersion: 1,
  undoWindowMs: 5000,
  maxCareerLevel: 10,
  maxMonthlyLevelGains: 2,
  levelThresholdUnits: Object.freeze({
    1: 2400,
    2: 3300,
    3: 4200,
    4: 5400,
    5: 6900,
    6: 8700,
    7: 10800,
    8: 13200,
    9: 16200,
  }),
  spheres: Object.freeze({
    ambitions: { defaultLabel: "Амбиции", color: "#7c3aed" },
    development: { defaultLabel: "Развитие", color: "#2563eb" },
    colleagues: { defaultLabel: "Коллеги", color: "#0f766e" },
    money: { defaultLabel: "Деньги", color: "#15803d" },
    joy: { defaultLabel: "Радость", color: "#d97706" },
  }),
  statuses: Object.freeze({
    in_progress: "В работе",
    completed: "Выполнено",
    overdue: "Просрочено",
  }),
  importance: Object.freeze({
    low: "Низкая важность",
    normal: "Обычная важность",
    high: "Высокая важность",
  }),
});

/* DateUtils */
const DateUtils = {
  todayISO(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  },

  fromISO(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  },

  addDays(value, amount) {
    const date = this.fromISO(value);
    date.setDate(date.getDate() + amount);
    return this.todayISO(date);
  },

  startOfWeek(value) {
    const date = this.fromISO(value);
    const dayFromMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayFromMonday);
    return this.todayISO(date);
  },

  monthKey(value) {
    return value.slice(0, 7);
  },

  addMonths(monthKey, amount) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 1 + amount, 1, 12);
    return this.todayISO(date).slice(0, 7);
  },

  monthGridStart(monthKey) {
    return this.startOfWeek(`${monthKey}-01`);
  },

  compare(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
  },

  formatFull(value) {
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(this.fromISO(value));
  },

  formatHeading(value) {
    const today = this.todayISO();
    if (value === today) return "Сегодня";
    if (value === this.addDays(today, 1)) return "Завтра";
    if (value === this.addDays(today, -1)) return "Вчера";
    const formatted = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(
      this.fromISO(value),
    );
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  },

  formatMonth(monthKey) {
    const value = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(this.fromISO(`${monthKey}-01`));
    return value.charAt(0).toUpperCase() + value.slice(1);
  },

  formatCompact(value) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
    }).format(this.fromISO(value));
  },

  nowISO() {
    return new Date().toISOString();
  },
};

/* Units */
const Units = {
  fromPoints(points) {
    return Number(points) * 60;
  },

  taskLabel(units) {
    return units === 120 ? "2 очка" : "1 очко";
  },
};

/* Storage */
const Storage = {
  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },

  createCareerState() {
    return Object.fromEntries(
      Object.keys(CONFIG.spheres).map((sphereId) => [
        sphereId,
        {
          level: 1,
          progressUnits: 0,
          levelsGainedMonthKey: DateUtils.todayISO().slice(0, 7),
          levelsGainedThisMonth: 0,
          lastPositiveActivityMonth: null,
          lastPositiveActivityAt: null,
          lastDecayAppliedForMonth: null,
          lifetimeEarnedUnits: 0,
        },
      ]),
    );
  },

  createDefaultState() {
    const now = DateUtils.nowISO();
    return {
      schemaVersion: CONFIG.schemaVersion,
      meta: {
        createdAt: now,
        updatedAt: now,
        lastSyncAt: now,
      },
      settings: {
        sortMode: "time",
        collapsedSections: {
          in_progress: false,
          completed: true,
          overdue: true,
        },
        sphereNames: Object.fromEntries(
          Object.entries(CONFIG.spheres).map(([sphereId, sphere]) => [
            sphereId,
            sphere.defaultLabel,
          ]),
        ),
        dismissedRecommendationDate: null,
      },
      tasks: [],
      completionRecords: [],
      dailySummaries: [],
      careerState: this.createCareerState(),
      careerEvents: [],
      monthlyArchives: [],
    };
  },

  isValidTask(task) {
    return Boolean(
      task &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        task.title.length <= 120 &&
        typeof task.description === "string" &&
        task.description.length <= 2000 &&
        DateUtils.isValidISODate(task.scheduledDate) &&
        Object.hasOwn(CONFIG.statuses, task.status) &&
        Object.hasOwn(CONFIG.importance, task.importance) &&
        (task.taskUnits === 60 || task.taskUnits === 120) &&
        Array.isArray(task.spheres) &&
        task.spheres.length >= 1 &&
        task.spheres.every((sphereId) => Object.hasOwn(CONFIG.spheres, sphereId)),
    );
  },

  validateRoot(value) {
    return Boolean(
      value &&
        value.schemaVersion === CONFIG.schemaVersion &&
        value.meta &&
        typeof value.meta.createdAt === "string" &&
        value.settings &&
        Array.isArray(value.tasks) &&
        value.tasks.every((task) => this.isValidTask(task)) &&
        Array.isArray(value.completionRecords) &&
        Array.isArray(value.dailySummaries) &&
        value.careerState &&
        Array.isArray(value.careerEvents) &&
        Array.isArray(value.monthlyArchives),
    );
  },

  normalizeState(value) {
    const defaults = this.createDefaultState().settings;
    if (!value.settings || typeof value.settings !== "object") value.settings = {};
    if (!['time', 'importance'].includes(value.settings.sortMode)) {
      value.settings.sortMode = defaults.sortMode;
    }
    if (!value.settings.collapsedSections || typeof value.settings.collapsedSections !== "object") {
      value.settings.collapsedSections = {};
    }
    for (const status of Object.keys(CONFIG.statuses)) {
      if (typeof value.settings.collapsedSections[status] !== "boolean") {
        value.settings.collapsedSections[status] = defaults.collapsedSections[status];
      }
    }
    if (!value.settings.sphereNames || typeof value.settings.sphereNames !== "object") {
      value.settings.sphereNames = {};
    }
    for (const [sphereId, sphere] of Object.entries(CONFIG.spheres)) {
      const candidate = value.settings.sphereNames[sphereId];
      value.settings.sphereNames[sphereId] =
        typeof candidate === "string" && candidate.trim() && candidate.trim().length <= 40
          ? candidate.trim()
          : sphere.defaultLabel;
    }
    return value;
  },

  load() {
    let raw;
    try {
      raw = localStorage.getItem(CONFIG.storageKey);
    } catch (error) {
      return {
        state: this.createDefaultState(),
        readOnly: true,
        error: "Браузер не разрешил прочитать локальные данные. Изменения временно недоступны.",
      };
    }
    if (raw === null) {
      const initialState = this.createDefaultState();
      try {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(initialState));
        return { state: initialState, readOnly: false, error: null };
      } catch (error) {
        return {
          state: initialState,
          readOnly: true,
          error: "Браузер не разрешил сохранить данные. Изменения временно недоступны.",
        };
      }
    }

    try {
      const parsed = JSON.parse(raw);
      if (!this.validateRoot(parsed)) throw new Error("invalid-root");
      return { state: this.normalizeState(parsed), readOnly: false, error: null };
    } catch (error) {
      return {
        state: this.createDefaultState(),
        readOnly: true,
        error: "Локальные данные повреждены. Они не перезаписаны; работа с задачами заблокирована.",
      };
    }
  },

  commit(currentState, mutator) {
    const nextState = this.clone(currentState);
    mutator(nextState);
    nextState.meta.updatedAt = DateUtils.nowISO();

    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(nextState));
      return { ok: true, state: nextState, error: null };
    } catch (error) {
      return {
        ok: false,
        state: currentState,
        error: "Не удалось сохранить изменение. Предыдущее состояние восстановлено.",
      };
    }
  },
};

/* Career */
const Career = {
  getLevel(state, sphereId) {
    return state.careerState[sphereId]?.level ?? 1;
  },

  getLabel(state, sphereId) {
    return state.settings.sphereNames[sphereId] ?? CONFIG.spheres[sphereId].defaultLabel;
  },

  getProgressBasisPoints(state, sphereId) {
    const sphereState = state.careerState[sphereId];
    if (!sphereState || sphereState.level >= CONFIG.maxCareerLevel) return 10000;
    const threshold = CONFIG.levelThresholdUnits[sphereState.level];
    return Math.min(10000, Math.floor((sphereState.progressUnits * 10000) / threshold));
  },

  allocateTaskUnits(task) {
    const unitsPerSphere = task.taskUnits / task.spheres.length;
    return Object.fromEntries(task.spheres.map((sphereId) => [sphereId, unitsPerSphere]));
  },

  syncMonthlyCounter(sphereState, monthKey) {
    if (sphereState.levelsGainedMonthKey === monthKey) return;
    sphereState.levelsGainedMonthKey = monthKey;
    sphereState.levelsGainedThisMonth = 0;
  },

  addEvent(state, event) {
    state.careerEvents.push({ id: Tasks.createId(), ...event });
    if (state.careerEvents.length > 200) {
      state.careerEvents = state.careerEvents.slice(-200);
    }
  },

  applyTaskCompletion(state, task) {
    if (
      !task.recurrence &&
      state.completionRecords.some((record) => record.taskId === task.id)
    ) {
      return false;
    }
    const completedAt = task.completedAt ?? DateUtils.nowISO();
    const activityDate = DateUtils.todayISO();
    const monthKey = DateUtils.monthKey(activityDate);
    const allocatedUnitsBySphere = this.allocateTaskUnits(task);
    const appliedGrowthUnitsBySphere = {};

    for (const sphereId of task.spheres) {
      const sphereState = state.careerState[sphereId];
      const allocatedUnits = allocatedUnitsBySphere[sphereId];
      this.syncMonthlyCounter(sphereState, monthKey);
      sphereState.lifetimeEarnedUnits += allocatedUnits;
      sphereState.lastPositiveActivityMonth = monthKey;
      sphereState.lastPositiveActivityAt = completedAt;

      let appliedUnits = 0;
      if (sphereState.level < CONFIG.maxCareerLevel) {
        sphereState.progressUnits += allocatedUnits;
        appliedUnits = allocatedUnits;

        while (
          sphereState.level < CONFIG.maxCareerLevel &&
          sphereState.levelsGainedThisMonth < CONFIG.maxMonthlyLevelGains
        ) {
          const threshold = CONFIG.levelThresholdUnits[sphereState.level];
          if (sphereState.progressUnits < threshold) break;
          const fromLevel = sphereState.level;
          sphereState.progressUnits -= threshold;
          sphereState.level += 1;
          sphereState.levelsGainedThisMonth += 1;
          this.addEvent(state, {
            sphereId,
            type: "level_up",
            fromLevel,
            toLevel: sphereState.level,
            at: completedAt,
            taskId: task.id,
          });
        }

        if (sphereState.level === CONFIG.maxCareerLevel && sphereState.progressUnits > 0) {
          appliedUnits -= sphereState.progressUnits;
          sphereState.progressUnits = 0;
        }
      }
      appliedGrowthUnitsBySphere[sphereId] = Math.max(0, appliedUnits);
    }

    state.completionRecords.push({
      id: Tasks.createId(),
      taskId: task.id,
      titleSnapshot: task.title,
      descriptionSnapshot: task.description,
      scheduledDate: task.scheduledDate,
      completedAt,
      spheres: [...task.spheres],
      taskUnits: task.taskUnits,
      allocatedUnitsBySphere,
      appliedGrowthUnitsBySphere,
      importanceSnapshot: task.importance,
    });
    return true;
  },

  revertTaskCompletion(state, task) {
    let recordIndex = -1;
    for (let index = state.completionRecords.length - 1; index >= 0; index -= 1) {
      if (state.completionRecords[index].taskId === task.id) {
        recordIndex = index;
        break;
      }
    }
    if (recordIndex < 0) return false;
    const record = state.completionRecords[recordIndex];

    for (const sphereId of record.spheres) {
      const sphereState = state.careerState[sphereId];
      const allocatedUnits = record.allocatedUnitsBySphere[sphereId] ?? 0;
      let unitsToRemove = record.appliedGrowthUnitsBySphere[sphereId] ?? 0;
      sphereState.lifetimeEarnedUnits = Math.max(
        0,
        sphereState.lifetimeEarnedUnits - allocatedUnits,
      );

      while (unitsToRemove > 0) {
        if (sphereState.progressUnits >= unitsToRemove) {
          sphereState.progressUnits -= unitsToRemove;
          unitsToRemove = 0;
        } else {
          unitsToRemove -= sphereState.progressUnits;
          sphereState.progressUnits = 0;
          if (sphereState.level <= 1) {
            unitsToRemove = 0;
            break;
          }
          const fromLevel = sphereState.level;
          sphereState.level -= 1;
          sphereState.progressUnits = CONFIG.levelThresholdUnits[sphereState.level];
          this.addEvent(state, {
            sphereId,
            type: "completion_reverted",
            fromLevel,
            toLevel: sphereState.level,
            at: DateUtils.nowISO(),
            taskId: task.id,
          });
        }
      }
    }

    state.completionRecords.splice(recordIndex, 1);
    return true;
  },

  backfillCompletedTasks(state) {
    let changed = false;
    for (const task of state.tasks) {
      if (task.deletedAt || task.status !== "completed") continue;
      changed = this.applyTaskCompletion(state, task) || changed;
    }
    return changed;
  },
};

/* Recurrence: повторения будут добавлены на третьем этапе. */
const Recurrence = {};

/* Tasks */
const Tasks = {
  createId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint32Array(4);
    globalThis.crypto?.getRandomValues?.(bytes);
    const randomPart = Array.from(bytes, (value) => value.toString(16)).join("");
    return `${Date.now().toString(16)}-${randomPart || Math.random().toString(16).slice(2)}`;
  },

  active(state) {
    return state.tasks.filter((task) => !task.deletedAt);
  },

  byId(state, taskId) {
    return state.tasks.find((task) => task.id === taskId) ?? null;
  },

  importanceRank(importance) {
    return { high: 0, normal: 1, low: 2 }[importance] ?? 3;
  },

  sort(items, mode) {
    const timeValue = (task) => task.scheduledTime ?? "99:99";
    return [...items].sort((left, right) => {
      if (mode === "importance") {
        const importanceDifference =
          this.importanceRank(left.importance) - this.importanceRank(right.importance);
        if (importanceDifference) return importanceDifference;
        const timeDifference = timeValue(left).localeCompare(timeValue(right));
        if (timeDifference) return timeDifference;
      } else {
        const timeDifference = timeValue(left).localeCompare(timeValue(right));
        if (timeDifference) return timeDifference;
        const importanceDifference =
          this.importanceRank(left.importance) - this.importanceRank(right.importance);
        if (importanceDifference) return importanceDifference;
      }
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    });
  },

  matchesFilters(task, filters) {
    if (filters.statuses.length && !filters.statuses.includes(task.status)) return false;
    if (filters.spheres.length && !task.spheres.some((id) => filters.spheres.includes(id))) {
      return false;
    }
    if (filters.importance.length && !filters.importance.includes(task.importance)) return false;
    return true;
  },

  matchesSearch(task, query) {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalizedQuery) return true;
    return `${task.title}\n${task.description}`
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedQuery);
  },

  countsByStatus(items) {
    const counts = { in_progress: 0, completed: 0, overdue: 0 };
    for (const task of items) counts[task.status] += 1;
    return counts;
  },

  normalizeOverdue(state) {
    const today = DateUtils.todayISO();
    let changed = false;
    for (const task of state.tasks) {
      if (!task.deletedAt && task.status === "in_progress" && task.scheduledDate < today) {
        task.status = "overdue";
        task.updatedAt = DateUtils.nowISO();
        changed = true;
      }
    }
    return changed;
  },

  purgeExpiredDeletes(state) {
    const now = Date.now();
    const originalLength = state.tasks.length;
    for (const task of state.tasks) {
      if (
        task.deletedAt &&
        task.undoUntil &&
        Date.parse(task.undoUntil) <= now &&
        task.status === "completed"
      ) {
        Career.revertTaskCompletion(state, task);
      }
    }
    state.tasks = state.tasks.filter(
      (task) => !task.deletedAt || !task.undoUntil || Date.parse(task.undoUntil) > now,
    );
    return state.tasks.length !== originalLength;
  },
};

/* Streaks, Maintenance, Notifications и Backup появятся на следующих этапах. */
const Streaks = {};
const Maintenance = {};
const Notifications = {};
const Backup = {};

/* UI */
const UI = {
  elements: {},
  initialFormSignature: "",

  cacheElements() {
    this.elements = {
      addButtons: [
        document.querySelector("#add-task-button"),
        document.querySelector("#add-task-secondary"),
      ],
      storageAlert: document.querySelector("#storage-alert"),
      todayLabel: document.querySelector("#today-label"),
      selectedDateTitle: document.querySelector("#selected-date-title"),
      selectedDateFull: document.querySelector("#selected-date-full"),
      selectedDateInput: document.querySelector("#selected-date-input"),
      previousDayButton: document.querySelector("#previous-day-button"),
      nextDayButton: document.querySelector("#next-day-button"),
      todayButton: document.querySelector("#today-button"),
      dayTaskCount: document.querySelector("#day-task-count"),
      dayCompletedCount: document.querySelector("#day-completed-count"),
      taskGroups: document.querySelector("#task-groups"),
      careerWheel: document.querySelector("#career-wheel"),
      careerList: document.querySelector("#career-list"),
      dialog: document.querySelector("#task-dialog"),
      dialogTitle: document.querySelector("#task-dialog-title"),
      form: document.querySelector("#task-form"),
      taskId: document.querySelector("#task-id"),
      title: document.querySelector("#task-title"),
      description: document.querySelector("#task-description"),
      date: document.querySelector("#task-date"),
      time: document.querySelector("#task-time"),
      status: document.querySelector("#task-status"),
      pastStatusField: document.querySelector("#past-status-field"),
      importance: document.querySelector("#task-importance"),
      sphereOptions: document.querySelector("#sphere-options"),
      sphereFieldset: document.querySelector(".sphere-fieldset"),
      deleteButton: document.querySelector("#delete-task-button"),
      closeButton: document.querySelector("#close-dialog-button"),
      cancelButton: document.querySelector("#cancel-dialog-button"),
      titleError: document.querySelector("#task-title-error"),
      descriptionError: document.querySelector("#task-description-error"),
      dateError: document.querySelector("#task-date-error"),
      spheresError: document.querySelector("#task-spheres-error"),
      formErrorSummary: document.querySelector("#form-error-summary"),
      titleCounter: document.querySelector("#task-title-counter"),
      descriptionCounter: document.querySelector("#task-description-counter"),
      toastRegion: document.querySelector("#toast-region"),
    };
  },

  buildSphereControls() {
    const options = document.createDocumentFragment();
    const cards = document.createDocumentFragment();

    for (const [sphereId, sphere] of Object.entries(CONFIG.spheres)) {
      const label = document.createElement("label");
      label.className = "sphere-option";
      label.style.setProperty("--sphere-color", sphere.color);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "spheres";
      input.value = sphereId;

      const labelText = document.createElement("span");
      labelText.textContent = Career.getLabel(App.state, sphereId);
      label.append(input, labelText);
      options.append(label);

      const card = document.createElement("article");
      card.className = "career-card";
      card.style.setProperty("--sphere-color", sphere.color);

      const color = document.createElement("span");
      color.className = "career-card__color";
      color.setAttribute("aria-hidden", "true");

      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = Career.getLabel(App.state, sphereId);
      const hint = document.createElement("small");
      hint.textContent = "Готова к развитию";
      copy.append(name, hint);

      const level = document.createElement("span");
      level.className = "career-card__level";
      level.textContent = String(Career.getLevel(App.state, sphereId));
      level.setAttribute("aria-label", `Уровень ${level.textContent}`);

      card.append(color, copy, level);
      cards.append(card);
    }

    this.elements.sphereOptions.replaceChildren(options);
    this.elements.careerList.replaceChildren(cards);
  },

  bindEvents() {
    for (const button of this.elements.addButtons) {
      button.addEventListener("click", () => this.openTaskDialog());
    }

    this.elements.selectedDateInput.addEventListener("change", (event) => {
      if (!DateUtils.isValidISODate(event.target.value)) return;
      App.selectedDate = event.target.value;
      this.render();
    });

    this.elements.previousDayButton.addEventListener("click", () => {
      App.selectedDate = DateUtils.addDays(App.selectedDate, -1);
      this.render();
    });

    this.elements.nextDayButton.addEventListener("click", () => {
      App.selectedDate = DateUtils.addDays(App.selectedDate, 1);
      this.render();
    });

    this.elements.todayButton.addEventListener("click", () => {
      App.selectedDate = DateUtils.todayISO();
      this.render();
    });

    this.elements.taskGroups.addEventListener("click", (event) => {
      const header = event.target.closest(".task-group__header");
      if (header) {
        const group = header.closest(".task-group");
        const collapsed = group.dataset.collapsed === "true";
        group.dataset.collapsed = String(!collapsed);
        header.setAttribute("aria-expanded", String(collapsed));
        return;
      }

      const action = event.target.closest("[data-task-action]");
      if (!action) return;
      const taskId = action.dataset.taskId;
      if (action.dataset.taskAction === "edit") this.openTaskDialog(taskId);
      if (action.dataset.taskAction === "toggle") App.toggleTask(taskId);
      if (action.dataset.taskAction === "delete") App.softDeleteTask(taskId);
    });

    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitTaskForm();
    });

    this.elements.title.addEventListener("input", () => this.updateCounters());
    this.elements.description.addEventListener("input", () => this.updateCounters());
    this.elements.date.addEventListener("change", () => this.updatePastStatusField());

    this.elements.closeButton.addEventListener("click", () => this.requestCloseDialog());
    this.elements.cancelButton.addEventListener("click", () => this.requestCloseDialog());
    this.elements.deleteButton.addEventListener("click", () => {
      const taskId = this.elements.taskId.value;
      if (!taskId) return;
      this.closeDialog(true);
      App.softDeleteTask(taskId);
    });

    this.elements.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.requestCloseDialog();
    });
  },

  setReadOnly(message) {
    this.elements.storageAlert.hidden = false;
    this.elements.storageAlert.textContent = message;
    for (const button of this.elements.addButtons) button.disabled = true;
  },

  render() {
    this.renderDate();
    this.renderTasks();
  },

  renderDate() {
    const today = DateUtils.todayISO();
    this.elements.todayLabel.textContent = DateUtils.formatFull(today);
    this.elements.selectedDateTitle.textContent = DateUtils.formatHeading(App.selectedDate);
    this.elements.selectedDateFull.textContent = DateUtils.formatFull(App.selectedDate);
    this.elements.selectedDateInput.value = App.selectedDate;
    this.elements.todayButton.hidden = App.selectedDate === today;
  },

  renderTasks() {
    const tasks = Tasks.active(App.state)
      .filter((task) => task.scheduledDate === App.selectedDate)
      .sort((left, right) => {
        if (left.scheduledTime && right.scheduledTime) {
          return left.scheduledTime.localeCompare(right.scheduledTime);
        }
        if (left.scheduledTime) return -1;
        if (right.scheduledTime) return 1;
        return left.createdAt.localeCompare(right.createdAt);
      });

    this.elements.dayTaskCount.textContent = String(tasks.length);
    this.elements.dayCompletedCount.textContent = String(
      tasks.filter((task) => task.status === "completed").length,
    );

    for (const group of this.elements.taskGroups.querySelectorAll(".task-group")) {
      const status = group.dataset.status;
      const statusTasks = tasks.filter((task) => task.status === status);
      const list = group.querySelector("[data-list]");
      group.querySelector("[data-count]").textContent = String(statusTasks.length);

      if (statusTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-group";
        empty.textContent =
          status === "in_progress"
            ? "Здесь появятся задачи на выбранный день."
            : status === "completed"
              ? "Выполненных задач пока нет."
              : "Просроченных задач нет.";
        list.replaceChildren(empty);
        continue;
      }

      list.replaceChildren(...statusTasks.map((task) => this.createTaskCard(task)));
    }
  },

  createTaskCard(task) {
    const card = document.createElement("article");
    card.className = `task-card task-card--${task.status}`;
    card.dataset.taskId = task.id;

    const top = document.createElement("div");
    top.className = "task-card__top";
    const topLeft = document.createElement("div");
    topLeft.className = "task-card__chips";

    const time = document.createElement("span");
    time.className = "task-time";
    time.textContent = task.scheduledTime || "Без времени";

    const status = document.createElement("span");
    status.className = `task-status task-status--${task.status}`;
    status.textContent = CONFIG.statuses[task.status];

    const importance = document.createElement("span");
    importance.className = "task-importance";
    importance.textContent = CONFIG.importance[task.importance];
    topLeft.append(time, status, importance);

    const points = document.createElement("span");
    points.className = "task-points";
    points.textContent = Units.taskLabel(task.taskUnits);
    top.append(topLeft, points);

    const title = document.createElement("h3");
    title.textContent = task.title;
    card.append(top, title);

    if (task.description) {
      const description = document.createElement("p");
      description.className = "task-card__description";
      description.textContent = task.description;
      card.append(description);
    }

    const footer = document.createElement("div");
    footer.className = "task-card__footer";
    const spheres = document.createElement("div");
    spheres.className = "task-card__chips";
    for (const sphereId of task.spheres) {
      const chip = document.createElement("span");
      chip.className = "sphere-chip";
      chip.style.setProperty("--sphere-color", CONFIG.spheres[sphereId].color);
      chip.textContent = Career.getLabel(App.state, sphereId);
      spheres.append(chip);
    }

    const actions = document.createElement("div");
    actions.className = "task-card__actions";
    const toggle = this.createCardAction(
      task.status === "completed" ? "Вернуть" : "Выполнить",
      "toggle",
      task.id,
      task.status === "completed" ? "" : "card-action--complete",
    );
    const edit = this.createCardAction("Изменить", "edit", task.id);
    const remove = this.createCardAction("Удалить", "delete", task.id);
    actions.append(toggle, edit, remove);
    footer.append(spheres, actions);
    card.append(footer);

    return card;
  },

  createCardAction(label, action, taskId, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card-action ${extraClass}`.trim();
    button.dataset.taskAction = action;
    button.dataset.taskId = taskId;
    button.textContent = label;
    return button;
  },

  openTaskDialog(taskId = null) {
    if (App.readOnly) return;
    this.returnFocusElement = document.activeElement;
    this.clearErrors();
    this.elements.form.reset();
    this.elements.taskId.value = "";
    this.elements.date.value = App.selectedDate;
    this.elements.importance.value = "normal";
    this.elements.status.value = "overdue";
    this.elements.form.querySelector('input[name="points"][value="1"]').checked = true;
    this.elements.dialogTitle.textContent = "Добавить задачу";
    this.elements.deleteButton.hidden = true;

    if (taskId) {
      const task = Tasks.byId(App.state, taskId);
      if (!task || task.deletedAt) return;
      this.elements.taskId.value = task.id;
      this.elements.title.value = task.title;
      this.elements.description.value = task.description;
      this.elements.date.value = task.scheduledDate;
      this.elements.time.value = task.scheduledTime || "";
      this.elements.importance.value = task.importance;
      this.elements.status.value = task.status === "completed" ? "completed" : "overdue";
      this.elements.form.querySelector(
        `input[name="points"][value="${task.taskUnits / 60}"]`,
      ).checked = true;
      for (const checkbox of this.elements.form.querySelectorAll('input[name="spheres"]')) {
        checkbox.checked = task.spheres.includes(checkbox.value);
      }
      this.elements.dialogTitle.textContent = "Изменить задачу";
      this.elements.deleteButton.hidden = false;
    }

    this.updateCounters();
    this.updatePastStatusField();
    this.initialFormSignature = this.formSignature();
    this.elements.dialog.showModal();
    this.elements.title.focus();
  },

  updatePastStatusField() {
    const isNewTask = !this.elements.taskId.value;
    const isPastDate =
      DateUtils.isValidISODate(this.elements.date.value) &&
      this.elements.date.value < DateUtils.todayISO();
    this.elements.pastStatusField.hidden = !(isNewTask && isPastDate);
  },

  updateCounters() {
    this.elements.titleCounter.textContent = `${this.elements.title.value.length} / 120`;
    this.elements.descriptionCounter.textContent = `${this.elements.description.value.length} / 2000`;
  },

  formSignature() {
    const data = new FormData(this.elements.form);
    const entries = Array.from(data.entries()).sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify(entries);
  },

  requestCloseDialog() {
    if (this.formSignature() !== this.initialFormSignature) {
      const shouldClose = window.confirm("Закрыть форму без сохранения изменений?");
      if (!shouldClose) return;
    }
    this.closeDialog(true);
  },

  closeDialog(force = false) {
    if (!force && this.formSignature() !== this.initialFormSignature) return;
    this.elements.dialog.close();
    this.clearErrors();
    const returnTarget = this.returnFocusElement;
    this.returnFocusElement = null;
    if (returnTarget?.isConnected) window.requestAnimationFrame(() => returnTarget.focus());
  },

  clearErrors() {
    this.elements.titleError.textContent = "";
    this.elements.descriptionError.textContent = "";
    this.elements.dateError.textContent = "";
    this.elements.spheresError.textContent = "";
    this.elements.formErrorSummary.textContent = "";
    this.elements.title.removeAttribute("aria-invalid");
    this.elements.description.removeAttribute("aria-invalid");
    this.elements.date.removeAttribute("aria-invalid");
    this.elements.sphereFieldset.removeAttribute("data-invalid");
  },

  validateTaskForm() {
    this.clearErrors();
    const title = this.elements.title.value.trim();
    const description = this.elements.description.value.trim();
    const scheduledDate = this.elements.date.value;
    const spheres = Array.from(
      this.elements.form.querySelectorAll('input[name="spheres"]:checked'),
      (input) => input.value,
    );
    let firstInvalid = null;

    if (!title || title.length > 120) {
      this.elements.titleError.textContent = title ? "Не больше 120 символов." : "Введите название.";
      this.elements.title.setAttribute("aria-invalid", "true");
      firstInvalid ??= this.elements.title;
    }

    if (description.length > 2000) {
      this.elements.descriptionError.textContent = "Не больше 2000 символов.";
      this.elements.description.setAttribute("aria-invalid", "true");
      firstInvalid ??= this.elements.description;
    }

    if (!DateUtils.isValidISODate(scheduledDate)) {
      this.elements.dateError.textContent = "Выберите корректную дату.";
      this.elements.date.setAttribute("aria-invalid", "true");
      firstInvalid ??= this.elements.date;
    }

    if (spheres.length === 0) {
      this.elements.spheresError.textContent = "Выберите минимум одну сферу.";
      this.elements.sphereFieldset.dataset.invalid = "true";
      firstInvalid ??= this.elements.sphereOptions.querySelector("input");
    }

    if (firstInvalid) {
      this.elements.formErrorSummary.textContent = "Проверьте обязательные поля формы.";
      firstInvalid.focus();
      return null;
    }

    const taskId = this.elements.taskId.value;
    const existingTask = taskId ? Tasks.byId(App.state, taskId) : null;
    let status;
    if (!existingTask) {
      status = scheduledDate < DateUtils.todayISO() ? this.elements.status.value : "in_progress";
    } else if (existingTask.status === "completed") {
      status = "completed";
    } else {
      status = scheduledDate < DateUtils.todayISO() ? "overdue" : "in_progress";
    }

    return {
      id: taskId || Tasks.createId(),
      title,
      description,
      scheduledDate,
      scheduledTime: this.elements.time.value || null,
      reminderAt: existingTask?.reminderAt ?? null,
      reminderState: existingTask?.reminderState ?? null,
      spheres,
      importance: this.elements.importance.value,
      taskUnits: Units.fromPoints(
        this.elements.form.querySelector('input[name="points"]:checked').value,
      ),
      status,
      recurrence: existingTask?.recurrence ?? null,
      originalScheduledDate: existingTask?.originalScheduledDate ?? null,
      transferCount: existingTask?.transferCount ?? 0,
      lastRescheduledAt: existingTask?.lastRescheduledAt ?? null,
      createdAt: existingTask?.createdAt ?? DateUtils.nowISO(),
      updatedAt: DateUtils.nowISO(),
      completedAt:
        status === "completed" ? (existingTask?.completedAt ?? DateUtils.nowISO()) : null,
      deletedAt: null,
      undoUntil: null,
    };
  },

  submitTaskForm() {
    const taskData = this.validateTaskForm();
    if (!taskData) return;

    const existingTask = Tasks.byId(App.state, taskData.id);
    const scoringChanged = Boolean(
      existingTask &&
        (existingTask.scheduledDate !== taskData.scheduledDate ||
          existingTask.taskUnits !== taskData.taskUnits ||
          existingTask.spheres.join("|") !== taskData.spheres.join("|")),
    );
    if (existingTask?.status === "completed") {
      if (
        scoringChanged &&
        !window.confirm("Изменение повлияет на будущий расчёт статистики. Продолжить?")
      ) {
        return;
      }
    }

    const saved = App.commit((state) => {
      const index = state.tasks.findIndex((task) => task.id === taskData.id);
      const currentTask = index >= 0 ? state.tasks[index] : null;
      if (currentTask?.status === "completed" && scoringChanged) {
        Career.revertTaskCompletion(state, currentTask);
      }
      if (index >= 0) state.tasks[index] = taskData;
      else state.tasks.push(taskData);
      if (
        taskData.status === "completed" &&
        (!currentTask || scoringChanged || !state.completionRecords.some((record) => record.taskId === taskData.id))
      ) {
        Career.applyTaskCompletion(state, taskData);
      }
    });

    if (!saved) return;
    App.selectedDate = taskData.scheduledDate;
    App.visibleMonth = DateUtils.monthKey(taskData.scheduledDate);
    this.initialFormSignature = this.formSignature();
    this.closeDialog(true);
    this.buildSphereControls();
    this.render();
    this.showToast(existingTask ? "Задача обновлена." : "Задача добавлена.");
  },

  showToast(message, options = {}) {
    const toast = document.createElement("div");
    toast.className = `toast ${options.error ? "toast--error" : ""}`.trim();
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(text);

    if (options.actionLabel && options.onAction) {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = options.actionLabel;
      action.addEventListener("click", () => {
        options.onAction();
        toast.remove();
      });
      toast.append(action);
    }

    this.elements.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), options.duration ?? 3600);
    return toast;
  },
};

/* Расширение интерфейса этапа 2: календарь, поиск, фильтры и настройки. */
const stageOneCacheElements = UI.cacheElements;

Object.assign(UI, {
  initialSettingsSignature: "",
  initialFiltersSignature: "",
  returnFocusElement: null,

  cacheElements() {
    stageOneCacheElements.call(this);
    Object.assign(this.elements, {
      settingsButton: document.querySelector("#settings-button"),
      previousMonthButton: document.querySelector("#previous-month-button"),
      nextMonthButton: document.querySelector("#next-month-button"),
      monthTitle: document.querySelector("#month-overview-title"),
      monthGrid: document.querySelector("#month-grid"),
      monthSummary: document.querySelector("#month-summary"),
      previousWeekButton: document.querySelector("#previous-week-button"),
      nextWeekButton: document.querySelector("#next-week-button"),
      weekStrip: document.querySelector("#week-strip"),
      taskSearch: document.querySelector("#task-search"),
      filtersButton: document.querySelector("#filters-button"),
      filterCount: document.querySelector("#filter-count"),
      sortMode: document.querySelector("#sort-mode"),
      searchSummary: document.querySelector("#search-summary"),
      searchSummaryText: document.querySelector("#search-summary-text"),
      clearSearchButton: document.querySelector("#clear-search-button"),
      searchResults: document.querySelector("#search-results"),
      filtersDialog: document.querySelector("#filters-dialog"),
      filtersForm: document.querySelector("#filters-form"),
      sphereFilterOptions: document.querySelector("#sphere-filter-options"),
      closeFiltersButton: document.querySelector("#close-filters-button"),
      cancelFiltersButton: document.querySelector("#cancel-filters-button"),
      resetFiltersButton: document.querySelector("#reset-filters-button"),
      settingsDialog: document.querySelector("#settings-dialog"),
      settingsForm: document.querySelector("#settings-form"),
      sphereNameFields: document.querySelector("#sphere-name-fields"),
      settingsErrorSummary: document.querySelector("#settings-error-summary"),
      closeSettingsButton: document.querySelector("#close-settings-button"),
      cancelSettingsButton: document.querySelector("#cancel-settings-button"),
      resetSphereNamesButton: document.querySelector("#reset-sphere-names-button"),
    });
  },

  buildSphereControls() {
    const options = document.createDocumentFragment();
    const wheelLabels = document.createDocumentFragment();
    const legendItems = document.createDocumentFragment();
    const filters = document.createDocumentFragment();
    const nameFields = document.createDocumentFragment();

    let sphereNumber = 1;
    for (const [sphereId, sphere] of Object.entries(CONFIG.spheres)) {
      const sphereName = Career.getLabel(App.state, sphereId);

      const option = document.createElement("label");
      option.className = "sphere-option";
      option.style.setProperty("--sphere-color", sphere.color);
      const optionInput = document.createElement("input");
      optionInput.type = "checkbox";
      optionInput.name = "spheres";
      optionInput.value = sphereId;
      const optionText = document.createElement("span");
      optionText.textContent = sphereName;
      option.append(optionInput, optionText);
      options.append(option);

      const levelValue = Career.getLevel(App.state, sphereId);
      const segmentCenter = (sphereNumber - 1) * 72 + 35;
      const segmentRadians = (segmentCenter * Math.PI) / 180;
      const wheelLabel = document.createElement("span");
      wheelLabel.className = "career-wheel__label";
      wheelLabel.style.setProperty("--segment-x", `${50 + Math.sin(segmentRadians) * 31}%`);
      wheelLabel.style.setProperty("--segment-y", `${50 - Math.cos(segmentRadians) * 31}%`);
      wheelLabel.title = sphereName;
      wheelLabel.setAttribute("aria-hidden", "true");
      const shortName = document.createElement("strong");
      shortName.textContent = sphereName;
      const wheelLevel = document.createElement("small");
      wheelLevel.textContent = `${levelValue} из ${CONFIG.maxCareerLevel}`;
      wheelLabel.append(shortName, wheelLevel);
      wheelLabels.append(wheelLabel);

      const legendItem = document.createElement("article");
      legendItem.className = "career-legend__item";
      legendItem.style.setProperty("--sphere-color", sphere.color);
      const legendColor = document.createElement("span");
      legendColor.className = "career-legend__color";
      legendColor.setAttribute("aria-hidden", "true");
      const legendName = document.createElement("strong");
      legendName.textContent = sphereName;
      legendName.title = sphereName;
      const legendLevel = document.createElement("span");
      legendLevel.className = "career-legend__level";
      legendLevel.textContent = `${levelValue} из ${CONFIG.maxCareerLevel}`;
      const progress = document.createElement("span");
      progress.className = "career-legend__progress";
      const progressBasisPoints = Career.getProgressBasisPoints(App.state, sphereId);
      const progressWhole = Math.floor(progressBasisPoints / 100);
      const progressRemainder = String(progressBasisPoints % 100).padStart(2, "0");
      const progressValue = `${progressWhole}.${progressRemainder}`;
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", `Прогресс сферы ${sphereName} до следующего уровня`);
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("aria-valuenow", String(progressValue));
      const progressBar = document.createElement("i");
      progressBar.style.width = `${progressValue}%`;
      progressBar.style.minWidth = progressBasisPoints > 0 ? "3px" : "0";
      progress.append(progressBar);
      legendItem.append(legendColor, legendName, legendLevel, progress);
      legendItems.append(legendItem);

      const filterLabel = document.createElement("label");
      const filterInput = document.createElement("input");
      filterInput.type = "checkbox";
      filterInput.name = "filter-sphere";
      filterInput.value = sphereId;
      filterLabel.append(filterInput, document.createTextNode(` ${sphereName}`));
      filters.append(filterLabel);

      const nameField = document.createElement("div");
      nameField.className = "sphere-name-field";
      const nameColor = document.createElement("span");
      nameColor.className = "sphere-name-field__color";
      nameColor.style.setProperty("--sphere-color", sphere.color);
      nameColor.setAttribute("aria-hidden", "true");
      const inputId = `sphere-name-${sphereId}`;
      const nameLabel = document.createElement("label");
      nameLabel.htmlFor = inputId;
      nameLabel.textContent = `Сфера ${sphereNumber}`;
      const nameInput = document.createElement("input");
      nameInput.id = inputId;
      nameInput.name = "sphere-name";
      nameInput.dataset.sphereId = sphereId;
      nameInput.maxLength = 40;
      nameInput.value = sphereName;
      nameInput.setAttribute("aria-label", `Название сферы ${sphereNumber}`);
      nameField.append(nameColor, nameLabel, nameInput);
      nameFields.append(nameField);
      sphereNumber += 1;
    }

    const wheelCenter = document.createElement("span");
    wheelCenter.className = "career-wheel__center";
    wheelCenter.textContent = "1–10";
    wheelCenter.setAttribute("aria-hidden", "true");
    const wheelDescription = Object.keys(CONFIG.spheres)
      .map((sphereId) => `${Career.getLabel(App.state, sphereId)}, ${Career.getLevel(App.state, sphereId)} из ${CONFIG.maxCareerLevel}`)
      .join("; ");
    this.elements.careerWheel.setAttribute("aria-label", `Круг карьерных сфер: ${wheelDescription}`);
    this.elements.sphereOptions.replaceChildren(options);
    this.elements.careerWheel.replaceChildren(wheelLabels, wheelCenter);
    this.elements.careerList.replaceChildren(legendItems);
    this.elements.sphereFilterOptions.replaceChildren(filters);
    this.elements.sphereNameFields.replaceChildren(nameFields);
  },

  bindEvents() {
    for (const button of this.elements.addButtons) {
      button.addEventListener("click", () => this.openTaskDialog());
    }

    this.elements.selectedDateInput.addEventListener("change", (event) => {
      if (DateUtils.isValidISODate(event.target.value)) this.selectDate(event.target.value);
    });
    this.elements.previousDayButton.addEventListener("click", () => {
      this.selectDate(DateUtils.addDays(App.selectedDate, -1));
    });
    this.elements.nextDayButton.addEventListener("click", () => {
      this.selectDate(DateUtils.addDays(App.selectedDate, 1));
    });
    this.elements.todayButton.addEventListener("click", () => this.selectDate(DateUtils.todayISO()));

    this.elements.previousWeekButton.addEventListener("click", () => {
      this.selectDate(DateUtils.addDays(App.selectedDate, -7));
    });
    this.elements.nextWeekButton.addEventListener("click", () => {
      this.selectDate(DateUtils.addDays(App.selectedDate, 7));
    });
    this.elements.weekStrip.addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (day) this.selectDate(day.dataset.date);
    });

    this.elements.previousMonthButton.addEventListener("click", () => {
      App.visibleMonth = DateUtils.addMonths(App.visibleMonth, -1);
      this.renderMonth();
    });
    this.elements.nextMonthButton.addEventListener("click", () => {
      App.visibleMonth = DateUtils.addMonths(App.visibleMonth, 1);
      this.renderMonth();
    });
    this.elements.monthGrid.addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (day) this.selectDate(day.dataset.date);
    });

    this.elements.taskSearch.addEventListener("input", (event) => {
      App.searchTerm = event.target.value.trim();
      this.renderTasks();
    });
    this.elements.clearSearchButton.addEventListener("click", () => {
      this.elements.taskSearch.value = "";
      App.searchTerm = "";
      this.renderTasks();
      this.elements.taskSearch.focus();
    });
    this.elements.sortMode.addEventListener("change", (event) => {
      const previousMode = App.state.settings.sortMode;
      const nextMode = event.target.value;
      const saved = App.commit((state) => {
        state.settings.sortMode = nextMode;
      });
      if (!saved) event.target.value = previousMode;
      this.renderTasks();
    });

    this.elements.filtersButton.addEventListener("click", () => this.openFiltersDialog());
    this.elements.filtersForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.applyFiltersFromForm();
    });
    this.elements.resetFiltersButton.addEventListener("click", () => this.resetFilters());
    this.elements.closeFiltersButton.addEventListener("click", () => this.requestCloseFilters());
    this.elements.cancelFiltersButton.addEventListener("click", () => this.closePanelDialog(this.elements.filtersDialog));
    this.elements.filtersDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.requestCloseFilters();
    });

    this.elements.settingsButton.addEventListener("click", () => this.openSettingsDialog());
    this.elements.settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitSettings();
    });
    this.elements.resetSphereNamesButton.addEventListener("click", () => {
      for (const input of this.elements.settingsForm.querySelectorAll('[name="sphere-name"]')) {
        input.value = CONFIG.spheres[input.dataset.sphereId].defaultLabel;
        input.removeAttribute("aria-invalid");
      }
      this.elements.settingsErrorSummary.textContent = "";
    });
    this.elements.closeSettingsButton.addEventListener("click", () => this.requestCloseSettings());
    this.elements.cancelSettingsButton.addEventListener("click", () => this.requestCloseSettings());
    this.elements.settingsDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.requestCloseSettings();
    });

    const handleTaskAreaClick = (event) => {
      const header = event.target.closest(".task-group__header");
      if (header) {
        const group = header.closest(".task-group");
        const status = group.dataset.status;
        const nextCollapsed = group.dataset.collapsed !== "true";
        const saved = App.commit((state) => {
          state.settings.collapsedSections[status] = nextCollapsed;
        });
        if (saved) this.renderTasks();
        return;
      }
      const action = event.target.closest("[data-task-action]");
      if (!action) return;
      const taskId = action.dataset.taskId;
      if (action.dataset.taskAction === "edit") this.openTaskDialog(taskId);
      if (action.dataset.taskAction === "toggle") App.toggleTask(taskId);
      if (action.dataset.taskAction === "delete") App.softDeleteTask(taskId);
    };
    this.elements.taskGroups.addEventListener("click", handleTaskAreaClick);
    this.elements.searchResults.addEventListener("click", handleTaskAreaClick);

    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitTaskForm();
    });
    this.elements.title.addEventListener("input", () => this.updateCounters());
    this.elements.description.addEventListener("input", () => this.updateCounters());
    this.elements.date.addEventListener("change", () => this.updatePastStatusField());
    this.elements.closeButton.addEventListener("click", () => this.requestCloseDialog());
    this.elements.cancelButton.addEventListener("click", () => this.requestCloseDialog());
    this.elements.deleteButton.addEventListener("click", () => {
      const taskId = this.elements.taskId.value;
      if (!taskId) return;
      this.closeDialog(true);
      App.softDeleteTask(taskId);
    });
    this.elements.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.requestCloseDialog();
    });
  },

  selectDate(value) {
    App.selectedDate = value;
    App.visibleMonth = DateUtils.monthKey(value);
    this.render();
  },

  setReadOnly(message) {
    this.elements.storageAlert.hidden = false;
    this.elements.storageAlert.textContent = message;
    for (const button of [
      ...this.elements.addButtons,
      this.elements.settingsButton,
      this.elements.filtersButton,
    ]) {
      button.disabled = true;
    }
  },

  render() {
    this.renderDate();
    this.renderWeek();
    this.renderMonth();
    this.renderTasks();
  },

  renderDate() {
    const today = DateUtils.todayISO();
    this.elements.todayLabel.textContent = DateUtils.formatFull(today);
    this.elements.selectedDateTitle.textContent = DateUtils.formatHeading(App.selectedDate);
    this.elements.selectedDateFull.textContent = DateUtils.formatFull(App.selectedDate);
    this.elements.selectedDateInput.value = App.selectedDate;
    this.elements.todayButton.hidden = App.selectedDate === today;
  },

  renderWeek() {
    const start = DateUtils.startOfWeek(App.selectedDate);
    const today = DateUtils.todayISO();
    const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
    const activeTasks = Tasks.active(App.state);
    const buttons = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const value = DateUtils.addDays(start, offset);
      const count = activeTasks.filter((task) => task.scheduledDate === value).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "week-day";
      if (value === today) button.classList.add("week-day--today");
      if (value === App.selectedDate) button.classList.add("week-day--selected");
      button.dataset.date = value;
      button.setAttribute("aria-pressed", String(value === App.selectedDate));
      button.setAttribute("aria-label", `${DateUtils.formatFull(value)}, задач: ${count}`);
      const weekday = document.createElement("span");
      weekday.textContent = weekdayFormatter.format(DateUtils.fromISO(value)).replace(".", "");
      const date = document.createElement("strong");
      date.textContent = String(DateUtils.fromISO(value).getDate());
      const taskCount = document.createElement("small");
      taskCount.textContent = count ? `${count} зад.` : "";
      button.append(weekday, date, taskCount);
      buttons.push(button);
    }
    this.elements.weekStrip.replaceChildren(...buttons);
  },

  renderMonth() {
    const visibleMonth = App.visibleMonth;
    const today = DateUtils.todayISO();
    const start = DateUtils.monthGridStart(visibleMonth);
    const activeTasks = Tasks.active(App.state);
    const monthTasks = activeTasks.filter((task) => DateUtils.monthKey(task.scheduledDate) === visibleMonth);
    const monthCounts = Tasks.countsByStatus(monthTasks);
    this.elements.monthTitle.textContent = DateUtils.formatMonth(visibleMonth);

    const statusColors = {
      in_progress: "var(--primary)",
      completed: "var(--success)",
      overdue: "var(--danger)",
    };
    const days = [];
    for (let offset = 0; offset < 42; offset += 1) {
      const value = DateUtils.addDays(start, offset);
      const dayTasks = activeTasks.filter((task) => task.scheduledDate === value);
      const counts = Tasks.countsByStatus(dayTasks);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "month-day";
      if (DateUtils.monthKey(value) !== visibleMonth) button.classList.add("month-day--other");
      if (value === today) button.classList.add("month-day--today");
      if (value === App.selectedDate) button.classList.add("month-day--selected");
      button.dataset.date = value;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-pressed", String(value === App.selectedDate));
      button.setAttribute(
        "aria-label",
        `${DateUtils.formatFull(value)}: в работе ${counts.in_progress}, выполнено ${counts.completed}, просрочено ${counts.overdue}`,
      );
      const number = document.createElement("span");
      number.textContent = String(DateUtils.fromISO(value).getDate());
      const dots = document.createElement("span");
      dots.className = "month-day__dots";
      dots.setAttribute("aria-hidden", "true");
      for (const status of Object.keys(CONFIG.statuses)) {
        if (!counts[status]) continue;
        const dot = document.createElement("i");
        dot.style.setProperty("--dot-color", statusColors[status]);
        dots.append(dot);
      }
      button.append(number, dots);
      days.push(button);
    }
    this.elements.monthGrid.replaceChildren(...days);

    const summaryItems = [
      ["in_progress", "В работе", "var(--primary)"],
      ["completed", "Выполнено", "var(--success)"],
      ["overdue", "Просрочено", "var(--danger)"],
    ].map(([status, label, color]) => {
      const item = document.createElement("span");
      item.className = "month-summary__item";
      item.style.setProperty("--summary-color", color);
      const count = document.createElement("strong");
      count.textContent = String(monthCounts[status]);
      const text = document.createElement("span");
      text.textContent = label;
      item.append(count, text);
      return item;
    });
    this.elements.monthSummary.replaceChildren(...summaryItems);
  },

  getFilterCount() {
    return App.filters.statuses.length + App.filters.spheres.length + App.filters.importance.length;
  },

  renderTasks() {
    const allTasks = Tasks.active(App.state);
    const selectedDayTasks = allTasks.filter((task) => task.scheduledDate === App.selectedDate);
    this.elements.dayTaskCount.textContent = String(selectedDayTasks.length);
    this.elements.dayCompletedCount.textContent = String(
      selectedDayTasks.filter((task) => task.status === "completed").length,
    );
    this.elements.sortMode.value = App.state.settings.sortMode;
    const filterCount = this.getFilterCount();
    this.elements.filterCount.hidden = filterCount === 0;
    this.elements.filterCount.textContent = String(filterCount);

    const query = App.searchTerm.toLocaleLowerCase("ru-RU");
    const filtered = allTasks.filter((task) => {
      if (!Tasks.matchesFilters(task, App.filters)) return false;
      if (!query) return task.scheduledDate === App.selectedDate;
      return Tasks.matchesSearch(task, query);
    });

    const isSearchMode = Boolean(query);
    this.elements.taskGroups.hidden = isSearchMode;
    this.elements.searchResults.hidden = !isSearchMode;
    this.elements.searchSummary.hidden = !isSearchMode;

    if (isSearchMode) {
      this.elements.searchSummaryText.textContent = `Найдено задач: ${filtered.length}`;
      this.renderSearchResults(filtered);
      return;
    }

    for (const group of this.elements.taskGroups.querySelectorAll(".task-group")) {
      const status = group.dataset.status;
      const collapsed = Boolean(App.state.settings.collapsedSections[status]);
      const statusTasks = Tasks.sort(
        filtered.filter((task) => task.status === status),
        App.state.settings.sortMode,
      );
      const list = group.querySelector("[data-list]");
      group.dataset.collapsed = String(collapsed);
      group.querySelector(".task-group__header").setAttribute("aria-expanded", String(!collapsed));
      group.querySelector("[data-count]").textContent = String(statusTasks.length);

      if (statusTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-group";
        empty.textContent = filterCount
          ? "Нет задач по выбранным фильтрам."
          : status === "in_progress"
            ? "Здесь появятся задачи на выбранный день."
            : status === "completed"
              ? "Выполненных задач пока нет."
              : "Просроченных задач нет.";
        list.replaceChildren(empty);
      } else {
        list.replaceChildren(...statusTasks.map((task) => this.createTaskCard(task)));
      }
    }
  },

  renderSearchResults(tasks) {
    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-group";
      empty.textContent = "Поиск не нашёл подходящих задач.";
      this.elements.searchResults.replaceChildren(empty);
      return;
    }
    const grouped = new Map();
    for (const task of tasks) {
      if (!grouped.has(task.scheduledDate)) grouped.set(task.scheduledDate, []);
      grouped.get(task.scheduledDate).push(task);
    }
    const groups = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dateTasks]) => {
        const section = document.createElement("section");
        section.className = "search-date-group";
        const heading = document.createElement("h3");
        heading.className = "search-date-group__heading";
        const title = document.createElement("span");
        title.textContent = DateUtils.formatFull(date);
        const count = document.createElement("small");
        count.textContent = `${dateTasks.length} задач`;
        heading.append(title, count);
        const list = document.createElement("div");
        list.className = "task-list";
        list.append(
          ...Tasks.sort(dateTasks, App.state.settings.sortMode).map((task) =>
            this.createTaskCard(task),
          ),
        );
        section.append(heading, list);
        return section;
      });
    this.elements.searchResults.replaceChildren(...groups);
  },

  createTaskCard(task) {
    const card = document.createElement("article");
    card.className = `task-card task-card--${task.status}`;
    card.dataset.taskId = task.id;
    const top = document.createElement("div");
    top.className = "task-card__top";
    const topLeft = document.createElement("div");
    topLeft.className = "task-card__chips";
    const time = document.createElement("span");
    time.className = "task-time";
    time.textContent = task.scheduledTime || "Без времени";
    const status = document.createElement("span");
    status.className = `task-status task-status--${task.status}`;
    status.textContent = CONFIG.statuses[task.status];
    const importance = document.createElement("span");
    importance.className = "task-importance";
    importance.textContent = CONFIG.importance[task.importance];
    topLeft.append(time, status, importance);
    const points = document.createElement("span");
    points.className = "task-points";
    points.textContent = Units.taskLabel(task.taskUnits);
    top.append(topLeft, points);
    const title = document.createElement("h3");
    title.textContent = task.title;
    card.append(top, title);
    if (task.description) {
      const description = document.createElement("p");
      description.className = "task-card__description";
      description.textContent = task.description;
      card.append(description);
    }
    const footer = document.createElement("div");
    footer.className = "task-card__footer";
    const spheres = document.createElement("div");
    spheres.className = "task-card__chips";
    for (const sphereId of task.spheres) {
      const chip = document.createElement("span");
      chip.className = "sphere-chip";
      chip.style.setProperty("--sphere-color", CONFIG.spheres[sphereId].color);
      chip.textContent = Career.getLabel(App.state, sphereId);
      spheres.append(chip);
    }
    const actions = document.createElement("div");
    actions.className = "task-card__actions";
    const toggle = this.createCardAction(
      task.status === "completed" ? "Вернуть" : "Выполнить",
      "toggle",
      task.id,
      task.status === "completed" ? "" : "card-action--complete",
    );
    const edit = this.createCardAction("Изменить", "edit", task.id);
    const remove = this.createCardAction("Удалить", "delete", task.id);
    actions.append(toggle, edit, remove);
    footer.append(spheres, actions);
    card.append(footer);
    return card;
  },

  openFiltersDialog() {
    this.returnFocusElement = document.activeElement;
    for (const input of this.elements.filtersForm.querySelectorAll("input[type='checkbox']")) {
      const group =
        input.name === "filter-status"
          ? App.filters.statuses
          : input.name === "filter-sphere"
            ? App.filters.spheres
            : App.filters.importance;
      input.checked = group.includes(input.value);
    }
    this.initialFiltersSignature = this.filtersSignature();
    this.elements.filtersDialog.showModal();
    this.elements.filtersForm.querySelector("input").focus();
  },

  filtersSignature() {
    return JSON.stringify(
      Array.from(this.elements.filtersForm.querySelectorAll("input:checked"), (input) => [
        input.name,
        input.value,
      ]).sort(),
    );
  },

  requestCloseFilters() {
    if (
      this.filtersSignature() !== this.initialFiltersSignature &&
      !window.confirm("Закрыть фильтры без применения изменений?")
    ) {
      return;
    }
    this.closePanelDialog(this.elements.filtersDialog);
  },

  applyFiltersFromForm() {
    App.filters = {
      statuses: Array.from(
        this.elements.filtersForm.querySelectorAll('[name="filter-status"]:checked'),
        (input) => input.value,
      ),
      spheres: Array.from(
        this.elements.filtersForm.querySelectorAll('[name="filter-sphere"]:checked'),
        (input) => input.value,
      ),
      importance: Array.from(
        this.elements.filtersForm.querySelectorAll('[name="filter-importance"]:checked'),
        (input) => input.value,
      ),
    };
    this.closePanelDialog(this.elements.filtersDialog);
    this.renderTasks();
  },

  resetFilters() {
    App.filters = { statuses: [], spheres: [], importance: [] };
    for (const input of this.elements.filtersForm.querySelectorAll("input[type='checkbox']")) {
      input.checked = false;
    }
    this.closePanelDialog(this.elements.filtersDialog);
    this.renderTasks();
    this.showToast("Фильтры сброшены.");
  },

  openSettingsDialog() {
    if (App.readOnly) return;
    this.returnFocusElement = document.activeElement;
    this.elements.settingsErrorSummary.textContent = "";
    for (const input of this.elements.settingsForm.querySelectorAll('[name="sphere-name"]')) {
      input.value = Career.getLabel(App.state, input.dataset.sphereId);
      input.removeAttribute("aria-invalid");
    }
    this.initialSettingsSignature = this.settingsSignature();
    this.elements.settingsDialog.showModal();
    this.elements.settingsForm.querySelector("input").focus();
  },

  settingsSignature() {
    return JSON.stringify(
      Array.from(this.elements.settingsForm.querySelectorAll('[name="sphere-name"]'), (input) => [
        input.dataset.sphereId,
        input.value,
      ]),
    );
  },

  requestCloseSettings() {
    if (
      this.settingsSignature() !== this.initialSettingsSignature &&
      !window.confirm("Закрыть настройки без сохранения изменений?")
    ) {
      return;
    }
    this.closePanelDialog(this.elements.settingsDialog);
  },

  submitSettings() {
    const names = {};
    let firstInvalid = null;
    for (const input of this.elements.settingsForm.querySelectorAll('[name="sphere-name"]')) {
      const value = input.value.trim();
      input.removeAttribute("aria-invalid");
      if (!value || value.length > 40) {
        input.setAttribute("aria-invalid", "true");
        firstInvalid ??= input;
      }
      names[input.dataset.sphereId] = value;
    }
    if (firstInvalid) {
      this.elements.settingsErrorSummary.textContent =
        "У каждой сферы должно быть название длиной от 1 до 40 символов.";
      firstInvalid.focus();
      return;
    }
    const saved = App.commit((state) => {
      state.settings.sphereNames = names;
    });
    if (!saved) return;
    this.initialSettingsSignature = this.settingsSignature();
    this.closePanelDialog(this.elements.settingsDialog);
    this.buildSphereControls();
    this.render();
    this.showToast("Названия сфер сохранены.");
  },

  closePanelDialog(dialog) {
    dialog.close();
    const returnTarget = this.returnFocusElement;
    this.returnFocusElement = null;
    if (returnTarget?.isConnected) window.requestAnimationFrame(() => returnTarget.focus());
  },
});

/* App */
const App = {
  state: null,
  selectedDate: DateUtils.todayISO(),
  visibleMonth: DateUtils.monthKey(DateUtils.todayISO()),
  searchTerm: "",
  filters: { statuses: [], spheres: [], importance: [] },
  readOnly: false,
  deleteTimers: new Map(),

  init() {
    const loaded = Storage.load();
    this.state = loaded.state;
    this.readOnly = loaded.readOnly;

    UI.cacheElements();
    UI.buildSphereControls();
    UI.bindEvents();

    if (loaded.error) UI.setReadOnly(loaded.error);
    if (!this.readOnly) this.runInitialMaintenance();
    this.restoreDeleteTimers();
    UI.render();
  },

  commit(mutator) {
    if (this.readOnly) return false;
    const result = Storage.commit(this.state, mutator);
    if (!result.ok) {
      UI.showToast(result.error, { error: true, duration: 5200 });
      return false;
    }
    this.state = result.state;
    return true;
  },

  runInitialMaintenance() {
    const next = Storage.clone(this.state);
    let changed = Tasks.purgeExpiredDeletes(next);
    changed = Tasks.normalizeOverdue(next) || changed;
    changed = Career.backfillCompletedTasks(next) || changed;
    if (!changed) return;
    const result = Storage.commit(this.state, (state) => {
      Tasks.purgeExpiredDeletes(state);
      Tasks.normalizeOverdue(state);
      Career.backfillCompletedTasks(state);
      state.meta.lastSyncAt = DateUtils.nowISO();
    });
    if (result.ok) this.state = result.state;
    else UI.showToast(result.error, { error: true });
  },

  toggleTask(taskId) {
    const task = Tasks.byId(this.state, taskId);
    if (!task || task.deletedAt) return;
    const previousLevels = Object.fromEntries(
      Object.keys(CONFIG.spheres).map((sphereId) => [sphereId, Career.getLevel(this.state, sphereId)]),
    );
    const saved = this.commit((state) => {
      const target = Tasks.byId(state, taskId);
      if (target.status === "completed") {
        Career.revertTaskCompletion(state, target);
        target.status = target.scheduledDate < DateUtils.todayISO() ? "overdue" : "in_progress";
        target.completedAt = null;
      } else {
        target.status = "completed";
        target.completedAt = DateUtils.nowISO();
        Career.applyTaskCompletion(state, target);
      }
      target.updatedAt = DateUtils.nowISO();
    });
    if (!saved) return;
    UI.buildSphereControls();
    UI.render();
    if (task.status === "completed") {
      UI.showToast("Задача возвращена, её прогресс вычтен из сфер.");
      return;
    }
    const raisedSpheres = Object.keys(CONFIG.spheres).filter(
      (sphereId) => Career.getLevel(this.state, sphereId) > previousLevels[sphereId],
    );
    UI.showToast(
      raisedSpheres.length
        ? `Новый уровень: ${raisedSpheres.map((id) => Career.getLabel(this.state, id)).join(", ")}.`
        : "Задача выполнена, прогресс сфер обновлён.",
    );
  },

  softDeleteTask(taskId) {
    const task = Tasks.byId(this.state, taskId);
    if (!task || task.deletedAt) return;
    const undoUntil = new Date(Date.now() + CONFIG.undoWindowMs).toISOString();
    const saved = this.commit((state) => {
      const target = Tasks.byId(state, taskId);
      target.deletedAt = DateUtils.nowISO();
      target.undoUntil = undoUntil;
      target.updatedAt = DateUtils.nowISO();
    });
    if (!saved) return;
    UI.render();
    this.scheduleFinalDelete(taskId, undoUntil);
    UI.showToast("Задача удалена.", {
      actionLabel: "Отменить",
      onAction: () => this.undoDelete(taskId),
      duration: CONFIG.undoWindowMs + 250,
    });
  },

  undoDelete(taskId) {
    const task = Tasks.byId(this.state, taskId);
    if (!task?.deletedAt || Date.parse(task.undoUntil) <= Date.now()) return;
    const timer = this.deleteTimers.get(taskId);
    if (timer) window.clearTimeout(timer);
    this.deleteTimers.delete(taskId);
    const saved = this.commit((state) => {
      const target = Tasks.byId(state, taskId);
      target.deletedAt = null;
      target.undoUntil = null;
      target.updatedAt = DateUtils.nowISO();
    });
    if (!saved) return;
    UI.render();
    UI.showToast("Удаление отменено.");
  },

  scheduleFinalDelete(taskId, undoUntil) {
    const existingTimer = this.deleteTimers.get(taskId);
    if (existingTimer) window.clearTimeout(existingTimer);
    const delay = Math.max(0, Date.parse(undoUntil) - Date.now());
    const timer = window.setTimeout(() => this.finalizeDelete(taskId), delay + 30);
    this.deleteTimers.set(taskId, timer);
  },

  finalizeDelete(taskId) {
    this.deleteTimers.delete(taskId);
    const task = Tasks.byId(this.state, taskId);
    if (!task?.deletedAt || Date.parse(task.undoUntil) > Date.now()) return;
    const saved = this.commit((state) => {
      const target = Tasks.byId(state, taskId);
      if (target?.status === "completed") Career.revertTaskCompletion(state, target);
      state.tasks = state.tasks.filter((item) => item.id !== taskId);
    });
    if (saved) {
      UI.buildSphereControls();
      UI.render();
    }
  },

  restoreDeleteTimers() {
    for (const task of this.state.tasks) {
      if (!task.deletedAt || !task.undoUntil) continue;
      if (Date.parse(task.undoUntil) <= Date.now()) this.finalizeDelete(task.id);
      else this.scheduleFinalDelete(task.id, task.undoUntil);
    }
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
