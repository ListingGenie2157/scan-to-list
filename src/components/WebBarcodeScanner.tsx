import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export default function WebBarcodeScanner({ onCode, onClose, continuous = false, overlayLines = [] }: {
  onCode: (c: string) => void;
  onClose: () => void;
  continuous?: boolean;
  overlayLines?: string[];
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A]);
    const reader = new BrowserMultiFormatReader(hints);
    let controls: any;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: ({
        facingMode: { ideal: "environment" },
        // Focus mode is not universally supported; browsers will ignore if unsupported
        advanced: [{ focusMode: "continuous" }],
      } as any),
    };

    (async () => {
      try {
        controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result) => {
            if (result) {
              const text = result.getText().trim();
              const now = Date.now();
              // Throttle duplicate reads within 2 seconds
              if (text === lastRef.current.code && now - lastRef.current.ts < 2000) return;
              lastRef.current = { code: text, ts: now };

              onCode(text);
              if (!continuous) {
                onClose();
              }
            }
          }
        );
      } catch (e) {
        console.error("Scanner error", e);
      }
    })();

    return () => controls?.stop?.();
  }, [onCode, onClose, continuous]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9999 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <button
        onClick={onClose}
        style={{ position: "absolute", top: 12, right: 12, padding: "8px 12px" }}
      >
        Close
      </button>
      {overlayLines?.length ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            color: "#fff",
            background: "rgba(0,0,0,0.5)",
            padding: "8px 12px",
            borderRadius: 8,
            maxWidth: "80%",
            fontFamily: "ui-sans-serif, system-ui, -apple-system",
            fontSize: 14,
            lineHeight: 1.3,
          }}
        >
          {overlayLines.slice(-3).map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
