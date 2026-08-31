/**
 * Lessons that ship with the app, in English, for the intermediate and advanced
 * curriculum.
 *
 * WHY THIS FILE IS NOT IN THE i18n DICTIONARY. These are whole lessons, not
 * interface strings: a screenful of prose each, in one language on purpose.
 * Putting them in `en.ts` would drag them into every "translate all the keys"
 * pass and quietly produce thirty machine-translated Qur'anic grammar lessons
 * that nobody has read. They live here instead, hard-coded and English-only,
 * and the app treats them as the first version of a lesson: a reader without an
 * AI subscription can study them as they are, and a reader with one regenerates
 * from them — in any language — without ever overwriting them.
 *
 * The format is the marker format `ai-grammar-topic.store.ts` asks the model
 * for, so a shipped lesson and a generated one are the same kind of document
 * and the same parser reads both.
 *
 * Every Qur'anic citation below was checked against the bundled
 * `quran_static.db`: the reference resolves, the words quoted really stand in
 * that ayah, and the English line is that ayah's own translation.
 */

export const PREMADE_LOCALE = 'en';

/** topic id -> the lesson that ships for it. Topics absent here have none. */
export const PREMADE_LESSONS: Record<string, string> = {
    noun_cases: `@@title@@ أَحْوَالُ الإِعْرَابِ
@@subtitle@@ aḥwāl al-iʿrāb — the three cases of the noun
@@explanation@@ Arabic marks a noun's job in the sentence on its ending rather than by its position, which is why word order can move so freely without confusion.

A noun is **marfūʿ** (in the nominative, typically -u) when it is the subject of a sentence or the predicate of a nominal one; **manṣūb** (accusative, -a) when it is an object, or the subject of **إِنَّ** and her sisters; and **majrūr** (genitive, -i) after a preposition or as the second term of an **iḍāfa** (a possessive construction).

Read the ending, and the sentence's structure follows: it tells you which noun is acting, which is being acted on, and which is attached to what. Where the ending is a **tanwīn** (the doubled vowel of an indefinite noun) the same three cases apply — -un, -an, -in.
@@quran_1@@ جَآءَتِ ٱلطَّآمَّةُ ٱلْكُبْرَىٰ :: ٱلطَّآمَّةُ is marfūʿ — the subject of the verb :: 79:34
@@quran_2@@ لَآ إِلَٰهَ إِلَّا هُوَ :: إِلَٰهَ is manṣūb after the negating لَا :: 27:26
@@quran_3@@ فِىٓ أُمِّ ٱلْكِتَٰبِ :: أُمِّ is majrūr after the preposition فِى, and ٱلْكِتَٰبِ majrūr as the second term of the iḍāfa :: 43:4
@@everyday_1@@ دَخَلَ الطَّالِبُ الصَّفَّ :: The student entered the classroom — الطَّالِبُ marfūʿ, الصَّفَّ manṣūb
@@everyday_2@@ قَرَأْتُ الكِتَابَ فِي البَيْتِ :: I read the book in the house — الكِتَابَ manṣūb, البَيْتِ majrūr
@@everyday_3@@ الْمُعَلِّمُ فِي الْمَدْرَسَةِ :: The teacher is in the school — a nominal sentence, subject marfūʿ
@@exercise_1@@ شَرِبَ ___ الْمَاءَ :: الْوَلَدُ | الْوَلَدَ | الْوَلَدِ :: الْوَلَدُ :: the doer of the verb is marfūʿ :: The boy drank ___ the water
@@exercise_2@@ رَأَيْتُ ___ فِي السُّوقِ :: التَّاجِرُ | التَّاجِرَ | التَّاجِرِ :: التَّاجِرَ :: the object of the verb is manṣūb :: I saw ___ in the market
@@exercise_3@@ ذَهَبْتُ إِلَى ___ :: الْمَسْجِدُ | الْمَسْجِدَ | الْمَسْجِدِ :: الْمَسْجِدِ :: a noun after a preposition is majrūr :: I went to ___`,

    definite_article: `@@title@@ أَلْ التَّعْرِيفِ
@@subtitle@@ al-taʿrīf — the definite article and its assimilation
@@explanation@@ The definite article **ال** is written the same way everywhere, and read two ways.

Before a **moon letter** (ا ب ج ح خ ع غ ف ق ك م ه و ي) the lām is pronounced plainly: *al-qamar*. Before a **sun letter** (the remaining fourteen: ت ث د ذ ر ز س ش ص ض ط ظ ل ن) the lām is not pronounced at all; the following consonant doubles instead, and the muṣḥaf marks that doubling with a **shaddah**: *ash-shams*, never *al-shams*.

Nothing changes in the spelling — the lām is still there on the page. What changes is the reading, and the shaddah is the sign that tells you which reading applies. Note also that a noun in an **iḍāfa** never carries the article on its first term.
@@quran_1@@ رَبُّ ٱلْعَرْشِ ٱلْعَظِيمِ :: ع is a moon letter, so the lām of ٱلْعَرْشِ is read plainly :: 23:86
@@quran_2@@ رَبُّ ٱلسَّمَٰوَٰتِ ٱلسَّبْعِ :: س is a sun letter — the lām is silent and the س doubles, as the shaddah shows :: 23:86
@@quran_3@@ وَتَرَكْنَا عَلَيْهِ فِى ٱلْءَاخِرِينَ :: hamzah is a moon letter, so again the lām is heard :: 37:78
@@everyday_1@@ الْقَمَرُ جَمِيلٌ :: The moon is beautiful — al-qamar, a moon letter
@@everyday_2@@ الشَّمْسُ سَاطِعَةٌ :: The sun is shining — ash-shams, the lām assimilated
@@everyday_3@@ فَتَحْتُ الْبَابَ وَالنَّافِذَةَ :: I opened the door and the window — al-bāb, an-nāfidhah
@@exercise_1@@ Which is read with a silent lām: ___ :: الطَّرِيق | الْقَلَم | الْكِتَاب :: الطَّرِيق :: ط is a sun letter, so the lām assimilates :: Which is read with a silent lām: ___
@@exercise_2@@ ___ يُقْرَأُ بِلَامٍ ظَاهِرَةٍ :: الرَّجُل | الْجَبَل | النَّهْر :: الْجَبَل :: ج is a moon letter, so the lām is pronounced :: ___ is read with an audible lām
@@exercise_3@@ الشَّاهِدُ عَلَى الشَّدَّةِ هُوَ ___ :: حَرْفٌ شَمْسِيٌّ | حَرْفٌ قَمَرِيٌّ | حَرْفُ جَرٍّ :: حَرْفٌ شَمْسِيٌّ :: a shaddah after the article marks a sun letter :: The shaddah is the sign of ___`,

    idafa: `@@title@@ الإِضَافَةُ
@@subtitle@@ al-iḍāfa — possession without a preposition
@@explanation@@ Two nouns placed side by side form a possessive chain: *the book of the student*, in Arabic simply **كِتَابُ الطَّالِبِ**.

The first noun — the **muḍāf** — takes whatever case its own role in the sentence demands, and it never carries the definite article and never takes **tanwīn**. The second — the **muḍāf ilayhi** — is always **majrūr** (in the genitive), and it is what makes the whole phrase definite or indefinite.

Chains can run longer than two: each noun after the first is majrūr, and only the last one may carry the article. An attached pronoun counts as the second term too, which is why **رَبُّهُ** ("his Lord") is an iḍāfa just as much as **رَبُّ الْعَالَمِينَ** is.
@@quran_1@@ مَٰلِكِ يَوْمِ ٱلدِّينِ :: a two-step chain — يَوْمِ is majrūr after مَٰلِكِ, and ٱلدِّينِ majrūr after يَوْمِ :: 1:4
@@quran_2@@ تَنزِيلٌ مِّن رَّبِّ ٱلْعَٰلَمِينَ :: رَّبِّ is majrūr after مِن, and ٱلْعَٰلَمِينَ majrūr as the second term :: 69:43
@@quran_3@@ إِذْ نَادَىٰهُ رَبُّهُۥ :: an attached pronoun as the second term — رَبُّ is marfūʿ as the subject, ـهُ its muḍāf ilayhi :: 79:16
@@everyday_1@@ بَابُ الْبَيْتِ مَفْتُوحٌ :: The door of the house is open
@@everyday_2@@ هَذَا كِتَابُ الْمُعَلِّمِ :: This is the teacher's book
@@everyday_3@@ سَيَّارَةُ أَخِي جَدِيدَةٌ :: My brother's car is new
@@exercise_1@@ قَرَأْتُ كِتَابَ ___ :: الطَّالِبُ | الطَّالِبَ | الطَّالِبِ :: الطَّالِبِ :: the second term of an iḍāfa is always majrūr :: I read the book of ___
@@exercise_2@@ الصَّحِيحُ هُوَ ___ :: بَابُ الْبَيْتِ | الْبَابُ الْبَيْتِ | بَابٌ الْبَيْتِ :: بَابُ الْبَيْتِ :: the muḍāf takes neither the article nor tanwīn :: The correct form is ___
@@exercise_3@@ مِفْتَاحُ ___ ضَاعَ :: الْغُرْفَةُ | الْغُرْفَةِ | الْغُرْفَةَ :: الْغُرْفَةِ :: again the second term is genitive :: The key of ___ was lost`,

    inna_sisters: `@@title@@ إِنَّ وَأَخَوَاتُهَا
@@subtitle@@ inna wa-akhawātuhā — inna and her sisters
@@explanation@@ **إِنَّ** and her sisters — **أَنَّ**, **كَأَنَّ**, **لَٰكِنَّ**, **لَيْتَ**, **لَعَلَّ** — enter a nominal sentence and change its endings: the subject becomes **manṣūb** (accusative) and the predicate stays **marfūʿ** (nominative).

Each sister adds its own shade of meaning. إِنَّ and أَنَّ assert; كَأَنَّ likens; لَٰكِنَّ corrects the expectation just raised; لَيْتَ wishes for what is unlikely; لَعَلَّ hopes for what is possible.

An **لَـ** often follows إِنَّ and attaches to the predicate, strengthening the assertion further — *inna hādhā la-ḥaqq*. Note that the sisters govern nouns, not verbs: a verb after them belongs to a clause of its own.
@@quran_1@@ إِنَّ ٱلْمُتَّقِينَ فِى ظِلَٰلٍ وَعُيُونٍ :: ٱلْمُتَّقِينَ is manṣūb as the subject of إِنَّ :: 77:41
@@quran_2@@ وَإِنَّ رَبَّكَ هُوَ يَحْشُرُهُمْ :: رَبَّكَ manṣūb, and the predicate follows as a sentence of its own :: 15:25
@@quran_3@@ إِنَّ هَٰٓؤُلَآءِ لَشِرْذِمَةٌ قَلِيلُونَ :: the لَـ of emphasis on the predicate شِرْذِمَةٌ, which stays marfūʿ :: 26:54
@@everyday_1@@ إِنَّ الْجَوَّ جَمِيلٌ الْيَوْمَ :: The weather is lovely today
@@everyday_2@@ لَعَلَّ الْقِطَارَ مُتَأَخِّرٌ :: Perhaps the train is late
@@everyday_3@@ كَأَنَّ الْبَيْتَ قَصْرٌ :: The house is like a palace
@@exercise_1@@ إِنَّ ___ مُجْتَهِدٌ :: الطَّالِبَ | الطَّالِبُ | الطَّالِبِ :: الطَّالِبَ :: the subject of inna is manṣūb :: Indeed ___ is diligent
@@exercise_2@@ لَيْتَ ___ قَرِيبٌ :: الْفَرَجُ | الْفَرَجَ | الْفَرَجِ :: الْفَرَجَ :: layta behaves as inna does :: If only ___ were near
@@exercise_3@@ إِنَّ الْعِلْمَ ___ :: نَافِعٌ | نَافِعًا | نَافِعٍ :: نَافِعٌ :: the predicate of inna stays marfūʿ :: Indeed knowledge is ___`,

    kana_sisters: `@@title@@ كَانَ وَأَخَوَاتُهَا
@@subtitle@@ kāna wa-akhawātuhā — kāna and her sisters
@@explanation@@ **كَانَ** and her sisters — **أَصْبَحَ**, **أَمْسَى**, **ظَلَّ**, **بَاتَ**, **صَارَ**, **لَيْسَ**, **مَا زَالَ** — do the mirror image of إِنَّ: they leave the subject **marfūʿ** and put the predicate in the **manṣūb** (accusative).

What they add is time or change of state. كَانَ places a nominal sentence in the past; أَصْبَحَ and أَمْسَى set it in the morning or evening; صَارَ marks a becoming; لَيْسَ negates it outright; مَا زَالَ says it has not stopped being so.

The subject is called the **ism** of kāna and the predicate its **khabar**. The khabar need not be a single word: a whole sentence or a prepositional phrase can fill the role, in which case there is no visible accusative ending to look for.
@@quran_1@@ إِنَّهُۥ كَانَ فِىٓ أَهْلِهِۦ مَسْرُورًا :: مَسْرُورًا is manṣūb as the khabar of كَانَ :: 84:13
@@quran_2@@ وَمَا كُنَّا ظَٰلِمِينَ :: ظَٰلِمِينَ manṣūb — the plural takes ـينَ rather than a fatḥah :: 26:209
@@quran_3@@ وَكُنتُمْ أَزْوَٰجًا ثَلَٰثَةً :: أَزْوَٰجًا manṣūb, with its number agreeing :: 56:7
@@everyday_1@@ كَانَ الْجَوُّ بَارِدًا :: The weather was cold
@@everyday_2@@ أَصْبَحَ الطَّالِبُ مُجْتَهِدًا :: The student became diligent
@@everyday_3@@ لَيْسَ الدَّرْسُ صَعْبًا :: The lesson is not difficult
@@exercise_1@@ كَانَ الْبَيْتُ ___ :: كَبِيرٌ | كَبِيرًا | كَبِيرٍ :: كَبِيرًا :: the khabar of kāna is manṣūb :: The house was ___
@@exercise_2@@ لَيْسَ ___ حَاضِرًا :: الْمُدِيرُ | الْمُدِيرَ | الْمُدِيرِ :: الْمُدِيرُ :: the ism of laysa stays marfūʿ :: ___ is not present
@@exercise_3@@ صَارَ الْمَاءُ ___ :: ثَلْجٌ | ثَلْجًا | ثَلْجٍ :: ثَلْجًا :: ṣāra takes a manṣūb predicate like kāna :: The water became ___`,

    jussive: `@@title@@ المُضَارِعُ المَجْزُومُ
@@subtitle@@ al-muḍāriʿ al-majzūm — the jussive
@@explanation@@ The **jussive** (majzūm) is the shortest form of the imperfect verb. Where the indicative ends in a ḍammah, the jussive drops it to a sukūn; where the indicative ends in a nūn (the plural and dual forms), the jussive drops the nūn; and where the verb ends in a weak letter, the jussive drops the letter itself — **يَقْضِي** becomes **يَقْضِ**.

Three things put a verb in the jussive: **لَمْ**, which negates it and turns its meaning to the past; **لَمَّا**, "not yet"; and **لَا** of prohibition, "do not". Conditional particles jussive two verbs at once — the condition and its answer.

The imperative is built from the jussive, which is why its endings behave the same way.
@@quran_1@@ كَلَّا لَا تُطِعْهُ :: لَا of prohibition — تُطِعْ ends in a sukūn :: 96:19
@@quran_2@@ كَلَّا لَمَّا يَقْضِ مَآ أَمَرَهُۥ :: لَمَّا drops the final yāʾ of يَقْضِي :: 80:23
@@quran_3@@ أَلَمْ يَجِدْكَ يَتِيمًا فَـَٔاوَىٰ :: لَمْ makes يَجِدْ jussive, and turns the meaning to the past :: 93:6
@@everyday_1@@ لَمْ أَذْهَبْ إِلَى السُّوقِ :: I did not go to the market
@@everyday_2@@ لَا تَنْسَ وَاجِبَكَ :: Do not forget your homework
@@everyday_3@@ لَمَّا يَصِلِ الضَّيْفُ :: The guest has not arrived yet
@@exercise_1@@ لَمْ ___ الطَّالِبُ الدَّرْسَ :: يَكْتُبُ | يَكْتُبْ | يَكْتُبَ :: يَكْتُبْ :: lam takes the jussive — a sukūn on the ending :: The student did not write the lesson
@@exercise_2@@ لَا ___ فِي الصَّفِّ :: تَتَكَلَّمُ | تَتَكَلَّمْ | تَتَكَلَّمَ :: تَتَكَلَّمْ :: lā of prohibition takes the jussive :: Do not ___ in the classroom
@@exercise_3@@ لَمْ ___ الطُّلَّابُ :: يَحْضُرُونَ | يَحْضُرُوا | يَحْضُرُونَا :: يَحْضُرُوا :: the plural loses its nūn in the jussive :: The students did not attend`,

    balagha_intro: `@@title@@ البَلَاغَةُ
@@subtitle@@ al-balāgha — the art of saying it well
@@explanation@@ **Balāgha** begins where grammar ends. Grammar asks whether a sentence is correct; balāgha asks why *this* correct sentence, in *this* place, says more than another one would.

It is traditionally studied in three parts. **ʿIlm al-maʿānī** looks at the sentence: what is stated and what is left out, what is put first, whether a thing is asserted plainly or with emphasis. **ʿIlm al-bayān** looks at the image: simile, metaphor, metonymy — the ways one thing is said through another. **ʿIlm al-badīʿ** looks at the ornament: the pairings, contrasts and cadences that make a passage hold together in the ear.

Read this way, a Qur'anic verse is not only true but formed: the order of its words, the image it chooses and the rhythm it closes on are all part of what it means.
@@quran_1@@ ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ :: bayān — a single borrowed word carries an entire argument :: 24:35
@@quran_2@@ ٱلْقَارِعَةُ :: maʿānī — one word standing alone as a whole sentence, which is what makes it strike :: 101:1
@@quran_3@@ فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ :: badīʿ — a refrain whose repetition is itself the argument :: 55:13
@@everyday_1@@ الْكَلَامُ الْبَلِيغُ مَا نَاسَبَ الْمَقَامَ :: Eloquent speech is that which fits its occasion
@@everyday_2@@ لِكُلِّ مَقَامٍ مَقَالٌ :: For every occasion there is a way of saying it
@@everyday_3@@ الْإِيجَازُ فِي مَوْضِعِهِ بَلَاغَةٌ :: Brevity in its right place is eloquence
@@exercise_1@@ عِلْمُ ___ يَدْرُسُ التَّشْبِيهَ وَالِاسْتِعَارَةَ :: الْمَعَانِي | الْبَيَانِ | الْبَدِيعِ :: الْبَيَانِ :: ʿilm al-bayān is the study of the image :: The science of ___ studies simile and metaphor
@@exercise_2@@ عِلْمُ ___ يَدْرُسُ التَّقْدِيمَ وَالتَّأْخِيرَ :: الْمَعَانِي | الْبَيَانِ | الْبَدِيعِ :: الْمَعَانِي :: fronting is a question of sentence meaning :: The science of ___ studies fronting and postponement
@@exercise_3@@ عِلْمُ ___ يَدْرُسُ الْمُحَسِّنَاتِ اللَّفْظِيَّةَ :: الْمَعَانِي | الْبَيَانِ | الْبَدِيعِ :: الْبَدِيعِ :: ornament and cadence belong to badīʿ :: The science of ___ studies verbal ornament`,

    tashbih: `@@title@@ التَّشْبِيهُ
@@subtitle@@ al-tashbīh — simile
@@explanation@@ A **tashbīh** joins two things through a quality they share. It has four parts: the thing being likened (**mushabbah**), the thing it is likened to (**mushabbah bihi**), the shared quality (**wajh al-shabah**), and the particle that joins them (**adāt**, usually كَـ or مِثْل).

Its force does not come from the comparison itself but from what is chosen. Likening a ship to a mountain says something about scale and stillness that "large" could not. Leaving the shared quality unstated — as the Qur'an usually does — makes the reader find it, and what they find is more vivid than anything spelled out.

When the particle is dropped and the two are stated as one, the simile has become a metaphor.
@@quran_1@@ مَثَلُهُمْ كَمَثَلِ ٱلَّذِى ٱسْتَوْقَدَ نَارًا :: the particle كَـ, with the shared quality left for the reader :: 2:17
@@quran_2@@ ٱلْجَوَارِ فِى ٱلْبَحْرِ كَٱلْأَعْلَٰمِ :: ships likened to mountains — scale and steadiness, unstated :: 42:32
@@quran_3@@ مَثَلُ نُورِهِۦ كَمِشْكَوٰةٍ :: an extended simile, unfolding over the whole ayah :: 24:35
@@everyday_1@@ هُوَ كَالْأَسَدِ فِي الشَّجَاعَةِ :: He is like a lion in courage — here the quality is stated
@@everyday_2@@ الْعِلْمُ كَالنُّورِ :: Knowledge is like light
@@everyday_3@@ كَانَ صَوْتُهُ كَالرَّعْدِ :: His voice was like thunder
@@exercise_1@@ أَدَاةُ التَّشْبِيهِ فِي "هُوَ كَالْبَحْرِ" هِيَ ___ :: الْكَافُ | اللَّامُ | الْبَاءُ :: الْكَافُ :: the kāf is the particle of likeness :: The particle of simile in "he is like the sea" is ___
@@exercise_2@@ الْمُشَبَّهُ بِهِ فِي "الْعِلْمُ كَالنُّورِ" هُوَ ___ :: الْعِلْمُ | النُّورُ | الْكَافُ :: النُّورُ :: the thing likened to comes after the particle :: In "knowledge is like light", the thing likened to is ___
@@exercise_3@@ إِذَا حُذِفَتِ الْأَدَاةُ صَارَ التَّشْبِيهُ ___ :: اسْتِعَارَةً | كِنَايَةً | إِيجَازًا :: اسْتِعَارَةً :: dropping the particle turns a simile into a metaphor :: With the particle dropped, a simile becomes ___`,

    istiara: `@@title@@ الِاسْتِعَارَةُ
@@subtitle@@ al-istiʿāra — metaphor
@@explanation@@ An **istiʿāra** is a simile with one of its two sides left unsaid. The borrowed word is not explained, and it brings its own world into the sentence with it.

If what is named is the thing likened *to* — light, for a guidance that is not literally light — the metaphor is **taṣrīḥiyya**, "declared". If instead the borrowed thing is only implied, present through something belonging to it — a head that "blazes" with grey, a wing lowered in humility — it is **makniyya**, "implicit". In both, the literal reading fails and that failure is the signal: the sentence means something the words do not say.

The test is simple. If a particle of likeness could be restored without loss, it was a simile; if restoring it flattens the sentence, it was a metaphor.
@@quran_1@@ ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ :: taṣrīḥiyya — the borrowed word "light" stands in place of the comparison :: 24:35
@@quran_2@@ وَٱشْتَعَلَ ٱلرَّأْسُ شَيْبًا :: makniyya — fire is never named, only its blazing :: 19:4
@@quran_3@@ وَٱخْفِضْ لَهُمَا جَنَاحَ ٱلذُّلِّ مِنَ ٱلرَّحْمَةِ :: makniyya — the wing belongs to a bird that is never mentioned :: 17:24
@@everyday_1@@ رَأَيْتُ أَسَدًا يَخْطُبُ :: I saw a lion giving a speech — a man, declared as a lion
@@everyday_2@@ ابْتَسَمَ الصَّبَاحُ :: The morning smiled
@@everyday_3@@ الْمَدِينَةُ نَائِمَةٌ :: The city is asleep
@@exercise_1@@ "رَأَيْتُ بَحْرًا يُعْطِي" اسْتِعَارَةٌ ___ :: تَصْرِيحِيَّةٌ | مَكْنِيَّةٌ | تَشْبِيهٌ :: تَصْرِيحِيَّةٌ :: the borrowed word itself is stated :: "I saw a sea giving" is a ___ metaphor
@@exercise_2@@ "نَطَقَ الْحَالُ" اسْتِعَارَةٌ ___ :: تَصْرِيحِيَّةٌ | مَكْنِيَّةٌ | كِنَايَةٌ :: مَكْنِيَّةٌ :: speaking implies a speaker never named :: "The situation spoke" is a ___ metaphor
@@exercise_3@@ الْفَرْقُ بَيْنَ التَّشْبِيهِ وَالِاسْتِعَارَةِ هُوَ ___ :: حَذْفُ الْأَدَاةِ | حَذْفُ الْمُشَبَّهِ بِهِ | زِيَادَةُ الْوَصْفِ :: حَذْفُ الْأَدَاةِ :: a metaphor drops the particle and one of the two sides :: What separates simile from metaphor is ___`,

    rhetorical_questions: `@@title@@ الِاسْتِفْهَامُ البَلَاغِيُّ
@@subtitle@@ al-istifhām al-balāghī — the question that asks for no answer
@@explanation@@ A question in the Qur'an rarely seeks information. The speaker knows the answer, and so does the listener; the question's work is to make the listener say it to themselves.

The forms it takes are recognisable. **أَلَمْ** ("did He not…") asks for an admission the listener cannot refuse. **كَيْفَ** ("how can you…") rebukes. **أَفَلَا** ("do they not then…") invites a conclusion the evidence has already made. **مَن** and **أَىّ** can challenge, when no answer but one is possible.

Because no answer is wanted, the reply is usually left out entirely — and that silence is where the argument lands. A question of this kind is stronger than the statement it replaces, because the listener supplies the statement themselves.
@@quran_1@@ أَفَلَا يَنظُرُونَ إِلَى ٱلْإِبِلِ كَيْفَ خُلِقَتْ :: أَفَلَا invites a conclusion from evidence already in view :: 88:17
@@quran_2@@ كَيْفَ تَكْفُرُونَ بِٱللَّهِ :: كَيْفَ as rebuke, not enquiry :: 2:28
@@quran_3@@ أَتَأْمُرُونَ ٱلنَّاسَ بِٱلْبِرِّ وَتَنسَوْنَ أَنفُسَكُمْ :: the question exposes a contradiction the listener must own :: 2:44
@@everyday_1@@ أَلَمْ أَقُلْ لَكَ ذَلِكَ مِنْ قَبْلُ :: Did I not tell you that before?
@@everyday_2@@ كَيْفَ تَتْرُكُ عَمَلَكَ نَاقِصًا :: How can you leave your work unfinished?
@@everyday_3@@ أَفَلَا تَشْكُرُ مَنْ سَاعَدَكَ :: Will you not thank the one who helped you?
@@exercise_1@@ "أَلَمْ نَشْرَحْ لَكَ صَدْرَكَ" غَرَضُهَا ___ :: التَّقْرِيرُ | الْإِنْكَارُ | التَّعَجُّبُ :: التَّقْرِيرُ :: alam draws an admission the listener already grants :: The purpose of "Did We not expand your breast" is ___
@@exercise_2@@ "كَيْفَ تَكْفُرُونَ" غَرَضُهَا ___ :: التَّقْرِيرُ | الْإِنْكَارُ | الِاسْتِخْبَارُ :: الْإِنْكَارُ :: kayfa here rebukes rather than asks :: The purpose of "How can you disbelieve" is ___
@@exercise_3@@ الِاسْتِفْهَامُ الْبَلَاغِيُّ لَا يَطْلُبُ ___ :: جَوَابًا | تَقْرِيرًا | إِنْكَارًا :: جَوَابًا :: it seeks no answer, only the listener's own conclusion :: A rhetorical question does not seek ___`,

    attached_pronouns: `@@title@@ الضَّمَائِرُ المُتَّصِلَةُ
@@subtitle@@ al-ḍamāʾir al-muttaṣila — the attached pronouns
@@explanation@@ Arabic does not write "him" or "his" as separate words: it attaches them to whatever they belong to.

The same set serves three jobs. On a **noun** the pronoun is possessive — **كِتَابُهُ**, "his book" — and the noun is then an **iḍāfa** (a possessive construction), so it takes no article. On a **verb** it is the object: **فَطَرَنِي**, "He created me". On a **preposition** or on **إِنَّ** and her sisters it is the thing governed: **لَهُ**, "to him"; **إِنَّهُ**, "indeed he".

The first person adds a **nūn al-wiqāya** ("protecting nūn") before ـي on a verb — hence **فَطَرَنِي**, not *faṭarī*. And ـهُ becomes ـهِ after a kasrah or a yāʾ: **بِهِ**, not *bihu*.
@@quran_1@@ وَلَكُمْ فِيهَا جَمَالٌ :: لَكُمْ on a preposition, فِيهَا on another — "for you", "in them" :: 16:6
@@quran_2@@ إِلَّا ٱلَّذِى فَطَرَنِى :: ـنِى as the object of the verb, with the protecting nūn :: 43:27
@@quran_3@@ رَبِّ ٱشْرَحْ لِى صَدْرِى :: لِى governed by a preposition and صَدْرِى possessive on a noun :: 20:25
@@everyday_1@@ هَذَا كِتَابُهُ :: This is his book — possessive on a noun
@@everyday_2@@ سَأَلَنِي الْمُعَلِّمُ :: The teacher asked me — object on a verb
@@everyday_3@@ لَهَا رَأْيٌ آخَرُ :: She has another opinion — governed by a preposition
@@exercise_1@@ الْمُعَلِّمُ سَأَلَ___ عَنِ الدَّرْسِ :: ـنِي | ـِي | ـهُ :: ـنِي :: a first-person object on a verb takes the protecting nūn :: The teacher asked ___ about the lesson
@@exercise_2@@ قَرَأْتُ كِتَابَ___ :: ـهُ | ـنِي | ـكُمَا :: ـهُ :: a pronoun on a noun is possessive :: I read ___ book
@@exercise_3@@ مَرَرْتُ بِ___ :: ـهُ | ـهِ | ـهَا :: ـهِ :: after a kasrah the pronoun's vowel follows it :: I passed by ___`,

    relative_pronouns: `@@title@@ الأَسْمَاءُ المَوْصُولَةُ
@@subtitle@@ al-asmāʾ al-mawṣūla — the relative pronouns
@@explanation@@ **الَّذِي** and its family introduce a clause that describes a **definite** noun: *the man **who** came*. The pronoun agrees with that noun in gender and number — الَّذِي, الَّتِي, اللَّذَانِ, الَّذِينَ, اللَّاتِي — and the clause that follows must contain a pronoun referring back to it, called the **ʿāʾid**: *alladhī faṭara**nī***.

When the noun described is **indefinite**, Arabic uses no relative pronoun at all; the clause simply follows it. *A man came who spoke* is **جَاءَ رَجُلٌ يَتَكَلَّمُ** — nothing stands between them.

**مَا** and **مَنْ** work as relatives too, without agreement: مَنْ for people, مَا for things, each meaning "the one(s) that".
@@quran_1@@ إِلَّا ٱلَّذِى فَطَرَنِى :: ٱلَّذِى with its ʿāʾid — the ـنِى referring back to it :: 43:27
@@quran_2@@ أَمْ لِلْإِنسَٰنِ مَا تَمَنَّىٰ :: مَا as a relative — "that which he wishes for" :: 53:24
@@quran_3@@ وَٱلْقَلَمِ وَمَا يَسْطُرُونَ :: مَا again, its ʿāʾid understood in the verb :: 68:1
@@everyday_1@@ الطَّالِبُ الَّذِي نَجَحَ مُجْتَهِدٌ :: The student who passed is diligent
@@everyday_2@@ قَرَأْتُ الْكِتَابَ الَّذِي أَعْطَيْتَنِي :: I read the book you gave me
@@everyday_3@@ مَنْ صَبَرَ ظَفِرَ :: Whoever is patient prevails
@@exercise_1@@ الْمُعَلِّمَةُ ___ شَرَحَتِ الدَّرْسَ :: الَّذِي | الَّتِي | الَّذِينَ :: الَّتِي :: the pronoun agrees with a feminine singular noun :: The teacher ___ explained the lesson
@@exercise_2@@ جَاءَ رَجُلٌ ___ يَحْمِلُ رِسَالَةً :: الَّذِي | — | الَّتِي :: — :: an indefinite noun takes no relative pronoun :: A man came ___ carrying a letter
@@exercise_3@@ الطُّلَّابُ ___ حَضَرُوا :: الَّذِي | الَّذِينَ | اللَّاتِي :: الَّذِينَ :: a masculine plural takes الَّذِينَ :: The students ___ attended`,

    broken_plurals: `@@title@@ جَمْعُ التَّكْسِيرِ
@@subtitle@@ jamʿ al-taksīr — the broken plural
@@explanation@@ Most Arabic nouns do not form their plural with a suffix. They are **broken** — re-cast into a different shape entirely: **قَلْب** becomes **قُلُوب**, **كِتَاب** becomes **كُتُب**, **نَهَر** becomes **أَنْهَار**, **رَسُول** becomes **رُسُل**.

The shapes are patterns, not rules you can apply on demand: a word's plural has to be learnt with the word, which is why dictionaries list it. Recognising the common patterns still helps — أَفْعَال, فُعُول, فُعَل, مَفَاعِل — because a shape you have met before is a shape you will meet again.

For agreement, a broken plural of a **non-human** noun is treated as feminine singular: **الْأَنْهَارُ تَجْرِي**, "the rivers flows", not *tajrīna*.
@@quran_1@@ خَتَمَ ٱللَّهُ عَلَىٰ قُلُوبِهِمْ :: قُلُوب, the broken plural of قَلْب on the pattern فُعُول :: 2:7
@@quran_2@@ وَعَلَىٰٓ أَبْصَٰرِهِمْ غِشَٰوَةٌ :: أَبْصَار, the plural of بَصَر on the pattern أَفْعَال :: 2:7
@@quran_3@@ تَجْرِى مِن تَحْتِهَا ٱلْأَنْهَٰرُ :: ٱلْأَنْهَٰر, a non-human plural taking a feminine singular verb :: 13:35
@@everyday_1@@ الْكُتُبُ عَلَى الطَّاوِلَةِ :: The books are on the table
@@everyday_2@@ فِي الْحَدِيقَةِ أَشْجَارٌ كَثِيرَةٌ :: In the garden there are many trees
@@everyday_3@@ الْبُيُوتُ الْقَدِيمَةُ جَمِيلَةٌ :: The old houses are beautiful
@@exercise_1@@ جَمْعُ "قَلْب" هُوَ ___ :: قَلْبَات | قُلُوب | قَالِبُون :: قُلُوب :: qalb takes the broken pattern fuʿūl :: The plural of "heart" is ___
@@exercise_2@@ الْأَنْهَارُ ___ فِي الْوَادِي :: تَجْرِي | يَجْرُونَ | تَجْرِينَ :: تَجْرِي :: a non-human plural agrees as a feminine singular :: The rivers ___ in the valley
@@exercise_3@@ جَمْعُ "بَيْت" هُوَ ___ :: بُيُوت | بَيْتُون | بَيْتَات :: بُيُوت :: bayt takes fuʿūl as well :: The plural of "house" is ___`,

    verb_forms: `@@title@@ أَوْزَانُ الفِعْلِ المَزِيدِ
@@subtitle@@ awzān al-fiʿl al-mazīd — the derived verb forms
@@explanation@@ Beyond the bare three-letter root, Arabic derives verbs in ten patterns, and each carries a settled sense.

**Form II** (فَعَّلَ) doubles the middle letter and intensifies or makes causative: نَجَا "he was saved" → **نَجَّى** "he saved". **Form III** (فَاعَلَ) directs the action at someone. **Form IV** (أَفْعَلَ) causes: خَرَجَ "he went out" → أَخْرَجَ "he brought out". **Form V** and **VI** turn the action back on the doer. **Form VII** and **VIII** are passive or reflexive in sense. **Form X** (اسْتَفْعَلَ) seeks or asks for: فَتَحَ "he opened" → **اسْتَفْتَحَ** "he sought a decision".

Knowing the form tells you half the meaning before you have looked the word up, because the pattern says what the root is doing.
@@quran_1@@ وَنَجَّيْنَٰهُمَا وَقَوْمَهُمَا :: form II — the doubled ج turns "was saved" into "saved" :: 37:115
@@quran_2@@ وَأَلْقَتْ مَا فِيهَا وَتَخَلَّتْ :: form IV أَلْقَى beside form V تَخَلَّى in one ayah :: 84:4
@@quran_3@@ وَٱسْتَفْتَحُوا۟ وَخَابَ كُلُّ جَبَّارٍ عَنِيدٍ :: form X — seeking, from the root فتح :: 14:15
@@everyday_1@@ عَلَّمَ الْمُعَلِّمُ الطُّلَّابَ :: The teacher taught the students — form II
@@everyday_2@@ أَخْرَجَ الْكِتَابَ مِنَ الْحَقِيبَةِ :: He took the book out of the bag — form IV
@@everyday_3@@ اسْتَخْرَجْتُ الْمَعْلُومَاتِ :: I extracted the information — form X
@@exercise_1@@ "عَلَّمَ" عَلَى وَزْنِ ___ :: فَعَّلَ | أَفْعَلَ | اسْتَفْعَلَ :: فَعَّلَ :: the doubled middle letter is form II :: "He taught" is on the pattern ___
@@exercise_2@@ الَّذِي يَدُلُّ عَلَى الطَّلَبِ هُوَ ___ :: فَعَّلَ | تَفَاعَلَ | اسْتَفْعَلَ :: اسْتَفْعَلَ :: form X carries the sense of seeking :: The pattern that means seeking is ___
@@exercise_3@@ "أَكْرَمَ" مِنَ الْوَزْنِ ___ :: الثَّانِي | الرَّابِعِ | الْعَاشِرِ :: الرَّابِعِ :: the prefixed hamzah is form IV :: "He honoured" is form ___`,

    subjunctive: `@@title@@ المُضَارِعُ المَنْصُوبُ
@@subtitle@@ al-muḍāriʿ al-manṣūb — the subjunctive
@@explanation@@ After certain particles the imperfect verb takes the **subjunctive** (manṣūb): the final ḍammah becomes a **fatḥah**, and the plural and dual forms lose their final nūn.

The particles are few and worth memorising as a set: **أَنْ** ("that"), **لَنْ** (an emphatic negative future), **كَيْ** and **لِـ** ("so that"), **حَتَّى** ("until, so that"), and **فَـ** in answer to a command or a negation.

The difference from the jussive is one vowel but not one meaning. **لَنْ يَذْهَبَ** denies the future outright; **لَمْ يَذْهَبْ** — the jussive — denies the past. Choosing the wrong particle changes the tense of the denial, not merely its force.
@@quran_1@@ لِتَعْجَلَ بِهِۦٓ :: لِـ of purpose puts تَعْجَلَ in the subjunctive :: 75:16
@@quran_2@@ أَلَّن نَّجْمَعَ عِظَامَهُۥ :: لَنْ, denying the future — نَّجْمَعَ ends in a fatḥah :: 75:3
@@quran_3@@ وَأَهْدِيَكَ إِلَىٰ رَبِّكَ فَتَخْشَىٰ :: أَنْ carried over, and فَـ in its answer :: 79:19
@@everyday_1@@ أُرِيدُ أَنْ أَتَعَلَّمَ الْعَرَبِيَّةَ :: I want to learn Arabic
@@everyday_2@@ لَنْ أَتَأَخَّرَ غَدًا :: I will not be late tomorrow
@@everyday_3@@ ذَاكَرْتُ كَيْ أَنْجَحَ :: I studied so that I would succeed
@@exercise_1@@ أُرِيدُ أَنْ ___ الْكِتَابَ :: أَقْرَأُ | أَقْرَأَ | أَقْرَأْ :: أَقْرَأَ :: an takes the subjunctive — a fatḥah on the ending :: I want to ___ the book
@@exercise_2@@ لَنْ ___ الطُّلَّابُ :: يَتَأَخَّرُونَ | يَتَأَخَّرُوا | يَتَأَخَّرُونَا :: يَتَأَخَّرُوا :: the plural loses its nūn in the subjunctive :: The students will not ___
@@exercise_3@@ ___ يَنْفَعُ فِي الْمَاضِي هُوَ لَمْ :: لَنْ | لَمْ | كَيْ :: لَمْ :: lan denies the future; lam denies the past :: The particle that denies the past is ___`,

    imperative: `@@title@@ فِعْلُ الأَمْرِ
@@subtitle@@ fiʿl al-amr — the imperative
@@explanation@@ The imperative is built from the **jussive**, and that is the whole of its spelling rule.

Take the imperfect, drop the prefix, and see what is left. If the result begins with a vowelled consonant, you are finished: تَقُولُ → **قُلْ**. If it would begin with a cluster, add a helping **alif** at the front, and give that alif the vowel of the stem: a ḍammah before a ḍammah — تَكْتُبُ → **اكْتُبْ** — and a kasrah otherwise: تَجْلِسُ → **اجْلِسْ**.

The endings are the jussive's endings: a sukūn on the singular, and the loss of the nūn on the plural and dual — **ادْخُلُوا**, not *tadkhulūna*. Prohibition is not the imperative but **لَا** with the jussive: **لَا تَذْهَبْ**.
@@quran_1@@ فَسَبِّحْ بِٱسْمِ رَبِّكَ ٱلْعَظِيمِ :: a form II imperative, ending in a sukūn :: 69:52
@@quran_2@@ ٱدْخُلُوهَا بِسَلَٰمٍ :: the helping alif, and the plural without its nūn :: 50:34
@@quran_3@@ فَٱذْكُرُونِىٓ أَذْكُرْكُمْ :: an imperative whose answer is jussive — أَذْكُرْ :: 2:152
@@everyday_1@@ اكْتُبِ الدَّرْسَ :: Write the lesson
@@everyday_2@@ اجْلِسْ هُنَا مِنْ فَضْلِكَ :: Sit here, please
@@everyday_3@@ لَا تَتَأَخَّرْ عَنِ الْمَوْعِدِ :: Do not be late for the appointment
@@exercise_1@@ أَمْرُ "تَكْتُبُ" هُوَ ___ :: اكْتُبْ | تَكْتُبْ | كَتَبْ :: اكْتُبْ :: drop the prefix and add a helping alif :: The imperative of "you write" is ___
@@exercise_2@@ أَمْرُ "تَقُولُ" هُوَ ___ :: اقْوُلْ | قُلْ | تَقُلْ :: قُلْ :: no helping alif is needed here :: The imperative of "you say" is ___
@@exercise_3@@ النَّهْيُ يُصَاغُ بِـ___ :: لَا وَالْمَجْزُومِ | لَنْ وَالْمَنْصُوبِ | الْأَمْرِ :: لَا وَالْمَجْزُومِ :: prohibition is lā with the jussive :: Prohibition is formed with ___`,

    passive_voice: `@@title@@ الفِعْلُ المَبْنِيُّ لِلْمَجْهُولِ
@@subtitle@@ al-fiʿl al-mabnī li-l-majhūl — the passive
@@explanation@@ The passive names the action without naming its doer. Arabic builds it by changing the verb's **vowels**, not by adding a word.

In the past tense the first letter takes a ḍammah and the letter before the last a kasrah: كَتَبَ → **كُتِبَ**. In the imperfect the prefix takes a ḍammah and the letter before the last a fatḥah: يَكْتُبُ → **يُكْتَبُ**.

What was the object becomes the grammatical subject and turns **marfūʿ** — it is then called the **nāʾib al-fāʿil**, "the deputy of the doer". The doer itself is not mentioned at all: Arabic has no "by…" phrase to reintroduce it, which is precisely why the passive is chosen when the doer is unknown, obvious, or deliberately left aside.
@@quran_1@@ وَبُرِّزَتِ ٱلْجَحِيمُ لِمَن يَرَىٰ :: بُرِّزَتْ passive, and ٱلْجَحِيمُ marfūʿ as its deputy subject :: 79:36
@@quran_2@@ قَدْ أُوتِيتَ سُؤْلَكَ يَٰمُوسَىٰ :: a passive addressed to its deputy subject — "you have been given" :: 20:36
@@quran_3@@ كِتَٰبٌ أُحْكِمَتْ ءَايَٰتُهُۥ ثُمَّ فُصِّلَتْ :: two passives in a row, the doer never named :: 11:1
@@everyday_1@@ كُتِبَ الدَّرْسُ عَلَى السَّبُّورَةِ :: The lesson was written on the board
@@everyday_2@@ فُتِحَ الْبَابُ :: The door was opened
@@everyday_3@@ يُقْرَأُ الْقُرْآنُ فِي رَمَضَانَ :: The Qur'an is recited in Ramadan
@@exercise_1@@ مَبْنِيُّ "كَتَبَ" لِلْمَجْهُولِ هُوَ ___ :: كَتَبَ | كُتِبَ | كَاتَبَ :: كُتِبَ :: ḍammah first, kasrah before the last letter :: The passive of "he wrote" is ___
@@exercise_2@@ فُتِحَ ___ :: الْبَابُ | الْبَابَ | الْبَابِ :: الْبَابُ :: the deputy subject is marfūʿ :: ___ was opened
@@exercise_3@@ مُضَارِعُ الْمَجْهُولِ مِنْ "يَكْتُبُ" هُوَ ___ :: يُكْتَبُ | يَكْتُبُ | يُكْتِبُ :: يُكْتَبُ :: ḍammah on the prefix, fatḥah before the last letter :: The imperfect passive of "he writes" is ___`,

    participles: `@@title@@ اسْمُ الفَاعِلِ وَاسْمُ المَفْعُولِ
@@subtitle@@ ism al-fāʿil wa-ism al-mafʿūl — the two participles
@@explanation@@ The **active participle** (ism al-fāʿil) names the one doing the action; the **passive participle** (ism al-mafʿūl) names the one it is done to.

From the bare three-letter verb they are shaped **فَاعِل** and **مَفْعُول**: كَتَبَ gives **كَاتِب** "writer" and **مَكْتُوب** "written". From the derived forms both take a **مُـ** prefix, and only one vowel separates them — **مُعَلِّم** "teacher" against **مُعَلَّم** "taught", a kasrah against a fatḥah.

Both behave as nouns and as adjectives: they take case endings, they agree with what they describe, and an active participle can govern an object exactly as its verb would — **مُوهِنُ كَيْدِ ٱلْكَافِرِينَ**, "weakening the plot of the disbelievers".
@@quran_1@@ وَأَنَّ ٱللَّهَ مُوهِنُ كَيْدِ ٱلْكَٰفِرِينَ :: an active participle governing an object, as its verb would :: 8:18
@@quran_2@@ عَامِلَةٌ نَّاصِبَةٌ :: two active participles as adjectives — "toiling, weary" :: 88:3
@@quran_3@@ فِى عَمَدٍ مُّمَدَّدَةٍۭ :: a passive participle — columns that are *extended* :: 104:9
@@everyday_1@@ الطَّالِبُ كَاتِبٌ لِلدَّرْسِ :: The student is writing the lesson
@@everyday_2@@ الدَّرْسُ مَكْتُوبٌ عَلَى السَّبُّورَةِ :: The lesson is written on the board
@@everyday_3@@ هُوَ مُعَلِّمٌ مَشْهُورٌ :: He is a well-known teacher
@@exercise_1@@ اسْمُ الْفَاعِلِ مِنْ "كَتَبَ" هُوَ ___ :: كَاتِب | مَكْتُوب | كِتَاب :: كَاتِب :: fāʿil names the doer :: The active participle of "he wrote" is ___
@@exercise_2@@ اسْمُ الْمَفْعُولِ مِنْ "فَتَحَ" هُوَ ___ :: فَاتِح | مَفْتُوح | مِفْتَاح :: مَفْتُوح :: mafʿūl names the one acted upon :: The passive participle of "he opened" is ___
@@exercise_3@@ الْفَرْقُ بَيْنَ "مُعَلِّم" وَ"مُعَلَّم" هُوَ ___ :: حَرَكَةٌ وَاحِدَةٌ | حَرْفٌ زَائِدٌ | الْوَزْنُ :: حَرَكَةٌ وَاحِدَةٌ :: one vowel separates the two participles :: What separates "teacher" from "taught" is ___`,

    negation: `@@title@@ أَدَوَاتُ النَّفْيِ
@@subtitle@@ adawāt al-nafy — the particles of negation
@@explanation@@ Arabic chooses its negative by tense and by force, and the particles are not interchangeable.

**مَا** negates a past verb while leaving its form untouched: **مَا وَدَّعَكَ**. **لَمْ** negates the past too, but by putting an imperfect verb in the **jussive**: **لَمْ يَكُنْ**. **لَنْ** denies the future emphatically, with the **subjunctive**. **لَا** negates a present statement, and with the jussive becomes prohibition. **لَيْسَ** negates a nominal sentence and behaves like كَانَ, leaving the subject marfūʿ and putting the predicate manṣūb.

So four ways to say "he did not go" are not four styles but four claims: about the past, about the future, about now, and about what someone is.
@@quran_1@@ مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ :: مَا with the past verb, its form unchanged :: 93:3
@@quran_2@@ لَا يُؤْمِنُونَ بِهِۦ حَتَّىٰ يَرَوُا۟ ٱلْعَذَابَ :: لَا negating a present :: 26:201
@@quran_3@@ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ :: لَمْ with the jussive — يَكُنْ, its ending a sukūn :: 112:4
@@everyday_1@@ مَا ذَهَبْتُ إِلَى السُّوقِ :: I did not go to the market
@@everyday_2@@ لَنْ أَنْسَى مَعْرُوفَكَ :: I will never forget your kindness
@@everyday_3@@ لَيْسَ الْجَوُّ بَارِدًا :: The weather is not cold
@@exercise_1@@ ___ يَحْضُرِ الطَّالِبُ أَمْسِ :: لَنْ | لَمْ | لَا :: لَمْ :: lam negates the past with a jussive verb :: ___ the student attend yesterday
@@exercise_2@@ ___ أَتَأَخَّرَ غَدًا :: لَمْ | لَنْ | مَا :: لَنْ :: lan denies the future :: I will ___ be late tomorrow
@@exercise_3@@ لَيْسَ الدَّرْسُ ___ :: صَعْبٌ | صَعْبًا | صَعْبٍ :: صَعْبًا :: laysa takes a manṣūb predicate :: The lesson is not ___`,

    conditional: `@@title@@ أُسْلُوبُ الشَّرْطِ
@@subtitle@@ uslūb al-sharṭ — the conditional sentence
@@explanation@@ A conditional pairs a condition (**sharṭ**) with its answer (**jawāb**), and the particle chosen says how likely the speaker thinks it is.

**إِنْ** leaves it open: *if you do*. **إِذَا** treats it as expected: *when you do*. **لَوْ** supposes what did not happen: *had you done*. **مَنْ** and **مَا** condition a person or a thing: *whoever does*.

With **إِنْ** and **مَنْ**, both verbs go into the **jussive** — the condition and the answer alike, which is why **وَمَن يَتَوَكَّلْ** and its answer both end in a sukūn. **إِذَا** and **لَوْ** leave the verbs in the past. The answer takes **فَـ** whenever it is not a plain verb: a nominal sentence, a command, or a future.
@@quran_1@@ إِن كُنتُمْ تَعْلَمُونَ :: إِنْ leaving the condition open :: 23:84
@@quran_2@@ وَمَن يَتَوَكَّلْ عَلَى ٱللَّهِ فَهُوَ حَسْبُهُۥ :: مَنْ with a jussive verb, and فَـ before a nominal answer :: 65:3
@@quran_3@@ لَوْ كَانَ فِيهِمَآ ءَالِهَةٌ إِلَّا ٱللَّهُ لَفَسَدَتَا :: لَوْ supposing what is not so, its answer with لَـ :: 21:22
@@everyday_1@@ إِنْ تَجْتَهِدْ تَنْجَحْ :: If you work hard, you will succeed
@@everyday_2@@ إِذَا جَاءَ الضَّيْفُ فَأَكْرِمْهُ :: When the guest comes, honour him
@@everyday_3@@ لَوْ دَرَسْتَ لَنَجَحْتَ :: Had you studied, you would have passed
@@exercise_1@@ إِنْ ___ تَنْجَحْ :: تَجْتَهِدُ | تَجْتَهِدْ | تَجْتَهِدَ :: تَجْتَهِدْ :: in takes the jussive in both halves :: If you ___, you will succeed
@@exercise_2@@ ___ يَدُلُّ عَلَى امْتِنَاعِ الشَّرْطِ :: إِنْ | إِذَا | لَوْ :: لَوْ :: law supposes what did not happen :: The particle for an unfulfilled condition is ___
@@exercise_3@@ يَقْتَرِنُ الْجَوَابُ بِـالْفَاءِ إِذَا كَانَ ___ :: فِعْلًا مَاضِيًا | جُمْلَةً اسْمِيَّةً | فِعْلًا مُضَارِعًا :: جُمْلَةً اسْمِيَّةً :: fāʾ is needed before a nominal answer :: The answer takes fāʾ when it is ___`,

    comparative: `@@title@@ اسْمُ التَّفْضِيلِ
@@subtitle@@ ism al-tafḍīl — the comparative and superlative
@@explanation@@ One pattern serves for both degrees: **أَفْعَل** — أَكْبَر, أَحْسَن, أَقْوَم. What decides which one is meant is what follows it.

Followed by **مِنْ**, it compares: **أَحْسَنُ مِنْهَا**, "better than it". Made definite with **ال**, or placed as the first term of an **iḍāfa**, it becomes superlative: **أَحْكَمُ الْحَاكِمِينَ**, "the most decisive of judges". In the comparative it stays invariable — masculine singular whatever it describes; in the superlative it agrees.

The feminine of the pattern is **فُعْلَى**: أَكْبَر gives كُبْرَى. And colours and defects take أَفْعَل as their ordinary adjective — أَحْمَر, أَعْمَى — so not every أَفْعَل is a comparative at all.
@@quran_1@@ أَلَيْسَ ٱللَّهُ بِأَحْكَمِ ٱلْحَٰكِمِينَ :: superlative by iḍāfa — "the most decisive of judges" :: 95:8
@@quran_2@@ فَحَيُّوا۟ بِأَحْسَنَ مِنْهَآ :: comparative with مِنْ — "with better than it" :: 4:86
@@quran_3@@ يَهْدِى لِلَّتِى هِىَ أَقْوَمُ :: أَقْوَم, the straightest — superlative in sense :: 17:9
@@everyday_1@@ هَذَا الْكِتَابُ أَكْبَرُ مِنْ ذَاكَ :: This book is bigger than that one
@@everyday_2@@ هُوَ أَنْشَطُ طَالِبٍ فِي الصَّفِّ :: He is the most active student in the class
@@everyday_3@@ الصِّدْقُ أَفْضَلُ مِنَ الْكَذِبِ :: Truthfulness is better than lying
@@exercise_1@@ هَذَا الْبَيْتُ أَكْبَرُ ___ ذَاكَ :: فِي | مِنْ | عَلَى :: مِنْ :: min is what makes it a comparison :: This house is bigger ___ that one
@@exercise_2@@ "أَحْسَنُ الطُّلَّابِ" تَدُلُّ عَلَى ___ :: التَّفْضِيلِ الْمُطْلَقِ | الْمُقَارَنَةِ | اللَّوْنِ :: التَّفْضِيلِ الْمُطْلَقِ :: an iḍāfa makes it superlative :: "The best of the students" expresses ___
@@exercise_3@@ مُؤَنَّثُ "أَكْبَر" هُوَ ___ :: كَبِيرَة | كُبْرَى | أَكْبَرَة :: كُبْرَى :: the feminine of afʿal is fuʿlā :: The feminine of "bigger" is ___`,

    kinaya: `@@title@@ الكِنَايَةُ
@@subtitle@@ al-kināya — saying it by describing something else
@@explanation@@ **Kināya** names a thing by describing something inseparable from it. Unlike a metaphor, the literal meaning stays true — it is simply not the point.

Call someone **كَثِيرُ الرَّمَادِ**, "much of ash", and you have said he cooks constantly for guests: the ashes are real, and generosity is what is meant. Say a man **bites his hands** and you have said he regrets, without the word regret appearing.

Its force is exactly that indirectness. A claim you arrive at yourself lands harder than one handed to you, and describing the sign rather than the thing lets the speaker be vivid where plain words would be blunt or improper. Balāgha classes kināya with metaphor under **ʿilm al-bayān**, the science of the image.
@@quran_1@@ وَيَوْمَ يَعَضُّ ٱلظَّالِمُ عَلَىٰ يَدَيْهِ :: biting the hands — regret, named by its sign :: 25:27
@@quran_2@@ يَوْمَ يُكْشَفُ عَن سَاقٍ :: an idiom for a matter turned grave, said without naming it :: 68:42
@@quran_3@@ وَلَوْ كُنتَ فَظًّا غَلِيظَ ٱلْقَلْبِ :: "thick of heart" for hardness, a quality named through its seat :: 3:159
@@everyday_1@@ فُلَانٌ كَثِيرُ الرَّمَادِ :: So-and-so has much ash — that is, he is generous
@@everyday_2@@ يَدُهُ طَوِيلَةٌ :: His hand is long — he takes what is not his
@@everyday_3@@ نَظِيفُ الْيَدِ :: Clean of hand — honest
@@exercise_1@@ "كَثِيرُ الرَّمَادِ" كِنَايَةٌ عَنْ ___ :: الْكَرَمِ | الْبُخْلِ | الْفَقْرِ :: الْكَرَمِ :: constant cooking implies constant guests :: "Much of ash" stands for ___
@@exercise_2@@ الْفَرْقُ بَيْنَ الْكِنَايَةِ وَالِاسْتِعَارَةِ أَنَّ الْكِنَايَةَ ___ :: يَصِحُّ فِيهَا الْمَعْنَى الْحَقِيقِيُّ | لَا يَصِحُّ | لَا تَحْتَاجُ قَرِينَةً :: يَصِحُّ فِيهَا الْمَعْنَى الْحَقِيقِيُّ :: in kināya the literal sense remains true :: Kināya differs from metaphor in that ___
@@exercise_3@@ الْكِنَايَةُ تُدْرَسُ فِي عِلْمِ ___ :: الْمَعَانِي | الْبَيَانِ | الْبَدِيعِ :: الْبَيَانِ :: it belongs with the sciences of the image :: Kināya is studied within ___`,

    qasr: `@@title@@ القَصْرُ
@@subtitle@@ al-qaṣr — restriction
@@explanation@@ **Qaṣr** confines a quality to one thing and denies it to everything else. It is not emphasis; it is exclusion.

Arabic builds it four ways. By **negation followed by إِلَّا**: *there is no god **but** Him*. By **إِنَّمَا**, which restricts without needing the negative. By **fronting** what would normally come later, as in **إِيَّاكَ نَعْبُدُ**, "**You** we worship". And by **بَلْ** or **لَٰكِنْ**, which correct one term into another.

Grammarians distinguish restricting the quality to its subject from restricting the subject to its quality — *only Zayd writes* against *Zayd only writes* — and the difference is real, because each denies a different thing.
@@quran_1@@ ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ :: negation with إِلَّا, the strongest form of restriction :: 27:26
@@quran_2@@ أَلَّا تَعْبُدُوٓا۟ إِلَّآ إِيَّاهُ :: restriction and fronting together :: 17:23
@@quran_3@@ إِنْ هَٰذَآ إِلَّا خُلُقُ ٱلْأَوَّلِينَ :: إِنْ as a negative, answered by إِلَّا :: 26:137
@@everyday_1@@ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ :: Deeds are only by intentions
@@everyday_2@@ مَا نَجَحَ إِلَّا الْمُجْتَهِدُ :: None succeeded but the diligent
@@everyday_3@@ إِيَّاكَ نَسْأَلُ :: It is You we ask
@@exercise_1@@ "مَا كَتَبَ إِلَّا زَيْدٌ" أُسْلُوبُ ___ :: قَصْرٍ | تَوْكِيدٍ | إِيجَازٍ :: قَصْرٍ :: negation plus illā is restriction :: "None wrote but Zayd" is a style of ___
@@exercise_2@@ أَدَاةُ الْقَصْرِ فِي "إِنَّمَا اللَّهُ إِلَٰهٌ وَاحِدٌ" هِيَ ___ :: إِنَّمَا | إِلَّا | بَلْ :: إِنَّمَا :: innamā restricts without a negative :: The particle of restriction here is ___
@@exercise_3@@ "إِيَّاكَ نَعْبُدُ" قَصْرٌ بِـ___ :: النَّفْيِ | التَّقْدِيمِ | إِنَّمَا :: التَّقْدِيمِ :: fronting the object is itself restriction :: "You we worship" restricts by ___`,

    tawkid: `@@title@@ التَّوْكِيدُ
@@subtitle@@ al-tawkīd — emphasis
@@explanation@@ Arabic raises the certainty of a statement in degrees, and balāgha reads those degrees as answers to the listener's state: a listener with no doubt needs none, a hesitant one needs some, a denying one needs several.

The devices stack. **إِنَّ** asserts; the **lām** of emphasis on the predicate strengthens it further — **إِنَّ الْإِنسَانَ لَفِي خُسْرٍ**. **قَدْ** before a past verb confirms it; **لَقَدْ** more so. The **nūn of emphasis** attaches to a verb — **لَنَسْفَعًا**. An oath prefixes the whole sentence. Repetition, and **إِنَّمَا**, do the same work by other means.

Reading emphasis, then, is reading an argument: how much resistance the speaker expects.
@@quran_1@@ إِنَّ ٱلْإِنسَٰنَ لَفِى خُسْرٍ :: two devices at once — إِنَّ and the lām on the predicate :: 103:2
@@quran_2@@ وَلَقَدْ جَآءَ ءَالَ فِرْعَوْنَ ٱلنُّذُرُ :: لَـ with قَدْ before a past verb :: 54:41
@@quran_3@@ لَئِن لَّمْ يَنتَهِ لَنَسْفَعًۢا بِٱلنَّاصِيَةِ :: an oath's lām and the nūn of emphasis on the verb :: 96:15
@@everyday_1@@ إِنَّ الْعِلْمَ لَنُورٌ :: Knowledge is indeed a light
@@everyday_2@@ قَدْ وَصَلَ الضَّيْفُ :: The guest has indeed arrived
@@everyday_3@@ وَاللَّهِ لَأَجْتَهِدَنَّ :: By God, I will certainly strive
@@exercise_1@@ فِي "إِنَّ الْعِلْمَ لَنَافِعٌ" أَدَاتَا التَّوْكِيدِ هُمَا ___ :: إِنَّ وَاللَّامُ | قَدْ وَالنُّونُ | الْقَسَمُ وَبَلْ :: إِنَّ وَاللَّامُ :: inna and the lām of the predicate :: The two devices here are ___
@@exercise_2@@ نُونُ التَّوْكِيدِ تَتَّصِلُ بِـ___ :: الِاسْمِ | الْفِعْلِ | الْحَرْفِ :: الْفِعْلِ :: the nūn of emphasis attaches to a verb :: The nūn of emphasis attaches to ___
@@exercise_3@@ يَكْثُرُ التَّوْكِيدُ إِذَا كَانَ الْمُخَاطَبُ ___ :: خَالِيَ الذِّهْنِ | مُتَرَدِّدًا | مُنْكِرًا :: مُنْكِرًا :: a denying listener draws the most emphasis :: Emphasis is heaviest when the listener is ___`,

    iltifat: `@@title@@ الِالْتِفَاتُ
@@subtitle@@ al-iltifāt — the turn from one person to another
@@explanation@@ **Iltifāt** is a shift, mid-passage, from one grammatical person to another: third to second, second to third, singular to plural. The referent does not change; only the way of addressing it does.

Its purpose is to move the listener. Turning from speaking *about* someone to speaking *to* them draws them near; turning the other way sets them at a distance, and often at judgement. A shift into the royal plural raises the register of what follows.

Al-Fātiḥah performs it in three verses: praise is offered *about* God — *al-ḥamdu li-Llāh… Mālik* — and then, without warning, addressed *to* Him: **إِيَّاكَ نَعْبُدُ**. The reader who was describing is suddenly speaking.
@@quran_1@@ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ :: the turn from third person to direct address :: 1:5
@@quran_2@@ حَتَّىٰٓ إِذَا كُنتُمْ فِى ٱلْفُلْكِ وَجَرَيْنَ بِهِم :: "you" becomes "them" mid-sentence, and the tone cools with it :: 10:22
@@quran_3@@ وَإِذَا مَرِضْتُ فَهُوَ يَشْفِينِ :: within one speech, illness ascribed to oneself and healing to Him :: 26:80
@@everyday_1@@ الِالْتِفَاتُ يُحَرِّكُ انْتِبَاهَ السَّامِعِ :: Iltifāt stirs the listener's attention
@@everyday_2@@ انْتَقَلَ الْكَلَامُ مِنَ الْغَيْبَةِ إِلَى الْخِطَابِ :: The speech shifted from the third person to direct address
@@everyday_3@@ فِي الِالْتِفَاتِ تَقْرِيبٌ أَوْ تَبْعِيدٌ :: In iltifāt there is drawing near or setting at a distance
@@exercise_1@@ الِالْتِفَاتُ فِي "إِيَّاكَ نَعْبُدُ" مِنَ ___ إِلَى الْخِطَابِ :: الْغَيْبَةِ | التَّكَلُّمِ | الْأَمْرِ :: الْغَيْبَةِ :: the sūrah was speaking about God, then to Him :: The shift here is from ___ to direct address
@@exercise_2@@ الِالْتِفَاتُ يُغَيِّرُ ___ :: الْمَرْجِعَ | أُسْلُوبَ الْخِطَابِ | الْمَعْنَى :: أُسْلُوبَ الْخِطَابِ :: the referent stays the same; the address changes :: Iltifāt changes ___
@@exercise_3@@ مِنْ أَغْرَاضِ الِالْتِفَاتِ ___ :: التَّقْرِيبُ | الْإِيجَازُ | الْقَصْرُ :: التَّقْرِيبُ :: drawing the listener near is one of its purposes :: One purpose of iltifāt is ___`,

    taqdim_takhir: `@@title@@ التَّقْدِيمُ وَالتَّأْخِيرُ
@@subtitle@@ al-taqdīm wa-l-taʾkhīr — fronting and postponement
@@explanation@@ Arabic word order is free enough that moving a word is itself a statement. What comes first is what the sentence is about, or what it insists on.

Fronting an object before its verb restricts: **إِيَّاكَ نَعْبُدُ** does not merely say "we worship You" — it says we worship **You** and no other. Fronting a predicate can express surprise, or specialisation. Fronting a circumstance sets the frame before anything is claimed inside it.

The rule of reading is to ask what the ordinary order would have been, and why this one was chosen instead. Where the answer is "for the rhyme" the device is **badīʿ**; where it is "to restrict, to specialise, to surprise", it belongs to **ʿilm al-maʿānī**, the science of sentence meaning.
@@quran_1@@ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ :: the object fronted before its verb, twice — restriction :: 1:5
@@quran_2@@ وَإِذَا مَرِضْتُ فَهُوَ يَشْفِينِ :: the subject fronted before its verb, specialising the healing to Him :: 26:80
@@quran_3@@ وَلَكُمْ فِى ٱلْقِصَاصِ حَيَوٰةٌ :: the circumstance placed first, before the claim it frames :: 2:179
@@everyday_1@@ لِلَّهِ الْأَمْرُ مِنْ قَبْلُ وَمِنْ بَعْدُ :: To God belongs the command, before and after
@@everyday_2@@ فِي الْبَيْتِ ضَيْفٌ :: In the house is a guest — the circumstance first
@@everyday_3@@ الصِّدْقَ أَحْتَرِمُ :: Truthfulness is what I respect — the object fronted
@@exercise_1@@ تَقْدِيمُ الْمَفْعُولِ فِي "إِيَّاكَ نَعْبُدُ" يُفِيدُ ___ :: الْقَصْرَ | الْإِيجَازَ | التَّشْبِيهَ :: الْقَصْرَ :: fronting the object restricts the worship to Him :: Fronting the object here expresses ___
@@exercise_2@@ التَّقْدِيمُ وَالتَّأْخِيرُ يُدْرَسُ فِي عِلْمِ ___ :: الْمَعَانِي | الْبَيَانِ | الْبَدِيعِ :: الْمَعَانِي :: it is a question of sentence meaning :: Fronting is studied within ___
@@exercise_3@@ الْمُقَدَّمُ فِي الْجُمْلَةِ هُوَ ___ :: الْأَهَمُّ | الْأَطْوَلُ | الْأَخَفُّ :: الْأَهَمُّ :: what is fronted is what matters most :: What is fronted is ___`,

    ijaz: `@@title@@ الإِيجَازُ
@@subtitle@@ al-ījāz — eloquent brevity
@@explanation@@ **Ījāz** is saying much in little, and it comes in two kinds.

**Ījāz al-ḥadhf** leaves out what the listener can supply: a word, a clause, sometimes a whole sentence, recovered from context without effort. **Ījāz al-qiṣar** leaves nothing out but chooses words so exact that no addition would help — the classic instance being **وَلَكُمْ فِي الْقِصَاصِ حَيَاةٌ**, five words on a question that jurists write chapters about.

Brevity is not shortness for its own sake. It is eloquent only where the omitted part is genuinely recoverable and the remainder carries the full weight; where it is not, the same shortness becomes obscurity, and balāgha calls that a fault rather than a merit.
@@quran_1@@ وَلَكُمْ فِى ٱلْقِصَاصِ حَيَوٰةٌ :: ījāz al-qiṣar — a legal principle in five words :: 2:179
@@quran_2@@ فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا :: nothing omitted, nothing spare :: 94:5
@@quran_3@@ إِنَّ ٱللَّهَ يَأْمُرُ بِٱلْعَدْلِ وَٱلْإِحْسَٰنِ :: a whole ethic in a single clause :: 16:90
@@everyday_1@@ خَيْرُ الْكَلَامِ مَا قَلَّ وَدَلَّ :: The best speech is what is brief and says much
@@everyday_2@@ الْإِيجَازُ فِي مَوْضِعِهِ بَلَاغَةٌ :: Brevity in its right place is eloquence
@@everyday_3@@ اسْأَلِ الْقَرْيَةَ :: Ask the town — that is, ask its people
@@exercise_1@@ "وَاسْأَلِ الْقَرْيَةَ" مِنْ إِيجَازِ ___ :: الْحَذْفِ | الْقِصَرِ | التَّكْرَارِ :: الْحَذْفِ :: the omitted word is recovered from context :: "Ask the town" is brevity by ___
@@exercise_2@@ "وَلَكُمْ فِي الْقِصَاصِ حَيَاةٌ" مِنْ إِيجَازِ ___ :: الْحَذْفِ | الْقِصَرِ | الْإِطْنَابِ :: الْقِصَرِ :: nothing is omitted; the words are simply exact :: This ayah is brevity by ___
@@exercise_3@@ يَصِيرُ الْإِيجَازُ عَيْبًا إِذَا ___ :: أَخَلَّ بِالْمَعْنَى | طَالَ | تَكَرَّرَ :: أَخَلَّ بِالْمَعْنَى :: brevity that obscures is a fault :: Brevity becomes a fault when it ___`,

    itnab: `@@title@@ الإِطْنَابُ
@@subtitle@@ al-iṭnāb — purposeful elaboration
@@explanation@@ **Iṭnāb** is the opposite art: adding words on purpose, where the addition carries a meaning that brevity would lose.

Its recognised forms are specific. **Dhikr al-khāṣṣ baʿd al-ʿāmm** names a particular after a general, to single it out. **Al-īḍāḥ baʿd al-ibhām** states a thing obscurely, then clearly, so the clear statement lands twice. **Al-iʿtirāḍ** inserts a phrase between two connected parts. **Al-takrār** repeats — and repetition, placed well, is emphasis rather than waste.

The test is the same as brevity's, reversed: an addition is eloquent when removing it would remove a meaning. Where removing it costs nothing, the passage is merely long, and balāgha calls that **taṭwīl**, not iṭnāb.
@@quran_1@@ إِذْ قَالَ يُوسُفُ لِأَبِيهِ يَٰٓأَبَتِ إِنِّى رَأَيْتُ أَحَدَ عَشَرَ كَوْكَبًا :: the particular named after the general — the sun and moon after the stars :: 12:4
@@quran_2@@ يَٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُوا۟ رَبَّكُمُ ٱلَّذِى خَلَقَكُم مِّن نَّفْسٍ وَٰحِدَةٍ :: the command, then the ground for it, unfolded at length :: 4:1
@@quran_3@@ إِنَّا خَلَقْنَٰكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَٰكُمْ شُعُوبًا وَقَبَآئِلَ :: elaboration that builds the argument step by step :: 49:13
@@everyday_1@@ حَضَرَ الطُّلَّابُ وَزَيْدٌ :: The students came, and Zayd — naming him after the general
@@everyday_2@@ التَّكْرَارُ فِي مَوْضِعِهِ تَوْكِيدٌ :: Repetition in its right place is emphasis
@@everyday_3@@ ذَكَرَ الْمُجْمَلَ ثُمَّ فَصَّلَهُ :: He stated it in summary, then set it out in detail
@@exercise_1@@ ذِكْرُ الْخَاصِّ بَعْدَ الْعَامِّ غَرَضُهُ ___ :: التَّنْبِيهُ عَلَى فَضْلِهِ | الِاخْتِصَارُ | الْقَصْرُ :: التَّنْبِيهُ عَلَى فَضْلِهِ :: naming the particular singles it out for attention :: Naming the particular after the general serves to ___
@@exercise_2@@ الْإِطْنَابُ بِلَا فَائِدَةٍ يُسَمَّى ___ :: التَّطْوِيلَ | الْإِيجَازَ | الْقَصْرَ :: التَّطْوِيلَ :: length with no added meaning is taṭwīl :: Elaboration with no purpose is called ___
@@exercise_3@@ الْإِيضَاحُ بَعْدَ الْإِبْهَامِ يُفِيدُ ___ :: التَّقْرِيرَ فِي النَّفْسِ | الْإِيجَازَ | التَّشْبِيهَ :: التَّقْرِيرَ فِي النَّفْسِ :: saying it twice fixes it in the mind :: Clarity after obscurity serves to ___`,

    munasabah: `@@title@@ المُنَاسَبَةُ
@@subtitle@@ al-munāsaba — how the parts answer one another
@@explanation@@ **Munāsaba** studies the fit between the parts of the Qur'an: between one ayah and the next, between a sūrah's opening and its close, and between a sūrah and the one before it.

The connections take recognisable shapes. An **oath** is followed by what it is sworn upon: **وَالْعَصْرِ** and then **إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ**. A general statement is followed by its exception. A hardship is followed by its relief — and repeated, as in **إِنَّ مَعَ الْعُسْرِ يُسْرًا**, said twice in as many verses. A reminder of past favour grounds a command that follows it.

Reading for munāsaba changes what a verse means: placed beside its neighbour, it is answering something, and the answer is part of the sense.
@@quran_1@@ وَٱلْعَصْرِ :: the oath — whose answer is the ayah immediately after it :: 103:1
@@quran_2@@ إِنَّ ٱلْإِنسَٰنَ لَفِى خُسْرٍ :: the answer to that oath, and the claim the sūrah then qualifies :: 103:2
@@quran_3@@ إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا :: relief stated, then stated again — the repetition is the connection :: 94:6
@@everyday_1@@ لِكُلِّ آيَةٍ مَا قَبْلَهَا وَمَا بَعْدَهَا :: Every ayah has what precedes and what follows it
@@everyday_2@@ الْقَسَمُ يَتْبَعُهُ جَوَابُهُ :: An oath is followed by its answer
@@everyday_3@@ الْعَامُّ يَتْبَعُهُ اسْتِثْنَاؤُهُ :: The general is followed by its exception
@@exercise_1@@ جَوَابُ الْقَسَمِ فِي "وَالْعَصْرِ" هُوَ ___ :: إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ | إِلَّا الَّذِينَ آمَنُوا | وَالْعَصْرِ :: إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ :: the answer follows the oath immediately :: The answer to the oath in "By the declining day" is ___
@@exercise_2@@ الْمُنَاسَبَةُ تَبْحَثُ فِي ___ :: ارْتِبَاطِ الْآيَاتِ | إِعْرَابِ الْكَلِمَاتِ | وَزْنِ الْفِعْلِ :: ارْتِبَاطِ الْآيَاتِ :: munāsaba studies how verses connect :: Munāsaba examines ___
@@exercise_3@@ تَكْرَارُ "إِنَّ مَعَ الْعُسْرِ يُسْرًا" يُفِيدُ ___ :: التَّوْكِيدَ | الْقَصْرَ | التَّشْبِيهَ :: التَّوْكِيدَ :: the repetition emphasises the promise :: The repetition of that verse serves ___`,

    saj: `@@title@@ السَّجْعُ
@@subtitle@@ al-sajʿ — rhythmic prose
@@explanation@@ **Sajʿ** is prose whose clauses end on a shared sound. It is not poetry — there is no metre — but the ear hears the pattern and the passage binds together.

The early Meccan sūrahs are its great instance: short verses closing on the same rhyme, often the same syllable, so that a passage arrives like a series of blows. **وَالْفَجْرِ**, **وَالْعَادِيَاتِ ضَبْحًا**, **وَالنَّجْمِ إِذَا هَوَى** — each opens a sūrah with an oath, and the rhyme carries through what follows.

Balāgha counts sajʿ among the **badīʿ**, the ornaments, and judges it by one rule: the sense must lead and the sound follow. Where a word is chosen for its ending rather than its meaning, the ornament has become a fault — **takalluf**, contrivance.
@@quran_1@@ وَٱلْفَجْرِ :: an opening oath whose rhyme sets the sūrah's cadence :: 89:1
@@quran_2@@ وَٱلْعَٰدِيَٰتِ ضَبْحًا :: the sound of the words imitating what they describe :: 100:1
@@quran_3@@ وَٱلنَّجْمِ إِذَا هَوَىٰ :: a short verse closing on the rhyme the sūrah keeps :: 53:1
@@everyday_1@@ السَّجْعُ زِينَةُ الْكَلَامِ لَا أَصْلُهُ :: Sajʿ is the ornament of speech, not its substance
@@everyday_2@@ تَتَّفِقُ الْفَوَاصِلُ فِي الْحَرْفِ الْأَخِيرِ :: The clause-endings agree in their final letter
@@everyday_3@@ إِذَا تُكُلِّفَ السَّجْعُ ذَهَبَ الْمَعْنَى :: When sajʿ is forced, the meaning is lost
@@exercise_1@@ السَّجْعُ يَكُونُ فِي ___ :: النَّثْرِ | الشِّعْرِ | الْإِعْرَابِ :: النَّثْرِ :: sajʿ is a feature of prose, not verse :: Sajʿ occurs in ___
@@exercise_2@@ السَّجْعُ يُدْرَسُ فِي عِلْمِ ___ :: الْبَدِيعِ | الْمَعَانِي | الْبَيَانِ :: الْبَدِيعِ :: it is an ornament of sound :: Sajʿ is studied within ___
@@exercise_3@@ يُعَابُ السَّجْعُ إِذَا ___ :: تُكُلِّفَ | قَصُرَ | تَكَرَّرَ :: تُكُلِّفَ :: forced rhyme puts sound above sense :: Sajʿ is faulted when it is ___`,
};

/** Whether a shipped lesson exists for this topic. */
export function hasPremadeLesson(topicId: string): boolean {
    return topicId in PREMADE_LESSONS;
}
