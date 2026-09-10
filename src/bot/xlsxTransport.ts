import { XLSX_MIME } from "../services/exportService";

// Telegraf 4 omits Content-Type on uploaded file parts. Use a typed Blob for XLSX.
export async function sendXlsxDocument(token: string, payload: Record<string, any>) {
  const { document, ...fields } = payload;
  if (document.source.length > 49 * 1024 * 1024) throw new Error("Файл слишком большой для Telegram. Выберите меньший период.");
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  form.append("document", new Blob([new Uint8Array(document.source)], { type: XLSX_MIME }), document.filename);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(45000) });
  } catch {
    throw Object.assign(new Error("Не удалось отправить файл в Telegram"), { code: "ETIMEDOUT" });
  }
  const body = await response.json();
  if (!response.ok || !body.ok) throw Object.assign(new Error("Telegram не принял файл"), { response: body });
  return body.result;
}
