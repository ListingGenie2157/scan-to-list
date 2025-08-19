// src/components/ConnectEbayButton.tsx
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export function ConnectEbayButton() {
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const width = 600, height = 700;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  const startOAuth = async () => {
    if (loading) return;
    setLoading(true);

    // open popup FIRST to avoid blockers
    popupRef.current = window.open(
      "about:blank",
      "ebay-oauth",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    const start = async () => {
      const { data, error } = await supabase.functions.invoke("ebay-oauth-start", {
        body: {
          environment: "production",
          returnUrl: `${window.location.origin}/settings?ebay=connected`,
        },
      });
      if (error || !data?.authorizeUrl) throw new Error(error?.message || "No auth URL");
      return data.authorizeUrl as string;
    };

    try {
      if (!popupRef.current) {
        // fallback: full-page redirect if popup blocked
        const url = await start();
        window.location.href = url;
        return;
      }
      try { popupRef.current.document.write("<p style='font-family:sans-serif'>Opening eBay…</p>"); } catch {}

      const url = await start();
      popupRef.current.location.href = url;
    } catch (e:any) {
      try { popupRef.current?.close(); } catch {}
      toast({ title: "Error", description: e.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="lg" className="h-20 flex-col" onClick={startOAuth} disabled={loading}>
      {loading ? <Loader2 className="w-6 h-6 mb-2 animate-spin" /> : <LinkIcon className="w-6 h-6 mb-2" />}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
}

