import { h, type ComponentChildren } from "preact";

type Props = {
  children: ComponentChildren;
  className?: string;
};

export function EmptyState({ children, className = "" }: Props) {
  return (
    <div className={["playground-empty", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
