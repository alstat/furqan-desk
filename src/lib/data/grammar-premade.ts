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
};

/** Whether a shipped lesson exists for this topic. */
export function hasPremadeLesson(topicId: string): boolean {
    return topicId in PREMADE_LESSONS;
}
