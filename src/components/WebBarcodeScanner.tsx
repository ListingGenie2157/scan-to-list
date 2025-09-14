import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, ResultMetadataType } from "@zxing/library";

export default function WebBarcodeScanner({ onCode, onClose, continuous = false, overlayLines = [] }: {
  onCode: (c: string) => void;
  onClose: () => void;
  continuous?: boolean;
  overlayLines?: string[];
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    const hints: Map<DecodeHintType, unknown> = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8]);
    // Enable detection of EAN-2/EAN-5 add-on extensions (magazine issue/price)
    hints.set(DecodeHintType.ALLOWED_EAN_EXTENSIONS, [2, 5]);
    const reader = new BrowserMultiFormatReader(hints);
    let controls: IScannerControls | undefined;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        // Focus mode is not universally supported; browsers will ignore if unsupported
        advanced: [{ focusMode: "continuous" } as any],
      } as MediaTrackConstraints,
    };

    (async () => {
      try {
        controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result) => {
            if (result) {
              let text = result.getText().trim();
              try {
                const meta = result.getResultMetadata?.();
                if (meta instanceof Map) {
                  const ext = meta.get(ResultMetadataType.UPC_EAN_EXTENSION);
                  if (ext && /^(\d{2}|\d{5})$/.test(String(ext))) {
                    text = text + String(ext);
                  }
                }
              } catch (err) {
                console.warn('metadata parse error', err);
              }
              
              // For EAN-13 codes, try to detect add-ons by looking for additional numbers
              // This is a basic implementation - real scanners might capture add-ons differently
              if (text.length === 13 && text.startsWith('977')) {
                // This is likely a magazine with ISSN code - check if we can detect add-ons
                // For now, we'll pass the base code and let the backend handle it
              }
              
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999 }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: "absolute", top: 12, right: 12, padding: "8px 12px", background: "rgba(17,17,17,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8 }}
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
