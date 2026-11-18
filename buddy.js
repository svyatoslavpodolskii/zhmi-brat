const IDLE = [
  "Ну что, по подходику?",
  "🦍 Горилла на связи.",
  "База сама себя не поднимет.",
  "🐺 Стая собралась — можно жать.",
  "Разомнись, брат. Я пока разогрею харизму.",
  "Ещё один маленький вклад в большую базу.",
];
const REST = [
  "Чиллим по программе.",
  "Я пока полежу. Ты дыши.",
  "🦍 Гориллы тоже отдыхают.",
  "Мышцы работали. Теперь диван.",
  "Не торопи отдых, брат.",
];
let line = 0,
  manualRest = false,
  gesture = null,
  swallow = false,
  api;
function resting() {
  return manualRest || api?.resting();
}
export function buddyHTML({ sets = 0, sessions = 0, rest = false } = {}) {
  const chill = rest || manualRest;
  return `<section class="buddy ${chill ? "is-chilling" : "is-awake"}" data-buddy data-move="idle"><div class="buddy-heading"><span>Твой напарник</span></div><button class="buddy-stage" data-buddy-touch aria-label="Потрогать качка. Зажми, чтобы он размялся"><div class="buddy-art"><span class="buddy-sofa" aria-hidden="true"></span><div class="buddy-orbit" aria-hidden="true">${chill ? "🍌" : "💪"}</div><div class="buddy-figure"><img src="./assets/buddy.webp" alt="Твой качок-напарник" width="174" height="290" draggable="false"></div><span class="buddy-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span><span class="buddy-spark" aria-hidden="true">✦</span></div></button><div class="buddy-speech"><b data-buddy-line>${(chill ? REST : IDLE)[line % (chill ? REST : IDLE).length]}</b><p data-buddy-caption>${chill ? "Выдохни. База любит отдых." : `Подходы: ${sets}. Тренировки: ${sessions}.`}</p></div><div class="buddy-actions"><button data-buddy-action="five" aria-label="Дать пять качку" title="Дать пять">✋</button><button data-buddy-action="flex" aria-label="Попросить качка показать бицепс" title="Показать базу">💪</button><button data-buddy-action="banana" aria-label="Дать банан качку" title="Угостить бананом">🍌</button><button data-buddy-action="chill" aria-label="Включить или выключить чилящий режим" title="Почиллить" aria-pressed="${chill}">🛋️</button></div><small class="buddy-hint">Тапни меня. Или зажми — я разомнусь.</small></section>`;
}
export function refreshBuddyMood() {
  if (!api) return;
  const chill = !!resting();
  for (const b of document.querySelectorAll("[data-buddy]")) {
    const changed = b.classList.contains("is-chilling") !== chill;
    b.classList.toggle("is-chilling", chill);
    b.classList.toggle("is-awake", !chill);
    b.querySelector("[data-buddy-action=chill]")?.setAttribute(
      "aria-pressed",
      String(chill),
    );
    if (changed) {
      b.querySelector("[data-buddy-line]").textContent = (chill ? REST : IDLE)[
        line % (chill ? REST : IDLE).length
      ];
      b.querySelector("[data-buddy-caption]").textContent = chill
        ? "Выдохни. База любит отдых."
        : api.stats();
      b.querySelector(".buddy-orbit").textContent = chill ? "🍌" : "💪";
    }
  }
}
function move(action, held = false) {
  line++;
  if (action === "chill") manualRest = !manualRest;
  refreshBuddyMood();
  const chill = resting();
  const words =
    action === "banana"
      ? [
          "🍌 Принято. Горилла довольна.",
          "Банан — в гориллу, база — в дневник.",
          "🦍 О-о-о, бананчик!",
        ]
      : held
        ? [
            "Разогнулся. Согнулся. База на месте.",
            "🦍🦍🦍 Гориллы одобряют!",
            "Не щекочи бицепс, брат.",
          ]
        : action === "five"
          ? [
              "Есть контакт, брат! ✋",
              "Пять за старание. Ещё пять за базу.",
              "🐺 Стая своих не бросает.",
            ]
          : chill
            ? REST
            : [
                "Оп! Контрольный бицепс.",
                "🦍 База на месте.",
                "Качок включён. Гориллы тоже.",
              ];
  for (const b of document.querySelectorAll("[data-buddy]")) {
    b.dataset.move = "idle";
    b.querySelector("[data-buddy-line]").textContent =
      words[line % words.length];
    requestAnimationFrame(() => {
      b.dataset.move = held ? "bend" : action;
    });
    clearTimeout(b._buddyTimer);
    b._buddyTimer = setTimeout(
      () => {
        b.dataset.move = "idle";
      },
      held ? 1400 : 1000,
    );
  }
  const emoji =
    action === "five"
      ? "✋"
      : action === "banana"
        ? "🍌"
        : action === "chill"
          ? "🛋️"
          : "💪";
  api?.reaction(emoji);
  if (held) api?.gorillas?.(30);
}
export function celebrateBuddy() {
  move("flex");
}
export function installBuddy(options) {
  api = options;
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-buddy-action]");
    if (action) {
      move(action.dataset.buddyAction);
      return;
    }
    if (event.target.closest("[data-buddy-touch]")) {
      if (swallow) {
        swallow = false;
        return;
      }
      move("five");
    }
  });
  const cancel = () => {
    if (gesture) clearTimeout(gesture);
    gesture = null;
  };
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.target.closest("[data-buddy-touch]"))
      return;
    cancel();
    gesture = setTimeout(() => {
      gesture = null;
      swallow = true;
      move("flex", true);
    }, 600);
  });
  document.addEventListener("pointerup", cancel);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("pointermove", (event) => {
    if (event.buttons === 0) cancel();
  });
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-buddy-touch]")) event.preventDefault();
  });
}
