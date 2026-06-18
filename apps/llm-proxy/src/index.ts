import express, { Request, Response } from "express";
import { createBackend } from "./backends/index";
import type { Message } from "./backends/index";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const backend = createBackend();

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// POST /complete
// ---------------------------------------------------------------------------

app.post("/complete", async (req: Request, res: Response) => {
  const { messages } = req.body as { messages: Message[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const text = await backend.complete(messages);

    // Try to detect tool_call shaped JSON
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.tool === "string" &&
        parsed.args !== undefined
      ) {
        return res.json({
          type: "tool_call",
          name: parsed.tool,
          args: parsed.args,
        });
      }
    } catch {
      // not JSON — fall through to text response
    }

    return res.json({ type: "text", text });
  } catch (err: any) {
    if (err?.code === "CODEX_NOT_AUTHENTICATED") {
      return res.status(401).json({
        error: "CODEX_NOT_AUTHENTICATED",
        message:
          "Codex is not logged in. Run: docker run -it --volume codex-auth:/root/.codex <image> codex login",
      });
    }
    console.error("LLM proxy error:", err);
    return res.status(500).json({
      error: "PROXY_ERROR",
      message: err?.message ?? "Internal proxy error",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", backend: process.env.PROXY_BACKEND ?? "codex" });
});

// ---------------------------------------------------------------------------
// Startup auth check
// ---------------------------------------------------------------------------

async function startupCheck(): Promise<void> {
  try {
    await backend.complete([{ role: "user", content: "respond with: ok" }]);
    console.log("[llm-proxy] Startup auth check passed.");
  } catch (err: any) {
    if (err?.code === "CODEX_NOT_AUTHENTICATED") {
      console.warn(
        "[llm-proxy] WARNING: Backend is not authenticated. " +
          "Run the following to log in:\n" +
          "  docker run -it --volume codex-auth:/root/.codex <image> codex login",
      );
    } else {
      console.warn("[llm-proxy] Startup auth check failed:", err?.message);
    }
  }
}

app.listen(PORT, () => {
  console.log(`[llm-proxy] Listening on port ${PORT}`);
  startupCheck().catch(() => {});
});
