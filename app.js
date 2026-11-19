import { PresenceUI } from "./presence.js";
import { WorkbookEngine, colName } from "./engine.js";
import { Room, identity, EMOJIS, validDiary } from "./rooms.js";
import { stampChanges, mergeDiaries, sameRegisters } from "./sync-state.js";
import { initUpdates, APP_VERSION } from "./updates.js";
import { CalendarView } from "./calendar-view.js";
import { SCHEDULES } from "./calendar.js";
import {
  buddyHTML,
  installBuddy,
  refreshBuddyMood,
  celebrateBuddy,
  notifyBuddyTimer,
} from "./companion.js";
import {
  MAIN,
  dayRows,
  uid,
  today,
  freshCycle,
  initialState,
  setKey,
  effectiveOverrides,
  nextPosition,
  parseRoom,
} from "./state.js";
const data = await fetch("./workbook.json").then((r) => {
  if (!r.ok) throw Error("Не удалось загрузить программу");
  return r.json();
});
const ident = await identity();
let state = initialState(),
  page = "train",
  viewId = ident.id,
  viewCycle = null,
  room,
  status = "Подключаем комнату…",
  search = "",
  group = "all",
  calcMode = "rpe",
  explorerSheet = 0,
  explorerFrom = 1;
state.recoveryEnabled ??= true;
if (!state.registers) stampChanges(null, state, ident.id);
let committedState = structuredClone(state);
const memberId = (id) => room?.access.canonical(id) || id;
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v) =>
  typeof v === "number"
    ? Number(v.toFixed(2)).toLocaleString("ru-RU")
    : (v ?? "—");
const own = () => memberId(viewId) === memberId(ident.id);
const remotePositions = {};
const presence = new PresenceUI(
  () => room,
  () => status,
  modal,
);
let pendingInvite = null;
function person() {
  return own() ? state : room?.access.member(viewId) || state;
}
function cycle() {
  const s = person();
  const c =
    s.cycles?.find((c) => c.id === (viewCycle || s.activeCycle)) ||
    s.cycles?.[0] ||
    state.cycles[0];
  return own() ? c : { ...c, position: remotePositions[c.id] || c.position };
}
let engineMemo;
function engine() {
  const c = cycle(),
    key = JSON.stringify([viewId, c.id, c.overrides]);
  if (engineMemo?.key === key) return engineMemo.engine;
  const e = new WorkbookEngine(data, effectiveOverrides(data, c));
  engineMemo = { key, engine: e };
  return e;
}
function selected(slot, c = cycle()) {
  return c.overrides[MAIN + "!B" + slot.row] ?? slot.default;
}
function phaseName(p) {
  return p.phase === "prep"
    ? `Подготовка · неделя ${p.week + 1}`
    : p.phase === "test"
      ? "Тестовая неделя"
      : p.phase === "rest"
        ? "Неделя восстановления"
        : `Мезоцикл ${Math.floor(p.week / 3) + 1} · неделя ${p.week + 1}`;
}
const icons = {
  train: "🏋️",
  calendar: "🗓️",
  progress: "📈",
  room: "🦍",
  tech: "📖",
  calc: "🧮",
  help: "🧠",
};
const labels = {
  train: "Тренировка",
  calendar: "Календарь",
  progress: "Прогресс",
  room: "Комната",
  tech: "Техника",
  calc: "Калькуляторы",
  help: "Как это работает",
};
let saveTimer;
let pendingExercises;
const calendarView = new CalendarView({
  today,
  state: () => state,
  own: () => ({ ...state, id: memberId(ident.id) }),
  members: () => room?.access.members() || [],
  buddy: () => buddy(),
  render,
  toast,
  changed: (message) => {
    const focusedDate = document.activeElement?.dataset?.calDate;
    commit();
    render();
    if (focusedDate)
      document
        .querySelector(`[data-cal-date="${focusedDate}"]`)
        ?.focus({ preventScroll: true });
    toast(message);
  },
  schedule: () => modal(calendarView.scheduleForm()),
  train: (date) => {
    viewId = ident.id;
    viewCycle = null;
    cycle().dates ??= {};
    cycle().dates[setKey(cycle().position)] = date;
    commit();
    page = "train";
    render();
    window.scrollTo(0, 0);
  },
});
function copyExercisesModal() {
  if (own()) return;
  const source = cycle(),
    target =
      state.cycles.find((c) => c.id === state.activeCycle) || state.cycles[0];
  const choices = data.slots
    .map((slot) => ({ slot, name: selected(slot, source) }))
    .filter(({ slot, name }) => slot.options.some((o) => o.name === name));
  pendingExercises = {
    choices: choices.map(({ slot, name }) => ({ row: slot.row, name })),
    target: target.id,
  };
  const hasResults =
    Object.keys(target.logs || {}).length ||
    Object.keys(target.overrides || {}).some(
      (k) => !/^Программа тренировок ![BE]\d+$/.test(k),
    );
  modal(
    `<h2>Взять упражнения у ${esc(person().name)}</h2><p>Перенесутся только названия выбранных упражнений из ${esc(source.name)}. Веса, RPE, результаты и шаги округления останутся твоими.</p><div class="copy-exercises">${[
      0, 1, 2,
    ]
      .map(
        (day) =>
          `<h3>День ${day + 1}</h3>${choices
            .filter((x) => x.slot.day === day)
            .map(
              ({ slot, name }) =>
                `<div class="copy-exercise"><span>${esc((target.overrides[MAIN + "!B" + slot.row] ?? slot.default).trim())}</span><b>→ ${name === "+" ? "Без дополнительного упражнения" : esc(name.trim())}</b></div>`,
            )
            .join("")}`,
      )
      .join(
        "",
      )}</div><button class="primary" data-action="copy-exercises" data-target="new">Создать цикл с этими упражнениями</button>${hasResults ? "" : `<button class="secondary" data-action="copy-exercises" data-target="current">В текущий пустой цикл</button>`}<p class="muted">Новый цикл сохранит твою историю. Шаги округления берутся из твоего текущего цикла.</p>`,
  );
}
function commit() {
  if (!own()) return;
  state.rev = Math.max(Date.now(), state.rev + 1);
  stampChanges(committedState, state, ident.id);
  committedState = structuredClone(state);
  try {
    localStorage.setItem("zhmi:state", JSON.stringify(state));
  } catch {
    toast("Не удалось сохранить: экспортируйте резервную копию");
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => room?.publish(structuredClone(state)), 250);
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function modal(html) {
  dialog.innerHTML = `<button class="close" aria-label="Закрыть" data-action="close">×</button>${html}`;
  dialog.showModal();
  if (dialog.querySelector(".timer-expanded")) {
    notifyBuddyTimer();
    updateTimer();
  }
}
function field(label, attrs, value = "", placeholder = "") {
  return `<label class="field"><span>${label}</span><input ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}" ${own() ? "" : "disabled"}></label>`;
}
function rpeField(addr, value, label = "RPE") {
  return `<label class="field rpe"><span>${label}</span><select data-cell="${addr}" aria-label="${label} ${addr}" ${own() ? "" : "disabled"}><option value="">—</option>${[6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => `<option ${value === v ? "selected" : ""} value="${v}">${fmt(v)}</option>`).join("")}</select></label>`;
}
function result(e, addr) {
  const r = e.get(MAIN, addr);
  return r.error ? null : r.value;
}
function inputCell(
  addr,
  label,
  e,
  { min = 0, max = 1000, step = "0.5", editable = true } = {},
) {
  const has = Object.hasOwn(cycle().overrides, MAIN + "!" + addr),
    raw = cycle().overrides[MAIN + "!" + addr],
    v = result(e, addr),
    base = data.sheets[0].cells[addr];
  const calculated = !!base?.f;
  return field(
    label,
    `type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" data-cell="${addr}" aria-label="${label} ${addr}" ${editable ? "" : "disabled"}`,
    has ? (raw ?? "") : calculated ? "" : (v ?? ""),
    calculated ? (v === null ? "ждём данные" : fmt(v)) : "—",
  );
}
function appShell() {
  const c = cycle(),
    p = c.position || { phase: "prep", week: 0, day: 0 };
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#" data-action="nav" data-page="train"><span class="brand-icon">жб</span><strong>ЖМИ,<br>БРАТ<span class="brand-dot">.</span></strong></a><p class="brand-sub">Умная прога. Живые люди.</p><nav aria-label="Основная навигация">${Object.keys(
    labels,
  )
    .map(
      (k) =>
        `<button data-action="nav" data-page="${k}" class="nav-item ${page === k ? "active" : ""}"><span>${icons[k]}</span>${labels[k]}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><button data-action="cycles" class="cycle-link">↻ ${esc(c.name)}<span>Все циклы и архив</span></button><button data-action="profile" class="profile"><span class="avatar small">${esc(state.avatar)}</span><span>${esc(state.name)}<small>Твой личный дневник</small></span><span>⚙</span></button></div></aside>
 <div class="workspace"><header class="topbar"><button class="mobile-brand brand" data-action="nav" data-page="train" aria-label="ЖМИ, БРАТ — главная"><span class="brand-icon">жб</span><strong>ЖМИ,<br>БРАТ<span class="brand-dot">.</span></strong></button><div class="breadcrumb">Твоя качалка <span>/</span> ${labels[page]}</div>${presence.html()}<button class="theme-toggle" data-action="theme" aria-label="${document.documentElement.dataset.theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}" aria-pressed="${document.documentElement.dataset.theme === "dark"}">${document.documentElement.dataset.theme === "dark" ? "☀️" : "🌙"}</button><button class="avatar small" data-action="profile" aria-label="Профиль">${esc(state.avatar)}</button></header>
 <div class="content"><main id="main" tabindex="-1">${!own() ? `<div class="viewing">${esc(person().avatar)} Дневник ${esc(person().name)} · только просмотр <div class="viewing-actions"><button data-action="copy-exercises-open">Взять упражнения</button><button data-action="own">К моему</button></div></div>` : ""}${deviceNotice()}${page === "train" ? training(p) : page === "calendar" ? calendarView.html() : page === "progress" ? progress() : page === "room" ? roomPage() : page === "tech" ? techPage() : page === "calc" ? calculator() : helpPage()}</main><aside class="rightbar">${buddy()}${timerCard()}${roomMini()}</aside></div>
 <footer class="app-footer"><button data-action="nav" data-page="help">Справка и источники</button></footer></div>
 <nav class="bottom-nav" aria-label="Мобильная навигация">${["train", "calendar", "progress", "room", "tech", "calc"].map((k) => `<button data-action="nav" data-page="${k}" class="${page === k ? "active" : ""}"><span>${icons[k]}</span>${labels[k]}</button>`).join("")}</nav><button class="floating-timer" data-action="timer-open" aria-label="Таймер отдыха">◷ <span id="mobile-time">Отдых</span></button>`;
  updateTimer();
}
function training(p) {
  const c = cycle(),
    done = c.done || [],
    key = setKey(p);
  const slots = data.slots.filter((s) => s.day === p.day);
  const count = Object.keys(c.logs || {}).filter((k) =>
    k.startsWith(key + ":"),
  ).length;
  return `<div class="page-heading"><div><h1>${p.phase === "test" ? "Проверим силу" : p.phase === "rest" ? "Рост тоже требует отдыха" : "Сегодня жмём"}<span class="heading-dot">.</span></h1><p>${esc(phaseName(p))}. ${p.phase === "prep" ? "Учимся оценивать усилие и подбираем веса." : p.phase === "test" ? "Один подход до технического отказа на упражнение." : p.phase === "rest" ? "После первого мезоцикла автор рекомендует неделю восстановления." : "Вес пересчитывается по твоим результатам и RPE."}</p></div><button class="text-button" data-action="cycles">${esc(c.name)} ↗</button></div>
 <div class="cycle-track" aria-label="Периоды программы">${[
   ["prep", "Подготовка", "2 недели"],
   ["test", "Тест", "1 неделя"],
   ["meso", "Мезоциклы", "9 недель"],
   ["rest", "Отдых", "после 1-го"],
 ]
   .map(
     ([ph, title, sub]) =>
       `<button data-action="phase" data-phase="${ph}" class="${p.phase === ph ? "active" : ""}"><span class="track-icon">${ph === "prep" ? "🌱" : ph === "test" ? "🎯" : ph === "meso" ? "💪" : "🛋️"}</span><span>${title}<small>${sub}</small></span></button>`,
   )
   .join("")}</div>
 ${
   p.phase === "rest"
     ? `<section class="rest-page"><h2>Брат, восстановись.</h2><p>Недельный перерыв после первого мезоцикла — рекомендация оригинала. Следующий этап начинается с недели 4.</p><button class="primary" data-action="rest-done">Перейти к мезоциклу 2</button></section><div class="mobile-buddy">${buddy()}</div>`
     : `<div class="session-toolbar"><div class="week-pick"><label for="week">Неделя</label><select id="week" data-action="week" ${p.phase === "test" ? "disabled" : ""}>${Array.from({ length: p.phase === "prep" ? 2 : p.phase === "test" ? 1 : 9 }, (_, i) => `<option value="${i}" ${p.week === i ? "selected" : ""}>${p.phase === "meso" ? `М${Math.floor(i / 3) + 1} / ` : ""}${i + 1}</option>`).join("")}</select></div><div class="day-tabs" aria-label="День тренировки">${[0, 1, 2].map((i) => `<button data-action="day" data-day="${i}" class="${p.day === i ? "active" : ""}">День ${i + 1}${done.includes(setKey({ ...p, day: i })) ? " ✓" : ""}</button>`).join("")}</div><label class="session-date"><span>Дата</span><input type="date" value="${esc(c.dates?.[key] || today())}" data-date ${own() ? "" : "disabled"}></label></div>
 <div class="session-title"><h2>День ${p.day + 1} <span>${slots.filter((s) => selected(s) !== "+").length} упражнений</span></h2><button class="text-button" data-action="rpe-help">Что такое RPE?</button></div>
 ${p.phase === "test" ? '<div class="note blue">Взвешенные подтягивания и брусья: вводи вес тела + отягощение. Для упражнений с собственным весом важны повторения; шаг в настройках — прибавка повторений.</div>' : ""}
 ${warmupPanel()}<div class="exercise-list">${slots.map((s, i) => exercise(s, p, i)).join("")}</div>
 <div class="session-finish"><div><strong>${done.includes(key) ? "Тренировка завершена ✓" : count ? "Хорошо идём, брат." : "Пока нет записанных подходов"}</strong><span>${count ? `Записано подходов: ${count}` : "Отмечай выполненные подходы галочкой."}</span></div><button class="primary" data-action="finish" ${own() ? "" : "disabled"}>${done.includes(key) ? "Следующая тренировка" : "Завершить тренировку"} <span>✓</span></button></div><div class="mobile-buddy">${buddy()}</div>`
 }`;
}
function exercise(slot, p, i) {
  const name = selected(slot),
    e = engine(),
    isPlus = name === "+";
  const config = `<label class="exercise-select"><span class="exercise-name" aria-hidden="true">${name === "+" ? "＋ Добавить упражнение" : esc(name.trim())}</span><select data-exercise="${slot.row}" aria-label="Упражнение ${slot.row}" ${own() ? "" : "disabled"}>${slot.options.map((o) => `<option value="${esc(o.name)}" ${name === o.name ? "selected" : ""}>${o.name === "+" ? "＋ Добавить упражнение" : esc(o.name.trim())}</option>`).join("")}</select></label>`;
  if (isPlus)
    return `<article class="exercise optional"><span class="exercise-number">＋</span>${config}<span>Необязательное упражнение</span></article>`;
  const c = cycle(),
    body = name.includes("собствен") || slot.row === 81,
    round = c.overrides[MAIN + "!E" + slot.row] ?? slot.round;
  let sets = "";
  if (p.phase === "prep") {
    const columns =
      p.week === 0
        ? [
            ["F", "G", "H"],
            ["I", "J", "K"],
            ["L", "M", "N"],
          ]
        : [
            ["O", "P", "Q"],
            ["R", "S", "T"],
            ["U", "V", "W"],
          ];
    sets = columns
      .map(([w, r, rpe], j) => {
        const logKey = setKey(p) + ":" + slot.row + ":" + j,
          log = c.logs?.[logKey];
        return `<div class="set-row ${log ? "logged" : ""}" data-logrow="${logKey}"><span class="set-number">${j + 1}</span>${slot.row === 81 ? `<div class="body-label">Свой вес</div>` : inputCell(w + slot.row, body ? "Вес тела, кг" : "Вес, кг", e)}${inputCell(r + slot.row, "Повторы", e, { max: 100, step: 1, min: 1 })}${rpeField(rpe + slot.row, c.overrides[MAIN + "!" + rpe + slot.row])}<button class="set-check ${log ? "checked" : ""}" data-action="log" data-slot="${slot.row}" data-set="${j}" aria-label="${log ? "Снять отметку" : "Записать подход"} ${j + 1} ${slot.row}" ${own() ? "" : "disabled"}>${log ? "✓" : "○"}</button></div>`;
      })
      .join("");
  } else if (p.phase === "test") {
    const logKey = setKey(p) + ":" + slot.row + ":0",
      log = c.logs?.[logKey];
    sets = `<div class="set-row test-set ${log ? "logged" : ""}"><span class="set-number">1</span>${slot.row === 81 ? '<div class="body-label">Свой вес</div>' : inputCell("C" + slot.testRow, body ? "Свой вес, кг" : "Вес, кг", e, { max: 1500 })}${inputCell("D" + slot.testRow, "До отказа, повт.", e, { max: body ? 100 : 10, step: 1, min: 1 })}<span class="test-rpe">RPE 10</span><button class="set-check ${log ? "checked" : ""}" data-action="log" data-slot="${slot.row}" data-set="0" aria-label="Записать тест ${slot.row}" ${own() ? "" : "disabled"}>${log ? "✓" : "○"}</button></div>`;
  } else {
    const row = dayRows[Math.floor(p.week / 3)][slot.day] + slot.index,
      col = 3 + (p.week % 3) * 7;
    for (let g = 0; g < 2; g++) {
      const wc = colName(col + (g ? 4 : 0)),
        sc = colName(col + (g ? 5 : 1)),
        rc = colName(col + (g ? 6 : 2));
      const weight = result(e, wc + row),
        reps = result(e, rc + row),
        n = result(e, sc + row);
      const rpeAddr = colName(col + 3) + row;
      sets += `<div class="block-heading"><span>${g ? "Добивочный блок" : "Основной блок"} <b>${fmt(n)} × ${fmt(reps)}</b></span>${g ? "" : rpeField(rpeAddr, c.overrides[MAIN + "!" + rpeAddr], "RPE блока")}</div>`;
      for (
        let j = 0;
        j < Math.min(10, typeof n === "number" ? Math.max(0, n) : 0);
        j++
      ) {
        const logKey = setKey(p) + ":" + slot.row + ":" + g + "-" + j,
          log = c.logs?.[logKey];
        sets += `<div class="set-row meso-set ${log ? "logged" : ""}"><span class="set-number">${j + 1}</span>${field("Факт, кг", `type="number" inputmode="decimal" min="0" max="1500" step="0.5" data-fact="${logKey}:weight"`, log?.weight ?? c.drafts?.[logKey + ":weight"] ?? "", typeof weight === "number" ? fmt(weight) : (weight ?? "ждём тест"))}${field("Факт, повт.", `type="number" inputmode="numeric" min="1" max="100" step="1" data-fact="${logKey}:reps"`, log?.reps ?? c.drafts?.[logKey + ":reps"] ?? "", typeof reps === "number" ? fmt(reps) : (reps ?? "—"))}<div class="plan-weight"><span>План</span><b>${weight === null ? "—" : fmt(weight)}${typeof weight === "number" ? " кг" : ""}</b><small>${fmt(reps)} повт.</small></div><button class="set-check ${log ? "checked" : ""}" data-action="log" data-slot="${slot.row}" data-set="${g}-${j}" aria-label="Записать ${g}-${j} ${slot.row}" ${own() ? "" : "disabled"}>${log ? "✓" : "○"}</button></div>`;
      }
      if (weight === null)
        sets += `<p class="missing">${g ? "Для добивочного веса укажи RPE основного блока." : "Для рабочего веса заполни тест или RPE предыдущей недели."}</p>`;
    }
  }
  return `<article class="exercise"><header class="exercise-header"><span class="exercise-number">${i + 1}</span><div>${config}<p>${p.phase === "prep" ? esc(result(e, "C" + slot.row) || "Первый рабочий подход") + " · RPE " + esc(result(e, "D" + slot.row) || "7–9") : body ? "Собственный вес" : "Авторегуляция по RPE"}</p></div><button class="exercise-info" data-action="exercise-info" data-slot="${slot.row}" aria-label="Формулы упражнения ${slot.row}">···</button></header><div class="exercise-tools"><label class="rounding-control"><span>${body && p.phase !== "prep" ? "Прибавка, повт." : "Шаг округления, кг"}</span><select data-round="${slot.row}" aria-label="Шаг округления ${slot.row}" ${own() ? "" : "disabled"}>${[1, 2, 2.5, 3, 5].map((n) => `<option value="${n}" ${round === n ? "selected" : ""}>${fmt(n)}</option>`).join("")}</select></label><button data-action="tech-for" data-name="${esc(name.trim())}">↗ Техника</button></div><div class="sets">${sets}</div></article>`;
}
function warmupPanel() {
  return `<details class="warmup-panel"><summary><span class="warmup-symbol">🔥</span><span><b>Сначала разминка</b><small>5–10 минут суставной гимнастики, затем разминочные подходы</small></span><span class="warmup-chevron">⌄</span></summary><div><p>Разогрей суставы, уделяя внимание плечам, позвоночнику и коленям. Перед каждым упражнением выполни разминочные подходы с постепенным повышением веса.</p><p>С небольшим весом обычно достаточно подхода на 8–10 повторений примерно с половиной рабочего веса. Для тяжёлого веса нужны несколько ступеней с уменьшением повторений: 8 → 6 → 4 → 2 → 1.</p><button class="text-button" data-action="warmup-calc">Калькулятор проходки на 1ПМ</button></div></details>`;
}
function buddy() {
  const logs = Object.values(cycle().logs || {}),
    done = cycle().done?.length || 0;
  return buddyHTML({
    sets: logs.length,
    sessions: done,
    rest: cycle().position?.phase === "rest",
  });
}
let deadline = Number(localStorage.getItem("zhmi:timer") || 0),
  paused = 0;
function timerCard(expanded = false) {
  return `<section class="timer-card ${expanded ? "timer-expanded" : ""}">${expanded ? "" : '<div class="timer-card-heading"><h3>Между подходами</h3><button class="text-button" data-action="timer-open">Открыть ↗</button></div>'}${expanded ? `<div class="timer-scene">${buddyHTML({ timer: true })}</div>` : ""}<div class="timer-digits" id="timer-time">03:00</div><div class="timer-options">${[3, 5, 8, 10].map((n) => `<button data-action="timer" data-min="${n}">${n} мин</button>`).join("")}</div><button class="timer-control" data-action="timer-toggle">${deadline ? "Пауза" : paused ? "Продолжить" : "Запустить 3 минуты"}</button><button class="text-button" data-action="timer-stop">Сбросить</button></section>`;
}
function roomMini() {
  const members = room?.access.members() || [];
  return `<section class="mini-room"><div class="section-line"><h3>Братская комната</h3><span>${members.length || 1}</span></div><div class="avatar-stack">${
    members
      .slice(0, 5)
      .map(
        (p) =>
          `<button class="avatar" data-action="member" data-id="${esc(p.id)}" aria-label="Дневник ${esc(p.name)}">${esc(p.avatar)}</button>`,
      )
      .join("") || `<span class="avatar">${esc(state.avatar)}</span>`
  }<button class="avatar invite" data-action="invite" aria-label="Пригласить">＋</button></div><p>Один — тоже команда. Позови друзей, когда захочешь.</p><button class="secondary" data-action="invite">Пригласить по эмодзи</button></section>`;
}
function summary(c) {
  const logs = Object.values(c.logs || {});
  return {
    sets: logs.length,
    reps: logs.reduce((n, l) => n + (+l.reps || 0), 0),
    volume: logs.reduce((n, l) => n + (+l.weight || 0) * (+l.reps || 0), 0),
    sessions: c.done?.length || 0,
  };
}
function progress() {
  const c = cycle(),
    s = summary(c),
    logs = Object.values(c.logs || {}).sort((a, b) => a.at - b.at);
  const dates = [...new Set(logs.map((l) => l.date))].sort();
  const bars = dates.slice(-12).map((d) => ({
    label: d.slice(5),
    value: logs
      .filter((l) => l.date === d)
      .reduce((n, l) => n + (l.weight || 0) * l.reps, 0),
  }));
  return `<div class="page-heading"><div><h1>База растёт<span class="heading-dot">.</span></h1><p>Только твои записанные подходы. Каждый цикл хранится отдельно.</p></div><button class="secondary" data-action="cycles">Архив циклов</button></div><div class="stats-strip">${[
    ["Тренировок", s.sessions],
    ["Подходов", s.sets],
    ["Повторений", s.reps],
    ["Объём, кг", fmt(s.volume)],
  ]
    .map(([l, v]) => `<div><span>${l}</span><strong>${v}</strong></div>`)
    .join(
      "",
    )}</div><section class="panel"><div class="section-line"><h2>Объём тренировок</h2><span>Последние 12 дат</span></div>${bars.length ? barChart(bars) : empty("🌱", "Твой первый подход — начало графика", "Отметь подход галочкой на странице тренировки.")}<p class="muted">Объём = фактический вес × фактические повторения. Подходы со своим весом без указанной массы дают повторения, но не тоннаж.</p></section><section class="panel"><h2>Силовые по упражнениям</h2>${exerciseStats(logs)}</section><section class="panel"><div class="section-line"><h2>История подходов</h2><button class="text-button" data-action="csv">Скачать CSV</button></div>${
    logs.length
      ? `<div class="table-scroll"><table><thead><tr><th>Дата</th><th>Упражнение</th><th>кг</th><th>Повт.</th><th>RPE</th></tr></thead><tbody>${logs
          .slice(-100)
          .reverse()
          .map(
            (l) =>
              `<tr><td>${esc(l.date)}</td><td>${esc(l.name)}</td><td>${fmt(l.weight)}</td><td>${fmt(l.reps)}</td><td>${fmt(l.rpe)}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<p class="muted">Здесь появятся твои рабочие подходы.</p>'
  }</section>`;
}
function barChart(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="bar-chart" role="img" aria-label="График объёма тренировок">${items.map((i, n) => `<div class="bar-column"><span>${fmt(i.value)}</span><div style="height:${Math.max(3, (i.value / max) * 155)}px;background:${["#315bdb", "#78bba2", "#aa9ce3"][n % 3]}" title="${esc(i.label)}: ${fmt(i.value)} кг"></div><small>${esc(i.label)}</small></div>`).join("")}</div>`;
}
function exerciseStats(logs) {
  const names = [...new Set(logs.map((l) => l.name))];
  if (!names.length)
    return '<p class="muted">Сохрани первый подход, чтобы увидеть рекорды и оценку 1ПМ.</p>';
  const e = engine();
  return names
    .map((name) => {
      const ls = logs.filter((l) => l.name === name),
        max = Math.max(...ls.map((l) => l.weight || 0)),
        best = ls
          .map((l) => {
            if (!l.weight || !l.rpe || l.reps > 10 || l.reps < 1) return null;
            const row = 80 + (10 - l.rpe) * 2,
              coef = result(e, colName(29 + l.reps) + row);
            return typeof coef === "number" ? l.weight / coef : null;
          })
          .filter((x) => x !== null);
      return `<div class="record-row"><b>${esc(name)}</b><span>${max ? fmt(max) + " кг" : "Свой вес"}</span><small>1ПМ ≈ ${best.length ? fmt(Math.max(...best)) + " кг" : "нужен RPE и 1–10 повт."}</small></div>`;
    })
    .join("");
}
function empty(emoji, title, text) {
  return `<div class="empty"><span>${emoji}</span><h3>${title}</h3><p>${text}</p></div>`;
}
function devicePanel() {
  if (!room) return "";
  const access = room.access;
  if (access.mode === "existing") {
    const req = access.ownRequest,
      approved = access.approved;
    return `<section class="panel device-panel"><h2>${approved ? "Устройство подтверждено" : req ? "Подтверди новое устройство" : "Войти в свой профиль"}</h2>${
      req
        ? `<p>Профиль: <b>${esc(access.member(req.payload.target)?.name || "Участник")}</b>. Сравни этот код с устройством, которое подтверждает вход.</p><div class="pairing-code">${esc(access.codes[req.payload.requestId] || "Проверяем код…")}</div><p>${approved ? "Разрешение получено. Подтверди, что это твой профиль." : "На своём активном устройстве открой эту комнату и подтверди запрос. Если устройство потеряно, это может сделать знакомый участник, которому профиль уже разрешал восстановление."}</p>${approved ? '<button class="primary" data-action="confirm-device">Это мой профиль, подключить</button>' : '<span class="pill">Ждём подтверждение · запрос действует 10 минут</span>'}`
        : `<p>Выбери себя. Чужой дневник не станет твоим без подтверждения.</p><div class="device-choices">${
            access
              .members()
              .filter((p) => p.id !== ident.id)
              .map(
                (p) =>
                  `<button class="member" data-action="request-device" data-id="${esc(p.id)}"><span class="avatar">${esc(p.avatar)}</span><b>${esc(p.name)}</b><span>Это я</span></button>`,
              )
              .join("") ||
            '<p class="muted">Пока никого не видно. Открой комнату на своём устройстве или устройстве знакомого участника.</p>'
          }</div>`
    }${req && !approved && req.payload.expiresAt < Date.now() ? '<button class="secondary" data-action="renew-device">Запросить новый код</button>' : ""}<button class="text-button" data-action="${req ? "postpone-device" : "cancel-device"}">${req ? "Отложить подключение" : "Войти как новый участник"}</button></section>`;
  }
  const requests = Object.values(access.requests).filter(
    (r) =>
      r.payload.expiresAt > Date.now() &&
      !access.links[r.payload.requester] &&
      access.canApprove(r),
  );
  if (!requests.length) return "";
  return `<section class="panel device-panel"><h2>Запросы на вход</h2>${requests.map((r) => `<div class="device-request"><h3>${esc(access.member(r.payload.target)?.name)} · ${esc(r.payload.label)}</h3><div class="pairing-code">${esc(access.codes[r.payload.requestId] || "…")}</div><p>${access.ownId === r.payload.target ? "Подтверди, если этот же код показан на твоём втором устройстве." : "Восстановление через участника комнаты. Сверьте код лично или в вашем обычном чате. Подтверждение даст доступ ко всему дневнику этого профиля."}</p><button class="primary" data-action="approve-device" data-request="${esc(r.payload.requestId)}">${access.ownId === r.payload.target ? "Подтвердить своё устройство" : "Помочь восстановить профиль"}</button></div>`).join("")}</section>`;
}
function deviceNotice() {
  if (!room || page === "room") return "";
  const pending =
    room.access.mode === "existing" ||
    Object.values(room.access.requests).some(
      (r) =>
        r.payload.expiresAt > Date.now() &&
        !room.access.links[r.payload.requester] &&
        room.access.canApprove(r),
    );
  return pending
    ? '<div class="device-notice"><span>🔐 Есть запрос на подключение устройства</span><button data-action="nav" data-page="room">Открыть</button></div>'
    : "";
}
function devicesModal() {
  const access = room.access,
    ids = [
      ...new Set([
        access.ownId,
        ...Object.values(access.links)
          .filter((l) => l.payload.memberId === access.ownId)
          .map((l) => l.payload.deviceId),
      ]),
    ];
  modal(
    `<h2>Мои устройства</h2><p>Открой приглашение на телефоне или ПК, выбери «Мой существующий профиль» и подтверди одинаковый код.</p>${ids.map((id) => `<div class="record-row"><b>${id === ident.id ? "Это устройство" : id === access.ownId ? "Первое устройство" : "Подключённое устройство"}</b><span>${room.online.has(id) ? "На связи" : "Не в сети"}</span><small>${esc(id.slice(0, 12))}</small></div>`).join("")}<button class="primary" data-action="copy-link">Скопировать приглашение</button><label class="recovery-setting"><input type="checkbox" id="recovery-enabled" ${state.recoveryEnabled !== false ? "checked" : ""}> Разрешить восстановление через знакомых участников комнаты</label><p class="muted">Подтвердить сможет только участник, записанный в подписанном списке доверия до потери устройства. Сейчас в списке: ${state.recoveryMembers?.length || 0}. Если потеряны все устройства и нет такой копии у участников, понадобится резервная копия.</p>`,
  );
}
function joinModal(code = "", invited = false) {
  if (invited) pendingInvite = code;
  modal(
    `<h2>${invited ? "Тебя пригласили в стаю" : "К своим"}</h2>${invited ? "<p>Выбери, как войти в общую комнату. Пока ты остаёшься в своей — приглашение ещё не принято.</p>" : ""}<form id="join-form"><label class="field"><span>10 эмодзи или ссылка-приглашение</span><textarea name="code" required rows="3" placeholder="Вставь приглашение">${esc(code)}</textarea></label><label class="field"><span>Кем войти?</span><select name="entryMode"><option value="new">Новый участник</option><option value="existing">Мой существующий профиль</option></select></label><button class="primary">Войти в комнату</button><p class="muted">Существующий профиль подключается только после подтверждения на своём устройстве или у знакомого участника.</p></form>`,
  );
}
function roomPage() {
  const records = room?.access.members() || [],
    members = records.length ? records : [{ ...state, id: ident.id }];
  return `${devicePanel()}<div class="page-heading"><div><h1>Брат за брата<span class="heading-dot">.</span></h1><p>Тренируйтесь вместе, даже если ваши залы далеко друг от друга.</p></div><button class="primary" data-action="invite">＋ Позвать брата</button></div><section class="room-banner"><div><span class="pill room-status" data-room-status data-status="${presence.state}">${presence.label()}</span><h2>Братская комната</h2><p>Код комнаты — ваше приглашение. Можно заниматься и одному.</p><button class="emoji-code" data-action="copy-code" aria-label="Скопировать эмодзи-код">${esc(state.room)}</button></div><div class="room-gorilla">🦍<span>Качаемся. Общаемся.<br>Сверяем базу.</span></div></section><div class="room-actions"><button class="secondary" data-action="join">Войти по коду</button><button class="secondary" data-action="new-room">Новая комната</button><button class="text-button" data-action="room-history">Мои комнаты</button><button class="text-button" data-action="devices">Мои устройства</button></div><section class="panel"><div class="section-line"><h2>Наш состав</h2><span>${members.length} ${members.length === 1 ? "участник" : "участников"}</span></div><div class="members">${members
    .map((p) => {
      const c = p.cycles?.find((x) => x.id === p.activeCycle) || p.cycles?.[0],
        s = c ? summary(c) : { sessions: 0, sets: 0 };
      return `<button class="member" data-action="member" data-id="${esc(p.id)}"><span class="avatar big">${esc(p.avatar)}</span><div><strong>${esc(p.name)} ${p.id === memberId(ident.id) ? "<small>это ты</small>" : ""}</strong><span><i class="${room?.access.online(p.id) ? "online" : ""}"></i>${room?.access.online(p.id) ? "На связи" : "Сохранённая копия"} · ${s.sessions} тренировок</span><small>${s.sets} подходов${p.updatedAt ? " · " + new Date(p.updatedAt).toLocaleDateString("ru-RU") : ""}</small></div><span>↗</span></button>`;
    })
    .join(
      "",
    )}</div></section><section class="panel"><h2>Совместный тренировочный объём</h2>${members.some((p) => p.cycles?.some((c) => summary(c).sets)) ? barChart(members.map((p) => ({ label: p.name, value: p.cycles?.reduce((n, c) => n + summary(c).volume, 0) || 0 }))) : empty("🤝", "Первый подход за кем?", "График сравнит записанный объём всех участников комнаты.")}<p class="reaction-hint">Три быстрых нажатия одной реакции — дождь для всей комнаты.</p><div class="reactions">${["🦍", "💪", "🍌", "🐺", "🔥", "🦧"].map((e) => `<button data-action="react" data-emoji="${e}" aria-label="Отправить ${e}">${e}</button>`).join("")}</div></section><details class="panel"><summary>Как работает синхронизация</summary><p>Результаты хранятся в браузере и передаются между открытыми вкладками участников через WebRTC (PeerJS). Сервер сигнализации помогает установить связь. Историю уже встречавшихся участников можно просматривать офлайн.</p><p>Для первой встречи и получения новых записей откройте комнату одновременно. Когда участник закроет вкладку, его устройство не принимает обновления. После возвращения копии сверяются по подписанным версиям.</p><p>Код даёт доступ к дневникам комнаты. Не публикуйте приглашение, если хотите оставить их в кругу друзей. В некоторых сетях прямое соединение недоступно; данные сохраняются локально, статус связи показан сверху.</p><button class="text-button" data-action="reconnect">Переподключить комнату</button></details>`;
}
function techPage() {
  const list = data.links
    .filter((l) => ["upper", "lower"].includes(l.group))
    .filter(
      (l) =>
        (group === "all" || l.group === group) &&
        l.title.toLowerCase().includes(search.toLowerCase()),
    );
  return `<div class="page-heading"><div><h1>Сначала техника<span class="heading-dot">.</span></h1><p>Выбери упражнение и открой разбор техники.</p></div><span class="heading-emoji">📖</span></div><div class="search-bar"><span>⌕</span><input id="tech-search" type="search" placeholder="Найти упражнение…" value="${esc(search)}" aria-label="Найти технику упражнения"></div><div class="filter-tabs">${[
    ["all", "Все упражнения"],
    ["upper", "Верх тела"],
    ["lower", "Низ тела"],
  ]
    .map(
      ([k, l]) =>
        `<button data-action="tech-group" data-group="${k}" class="${group === k ? "active" : ""}">${l}</button>`,
    )
    .join(
      "",
    )}</div><div class="tech-grid">${list.map((l) => `<a class="tech-link" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="tech-icon">${l.group === "upper" ? "💪" : "🦵"}</span><div><h3>${esc(l.title)}</h3><span>${l.group === "upper" ? "Верх" : "Низ"} тела · видео-гайд автора</span></div><span>↗</span></a>`).join("")}</div>${!list.length ? empty("🔎", "Такой ссылки в книге нет", "Попробуй другое название: например, «жим» или «тяга».") : ""}<details class="panel"><summary>Ссылки с расчётного листа</summary>${data.formulaLinks.map((l) => `<p><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a><small> · ${esc(l.cell)}</small></p>`).join("")}</details><details class="panel"><summary>Другие программы автора</summary>${data.links
    .filter((l) => l.group === "programs")
    .map(
      (l) =>
        `<p><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></p>`,
    )
    .join("")}</details>`;
}
function calculator() {
  return `<div class="page-heading"><div><h1>Без гадания на блинах<span class="heading-dot">.</span></h1><p>Таблица RPE, оценка 1ПМ и все шесть схем проходки из книги.</p></div></div><div class="filter-tabs">${[
    ["rpe", "RPE → вес"],
    ["warmup", "Проходка на 1ПМ"],
    ["table", "Таблица RPE"],
  ]
    .map(
      ([k, l]) =>
        `<button data-action="calc-mode" data-mode="${k}" class="${calcMode === k ? "active" : ""}">${l}</button>`,
    )
    .join(
      "",
    )}</div>${calcMode === "rpe" ? `<section class="panel calc-panel"><h2>Пересчитать рабочий вес</h2><p>Вес ÷ коэффициент RPE × целевая интенсивность, с округлением.</p><div class="calc-fields">${calcInput("calc-weight", "Вес подхода, кг", 80)}${calcInput("calc-reps", "Повторений", 5, 1, 10, 1)}<label class="field"><span>RPE подхода</span><select id="calc-rpe">${[6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => `<option value="${v}" ${v === 9 ? "selected" : ""}>${fmt(v)}</option>`).join("")}</select></label>${calcInput("calc-percent", "Целевая интенсивность, %", 80, 1, 100, 1)}${calcInput("calc-step", "Шаг округления, кг", 2.5, 0.1, 100, 0.5)}</div><div id="calc-result" class="calc-result"></div></section>` : calcMode === "warmup" ? `<section class="panel"><h2>Разминочные подходы и проходка</h2><div class="calc-fields"><label class="field"><span>Схема из оригинала</span><select id="warmup-mode"><option value="0">Жим до 100 кг</option><option value="1">Жим 100–150 кг</option><option value="2">Жим более 150 кг</option><option value="3">Становая до 200 кг</option><option value="4">Становая 200–250 кг</option><option value="5">Становая свыше 300 кг</option></select></label>${calcInput("warmup-max", "Твой 1ПМ, кг", 95, 1, 1000, 0.5)}</div><div id="warmup-result"></div><p class="muted">Схемы и границы подписаны как в книге. Для становой 250–300 кг отдельной схемы в оригинале нет: автоматический выбор не делаем.</p></section>` : `<section class="panel"><h2>Коэффициенты нагрузки</h2><p>Строка — RPE, столбец — количество повторений. Значения перенесены без изменений.</p>${rpeTable()}</section>`}`;
}
function calcInput(id, label, value, min = 0.5, max = 1500, step = 0.5) {
  return `<label class="field"><span>${label}</span><input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" inputmode="decimal"></label>`;
}
function rpeTable() {
  const e = engine();
  return `<div class="table-scroll"><table class="rpe-table"><thead><tr><th>RPE</th>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: 8 }, (_, j) => `<tr><th>${fmt(10 - j * 0.5)}</th>${Array.from({ length: 10 }, (_, i) => `<td>${fmt(result(e, colName(30 + i) + (80 + j)) * 100)}%</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function calculate() {
  if (page !== "calc") return;
  try {
    if (calcMode === "rpe") {
      const get = (id) => Number(document.getElementById(id).value),
        weight = get("calc-weight"),
        reps = get("calc-reps"),
        rpe = get("calc-rpe"),
        pct = get("calc-percent"),
        step = get("calc-step");
      if (
        !weight ||
        weight < 0 ||
        !Number.isInteger(reps) ||
        reps < 1 ||
        reps > 10 ||
        !step ||
        step < 0 ||
        pct <= 0 ||
        pct > 100
      )
        throw Error(
          "Укажи положительные вес и шаг, 1–10 повторений и интенсивность до 100%.",
        );
      const e = engine(),
        coef = result(e, colName(29 + reps) + (80 + (10 - rpe) * 2)),
        max = weight / coef;
      const out = Math.floor((max * pct) / 100 / step + 0.5 + 1e-10) * step;
      document.querySelector("#calc-result").innerHTML =
        `<div><span>Рабочий вес</span><strong>${fmt(out)} <small>кг</small></strong></div><div><span>Оценка 1ПМ</span><b>${fmt(max)} кг</b><small>Коэффициент ${fmt(coef)}</small></div>`;
    }
    if (calcMode === "warmup") {
      const i = +document.querySelector("#warmup-mode").value,
        weight = +document.querySelector("#warmup-max").value;
      if (weight <= 0) throw Error("Укажи положительный 1ПМ");
      const col = i < 3 ? "D" : "L",
        rc = i % 3 === 0 ? 6 : i % 3 === 1 ? 23 : 42,
        start = rc + 3,
        n = i % 3 === 0 ? 9 : i % 3 === 1 ? 10 : 12;
      const e = new WorkbookEngine(data, {
        ["Калькулятор подходов!" + col + rc]: weight,
      });
      document.querySelector("#warmup-result").innerHTML =
        `<div class="table-scroll"><table><thead><tr><th>Подход</th><th>Вес, кг</th><th>Повторы</th><th>Отдых</th></tr></thead><tbody>${Array.from(
          { length: n },
          (_, j) => {
            const r = start + j;
            return `<tr><td>${j + 1}</td><td><b>${fmt(e.cell("Калькулятор подходов", col + r))}</b></td><td>${fmt(e.cell("Калькулятор подходов", colName((i < 3 ? 4 : 12) + 1) + r))}</td><td>${fmt(e.cell("Калькулятор подходов", colName((i < 3 ? 4 : 12) + 2) + r))}</td></tr>`;
          },
        ).join("")}</tbody></table></div>`;
    }
  } catch (e) {
    const el = document.querySelector(
      calcMode === "rpe" ? "#calc-result" : "#warmup-result",
    );
    if (el) el.textContent = e.message;
  }
}
function helpPage() {
  return `<div class="page-heading"><div><h1>Умная часть качалки<span class="heading-dot">.</span></h1><p>Правила, RPE, коэффициенты и формулы из всех пяти листов.</p></div></div><section class="howto"><div><span>🌱</span><h3>Подготовься</h3><p>2 недели, 3 дня. Выбери упражнения и научись оценивать RPE.</p></div><div><span>🎯</span><h3>Протестируй</h3><p>По одному подходу до технического отказа. Внеси вес и повторения.</p></div><div><span>💪</span><h3>Пройди цикл</h3><p>3 мезоцикла по 3 недели. Оцени основной блок, получи новый вес.</p></div></section><section class="panel"><h2>Что означает RPE</h2>${data.guide.map((g) => `<p>${esc(g.text)}</p>`).join("")}</section><section class="panel"><h2>Все инструкции оригинала</h2>${data.notes.map((n) => `<p class="original-note"><span>${esc(n.cell)}</span>${esc(n.text)}</p>`).join("")}</section><section class="panel"><h2>Сверка с исходной книгой</h2><p>Все 2 260 формул сохранены как формулы и выполняются заново. При проверке исходного состояния совпали 1 429 числовых и текстовых результатов. 831 ожидаемая ошибка исходной книги воспроизвелась. Сохранённые результаты Excel не используются для расчётов приложения. Дополнительно выполнен полный пересчёт временной копии в Microsoft Excel с новыми входными данными: все 2 260 формул дали те же результаты. Проверены 2 268 сочетаний упражнения, недели и показателя, включая все варианты выбора.</p><p>Незаполненные данные отображаются как ожидание ввода. Пробные веса, повторения и RPE очищены. Выбранные упражнения и шаги округления сохранены.</p>${data.issues.map((i) => `<div class="note"><b>${esc(i.cell)}</b><p>${esc(i.text)}</p></div>`).join("")}<p>Подписи упражнений в тесте и мезоциклах связаны с текущим выбором: в исходнике часть подписей была статическим текстом. План считается по исходным формулам, фактические подходы хранятся отдельно. RPE основного блока управляет последующим расчётом, как в Excel.</p><p>Некоторые подготовительные строки (например, подтягивания со своим весом) в оригинале всё равно рассчитывают вес в килограммах. В приложении они сохранены буквально. Отрицательные рекомендации повторений не подменяются положительными: уточни тестовые данные или проверь исходную формулу.</p><button class="secondary" data-action="explorer">Открыть все листы и формулы</button></section><section class="panel"><h2>Автор и исходные материалы</h2><p>Методика и видео: Evolution Yeti. Источник расчётов: «Умная Прога v 8.0 (RPE)». Это самостоятельный интерфейс к предоставленной книге.</p><p><a href="https://boosty.to/yetiblog" target="_blank" rel="noopener">Boosty автора ↗</a></p>${data.links
    .filter((l) => l.group === "programs")
    .map(
      (l) =>
        `<p><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></p>`,
    )
    .join("")}</section>`;
}
function render() {
  const active = document.activeElement;
  let focus;
  for (const attr of [
    "data-cell",
    "data-fact",
    "data-exercise",
    "data-round",
    "data-cal-date",
  ])
    if (active?.hasAttribute(attr)) {
      focus = {
        attr,
        key: active.getAttribute(attr),
        value: active.value,
        start: active.selectionStart,
        end: active.selectionEnd,
        field: active.matches("input,select"),
        dirty: active.dataset.editing === "true",
      };
      break;
    }
  if (active?.matches('button[data-action="log"]'))
    focus = {
      selector: `button[data-action="log"][data-slot="${active.dataset.slot}"][data-set="${active.dataset.set}"]`,
      field: false,
    };
  appShell();
  calculate();
  updateTimer();
  presence.refresh();
  if (focus) {
    const next = document.querySelector(
      focus.selector || `[${focus.attr}="${CSS.escape(focus.key)}"]`,
    );
    if (next && !next.disabled) {
      if (focus.field && focus.dirty) {
        next.value = focus.value;
        next.dataset.editing = "true";
      }
      next.focus({ preventScroll: true });
      if (typeof focus.start === "number" && next.setSelectionRange)
        try {
          next.setSelectionRange(focus.start, focus.end);
        } catch {}
    }
  }
}
function refreshCalculatedInputs() {
  const e = engine();
  for (const input of document.querySelectorAll("input[data-cell]")) {
    const addr = input.dataset.cell;
    if (data.sheets[0].cells[addr]?.f) {
      const value = result(e, addr);
      input.placeholder = value === null ? "ждём данные" : fmt(value);
    }
  }
}
function setPosition(p) {
  if (own()) {
    cycle().position = p;
    commit();
  } else remotePositions[cycle().id] = p;
  render();
}
function saveCell(input) {
  if (!own()) return;
  const addr = input.dataset.cell;
  if (!addr) return;
  let value = input.value === "" ? null : Number(input.value);
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      input.validity?.rangeUnderflow ||
      input.validity?.rangeOverflow ||
      input.validity?.stepMismatch)
  ) {
    toast("Проверь диапазон и шаг значения");
    return false;
  }
  if (value === null) delete cycle().overrides[MAIN + "!" + addr];
  else cycle().overrides[MAIN + "!" + addr] = value;
  delete input.dataset.editing;
  commit();
  return true;
}
function markLog(button) {
  if (!own()) return;
  const c = cycle(),
    p = c.position,
    slot = data.slots.find((s) => s.row === +button.dataset.slot),
    set = button.dataset.set,
    key = setKey(p) + ":" + slot.row + ":" + set;
  if (c.logs[key]) {
    delete c.logs[key];
    c.done = c.done.filter((k) => k !== setKey(p));
    commit();
    render();
    return;
  }
  const e = engine();
  let weight, reps, rpe;
  if (p.phase === "prep") {
    const cols =
      p.week === 0
        ? [
            ["F", "G", "H"],
            ["I", "J", "K"],
            ["L", "M", "N"],
          ]
        : [
            ["O", "P", "Q"],
            ["R", "S", "T"],
            ["U", "V", "W"],
          ];
    const [w, r, rp] = cols[+set];
    weight = slot.row === 81 ? null : result(e, w + slot.row);
    reps = result(e, r + slot.row);
    rpe = result(e, rp + slot.row);
    if (!rpe) return toast("Выбери RPE этого подхода");
  } else if (p.phase === "test") {
    weight = slot.row === 81 ? null : result(e, "C" + slot.testRow);
    reps = result(e, "D" + slot.testRow);
    rpe = 10;
  } else {
    const [g] = set.split("-").map(Number),
      row = dayRows[Math.floor(p.week / 3)][slot.day] + slot.index,
      col = 3 + (p.week % 3) * 7;
    const rowEl = button.closest(".set-row");
    const wInput = rowEl.querySelector('[data-fact$=":weight"]'),
      rInput = rowEl.querySelector('[data-fact$=":reps"]');
    weight =
      wInput.value !== ""
        ? Number(wInput.value)
        : result(e, colName(col + (g ? 4 : 0)) + row);
    reps =
      rInput.value !== ""
        ? Number(rInput.value)
        : result(e, colName(col + (g ? 6 : 2)) + row);
    rpe = g === 0 ? result(e, colName(col + 3) + row) : null;
    if (typeof weight === "string") weight = null;
    if (g === 0 && !rpe) return toast("Укажи RPE основного блока упражнения");
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > 100)
    return toast("Укажи фактические повторения от 1 до 100");
  if (
    slot.row !== 81 &&
    p.phase !== "meso" &&
    (typeof weight !== "number" || weight < 0)
  )
    return toast("Укажи фактический вес");
  if (
    p.phase === "meso" &&
    weight !== null &&
    (typeof weight !== "number" || weight < 0 || weight > 1500)
  )
    return toast("Проверь фактический вес");
  if (
    p.phase === "meso" &&
    weight === null &&
    !selected(slot).includes("собствен") &&
    slot.row !== 81
  )
    return toast("Для этого упражнения нужен фактический вес");
  c.logs[key] = {
    name: selected(slot).trim(),
    slot: slot.row,
    weight,
    reps,
    rpe: typeof rpe === "number" ? rpe : null,
    date: c.dates?.[setKey(p)] || today(),
    at: Date.now(),
    phase: p.phase,
    week: p.week,
    day: p.day,
  };
  commit();
  render();
  celebrateBuddy();
  toast("Подход записан. База!");
}
function finish() {
  const c = cycle(),
    p = c.position,
    key = setKey(p);
  if (!c.done.includes(key)) {
    const e = engine();
    let needed = [];
    for (const s of data.slots.filter(
      (s) => s.day === p.day && selected(s) !== "+",
    )) {
      if (p.phase === "prep")
        for (let j = 0; j < 3; j++) needed.push(key + ":" + s.row + ":" + j);
      else if (p.phase === "test") needed.push(key + ":" + s.row + ":0");
      else {
        const row = dayRows[Math.floor(p.week / 3)][s.day] + s.index,
          col = 3 + (p.week % 3) * 7;
        for (let g = 0; g < 2; g++) {
          const n = result(e, colName(col + (g ? 5 : 1)) + row);
          if (typeof n !== "number")
            return toast(
              "Сначала заполни тестовые результаты для всех упражнений",
            );
          for (let j = 0; j < n; j++)
            needed.push(key + ":" + s.row + ":" + g + "-" + j);
        }
      }
    }
    const missing = needed.filter((k) => !c.logs[k]);
    if (missing.length)
      return toast(`Осталось записать подходов: ${missing.length}`);
    c.done.push(key);
    commit();
    toast("Тренировка завершена. Хорош, брат!");
    emojiRain("💪", 40);
  }
  const next = nextPosition(p);
  if (next) {
    c.position = next;
    commit();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else cyclesModal(true);
}
function cyclesModal(completed = false) {
  const s = person();
  modal(
    `<h2>${completed ? "Круг пройден. Вот это база!" : "Твои циклы"}</h2><p>Новый цикл начинается с пустых результатов. Упражнения и округление переносятся, история остаётся.</p><div class="cycle-list">${s.cycles.map((c) => `<button class="cycle-option" data-action="select-cycle" data-id="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${new Date(c.createdAt).toLocaleDateString("ru-RU")} · ${c.done?.length || 0} тренировок · ${summary(c).sets} подходов</small></span>${c.id === cycle().id ? "✓" : "↗"}</button>`).join("")}</div>${own() ? '<button class="primary" data-action="new-cycle">＋ Начать новый цикл</button>' : ""}`,
  );
}
function profileModal() {
  modal(
    `<h2>Это ты, брат</h2><form id="profile-form"><label class="field"><span>Как тебя зовут?</span><input name="name" maxlength="32" required value="${esc(state.name)}"></label><label class="field"><span>Аватар</span><select name="avatar">${EMOJIS.map((e) => `<option ${state.avatar === e ? "selected" : ""}>${e}</option>`).join("")}</select></label><button class="primary">Сохранить профиль</button></form><hr><h3>Устройства и обновления</h3><div class="button-row"><button class="secondary" data-action="devices">Мои устройства</button><button class="secondary" data-check-updates>Проверить обновления</button></div><p class="muted">Версия ${APP_VERSION}. При выходе новой версии появится кнопка «Обновиться».</p><h3>Резервная копия</h3><p>История хранится на этом устройстве. Экспортируй её перед очисткой браузера или переносом на другой телефон.</p><div class="button-row"><button class="secondary" data-action="export">Скачать JSON</button><label class="secondary file-label">Восстановить<input type="file" id="import-file" accept="application/json" hidden></label></div><p class="muted">В копии — твои тренировки и коды комнат. Личный ключ подписи остаётся на устройстве. На другом устройстве импорт создаст дневник с его собственной подписью.</p>`,
  );
}
function exerciseModal(row) {
  const s = data.slots.find((s) => s.row === row),
    c = cycle(),
    e = engine(),
    p = c.position;
  const addrs =
    p.phase === "prep"
      ? ["I", "L", "O", "R", "U"].map((col) => col + row)
      : p.phase === "test"
        ? ["B", "C", "D"].map((col) => col + s.testRow)
        : ["C", "D", "E", "G", "H", "I"].map(
            (col) => col + (dayRows[Math.floor(p.week / 3)][s.day] + s.index),
          );
  modal(
    `<h2>${esc(selected(s).trim())}</h2><label class="field"><span>Шаг округления, кг / прибавка повторений</span><select data-round="${row}" ${own() ? "" : "disabled"}>${[1, 2, 2.5, 3, 5].map((n) => `<option value="${n}" ${(c.overrides[MAIN + "!E" + row] ?? s.round) === n ? "selected" : ""}>${fmt(n)}</option>`).join("")}</select></label><p>Для штанги обычно 2,5 кг; для гантелей 1–2 кг. В упражнениях со своим весом шаг используется по исходной формуле.</p><h3>Расчёты этого упражнения</h3>${addrs
      .map((a) => {
        const r = e.get(MAIN, a),
          f = data.sheets[0].cells[a]?.f;
        return `<details class="formula"><summary>${esc(a)} = ${esc(fmt(r.value))}</summary><code>${esc(f || "Ручной ввод")}</code>${r.error ? `<p class="missing">${esc(r.error)} · ${esc(r.cell)}</p>` : ""}</details>`;
      })
      .join(
        "",
      )}<p class="muted">Полные зависимости находятся в просмотре всех листов.</p><button class="secondary" data-action="explorer">Все формулы</button>`,
  );
}
function explorer() {
  const s = data.sheets[explorerSheet],
    e = engine(),
    rows = Object.entries(s.cells)
      .filter(([a]) => {
        const r = +a.match(/\d+/)[0];
        return r >= explorerFrom && r < explorerFrom + 25;
      })
      .sort(
        ([a], [b]) =>
          +a.match(/\d+/)[0] - +b.match(/\d+/)[0] ||
          a.length - b.length ||
          a.localeCompare(b),
      );
  modal(
    `<h2>Листы оригинала</h2><div class="explorer-controls"><select id="explorer-sheet" aria-label="Лист">${data.sheets.map((s, i) => `<option value="${i}" ${i === explorerSheet ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select><label class="field"><span>С первой строки</span><input id="explorer-from" aria-label="С первой строки" type="number" min="1" max="300" value="${explorerFrom}"></label><button data-action="explorer-go" class="secondary">Показать</button></div><div class="table-scroll explorer-table"><table><thead><tr><th>Ячейка</th><th>Значение</th><th>Формула</th></tr></thead><tbody>${rows
      .map(([a, c]) => {
        const r = e.get(s.name, a);
        return `<tr><th>${a}</th><td>${r.error ? `<span title="${esc(r.cell)}">${esc(r.error)}</span>` : esc(fmt(r.value))}</td><td><code>${esc(c.f ? "=" + c.f : "Ручное значение")}</code></td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="muted">Показаны строки ${explorerFrom}–${explorerFrom + 24}. Пробные данные очищены. Результаты пересчитаны для выбранного дневника.</p>`,
  );
}
async function clipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Скопировано");
  } catch {
    modal(
      `<h2>Скопируй приглашение</h2><textarea readonly rows="5">${esc(text)}</textarea>`,
    );
  }
}
function invitation() {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "room=" + encodeURIComponent(state.room);
  return u.href;
}
function confirmDeclineInvite() {
  modal(
    '<h2>Не входить в стаю?</h2><p>Ты был приглашён в общую комнату. Если закроешь приглашение, останешься в своей комнате и не увидишь результаты друзей.</p><div class="button-row"><button class="primary" data-action="invite-back">Вернуться к приглашению</button><button class="secondary" data-action="invite-decline">Остаться в своей комнате</button></div>',
  );
}
dialog.addEventListener("cancel", (event) => {
  if (pendingInvite) {
    event.preventDefault();
    confirmDeclineInvite();
  }
});
function invite() {
  modal(
    `<h2>Зови в качалку</h2><p>Отправь другу ссылку или все 10 эмодзи. Для первой синхронизации откройте комнату одновременно.</p><div class="emoji-code">${esc(state.room)}</div><button class="primary" data-action="copy-link">Скопировать ссылку</button><button class="secondary" data-action="copy-code">Скопировать эмодзи-код</button>`,
  );
}
function download(text, name, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function changeRoom(code, mode = "new") {
  if (!own()) {
    viewId = ident.id;
    viewCycle = null;
  }
  room?.stop();
  presence.state = "connecting";
  presence.candidate = null;
  state.room = code;
  let history = JSON.parse(localStorage.getItem("zhmi:rooms") || "[]");
  history = [code, ...history.filter((c) => c !== code)].slice(0, 30);
  localStorage.setItem("zhmi:rooms", JSON.stringify(history));
  commit();
  const u = new URL(location.href);
  u.hash = "";
  historyReplace(u);
  room = new Room(
    code,
    ident,
    () => {
      if (room.access.mode !== "existing") {
        const payloads = Object.values(room.records)
          .filter(
            (r) => room.access.canonical(r.payload.id) === room.access.ownId,
          )
          .map((r) => r.payload);
        const merged = mergeDiaries([...payloads, state]);
        if (!sameRegisters(merged, state)) {
          state = {
            ...merged,
            room: state.room,
            rev: Math.max(Date.now(), state.rev + 1),
          };
          committedState = structuredClone(state);
          localStorage.setItem("zhmi:state", JSON.stringify(state));
          room.publish(structuredClone(state));
        }
        const contacts = room.access
          .members()
          .map((p) => p.id)
          .filter((id) => id !== room.access.ownId);
        if (
          state.recoveryEnabled !== false &&
          contacts.some((id) => !state.recoveryMembers?.includes(id))
        ) {
          state.recoveryMembers = [
            ...new Set([...(state.recoveryMembers || []), ...contacts]),
          ];
          commit();
        }
      }
      if (!dialog.open) render();
    },
    (s) => {
      status = s;
      const el = document.querySelector("#connection-text");
      if (el) el.textContent = s;
      presence.refresh();
    },
  );
  const savedMode = localStorage.getItem("zhmi:entry-mode:" + room.code);
  if (
    mode === "existing" ||
    (savedMode === "existing" && !room.access.links[ident.id])
  )
    room.access.mode = "existing";
  localStorage.setItem("zhmi:entry-mode:" + room.code, room.access.mode);
  room.onReaction = roomReaction;
  room.publish(structuredClone(state));
}
function historyReplace(u) {
  window.history.replaceState(null, "", u);
}
function reaction(emoji) {
  const el = document.createElement("span");
  el.textContent = emoji;
  el.style.left = 20 + Math.random() * 60 + "%";
  document.querySelector("#reactions").append(el);
  setTimeout(() => el.remove(), 2000);
}
const reactionRuns = new Map();
function roomReaction(emoji) {
  const now = Date.now(),
    previous = reactionRuns.get(emoji);
  const count = previous && now - previous.at < 1500 ? previous.count + 1 : 1;
  reactionRuns.set(emoji, { at: now, count });
  reaction(emoji);
  if (count >= 3) {
    reactionRuns.delete(emoji);
    emojiRain(emoji, 36);
  }
}
let nextRain = 0;
function emojiRain(emoji, count = 30) {
  if (Date.now() < nextRain) return;
  nextRain = Date.now() + 1800;
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) {
    toast(`${emoji}${emoji}${emoji} Команда поддерживает!`);
    return;
  }
  const layer = document.querySelector("#reactions");
  for (let i = 0; i < Math.min(count, 48); i++)
    setTimeout(() => {
      if (layer.children.length > 65) return;
      const el = document.createElement("span");
      el.className = "emoji-rain";
      el.textContent = emoji;
      const duration = 2200 + Math.random() * 1000;
      el.style.left = Math.random() * 95 + "%";
      el.style.fontSize = 25 + Math.random() * 28 + "px";
      el.style.setProperty("--fall-duration", duration + "ms");
      el.style.setProperty("--fall-drift", -35 + Math.random() * 70 + "px");
      layer.append(el);
      setTimeout(() => el.remove(), duration + 150);
    }, i * 23);
}
function updateTimer() {
  const left = deadline
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : paused || 180,
    text = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  document
    .querySelectorAll("#timer-time")
    .forEach((el) => (el.textContent = text));
  const mobile = document.querySelector("#mobile-time");
  if (mobile) mobile.textContent = deadline || paused ? text : "Отдых";
  if (deadline && left === 0) {
    deadline = 0;
    localStorage.removeItem("zhmi:timer");
    toast("Отдых окончен. Готов к подходу?");
    emojiRain("🔥", 28);
    document
      .querySelectorAll(".timer-control")
      .forEach((control) => (control.textContent = "Запустить 3 минуты"));
  }
  refreshBuddyMood();
}
setInterval(updateTimer, 1000);
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (b.tagName === "A") event.preventDefault();
  if (a === "close") {
    if (pendingInvite) {
      confirmDeclineInvite();
      return;
    }
    dialog.close();
    render();
  } else if (a === "connection") {
    presence.open();
  } else if (a === "invite-back") {
    joinModal(pendingInvite, true);
  } else if (a === "invite-decline") {
    pendingInvite = null;
    dialog.close();
    const u = new URL(location.href);
    u.hash = "";
    historyReplace(u);
    toast("Ты в своей комнате. Приглашение можно открыть снова.");
  } else if (a === "theme") {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("zhmi:theme", dark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]').content = dark
      ? "#142331"
      : "#315bdb";
    b.textContent = dark ? "☀️" : "🌙";
    b.setAttribute("aria-pressed", String(dark));
    b.setAttribute(
      "aria-label",
      dark ? "Включить светлую тему" : "Включить тёмную тему",
    );
  } else if (a.startsWith("cal-")) {
    if (a === "cal-remove-schedule") {
      state.calendar ??= { training: {}, workOverrides: {} };
      state.calendar.schedule = null;
      commit();
      dialog.close();
      render();
      toast("Автографик убран");
    } else calendarView.action(a, b);
  } else if (a === "warmup-calc") {
    page = "calc";
    calcMode = "warmup";
    render();
    window.scrollTo(0, 0);
  } else if (a === "nav") {
    page = b.dataset.page;
    if (page === "calendar") {
      viewId = ident.id;
      viewCycle = null;
    }
    search = "";
    render();
    window.scrollTo(0, 0);
  } else if (a === "own") {
    viewId = ident.id;
    viewCycle = null;
    render();
  } else if (a === "phase") {
    setPosition({ phase: b.dataset.phase, week: 0, day: 0 });
  } else if (a === "day")
    setPosition({ ...cycle().position, day: +b.dataset.day });
  else if (a === "copy-exercises-open") copyExercisesModal();
  else if (a === "copy-exercises" && pendingExercises) {
    if (b.dataset.target === "new" && state.cycles.length >= 100)
      return toast("В дневнике уже 100 циклов");
    const existing =
      state.cycles.find((c) => c.id === pendingExercises.target) ||
      state.cycles[0];
    const target = b.dataset.target === "new" ? freshCycle(existing) : existing;
    if (b.dataset.target === "new") {
      target.name = "Цикл " + (state.cycles.length + 1);
      state.cycles.push(target);
    }
    for (const item of pendingExercises.choices)
      target.overrides[MAIN + "!B" + item.row] = item.name;
    state.activeCycle = target.id;
    viewId = ident.id;
    viewCycle = target.id;
    page = "train";
    pendingExercises = null;
    commit();
    dialog.close();
    render();
    toast("Упражнения взяты. Результаты остаются твоими.");
  } else if (a === "profile") profileModal();
  else if (a === "rpe-help")
    modal(
      `<h2>Оцени усилие, брат</h2>${data.guide
        .slice(1, 9)
        .map((g) => `<p>${esc(g.text)}</p>`)
        .join("")}`,
    );
  else if (a === "exercise-info") exerciseModal(+b.dataset.slot);
  else if (a === "log") markLog(b);
  else if (a === "finish") finish();
  else if (a === "rest-done") setPosition({ phase: "meso", week: 3, day: 0 });
  else if (a === "cycles") cyclesModal();
  else if (a === "select-cycle") {
    viewCycle = b.dataset.id;
    if (own()) {
      state.activeCycle = viewCycle;
      commit();
    }
    dialog.close();
    render();
  } else if (a === "new-cycle" && own()) {
    if (state.cycles.length >= 100)
      return toast("В дневнике уже 100 циклов. Сохрани резервную копию.");
    const c = freshCycle(cycle());
    c.name = "Цикл " + (state.cycles.length + 1);
    state.cycles.push(c);
    state.activeCycle = c.id;
    viewCycle = c.id;
    commit();
    dialog.close();
    render();
    toast("Новый круг. История сохранена.");
  } else if (a === "tech-for") {
    page = "tech";
    const name = b.dataset.name;
    search = name.includes("Жим")
      ? "Жим"
      : name.includes("Тяга")
        ? "Тяга"
        : name.split(" ")[0];
    group = "all";
    render();
  } else if (a === "tech-group") {
    group = b.dataset.group;
    render();
  } else if (a === "calc-mode") {
    calcMode = b.dataset.mode;
    render();
  } else if (a === "explorer") {
    if (dialog.open) dialog.close();
    explorer();
  } else if (a === "explorer-go") {
    explorerSheet = +document.querySelector("#explorer-sheet").value;
    explorerFrom = Math.min(
      300,
      Math.max(1, +document.querySelector("#explorer-from").value || 1),
    );
    dialog.close();
    explorer();
  } else if (a === "invite") invite();
  else if (a === "copy-link") clipboard(invitation());
  else if (a === "copy-code") clipboard(state.room);
  else if (a === "join") joinModal();
  else if (a === "devices") devicesModal();
  else if (a === "request-device") {
    try {
      await room.access.request(
        b.dataset.id,
        /Mobi|Android/i.test(navigator.userAgent) ? "Телефон" : "Компьютер",
      );
      render();
    } catch (e) {
      toast(e.message);
    }
  } else if (a === "approve-device") {
    try {
      await room.access.approve(b.dataset.request);
      toast("Устройство подтверждено. Заверши вход на нём.");
      render();
    } catch (e) {
      toast(e.message);
    }
  } else if (a === "confirm-device") {
    try {
      const adopted = room.access.confirm();
      if (!adopted || !validDiary(adopted))
        throw Error("Дневник ещё не загружен");
      localStorage.setItem("zhmi:before-device-link", JSON.stringify(state));
      state = {
        ...adopted,
        room: state.room,
        rev: Math.max(Date.now(), state.rev + 1),
      };
      delete state.id;
      committedState = structuredClone(state);
      viewId = ident.id;
      viewCycle = null;
      localStorage.setItem("zhmi:entry-mode:" + room.code, "new");
      commit();
      room.publish(structuredClone(state));
      page = "train";
      render();
      toast("Телефон и ПК теперь используют один профиль");
    } catch (e) {
      toast(e.message);
    }
  } else if (a === "renew-device") {
    try {
      const req = room.access.ownRequest;
      await room.access.request(req.payload.target, req.payload.label);
      render();
    } catch (e) {
      toast(e.message);
    }
  } else if (a === "postpone-device") {
    const { newCode } = await import("./rooms.js");
    changeRoom(newCode());
    page = "room";
    render();
  } else if (a === "cancel-device") {
    room.access.cancel();
    localStorage.setItem("zhmi:entry-mode:" + room.code, "new");
    room.publish(structuredClone(state));
    render();
  } else if (a === "new-room") {
    modal(
      '<h2>Начать свою комнату</h2><p>Твой дневник сохранится. Результаты старой комнаты останутся в её локальной копии.</p><button class="primary" data-action="confirm-new-room">Создать комнату</button>',
    );
  } else if (a === "confirm-new-room") {
    const { newCode } = await import("./rooms.js");
    changeRoom(newCode());
    page = "room";
    dialog.close();
    render();
  } else if (a === "room-history") {
    const list = JSON.parse(localStorage.getItem("zhmi:rooms") || "[]");
    modal(
      `<h2>Мои комнаты</h2>${list.map((code) => `<button class="room-history" data-action="switch-room" data-code="${esc(code)}">${esc(code)} ${code === state.room ? "✓" : ""}</button>`).join("")}`,
    );
  } else if (a === "switch-room") {
    changeRoom(b.dataset.code);
    dialog.close();
    render();
  } else if (a === "member") {
    viewId = b.dataset.id;
    viewCycle = null;
    page = "train";
    render();
    window.scrollTo(0, 0);
  } else if (a === "react") room.react(b.dataset.emoji);
  else if (a === "reconnect") {
    room.claim();
    toast("Переподключаемся…");
  } else if (a === "buddy") {
    reaction("✋");
    toast("Есть контакт, брат!");
  } else if (a === "timer-open")
    modal(
      `<h2>Перерыв между подходами</h2>${timerCard(true)}<p class="timer-advice"> Отдых 3–5 минут на лёгких неделях, 5–10 минут для тяжёлых подходов. Ориентируйся на восстановление.</p>`,
    );
  else if (a === "timer") {
    deadline = Date.now() + Number(b.dataset.min) * 60000;
    paused = 0;
    localStorage.setItem("zhmi:timer", deadline);
    notifyBuddyTimer();
    updateTimer();
    document
      .querySelectorAll(".timer-control")
      .forEach((x) => (x.textContent = "Пауза"));
  } else if (a === "timer-toggle") {
    if (deadline) {
      paused = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
      deadline = 0;
      localStorage.removeItem("zhmi:timer");
    } else {
      deadline = Date.now() + (paused || 180) * 1000;
      paused = 0;
      localStorage.setItem("zhmi:timer", deadline);
    }
    document
      .querySelectorAll(".timer-control")
      .forEach((x) => (x.textContent = deadline ? "Пауза" : "Продолжить"));
    notifyBuddyTimer();
    updateTimer();
  } else if (a === "timer-stop") {
    deadline = 0;
    paused = 0;
    localStorage.removeItem("zhmi:timer");
    document
      .querySelectorAll(".timer-control")
      .forEach((x) => (x.textContent = "Запустить 3 минуты"));
    notifyBuddyTimer();
    updateTimer();
  } else if (a === "export") {
    download(
      JSON.stringify({ format: "zhmi-brat-v1", state }, null, 2),
      "zhmi-brat-backup.json",
    );
  } else if (a === "csv") {
    const ls = Object.values(cycle().logs || {});
    const q = (s) => '"' + String(s ?? "").replaceAll('"', '""') + '"';
    download(
      "\uFEFF" +
        [
          ["Дата", "Упражнение", "Вес", "Повторения", "RPE"],
          ...ls.map((l) => [l.date, l.name, l.weight, l.reps, l.rpe]),
        ]
          .map((r) => r.map(q).join(";"))
          .join("\r\n"),
      "zhmi-brat-workouts.csv",
      "text/csv;charset=utf-8",
    );
  }
});
document.addEventListener("change", (event) => {
  const t = event.target;
  if (t.dataset.fact) delete t.dataset.editing;
  if (t.id === "schedule-preset") {
    const preset = SCHEDULES.find((p) => p.id === t.value),
      form = t.form;
    if (preset) {
      form.elements.work.value = preset.work;
      form.elements.rest.value = preset.rest;
    }
    const weekly = preset?.type === "weekdays";
    form.elements.anchor.required = !weekly;
    if (weekly && !form.elements.anchor.value)
      form.elements.anchor.value = today();
    form.querySelector(".schedule-counts").hidden = weekly;
    form.elements.anchor.closest("label").hidden = weekly;
    return;
  }
  if (t.dataset.cell) {
    if (saveCell(t)) {
      if (t.tagName === "SELECT") render();
      else refreshCalculatedInputs();
    }
  } else if (t.dataset.exercise && own()) {
    const row = +t.dataset.exercise,
      slot = data.slots.find((s) => s.row === row);
    if (!slot.options.some((o) => o.name === t.value)) return;
    cycle().overrides[MAIN + "!B" + row] = t.value;
    commit();
    render();
  } else if (t.id === "week")
    setPosition({ ...cycle().position, week: +t.value });
  else if (t.hasAttribute("data-date") && own()) {
    cycle().dates ??= {};
    cycle().dates[setKey(cycle().position)] = t.value;
    commit();
  } else if (t.dataset.round && own()) {
    cycle().overrides[MAIN + "!E" + t.dataset.round] = Number(t.value);
    commit();
    if (!dialog.open) render();
    toast("Шаг сохранён, веса пересчитаны");
  } else if (t.id === "recovery-enabled" && own()) {
    state.recoveryEnabled = t.checked;
    commit();
    toast("Настройка восстановления сохранена");
  } else if (t.id === "import-file") importBackup(t.files[0]);
  else if (t.id === "warmup-mode") {
    const defaults = [95, 140, 160, 150, 220, 310];
    document.querySelector("#warmup-max").value = defaults[+t.value];
    calculate();
  } else if (page === "calc") calculate();
});
document.addEventListener("input", (event) => {
  if (event.target.dataset.cell || event.target.dataset.fact)
    event.target.dataset.editing = "true";
  if (event.target.dataset.fact && own()) {
    cycle().drafts ??= {};
    cycle().drafts[event.target.dataset.fact] = event.target.value;
    commit();
    return;
  }
  if (event.target.id === "tech-search") {
    const pos = event.target.selectionStart;
    search = event.target.value;
    const main = document.querySelector("#main");
    main.innerHTML = techPage();
    const t = document.querySelector("#tech-search");
    t.focus();
    t.setSelectionRange(pos, pos);
  } else if (page === "calc") calculate();
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const f = event.target;
  if (f.id === "schedule-form") {
    try {
      calendarView.saveSchedule(f);
      dialog.close();
      render();
    } catch (e) {
      toast(e.message);
    }
    return;
  }
  if (f.id === "profile-form") {
    state.name = f.elements.name.value.trim().slice(0, 32) || "Брат";
    state.avatar = f.elements.avatar.value;
    commit();
    dialog.close();
    render();
  } else if (f.id === "join-form") {
    try {
      const code = parseRoom(f.elements.code.value);
      pendingInvite = null;
      changeRoom(code, f.elements.entryMode?.value || "new");
      page = "room";
      dialog.close();
      render();
    } catch (e) {
      toast(e.message);
    }
  }
});
async function importBackup(file) {
  if (!file) return;
  try {
    if (file.size > 10000000) throw Error("Файл слишком большой");
    const saved = JSON.parse(await file.text());
    if (saved.format !== "zhmi-brat-v1" || !saved.state?.cycles?.length)
      throw Error("Это не резервная копия «ЖМИ, БРАТ»");
    const incoming = saved.state;
    if (!validDiary(incoming))
      throw Error("В резервной копии некорректные данные");
    if (incoming.cycles.length > 100) throw Error("Слишком много циклов");
    if (state.cycles.length + incoming.cycles.length > 100)
      throw Error("После импорта получится больше 100 циклов");
    for (const c of incoming.cycles) {
      if (
        typeof c.id !== "string" ||
        !c.overrides ||
        !c.logs ||
        !Array.isArray(c.done)
      )
        throw Error("Некорректный цикл");
    }
    for (const c of incoming.cycles)
      if (!state.cycles.some((x) => x.id === c.id)) state.cycles.push(c);
      else {
        const copy = {
          ...c,
          id: uid(),
          name: (c.name || "Цикл") + " (импорт)",
        };
        state.cycles.push(copy);
      }
    if (incoming.calendar) {
      const current = state.calendar || {};
      state.calendar = {
        schedule:
          current.schedule ||
          structuredClone(incoming.calendar.schedule || null),
        training: {
          ...(incoming.calendar.training || {}),
          ...(current.training || {}),
        },
        workOverrides: {
          ...(incoming.calendar.workOverrides || {}),
          ...(current.workOverrides || {}),
        },
      };
    }
    commit();
    dialog.close();
    render();
    toast("Данные добавлены. Текущая история сохранена.");
  } catch (e) {
    toast(e.message);
  }
}
window.addEventListener("storage", (event) => {
  if (event.key === "zhmi:state") {
    try {
      const s = JSON.parse(event.newValue);
      if (s.rev > state.rev) {
        const roomChanged = s.room !== state.room;
        state = s;
        if (roomChanged) changeRoom(s.room);
        render();
      }
    } catch {}
  }
});
const inviteCode = new URLSearchParams(location.hash.slice(1)).get("room");
installBuddy({
  resting: () => cycle().position?.phase === "rest",
  sessions: () => state.cycles.reduce((n, c) => n + (c.done?.length || 0), 0),
  timer: () => ({
    active: !!deadline,
    paused: !!paused,
    left: deadline
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : paused || 180,
  }),
  reaction,
  toast,
  stats: () =>
    `Подходы: ${Object.keys(cycle().logs || {}).length}. Тренировки: ${cycle().done?.length || 0}.`,
});
changeRoom(state.room);
render();
if (inviteCode) {
  try {
    const code = parseRoom(inviteCode);
    if (code !== state.room) joinModal(code, true);
  } catch {
    toast("В приглашении неверный код");
  }
}
window.addEventListener("hashchange", () => {
  const invite = new URLSearchParams(location.hash.slice(1)).get("room");
  if (!invite) return;
  try {
    const code = parseRoom(invite);
    if (code !== state.room) joinModal(code, true);
  } catch {
    toast("В приглашении неверный код");
  }
});
initUpdates({
  save: async () => {
    commit();
    await room?.publish(structuredClone(state));
  },
  toast,
});
export function connectionDiagnostics() {
  return {
    peer: {
      wire: room.lastWireBytes,
      maxMessage: room.lastMaxMessageSize,
      error: room.lastConnectionError,
      stopped: room.stopped,
      lastTick: room.lastTick,
      online: navigator.onLine,
      open: room.peer?.open,
      hub: room.isHub,
      id: room.peer?.id,
      connections: [...room.connections.values()].map((c) => ({
        open: c.open,
        peer: c.peer,
        lastSeen: c.lastSeen,
      })),
    },
    device: ident.id,
    member: room.access.ownId,
    mode: room.access.mode,
    status,
    links: Object.keys(room.access.links),
    requests: Object.values(room.access.requests).map((r) => ({
      request: r.payload,
      canApprove: room.access.canApprove(r),
    })),
    members: room.access.members().map((p) => ({
      id: p.id,
      name: p.name,
      recoveryEnabled: p.recoveryEnabled,
      recoveryMembers: p.recoveryMembers,
    })),
  };
}
