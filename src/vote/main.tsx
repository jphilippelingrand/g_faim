import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VotePage } from "./VotePage";
import "./vote.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VotePage />
  </StrictMode>,
);
