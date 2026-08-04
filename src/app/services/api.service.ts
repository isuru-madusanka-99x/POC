import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FieldUpdateRequest,
  FieldUpdateResponse,
  FormStateResponse,
} from '../models/form-field.model';
import {
  TableRowPayload,
  TableRowsUpdateResponse,
  TableStateResponse,
} from '../models/table-row.model';

/**
 * Single HTTP client for the calculated-fields POC.
 * Form (flat fields) and table (row arrays) both live here.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  // --- Form (flat fields) ---

  /** GET /api/form — full form snapshot. */
  getForm(): Observable<FormStateResponse> {
    return this.http.get<FormStateResponse>(`${this.baseUrl}/api/form`);
  }

  /**
   * PATCH a single form field.
   * Backend may return dependent calculated fields in `calc`.
   */
  updateField(request: FieldUpdateRequest): Observable<FieldUpdateResponse> {
    return this.http.patch<FieldUpdateResponse>(
      `${this.baseUrl}/api/form/fields`,
      request
    );
  }

  // --- Table (row arrays) ---

  /** GET /api/table — full table snapshot. */
  getTable(): Observable<TableStateResponse> {
    return this.http.get<TableStateResponse>(`${this.baseUrl}/api/table`);
  }

  /**
   * PUT the full array of editable row values.
   * Backend returns confirmed `value` rows plus dependent `calc` rows.
   */
  updateRows(rows: TableRowPayload[]): Observable<TableRowsUpdateResponse> {
    return this.http.put<TableRowsUpdateResponse>(
      `${this.baseUrl}/api/table/rows`,
      rows
    );
  }
}
