# Client Architecture

The client is a React/Vite app organized by boundary rather than by generic file
type. The goal is that a reader can find the owner of a behavior without scanning
the whole UI tree.

## Folders

- `api` contains typed browser clients for backend routes. It should not contain
  component state or rendering decisions.
- `components` contains feature and shared UI components.
- `hooks` contains reusable browser behavior that is not specific to one feature.
- `lib` contains small browser utilities.
- `tests` contains client-side contract and UX tests.
- `theme` contains visual tokens and shared style primitives.

## Client Rule

Page components should compose hooks/components. If a page starts owning polling,
protocol state, device commands, and rendering at the same time, split it into a
feature controller hook plus presentational components.

