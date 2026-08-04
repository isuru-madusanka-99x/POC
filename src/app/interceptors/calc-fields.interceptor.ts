import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { tap } from 'rxjs';
import { FieldValueDto } from '../models/form-field.model';
import { FormStore } from '../store/form.store';

/**
 * Shape we look for on any HTTP response body.
 * Example:
 * {
 *   value: { field: 'userInput1', value: 10 },
 *   calc: [
 *     { field: 'calInput1', value: 20 },
 *     { field: 'calInput2', value: 30 }
 *   ]
 * }
 */
type ResponseWithCalc = {
  calc: FieldValueDto[];
};

type FieldPatchBody = {
  field?: string;
  value?: number | null;
};

function isResponseWithCalc(body: unknown): body is ResponseWithCalc {
  return (
    !!body &&
    typeof body === 'object' &&
    Array.isArray((body as ResponseWithCalc).calc)
  );
}

/**
 * Reads a PATCH body to see if the user is clearing an override (sending null).
 * That field must accept the next calculated value from `calc`.
 */
function clearedOverrideFieldIdFrom(
  method: string,
  body: unknown
): string | null {
  if (method !== 'PATCH' || !body || typeof body !== 'object') {
    return null;
  }

  const patch = body as FieldPatchBody;
  if (patch.value === null && typeof patch.field === 'string') {
    return patch.field;
  }

  return null;
}

/**
 * Application-wide middleware for calculated fields.
 *
 * Whenever any API response includes a `calc` array, this interceptor
 * writes those values into the form store. Individual store methods
 * (e.g. updateField) do not need to apply calc results themselves.
 */
export const calcFieldsInterceptor: HttpInterceptorFn = (req, next) => {
  // Resolve the store lazily so we avoid a circular DI chain:
  // FormStore → FormApiService → HttpClient → this interceptor → FormStore
  const injector = inject(Injector);

  return next(req).pipe(
    tap((event) => {
      if (!(event instanceof HttpResponse) || !isResponseWithCalc(event.body)) {
        return;
      }

      const { calc } = event.body;
      if (calc.length === 0) {
        return;
      }

      const clearedOverrideFieldId = clearedOverrideFieldIdFrom(
        req.method,
        req.body
      );

      injector
        .get(FormStore)
        .applyCalcFields(calc, clearedOverrideFieldId);
    })
  );
};
