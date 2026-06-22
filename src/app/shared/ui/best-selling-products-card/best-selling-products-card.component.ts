import { Component } from '@angular/core';

interface BestSellingProduct {
  rank: number;
  name: string;
  trend: string;
  trendType: 'up' | 'down';
  sold: string;
  progress: number;
}

@Component({
  selector: 'app-best-selling-products-card',
  standalone: true,
  templateUrl: './best-selling-products-card.component.html',
  styleUrl: './best-selling-products-card.component.css',
})
export class BestSellingProductsCardComponent {
  readonly products: BestSellingProduct[] = [
    {
      rank: 1,
      name: 'Eco Cleaning Kit Bundle',
      trend: '24%',
      trendType: 'up',
      sold: '1,203 sold',
      progress: 96,
    },
    {
      rank: 2,
      name: 'Bamboo Cutting Board ...',
      trend: '18%',
      trendType: 'up',
      sold: '876 sold',
      progress: 72,
    },
    {
      rank: 3,
      name: 'Linen Tea Towel Set',
      trend: '12%',
      trendType: 'up',
      sold: '892 sold',
      progress: 74,
    },
    {
      rank: 4,
      name: "Stainless Chef's Knife",
      trend: '8%',
      trendType: 'up',
      sold: '703 sold',
      progress: 58,
    },
    {
      rank: 5,
      name: 'Nordic Ceramic Bowl Set',
      trend: '4%',
      trendType: 'down',
      sold: '567 sold',
      progress: 46,
    },
  ];
}
