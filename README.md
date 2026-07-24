# Calculated Fields POC

Angular proof-of-concept for **backend-driven calculated form fields**, migrating behavior from a legacy Delphi desktop form.

No calculation formulas run in the browser. The UI only displays values returned by the API.

## Field types

| Kind | Behavior |
|------|----------|
| **normal** | Editable. Changes are PATCHed to the backend. |
| **calculated** | Read-only. Value is set only from the API `calc` array. |
| **calculated-overridable** | Starts with a backend-calculated value. The user may type an override. Clearing the input (or **Clear override**) sends `value: null`; the backend returns the recalculated value and `isOverridden` becomes `false`. |

## Run

```bash
npm install
npm start
```

Open http://localhost:4200/. Use the browser console to watch `[FormStore] state` logs on every transition.

## Where things live

| Piece | Path |
|-------|------|
| Signal store | `src/app/store/form.store.ts` |
| Field model / API contract | `src/app/models/form-field.model.ts` |
| HTTP API client | `src/app/services/form-api.service.ts` |
| Mock backend interceptor | `src/app/interceptors/mock-form-api.interceptor.ts` |
| Form UI | `src/app/components/calculated-form/` |
| Environments | `src/environments/environment*.ts` |

## Debounced update flow

1. User edits a **normal** or **calculated-overridable** field.
2. `FormStore.updateField({ fieldId, value })` runs (NgRx Signals `rxMethod`).
3. **Optimistic update**: local `value` and `status: 'pending'` (and `isOverridden` for overridable fields).
4. Per-`fieldId` **debounce (400ms)** via `groupBy` → `debounceTime` → **`switchMap`** (cancels in-flight PATCH for that same field).
5. `PATCH {apiBaseUrl}/api/form/fields` with `{ field, value }`.
6. On success: apply response `value` and every entry in `calc` into the store (`status: 'idle'`). Dependent calculated fields update without the user touching them.
7. On error: that field gets `status: 'error'` and an inline message; the form stays usable.

## API contract

```http
PATCH /api/form/fields
Content-Type: application/json

{ "field": "userInput1", "value": 10 }
```

```json
{
  "value": { "field": "userInput1", "value": 10 },
  "calc": [
    { "field": "calInput1", "value": 20 },
    { "field": "calInput2", "value": 30 }
  ]
}
```

Send `"value": null` to clear an override on a calculated-overridable field.

## Pointing at a real .NET backend

1. Set `apiBaseUrl` to your API origin (no trailing slash), e.g. `https://localhost:5001`.
2. Set `useMockApi: false` so the mock interceptor is not registered.

**Development** (`ng serve` / `environment.development.ts`):

```ts
export const environment = {
  production: false,
  apiBaseUrl: 'https://localhost:5001',
  useMockApi: false,
};
```

**Production** (`environment.ts`): same shape — update `apiBaseUrl` and keep `useMockApi: false`.

No other frontend changes are required when the backend matches the contract above.

### Mock formulas (dev interceptor only)

Used only while `useMockApi: true`:

- `calInput1 = userInput1 * 2`
- `calInput2 = userInput2 * 3` (unless overridden)

## Stack

- Angular 19 (standalone components)
- `@ngrx/signals` (`signalStore`, `withState`, `withMethods`, `rxMethod`)
- Angular `HttpClient` + functional interceptor for the mock API
