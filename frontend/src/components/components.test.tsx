import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "./Button";
import { Field } from "./Field";
import { Popover } from "./Popover";
import { SegmentedControl } from "./SegmentedControl";
import { Slider } from "./Slider";
import { Toast, ToastProvider } from "./Toast";

// Radix Slider measures its thumb; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

test("base components render with accessible names", () => {
  render(
    <ToastProvider>
      <Button>Plan Routes</Button>
      <Field label="Origin" helper="City, address or ZIP" />
      <SegmentedControl
        label="Checkpoint spacing"
        value="25"
        options={[
          { value: "10", label: "10 mi" },
          { value: "25", label: "25 mi" },
        ]}
        onChange={() => {}}
      />
      <Slider label="Forecast Hour" value={18} min={0} max={48} onChange={() => {}} />
      <Popover trigger={<button>Checkpoint 14</button>} open>
        Popover body
      </Popover>
      <Toast message="Units switched to metric" open onOpenChange={() => {}} />
    </ToastProvider>,
  );

  expect(screen.getByRole("button", { name: "Plan Routes" })).toBeTruthy();
  expect(screen.getByLabelText("Origin")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "25 mi" }).getAttribute("data-state")).toBe("on");
  expect(screen.getByRole("slider", { name: "Forecast Hour" }).getAttribute("aria-valuenow")).toBe("18");
  expect(screen.getByText("Popover body")).toBeTruthy();
  expect(screen.getAllByText("Units switched to metric").length).toBeGreaterThan(0);
});
