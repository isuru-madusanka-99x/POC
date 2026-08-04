import { Component, inject } from '@angular/core';
import { AppStore } from '../../store/app.store';
import { TableRow } from '../../models/table-row.model';

@Component({
  selector: 'app-calculated-table',
  standalone: true,
  templateUrl: './calculated-table.component.html',
  styleUrl: './calculated-table.component.css',
})
export class CalculatedTableComponent {
  readonly store = inject(AppStore);

  onUserInput(row: TableRow, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') {
      this.store.updateRowInput({ rowId: row.id, value: null });
      return;
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }

    this.store.updateRowInput({ rowId: row.id, value: parsed });
  }

  displayValue(value: number | null): string {
    return value === null || value === undefined ? '' : String(value);
  }
}
