/**
 * Language-specific formatting and style rules
 */
console.log('[LOAD] languagePacks.js');

export const languagePacks = {
  'uk-UA': {
    name: 'Ukrainian',
    rules: `- Use Ukrainian quotes: « » for main quotes, „ " for nested
- Dialogue starts on new line with long dash (—), no quotes around dialogue
- Always use comma before "що", "але", "проте"
- Avoid calques from English or Russian
- Natural Ukrainian word order and idioms
- Use appropriate cases and verb aspects`,
    timeBridges: ['Тієї ж ночі', 'За годину', 'Наступного дня', 'Увечері', 'Того ж ранку', 'Через день', 'У неділю зранку', 'За тиждень', 'Минуло два дні', 'О третій годині', 'Того вечора', 'Вранці'],
    stopwords: ['я', 'ти', 'він', 'вона', 'воно', 'ми', 'ви', 'вони', 'мій', 'твій', 'його', 'її', 'наш', 'ваш', 'їх', 'і', 'а', 'та', 'або', 'але', 'в', 'у', 'на', 'з', 'до', 'від', 'для', 'про', 'по', 'за', 'під', 'над', 'при', 'є', 'був', 'була', 'було', 'були', 'буде', 'будуть', 'бути', 'це', 'той', 'та', 'ті', 'цей', 'ця', 'ці', 'що', 'хто', 'який', 'яка', 'які', 'коли', 'де', 'чому', 'як', 'не', 'ні', 'так', 'сказав', 'сказала', 'казати'],
    globalBannedBigrams: [
      'я відчув', 'я не', 'моє серце', 'на мить', 'я зрозумів',
      'я знав', 'це було', 'було так', 'і я', 'але я',
      'до мене', 'зі мною', 'в тому', 'на тому'
    ],
    bannedPhrasesRomance: [
      'серце завмерло', 'я не помітив як затамував подих',
      'час ніби зупинився', 'здавалося вічністю', 'наче повернувся додому'
    ]
  },

  'pl-PL': {
    name: 'Polish',
    rules: `- Use Polish quotes: „ " for main quotes
- Dialogue with dash (–) at line start
- Natural Polish collocations and idioms
- Avoid anglicisms, use native Polish equivalents
- Proper use of Polish cases and aspects
- Appropriate formal/informal register (ty/Pan)`,
    timeBridges: ['Tej samej nocy', 'Godzinę później', 'Następnego dnia', 'Wieczorem', 'Tego samego ranka', 'Dwa dni później', 'W niedzielę rano', 'Tydzień później', 'Minęły dwa dni', 'O trzeciej', 'Tego wieczoru', 'Rano'],
    stopwords: ['ja', 'ty', 'on', 'ona', 'ono', 'my', 'wy', 'oni', 'mój', 'twój', 'jego', 'jej', 'nasz', 'wasz', 'ich', 'i', 'a', 'lub', 'ale', 'w', 'na', 'z', 'do', 'od', 'dla', 'o', 'po', 'za', 'pod', 'nad', 'przy', 'jest', 'był', 'była', 'było', 'byli', 'będzie', 'będą', 'być', 'to', 'ten', 'ta', 'ci', 'ten', 'ta', 'te', 'co', 'kto', 'który', 'która', 'które', 'kiedy', 'gdzie', 'dlaczego', 'jak', 'nie', 'tak', 'powiedział', 'powiedziała', 'mówić'],
    globalBannedBigrams: [
      'czułem że', 'nie wiedziałem', 'moje serce', 'przez chwilę',
      'zrozumiałem że', 'wiedziałem że', 'to było', 'było tak', 'i ja', 'ale ja',
      'do mnie', 'ze mną', 'w tym', 'na tym'
    ],
    bannedPhrasesRomance: [
      'serce zabiło mocniej', 'nie wiedziałem że wstrzymuję oddech',
      'czas jakby się zatrzymał', 'wydawało się wiecznością', 'jak powrót do domu'
    ]
  },

  'en-US': {
    name: 'English (US)',
    rules: `- Use standard double quotes: " " for dialogue
- American spelling (color, realize, etc.)
- Clear, accessible syntax
- Active voice preferred
- Varied sentence structure
- Natural contemporary idioms`,
    timeBridges: ['Later that night', 'An hour later', 'The next day', 'That evening', 'That same morning', 'Two days later', 'Sunday morning', 'A week later', 'By three o\'clock', 'That night', 'The following morning'],
    stopwords: ['i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'that', 'this', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'not', 'no', 'yes', 'said', 'tell', 'told'],
    globalBannedBigrams: [
      'i felt', 'i didn\'t', 'i don\'t', 'my heart', 'for a moment',
      'i realized', 'i knew', 'it was', 'there was', 'and i', 'but i',
      'to me', 'with me', 'in the', 'on the', 'at the', 'of the'
    ],
    bannedPhrasesRomance: [
      'my heart skipped a beat', 'i didn\'t know i was holding my breath',
      'time seemed to stop', 'it felt like forever', 'like coming home',
      'electricity between us', 'butterflies in my stomach', 'lost in his/her eyes'
    ]
  },

  'de-DE': {
    name: 'German',
    rules: `- Use German quotes: „ " or « »
- Proper word order with verb positions
- Natural German compound words
- Avoid English calques
- Appropriate formal/informal (du/Sie)
- Correct case usage (Nominativ, Akkusativ, Dativ, Genitiv)`,
    timeBridges: ['Noch in derselben Nacht', 'Eine Stunde später', 'Am nächsten Tag', 'Am Abend', 'Am selben Morgen', 'Zwei Tage später', 'Sonntagmorgen', 'Eine Woche später', 'Um drei Uhr', 'In der Nacht', 'Am folgenden Morgen'],
    stopwords: ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'und', 'oder', 'aber', 'in', 'an', 'auf', 'zu', 'von', 'für', 'mit', 'bei', 'nach', 'vor', 'über', 'unter', 'ist', 'war', 'waren', 'wird', 'werden', 'sein', 'haben', 'hat', 'hatte', 'das', 'der', 'die', 'den', 'dem', 'des', 'ein', 'eine', 'was', 'wer', 'welche', 'welcher', 'wann', 'wo', 'warum', 'wie', 'nicht', 'nein', 'ja', 'sagte', 'sagen'],
    globalBannedBigrams: [
      'ich fühlte', 'ich wusste nicht', 'mein herz', 'für einen moment',
      'ich erkannte', 'ich wusste', 'es war', 'da war', 'und ich', 'aber ich',
      'zu mir', 'mit mir', 'in dem', 'auf dem'
    ],
    bannedPhrasesRomance: [
      'mein herz machte einen sprung', 'ich wusste nicht dass ich den atem anhielt',
      'die zeit schien stillzustehen', 'es fühlte sich wie eine ewigkeit an', 'wie nach hause kommen'
    ]
  },

  'pt-BR': {
    name: 'Portuguese (Brazilian)',
    rules: `- Use Brazilian Portuguese quotes: " " or « »
- Natural Brazilian idioms and expressions
- Appropriate formal/informal pronouns (você/tu)
- Brazilian spelling (não vs non, etc.)
- Dialogue with travessão (—) at line start
- Avoid Portugal Portuguese forms`,
    timeBridges: ['Naquela mesma noite', 'Uma hora depois', 'No dia seguinte', 'À noite', 'Naquela manhã', 'Dois dias depois', 'No domingo de manhã', 'Uma semana depois', 'Às três horas', 'Naquela tarde', 'Na manhã seguinte'],
    stopwords: ['eu', 'tu', 'você', 'ele', 'ela', 'nós', 'vocês', 'eles', 'meu', 'teu', 'seu', 'nosso', 'vosso', 'e', 'ou', 'mas', 'em', 'no', 'na', 'para', 'por', 'com', 'sem', 'de', 'do', 'da', 'ao', 'à', 'é', 'era', 'foi', 'ser', 'estar', 'ter', 'o', 'a', 'os', 'as', 'um', 'uma', 'que', 'quem', 'qual', 'quando', 'onde', 'como', 'não', 'sim', 'disse', 'dizer'],
    globalBannedBigrams: [
      'eu senti', 'eu não', 'meu coração', 'por um momento',
      'eu percebi', 'eu sabia', 'era assim', 'foi assim', 'e eu', 'mas eu',
      'para mim', 'comigo', 'naquele', 'naquela'
    ],
    bannedPhrasesRomance: [
      'meu coração disparou', 'eu não sabia que estava prendendo a respiração',
      'o tempo parecia parar', 'parecia uma eternidade', 'como voltar para casa'
    ]
  },

  'es-ES': {
    name: 'Spanish (Spain)',
    rules: `- Use Spanish quotes: « » or " "
- Dialogue with raya (—) at line start
- Natural Spanish idioms (no Latin American forms)
- Proper use of subjunctive mood
- Formal/informal distinction (tú/usted)
- Spanish punctuation (¿? and ¡!)`,
    timeBridges: ['Esa misma noche', 'Una hora después', 'Al día siguiente', 'Por la noche', 'Aquella mañana', 'Dos días después', 'El domingo por la mañana', 'Una semana después', 'A las tres', 'Aquella tarde', 'A la mañana siguiente'],
    stopwords: ['yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos', 'mi', 'tu', 'su', 'nuestro', 'vuestro', 'y', 'o', 'pero', 'en', 'a', 'de', 'para', 'por', 'con', 'sin', 'es', 'era', 'fue', 'ser', 'estar', 'tener', 'el', 'la', 'los', 'las', 'un', 'una', 'que', 'quien', 'cual', 'cuando', 'donde', 'como', 'no', 'sí', 'dijo', 'decir'],
    globalBannedBigrams: [
      'yo sentí', 'yo no', 'mi corazón', 'por un momento',
      'me di cuenta', 'yo sabía', 'era así', 'fue así', 'y yo', 'pero yo',
      'a mí', 'conmigo', 'en aquel', 'en aquella'
    ],
    bannedPhrasesRomance: [
      'mi corazón dio un vuelco', 'no sabía que estaba conteniendo la respiración',
      'el tiempo pareció detenerse', 'parecía una eternidad', 'como volver a casa'
    ]
  },

  'ja-JP': {
    name: 'Japanese',
    rules: `- Use proper Japanese particles (は、が、を、に、で、と)
- Natural Japanese sentence structure (SOV)
- Appropriate politeness levels (です・ます vs だ・である)
- Japanese quotation marks: 「」 for quotes, 『』 for nested
- No spaces between words (連続した文字)
- Use kanji, hiragana, katakana appropriately`,
    timeBridges: ['その夜', '一時間後', '翌日', '夕方', 'その朝', '二日後', '日曜日の朝', '一週間後', '三時に', 'その午後', '翌朝'],
    stopwords: ['私', 'あなた', '彼', '彼女', 'それ', '我々', 'あなたたち', '彼ら', '私の', 'あなたの', '彼の', '彼女の', 'そして', 'または', 'でも', 'が', 'を', 'に', 'で', 'と', 'から', 'まで', 'の', 'は', 'です', 'だ', 'である', 'でした', 'だった', 'これ', 'あれ', 'どれ', 'いつ', 'どこ', 'なぜ', 'どう', 'ない', 'はい', 'いいえ', '言った', '言う'],
    globalBannedBigrams: [
      '私は感じた', '私はわからなかった', '私の心', '一瞬',
      '私は気づいた', '私は知っていた', 'そうだった', 'そうだ', 'そして私', 'でも私',
      '私に', '私と', 'その中', 'その上'
    ],
    bannedPhrasesRomance: [
      '心臓が高鳴った', '息を止めていることに気づかなかった',
      '時が止まったようだった', '永遠のように感じた', '家に帰るような'
    ]
  },

  'ru-RU': {
    name: 'Russian',
    rules: `- Use Russian quotes: « » for main quotes, „ " for nested
- Dialogue with dash (—) at line start, no quotes
- Natural Russian word order and cases
- Proper aspect usage (perfective/imperfective)
- Avoid calques from English or Ukrainian
- Use appropriate register (ты/вы)`,
    timeBridges: ['В ту же ночь', 'Час спустя', 'На следующий день', 'Вечером', 'Тем же утром', 'Через два дня', 'В воскресенье утром', 'Через неделю', 'В три часа', 'Тем вечером', 'Наутро'],
    stopwords: ['я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'мой', 'твой', 'его', 'её', 'наш', 'ваш', 'их', 'и', 'а', 'или', 'но', 'в', 'на', 'с', 'к', 'от', 'для', 'о', 'по', 'за', 'под', 'над', 'при', 'есть', 'был', 'была', 'было', 'были', 'будет', 'будут', 'быть', 'это', 'тот', 'та', 'те', 'этот', 'эта', 'эти', 'что', 'кто', 'который', 'которая', 'которые', 'когда', 'где', 'почему', 'как', 'не', 'нет', 'да', 'сказал', 'сказала', 'говорить'],
    globalBannedBigrams: [
      'я почувствовал', 'я не', 'моё сердце', 'на мгновение',
      'я понял', 'я знал', 'это было', 'было так', 'и я', 'но я',
      'ко мне', 'со мной', 'в том', 'на том'
    ],
    bannedPhrasesRomance: [
      'сердце екнуло', 'я не заметил как затаил дыхание',
      'время словно остановилось', 'казалось вечностью', 'словно вернулся домой'
    ]
  },

  'fr-FR': {
    name: 'French',
    rules: `- Use French quotes: « » with spaces
- Natural French word order and syntax
- Proper use of subjunctive mood
- Formal/informal distinction (tu/vous)
- French punctuation rules
- Avoid anglicisms`,
    timeBridges: ['Cette nuit-là', 'Une heure plus tard', 'Le lendemain', 'Le soir', 'Ce matin-là', 'Deux jours plus tard', 'Dimanche matin', 'Une semaine plus tard', 'À trois heures', 'Ce soir-là', 'Le matin suivant'],
    stopwords: ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'et', 'ou', 'mais', 'dans', 'sur', 'à', 'de', 'pour', 'par', 'avec', 'sans', 'est', 'était', 'être', 'avoir', 'le', 'la', 'les', 'un', 'une', 'que', 'qui', 'quel', 'quand', 'où', 'comment', 'ne', 'non', 'oui', 'dit', 'dire'],
    globalBannedBigrams: [
      'je sentais', 'je ne', 'mon cœur', 'pour un moment',
      'je réalisais', 'je savais', 'c\'était', 'il y avait', 'et je', 'mais je',
      'à moi', 'avec moi', 'dans le', 'sur le'
    ],
    bannedPhrasesRomance: [
      'mon cœur a bondi', 'je ne savais pas que je retenais mon souffle',
      'le temps semblait s\'arrêter', 'ça semblait une éternité', 'comme rentrer à la maison'
    ]
  },

  'it-IT': {
    name: 'Italian',
    rules: `- Use Italian quotes: « » or " "
- Natural Italian syntax and word order
- Proper use of subjunctive mood
- Formal/informal distinction (tu/Lei)
- Italian punctuation
- Avoid foreign expressions`,
    timeBridges: ['Quella notte', 'Un\'ora dopo', 'Il giorno dopo', 'Quella sera', 'Quella mattina', 'Due giorni dopo', 'Domenica mattina', 'Una settimana dopo', 'Alle tre', 'Quella sera', 'La mattina seguente'],
    stopwords: ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'mio', 'tuo', 'suo', 'nostro', 'vostro', 'e', 'o', 'ma', 'in', 'su', 'a', 'di', 'per', 'con', 'da', 'è', 'era', 'essere', 'avere', 'il', 'la', 'i', 'le', 'un', 'una', 'che', 'chi', 'quale', 'quando', 'dove', 'come', 'non', 'no', 'sì', 'disse', 'dire'],
    globalBannedBigrams: [
      'ho sentito', 'io non', 'il mio cuore', 'per un momento',
      'ho capito', 'sapevo', 'era così', 'c\'era', 'e io', 'ma io',
      'a me', 'con me', 'nel', 'sul'
    ],
    bannedPhrasesRomance: [
      'il mio cuore ha fatto un salto', 'non sapevo che stavo trattenendo il respiro',
      'il tempo sembrava fermarsi', 'sembrava un\'eternità', 'come tornare a casa'
    ]
  },

  'zh-CN': {
    name: 'Chinese (Simplified)',
    rules: `- Use Chinese quotation marks: 「」 or ""
- Natural Chinese sentence structure
- Proper use of particles and measure words
- Appropriate formal/informal register
- No spaces between characters
- Use simplified characters`,
    timeBridges: ['当晚', '一小时后', '第二天', '那天晚上', '那天早上', '两天后', '周日早晨', '一周后', '三点钟', '那天下午', '第二天早晨'],
    stopwords: ['我', '你', '他', '她', '它', '我们', '你们', '他们', '的', '了', '在', '是', '不', '和', '与', '或', '但', '这', '那', '什么', '谁', '哪', '何时', '哪里', '为什么', '怎么', '没有', '有', '说', '讲'],
    globalBannedBigrams: [
      '我感到', '我不', '我的心', '一瞬间',
      '我意识到', '我知道', '那是', '有一个', '而我', '但我',
      '对我', '和我', '在那', '在这'
    ],
    bannedPhrasesRomance: [
      '我的心跳加速', '我不知道我屏住了呼吸',
      '时间似乎停止了', '感觉像永恒', '就像回家一样'
    ]
  },

  'ko-KR': {
    name: 'Korean',
    rules: `- Use Korean quotation marks: " " or 「 」
- Natural Korean syntax (SOV)
- Proper use of honorifics and particles
- Appropriate formal/informal register
- No spaces in compound words
- Use hangul, avoid excessive hanja`,
    timeBridges: ['그날 밤', '한 시간 후', '다음 날', '그날 저녁', '그날 아침', '이틀 후', '일요일 아침', '일주일 후', '세 시에', '그날 오후', '다음 날 아침'],
    stopwords: ['나', '너', '그', '그녀', '우리', '너희', '그들', '내', '네', '그의', '그녀의', '우리의', '와', '과', '또는', '하지만', '에', '에서', '를', '을', '이', '가', '의', '은', '는', '이다', '있다', '없다', '하다', '되다', '이', '그', '저', '무엇', '누구', '어느', '언제', '어디', '왜', '어떻게', '아니', '네', '말했다', '말하다'],
    globalBannedBigrams: [
      '나는 느꼈다', '나는 아니', '내 심장', '순간',
      '나는 깨달았다', '나는 알았다', '그것은', '있었다', '그리고 나는', '하지만 나는',
      '나에게', '나와', '그 안에', '그 위에'
    ],
    bannedPhrasesRomance: [
      '내 심장이 뛰었다', '나는 숨을 참고 있는지 몰랐다',
      '시간이 멈춘 것 같았다', '영원처럼 느껴졌다', '집에 온 것 같았다'
    ]
  },

  'ar-SA': {
    name: 'Arabic',
    rules: `- Use Arabic quotation marks: « » or " "
- Right-to-left text direction
- Natural Arabic syntax (VSO or SVO)
- Proper use of case endings (i'rab)
- Formal/informal distinction
- Arabic punctuation`,
    timeBridges: ['في تلك الليلة', 'بعد ساعة', 'في اليوم التالي', 'في المساء', 'في ذلك الصباح', 'بعد يومين', 'صباح الأحد', 'بعد أسبوع', 'في الساعة الثالثة', 'في ذلك المساء', 'في الصباح التالي'],
    stopwords: ['أنا', 'أنت', 'هو', 'هي', 'نحن', 'أنتم', 'هم', 'في', 'على', 'إلى', 'من', 'عن', 'مع', 'هذا', 'ذلك', 'ما', 'من', 'أين', 'متى', 'كيف', 'لماذا', 'لا', 'نعم', 'قال', 'يقول'],
    globalBannedBigrams: [
      'شعرت أن', 'لم أكن', 'قلبي', 'للحظة',
      'أدركت أن', 'كنت أعلم', 'كان ذلك', 'كان هناك', 'وأنا', 'لكنني',
      'لي', 'معي', 'في ذلك', 'على ذلك'
    ],
    bannedPhrasesRomance: [
      'قلبي ينبض بسرعة', 'لم أكن أعلم أنني أحبس أنفاسي',
      'بدا الوقت يتوقف', 'بدا وكأنه الأبدية', 'مثل العودة إلى المنزل'
    ]
  },

  'th-TH': {
    name: 'Thai',
    rules: `- Use Thai quotation marks: " " or ' '
- Natural Thai syntax
- Proper use of particles and classifiers
- Appropriate formal/informal register
- No spaces between words (continuous script)
- Use Thai script`,
    timeBridges: ['ในคืนนั้น', 'หนึ่งชั่วโมงต่อมา', 'วันรุ่งขึ้น', 'ตอนเย็น', 'ตอนเช้าวันนั้น', 'สองวันต่อมา', 'เช้าวันอาทิตย์', 'หนึ่งสัปดาห์ต่อมา', 'ตอนบ่ายสามโมง', 'ตอนเย็นวันนั้น', 'เช้าวันรุ่งขึ้น'],
    stopwords: ['ฉัน', 'คุณ', 'เขา', 'เธอ', 'พวกเรา', 'พวกคุณ', 'พวกเขา', 'ของฉัน', 'ของคุณ', 'ของเขา', 'และ', 'หรือ', 'แต่', 'ใน', 'บน', 'ที่', 'จาก', 'กับ', 'เป็น', 'คือ', 'มี', 'ไม่', 'ใช่', 'ไม่ใช่', 'พูด', 'บอก'],
    globalBannedBigrams: [
      'ฉันรู้สึก', 'ฉันไม่', 'หัวใจฉัน', 'ชั่วขณะ',
      'ฉันตระหนัก', 'ฉันรู้', 'มันเป็น', 'มี', 'และฉัน', 'แต่ฉัน',
      'กับฉัน', 'ในนั้น', 'บนนั้น'
    ],
    bannedPhrasesRomance: [
      'หัวใจเต้นแรง', 'ฉันไม่รู้ว่าฉันกำลังกลั้นหายใจ',
      'เวลาดูเหมือนจะหยุด', 'รู้สึกเหมือนนิรันดร์', 'เหมือนกลับบ้าน'
    ]
  },

  'tr-TR': {
    name: 'Turkish',
    rules: `- Use Turkish quotation marks: " " or « »
- Natural Turkish syntax (SOV)
- Proper use of vowel harmony
- Appropriate formal/informal register (sen/siz)
- Turkish punctuation
- Avoid foreign loan words when Turkish equivalents exist`,
    timeBridges: ['O gece', 'Bir saat sonra', 'Ertesi gün', 'Akşam', 'O sabah', 'İki gün sonra', 'Pazar sabahı', 'Bir hafta sonra', 'Saat üçte', 'O akşam', 'Ertesi sabah'],
    stopwords: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'benim', 'senin', 'onun', 've', 'veya', 'ama', 'fakat', 'içinde', 'üzerinde', 'için', 'ile', 'den', 'dan', 'bir', 'bu', 'şu', 'o', 'ne', 'kim', 'hangi', 'nerede', 'ne zaman', 'nasıl', 'neden', 'değil', 'hayır', 'evet', 'dedi', 'demek'],
    globalBannedBigrams: [
      'hissettim ki', 'ben değil', 'kalbim', 'bir an için',
      'fark ettim', 'biliyordum', 'öyleydi', 'vardı', 've ben', 'ama ben',
      'bana', 'benimle', 'o içinde', 'o üzerinde'
    ],
    bannedPhrasesRomance: [
      'kalbim hızla attı', 'nefesimi tuttuğumu bilmiyordum',
      'zaman durmuş gibiydi', 'sonsuzluk gibi hissettirdi', 'eve dönmek gibi'
    ]
  }
};

export function getLanguagePack(languageCode) {
  const pack = languagePacks[languageCode];
  if (!pack) {
    throw new Error(`Language pack not found: ${languageCode}`);
  }
  return pack;
}
