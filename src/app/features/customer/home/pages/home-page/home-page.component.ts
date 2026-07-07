import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface HomeStat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent {
  readonly stats: HomeStat[] = [
    { value: '10K+', label: 'Happy Customers' },
    { value: '200+', label: 'Products' },
    { value: '4.9★', label: 'Average Rating' },
  ];
}
