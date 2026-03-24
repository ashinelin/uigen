import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "../use-auth";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock server actions
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });

  describe("signIn", () => {
    test("sets isLoading true during call and false after", async () => {
      let resolveSignIn!: (v: unknown) => void;
      (signInAction as any).mockReturnValue(
        new Promise((r) => (resolveSignIn = r))
      );

      const { result } = renderHook(() => useAuth());

      let promise: Promise<unknown>;
      act(() => {
        promise = result.current.signIn("a@b.com", "pass");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false });
        await promise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("returns the result from signInAction", async () => {
      (signInAction as any).mockResolvedValue({ success: false, error: "bad" });

      const { result } = renderHook(() => useAuth());
      let ret: unknown;

      await act(async () => {
        ret = await result.current.signIn("a@b.com", "wrong");
      });

      expect(ret).toEqual({ success: false, error: "bad" });
    });

    test("on success with anon work: creates project and navigates", async () => {
      (signInAction as any).mockResolvedValue({ success: true });
      (getAnonWorkData as any).mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "/App.tsx": {} },
      });
      (createProject as any).mockResolvedValue({ id: "proj-anon-1" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "hello" }],
          data: { "/App.tsx": {} },
        })
      );
      expect(clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-anon-1");
      expect(getProjects).not.toHaveBeenCalled();
    });

    test("on success with no anon work and existing projects: navigates to most recent project", async () => {
      (signInAction as any).mockResolvedValue({ success: true });
      (getAnonWorkData as any).mockReturnValue(null);
      (getProjects as any).mockResolvedValue([
        { id: "proj-1" },
        { id: "proj-2" },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-1");
      expect(createProject).not.toHaveBeenCalled();
    });

    test("on success with no anon work and no projects: creates new project and navigates", async () => {
      (signInAction as any).mockResolvedValue({ success: true });
      (getAnonWorkData as any).mockReturnValue(null);
      (getProjects as any).mockResolvedValue([]);
      (createProject as any).mockResolvedValue({ id: "proj-new" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/proj-new");
    });

    test("on success with empty anon messages: falls through to projects flow", async () => {
      (signInAction as any).mockResolvedValue({ success: true });
      (getAnonWorkData as any).mockReturnValue({ messages: [], fileSystemData: {} });
      (getProjects as any).mockResolvedValue([{ id: "proj-existing" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-existing");
    });
  });

  describe("signUp", () => {
    test("sets isLoading true during call and false after", async () => {
      let resolveSignUp!: (v: unknown) => void;
      (signUpAction as any).mockReturnValue(
        new Promise((r) => (resolveSignUp = r))
      );

      const { result } = renderHook(() => useAuth());

      let promise: Promise<unknown>;
      act(() => {
        promise = result.current.signUp("a@b.com", "pass");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp({ success: false });
        await promise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("returns the result from signUpAction", async () => {
      (signUpAction as any).mockResolvedValue({
        success: false,
        error: "exists",
      });

      const { result } = renderHook(() => useAuth());
      let ret: unknown;

      await act(async () => {
        ret = await result.current.signUp("a@b.com", "pass");
      });

      expect(ret).toEqual({ success: false, error: "exists" });
    });

    test("on success: triggers post sign-in flow", async () => {
      (signUpAction as any).mockResolvedValue({ success: true });
      (getAnonWorkData as any).mockReturnValue(null);
      (getProjects as any).mockResolvedValue([{ id: "proj-after-signup" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@b.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-after-signup");
    });

    test("on failure: does not navigate", async () => {
      (signUpAction as any).mockResolvedValue({
        success: false,
        error: "fail",
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("a@b.com", "pass");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
