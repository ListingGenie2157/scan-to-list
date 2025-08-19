import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export function ConnectEbayButton() {
  const [loading, setLoading] = useState(false);
  const checkIntervalRef = useRef<number | null>(null);

  const checkConnectionStatus = async () => {
    try {
      // Try to refresh token - if successful, user is connected
      const { data, error } = await supabase.functions.invoke('ebay-refresh-token');
      
      if (data && !error) {
        toast({ 
          title: "Success!", 
          description: "Successfully connected to eBay",
          duration: 5000,
        });
        
        // Refresh page after short delay to update UI
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        
        return true;
      }
    } catch (err) {
      // Not connected yet, that's ok
      console.log("Connection check failed - user may have cancelled");
    }
    return false;
  };

  const startOAuth = async () => {
    if (loading) return;
    setLoading(true);

    const width = 600;
    const height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    let popup: Window | null = null;
    let timeoutId: number | null = null;

    try {
      // Check if user is signed in
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        toast({ 
          title: "Sign in required", 
          description: "Please sign in and try again.", 
          variant: "destructive" 
        });
        return;
      }

      // Open blank popup synchronously to avoid blockers
      // Removed noopener,noreferrer to ensure we can check popup.closed
      const features = `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`;
      popup = window.open("", "ebay-oauth", features);

      // Safety timeout (30s) - reduced from 60s for better UX
      timeoutId = window.setTimeout(() => {
        if (popup && !popup.closed) {
          try { 
            popup.close(); 
          } catch {}
          popup = null;
        }
        
        // Clear the check interval if it exists
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
        
        setLoading(false);
        toast({ 
          title: "Timeout", 
          description: "Connection timed out. Please try again.", 
          variant: "destructive" 
        });
      }, 30_000);

      // Get the OAuth URL from your edge function
      const { data, error } = await supabase.functions.invoke<{ authorizeUrl: string }>(
        "ebay-oauth-start",
        { 
          body: { 
            environment: "production", 
            returnUrl: `${window.location.origin}/?ebay=connected` 
          } 
        }
      );

      // Clear timeout since we got a response
      if (timeoutId) { 
        window.clearTimeout(timeoutId); 
        timeoutId = null; 
      }
      
      if (error || !data?.authorizeUrl) {
        throw new Error(error?.message || "No authorization URL received");
      }

      if (popup && !popup.closed) {
        // Navigate popup to eBay
        popup.location.href = data.authorizeUrl;
        
        // Keep spinner until popup closes, then check connection status
        checkIntervalRef.current = window.setInterval(async () => {
          if (!popup || popup.closed) {
            // Popup closed - stop checking
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
            
            // Give eBay callback a moment to complete
            setTimeout(async () => {
              // Check if connection was successful
              const connected = await checkConnectionStatus();
              
              if (!connected) {
                // User likely cancelled or there was an error
                toast({ 
                  title: "Connection Cancelled", 
                  description: "eBay connection was not completed.",
                  variant: "default" 
                });
              }
              
              setLoading(false);
            }, 2000);
          }
        }, 1000);
        
        // Stop checking after 5 minutes (backup timeout)
        setTimeout(() => {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
            setLoading(false);
          }
        }, 5 * 60 * 1000);
        
      } else {
        // Popup blocked or closed - fallback to full-page redirect
        window.location.assign(data.authorizeUrl);
        // Note: page will navigate away, so loading state doesn't matter
      }
      
    } catch (e: any) {
      // Clean up timeout
      if (timeoutId) { 
        window.clearTimeout(timeoutId); 
        timeoutId = null; 
      }
      
      // Clean up interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      
      // Close popup if open
      if (popup && !popup.closed) {
        try { 
          popup.close(); 
        } catch {}
        popup = null;
      }
      
      setLoading(false);
      toast({ 
        title: "Connection Error", 
        description: e?.message || "Failed to start eBay connection", 
        variant: "destructive" 
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="h-20 flex-col"
      onClick={startOAuth}
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
}

