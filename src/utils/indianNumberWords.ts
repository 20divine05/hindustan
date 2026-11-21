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

function convertIndianNumber(n: number): string {
  if (n <= 0) return '';
  if (n < 1000) return convertBelowThousand(n);
  const parts: string[] = [];
  const cr = Math.floor(n / 10000000);
  let rem = n % 10000000;
  const lk = Math.floor(rem / 100000);
  rem = rem % 100000;
  const th = Math.floor(rem / 1000);
  rem = rem % 1000;
  const h = rem;

  if (cr > 0) {
    parts.push(convertIndianNumber(cr) + ' Crore');
  }
  if (lk > 0) {
    parts.push(convertBelowThousand(lk) + ' Lakh');
  }
  if (th > 0) {
    parts.push(convertBelowThousand(th) + ' Thousand');
  }
  if (h > 0) {
    parts.push(convertBelowThousand(h));
  }
  return parts.join(' ').trim();
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

  let words = convertIndianNumber(rupees);
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

