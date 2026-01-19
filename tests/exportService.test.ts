import { ExportService } from "../src/services/exportService";

const exportService = new ExportService();

describe("ExportService", () => {
  it("builds CSV for all employees report", () => {
    const file = exportService.buildAllEmployeesSummaryCsv(
      { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-02T00:00:00Z") },
      [
        {
          employeeId: 1,
          telegramUserId: "1",
          displayName: "Иван Иванов",
          totalShifts: 2,
          totalDurationMinutes: 960,
          averageDurationMinutes: 480,
          violationsNotClosedInTime: 1,
          violationsShortShift: 0,
          violationsTotal: 1
        }
      ],
      "Asia/Bishkek"
    );

    const content = file.content.toString("utf-8");
    expect(file.filename).toContain("report_");
    const header = content.split("\n")[0];
    expect(header).toContain("employeeId");
    expect(header).toContain("notClosedInTimeViolationsCount");
    expect(header).toContain("shortShiftViolationsCount");
  });
});
