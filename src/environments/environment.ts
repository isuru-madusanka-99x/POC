import { withDevToolsStub } from '@angular-architects/ngrx-toolkit';

export const environment = {
  production: true,
  /** Base URL for the form API (no trailing slash). */
  apiBaseUrl: 'https://localhost:7161',
  /** No-op stub so Redux DevTools is tree-shaken from production builds. */
  storeWithDevTools: withDevToolsStub,
};
