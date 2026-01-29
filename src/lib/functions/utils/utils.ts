export const API_LOCAL = 'http://127.0.0.1:8081'
export type Dir = 'rtl' | 'ltr' | 'auto' | null | undefined
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export function convertToArabicNumbers(englishNumber: number) {
    // Convert the input to a string
    const numberStr = englishNumber.toString();

    // Map of English numbers to Arabic numbers
    const arabicNumbers: Record<Digit, string> = {
        '0': '٠',
        '1': '١',
        '2': '٢',
        '3': '٣',
        '4': '٤',
        '5': '٥',
        '6': '٦',
        '7': '٧',
        '8': '٨',
        '9': '٩'
    };

    // Replace each English digit with its Arabic equivalent
    const arabicNumber = numberStr.replace(/[0-9]/g, (digit: string) => arabicNumbers[digit as Digit]);
    return arabicNumber;
}