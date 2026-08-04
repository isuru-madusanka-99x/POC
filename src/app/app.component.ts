import { Component } from '@angular/core';
import { CalculatedFormComponent } from './components/calculated-form/calculated-form.component';
import { CalculatedTableComponent } from './components/calculated-table/calculated-table.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CalculatedFormComponent, CalculatedTableComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
