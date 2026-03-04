import { Markup } from "telegraf";

export const adminKeyboard = Markup.keyboard([
  ["Дневной отчёт", "Еженедельный отчёт"],
  ["Сотрудники", "Отчёт"],
  ["Настроить рассылку"],
  ["Ошибки", "Помощь"]
]).resize();

export const employeeKeyboard = Markup.keyboard([
  ["Статус"],
  ["Помощь"]
]).resize();

export const roleSwitchKeyboard = Markup.keyboard([["Режим: Админ", "Режим: Сотрудник"]]).resize();

export const modeInlineKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Админ режим", "mode:ADMIN"), Markup.button.callback("Режим сотрудника", "mode:EMPLOYEE")]
]);
