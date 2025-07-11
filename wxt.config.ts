import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  // auto-icons: https://github.com/wxt-dev/wxt/blob/HEAD/packages/auto-icons/src/index.ts
  manifest: {
    name: 'Patreon Exporter',
    description: 'Export Patreon posts to clean PDFs for offline reading',
    version: '0.1.0',
    permissions: ['activeTab', 'downloads', 'storage'],
    host_permissions: [
      'https://www.patreon.com/*',
      'https://*.patreon.com/*',
      'https://c8.patreon.com/*',
      'https://c10.patreon.com/*'
    ],
    action: { 
      default_title: 'Export to PDF',
    },
    // It will set by auto-icons
    // icons: {
    //   "16": "icon/16.png",
    //   "32": "icon/32.png",
    //   "48": "icon/48.png",
    //   "128": "icon/128.png"
    // },
  },
  targetBrowsers: ['chrome', 'edge', 'firefox'],
});