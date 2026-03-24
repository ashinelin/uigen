// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// Mock next/headers cookies
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ set: mockCookieSet })),
}));

const { createSession } = await import("@/lib/auth");

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  vi.clearAllMocks();
});

test("sets an http-only cookie named auth-token", async () => {
  await createSession("user-1", "test@example.com");

  expect(mockCookieSet).toHaveBeenCalledOnce();
  const [name, , options] = mockCookieSet.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(options.httpOnly).toBe(true);
});

test("cookie expires approximately 7 days from now", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const [, , options] = mockCookieSet.mock.calls[0];
  const expires: Date = options.expires;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("token is a valid JWT containing userId and email", async () => {
  await createSession("user-42", "hello@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("hello@example.com");
});

test("token uses HS256 algorithm", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const header = JSON.parse(atob(token.split(".")[0]));
  expect(header.alg).toBe("HS256");
});
