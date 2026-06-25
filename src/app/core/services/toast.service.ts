import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly messageService = inject(MessageService);

  success(summary: string, detail?: string): void {
    this.messageService.add({
      severity: 'success',
      summary,
      detail,
      icon: 'pi pi-check',
      life: 3000,
    });
  }

  error(summary: string, detail?: string): void {
    this.messageService.add({
      severity: 'error',
      summary,
      detail,
      icon: 'pi pi-times',
      life: 4000,
    });
  }

  warn(summary: string, detail?: string): void {
    this.messageService.add({
      severity: 'warn',
      summary,
      detail,
      icon: 'pi pi-exclamation-triangle',
      life: 3500,
    });
  }

  info(summary: string, detail?: string): void {
    this.messageService.add({
      severity: 'info',
      summary,
      detail,
      icon: 'pi pi-info',
      life: 3000,
    });
  }

  created(entity = 'Item'): void {
    this.success(`${entity} created successfully.`, 'The new record has been saved.');
  }

  updated(entity = 'Item'): void {
    this.success(`${entity} updated successfully.`, 'Your changes have been saved.');
  }

  deleted(entity = 'Item'): void {
    this.success(`${entity} deleted successfully.`, 'The record has been removed.');
  }

  failed(action = 'Action', detail?: string): void {
    this.error(`${action} failed.`, detail);
  }
}
