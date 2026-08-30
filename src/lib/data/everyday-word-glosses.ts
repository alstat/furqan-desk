/** Meanings for the curriculum's everyday example words — the ones written to
 * teach a letter rather than lifted from an ayah (بَاب, أُخْت, لَذِيذ, ...) — in the
 * word-by-word languages the app ships.
 *
 * Qur'anic examples need no table: their meanings come from the bundled
 * `word_by_word` corpus (`get_word_glosses`). These words are not in the
 * muṣḥaf, so switching the wizard's language would otherwise leave them in
 * English. Keys are the word exactly as the example data spells it; English is
 * absent on purpose, since the example's own `meaning` already is the English.
 *
 * Translated in-house, not by a native speaker of each language — corrections
 * are welcome and belong here rather than in the lessons. */

/** The bundled gloss languages, minus English. */
export type EverydayGlossLang =
    | "bengali"
    | "french"
    | "hindi"
    | "indonesian"
    | "persian"
    | "tamil"
    | "turkish"
    | "urdu";

export const EVERYDAY_WORD_GLOSSES: Record<string, Record<EverydayGlossLang, string>> = {
    // ukht — sister
    "أُخْت": { bengali: "বোন", french: "sœur", hindi: "बहन", indonesian: "saudari", persian: "خواهر", tamil: "சகோதரி", turkish: "kız kardeş", urdu: "بہن" },
    // bāb — door
    "بَاب": { bengali: "দরজা", french: "porte", hindi: "दरवाज़ा", indonesian: "pintu", persian: "در", tamil: "கதவு", turkish: "kapı", urdu: "دروازہ" },
    // dars — lesson
    "دَرْس": { bengali: "পাঠ", french: "leçon", hindi: "पाठ", indonesian: "pelajaran", persian: "درس", tamil: "பாடம்", turkish: "ders", urdu: "سبق" },
    // madrasah — school
    "مَدْرَسَة": { bengali: "বিদ্যালয়", french: "école", hindi: "विद्यालय", indonesian: "sekolah", persian: "مدرسه", tamil: "பள்ளி", turkish: "okul", urdu: "مدرسہ" },
    // dhahab — gold
    "ذَهَب": { bengali: "সোনা", french: "or", hindi: "सोना", indonesian: "emas", persian: "طلا", tamil: "தங்கம்", turkish: "altın", urdu: "سونا" },
    // ladhīdh — delicious
    "لَذِيذ": { bengali: "সুস্বাদু", french: "délicieux", hindi: "स्वादिष्ट", indonesian: "lezat", persian: "خوشمزه", tamil: "சுவையான", turkish: "lezzetli", urdu: "لذیذ" },
    // ustādh — teacher
    "أُسْتَاذ": { bengali: "শিক্ষক", french: "professeur", hindi: "शिक्षक", indonesian: "guru", persian: "استاد", tamil: "ஆசிரியர்", turkish: "öğretmen", urdu: "استاد" },
    // rajul — man
    "رَجُل": { bengali: "পুরুষ", french: "homme", hindi: "आदमी", indonesian: "laki-laki", persian: "مرد", tamil: "மனிதன்", turkish: "adam", urdu: "آدمی" },
    // qamar — moon
    "قَمَر": { bengali: "চাঁদ", french: "lune", hindi: "चाँद", indonesian: "bulan", persian: "ماه", tamil: "நிலா", turkish: "ay", urdu: "چاند" },
    // zahrah — flower
    "زَهْرَة": { bengali: "ফুল", french: "fleur", hindi: "फूल", indonesian: "bunga", persian: "گل", tamil: "மலர்", turkish: "çiçek", urdu: "پھول" },
    // mīzān — scale, balance
    "مِيزَان": { bengali: "দাঁড়িপাল্লা", french: "balance", hindi: "तराज़ू", indonesian: "timbangan", persian: "ترازو", tamil: "தராசு", turkish: "terazi", urdu: "ترازو" },
    // khubz — bread
    "خُبْز": { bengali: "রুটি", french: "pain", hindi: "रोटी", indonesian: "roti", persian: "نان", tamil: "ரொட்டி", turkish: "ekmek", urdu: "روٹی" },
    // wardah — rose
    "وَرْدَة": { bengali: "গোলাপ", french: "rose", hindi: "गुलाब", indonesian: "mawar", persian: "گل رز", tamil: "ரோஜா", turkish: "gül", urdu: "گلاب" },
    // ʿafw — pardon
    "عَفْو": { bengali: "ক্ষমা", french: "pardon", hindi: "क्षमा", indonesian: "maaf", persian: "بخشش", tamil: "மன்னிப்பு", turkish: "af", urdu: "معافی" },
    // umm — mother
    "أُمّ": { bengali: "মা", french: "mère", hindi: "माँ", indonesian: "ibu", persian: "مادر", tamil: "அம்மா", turkish: "anne", urdu: "ماں" },
    // ism — name
    "اِسْم": { bengali: "নাম", french: "nom", hindi: "नाम", indonesian: "nama", persian: "نام", tamil: "பெயர்", turkish: "isim", urdu: "نام" },
    // ab — father
    "أَب": { bengali: "বাবা", french: "père", hindi: "पिता", indonesian: "ayah", persian: "پدر", tamil: "அப்பா", turkish: "baba", urdu: "باپ" },
    // baḥr — sea
    "بَحْر": { bengali: "সমুদ্র", french: "mer", hindi: "समुद्र", indonesian: "laut", persian: "دریا", tamil: "கடல்", turkish: "deniz", urdu: "سمندر" },
    // bint — girl, daughter
    "بِنْت": { bengali: "মেয়ে", french: "fille", hindi: "लड़की", indonesian: "anak perempuan", persian: "دختر", tamil: "மகள்", turkish: "kız", urdu: "لڑکی" },
    // tilfāz — television
    "تِلْفَاز": { bengali: "টেলিভিশন", french: "télévision", hindi: "टेलीविज़न", indonesian: "televisi", persian: "تلویزیون", tamil: "தொலைக்காட்சி", turkish: "televizyon", urdu: "ٹیلی ویژن" },
    // tilmīdh — student
    "تِلْمِيذ": { bengali: "ছাত্র", french: "élève", hindi: "छात्र", indonesian: "murid", persian: "دانش‌آموز", tamil: "மாணவர்", turkish: "öğrenci", urdu: "شاگرد" },
    // thawb — garment
    "ثَوْب": { bengali: "পোশাক", french: "vêtement", hindi: "वस्त्र", indonesian: "pakaian", persian: "لباس", tamil: "ஆடை", turkish: "elbise", urdu: "لباس" },
    // thaʿlab — fox
    "ثَعْلَب": { bengali: "শিয়াল", french: "renard", hindi: "लोमड़ी", indonesian: "rubah", persian: "روباه", tamil: "நரி", turkish: "tilki", urdu: "لومڑی" },
    // jāmiʿah — university
    "جَامِعَة": { bengali: "বিশ্ববিদ্যালয়", french: "université", hindi: "विश्वविद्यालय", indonesian: "universitas", persian: "دانشگاه", tamil: "பல்கலைக்கழகம்", turkish: "üniversite", urdu: "یونیورسٹی" },
    // jarīdah — newspaper
    "جَرِيدَة": { bengali: "সংবাদপত্র", french: "journal", hindi: "अख़बार", indonesian: "koran", persian: "روزنامه", tamil: "செய்தித்தாள்", turkish: "gazete", urdu: "اخبار" },
    // ḥadīqah — garden
    "حَدِيقَة": { bengali: "বাগান", french: "jardin", hindi: "बग़ीचा", indonesian: "taman", persian: "باغ", tamil: "தோட்டம்", turkish: "bahçe", urdu: "باغ" },
    // ḥidhāʾ — shoes
    "حِذَاء": { bengali: "জুতা", french: "chaussure", hindi: "जूता", indonesian: "sepatu", persian: "کفش", tamil: "காலணி", turkish: "ayakkabı", urdu: "جوتا" },
    // khuḍār — vegetables
    "خُضَار": { bengali: "শাকসবজি", french: "légumes", hindi: "सब्ज़ियाँ", indonesian: "sayuran", persian: "سبزیجات", tamil: "காய்கறிகள்", turkish: "sebze", urdu: "سبزیاں" },
    // khātam — ring
    "خَاتَم": { bengali: "আংটি", french: "bague", hindi: "अंगूठी", indonesian: "cincin", persian: "انگشتر", tamil: "மோதிரம்", turkish: "yüzük", urdu: "انگوٹھی" },
    // darrājah — bicycle
    "دَرَّاجَة": { bengali: "সাইকেল", french: "vélo", hindi: "साइकिल", indonesian: "sepeda", persian: "دوچرخه", tamil: "மிதிவண்டி", turkish: "bisiklet", urdu: "سائیکل" },
    // dukkān — shop
    "دُكَّان": { bengali: "দোকান", french: "boutique", hindi: "दुकान", indonesian: "toko", persian: "دکان", tamil: "கடை", turkish: "dükkân", urdu: "دکان" },
    // dhakiyy — smart, intelligent
    "ذَكِيّ": { bengali: "বুদ্ধিমান", french: "intelligent", hindi: "बुद्धिमान", indonesian: "cerdas", persian: "باهوش", tamil: "புத்திசாலி", turkish: "zeki", urdu: "ذہین" },
    // dhaqan — chin
    "ذَقَن": { bengali: "চিবুক", french: "menton", hindi: "ठोड़ी", indonesian: "dagu", persian: "چانه", tamil: "மோவாய்", turkish: "çene", urdu: "ٹھوڑی" },
    // risālah — letter, message
    "رِسَالَة": { bengali: "চিঠি", french: "lettre", hindi: "पत्र", indonesian: "surat", persian: "نامه", tamil: "கடிதம்", turkish: "mektup", urdu: "خط" },
    // riyāḍah — sport
    "رِيَاضَة": { bengali: "খেলাধুলা", french: "sport", hindi: "खेल", indonesian: "olahraga", persian: "ورزش", tamil: "விளையாட்டு", turkish: "spor", urdu: "کھیل" },
    // zamīl — colleague
    "زَمِيل": { bengali: "সহকর্মী", french: "collègue", hindi: "सहकर्मी", indonesian: "rekan", persian: "همکار", tamil: "சகபணியாளர்", turkish: "meslektaş", urdu: "ساتھی" },
    // zujāj — glass
    "زُجَاج": { bengali: "কাচ", french: "verre", hindi: "काँच", indonesian: "kaca", persian: "شیشه", tamil: "கண்ணாடி", turkish: "cam", urdu: "شیشہ" },
    // sūq — market
    "سُوق": { bengali: "বাজার", french: "marché", hindi: "बाज़ार", indonesian: "pasar", persian: "بازار", tamil: "சந்தை", turkish: "pazar", urdu: "بازار" },
    // sāʿah — watch, hour
    "سَاعَة": { bengali: "ঘড়ি", french: "montre", hindi: "घड़ी", indonesian: "jam", persian: "ساعت", tamil: "கடிகாரம்", turkish: "saat", urdu: "گھڑی" },
    // shāriʿ — street
    "شَارِع": { bengali: "রাস্তা", french: "rue", hindi: "सड़क", indonesian: "jalan", persian: "خیابان", tamil: "தெரு", turkish: "sokak", urdu: "سڑک" },
    // shāy — tea
    "شَاي": { bengali: "চা", french: "thé", hindi: "चाय", indonesian: "teh", persian: "چای", tamil: "தேநீர்", turkish: "çay", urdu: "چائے" },
    // ṣadīq — friend
    "صَدِيق": { bengali: "বন্ধু", french: "ami", hindi: "दोस्त", indonesian: "teman", persian: "دوست", tamil: "நண்பர்", turkish: "arkadaş", urdu: "دوست" },
    // ṣabāḥ — morning
    "صَبَاح": { bengali: "সকাল", french: "matin", hindi: "सुबह", indonesian: "pagi", persian: "صبح", tamil: "காலை", turkish: "sabah", urdu: "صبح" },
    // ḍayf — guest
    "ضَيْف": { bengali: "অতিথি", french: "invité", hindi: "मेहमान", indonesian: "tamu", persian: "مهمان", tamil: "விருந்தினர்", turkish: "misafir", urdu: "مہمان" },
    // ḍifdaʿ — frog
    "ضِفْدَع": { bengali: "ব্যাঙ", french: "grenouille", hindi: "मेंढक", indonesian: "katak", persian: "قورباغه", tamil: "தவளை", turkish: "kurbağa", urdu: "مینڈک" },
    // ṭāwilah — table
    "طَاوِلَة": { bengali: "টেবিল", french: "table", hindi: "मेज़", indonesian: "meja", persian: "میز", tamil: "மேசை", turkish: "masa", urdu: "میز" },
    // ṭaqs — weather
    "طَقْس": { bengali: "আবহাওয়া", french: "temps", hindi: "मौसम", indonesian: "cuaca", persian: "آب‌وهوا", tamil: "வானிலை", turkish: "hava", urdu: "موسم" },
    // ẓarf — envelope
    "ظَرْف": { bengali: "খাম", french: "enveloppe", hindi: "लिफ़ाफ़ा", indonesian: "amplop", persian: "پاکت", tamil: "உறை", turkish: "zarf", urdu: "لفافہ" },
    // ẓill — shade
    "ظِلّ": { bengali: "ছায়া", french: "ombre", hindi: "छाया", indonesian: "bayangan", persian: "سایه", tamil: "நிழல்", turkish: "gölge", urdu: "سایہ" },
    // ʿāʾilah — family
    "عَائِلَة": { bengali: "পরিবার", french: "famille", hindi: "परिवार", indonesian: "keluarga", persian: "خانواده", tamil: "குடும்பம்", turkish: "aile", urdu: "خاندان" },
    // ʿaṣīr — juice
    "عَصِير": { bengali: "রস", french: "jus", hindi: "रस", indonesian: "jus", persian: "آبمیوه", tamil: "சாறு", turkish: "meyve suyu", urdu: "رس" },
    // ghiṭāʾ — cover, lid
    "غِطَاء": { bengali: "ঢাকনা", french: "couvercle", hindi: "ढक्कन", indonesian: "tutup", persian: "سرپوش", tamil: "மூடி", turkish: "kapak", urdu: "ڈھکن" },
    // ghābah — forest
    "غَابَة": { bengali: "বন", french: "forêt", hindi: "जंगल", indonesian: "hutan", persian: "جنگل", tamil: "காடு", turkish: "orman", urdu: "جنگل" },
    // funduq — hotel
    "فُنْدُق": { bengali: "হোটেল", french: "hôtel", hindi: "होटल", indonesian: "hotel", persian: "هتل", tamil: "விடுதி", turkish: "otel", urdu: "ہوٹل" },
    // furṣah — opportunity
    "فُرْصَة": { bengali: "সুযোগ", french: "occasion", hindi: "अवसर", indonesian: "kesempatan", persian: "فرصت", tamil: "வாய்ப்பு", turkish: "fırsat", urdu: "موقع" },
    // qalam — pen
    "قَلَم": { bengali: "কলম", french: "stylo", hindi: "क़लम", indonesian: "pena", persian: "قلم", tamil: "பேனா", turkish: "kalem", urdu: "قلم" },
    // qamīṣ — shirt
    "قَمِيص": { bengali: "জামা", french: "chemise", hindi: "कमीज़", indonesian: "kemeja", persian: "پیراهن", tamil: "சட்டை", turkish: "gömlek", urdu: "قمیض" },
    // kalb — dog
    "كَلْب": { bengali: "কুকুর", french: "chien", hindi: "कुत्ता", indonesian: "anjing", persian: "سگ", tamil: "நாய்", turkish: "köpek", urdu: "کتا" },
    // kūb — cup
    "كُوب": { bengali: "কাপ", french: "tasse", hindi: "प्याला", indonesian: "cangkir", persian: "لیوان", tamil: "கோப்பை", turkish: "bardak", urdu: "پیالہ" },
    // lughah — language
    "لُغَة": { bengali: "ভাষা", french: "langue", hindi: "भाषा", indonesian: "bahasa", persian: "زبان", tamil: "மொழி", turkish: "dil", urdu: "زبان" },
    // lawn — color
    "لَوْن": { bengali: "রং", french: "couleur", hindi: "रंग", indonesian: "warna", persian: "رنگ", tamil: "நிறம்", turkish: "renk", urdu: "رنگ" },
    // maṭbakh — kitchen
    "مَطْبَخ": { bengali: "রান্নাঘর", french: "cuisine", hindi: "रसोई", indonesian: "dapur", persian: "آشپزخانه", tamil: "சமையலறை", turkish: "mutfak", urdu: "باورچی خانہ" },
    // miftāḥ — key
    "مِفْتَاح": { bengali: "চাবি", french: "clé", hindi: "चाबी", indonesian: "kunci", persian: "کلید", tamil: "சாவி", turkish: "anahtar", urdu: "چابی" },
    // nāfidhah — window
    "نَافِذَة": { bengali: "জানালা", french: "fenêtre", hindi: "खिड़की", indonesian: "jendela", persian: "پنجره", tamil: "ஜன்னல்", turkish: "pencere", urdu: "کھڑکی" },
    // nahr — river
    "نَهْر": { bengali: "নদী", french: "rivière", hindi: "नदी", indonesian: "sungai", persian: "رودخانه", tamil: "ஆறு", turkish: "nehir", urdu: "دریا" },
    // hawāʾ — air
    "هَوَاء": { bengali: "বাতাস", french: "air", hindi: "हवा", indonesian: "udara", persian: "هوا", tamil: "காற்று", turkish: "hava", urdu: "ہوا" },
    // hadiyyah — gift
    "هَدِيَّة": { bengali: "উপহার", french: "cadeau", hindi: "उपहार", indonesian: "hadiah", persian: "هدیه", tamil: "பரிசு", turkish: "hediye", urdu: "تحفہ" },
    // waqt — time
    "وَقْت": { bengali: "সময়", french: "temps", hindi: "समय", indonesian: "waktu", persian: "وقت", tamil: "நேரம்", turkish: "zaman", urdu: "وقت" },
    // wajbah — meal
    "وَجْبَة": { bengali: "খাবার", french: "repas", hindi: "भोजन", indonesian: "hidangan", persian: "وعده غذا", tamil: "உணவு", turkish: "öğün", urdu: "کھانا" },
    // yatīm — orphan
    "يَتِيم": { bengali: "এতিম", french: "orphelin", hindi: "अनाथ", indonesian: "yatim", persian: "یتیم", tamil: "அனாதை", turkish: "yetim", urdu: "یتیم" },
    // yamīn — right hand
    "يَمِين": { bengali: "ডান হাত", french: "main droite", hindi: "दायाँ हाथ", indonesian: "tangan kanan", persian: "دست راست", tamil: "வலது கை", turkish: "sağ el", urdu: "دایاں ہاتھ" },
    // tuffāḥ — apple
    "تُفَّاح": { bengali: "আপেল", french: "pomme", hindi: "सेब", indonesian: "apel", persian: "سیب", tamil: "ஆப்பிள்", turkish: "elma", urdu: "سیب" },
    // thalj — snow / ice
    "ثَلْج": { bengali: "বরফ", french: "neige", hindi: "बर्फ़", indonesian: "salju", persian: "برف", tamil: "பனி", turkish: "kar", urdu: "برف" },
    // jamīl — beautiful
    "جَمِيل": { bengali: "সুন্দর", french: "beau", hindi: "सुंदर", indonesian: "indah", persian: "زیبا", tamil: "அழகான", turkish: "güzel", urdu: "خوبصورت" },
    // ḥalīb — milk
    "حَلِيب": { bengali: "দুধ", french: "lait", hindi: "दूध", indonesian: "susu", persian: "شیر", tamil: "பால்", turkish: "süt", urdu: "دودھ" },
    // sayyārah — car
    "سَيَّارَة": { bengali: "গাড়ি", french: "voiture", hindi: "कार", indonesian: "mobil", persian: "ماشین", tamil: "கார்", turkish: "araba", urdu: "گاڑی" },
    // shams — sun
    "شَمْس": { bengali: "সূর্য", french: "soleil", hindi: "सूरज", indonesian: "matahari", persian: "خورشید", tamil: "சூரியன்", turkish: "güneş", urdu: "سورج" },
    // ṣūrah — picture
    "صُورَة": { bengali: "ছবি", french: "image", hindi: "तस्वीर", indonesian: "gambar", persian: "عکس", tamil: "படம்", turkish: "resim", urdu: "تصویر" },
    // ḍawʾ — light
    "ضَوْء": { bengali: "আলো", french: "lumière", hindi: "प्रकाश", indonesian: "cahaya", persian: "نور", tamil: "ஒளி", turkish: "ışık", urdu: "روشنی" },
    // ṭabīb — doctor
    "طَبِيب": { bengali: "ডাক্তার", french: "médecin", hindi: "डॉक्टर", indonesian: "dokter", persian: "پزشک", tamil: "மருத்துவர்", turkish: "doktor", urdu: "ڈاکٹر" },
    // ẓuhr — noon
    "ظُهْر": { bengali: "দুপুর", french: "midi", hindi: "दोपहर", indonesian: "siang", persian: "ظهر", tamil: "நண்பகல்", turkish: "öğle", urdu: "دوپہر" },
    // ʿayn — eye
    "عَيْن": { bengali: "চোখ", french: "œil", hindi: "आँख", indonesian: "mata", persian: "چشم", tamil: "கண்", turkish: "göz", urdu: "آنکھ" },
    // ghurfah — room
    "غُرْفَة": { bengali: "কক্ষ", french: "chambre", hindi: "कमरा", indonesian: "kamar", persian: "اتاق", tamil: "அறை", turkish: "oda", urdu: "کمرہ" },
    // fākihah — fruit
    "فَاكِهَة": { bengali: "ফল", french: "fruit", hindi: "फल", indonesian: "buah", persian: "میوه", tamil: "பழம்", turkish: "meyve", urdu: "پھل" },
    // kursiyy — chair
    "كُرْسِيّ": { bengali: "চেয়ার", french: "chaise", hindi: "कुर्सी", indonesian: "kursi", persian: "صندلی", tamil: "நாற்காலி", turkish: "sandalye", urdu: "کرسی" },
    // lisān — tongue / language
    "لِسَان": { bengali: "জিহ্বা", french: "langue", hindi: "जीभ", indonesian: "lidah", persian: "زبان", tamil: "நாக்கு", turkish: "dil", urdu: "زبان" },
    // najmah — star
    "نَجْمَة": { bengali: "তারা", french: "étoile", hindi: "तारा", indonesian: "bintang", persian: "ستاره", tamil: "நட்சத்திரம்", turkish: "yıldız", urdu: "ستارہ" },
    // hātif — telephone
    "هَاتِف": { bengali: "টেলিফোন", french: "téléphone", hindi: "टेलीफ़ोन", indonesian: "telepon", persian: "تلفن", tamil: "தொலைபேசி", turkish: "telefon", urdu: "ٹیلی فون" },
    // yad — hand
    "يَد": { bengali: "হাত", french: "main", hindi: "हाथ", indonesian: "tangan", persian: "دست", tamil: "கை", turkish: "el", urdu: "ہاتھ" },
};
