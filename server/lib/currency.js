export const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', symbol: '$', usdRate: 1, name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: 'EUR', usdRate: 1.08, name: 'Euro' },
  GBP: { code: 'GBP', symbol: 'GBP', usdRate: 1.27, name: 'British Pound' },
  INR: { code: 'INR', symbol: 'INR', usdRate: 0.012, name: 'Indian Rupee' },
  CAD: { code: 'CAD', symbol: 'CAD', usdRate: 0.73, name: 'Canadian Dollar' },
  AUD: { code: 'AUD', symbol: 'AUD', usdRate: 0.65, name: 'Australian Dollar' },
  AED: { code: 'AED', symbol: 'AED', usdRate: 0.27, name: 'UAE Dirham' },
  SGD: { code: 'SGD', symbol: 'SGD', usdRate: 0.74, name: 'Singapore Dollar' },
};

export function normalizeCurrencyCode(code) {
  const normalized = String(code ?? 'USD').trim().toUpperCase();
  return SUPPORTED_CURRENCIES[normalized] ? normalized : 'USD';
}

export function convertToUsd(amount, currencyCode) {
  const normalizedCode = normalizeCurrencyCode(currencyCode);
  const usdRate = SUPPORTED_CURRENCIES[normalizedCode].usdRate;
  return Number((Number(amount || 0) * usdRate).toFixed(2));
}

export function normalizeMoneyInput(originalAmount, currencyCode) {
  const normalizedCode = normalizeCurrencyCode(currencyCode);
  const parsedOriginalAmount = Number(originalAmount);

  if (!Number.isFinite(parsedOriginalAmount) || parsedOriginalAmount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  return {
    currencyCode: normalizedCode,
    originalAmount: Number(parsedOriginalAmount.toFixed(2)),
    amountUsd: convertToUsd(parsedOriginalAmount, normalizedCode),
  };
}
