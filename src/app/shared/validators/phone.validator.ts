export function hasPracticalPhoneFormat(value: string): boolean {
  return /^[+\d][\d\s().-]{5,29}$/.test(value.trim());
}
