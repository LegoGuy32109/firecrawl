import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  activeView,
  lastVisibleDockMode,
  requestDockMode,
  requestRailWidth,
} from "./signals";
import { Header } from "./components/Header";
import { FeatureNav } from "./components/FeatureNav";
import { RequestBuilder } from "./components/RequestBuilder";
import { ResponseHistory } from "./components/ResponseHistory";
import { LiveView } from "./components/LiveView";
import { Panel } from "./components/ui/Panel";
import { Button } from "./components/ui/Button";

const MIN_RAIL_WIDTH = 320;
const DEFAULT_RAIL_WIDTH = 420;
const MAX_RAIL_WIDTH = 680;

type DragState = {
  pointerId: number;
  startX: number;
  startWidth: number;
  side: "left" | "right";
};

function clampRailWidth(value: number, viewportWidth: number): number {
  return Math.max(
    MIN_RAIL_WIDTH,
    Math.min(Math.min(MAX_RAIL_WIDTH, viewportWidth * 0.55), value),
  );
}

function getDockWidth(): number {
  if (typeof window === "undefined") return requestRailWidth.value;
  return clampRailWidth(requestRailWidth.value, window.innerWidth);
}

export function App() {
  const view = activeView.value;
  const dockMode = requestDockMode.value;
  const isHistory = view === "history";
  const showRequest = dockMode !== "hide" && !isHistory;
  const railWidth = getDockWidth();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStartRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!dragState) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      const viewportWidth = window.innerWidth;
      const delta =
        dragState.side === "left"
          ? event.clientX - dragState.startX
          : dragState.startX - event.clientX;
      requestRailWidth.value = clampRailWidth(
        dragState.startWidth + delta,
        viewportWidth,
      );
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      setDragState(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (!dragState || !dragStartRef.current) return;
    dragStartRef.current.setPointerCapture(dragState.pointerId);
  }, [dragState]);

  const setDockMode = (mode: "left" | "right" | "hide") => {
    if (mode === "hide") {
      if (requestDockMode.value !== "hide") {
        lastVisibleDockMode.value = requestDockMode.value as "left" | "right";
      }
      requestDockMode.value = "hide";
      return;
    }

    lastVisibleDockMode.value = mode;
    requestDockMode.value = mode;
  };

  const toggleRequestVisibility = () => {
    if (requestDockMode.value === "hide") {
      requestDockMode.value = lastVisibleDockMode.value;
      return;
    }
    lastVisibleDockMode.value = requestDockMode.value as "left" | "right";
    requestDockMode.value = "hide";
  };

  const beginResize = (
    event: h.JSX.TargetedPointerEvent<HTMLButtonElement>,
    side: "left" | "right",
  ) => {
    if (typeof window === "undefined") return;
    event.preventDefault();
    event.stopPropagation();
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: requestRailWidth.value,
      side,
    });
    dragStartRef.current = event.currentTarget;
  };

  const requestPane = showRequest ? (
    <div className="playground-workspace__request-wrap">
      <Panel label="Request">
        <RequestBuilder />
      </Panel>
      <button
        ref={dragStartRef}
        type="button"
        className={[
          "playground-workspace__resize",
          `playground-workspace__resize--${dockMode}`,
        ].join(" ")}
        aria-label="Resize request panel"
        onPointerDown={e => beginResize(e, dockMode as "left" | "right")}
      />
    </div>
  ) : null;

  return (
    <div className="playground-shell">
      <Header />
      <FeatureNav />

      {isHistory ? (
        <Panel className="playground-panel--full">
          <ResponseHistory />
        </Panel>
      ) : (
        <>
          <div className="playground-workspace-toolbar">
            <div className="playground-workspace-toolbar__desktop">
              <Button
                type="button"
                size="sm"
                variant={dockMode === "left" ? "primary" : "ghost"}
                onClick={() => setDockMode("left")}
              >
                Left
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dockMode === "right" ? "primary" : "ghost"}
                onClick={() => setDockMode("right")}
              >
                Right
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dockMode === "hide" ? "primary" : "ghost"}
                onClick={() => setDockMode("hide")}
              >
                Hide
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  requestRailWidth.value = DEFAULT_RAIL_WIDTH;
                }}
              >
                Reset width
              </Button>
            </div>
            <div className="playground-workspace-toolbar__mobile">
              <Button
                type="button"
                size="sm"
                variant={dockMode === "hide" ? "ghost" : "primary"}
                onClick={toggleRequestVisibility}
              >
                {dockMode === "hide" ? "Show request" : "Hide request"}
              </Button>
            </div>
          </div>

          <div
            className={[
              "playground-workspace",
              `playground-workspace--dock-${dockMode}`,
              showRequest && "playground-workspace--request-visible",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--request-rail-width": `${railWidth}px`,
              } as Record<string, string>
            }
          >
            {dockMode === "left" && requestPane}

            <Panel>
              <ResponseHistory />
            </Panel>

            {dockMode === "right" && requestPane}
          </div>

          <div className="playground-grid playground-grid--wide-left">
            <Panel label="Live view">
              <LiveView />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
