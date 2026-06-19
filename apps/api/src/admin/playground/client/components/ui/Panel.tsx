import { h, type ComponentChildren } from "preact";

type Props = {
  label?: string;
  children: ComponentChildren;
  className?: string;
};

export function Panel({ label, children, className = "" }: Props) {
  return (
    <section
      className={["playground-panel", className].filter(Boolean).join(" ")}
    >
      {label && <div className="playground-panel__label">{label}</div>}
      {children}
    </section>
  );
}
