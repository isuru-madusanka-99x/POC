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

Open http://localhost:4200/.

Ensure the .NET API is running and reachable at the URL in `src/environments/environment.development.ts`.

### Redux DevTools (Chrome)

1. Install the [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd) Chrome extension.
2. Open the app, then open Chrome DevTools → **Redux** / **NgRx Signal Store** tab (select that instance to activate it).
3. Inspect the `app` store. Named actions come from `updateState()` (e.g. `[App] updateField success (userInput1)`).

DevTools is enabled in development via `@angular-architects/ngrx-toolkit` `withDevtools`; production builds use `withDevToolsStub`.

## Where things live

| Piece | Path |
|-------|------|
| Signal store (form + table) | `src/app/store/app.store.ts` |
| Field model / API contract | `src/app/models/form-field.model.ts` |
| Table row model / API contract | `src/app/models/table-row.model.ts` |
| HTTP API client | `src/app/services/api.service.ts` |
| Calc interceptor | `src/app/interceptors/calc-fields.interceptor.ts` |
| Form UI | `src/app/components/calculated-form/` |
| Table UI | `src/app/components/calculated-table/` |
| Environments | `src/environments/environment*.ts` |

## Initialization

On store init, the app calls **`GET /api/form`** and populates every field (`value`, `kind`, `isOverridden`) from the response. There are no hardcoded field values in the frontend.

## Debounced update flow

1. User edits a **normal** or **calculated-overridable** field.
2. `AppStore.updateField({ fieldId, value })` runs (NgRx Signals `rxMethod`).
3. **Optimistic update**: local `value` and `status: 'pending'` (and `isOverridden` for overridable fields).
4. Per-`fieldId` **debounce (400ms)** via `groupBy` → `debounceTime` → **`switchMap`** (cancels in-flight PATCH for that same field).
5. `PATCH {apiBaseUrl}/api/form/fields` with `{ field, value }`.
6. On success: the store applies response `value`; `calcFieldsInterceptor` applies `calc` via `AppStore.applyCalc`.
7. On error: that field gets `status: 'error'` and an inline message; the form stays usable.

## API contract

```http
GET /api/form
```

```json
{
  "fields": [
    { "field": "userInput1", "kind": "normal", "value": 0 },
    { "field": "userInput2", "kind": "normal", "value": 0 },
    { "field": "calInput1", "kind": "calculated", "value": 0 },
    { "field": "calInput2", "kind": "calculated-overridable", "value": 5, "isOverridden": false }
  ]
}
```

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

## Backend URL

Set `apiBaseUrl` (no trailing slash) in:

- `src/environments/environment.development.ts` — used by `ng serve`
- `src/environments/environment.ts` — used by production builds

Current default: `https://localhost:7161`

## Stack

- Angular 19 (standalone components)
- `@ngrx/signals` (`signalStore`, `withState`, `withMethods`, `rxMethod`)
- `@angular-architects/ngrx-toolkit` (`withDevtools`, `updateState`) for Chrome Redux DevTools
- Angular `HttpClient` calling the real form API
