import { NextRequest } from "next/server";
import { prisma } from "../../src/db/prisma";

const buildRequest = (url: string, headers?: Record<string, string>) => {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      ...headers
    }
  });
};

test("health rejects missing secret", async () => {
  const { GET } = await import("../../src/app/api/internal/health/route");
  const req = buildRequest("http://localhost/api/internal/health");
  const res = await GET(req);
  expect(res.status).toBe(401);
});

test("health returns ok and pings db", async () => {
  const { GET } = await import("../../src/app/api/internal/health/route");
  const spy = jest.spyOn(prisma, "$queryRaw");

  const req = buildRequest("http://localhost/api/internal/health", {
    Authorization: "Bearer test-internal"
  });
  const res = await GET(req);

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.db).toBe("ok");
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
