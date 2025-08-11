import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function WebBarcodeScanner({ onCode, onClose }: {
  onCode: (c: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: any;
    (async () => {
      controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, err) => {
          if (result) {
            onCode(result.getText().trim());
            onClose();
          }
        }
      );
    })();
    return () => controls?.stop?.();
  }, [onCode, onClose]);

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
    </div>
  );
}
