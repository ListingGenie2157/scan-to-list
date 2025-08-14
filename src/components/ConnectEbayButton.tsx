import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";

export const ConnectEbayButton = () => {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    console.log("handleConnect called - button was clicked!");
    
    try {
      console.log("Starting eBay connection process...");
      setLoading(true);

      console.log("Invoking ebay-oauth-start function...");
      const { data, error } = await supabase.functions.invoke("ebay-oauth-start");

      console.log("Function response received:", { data, error });

      if (error) {
        console.error("Function error details:", error);
        throw error;
      }

      const url = (data as any)?.authorizeUrl as string | undefined;
      console.log("Authorization URL received:", url);

      if (!url) {
        console.error("No authorization URL in response:", data);
        throw new Error("Authorization URL not returned");
      }

      console.log("Redirecting to eBay (top window to avoid iframe blocking)...");
      // Try to break out of iframe (eBay blocks being embedded via X-Frame-Options)
      try {
        if (window.top) {
          console.log("Using window.top.location");
          (window.top as Window).location.href = url;
          return;
        }
      } catch (e) {
        console.log("window.top failed:", e);
        // Ignore cross-origin access errors; we'll fall back to opening a new tab
      }

      // Fallback: open in a new tab
      console.log("Opening in new tab");
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) {
        console.log("Popup blocked, using current window");
        // Last resort: navigate current frame
        window.location.href = url;
      }
    } catch (err) {
      console.error("Failed to start eBay OAuth:", err);
      alert("Couldn't start eBay connection. Please try again.");
    } finally {
      console.log("Setting loading to false");
      setLoading(false);
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
      {loading ? (
        <Loader2 className="w-6 h-6 mb-2 animate-spin" />
      ) : (
        <LinkIcon className="w-6 h-6 mb-2" />
      )}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
};
