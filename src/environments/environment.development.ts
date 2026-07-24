export const environment = {
  production: false,
  /** Same path shape as the real API so swapping backends is a URL/flag change only. */
  apiBaseUrl: '',
  /** In-memory mock interceptor simulates backend calc responses. Set to false to hit a real API. */
  useMockApi: true,
};
