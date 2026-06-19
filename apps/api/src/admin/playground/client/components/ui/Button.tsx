import { h } from "preact";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "xs";

type Props = h.JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "ghost",
  size = "sm",
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={[
        "playground-button",
        variant === "primary" && "playground-button--primary",
        variant === "ghost" && "playground-button--ghost",
        variant === "danger" && "playground-button--danger",
        size === "sm" && "playground-button--small",
        size === "xs" && "playground-button--xsmall",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
