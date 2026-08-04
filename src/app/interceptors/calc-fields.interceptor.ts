import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { tap } from 'rxjs';
import { AppStore } from '../store/app.store';

/**
 * Two calc shapes are supported on any response body:
 *
 * Field-level (form PATCH):
 * {
 *   value: { field: 'userInput1', value: 10 },
 *   calc: [
 *     { field: 'calInput1', value: 20 },
 *     { field: 'calInput2', value: 30 }
 *   ]
 * }
 *
 * Row-level (table PUT array):
 * {
 *   value: [
 *     { id: 1, userInput1: 10 },
 *     { id: 2, userInput1: 20 }
 *   ],
 *   calc: [
 *     { id: 1, calInput1: 20 },
 *     { id: 2, calInput1: 20 }
 *   ]
 * }
 */
type ResponseWithCalc = {
  calc: unknown[];
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
 * That field must accept the next calculated value from field-level `calc`.
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
 * hands it to AppStore.applyCalc — the store decides field vs row shape.
 */
export const calcFieldsInterceptor: HttpInterceptorFn = (req, next) => {
  // Resolve the store lazily so we avoid a circular DI chain:
  // AppStore → ApiService → HttpClient → this interceptor → AppStore
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

      injector.get(AppStore).applyCalc(calc, clearedOverrideFieldId);
    })
  );
};
