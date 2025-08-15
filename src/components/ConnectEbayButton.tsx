import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";

export const ConnectEbayButton = () => {
  console.log("ConnectEbayButton component is rendering");
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

      console.log("Opening eBay authorization in popup...");
      
      // Open popup window for OAuth
      const popup = window.open(
        url, 
        "ebay-oauth", 
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );
      
      if (!popup) {
        console.error("Popup was blocked");
        alert("Please allow popups for this site to connect to eBay.");
        return;
      }

      // Listen for the OAuth completion
      const pollTimer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(pollTimer);
            console.log("Popup was closed");
            // Check if we have a successful connection by checking URL params
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('ebay') === 'connected') {
              alert("Successfully connected to eBay!");
              // Refresh the page to update the UI
              window.location.reload();
            }
            return;
          }

          // Check if popup navigated to our callback URL
          try {
            const popupUrl = popup.location.href;
            if (popupUrl.includes('ebay=connected')) {
              clearInterval(pollTimer);
              popup.close();
              alert("Successfully connected to eBay!");
              // Refresh the page to update the UI
              window.location.reload();
            }
          } catch (e) {
            // Cross-origin error - popup is still on eBay domain, continue polling
          }
        } catch (err) {
          console.error("Error checking popup status:", err);
        }
      }, 1000);

      // Clean up after 5 minutes
      setTimeout(() => {
        clearInterval(pollTimer);
        if (!popup.closed) {
          popup.close();
        }
      }, 300000);
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
