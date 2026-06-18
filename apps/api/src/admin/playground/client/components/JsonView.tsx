import JsonViewBase from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";

type Props = {
  value: unknown;
  collapsed?: number | boolean;
};

const baseStyle: React.CSSProperties = {
  ...darkTheme,
  background: "var(--field)",
  fontSize: "12px",
  fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  padding: "10px",
  border: "1px solid var(--line)",
  overflow: "auto",
  maxHeight: "500px",
};

export function JsonView({ value, collapsed = 3 }: Props) {
  return (
    <JsonViewBase
      value={value as object}
      style={baseStyle}
      collapsed={collapsed}
      displayDataTypes={false}
      displayObjectSize={false}
      enableClipboard
    />
  );
}
