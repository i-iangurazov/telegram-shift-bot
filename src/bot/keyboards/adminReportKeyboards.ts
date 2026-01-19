import { Markup } from "telegraf";
import { EmployeeRecord } from "../../domain/types";

const encodeQuery = (query: string): string => encodeURIComponent(query);

export const buildEmployeeListKeyboard = (params: {
  employees: EmployeeRecord[];
  page: number;
  totalPages: number;
  query?: string;
}): ReturnType<typeof Markup.inlineKeyboard> => {
  const rows = params.employees.map((employee) => {
    const label = employee.displayName || employee.username || employee.telegramUserId;
    const callback = `emp_select:${employee.id}:${params.page}:${encodeQuery(params.query ?? "")}`;
    return [Markup.button.callback(label, callback)];
  });

  const navRow = [
    Markup.button.callback("◀️", `emp_page:${Math.max(1, params.page - 1)}:${encodeQuery(params.query ?? "")}`),
    Markup.button.callback("▶️", `emp_page:${Math.min(params.totalPages, params.page + 1)}:${encodeQuery(params.query ?? "")}`)
  ];

  const controlRow = [
    Markup.button.callback("Поиск", "emp_search"),
    Markup.button.callback("Назад", "emp_back")
  ];

  return Markup.inlineKeyboard([...rows, navRow, controlRow]);
};

export const buildEmployeeActionKeyboard = (params: {
  employeeId: number;
  page: number;
  query?: string;
}): ReturnType<typeof Markup.inlineKeyboard> => {
  const query = encodeQuery(params.query ?? "");
  return Markup.inlineKeyboard([
    [Markup.button.callback("Отчёт", `emp_action:report:${params.employeeId}:${params.page}:${query}`)],
    [Markup.button.callback("Фото (последние 3 дня)", `emp_action:photos:${params.employeeId}:${params.page}:${query}`)],
    [Markup.button.callback("Назад", `emp_page:${params.page}:${query}`)]
  ]);
};

export const buildEmployeePeriodKeyboard = (params: {
  employeeId: number;
  backPage: number;
  query?: string;
  backAction?: string;
}): ReturnType<typeof Markup.inlineKeyboard> => {
  const query = encodeQuery(params.query ?? "");
  const backCallback = params.backAction ?? `emp_page:${params.backPage}:${query}`;
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("За 3 дня", `period_emp:3:${params.employeeId}`),
      Markup.button.callback("За 7 дней", `period_emp:7:${params.employeeId}`)
    ],
    [Markup.button.callback("За 30 дней", `period_emp:30:${params.employeeId}`)],
    [Markup.button.callback("Назад", backCallback)]
  ]);
};

export const buildPhotoPeriodKeyboard = (params: {
  employeeId: number;
  page: number;
  query?: string;
}): ReturnType<typeof Markup.inlineKeyboard> => {
  const query = encodeQuery(params.query ?? "");
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Сегодня", `emp_photo_period:today:${params.employeeId}:${params.page}:${query}`),
      Markup.button.callback("Вчера", `emp_photo_period:yesterday:${params.employeeId}:${params.page}:${query}`)
    ],
    [Markup.button.callback("Последние 3 дня", `emp_photo_period:last3:${params.employeeId}:${params.page}:${query}`)],
    [Markup.button.callback("Назад", `emp_action:menu:${params.employeeId}:${params.page}:${query}`)]
  ]);
};

export const buildPhotoShiftListKeyboard = (params: {
  shifts: Array<{ id: number; label: string }>;
  employeeId: number;
  page: number;
  query?: string;
}): ReturnType<typeof Markup.inlineKeyboard> => {
  const query = encodeQuery(params.query ?? "");
  const rows = params.shifts.map((shift) => [
    Markup.button.callback(shift.label, `emp_photo_shift:${shift.id}`)
  ]);
  rows.push([Markup.button.callback("Назад", `emp_action:photos:${params.employeeId}:${params.page}:${query}`)]);
  return Markup.inlineKeyboard(rows);
};

export const buildAllPeriodKeyboard = (): ReturnType<typeof Markup.inlineKeyboard> => {
  return Markup.inlineKeyboard([
    [Markup.button.callback("За 3 дня", "period_all:3"), Markup.button.callback("За 7 дней", "period_all:7")],
    [Markup.button.callback("За 30 дней", "period_all:30")]
  ]);
};

export const buildEmployeeExportKeyboard = (employeeId: number, days: number): ReturnType<typeof Markup.inlineKeyboard> => {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Экспорт CSV", `export_emp:csv:${days}:${employeeId}`)]
  ]);
};

export const buildAllExportKeyboard = (days: number): ReturnType<typeof Markup.inlineKeyboard> => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Экспорт CSV", `export_all:csv:${days}`),
      Markup.button.callback("Сотрудники", "emp_page:1:")
    ]
  ]);
};
