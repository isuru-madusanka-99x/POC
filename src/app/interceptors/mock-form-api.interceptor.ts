import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, delay } from 'rxjs';
import {
  FieldUpdateRequest,
  FieldUpdateResponse,
  FieldValueDto,
} from '../models/form-field.model';

/**
 * In-memory stand-in for the .NET form API.
 * Calculation logic lives ONLY here (simulating the server) — never in Angular.
 *
 * Demo formulas:
 *   calInput1 = userInput1 * 2
 *   calInput2 = userInput2 * 3  (unless overridden)
 */
const serverState: Record<string, number | null> = {
  userInput1: 10,
  userInput2: 5,
  calInput1: 20,
  calInput2: 15,
};

let calInput2Overridden = false;

function buildCalcPayload(): FieldValueDto[] {
  return [
    { field: 'calInput1', value: serverState['calInput1'] },
    { field: 'calInput2', value: serverState['calInput2'] },
  ];
}

export const mockFormApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'PATCH' || !req.url.includes('/api/form/fields')) {
    return next(req);
  }

  const body = req.body as FieldUpdateRequest;
  const { field, value } = body;

  switch (field) {
    case 'userInput1':
      serverState['userInput1'] = value;
      serverState['calInput1'] = (value ?? 0) * 2;
      break;
    case 'userInput2':
      serverState['userInput2'] = value;
      if (!calInput2Overridden) {
        serverState['calInput2'] = (value ?? 0) * 3;
      }
      // calInput1 does not depend on userInput2; leave it unchanged.
      break;
    case 'calInput2':
      if (value === null) {
        calInput2Overridden = false;
        serverState['calInput2'] = (serverState['userInput2'] ?? 0) * 3;
      } else {
        calInput2Overridden = true;
        serverState['calInput2'] = value;
      }
      break;
    default:
      break;
  }

  const response: FieldUpdateResponse = {
    value: { field, value: serverState[field] ?? value },
    calc: buildCalcPayload(),
  };

  // Latency so per-field pending indicators are visible in the demo.
  return of(new HttpResponse({ status: 200, body: response })).pipe(delay(250));
};
