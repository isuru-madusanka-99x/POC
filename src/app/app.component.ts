import { Component } from '@angular/core';
import { CalculatedFormComponent } from './components/calculated-form/calculated-form.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CalculatedFormComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
