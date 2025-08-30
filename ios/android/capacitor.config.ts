import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.listinggenie.app',
  appName: 'Listing Genie',
  webDir: 'dist'
 server: {
    url: 'http://192.168.4.174:8081',
    cleartext: true
  }
};

export default config;
