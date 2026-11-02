/**
 * Utility to convert numeric amounts into Indian English Currency Words
 * Format: "INR Seven Lakh Twenty Three Thousand Fifty Four Only"
 */

const UNITS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety'
];

function convertBelowThousand(n: number): string {
  const words: string[] = [];
  if (n >= 100) {
    words.push(UNITS[Math.floor(n / 100)] + ' Hundred');
    n %= 100;
  }
  if (n >= 20) {
    words.push(TENS[Math.floor(n / 10)]);
    if (n % 10 > 0) {
      words.push(UNITS[n % 10]);
    }
  } else if (n > 0) {
    words.push(UNITS[n]);
  }
  return words.join(' ');
}

export function numberToIndianCurrencyWords(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return 'INR Zero Only';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const rupees = Math.floor(absAmount);
  const paise = Math.round((absAmount - rupees) * 100);

  if (rupees === 0 && paise === 0) {
    return 'INR Zero Only';
  }

  let crore = Math.floor(rupees / 10000000);
  let remainder = rupees % 10000000;

  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;

  let thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;

  let hundredPart = remainder;

  const parts: string[] = [];

  if (crore > 0) {
    parts.push(convertBelowThousand(crore) + ' Crore');
  }
  if (lakh > 0) {
    parts.push(convertBelowThousand(lakh) + ' Lakh');
  }
  if (thousand > 0) {
    parts.push(convertBelowThousand(thousand) + ' Thousand');
  }
  if (hundredPart > 0) {
    parts.push(convertBelowThousand(hundredPart));
  }

  let words = parts.join(' ').trim();
  if (!words) {
    words = 'Zero';
  }

  let result = `INR ${words}`;

  if (paise > 0) {
    const paiseWords = convertBelowThousand(paise);
    result += ` and ${paiseWords} Paise`;
  }

  result += ' Only';

  return isNegative ? `Minus ${result}` : result;
}

export function formatIndianCurrency(amount: number): string {
  if (isNaN(amount)) return '0.00';
  const parts = amount.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  // Indian comma formatting: last 3 digits, then every 2 digits
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return formattedInteger + '.' + decimalPart;
}

