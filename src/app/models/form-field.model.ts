export type FieldKind = 'normal' | 'calculated' | 'calculated-overridable';
export type FieldStatus = 'idle' | 'pending' | 'error';

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

export interface FieldUpdateRequest {
  field: string;
  value: number | null;
}

export interface FieldValueDto {
  field: string;
  value: number | null;
}

/**
 * Contract shared with the .NET backend.
 * Frontend never computes calc values — it only applies what the API returns.
 */
export interface FieldUpdateResponse {
  value: FieldValueDto;
  calc: FieldValueDto[];
}
