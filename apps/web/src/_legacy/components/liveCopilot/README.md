# Live Copilot Components

This folder owns operator-facing customization for the realtime LabOS copilot.

- `LiveCopilotPanel.tsx` is the dedicated dashboard page for configuring and testing the copilot.
- `VoiceCharacterCard.tsx` owns Gemini voice selection and real voice sample playback.
- `WebRtcExperimentCard.tsx` owns the experimental WebRTC transport probe and provider comparison.

Kitchen and camera flows may reuse these cards, but protocol state machines stay in
`components/kitchen`.
