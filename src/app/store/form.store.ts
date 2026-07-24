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
  FieldUpdateResponse,
  FormField,
  FormFieldDto,
  FormFieldsState,
  FormLoadStatus,
  FormStateResponse,
} from '../models/form-field.model';
import { FormApiService } from '../services/form-api.service';

const FIELD_LABELS: Record<string, string> = {
  userInput1: 'User Input 1 (normal)',
  userInput2: 'User Input 2 (normal)',
  calInput1: 'Calc Input 1 (calculated, read-only)',
  calInput2: 'Calc Input 2 (calculated, overridable)',
};

type FormStoreState = {
  fields: FormFieldsState;
  loadStatus: FormLoadStatus;
  loadError: string | null;
};

function labelFor(fieldId: string, kind: string): string {
  return FIELD_LABELS[fieldId] ?? `${fieldId} (${kind})`;
}

function mapDtoToField(dto: FormFieldDto): FormField {
  const kind = dto.kind as FieldKind;
  return {
    fieldId: dto.field,
    kind,
    value: dto.value ?? null,
    isOverridden:
      kind === 'calculated-overridable' ? Boolean(dto.isOverridden) : false,
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

function applyCalcUpdates(
  fields: FormFieldsState,
  response: FieldUpdateResponse,
  clearedOverrideFieldId: string | null
): FormFieldsState {
  let next = { ...fields };

  if (response.value?.field && next[response.value.field]) {
    const patchedId = response.value.field;
    next = updateFieldEntry(next, patchedId, {
      value: response.value.value,
      status: 'idle',
      errorMessage: null,
      ...(clearedOverrideFieldId === patchedId
        ? { isOverridden: false }
        : {}),
    });
  }

  for (const item of response.calc ?? []) {
    if (!next[item.field]) {
      continue;
    }
    const isClearingThis =
      clearedOverrideFieldId !== null && item.field === clearedOverrideFieldId;
    const field = next[item.field];
    next = updateFieldEntry(next, item.field, {
      value: item.value,
      status: 'idle',
      errorMessage: null,
      isOverridden: isClearingThis
        ? false
        : field.kind === 'calculated-overridable'
          ? field.isOverridden
          : false,
    });
  }

  return next;
}

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

export const FormStore = signalStore(
  { providedIn: 'root' },
  environment.storeWithDevTools('form'),
  withState<FormStoreState>({
    fields: {},
    loadStatus: 'idle',
    loadError: null,
  }),
  withComputed(({ fields, loadStatus }) => ({
    fieldList: computed(() => Object.values(fields())),
    isLoading: computed(() => loadStatus() === 'loading'),
    isLoaded: computed(() => loadStatus() === 'loaded'),
  })),
  withMethods((store, api = inject(FormApiService)) => {
    const loadForm = rxMethod<void>(
      pipe(
        tap(() =>
          updateState(store, '[Form] loadForm pending', {
            loadStatus: 'loading',
            loadError: null,
          })
        ),
        switchMap(() =>
          api.getForm().pipe(
            tapResponse({
              next: (response) => {
                updateState(store, '[Form] loadForm success', {
                  fields: mapFormState(response),
                  loadStatus: 'loaded',
                  loadError: null,
                });
              },
              error: (err: unknown) => {
                updateState(store, '[Form] loadForm error', {
                  loadStatus: 'error',
                  loadError: errorMessage(err, 'Failed to load form'),
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
          updateState(store, `[Form] updateField pending (${fieldId})`, {
            fields: updateFieldEntry(store.fields(), fieldId, {
              value,
              status: 'pending',
              errorMessage: null,
              isOverridden: isOverridable ? value !== null : false,
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
                    updateState(
                      store,
                      `[Form] updateField success (${fieldId})`,
                      {
                        fields: applyCalcUpdates(
                          store.fields(),
                          response,
                          clearingOverride ? fieldId : null
                        ),
                      }
                    );
                  },
                  error: (err: unknown) => {
                    updateState(
                      store,
                      `[Form] updateField error (${fieldId})`,
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

    return {
      loadForm,
      updateField,
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
      effect(() => {
        const snapshot = {
          loadStatus: store.loadStatus(),
          loadError: store.loadError(),
          fields: structuredClone(store.fields()),
        };
        console.log('[FormStore] state', snapshot);
      });
    },
  })
);
