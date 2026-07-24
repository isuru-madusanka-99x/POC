import { computed, effect, inject } from '@angular/core';
import {
  patchState,
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
import {
  FieldUpdateResponse,
  FormField,
  FormFieldsState,
} from '../models/form-field.model';
import { FormApiService } from '../services/form-api.service';

const initialFields: FormFieldsState = {
  userInput1: {
    fieldId: 'userInput1',
    kind: 'normal',
    value: 10,
    isOverridden: false,
    status: 'idle',
    label: 'User Input 1 (normal)',
    errorMessage: null,
  },
  userInput2: {
    fieldId: 'userInput2',
    kind: 'normal',
    value: 5,
    isOverridden: false,
    status: 'idle',
    label: 'User Input 2 (normal)',
    errorMessage: null,
  },
  calInput1: {
    fieldId: 'calInput1',
    kind: 'calculated',
    value: 20,
    isOverridden: false,
    status: 'idle',
    label: 'Calc Input 1 (calculated, read-only)',
    errorMessage: null,
  },
  calInput2: {
    fieldId: 'calInput2',
    kind: 'calculated-overridable',
    value: 15,
    isOverridden: false,
    status: 'idle',
    label: 'Calc Input 2 (calculated, overridable)',
    errorMessage: null,
  },
};

type FormStoreState = {
  fields: FormFieldsState;
};

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
    next = updateFieldEntry(next, response.value.field, {
      value: response.value.value,
      status: 'idle',
      errorMessage: null,
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

export const FormStore = signalStore(
  { providedIn: 'root' },
  withState<FormStoreState>({ fields: initialFields }),
  withComputed(({ fields }) => ({
    fieldList: computed(() => Object.values(fields())),
  })),
  withMethods((store, api = inject(FormApiService)) => {
    const updateField = rxMethod<{ fieldId: string; value: number | null }>(
      pipe(
        tap(({ fieldId, value }) => {
          const current = store.fields()[fieldId];
          if (!current) {
            return;
          }
          const isOverridable = current.kind === 'calculated-overridable';
          patchState(store, {
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
                    patchState(store, {
                      fields: applyCalcUpdates(
                        store.fields(),
                        response,
                        clearingOverride ? fieldId : null
                      ),
                    });
                  },
                  error: (err: unknown) => {
                    const message =
                      err instanceof Error
                        ? err.message
                        : 'Failed to update field';
                    patchState(store, {
                      fields: updateFieldEntry(store.fields(), fieldId, {
                        status: 'error',
                        errorMessage: message,
                      }),
                    });
                  },
                })
              );
            })
          )
        )
      )
    );

    return {
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
      effect(() => {
        const snapshot = structuredClone(store.fields());
        console.log('[FormStore] state', snapshot);
      });
    },
  })
);
