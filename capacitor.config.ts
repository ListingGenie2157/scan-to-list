import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8df2d048f9db4afe90c69827cababee3',
  appName: 'scan-to-list',
  webDir: 'dist',
  server: {
    url: 'https://8df2d048-f9db-4afe-90c6-9827cababee3.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    BarcodeScanner: {
      androidActivityName: 'com.capacitor.barcodescanner.BarcodeScannerActivity'
    }
  }
};

export default config;