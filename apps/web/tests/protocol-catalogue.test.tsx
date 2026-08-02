import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KitchenProtocolSummary } from "../src/_legacy/api";
import ProtocolsView from "../src/_legacy/components/kitchen/ProtocolsView";

const protocols: KitchenProtocolSummary[] = [
  {
    id: "kitchen-tea-v1",
    name: "Make Tea",
    description: "Prepare a cup of tea with guided steps.",
    stepCount: 6,
    estimatedMinutes: 8,
    difficulty: "beginner",
    tags: ["demo"],
  },
  {
    id: "kitchen-coffee-v1",
    name: "Make Coffee",
    description: "Brew coffee with a pour-over setup.",
    stepCount: 5,
    estimatedMinutes: 10,
    difficulty: "intermediate",
    tags: ["demo"],
  },
];

function selectedProtocolCard() {
  const label = screen.getAllByText("Selected Protocol")[0];
  const card = label.closest(".labos-surface");
  expect(card).toBeTruthy();
  return within(card as HTMLElement);
}

describe("protocol catalogue", () => {
  it("lists protocols and reflects the selected card", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onStart = vi.fn();

    render(
      <ProtocolsView
        protocols={protocols}
        selectedProtocol="kitchen-tea-v1"
        onSelect={onSelect}
        onStart={onStart}
        isActive={false}
      />,
    );

    const headerQueries = selectedProtocolCard();

    expect(screen.getAllByRole("heading", { name: "Make Tea" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Make Coffee")).toBeInTheDocument();
    expect(headerQueries.getByRole("button", { name: "Start Protocol" })).toBeEnabled();

    await user.click(screen.getByText("Make Coffee"));
    expect(onSelect).toHaveBeenCalledWith("kitchen-coffee-v1");
  });

  it("shows an active-run warning while a run is in progress", () => {
    render(
      <ProtocolsView
        protocols={protocols}
        selectedProtocol="kitchen-tea-v1"
        onSelect={vi.fn()}
        onStart={vi.fn()}
        isActive={true}
      />,
    );

    expect(screen.getByText(/run is already active/i)).toBeInTheDocument();
    expect(selectedProtocolCard().getByRole("button", { name: "Start Protocol" })).toBeInTheDocument();
  });
});
