import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const START_FN = "ebay-oauth-start";            // match your deployed name
const ENV = "production";                       // force prod

export const ConnectEbayButton = () => {
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleConnect = async () => {
    if (loading) return;

    try {
      // Open a blank popup synchronously to avoid popup blockers
      const features = "width=600,height=700,scrollbars=yes,resizable=yes";
      const prePopup = window.open("", "ebay-oauth", features);
      if (!prePopup) {
        throw new Error("Popup blocked. Allow popups for this site.");
      }
      popupRef.current = prePopup;

      setLoading(true);

      // Ensure signed in
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) throw new Error("Sign in first.");

      // Start OAuth (PROD + returnUrl)
      const { data, error } = await supabase.functions.invoke<{ authorizeUrl: string }>(START_FN, {
        body: { environment: ENV, returnUrl: `${window.location.origin}/?ebay=connected` },
      });
      if (error) throw new Error(error.message || "Failed to start eBay OAuth");
      if (!data?.authorizeUrl) throw new Error("No authorization URL received");

      // Navigate the already-opened popup to the authorize URL
      if (popupRef.current) {
        popupRef.current.location.href = data.authorizeUrl;
      }

      // Poll refresh-token (authoritative success)
      pollRef.current = window.setInterval(async () => {
        try {
          // If user closed popup → treat as cancel
          if (popupRef.current?.closed) {
            cleanup();
            setLoading(false);
            toast({ title: "Cancelled", description: "Popup closed before connecting." });
            return;
          }

          const { data: tokenData } = await supabase.functions.invoke<{ access_token?: string }>(
            "ebay-refresh-token",
            { body: { environment: ENV } }
          );

          if (tokenData?.access_token) {
            cleanup();
            setLoading(false);
            toast({ title: "Success", description: "eBay (Production) connected." });
            // optional: refresh UI
            setTimeout(() => window.location.reload(), 800);
          }
        } catch {
          // ignore until success; real errors will surface on button retry
        }
      }, 2000);

      // Hard timeout (5 min)
      timeoutRef.current = window.setTimeout(() => {
        cleanup();
        setLoading(false);
        toast({ title: "Timeout", description: "Connection timed out. Try again.", variant: "destructive" });
      }, 5 * 60 * 1000);

    } catch (e: any) {
      cleanup();
      setLoading(false);
      toast({ title: "Error", description: e?.message || "Failed to connect to eBay", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="h-20 flex-col"
      onClick={handleConnect}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-6 h-6 mb-2 animate-spin" /> : <LinkIcon className="w-6 h-6 mb-2" />}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
};
