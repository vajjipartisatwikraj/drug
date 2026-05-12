import { useState, useCallback, useRef, useEffect } from "react";

type PipelineCheckStatus = "pending" | "in_progress" | "done" | "error";

export interface PipelineCheck {
  key: string;
  label: string;
  status: PipelineCheckStatus;
  message?: string;
}

interface AuditMessage {
  type: "status" | "content" | "error" | "pipeline";
  message?: string;
  markdown?: string;
  status?: string;
  stage?: string;
  meta?: Record<string, unknown>;
}

interface UseAuditReturn {
  markdown: string;
  status: "idle" | "uploading" | "processing" | "completed" | "error";
  error: string | null;
  elapsedTime: string | null;
  pipelineChecks: PipelineCheck[];
  uploadAndAudit: (file: File, token: string) => Promise<void>;
  loadExistingAudit: (markdownContent: string) => void;
  reset: () => void;
}

const PIPELINE_STEPS: Array<{ key: string; label: string }> = [
  { key: "upload_received", label: "Upload accepted" },
  { key: "ocr_request_started", label: "Mistral OCR request sent" },
  { key: "ocr_response_received", label: "Mistral OCR response received" },
  {
    key: "gemini_payload_prepared",
    label: "System instruction + PDF + OCR prepared",
  },
  { key: "gemini_request_started", label: "Gemma request sent" },
  { key: "math_calls_executed", label: "Math API verification" },
  { key: "gemini_response_ready", label: "Gemma response received" },
  { key: "audit_completed", label: "Audit pipeline completed" },
];

function initialPipelineChecks(): PipelineCheck[] {
  return PIPELINE_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    status: "pending",
  }));
}

function formatElapsed(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function useAudit(): UseAuditReturn {
  const [markdown, setMarkdown] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "uploading" | "processing" | "completed" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string | null>(null);
  const [pipelineChecks, setPipelineChecks] = useState<PipelineCheck[]>(
    initialPipelineChecks(),
  );
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef(status);
  const startTimeRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const runIdRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Cleanup elapsed time interval on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    };
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const uploadAndAudit = useCallback(async (file: File, token: string) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    try {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }

      setStatus("uploading");
      setError(null);
      setMarkdown("");
      setElapsedTime("0s");
      setPipelineChecks(() =>
        initialPipelineChecks().map((step, idx) =>
          idx === 0
            ? {
                ...step,
                status: "in_progress" as const,
                message: "Uploading PDF to backend.",
              }
            : step,
        ),
      );

      // Start timer
      startTimeRef.current = Date.now();

      // Update elapsed time every second from upload start to completion/error
      elapsedIntervalRef.current = setInterval(() => {
        if (
          startTimeRef.current &&
          (statusRef.current === "uploading" ||
            statusRef.current === "processing")
        ) {
          const elapsed = Math.floor(
            (Date.now() - startTimeRef.current) / 1000,
          );
          const timeStr = formatElapsed(elapsed);
          setElapsedTime(timeStr);

          // Update the currently active pipeline step message with elapsed time
          setPipelineChecks((prev) => {
            const updated = [...prev];
            const lastInProgress = updated.findIndex(
              (c) => c.status === "in_progress",
            );
            if (lastInProgress >= 0) {
              const currentMessage =
                updated[lastInProgress].message ||
                updated[lastInProgress].label;
              const baseMessage = currentMessage.replace(
                /(?:\s+\((?:\d+s|\d+m\s+\d+s) elapsed\)\s*)+$/i,
                "",
              );
              updated[lastInProgress].message =
                `${baseMessage} (${timeStr} elapsed)`;
            }
            return updated;
          });
        }
      }, 1000);

      // Upload the file
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const { job_id } = await uploadResponse.json();
      if (runIdRef.current !== runId) {
        return;
      }

      // Connect to WebSocket for streaming
      setStatus("processing");

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/api/audit/${job_id}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const markPipelineStep = (
        stepKey: string,
        nextStatus: PipelineCheckStatus,
        message?: string,
      ) => {
        setPipelineChecks((prev) => {
          const stepIndex = prev.findIndex((s) => s.key === stepKey);
          return prev.map((step, idx) => {
            if (idx < stepIndex && step.status === "in_progress") {
              return { ...step, status: "done" };
            }
            if (idx === stepIndex) {
              return {
                ...step,
                status:
                  nextStatus === "in_progress" && step.status === "done"
                    ? "done"
                    : nextStatus,
                message: message ?? step.message,
              };
            }
            return step;
          });
        });
      };

      ws.onmessage = (event) => {
        if (runIdRef.current !== runId) {
          return;
        }
        const data: AuditMessage = JSON.parse(event.data);

        if (data.type === "content" && data.markdown) {
          setMarkdown((prev) => prev + data.markdown);
        } else if (data.type === "pipeline" && data.stage) {
          if (data.stage === "math_calls_missing") {
            markPipelineStep("math_calls_executed", "error", data.message);
            return;
          }
          if (data.stage === "math_calls_not_required") {
            markPipelineStep("math_calls_executed", "done", data.message);
            return;
          }
          if (data.stage === "math_calls_executed") {
            markPipelineStep("math_calls_executed", "done", data.message);
            return;
          }
          if (
            data.stage === "ocr_request_started" ||
            data.stage === "gemini_request_started"
          ) {
            markPipelineStep(data.stage, "in_progress", data.message);
          } else {
            markPipelineStep(data.stage, "done", data.message);
          }
        } else if (data.type === "status") {
          if (data.status === "completed") {
            if (elapsedIntervalRef.current) {
              clearInterval(elapsedIntervalRef.current);
              elapsedIntervalRef.current = null;
            }
            const elapsed = startTimeRef.current
              ? Math.floor((Date.now() - startTimeRef.current) / 1000)
              : 0;
            const elapsedStr = formatElapsed(elapsed);
            setElapsedTime(elapsedStr);
            // Update completion message with elapsed time
            markPipelineStep(
              "audit_completed",
              "done",
              `Audit complete (Total time: ${elapsedStr})`,
            );
            startTimeRef.current = null;
            statusRef.current = "completed";
            setStatus("completed");
          }
        } else if (data.type === "error") {
          if (elapsedIntervalRef.current) {
            clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
          }
          if (startTimeRef.current) {
            setElapsedTime(
              formatElapsed(
                Math.floor((Date.now() - startTimeRef.current) / 1000),
              ),
            );
          }
          setError(data.message || "An error occurred");
          statusRef.current = "error";
          setStatus("error");
          startTimeRef.current = null;
          setPipelineChecks((prev) =>
            prev.map((step) =>
              step.status === "in_progress"
                ? {
                    ...step,
                    status: "error",
                    message: data.message || step.message,
                  }
                : step,
            ),
          );
        }
      };

      ws.onerror = () => {
        if (runIdRef.current !== runId) {
          return;
        }
        if (elapsedIntervalRef.current) {
          clearInterval(elapsedIntervalRef.current);
          elapsedIntervalRef.current = null;
        }
        if (startTimeRef.current) {
          setElapsedTime(
            formatElapsed(
              Math.floor((Date.now() - startTimeRef.current) / 1000),
            ),
          );
        }
        setError("WebSocket connection error");
        statusRef.current = "error";
        setStatus("error");
        startTimeRef.current = null;
        setPipelineChecks((prev) =>
          prev.map((step) =>
            step.status === "in_progress"
              ? {
                  ...step,
                  status: "error",
                  message: "WebSocket connection error",
                }
              : step,
          ),
        );
      };

      ws.onclose = () => {
        if (runIdRef.current !== runId) {
          return;
        }
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (
          statusRef.current !== "completed" &&
          statusRef.current !== "error"
        ) {
          if (elapsedIntervalRef.current) {
            clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
          }
          if (startTimeRef.current) {
            setElapsedTime(
              formatElapsed(
                Math.floor((Date.now() - startTimeRef.current) / 1000),
              ),
            );
          }
          setError("Audit connection closed before completion. Please retry.");
          statusRef.current = "error";
          setStatus("error");
          startTimeRef.current = null;
          setPipelineChecks((prev) =>
            prev.map((step) =>
              step.status === "in_progress"
                ? {
                    ...step,
                    status: "error",
                    message: "Audit connection closed before completion.",
                  }
                : step,
            ),
          );
        }
      };
    } catch (err) {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
      if (startTimeRef.current) {
        setElapsedTime(
          formatElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)),
        );
      }
      setError(err instanceof Error ? err.message : "An error occurred");
      statusRef.current = "error";
      setStatus("error");
      startTimeRef.current = null;
      setPipelineChecks((prev) =>
        prev.map((step) =>
          step.status === "in_progress"
            ? {
                ...step,
                status: "error",
                message:
                  err instanceof Error ? err.message : "An error occurred",
              }
            : step,
        ),
      );
    }
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    startTimeRef.current = null;
    setMarkdown("");
    setStatus("idle");
    setError(null);
    setElapsedTime(null);
    setPipelineChecks(initialPipelineChecks());
  }, []);

  const loadExistingAudit = useCallback((markdownContent: string) => {
    runIdRef.current += 1;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    startTimeRef.current = null;
    setMarkdown(markdownContent);
    setStatus("completed");
    setError(null);
    setElapsedTime(null);
    setPipelineChecks(initialPipelineChecks().map((s) => ({ ...s, status: "done" })));
  }, []);

  return {
    markdown,
    status,
    error,
    elapsedTime,
    pipelineChecks,
    uploadAndAudit,
    loadExistingAudit,
    reset,
  };
}
