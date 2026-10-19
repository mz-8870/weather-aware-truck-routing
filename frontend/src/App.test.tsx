import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows the backend health status", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/health" ? Response.json({ status: "ok" }) : new Response(null, { status: 404 }),
    ),
  );
  render(<App />);
  expect(await screen.findByText("Backend: ok")).toBeTruthy();
});

test("shows an error when the backend is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  render(<App />);
  expect(await screen.findByText("Backend: unreachable")).toBeTruthy();
});
