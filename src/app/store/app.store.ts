import { computed, effect, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { updateState } from '@angular-architects/ngrx-toolkit';
import {
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import {
  debounceTime,
  groupBy,
  mergeMap,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FieldKind,
  FieldValueDto,
  FormField,
  FormFieldDto,
  FormFieldsState,
  FormLoadStatus,
  FormStateResponse,
} from '../models/form-field.model';
import {
  TableRow,
  TableRowPayload,
  TableRowsState,
  TableStateResponse,
} from '../models/table-row.model';
import { ApiService } from '../services/api.service';

// ---------------------------------------------------------------------------
// Labels & state
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  userInput1: 'User Input 1 (normal)',
  userInput2: 'User Input 2 (normal)',
  calInput1: 'Calc Input 1 (calculated, read-only)',
  calInput2: 'Calc Input 2 (calculated, overridable)',
};

const TABLE_USER_INPUT_FIELDS = ['userInput1'] as const;
const TABLE_CALC_FIELDS = ['calInput1'] as const;

type AppStoreState = {
  // Form (flat fields)
  fields: FormFieldsState;
  formLoadStatus: FormLoadStatus;
  formLoadError: string | null;
  // Table (row arrays)
  rows: TableRowsState;
  tableLoadStatus: FormLoadStatus;
  tableLoadError: string | null;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: string } | string | null;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (body && typeof body === 'object' && body.error) {
      return body.error;
    }
    return err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

function isFieldLevelCalc(calc: unknown[]): calc is FieldValueDto[] {
  const first = calc[0];
  return (
    !!first &&
    typeof first === 'object' &&
    'field' in first &&
    'value' in first
  );
}

function isRowLevelCalc(calc: unknown[]): calc is TableRowPayload[] {
  const first = calc[0];
  return (
    !!first &&
    typeof first === 'object' &&
    'id' in first &&
    !('field' in first)
  );
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

function labelFor(fieldId: string, kind: string): string {
  return FIELD_LABELS[fieldId] ?? `${fieldId} (${kind})`;
}

function mapDtoToField(dto: FormFieldDto): FormField {
  const kind = dto.kind as FieldKind;
  const value = dto.value ?? null;
  const isOverridden =
    kind === 'calculated-overridable' ? Boolean(dto.isOverridden) : false;
  return {
    fieldId: dto.field,
    kind,
    value,
    isOverridden,
    lastCalculatedValue:
      kind === 'calculated-overridable' && !isOverridden ? value : null,
    status: 'idle',
    label: labelFor(dto.field, kind),
    errorMessage: null,
  };
}

function mapFormState(response: FormStateResponse): FormFieldsState {
  const fields: FormFieldsState = {};
  for (const dto of response.fields ?? []) {
    if (!dto?.field) {
      continue;
    }
    fields[dto.field] = mapDtoToField(dto);
  }
  return fields;
}

function updateFieldEntry(
  fields: FormFieldsState,
  fieldId: string,
  partial: Partial<FormField>
): FormFieldsState {
  const existing = fields[fieldId];
  if (!existing) {
    return fields;
  }
  return {
    ...fields,
    [fieldId]: { ...existing, ...partial },
  };
}

/** Apply only the edited form field from `response.value`. */
function applyPatchedValue(
  fields: FormFieldsState,
  patched: FieldValueDto | undefined,
  clearedOverrideFieldId: string | null
): FormFieldsState {
  if (!patched?.field || !fields[patched.field]) {
    return fields;
  }

  const patchedId = patched.field;
  const existing = fields[patchedId];
  const isClearingPatched = clearedOverrideFieldId === patchedId;

  return updateFieldEntry(fields, patchedId, {
    value: patched.value,
    status: 'idle',
    errorMessage: null,
    ...(isClearingPatched
      ? {
          isOverridden: false,
          lastCalculatedValue: patched.value,
        }
      : {}),
    ...(existing.kind === 'calculated-overridable' &&
    !existing.isOverridden &&
    !isClearingPatched
      ? { lastCalculatedValue: patched.value }
      : {}),
  });
}

/** Merge field-shaped calc entries into form state. */
function mergeCalcIntoFields(
  fields: FormFieldsState,
  calc: FieldValueDto[],
  clearedOverrideFieldId: string | null
): FormFieldsState {
  let next = { ...fields };

  for (const item of calc) {
    if (!next[item.field]) {
      continue;
    }

    const isClearingThis =
      clearedOverrideFieldId !== null && item.field === clearedOverrideFieldId;
    const field = next[item.field];
    const isOverridden = isClearingThis
      ? false
      : field.kind === 'calculated-overridable'
        ? field.isOverridden
        : false;

    next = updateFieldEntry(next, item.field, {
      value: item.value,
      status: 'idle',
      errorMessage: null,
      isOverridden,
      ...(field.kind === 'calculated-overridable' && !isOverridden
        ? { lastCalculatedValue: item.value }
        : {}),
    });
  }

  return next;
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

function emptyRow(id: number): TableRow {
  return {
    id,
    userInput1: null,
    calInput1: null,
    status: 'idle',
    errorMessage: null,
  };
}

function mapPayloadToRow(payload: TableRowPayload): TableRow {
  return {
    id: payload.id,
    userInput1:
      typeof payload['userInput1'] === 'number' || payload['userInput1'] === null
        ? (payload['userInput1'] as number | null)
        : null,
    calInput1:
      typeof payload['calInput1'] === 'number' || payload['calInput1'] === null
        ? (payload['calInput1'] as number | null)
        : null,
    status: 'idle',
    errorMessage: null,
  };
}

function mapTableState(response: TableStateResponse): TableRowsState {
  const rows: TableRowsState = {};
  for (const payload of response.rows ?? []) {
    if (payload?.id == null) {
      continue;
    }
    rows[payload.id] = mapPayloadToRow(payload);
  }
  return rows;
}

function updateRowEntry(
  rows: TableRowsState,
  rowId: number,
  partial: Partial<TableRow>
): TableRowsState {
  const existing = rows[rowId];
  if (!existing) {
    return rows;
  }
  return {
    ...rows,
    [rowId]: { ...existing, ...partial },
  };
}

/** Apply confirmed user-input columns from table `response.value`. */
function applyValueRows(
  rows: TableRowsState,
  valueRows: TableRowPayload[] | undefined
): TableRowsState {
  if (!valueRows?.length) {
    return rows;
  }

  let next = { ...rows };

  for (const payload of valueRows) {
    if (payload?.id == null) {
      continue;
    }

    const existing = next[payload.id] ?? emptyRow(payload.id);
    const patched: TableRow = {
      ...existing,
      status: 'idle',
      errorMessage: null,
    };

    for (const field of TABLE_USER_INPUT_FIELDS) {
      if (field in payload) {
        patched[field] = payload[field] as number | null;
      }
    }

    next[payload.id] = patched;
  }

  return next;
}

/** Merge row-shaped calc entries into table state (by row id). */
function mergeCalcIntoRows(
  rows: TableRowsState,
  calc: TableRowPayload[]
): TableRowsState {
  let next = { ...rows };

  for (const payload of calc) {
    if (payload?.id == null) {
      continue;
    }

    const existing = next[payload.id] ?? emptyRow(payload.id);
    const patched: TableRow = { ...existing };

    for (const field of TABLE_CALC_FIELDS) {
      if (field in payload) {
        patched[field] = payload[field] as number | null;
      }
    }

    next[payload.id] = patched;
  }

  return next;
}

function rowsToPutPayload(rows: TableRowsState): TableRowPayload[] {
  return Object.values(rows)
    .sort((a, b) => a.id - b.id)
    .map((row) => ({
      id: row.id,
      userInput1: row.userInput1,
    }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Single application store for form fields and table rows.
 * Calculated values from API `calc` arrays are applied via applyCalc()
 * (called by the calc-fields interceptor).
 */
export const AppStore = signalStore(
  { providedIn: 'root' },
  environment.storeWithDevTools('app'),
  withState<AppStoreState>({
    fields: {},
    formLoadStatus: 'idle',
    formLoadError: null,
    rows: {},
    tableLoadStatus: 'idle',
    tableLoadError: null,
  }),
  withComputed(({ fields, formLoadStatus, rows, tableLoadStatus }) => ({
    fieldList: computed(() => Object.values(fields())),
    isFormLoading: computed(() => formLoadStatus() === 'loading'),
    isFormLoaded: computed(() => formLoadStatus() === 'loaded'),
    rowList: computed(() =>
      Object.values(rows()).sort((a, b) => a.id - b.id)
    ),
    isTableLoading: computed(() => tableLoadStatus() === 'loading'),
    isTableLoaded: computed(() => tableLoadStatus() === 'loaded'),
  })),
  withMethods((store, api = inject(ApiService)) => {
    // ----- Form -----

    const loadForm = rxMethod<void>(
      pipe(
        tap(() =>
          updateState(store, '[App] loadForm pending', {
            formLoadStatus: 'loading',
            formLoadError: null,
          })
        ),
        switchMap(() =>
          api.getForm().pipe(
            tapResponse({
              next: (response) => {
                updateState(store, '[App] loadForm success', {
                  fields: mapFormState(response),
                  formLoadStatus: 'loaded',
                  formLoadError: null,
                });
              },
              error: (err: unknown) => {
                updateState(store, '[App] loadForm error', {
                  formLoadStatus: 'error',
                  formLoadError: errorMessage(err, 'Failed to load form'),
                });
              },
            })
          )
        )
      )
    );

    const updateField = rxMethod<{ fieldId: string; value: number | null }>(
      pipe(
        tap(({ fieldId, value }) => {
          const current = store.fields()[fieldId];
          if (!current) {
            return;
          }
          const isOverridable = current.kind === 'calculated-overridable';
          const clearingOverride = isOverridable && value === null;

          if (clearingOverride) {
            // Restore the pre-override calculated value immediately in the UI.
            updateState(store, `[App] clearOverride pending (${fieldId})`, {
              fields: updateFieldEntry(store.fields(), fieldId, {
                value: current.lastCalculatedValue,
                isOverridden: false,
                status: 'pending',
                errorMessage: null,
              }),
            });
            return;
          }

          updateState(store, `[App] updateField pending (${fieldId})`, {
            fields: updateFieldEntry(store.fields(), fieldId, {
              value,
              status: 'pending',
              errorMessage: null,
              isOverridden: isOverridable,
              lastCalculatedValue:
                isOverridable && !current.isOverridden
                  ? current.value
                  : current.lastCalculatedValue,
            }),
          });
        }),
        groupBy(({ fieldId }) => fieldId),
        mergeMap((group$) =>
          group$.pipe(
            debounceTime(400),
            switchMap(({ fieldId, value }) => {
              const clearingOverride = value === null;
              return api.updateField({ field: fieldId, value }).pipe(
                tapResponse({
                  next: (response) => {
                    // Only the edited field is applied here.
                    // Dependent calc values come from the interceptor → applyCalc.
                    updateState(
                      store,
                      `[App] updateField success (${fieldId})`,
                      {
                        fields: applyPatchedValue(
                          store.fields(),
                          response.value,
                          clearingOverride ? fieldId : null
                        ),
                      }
                    );
                  },
                  error: (err: unknown) => {
                    updateState(
                      store,
                      `[App] updateField error (${fieldId})`,
                      {
                        fields: updateFieldEntry(store.fields(), fieldId, {
                          status: 'error',
                          errorMessage: errorMessage(
                            err,
                            'Failed to update field'
                          ),
                        }),
                      }
                    );
                  },
                })
              );
            })
          )
        )
      )
    );

    // ----- Table -----

    const loadTable = rxMethod<void>(
      pipe(
        tap(() =>
          updateState(store, '[App] loadTable pending', {
            tableLoadStatus: 'loading',
            tableLoadError: null,
          })
        ),
        switchMap(() =>
          api.getTable().pipe(
            tapResponse({
              next: (response) => {
                updateState(store, '[App] loadTable success', {
                  rows: mapTableState(response),
                  tableLoadStatus: 'loaded',
                  tableLoadError: null,
                });
              },
              error: (err: unknown) => {
                updateState(store, '[App] loadTable error', {
                  tableLoadStatus: 'error',
                  tableLoadError: errorMessage(err, 'Failed to load table'),
                });
              },
            })
          )
        )
      )
    );

    /**
     * Optimistic cell edit, then debounced PUT of the full value array.
     * Calc columns arrive via the interceptor → applyCalc, not here.
     */
    const updateRowInput = rxMethod<{
      rowId: number;
      value: number | null;
    }>(
      pipe(
        tap(({ rowId, value }) => {
          if (!store.rows()[rowId]) {
            return;
          }
          updateState(store, `[App] updateRowInput pending (${rowId})`, {
            rows: updateRowEntry(store.rows(), rowId, {
              userInput1: value,
              status: 'pending',
              errorMessage: null,
            }),
          });
        }),
        debounceTime(400),
        switchMap(() => {
          const payload = rowsToPutPayload(store.rows());
          return api.updateRows(payload).pipe(
            tapResponse({
              next: (response) => {
                updateState(store, '[App] updateRows success', {
                  rows: applyValueRows(store.rows(), response.value),
                });
              },
              error: (err: unknown) => {
                const message = errorMessage(
                  err,
                  'Failed to update table rows'
                );
                let next = { ...store.rows() };
                for (const row of Object.values(next)) {
                  if (row.status === 'pending') {
                    next = updateRowEntry(next, row.id, {
                      status: 'error',
                      errorMessage: message,
                    });
                  }
                }
                updateState(store, '[App] updateRows error', {
                  rows: next,
                });
              },
            })
          );
        })
      )
    );

    /**
     * Single entry point for the calc-fields interceptor.
     * Detects field-shaped vs row-shaped calc and updates the right slice.
     */
    const applyCalc = (
      calc: unknown[],
      clearedOverrideFieldId: string | null = null
    ): void => {
      if (!calc?.length) {
        return;
      }

      if (isFieldLevelCalc(calc)) {
        updateState(store, '[App] applyCalc (fields)', {
          fields: mergeCalcIntoFields(
            store.fields(),
            calc,
            clearedOverrideFieldId
          ),
        });
        return;
      }

      if (isRowLevelCalc(calc)) {
        updateState(store, '[App] applyCalc (rows)', {
          rows: mergeCalcIntoRows(store.rows(), calc),
        });
      }
    };

    return {
      loadForm,
      updateField,
      loadTable,
      updateRowInput,
      applyCalc,
      /** Clears an override by PATCHing null; backend returns the recalculated value. */
      clearOverride(fieldId: string): void {
        const field = store.fields()[fieldId];
        if (!field || field.kind !== 'calculated-overridable') {
          return;
        }
        updateField({ fieldId, value: null });
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.loadForm();
      store.loadTable();
      effect(() => {
        console.log('[AppStore] state', {
          formLoadStatus: store.formLoadStatus(),
          formLoadError: store.formLoadError(),
          fields: structuredClone(store.fields()),
          tableLoadStatus: store.tableLoadStatus(),
          tableLoadError: store.tableLoadError(),
          rows: structuredClone(store.rows()),
        });
      });
    },
  })
);
