export const environment = {
  production: true,
  /** Base URL for the form API (no trailing slash). Real .NET API example: 'https://localhost:7xxx' */
  apiBaseUrl: 'https://localhost:7161',
  /** When false, HttpClient calls the real backend. When true, the mock interceptor handles PATCH /api/form/fields. */
  useMockApi: false,
};
