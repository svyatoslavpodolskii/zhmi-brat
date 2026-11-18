import {
  calendarOf,
  completedDates,
  dateNumber,
  dateString,
  monthDates,
  monthShift,
  isWorkDay,
  automaticWork,
  trainingStatus,
  monthSummary,
  SCHEDULES,
} from "./calendar.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (date) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
export class CalendarView {
  constructor(api) {
    this.api = api;
    this.month = api.today().slice(0, 7);
    this.selected = api.today();
    this.mode = "planned";
    this.installGestures();
  }
  members() {
    const own = this.api.own(),
      others = this.api.members().filter((p) => p.id !== own.id);
    return [own, ...others];
  }
  html() {
    const person = this.api.own(),
      members = this.members(),
      cal = calendarOf(person),
      dates = monthDates(this.month),
      summary = monthSummary(person, this.month, members),
      start = dateNumber(dates[0]),
      offset = (new Date(start * 86400000).getUTCDay() + 6) % 7,
      group = members.length > 1;
    const done = completedDates(person),
      monthTitle = new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(dates[0] + "T00:00:00Z"));
    const memberDates = new Map(members.map((p) => [p.id, completedDates(p)]));
    const schedule = cal.schedule;
    return `<div class="page-heading"><div><h1>Когда жмём<span class="heading-dot">?</span></h1><p>${group ? "Один календарь на всю стаю. Совпали все — день подсвечивается." : "Отметь тренировки и рабочие дни. Твой ритм — твои правила."}</p></div><span class="calendar-mascots" aria-hidden="true">🦍🐺</span></div><section class="calendar-sheet"><div class="calendar-month"><button data-action="cal-prev" aria-label="Предыдущий месяц">‹</button><h2>${esc(monthTitle)}</h2><button data-action="cal-next" aria-label="Следующий месяц">›</button><button class="text-button" data-action="cal-today">Сегодня</button></div><div class="calendar-team">${members.map((p) => `<span title="${esc(p.name)}"><span class="calendar-avatar">${esc(p.avatar)}</span>${esc(p.name)}${p.id === person.id ? " <small>ты</small>" : ""}</span>`).join("")}</div><div class="calendar-modes" aria-label="Что отмечать">${[
      ["planned", "🏋️", "План"],
      ["done", "✓", "Сделано"],
      ["work", "💼", "Работа"],
      ["view", "👀", "Смотреть"],
    ]
      .map(
        ([mode, icon, name]) =>
          `<button data-action="cal-mode" data-mode="${mode}" aria-pressed="${this.mode === mode}" class="${this.mode === mode ? "active" : ""}"><span>${icon}</span>${name}</button>`,
      )
      .join(
        "",
      )}</div><p class="calendar-hint">${this.mode === "view" ? "Тапни день, чтобы посмотреть состав." : "Тап — отметка выбранного типа. Зажми день — переключи работу."}</p><div class="calendar-weekdays" aria-hidden="true">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar-grid" aria-label="Календарь ${esc(monthTitle)}">${Array.from({ length: offset }, () => '<span class="calendar-gap" aria-hidden="true"></span>').join("")}${dates
      .map((date) => {
        const mine = trainingStatus(person, date, done),
          work = isWorkDay(date, cal),
          peers = members.filter((p) =>
            trainingStatus(p, date, memberDates.get(p.id)),
          ),
          all = group && peers.length === members.length;
        return `<button class="calendar-day ${mine ? "has-training " + mine : ""} ${work ? "work-day" : ""} ${all ? "whole-team" : ""} ${date === this.api.today() ? "is-today" : ""} ${date === this.selected ? "selected" : ""}" data-action="cal-day" data-cal-date="${date}" aria-label="${esc(label(date))}${work ? ", рабочий день" : ""}${mine === "done" ? ", тренировка выполнена" : mine ? ", тренировка в плане" : ""}${peers.length ? ", тренируются: " + esc(peers.map((p) => p.name).join(", ")) : ""}${all ? ", вся группа" : ""}" aria-pressed="${!!mine}"><span class="calendar-day-top"><span>${+date.slice(-2)}</span>${work ? '<span class="work-mark" aria-label="Рабочий день">💼</span>' : ""}${all ? '<span class="team-check" aria-label="Совпала вся группа">✓</span>' : ""}</span><span class="calendar-day-emojis">${peers
          .slice(0, 4)
          .map((p) => `<span title="${esc(p.name)}">${esc(p.avatar)}</span>`)
          .join(
            "",
          )}${peers.length > 4 ? `<small>+${peers.length - 4}</small>` : ""}</span><span class="calendar-day-status">${mine === "done" ? "✓" : mine ? "•" : ""}</span></button>`;
      })
      .join(
        "",
      )}</div><div class="calendar-legend"><span><i class="legend-plan"></i>Твой план</span><span><i class="legend-done"></i>Сделано</span><span><i class="legend-work"></i>Работа</span>${group ? '<span><i class="legend-team"></i>Вся стая ✓</span>' : ""}</div></section><section class="calendar-summary">${[
      ["Рабочих", summary.work],
      ["Выходных", summary.free],
      ["В плане", summary.planned],
      ["Сделано", summary.completed],
    ]
      .map(
        ([name, n]) => `<div><strong>${n}</strong><span>${name}</span></div>`,
      )
      .join(
        "",
      )}</section><section class="schedule-strip"><span>💼</span><div><h3>${schedule ? (schedule.type === "weekdays" ? "Работаю по будням" : `${schedule.work} рабочих / ${schedule.rest} выходных`) : "Твой рабочий график"}</h3><p>${schedule ? `Отсчёт: ${esc(schedule.anchor.split("-").reverse().join("."))}. Дни отмечаются автоматически.` : "Сутки через трое, 5/2, 4/2 — выбери ритм один раз."}</p></div><button class="secondary" data-action="cal-schedule">${schedule ? "Изменить" : "Настроить"}</button></section>${this.dayDetails()}<div class="calendar-footer"><button class="text-button" data-action="nav" data-page="progress">📈 Статистика тренировок</button><span>🦍 Находим время для базы.</span></div><div class="mobile-buddy">${this.api.buddy()}</div>`;
  }
  dayDetails() {
    const date = this.selected,
      person = this.api.own(),
      people = this.members().filter((p) => trainingStatus(p, date)),
      work = isWorkDay(date, calendarOf(person));
    return `<section class="panel calendar-details"><div class="section-line"><h2>${esc(label(date))}</h2><span>${work ? "💼 Рабочий день" : "🌿 Выходной"}</span></div><p>${people.length ? people.map((p) => `<span class="day-person">${esc(p.avatar)} ${esc(p.name)}</span>`).join(" ") : "Пока никто не отметил тренировку."}</p><div class="button-row"><button class="primary" data-action="cal-train">Открыть тренировку</button><button class="secondary" data-action="cal-work-selected">${work ? "Сделать выходным" : "Отметить работу"}</button></div></section>`;
  }
  ensure() {
    return (this.api.state().calendar ??= {
      schedule: null,
      training: {},
      workOverrides: {},
    });
  }
  toggleWork(date) {
    this.selected = date;
    const cal = this.ensure(),
      next = !isWorkDay(date, cal);
    cal.workOverrides ??= {};
    if (next === automaticWork(date, cal.schedule))
      delete cal.workOverrides[date];
    else cal.workOverrides[date] = next;
    this.api.changed(next ? "Рабочий день отмечен" : "Выходной отмечен");
  }
  day(date) {
    if (dateNumber(date) === null) return;
    this.selected = date;
    if (this.mode === "view") {
      this.api.render();
      return;
    }
    if (this.mode === "work") return this.toggleWork(date);
    const person = this.api.own();
    if (
      completedDates({
        ...person,
        calendar: { ...person.calendar, training: {} },
      }).has(date)
    ) {
      this.api.render();
      this.api.toast("В этот день тренировка уже завершена в дневнике");
      return;
    }
    const cal = this.ensure();
    cal.training ??= {};
    if (cal.training[date] === this.mode) delete cal.training[date];
    else cal.training[date] = this.mode;
    this.api.changed(
      cal.training[date] === "done"
        ? "Тренировка отмечена выполненной"
        : cal.training[date]
          ? "Тренировка в плане"
          : "Отметка убрана",
    );
  }
  action(action, target) {
    if (action === "cal-prev" || action === "cal-next") {
      this.month = monthShift(this.month, action === "cal-next" ? 1 : -1);
      this.selected = this.month + "-01";
      this.api.render();
    } else if (action === "cal-today") {
      this.month = this.api.today().slice(0, 7);
      this.selected = this.api.today();
      this.api.render();
    } else if (action === "cal-mode") {
      this.mode = target.dataset.mode;
      this.api.render();
    } else if (action === "cal-day") this.day(target.dataset.calDate);
    else if (action === "cal-work-selected") this.toggleWork(this.selected);
    else if (action === "cal-schedule") this.api.schedule();
    else if (action === "cal-train") this.api.train(this.selected);
  }
  scheduleForm() {
    const s = calendarOf(this.api.own()).schedule,
      preset =
        SCHEDULES.find(
          (x) =>
            s && x.type === s.type && x.work === s.work && x.rest === s.rest,
        )?.id || (!s ? "1/3" : "custom");
    return `<h2>Работа вписывается. База — тоже.</h2><form id="schedule-form"><label class="field"><span>График работы</span><select name="preset" id="schedule-preset">${SCHEDULES.map((p) => `<option value="${p.id}" ${preset === p.id ? "selected" : ""}>${p.name}</option>`).join("")}<option value="custom" ${preset === "custom" ? "selected" : ""}>Свой график</option></select></label><div class="schedule-counts" ${s?.type === "weekdays" ? "hidden" : ""}><label class="field"><span>Рабочих подряд</span><input name="work" type="number" inputmode="numeric" min="1" max="31" value="${s?.work || 1}" required></label><label class="field"><span>Выходных подряд</span><input name="rest" type="number" inputmode="numeric" min="1" max="31" value="${s?.rest || 3}" required></label></div><label class="field" ${s?.type === "weekdays" ? "hidden" : ""}><span>Первый рабочий день в круге</span><input name="anchor" type="date" value="${s?.anchor || this.api.today()}" required></label><p class="muted">Для суточной смены отмечаем дату её начала. «5/2 · пн–пт» всегда отмечает будни; остальные графики повторяются от выбранной даты.</p><button class="primary">Применить график</button>${s ? '<button type="button" class="text-button" data-action="cal-remove-schedule">Убрать автографик</button>' : ""}</form><p class="muted">Отдельный день можно поменять зажатием. Ручные изменения сохранятся при смене графика.</p>`;
  }
  saveSchedule(form) {
    const preset = SCHEDULES.find((p) => p.id === form.elements.preset.value),
      schedule = {
        type: preset?.type || "rotation",
        work: Number(form.elements.work.value),
        rest: Number(form.elements.rest.value),
        anchor: form.elements.anchor.value,
      };
    if (
      dateNumber(schedule.anchor) === null ||
      ![schedule.work, schedule.rest].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 31,
      )
    )
      throw Error("Укажи дату и от 1 до 31 дня в каждой части графика");
    if (preset?.type === "weekdays") {
      schedule.work = 5;
      schedule.rest = 2;
    }
    this.ensure().schedule = schedule;
    this.api.changed("Рабочие дни рассчитаны");
  }
  installGestures() {
    let press, swallow;
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    document.addEventListener("pointerdown", (event) => {
      swallow = null;
      const button = event.target.closest("[data-cal-date]");
      if (!button || event.button !== 0) return;
      cancel();
      const date = button.dataset.calDate;
      press = {
        date,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          swallow = { date, until: Date.now() + 1200 };
          press = null;
          this.toggleWork(date);
        }, 550),
      };
    });
    document.addEventListener("pointermove", (event) => {
      if (
        press &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10
      )
        cancel();
    });
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener(
      "click",
      (event) => {
        const date = event.target.closest("[data-cal-date]")?.dataset.calDate;
        if (swallow && swallow.date === date && Date.now() < swallow.until) {
          event.preventDefault();
          event.stopImmediatePropagation();
          swallow = null;
        }
      },
      true,
    );
    document.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-cal-date]")) event.preventDefault();
    });
  }
}
