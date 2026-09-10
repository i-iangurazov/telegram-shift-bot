import { writeFile } from "node:fs/promises";
import { buildExampleReport } from "../src/services/reportExample";
(async () => {
  const file = await buildExampleReport("Asia/Bishkek");
  await writeFile("artifacts/Пример_отчёта_по_сменам.xlsx", file.content);
  console.log("Пример XLSX создан на вымышленных данных.");
})().catch(() => { process.exitCode = 1; });
