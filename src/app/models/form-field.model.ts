export type FieldKind = 'normal' | 'calculated' | 'calculated-overridable';
export type FieldStatus = 'idle' | 'pending' | 'error';
export type FormLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface FormField {
  fieldId: string;
  kind: FieldKind;
  value: number | null;
  /** Meaningful only for calculated-overridable fields. */
  isOverridden: boolean;
  status: FieldStatus;
  label: string;
  errorMessage: string | null;
}

export type FormFieldsState = Record<string, FormField>;

/** GET /api/form — single field (FormFieldDto). */
export interface FormFieldDto {
  field: string;
  kind: FieldKind | string;
  value: number | null;
  isOverridden?: boolean | null;
}

/** GET /api/form — FormStateResponse. */
export interface FormStateResponse {
  fields: FormFieldDto[];
}

export interface FieldUpdateRequest {
  field: string;
  value: number | null;
}

export interface FieldValueDto {
  field: string;
  value: number | null;
}

/**
 * PATCH /api/form/fields response.
 * Frontend never computes calc values — it only applies what the API returns.
 */
export interface FieldUpdateResponse {
  value: FieldValueDto;
  calc: FieldValueDto[];
}

export interface ErrorResponse {
  error: string;
}
