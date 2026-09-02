import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import {
  createHttpQuestionBankSource,
  createStaticChallengePreparer,
} from "./data/staticQuestionBank";
import "./index.css";

const prepareChallenge = createStaticChallengePreparer({
  source: createHttpQuestionBankSource(
    new URL("./data/knowledge-35000-v3/", document.baseURI),
  ),
  manifestPath: "manifest.json",
});

const root = document.querySelector("#root");
if (!root) {
  throw new Error("应用缺少根节点。");
}

createRoot(root).render(
  <StrictMode>
    <App prepareChallenge={prepareChallenge} />
  </StrictMode>,
);
