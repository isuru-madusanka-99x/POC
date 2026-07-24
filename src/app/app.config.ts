import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';
import { mockFormApiInterceptor } from './interceptors/mock-form-api.interceptor';

const httpInterceptors = environment.useMockApi
  ? [mockFormApiInterceptor]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors(httpInterceptors)),
  ],
};
