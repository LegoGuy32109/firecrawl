import { h, type ComponentChildren } from "preact";

type TabProps = {
  active?: boolean;
  children: ComponentChildren;
  onClick?: () => void;
  className?: string;
};

export function Tabs({
  children,
  className = "",
}: {
  children: ComponentChildren;
  className?: string;
}) {
  return (
    <div className={["playground-tabs", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function Tab({ active, children, onClick, className = "" }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "playground-tab",
        active && "playground-tab--active",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
