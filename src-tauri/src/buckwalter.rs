/// Converts Buckwalter transliteration to Arabic Unicode
/// Based on the reverse mapping of buckwalter_encoding.jl
pub fn buckwalter_to_arabic(buckwalter: &str) -> String {
    let mut result = String::with_capacity(buckwalter.len() * 2);
    for ch in buckwalter.chars() {
        let arabic = match ch {
            '\'' => '\u{0621}', // hamza ء
            '(' => '\u{0622}',  // alef with madda آ
            '>' => '\u{0623}',  // alef with hamza above أ
            '&' => '\u{0624}',  // waw with hamza ؤ
            '<' => '\u{0625}',  // alef with hamza below إ
            '}' => '\u{0626}',  // yeh with hamza ئ
            'A' => '\u{0627}',  // alef ا
            'b' => '\u{0628}',  // beh ب
            'p' => '\u{0629}',  // teh marbuta ة
            't' => '\u{062A}',  // teh ت
            'v' => '\u{062B}',  // theh ث
            'j' => '\u{062C}',  // jeem ج
            'H' => '\u{062D}',  // hah ح
            'x' => '\u{062E}',  // khah خ
            'd' => '\u{062F}',  // dal د
            '*' => '\u{0630}',  // thal ذ
            'r' => '\u{0631}',  // reh ر
            'z' => '\u{0632}',  // zain ز
            's' => '\u{0633}',  // seen س
            '$' => '\u{0634}',  // sheen ش
            'S' => '\u{0635}',  // sad ص
            'D' => '\u{0636}',  // dad ض
            'T' => '\u{0637}',  // tah ط
            'Z' => '\u{0638}',  // zah ظ
            'E' => '\u{0639}',  // ain ع
            'g' => '\u{063A}',  // ghain غ
            '_' => '\u{0640}',  // tatweel ـ
            'f' => '\u{0641}',  // feh ف
            'q' => '\u{0642}',  // qaf ق
            'k' => '\u{0643}',  // kaf ك
            'l' => '\u{0644}',  // lam ل
            'm' => '\u{0645}',  // meem م
            'n' => '\u{0646}',  // noon ن
            'h' => '\u{0647}',  // heh ه
            'w' => '\u{0648}',  // waw و
            'Y' => '\u{0649}',  // alef maksura ى
            'y' => '\u{064A}',  // yeh ي
            'F' => '\u{064B}',  // fathatan ً
            'N' => '\u{064C}',  // dammatan ٌ
            'K' => '\u{064D}',  // kasratan ٍ
            'a' => '\u{064E}',  // fatha َ
            'u' => '\u{064F}',  // damma ُ
            'i' => '\u{0650}',  // kasra ِ
            '~' => '\u{0651}',  // shadda ّ
            'o' => '\u{0652}',  // sukun ْ
            '^' => '\u{0653}',  // maddah ٓ
            '#' => '\u{0654}',  // hamza above ٔ
            '`' => '\u{0670}',  // superscript alef ٰ
            '{' => '\u{0671}',  // alef wasla ٱ
            ':' => '\u{06DC}',  // small high seen ۜ
            '@' => '\u{06DF}',  // small high rounded zero ۟
            '"' => '\u{06E0}',  // small high upright rectangular zero ۠
            '[' => '\u{06E2}',  // small high meem ۢ
            ';' => '\u{06E3}',  // small low seen ۣ
            ',' => '\u{06E5}',  // small waw ۥ
            '.' => '\u{06E6}',  // small yeh ۦ
            '!' => '\u{06E8}',  // small high noon ۨ
            '-' => '\u{06EA}',  // empty centre low stop ۪
            '+' => '\u{06EB}',  // empty centre high stop ۫
            '%' => '\u{06EC}',  // rounded high stop with filled centre ۬
            ']' => '\u{06ED}',  // small low meem ۭ
            '=' => '\u{060C}',  // Arabic comma ،
            '/' => '\u{061F}',  // Arabic question mark ؟
            'B' => '\u{061B}',  // Arabic semicolon ؛
            'c' => '\u{060D}',  // Arabic date separator ؍
            'L' => '\u{FEFB}',  // Lam-Alef ligature ﻻ
            'G' => '\u{FDF2}',  // Allah ligature ﷲ
            // Arabic-Indic digits
            '0' => '\u{0660}',  // ٠
            '1' => '\u{0661}',  // ١
            '2' => '\u{0662}',  // ٢
            '3' => '\u{0663}',  // ٣
            '4' => '\u{0664}',  // ٤
            '5' => '\u{0665}',  // ٥
            '6' => '\u{0666}',  // ٦
            '7' => '\u{0667}',  // ٧
            '8' => '\u{0668}',  // ٨
            '9' => '\u{0669}',  // ٩
            // Pass through unchanged if not mapped
            _ => ch,
        };
        result.push(arabic);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bismillah() {
        // bi + somi = بِسْمِ
        assert_eq!(buckwalter_to_arabic("bi"), "بِ");
        assert_eq!(buckwalter_to_arabic("somi"), "سْمِ");
    }

    #[test]
    fn test_allah() {
        // {ll~ahi = ٱللَّهِ
        let result = buckwalter_to_arabic("{ll~ahi");
        assert!(result.contains('\u{0671}')); // alef wasla
        assert!(result.contains('\u{0651}')); // shadda
    }

    #[test]
    fn test_rahman() {
        // r~aHoma`ni = رَّحْمَٰنِ
        let result = buckwalter_to_arabic("r~aHoma`ni");
        assert!(result.starts_with('ر'));
        assert!(result.contains('\u{0651}')); // shadda
    }
}
