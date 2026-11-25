import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type AppLocale = 'en' | 'fa'

const STORAGE_KEY = 'english-upgrade-locale'
const locale = ref<AppLocale>(readLocale())

/** Static interface copy shared by the views. Learning content is deliberately not here. */
const staticTranslations: Record<string, string> = {
    'Good morning': 'صبح بخیر',
    'Good afternoon': 'بعدازظهر بخیر',
    'Good evening': 'عصر بخیر',
    'day streak': 'روز پیوسته',
    'days in a row': 'روز پشت‌سرهم',
    'Today': 'امروز',
    'In progress': 'در حال انجام',
    "Today's journey": 'مسیر امروز',
    'Pick up where you left off': 'از همان‌جا که متوقف شدید ادامه دهید',
    'Learn it, recall it, then use it': 'یاد بگیرید، به یاد بیاورید، سپس استفاده کنید',
    'activities done': 'فعالیت انجام شده',
    'about': 'حدود',
    'minutes in total.': 'دقیقه در مجموع.',
    'A session built around what you need today: recognition, retrieval, and real sentences. 5, 18 or 40 minutes.': 'جلسه‌ای بر اساس نیاز امروز شما: تشخیص، یادآوری و جمله‌های واقعی. ۵، ۱۸ یا ۴۰ دقیقه.',
    "Start today's journey": 'شروع مسیر امروز',
    'Resume journey': 'ادامه مسیر',
    'Spaced review': 'مرور فاصله‌دار',
    'word ready for review. Short reviews keep them in memory.': 'واژه آماده مرور است. مرورهای کوتاه آن را در حافظه نگه می‌دارند.',
    'words ready for review. Short reviews keep them in memory.': 'واژه آماده مرور هستند. مرورهای کوتاه آن‌ها را در حافظه نگه می‌دارند.',
    'Nothing due — your reviews are up to date.': 'موردی برای مرور نیست — مرورهای شما به‌روز است.',
    'No words due for review yet — this session will introduce new vocabulary.': 'هنوز واژه‌ای برای مرور نیست — این جلسه واژه‌های جدید معرفی می‌کند.',
    'Next steps': 'گام‌های بعدی',
    'Continue learning': 'ادامه یادگیری',
    'Expression': 'عبارت',
    'of': 'از',
    'Browse all lessons': 'مشاهده همه درس‌ها',
    'Browse lessons': 'مشاهده درس‌ها',
    'Recommended for you': 'پیشنهاد برای شما',
    'min': 'دقیقه',
    'No words tracked yet': 'هنوز واژه‌ای ثبت نشده است',
    'Words appear here once you practise them. Open a lesson, then practise it.': 'پس از تمرین واژه‌ها اینجا نمایش داده می‌شوند. یک درس باز کنید و آن را تمرین کنید.',
    'Open a lesson': 'باز کردن یک درس',
    'words tracked': 'واژه ثبت شده',
    'Answer accuracy': 'دقت پاسخ‌ها',
    'Mastered': 'تسلط‌یافته',
    'Recent activity': 'فعالیت اخیر',
    'No activity yet': 'هنوز فعالیتی وجود ندارد',
    'Finish an exercise and it shows up here.': 'یک تمرین را تمام کنید تا اینجا نمایش داده شود.',
    'Correct': 'درست',
    'Needs review': 'نیازمند مرور',
    'Quick access': 'دسترسی سریع',
    'Hard words': 'واژه‌های دشوار',
    'Speaking': 'گفتار',
    'Progress': 'پیشرفت',
    'No lesson in progress. Open one to start building your vocabulary.': 'هنوز درسی در حال انجام نیست. برای ساختن واژگان خود یک درس باز کنید.',
    'Daily Session': 'مرور کلمات سررسیده',
    'Review Due Words': 'مرور کلمات سررسیده',
    'Grammar Review': 'مرور گرامر',
    'Listening': 'شنیدن',
    'Guided Speaking': 'مکالمه هدایت‌شده',
    'Your answer': 'پاسخ شما',
    'Correct answer': 'پاسخ درست',
    'Language': 'زبان',
    'Content': 'محتوا',
    'About this pattern': 'درباره این الگو',
    'In this situation': 'در این موقعیت',
    "Couldn't open this lesson": 'باز کردن این درس ممکن نبود',
    'With a hint, this answer is practice, not independent recall.': 'با راهنما، این پاسخ تمرین محسوب می‌شود نه یادآوری مستقل.',
    'Choose...': 'انتخاب کنید…',
    'You used the hint, so this answer does not count as independent.': 'از راهنما استفاده کردید؛ بنابراین این پاسخ مستقل محسوب نمی‌شود.',
    'Topic note:': 'نکته موضوعی:',
    'AI teaching feedback — not a certified assessment': 'بازخورد آموزشی هوش مصنوعی — ارزیابی رسمی نیست',
    'Sentence feedback': 'بازخورد جمله',
    'Vocabulary': 'واژگان',
    'By dimension': 'بر اساس مهارت',
    'Focus next on': 'تمرکز بعدی روی',
    'Practice complete.': 'تمرین کامل شد.',
    'Course': 'دوره',
    'Lesson': 'درس',
    'Select a lesson': 'یک درس انتخاب کنید',
    'Or try': 'یا این را امتحان کنید',
    'Book page': 'صفحه کتاب',
    'Previous': 'قبلی',
    'Natural usage': 'کاربرد طبیعی',
    'Common mistake': 'اشتباه رایج',
    'Open this expression': 'باز کردن این عبارت',
    'Also': 'همچنین',
    'Example': 'مثال',
    'In context': 'در متن',
    'Practice': 'تمرین',
    'Say it out loud': 'با صدای بلند بگویید',
    'Listening…': 'در حال شنیدن…',
    'Speech recognition is not supported in this browser.': 'تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود.',
    'You said:': 'گفتید:',
    'Real-Life English': 'انگلیسی در زندگی واقعی',
    'AI Coach': 'مربی هوش مصنوعی',
    'A coach who knows your learning evidence': 'مربی‌ای که شواهد یادگیری شما را می‌شناسد',
    'Ask your coach': 'از مربی خود بپرسید',
    'View evidence': 'مشاهده شواهد',
    'What should I practice today?': 'امروز چه چیزی را تمرین کنم؟',
    'Why do I keep making this mistake?': 'چرا مدام این اشتباه را تکرار می‌کنم؟',
    'How can I say this more naturally?': 'چطور این را طبیعی‌تر بگویم؟',
    'Help me improve my speaking.': 'به من برای بهتر کردن گفتارم کمک کن.',
    'Coach response': 'پاسخ مربی',
    'Thinking…': 'در حال فکر کردن…',
    'Ask coach': 'پرسیدن از مربی',
    'Uses your local learning evidence only.': 'فقط از شواهد یادگیری محلی شما استفاده می‌کند.',
    'Enable AI in AI Settings to ask the coach.': 'برای پرسیدن از مربی، هوش مصنوعی را در تنظیمات فعال کنید.',
    'Ask about a mistake, a phrase, or what to practise next…': 'دربارهٔ یک اشتباه، عبارت یا تمرین بعدی سؤال بپرسید…',
    'Communication evidence': 'شواهد ارتباطی',
    'Observed evidence, not a fluency score': 'شواهد مشاهده‌شده، نه امتیاز روانی گفتار',
    'Everyday communication': 'ارتباط روزمره',
    'Conversation participation': 'مشارکت در گفتگو',
    'Independent sentence production': 'تولید مستقل جمله',
    'Contextual expression usage': 'کاربرد عبارت در بافت',
    'Listening-to-speaking transfer': 'انتقال از شنیدن به گفتار',
    'Professional communication': 'ارتباط حرفه‌ای',
    'Needs evidence': 'نیازمند شواهد بیشتر',
    'strength': 'نقطه قوت',
    'developing': 'در حال پیشرفت',
    'weakness': 'نیازمند تمرین',
    'independent observations': 'مشاهده مستقل',
    'no claim yet': 'هنوز ادعایی ثبت نشده است',
    'What are you doing right now?': 'الان چه کار می‌کنید؟',
    'Literal (word-for-word — may sound unnatural)': 'ترجمه تحت‌اللفظی — ممکن است طبیعی به نظر نرسد',
    'More advanced / alternative': 'پیشرفته‌تر / جایگزین',
    'Key words': 'واژه‌های کلیدی',
    'You could also say': 'می‌توانید این‌طور هم بگویید',
    'Quick check': 'بررسی سریع',
    'Done.': 'انجام شد.',
    'Scenarios completed': 'موقعیت‌های کامل‌شده',
    'Useful expressions': 'عبارت‌های کاربردی',
    'What the interviewer wants · structure · vocabulary': 'چیزی که مصاحبه‌کننده می‌خواهد · ساختار · واژگان',
    'Intention:': 'هدف:',
    'Structure:': 'ساختار:',
    'Persian notes': 'یادداشت‌های فارسی',
    'Your English answer': 'پاسخ انگلیسی شما',
    'Your answer (in English)': 'پاسخ شما به انگلیسی',
    'Transcribed — edit before evaluating.': 'پیاده‌سازی شد — پیش از ارزیابی ویرایش کنید.',
    'Practice feedback — not a certified assessment': 'بازخورد تمرین — ارزیابی رسمی نیست',
    'Corrected (same facts)': 'اصلاح‌شده (با همان اطلاعات)',
    'More natural & professional (same content)': 'طبیعی‌تر و حرفه‌ای‌تر (با همان محتوا)',
    'Language corrections': 'اصلاحات زبانی',
    'Alternative expressions': 'عبارت‌های جایگزین',
    'An interviewer might ask next': 'ممکن است مصاحبه‌کننده بعداً بپرسد',
    'Possible follow-ups': 'پرسش‌های احتمالی بعدی',
    'A full AI-led interview: one question at a time, with follow-ups. No hints — answer like the real thing.': 'یک مصاحبه کامل با هدایت هوش مصنوعی، هر بار یک سؤال و با پرسش‌های تکمیلی. راهنمایی وجود ندارد — مثل مصاحبه واقعی پاسخ دهید.',
    'End interview': 'پایان مصاحبه',
    'Delete': 'حذف',
    'Choose the correct meaning': 'معنی درست را انتخاب کنید',
    "Recall, don't reread": 'یادآوری کنید، دوباره نخوانید',
    "You'll see the Persian meaning and type the English from memory. The answer appears only after you check.": 'معنی فارسی را می‌بینید و انگلیسی را از حفظ می‌نویسید. پاسخ فقط پس از بررسی نمایش داده می‌شود.',
    'Practice complete': 'تمرین کامل شد',
    'Your answers are part of your review schedule now.': 'پاسخ‌های شما حالا بخشی از برنامه مرور هستند.',
    'Worth another look': 'ارزش یک مرور دوباره را دارد',
    'How do you say this in English?': 'این را به انگلیسی چگونه می‌گویید؟',
    'Check': 'بررسی',
    'Complete the sentence': 'جمله را کامل کنید',
    'Round complete': 'دور کامل شد',
    'Next round': 'دور بعدی',
    'All passages': 'همه متن‌ها',
    'Re-read the passage': 'خواندن دوباره متن',
    'Re-read with translation': 'خواندن دوباره با ترجمه',
    'All activities': 'همه فعالیت‌ها',
    'The transcript stays hidden until after the questions. Train your ears first.': 'متن گفتگو تا پایان سؤال‌ها پنهان می‌ماند. ابتدا گوش خود را تمرین دهید.',
    'Listen to the conversation at least once first.': 'ابتدا دست‌کم یک بار به گفتگو گوش دهید.',
    'Transcript': 'متن گفتگو',
    'All topics': 'همه موضوع‌ها',
    'Examples': 'مثال‌ها',
    'Practice again': 'تمرین دوباره',
    'Insights': 'نکته‌ها',
    'Why am I seeing this?': 'چرا این را می‌بینم؟',
    'Learning activity': 'فعالیت یادگیری',
    'Daily Journeys completed': 'مسیرهای روزانه کامل‌شده',
    'Time in Daily Journeys': 'زمان در مسیرهای روزانه',
    'Skill analysis': 'تحلیل مهارت‌ها',
    'Vocabulary by evidence': 'واژگان بر اساس شواهد',
    'Nothing tracked yet. Words appear here as you learn and practise them.': 'هنوز چیزی ثبت نشده است. واژه‌ها هنگام یادگیری و تمرین اینجا نمایش داده می‌شوند.',
    'Long-term learning': 'یادگیری بلندمدت',
    'Transferred': 'انتقال‌یافته',
    'Using patterns in new situations': 'استفاده از الگوها در موقعیت‌های جدید',
    'After': 'پس از',
    'Retained': 'به‌یادمانده',
    'Forgotten': 'فراموش‌شده',
    'Due': 'موعد مرور',
    'Missed': 'از دست‌رفته',
    'You have an unfinished journey': 'یک مسیر ناتمام دارید',
    'Continue where you stopped': 'ادامه از جایی که متوقف شدید',
    'How long today?': 'امروز چقدر زمان دارید؟',
    'Your roadmap': 'نقشه راه شما',
    'Today:': 'امروز:',
    'Look and listen. Nothing is tested yet — recall comes after you have seen these.': 'نگاه کنید و گوش دهید. هنوز چیزی آزموده نمی‌شود — یادآوری پس از دیدن این موارد انجام می‌شود.',
    "I've looked at these": 'این‌ها را دیدم',
    'Hint': 'راهنما',
    'Retry AI feedback': 'تلاش دوباره برای بازخورد هوش مصنوعی',
    'Next': 'بعدی',
    'Move on without retrying': 'بدون تلاش دوباره ادامه بده',
    'Basic check — not a grammar evaluation': 'بررسی پایه — ارزیابی گرامر نیست',
    'Speak': 'صحبت کنید',
    'Skip this activity': 'رد کردن این فعالیت',
    'End journey': 'پایان مسیر',
    'Journey complete': 'مسیر کامل شد',
    'Expressions met': 'عبارت‌های دیده‌شده',
    'Recalled independently': 'به‌طور مستقل یادآوری‌شده',
    'Sentences you built': 'جمله‌های ساخته‌شده',
    'Practice effort': 'تلاش تمرینی',
    'By learning stage': 'بر اساس مرحله یادگیری',
    'Worth reviewing': 'ارزش مرور دارد',
    'Done': 'انجام شد',
    'Mode': 'حالت',
    'Scenario': 'موقعیت',
    'Difficulty': 'سختی',
    'Feedback': 'بازخورد',
    'Natural': 'طبیعی',
    'Gentle': 'ملایم',
    'Teacher': 'معلم',
    'Writing your session summary…': 'در حال نوشتن خلاصه جلسه…',
    'Conversation complete': 'مکالمه کامل شد',
    'Strengths': 'نقاط قوت',
    'Work on next': 'مورد بعدی برای تمرین',
    'Key corrections': 'اصلاحات اصلی',
    'Next:': 'بعدی:',
    'AI service is not reachable': 'سرویس هوش مصنوعی در دسترس نیست',
    'AI writing evaluation': 'ارزیابی نوشتار با هوش مصنوعی',
    'Provider': 'ارائه‌دهنده',
    'Test connection': 'آزمایش اتصال',
    'Model': 'مدل',
    'Feedback preferences': 'تنظیمات بازخورد',
    'Explanation language': 'زبان توضیح',
    'Follow learner profile': 'مطابق پروفایل زبان‌آموز',
    'Persian': 'فارسی',
    'Start practice': 'شروع تمرین',
    'Start quiz': 'شروع آزمون',
    'Start': 'شروع',
    'Fill in the blank': 'جای خالی را پر کنید',
    'Read the real sentence and work out the missing word from context.': 'جمله واقعی را بخوانید و واژه جاافتاده را از متن حدس بزنید.',
    'Match the pairs': 'جفت‌ها را تطبیق دهید',
    'Tap a word, then its meaning. A quick review with no typing.': 'یک واژه و سپس معنی آن را انتخاب کنید. مروری سریع بدون تایپ.',
    'Listen & guess': 'گوش کن و حدس بزن',
    'Hear the word, then type what you heard. The text stays hidden until you answer.': 'واژه را بشنوید و سپس آنچه شنیدید تایپ کنید. متن تا زمان پاسخ پنهان می‌ماند.',
    'Listen & Repeat': 'گوش کن و تکرار کن',
    'Listen to each word three times and repeat it.': 'هر واژه را سه بار گوش دهید و تکرار کنید.',
    'Repeat mode': 'حالت تکرار',
    'Words': 'واژه‌ها',
    'Repeat words from a selected lesson': 'تکرار واژه‌های یک درس انتخاب‌شده',
    'Repeat all your hard words': 'تکرار همه واژه‌های دشوار',
    'Select a course': 'یک دوره انتخاب کنید',
    'Select a course and lesson to start.': 'برای شروع یک دوره و درس انتخاب کنید.',
    'Hard Words': 'واژه‌های دشوار',
    'Practice the words you find difficult.': 'واژه‌هایی را که دشوار می‌دانید تمرین کنید.',
    'No hard words': 'واژه دشواری وجود ندارد',
    'Add difficult words from your vocabulary lessons.': 'واژه‌های دشوار را از درس‌های واژگان خود اضافه کنید.',
    'Listen and practice pronunciation.': 'گوش دهید و تلفظ را تمرین کنید.',
    'Review Words': 'مرور واژه‌ها',
    'Review words that are due for practice.': 'واژه‌هایی را که موعد تمرینشان رسیده مرور کنید.',
    'Refresh': 'تازه‌سازی',
    'No words are due for review.': 'واژه‌ای برای مرور وجود ندارد.',
    'Come back later.': 'بعداً دوباره سر بزنید.',
    'Due reviews mixed with a few new words — interleaved, not blocked.': 'مرورهای موعدشده همراه با چند واژه جدید — درهم‌آمیخته، نه دسته‌بندی‌شده.',
    'Word': 'واژه',
    'What\'s the word?': 'واژه چیست؟',
    'Profile': 'پروفایل',
    'These settings describe how you learn — nothing here is hardcoded into the learning logic, and everything is editable at any time.': 'این تنظیمات شیوه یادگیری شما را مشخص می‌کنند — همه‌چیز هر زمان قابل ویرایش است.',
    'Professional English': 'انگلیسی حرفه‌ای',
    'Travel English': 'انگلیسی سفر',
    'Exam preparation': 'آمادگی آزمون',
    'minutes': 'دقیقه',
    'Comma-separated — used to steer example sentences and future content, not required.': 'موارد را با ویرگول جدا کنید — برای هدایت جمله‌های نمونه و محتوای آینده استفاده می‌شود و اختیاری است.',
    'A rough self-reported starting point only — not a certified or assessed level. Used to seed the skill profile until a real assessment exists.': 'فقط یک سطح شروع تقریبی بر اساس گزارش خودتان — سطح رسمی یا ارزیابی‌شده نیست.',
    'Not sure': 'مطمئن نیستم',
    'Save profile': 'ذخیره پروفایل',
    'Reset to defaults': 'بازنشانی پیش‌فرض‌ها',
    'Skills': 'مهارت‌ها',
    'Six independent skills — a strong vocabulary score does not imply the same level in speaking or writing. Levels shown as "Not yet assessed" simply mean no real data exists yet; nothing is guessed.': 'شش مهارت مستقل — امتیاز خوب واژگان الزاماً به معنی همان سطح در گفتار یا نوشتار نیست. «هنوز ارزیابی نشده» یعنی داده واقعی کافی وجود ندارد.',
    'Not yet assessed': 'هنوز ارزیابی نشده',
    'Self-report your level': 'سطح خود را وارد کنید',
    'Short, practical topics: learn the pattern, then use it in exercises.': 'موضوع‌های کوتاه و کاربردی: الگو را یاد بگیرید و سپس در تمرین‌ها استفاده کنید.',
    'Reading': 'خواندن',
    'Read first, then answer. Translations unlock after you have tried.': 'ابتدا بخوانید و سپس پاسخ دهید. ترجمه پس از تلاش شما باز می‌شود.',
    'dialogue': 'گفتگو',
    'article': 'مقاله',
    'professional': 'حرفه‌ای',
    'passage': 'متن',
    'story': 'داستان',
    'general': 'عمومی',
    'business': 'کسب‌وکار',
    'technical': 'فنی',
    'Writing': 'نوشتن',
    'Regular writing practice with saved history. Automated feedback is limited to objective checks (length, required elements) — intelligent correction arrives with the AI tutor in a later phase.': 'تمرین منظم نوشتن با سابقه ذخیره‌شده. بازخورد خودکار به بررسی‌های عینی محدود است و اصلاح هوشمند در مرحله بعد ارائه می‌شود.',
    "Dialogues and dictation in the app's voices. Transcripts stay hidden until you have answered.": 'گفتگو و دیکته با صداهای برنامه. متن گفتگو تا زمانی که پاسخ دهید پنهان می‌ماند.',
    'sentences': 'جمله‌ها',
    'READING': 'خواندن',
    'CLOZE': 'جای خالی',
    'MATCHING': 'تطبیق',
    'QUIZ': 'آزمون',
    'GRAMMAR': 'گرامر',
    'Daily Journal': 'یادداشت روزانه',
    'Loading': 'در حال بارگذاری',
    'Save': 'ذخیره',
    'Cancel': 'لغو',
    'Close': 'بستن',
    'LEARN': 'یادگیری',
    'Pick a course, then open a lesson. Learn at your own pace, then practise.': 'یک دوره انتخاب کنید و سپس یک درس را باز کنید. با سرعت خودتان یاد بگیرید و تمرین کنید.',
    'Choose a lesson and test your recall.': 'یک درس انتخاب کنید و یادآوری خود را بسنجید.',
    'Quick review with no typing.': 'مرور سریع بدون تایپ.',
    'Your journey for today': 'مسیر امروز شما',
    'Built around what you need: recognize it, recall it, then use real English.': 'بر اساس نیاز شما ساخته شده: تشخیص دهید، به یاد بیاورید و سپس در انگلیسی واقعی استفاده کنید.',
    'Quick': 'سریع',
    'Extended': 'گسترده',
    'Recognize': 'تشخیص',
    'Recall': 'یادآوری',
    'Produce': 'تولید',
    'DAILY JOURNEY': 'مسیر روزانه',
    'What you have actually learned': 'آنچه واقعاً یاد گرفته‌اید',
    'Built only from answers you gave on your own. Hints, AI help and copied corrections are never counted as learning, and nothing here is a proficiency level.': 'فقط بر اساس پاسخ‌هایی که مستقل داده‌اید. راهنما، کمک هوش مصنوعی و اصلاحات کپی‌شده یادگیری محسوب نمی‌شوند و اینجا سطح مهارت نمایش داده نمی‌شود.',
    'There is not enough independent evidence yet to judge your strengths and weaknesses. A few Daily Journeys will change that.': 'هنوز شواهد مستقل کافی برای سنجش نقاط قوت و ضعف شما وجود ندارد. چند مسیر روزانه این وضعیت را تغییر می‌دهد.',
    'Start a Daily Journey': 'شروع یک مسیر روزانه',
    'Journeys per week (latest first)': 'مسیرها در هفته (جدیدترین ابتدا)',
    'Recognition vs recall': 'تشخیص در برابر یادآوری',
    'Free Conversation': 'مکالمه آزاد',
    'Natural chat on topics you enjoy': 'گفتگوی طبیعی درباره موضوع‌های مورد علاقه شما',
    'Daily Life': 'زندگی روزمره',
    'Routines, plans, everyday topics': 'روال‌ها، برنامه‌ها و موضوع‌های روزمره',
    'Professional': 'حرفه‌ای',
    'Work and career English': 'انگلیسی کاری و شغلی',
    'Mock Interview': 'مصاحبه آزمایشی',
    'Saved Answers': 'پاسخ‌های ذخیره‌شده',
    'Daily Situations': 'موقعیت‌های روزمره',
    'My Real Life': 'زندگی واقعی من',
    'Quick practice': 'تمرین سریع',
    'Start conversation': 'شروع مکالمه',
    'End session': 'پایان جلسه',
    'Send': 'ارسال',
    'Retry': 'تلاش دوباره',
    'Loading providers...': 'در حال بارگذاری ارائه‌دهنده‌ها…',
    'available': 'در دسترس',
    'unavailable': 'در دسترس نیست',
    'not configured': 'پیکربندی نشده',
    'Feedback detail': 'جزئیات بازخورد',
    'Concise': 'خلاصه',
    'Standard': 'استاندارد',
    'Detailed': 'کامل',
    'Languages': 'زبان‌ها',
    'Native language': 'زبان مادری',
    'Target language': 'زبان هدف',
    'Bilingual (Persian + English)': 'دوزبانه (فارسی + انگلیسی)',
    'English only': 'فقط انگلیسی',
    'Learning goals': 'هدف‌های یادگیری',
    'Study schedule': 'برنامه مطالعه',
    'Daily session length': 'مدت جلسه روزانه',
    'Study days': 'روزهای مطالعه',
    'Interests': 'علاقه‌مندی‌ها',
    'Starting level (unverified)': 'سطح شروع (تأییدنشده)',
    'Learning program': 'برنامه یادگیری',
    'Loading...': 'در حال بارگذاری…',
    'Loading prompts...': 'در حال بارگذاری تمرین‌ها…',
    'All courses': 'همه دوره‌ها',
    'Go to the Dashboard': 'رفتن به داشبورد',
}

const messages: Record<AppLocale, Record<string, string>> = {
    en: {
        'app.name': 'English Upgrade',
        'app.tagline': 'Learn · Practice · Speak',
        'app.openMenu': 'Open menu',
        'app.closeMenu': 'Close menu',
        'app.mainNavigation': 'Main navigation',
        'app.sections': 'Sections',
        'app.skipToContent': 'Skip to content',
        'app.backToTop': 'Back to top',
        'language.label': 'Language',
        'language.english': 'English',
        'language.persian': 'فارسی',
        'language.switchTo': 'Switch to {language}',
        'nav.today': 'Today',
        'nav.learn': 'Learn',
        'nav.practice': 'Practice',
        'nav.speakWrite': 'Speak & write',
        'nav.career': 'Career',
        'nav.me': 'Me',
        'nav.dashboard': 'Dashboard',
        'nav.dailyJourney': 'Daily Journey',
        'nav.dailySession': 'Review Due Words',
        'nav.lessons': 'Lessons',
        'nav.learningPath': 'Learning Path',
        'nav.realLife': 'Real-Life English',
        'nav.immersive': 'Immersive Scenarios',
        'nav.practicePage': 'Practice',
        'nav.cloze': 'Cloze',
        'nav.matching': 'Matching',
        'nav.quiz': 'Quiz',
        'nav.grammar': 'Grammar',
        'nav.reading': 'Reading',
        'nav.listening': 'Listening',
        'nav.listenRepeat': 'Listen & Repeat',
        'nav.listenGuess': 'Listen & Guess',
        'nav.review': 'Review',
        'nav.hardWords': 'Hard Words',
        'nav.conversation': 'Conversation',
        'nav.coach': 'AI Coach',
        'nav.guidedSpeaking': 'Guided Speaking',
        'nav.speakingPractice': 'Speaking Practice',
        'nav.writing': 'Writing',
        'nav.careerEnglish': 'Career English',
        'nav.progress': 'Learning Progress',
        'nav.skills': 'Skill Levels',
        'nav.profile': 'Profile',
        'nav.aiSettings': 'AI Settings',
        'page.dashboard': 'Dashboard',
        'page.courses': 'Courses',
        'page.course': 'Course',
        'page.lesson': 'Lesson',
        'page.skills': 'Skills',
        'page.dailySession': 'Review Due Words',
        'page.guidedSpeaking': 'Guided Speaking',
        'page.conversation': 'Conversation',
        'page.coach': 'AI Coach',
        'page.profile': 'Profile',
        'page.writing': 'Writing',
        'page.careerEnglish': 'Career English',
        'page.learn': 'Learn',
        'page.progress': 'Learning Progress',
        'page.aiSettings': 'AI Settings',
        'voice.settings': 'Voice settings',
        'voice.provider': 'Pronunciation voice',
        'voice.voice': 'Voice',
        'voice.speed': 'Speech speed',
        'voice.automatic': 'Automatic',
        'voice.neural': 'Neural Voice',
        'voice.system': 'System Voice',
        'voice.verySlow': 'Very slow',
        'voice.slow': 'Slow',
        'voice.normal': 'Normal',
        'voice.fast': 'Fast',
        'voice.veryFast': 'Very fast',
        'voice.extraFast': 'Extra fast',
    },
    fa: {
        'app.name': 'ارتقای انگلیسی',
        'app.tagline': 'یادگیری · تمرین · مکالمه',
        'app.openMenu': 'باز کردن منو',
        'app.closeMenu': 'بستن منو',
        'app.mainNavigation': 'ناوبری اصلی',
        'app.sections': 'بخش‌ها',
        'app.skipToContent': 'رفتن به محتوای اصلی',
        'app.backToTop': 'بازگشت به بالای صفحه',
        'language.label': 'زبان',
        'language.english': 'English',
        'language.persian': 'فارسی',
        'language.switchTo': 'تغییر به {language}',
        'nav.today': 'امروز',
        'nav.learn': 'یادگیری',
        'nav.practice': 'تمرین',
        'nav.speakWrite': 'گفتار و نوشتار',
        'nav.career': 'شغلی',
        'nav.me': 'من',
        'nav.dashboard': 'داشبورد',
        'nav.dailyJourney': 'مسیر روزانه',
        'nav.dailySession': 'مرور کلمات سررسیده',
        'nav.lessons': 'درس‌ها',
        'nav.learningPath': 'مسیر یادگیری',
        'nav.realLife': 'انگلیسی در زندگی واقعی',
        'nav.immersive': 'سناریوهای تعاملی',
        'nav.practicePage': 'تمرین',
        'nav.cloze': 'جای خالی',
        'nav.matching': 'تطبیق',
        'nav.quiz': 'آزمون',
        'nav.grammar': 'گرامر',
        'nav.reading': 'خواندن',
        'nav.listening': 'شنیدن',
        'nav.listenRepeat': 'گوش کن و تکرار کن',
        'nav.listenGuess': 'گوش کن و حدس بزن',
        'nav.review': 'مرور',
        'nav.hardWords': 'واژه‌های دشوار',
        'nav.conversation': 'مکالمه',
        'nav.coach': 'مربی هوش مصنوعی',
        'nav.guidedSpeaking': 'مکالمه هدایت‌شده',
        'nav.speakingPractice': 'تمرین گفتار',
        'nav.writing': 'نوشتن',
        'nav.careerEnglish': 'انگلیسی شغلی',
        'nav.progress': 'پیشرفت یادگیری',
        'nav.skills': 'سطح مهارت‌ها',
        'nav.profile': 'پروفایل',
        'nav.aiSettings': 'تنظیمات هوش مصنوعی',
        'page.dashboard': 'داشبورد',
        'page.courses': 'دوره‌ها',
        'page.course': 'دوره',
        'page.lesson': 'درس',
        'page.skills': 'مهارت‌ها',
        'page.dailySession': 'مرور کلمات سررسیده',
        'page.guidedSpeaking': 'مکالمه هدایت‌شده',
        'page.conversation': 'مکالمه',
        'page.coach': 'مربی هوش مصنوعی',
        'page.profile': 'پروفایل',
        'page.writing': 'نوشتن',
        'page.careerEnglish': 'انگلیسی شغلی',
        'page.learn': 'یادگیری',
        'page.progress': 'پیشرفت یادگیری',
        'page.aiSettings': 'تنظیمات هوش مصنوعی',
        'voice.settings': 'تنظیمات صدا',
        'voice.provider': 'صدای تلفظ',
        'voice.voice': 'صدا',
        'voice.speed': 'سرعت گفتار',
        'voice.automatic': 'خودکار',
        'voice.neural': 'صدای عصبی',
        'voice.system': 'صدای سیستم',
        'voice.verySlow': 'خیلی آهسته',
        'voice.slow': 'آهسته',
        'voice.normal': 'معمولی',
        'voice.fast': 'سریع',
        'voice.veryFast': 'خیلی سریع',
        'voice.extraFast': 'بسیار سریع',
    },
}

function readLocale(): AppLocale {
    if (typeof localStorage === 'undefined') return 'en'

    try {
        return localStorage.getItem(STORAGE_KEY) === 'fa' ? 'fa' : 'en'
    } catch {
        return 'en'
    }
}

function applyDocumentLocale(value: AppLocale): void {
    if (typeof document === 'undefined') return

    document.documentElement.lang = value === 'fa' ? 'fa' : 'en'
    document.documentElement.dir = value === 'fa' ? 'rtl' : 'ltr'
}

export function setLocale(value: AppLocale): void {
    locale.value = value
    applyDocumentLocale(value)
    refreshLocaleDom()

    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* storage may be disabled */ }
}

export function useLocale(): {
    locale: Ref<AppLocale>
    isPersian: ComputedRef<boolean>
    t: (key: string, params?: Record<string, string>) => string
    setLocale: (value: AppLocale) => void
} {
    const isPersian = computed(() => locale.value === 'fa')
    const t = (key: string, params: Record<string, string> = {}) => {
        const fallback = messages.en[key] ?? key
        const message = messages[locale.value][key] ?? fallback

        return Object.entries(params).reduce(
            (result, [name, value]) => result.replaceAll(`{${name}}`, value),
            message,
        )
    }

    return { locale, isPersian, t, setLocale }
}

export function translateText(text: string, value: AppLocale = locale.value): string {
    const key = Object.keys(messages.en).find(candidate => messages.en[candidate] === text)
    if (key) return messages[value][key] ?? text

    if (value === 'fa' && staticTranslations[text]) return staticTranslations[text]
    if (value === 'fa') {
        const dueWords = text.match(/^(\d+) words? due for spaced-repetition review, mixed with a few new words\.$/)
        if (dueWords) return `${dueWords[1]} واژه برای مرور فاصله‌دار آماده است و چند واژه جدید هم دارد.`

        const dueGrammar = text.match(/^(\d+) grammar topics? due for spaced review \((.*)\)\.$/)
        if (dueGrammar) return `${dueGrammar[1]} موضوع گرامر برای مرور فاصله‌دار آماده است (${dueGrammar[2]}).`

        const hardWords = text.match(/^(\d+) words? marked hard are waiting, and there's time left in today's budget\.$/)
        if (hardWords) return `${hardWords[1]} واژه دشوار در انتظار مرور است و هنوز از زمان امروز باقی مانده است.`

        return Object.entries(staticTranslations)
            // Never translate isolated words inside learner/content data. Exact
            // UI labels are handled above; substring matching is only for
            // complete multi-word interface fragments with interpolated values.
            .filter(([source]) => source.includes(' ') && text.includes(source))
            .sort(([left], [right]) => right.length - left.length)
            .reduce((result, [source, translation]) => result.replaceAll(source, translation), text)
    }
    return text
}

type LocaleDomBridge = { stop: () => void; refresh: () => void }
let activeBridge: LocaleDomBridge | null = null

/** Translate known UI copy rendered by existing views without touching lesson content. */
export function installLocaleDomBridge(root: HTMLElement): LocaleDomBridge {
    const originalText = new WeakMap<Text, string>()
    const originalAttributes = new WeakMap<Element, Map<string, string>>()
    let applying = false

    const translateNode = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text
            const parent = text.parentElement
            if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName) || parent.isContentEditable) return

            const source = originalText.get(text) ?? text.data
            originalText.set(text, source)
            const trimmed = source.trim()
            if (!trimmed) return
            const translated = translateText(trimmed)
            if (translated !== trimmed) {
                const start = source.indexOf(trimmed)
                const next = `${source.slice(0, start)}${translated}${source.slice(start + trimmed.length)}`
                if (text.data !== next) text.data = next
            } else if (locale.value === 'en' && text.data !== source) {
                text.data = source
            }
            return
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return
        const element = node as Element
        if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(element.tagName) || element.hasAttribute('data-locale-ignore')) return

        for (const attribute of ['placeholder', 'aria-label', 'title']) {
            if (!element.hasAttribute(attribute)) continue
            const values = originalAttributes.get(element) ?? new Map<string, string>()
            const source = values.get(attribute) ?? element.getAttribute(attribute) ?? ''
            values.set(attribute, source)
            originalAttributes.set(element, values)
            const next = locale.value === 'fa' ? translateText(source) : source
            if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next)
        }

        for (const child of Array.from(element.childNodes)) translateNode(child)
    }

    const refresh = () => {
        if (applying) return
        applying = true
        translateNode(root)
        applying = false
    }

    const observer = new MutationObserver(() => refresh())
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] })
    activeBridge = { stop: () => observer.disconnect(), refresh }
    refresh()
    return activeBridge
}

export function refreshLocaleDom(): void {
    activeBridge?.refresh()
}

applyDocumentLocale(locale.value)
