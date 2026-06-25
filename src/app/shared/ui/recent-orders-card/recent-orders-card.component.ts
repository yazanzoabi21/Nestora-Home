import { Component } from '@angular/core';

interface RecentOrder {
  id: string;
  customer: string;
  email: string;
  date: string;
  total: string;
  payment: string;
  paymentClass: string;
  delivery: string;
  deliveryClass: string;
}

@Component({
  selector: 'app-recent-orders-card',
  standalone: true,
  templateUrl: './recent-orders-card.component.html',
  styleUrl: './recent-orders-card.component.css',
})
export class RecentOrdersCardComponent {
  readonly orders: RecentOrder[] = [
    {
      id: 'ORD-8821',
      customer: 'Sophie Barrett',
      email: 'sophie@example.com',
      date: '22 Apr 2026',
      total: '$248.97',
      payment: 'Paid',
      paymentClass: 'bg-[#e7f6ee] text-[#0f7b49]',
      delivery: 'Delivered',
      deliveryClass: 'bg-[#e7f6ee] text-[#0f7b49]',
    },
    {
      id: 'ORD-8820',
      customer: 'Marcus Hunt',
      email: 'marcus@example.com',
      date: '22 Apr 2026',
      total: '$89.99',
      payment: 'Paid',
      paymentClass: 'bg-[#e7f6ee] text-[#0f7b49]',
      delivery: 'Shipped',
      deliveryClass: 'bg-[#eaf2ff] text-[#1e5aa8]',
    },
    {
      id: 'ORD-8819',
      customer: 'Clara Morel',
      email: 'clara@example.com',
      date: '21 Apr 2026',
      total: '$387.45',
      payment: 'Paid',
      paymentClass: 'bg-[#e7f6ee] text-[#0f7b49]',
      delivery: 'Processing',
      deliveryClass: 'bg-[#fff4df] text-[#b97712]',
    },
    {
      id: 'ORD-8818',
      customer: 'James Thornton',
      email: 'james@example.com',
      date: '21 Apr 2026',
      total: '$124.98',
      payment: 'Pending',
      paymentClass: 'bg-[#fff4df] text-[#b97712]',
      delivery: 'Processing',
      deliveryClass: 'bg-[#fff4df] text-[#b97712]',
    },
    {
      id: 'ORD-8817',
      customer: 'Anya Patel',
      email: 'anya@example.com',
      date: '20 Apr 2026',
      total: '$312.96',
      payment: 'Paid',
      paymentClass: 'bg-[#e7f6ee] text-[#0f7b49]',
      delivery: 'Delivered',
      deliveryClass: 'bg-[#e7f6ee] text-[#0f7b49]',
    },
    {
      id: 'ORD-8816',
      customer: 'Luca Rossi',
      email: 'luca@example.com',
      date: '20 Apr 2026',
      total: '$149.99',
      payment: 'Refunded',
      paymentClass: 'bg-[#edf4ff] text-[#1e5aa8]',
      delivery: 'Returned',
      deliveryClass: 'bg-[#f3e8ff] text-[#7b3fb2]',
    },
  ];
}
