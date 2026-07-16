# Component Boundaries

Components are grouped by product domain so ownership is visible from the path.

- `camera` owns the camera preview page, stream viewport, metrics, and manual sensor controls.
- `connection` owns connection-mode UI.
- `kitchen` owns protocol-guided workflow UX, run controls, demo sandboxes, and live coach panels.
- `liveCopilot` owns realtime copilot customization surfaces shared by Kitchen and Camera.
- `ui` owns shared primitives with no product behavior.
- `vision` owns general AI/vision developer surfaces outside the Kitchen workflow.

Shared components should stay behavior-light. If a shared component starts knowing
about protocols, devices, or API calls, move that logic back into the feature folder.
