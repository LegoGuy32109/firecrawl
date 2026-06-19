import { h, useState, type ComponentChildren } from "preact";
import { Button } from "./Button";

type Props = {
  title: string;
  children: ComponentChildren;
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="playground-section">
      <Button
        type="button"
        className="playground-section__button"
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <span className="playground-section__label">{title}</span>
        {collapsible && (
          <span className="playground-section__arrow">{open ? "▲" : "▼"}</span>
        )}
      </Button>
      {open && children}
    </section>
  );
}
