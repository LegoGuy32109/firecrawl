import { h } from "preact";
import { apiKey } from "../signals";
import { LLMProxyStatus } from "./LLMProxyStatus";
import { Field } from "./ui/Field";

export function Header() {
  const env = document.getElementById("root")?.dataset.env ?? "";
  const base = `${location.protocol}//${location.host}`;

  return (
    <header className="playground-header">
      <div className="playground-header__top">
        <h1 className="playground-title">Firecrawl Playground</h1>
        <LLMProxyStatus />
      </div>
      <div className="playground-grid playground-grid--fields playground-grid--fields-3">
        <Field label="ENV">
          <input className="playground-input" readOnly value={env} />
        </Field>
        <Field label="Base">
          <input className="playground-input" readOnly value={base} />
        </Field>
        <Field label="API Key (optional)">
          <input
            type="password"
            placeholder="fc-..."
            value={apiKey.value}
            onInput={e => {
              apiKey.value = (e.target as HTMLInputElement).value;
            }}
            className="playground-input"
          />
        </Field>
      </div>
    </header>
  );
}
