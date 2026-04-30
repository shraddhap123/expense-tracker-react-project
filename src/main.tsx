import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AuthGuard from "./components/auth/AuthGuard";
import { AuthProvider } from "./hooks/useAuth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGuard>
        <App />
      </AuthGuard>
    </AuthProvider>
  </StrictMode>
);
