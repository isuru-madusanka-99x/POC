import { Component, inject } from '@angular/core';
import { FormStore } from '../../store/form.store';
import { FormField } from '../../models/form-field.model';

@Component({
  selector: 'app-calculated-form',
  standalone: true,
  templateUrl: './calculated-form.component.html',
  styleUrl: './calculated-form.component.css',
})
export class CalculatedFormComponent {
  readonly store = inject(FormStore);

  onFieldInput(field: FormField, event: Event): void {
    if (field.kind === 'calculated') {
      return;
    }

    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') {
      // Empty input on overridable → clear override (null). Normal fields may also send null.
      this.store.updateField({ fieldId: field.fieldId, value: null });
      return;
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }

    this.store.updateField({ fieldId: field.fieldId, value: parsed });
  }

  clearOverride(field: FormField): void {
    this.store.clearOverride(field.fieldId);
  }

  displayValue(field: FormField): string {
    return field.value === null || field.value === undefined
      ? ''
      : String(field.value);
  }

  isReadonly(field: FormField): boolean {
    return field.kind === 'calculated';
  }
}
