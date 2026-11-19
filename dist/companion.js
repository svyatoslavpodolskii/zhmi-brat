const WORDS = {
  idle: [
    "Ну что, по подходику?",
    "База сама себя не поднимет.",
    "Разомнись, брат. Я рядом.",
    "Сегодняшний подход — завтрашняя база.",
    "Сначала техника, потом красивые цифры.",
    "Зал начинается с первого подхода.",
    "Дневник открыт. Можно начинать.",
    "Вес подбираем с головой.",
    "Стая на месте. Работаем спокойно.",
    "Твой темп. Твоя база.",
    "Каждый записанный подход — дело.",
    "Гриф ждёт своего часа.",
    "Не каждый день рекордный. Каждый может быть полезным.",
    "Брат, сегодня тоже считается.",
    "Крепкий хват, спокойная голова.",
    "Железо любит постоянство.",
  ],
  rest: [
    "Чиллим по программе.",
    "Я полежу. Ты восстанови дыхание.",
    "Пауза — тоже часть подхода.",
    "Диван занят, но морально я с тобой.",
    "Никуда не спешим. Таймер на посту.",
    "База отдыхает вместе с нами.",
    "Отпускаем плечи. Дышим.",
    "У грифа тоже перерыв.",
    "Восстановление идёт по плану.",
    "Силы копятся. Я проверял.",
    "Ноги вытянул. Совесть чиста.",
    "Сейчас наша работа — отдыхать.",
  ],
  paused: [
    "Таймер подождёт. Я тоже.",
    "Поставили время на диван.",
    "Пауза внутри паузы. Умеем.",
    "Продолжим, когда будешь готов.",
    "Не потерялись. Просто остановились.",
    "Время стоит, дыхание ровное.",
    "Отдых под твоим контролем.",
    "Я пока никуда не встаю.",
  ],
  ready: [
    "Скоро следующий подход. Без суеты.",
    "Осталось чуть-чуть. Собираемся.",
    "Проверь хват. Скоро твой выход.",
    "Отдышался? Ещё несколько секунд.",
    "Таймер почти у цели.",
    "Пора мысленно вернуться к грифу.",
  ],
  five: [
    "Есть контакт, брат!",
    "Пять за старание.",
    "Братская поддержка доставлена.",
    "Ладонь крепкая. Хороший знак.",
    "Держи ответную!",
    "Команда работает.",
    "Хват проверен. Контакт отличный.",
    "Вот это заряд!",
    "Плюс пять к настроению.",
    "Свои на связи.",
  ],
  flex: [
    "Контрольный бицепс.",
    "База на месте.",
    "Разминка харизмы завершена.",
    "Форма рабочая. Настрой тоже.",
    "Зацени стойку.",
    "Тут всё честно: свет и дисциплина.",
    "Демонстрационный подход.",
    "Немного позирования между делом.",
    "Плечи расправил. Готов.",
    "Запрос на бицепс выполнен.",
  ],
  banana: [
    "Банан принят. Спасибо, шеф.",
    "Перекус напарнику доставлен.",
    "Вот теперь рабочая атмосфера.",
    "Угощение в зачёт дружбы.",
    "Есть контакт с бананом.",
    "Вкусно. Можно ещё работать.",
    "Сервис в этой качалке отличный.",
    "Запас хорошего настроения пополнен.",
    "Шеф, ты знаешь толк в поддержке.",
    "Банановая пауза объявлена.",
  ],
  bend: [
    "Разогнулся. Согнулся. Всё на месте.",
    "Контрольный изгиб.",
    "Проверка подвижности пройдена.",
    "Размялся даже напарник.",
    "Плечи готовы. Твой ход.",
    "База держится крепко.",
    "Добавим немного движения.",
    "Корпус слушается.",
    "Лёгкая разминка между делом.",
    "Спина сказала спасибо.",
  ],
  lying: [
    "Пять лёжа тоже считается.",
    "Бицепс покажу, но с дивана не встану.",
    "Всё вижу. Продолжаю отдыхать.",
    "Поддержка принята в горизонтальном положении.",
    "Отвечаю с дивана.",
    "Энергия есть. Мы её пока бережём.",
    "На связь вышел. Позу сохранил.",
    "Отдых не отменяется.",
    "Ладонь поднял. Ноги оставил.",
    "Между подходами я за стабильность.",
  ],
  chill: [
    "Диван забронирован.",
    "Перехожу в режим восстановления.",
    "Вытянули ноги. Выдохнули.",
    "Теперь можно немного полежать.",
    "Чиллим без чувства вины.",
    "Поза для хорошего перерыва.",
    "Удобно устроился. Продолжай.",
    "Мой любимый тренажёр на сегодня.",
  ],
};
const counters = {},
  selected = new Map();
let api,
  manualRest = false,
  gesture,
  start,
  swallow = false,
  idleLine = WORDS.idle[0];
function pick(key) {
  const list = WORDS[key];
  const previous = selected.get(key) ?? -1;
  const index =
    (previous + 1 + Math.floor(Math.random() * (list.length - 1))) %
    list.length;
  selected.set(key, index);
  return list[index];
}
function timer() {
  return api?.timer?.() || { active: false, paused: false, left: 180 };
}
function mode(preview = false) {
  const t = timer();
  if (t.paused) return "paused";
  if (t.active) return t.left <= 20 ? "ready" : "rest";
  return preview || manualRest || api?.resting?.() ? "rest" : "idle";
}
function quote(m) {
  if (m === "idle") return idleLine;
  if (!selected.has("mode-" + m)) selected.set("mode-" + m, pick(m));
  return selected.get("mode-" + m);
}
function stats() {
  return api?.stats?.() || "Твой напарник на тренировке.";
}
export function buddyHTML({
  sets = 0,
  sessions = 0,
  timer: preview = false,
} = {}) {
  const m = mode(preview),
    chill = m !== "idle";
  const level = (api?.sessions?.() ?? sessions) % 3;
  return `<section class="buddy ${chill ? "is-chilling" : "is-awake"}" data-buddy data-buddy-timer="${preview}" data-mode="${m}" data-style="${level}" data-move="idle"><button class="buddy-stage" data-buddy-touch aria-label="Дать пять напарнику. Зажми для разминки"><div class="buddy-art"><span class="buddy-sofa" aria-hidden="true"></span><div class="buddy-pose"><div class="buddy-motion"><img src="./assets/buddy.webp" alt="Качок-напарник" width="346" height="640" draggable="false"></div></div><span class="buddy-zzz" aria-hidden="true">z z z</span></div></button><div class="buddy-heading">Твой напарник<span data-buddy-state>${chill ? "Восстанавливаемся" : "На твоей стороне"}</span></div><div class="buddy-speech"><b data-buddy-line>${quote(m)}</b><p data-buddy-caption>${chill ? "Отдых — тоже часть программы." : `Подходы: ${sets}. Тренировки: ${sessions}.`}</p></div><div class="buddy-actions">${[
    ["five", "✋", "Дать пять"],
    ["flex", "💪", "Показать базу"],
    ["banana", "🍌", "Угостить бананом"],
    ["chill", "🛋️", "Почиллить"],
  ]
    .map(
      ([a, e, label]) =>
        `<button data-buddy-action="${a}" aria-label="${label}" title="${label}" ${a === "chill" ? `aria-pressed="${manualRest}"` : ""}>${e}</button>`,
    )
    .join(
      "",
    )}</div><small class="buddy-hint">Тап — пять. Зажми для разминки. У каждого действия есть свои движения.</small></section>`;
}
export function refreshBuddyMood() {
  for (const b of document.querySelectorAll("[data-buddy]")) {
    const m = mode(b.dataset.buddyTimer === "true"),
      chill = m !== "idle";
    if (b.dataset.mode !== m) {
      b.dataset.mode = m;
      b.querySelector("[data-buddy-line]").textContent = quote(m);
      b.querySelector("[data-buddy-caption]").textContent = chill
        ? "Отдых — тоже часть программы."
        : stats();
    }
    b.classList.toggle("is-chilling", chill);
    b.classList.toggle("is-awake", !chill);
    b.querySelector("[data-buddy-state]").textContent =
      m === "paused"
        ? "Таймер на паузе"
        : m === "ready"
          ? "Скоро следующий подход"
          : chill
            ? "Восстанавливаемся"
            : "На твоей стороне";
    b.querySelector('[data-buddy-action="chill"]').setAttribute(
      "aria-pressed",
      String(manualRest),
    );
  }
}
function move(action, held = false) {
  if (action === "chill") manualRest = !manualRest;
  refreshBuddyMood();
  const key = held ? "bend" : action;
  const variation = ((counters[key] || 0) + 1) % 3;
  counters[key] = variation;
  const resting = mode() !== "idle";
  const words = pick(
    action === "chill"
      ? resting
        ? "chill"
        : "idle"
      : resting && action !== "banana"
        ? "lying"
        : key,
  );
  if (!resting) idleLine = words;
  else selected.set("mode-" + mode(), words);
  for (const b of document.querySelectorAll("[data-buddy]")) {
    const nodeRest = b.classList.contains("is-chilling");
    b.querySelector("[data-buddy-line]").textContent =
      nodeRest && !resting ? pick("lying") : words;
    b.dataset.move = "idle";
    b.dataset.variant = String(variation);
    requestAnimationFrame(() => (b.dataset.move = held ? "bend" : action));
    clearTimeout(b._motionTimer);
    b._motionTimer = setTimeout(() => (b.dataset.move = "idle"), 1400);
  }
  api?.reaction?.(
    { five: "✋", flex: "💪", banana: "🍌", chill: "🛋️" }[action] || "💪",
  );
}
export function celebrateBuddy() {
  move("flex");
}
export function notifyBuddyTimer() {
  const modes = new Set(
    [...document.querySelectorAll("[data-buddy]")].map((b) =>
      mode(b.dataset.buddyTimer === "true"),
    ),
  );
  for (const key of modes)
    if (key !== "idle") selected.set("mode-" + key, pick(key));
  if (timer().active && timer().left > 20) selected.delete("mode-ready");
  refreshBuddyMood();
  for (const b of document.querySelectorAll("[data-buddy]")) {
    b.querySelector("[data-buddy-line]").textContent = quote(
      mode(b.dataset.buddyTimer === "true"),
    );
  }
}
export function installBuddy(options) {
  api = options;
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-buddy-action]");
    if (action) return move(action.dataset.buddyAction);
    if (e.target.closest("[data-buddy-touch]")) {
      if (swallow) {
        swallow = false;
        return;
      }
      move("five");
    }
  });
  const cancel = () => {
    clearTimeout(gesture);
    gesture = null;
  };
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.target.closest("[data-buddy-touch]")) return;
    cancel();
    swallow = false;
    start = { x: e.clientX, y: e.clientY };
    gesture = setTimeout(() => {
      gesture = null;
      swallow = true;
      move("flex", true);
    }, 600);
  });
  document.addEventListener("pointermove", (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12)
      cancel();
  });
  document.addEventListener("pointerup", cancel);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("[data-buddy-touch]")) e.preventDefault();
  });
}
