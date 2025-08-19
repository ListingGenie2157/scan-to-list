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
      setLoading(true);

      // Ensure signed in first
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) {
        throw new Error("Please sign in first.");
      }

      // Generate OAuth URL directly to avoid popup blocker
      const userId = sess.session.user.id;
      const state = btoa(`${userId}:${Date.now()}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const callbackUrl = "https://yfynlpwzrxoxcwntigjv.supabase.co/functions/v1/ebay-oauth-callback";
      
      const authorizeUrl = new URL("https://auth.ebay.com/oauth2/authorize");
      authorizeUrl.searchParams.set("client_id", "dreamyre-li-PRD-08114632d-4a65373b");
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
      authorizeUrl.searchParams.set("scope", "https://api.ebay.com/oauth/api_scope/sell.inventory");
      authorizeUrl.searchParams.set("state", state);

      console.log("Opening popup with direct URL:", authorizeUrl.toString());
      
      // Open popup immediately with the OAuth URL
      popupRef.current = window.open(
        authorizeUrl.toString(),
        "ebay-oauth",
        "width=600,height=700,scrollbars=yes,resizable=yes,location=yes"
      );
      
      if (!popupRef.current) {
        setLoading(false);
        toast({ 
          title: "Popup Blocked", 
          description: "Please allow popups for this site in your browser settings and try again.",
          variant: "destructive" 
        });
        return;
      }

      console.log("Popup opened successfully");

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
