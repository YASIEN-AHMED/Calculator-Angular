import { Component, inject } from '@angular/core';
import { ThemeService } from './core/theme.service';
import { Calculator } from './features/calculator/calculator';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Calculator],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Eagerly instantiated so the saved theme applies on startup. */
  protected readonly themes = inject(ThemeService);
}
