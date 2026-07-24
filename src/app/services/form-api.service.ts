import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FieldUpdateRequest,
  FieldUpdateResponse,
} from '../models/form-field.model';

@Injectable({ providedIn: 'root' })
export class FormApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * PATCH a single field. The backend may return updates for any dependent
   * calculated fields in `calc`. No formulas live on the client.
   */
  updateField(request: FieldUpdateRequest): Observable<FieldUpdateResponse> {
    return this.http.patch<FieldUpdateResponse>(
      `${this.baseUrl}/api/form/fields`,
      request
    );
  }
}
