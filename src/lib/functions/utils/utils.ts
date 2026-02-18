export type Dir = 'rtl' | 'ltr' | 'auto' | null | undefined

const BUCKWALTER_MAP: Record<string, string> = {
    "'": '\u0621', '(': '\u0622', '>': '\u0623', '&': '\u0624', '<': '\u0625',
    '}': '\u0626', 'A': '\u0627', 'b': '\u0628', 'p': '\u0629', 't': '\u062A',
    'v': '\u062B', 'j': '\u062C', 'H': '\u062D', 'x': '\u062E', 'd': '\u062F',
    '*': '\u0630', 'r': '\u0631', 'z': '\u0632', 's': '\u0633', '$': '\u0634',
    'S': '\u0635', 'D': '\u0636', 'T': '\u0637', 'Z': '\u0638', 'E': '\u0639',
    'g': '\u063A', '_': '\u0640', 'f': '\u0641', 'q': '\u0642', 'k': '\u0643',
    'l': '\u0644', 'm': '\u0645', 'n': '\u0646', 'h': '\u0647', 'w': '\u0648',
    'Y': '\u0649', 'y': '\u064A', 'F': '\u064B', 'N': '\u064C', 'K': '\u064D',
    'a': '\u064E', 'u': '\u064F', 'i': '\u0650', '~': '\u0651', 'o': '\u0652',
    '^': '\u0653', '#': '\u0654', '`': '\u0670', '{': '\u0671', ':': '\u06DC',
    '@': '\u06DF', '"': '\u06E0', '[': '\u06E2', ';': '\u06E3', ',': '\u06E5',
    '.': '\u06E6', '!': '\u06E8', '-': '\u06EA', '+': '\u06EB', '%': '\u06EC',
    ']': '\u06ED', '=': '\u060C', '/': '\u061F', 'B': '\u061B', 'c': '\u060D',
    'L': '\uFEFB', 'G': '\uFDF2',
};

export function buckwalterToArabic(buckwalter: string): string {
    return [...buckwalter].map(ch => BUCKWALTER_MAP[ch] ?? ch).join('');
}
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