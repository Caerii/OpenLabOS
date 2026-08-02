import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { Landing } from "./routes/Landing";
import { Dashboard } from "./routes/Dashboard";
import { RunPage } from "./routes/RunPage";
import LegacyOperatorShell from "./_legacy/LegacyOperatorShell";
import { AppShell, IndexRedirect, RoutedPanel } from "./_legacy/App";
import { OPERATE_BASE } from "./_legacy/navPaths";
import "./_legacy/theme/tokens.css";
import "./_legacy/design-system.css";
import "./index.css";
import "./_legacy/index.css";
import "./_legacy/operate-console.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path={`${OPERATE_BASE}`} element={<LegacyOperatorShell />}>
            <Route element={<AppShell />}>
              <Route index element={<IndexRedirect />} />
              <Route path=":page" element={<RoutedPanel />} />
            </Route>
          </Route>
          {/* Legacy bookmarks from when the operator shell lived at /. */}
          <Route path="/kitchen" element={<Navigate to={`${OPERATE_BASE}/kitchen`} replace />} />
          <Route path="/camera" element={<Navigate to={`${OPERATE_BASE}/camera`} replace />} />
          <Route path="/copilot" element={<Navigate to={`${OPERATE_BASE}/copilot`} replace />} />
          <Route path="/run/:sessionId" element={<RunPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
