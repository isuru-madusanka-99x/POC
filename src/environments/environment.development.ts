import { withDevtools } from '@angular-architects/ngrx-toolkit';

export const environment = {
  production: false,
  /** Base URL for the form API (no trailing slash). */
  apiBaseUrl: 'https://localhost:7161',
  /** Enables Chrome Redux DevTools for NgRx Signal Store ("NgRx Signal Store" tab). */
  storeWithDevTools: withDevtools,
};
