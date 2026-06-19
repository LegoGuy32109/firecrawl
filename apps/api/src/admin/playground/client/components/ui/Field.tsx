import { h, type ComponentChildren } from "preact";

type Props = {
  label: string;
  children: ComponentChildren;
  className?: string;
};

export function Field({ label, children, className = "" }: Props) {
  return (
    <label
      className={["playground-field", className].filter(Boolean).join(" ")}
    >
      <span className="playground-field__label">{label}</span>
      {children}
    </label>
  );
}
