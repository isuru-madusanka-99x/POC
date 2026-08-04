import { FormLoadStatus } from './form-field.model';

export type TableRowStatus = 'idle' | 'pending' | 'error';

/**
 * One table row in the UI store.
 * userInput1 is editable; calInput1 is backend-calculated (read-only).
 */
export interface TableRow {
  id: number;
  userInput1: number | null;
  calInput1: number | null;
  status: TableRowStatus;
  errorMessage: string | null;
}

export type TableRowsState = Record<number, TableRow>;

/**
 * Sparse row payload used by the PUT array API.
 * Always includes `id`; other keys are field names → numeric values.
 *
 * Example value entry:  { id: 1, userInput1: 10 }
 * Example calc entry:   { id: 1, calInput1: 20 }
 */
export type TableRowPayload = {
  id: number;
  [field: string]: number | null;
};

/** GET /api/table — initial rows (inputs + calculated columns). */
export interface TableStateResponse {
  rows: TableRowPayload[];
}

/**
 * PUT /api/table/rows response.
 *
 * {
 *   value: [
 *     { id: 1, userInput1: 10 },
 *     { id: 2, userInput1: 20 },
 *     { id: 3, userInput1: 30 }
 *   ],
 *   calc: [
 *     { id: 1, calInput1: 20 },
 *     { id: 2, calInput1: 20 }
 *   ]
 * }
 */
export interface TableRowsUpdateResponse {
  value: TableRowPayload[];
  calc: TableRowPayload[];
}

export type { FormLoadStatus };
