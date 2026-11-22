import { hasPracticalPhoneFormat } from '../../../shared/validators/phone.validator';

export function normalizeCheckoutPhone(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit <= '\u0669' ? 0x660 : 0x6f0)),
  );
}

export function checkoutPhoneError(value: string | null | undefined): 'required' | 'phone' | null {
  const phone = normalizeCheckoutPhone(value);
  if (!phone) return 'required';

  const format = phone.replace(/^\((\d+)\)/, '$1');
  if (!hasPracticalPhoneFormat(format) || /[()]/.test(format.replace(/\(\d+\)/g, '')) || !/[\d)]$/.test(phone)) {
    return 'phone';
  }

  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+') || digits.startsWith('00')) {
    const international = phone.startsWith('+') ? digits : digits.slice(2);
    return /^[1-9]\d{6,14}$/.test(international) ? null : 'phone';
  }
  return /^\d{7,15}$/.test(digits) ? null : 'phone';
}
