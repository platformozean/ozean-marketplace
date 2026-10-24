# ⚙️ دليل التشغيل والإعداد | Ozean

منصة لبيع وشراء الأعمال الإبداعية (لوحات، صور، موسيقى، فيديو، أزياء، مجوهرات، تصاميم)، تعمل بواجهة ثابتة وربط مع Firebase.

**التواصل والدعم:** platformozean@gmail.com

## هيكل المشروع

| الملف | الوصف |
|---|---|
| `index.html` | واجهة الموقع كاملة (5 لغات: العربية، English، Türkçe، Español، Italiano) |
| `firebase-bridge.js` | الربط مع Firebase (الدخول، قاعدة البيانات، التخزين) |
| `firestore.rules` | قواعد أمان قاعدة البيانات |
| `storage.rules` | قواعد أمان التخزين |
| `firebase.json` | إعدادات النشر على Firebase Hosting |
| `.nojekyll` | يضمن عمل الموقع على GitHub Pages |
| `.gitignore` | يمنع رفع الملفات السرية |

## التشغيل خطوة بخطوة

### 1) إنشاء مشروع Firebase بحساب المالك
1. سجّل الدخول إلى https://console.firebase.google.com **بحساب platformozean@gmail.com** حتى يكون هو مالك المشروع.
2. **Add project**، ثم من **Project settings ← Your apps** اضغط أيقونة الويب `</>` وسجّل تطبيقًا.
3. انسخ قيم `firebaseConfig`.

### 2) لصق الإعدادات
افتح `firebase-bridge.js` واستبدل القيم التي تبدأ بـ `YOUR_` بقيم مشروعك. قيم الويب هذه ليست سرية، لكن **لا ترفع أبدًا** مفاتيح حساب الخدمة (`*adminsdk*.json`).

### 3) تفعيل الخدمات
- **Authentication ← Sign-in method ← Google** ← Enable.
- **Firestore Database ← Create database**.
- **Storage ← Get started** (قد تطلب Google تفعيل خطة Blaze، ولها حصة مجانية).

### 4) نشر قواعد الأمان (إلزامي)
- **Firestore ← Rules**: الصق محتوى `firestore.rules` ← **Publish**.
- **Storage ← Rules**: الصق محتوى `storage.rules` ← **Publish**.

### 5) السماح بنطاق موقعك
**Authentication ← Settings ← Authorized domains ← Add domain**، وأضف نطاقك (مثل `username.github.io`).

### 6) الاستضافة (اختر واحدة)
- **GitHub Pages:** المستودع ← **Settings ← Pages ← Deploy from a branch ← main ← / (root) ← Save**.
- **Firebase Hosting:** `firebase login` ثم `firebase use --add` ثم `firebase deploy --only hosting,firestore:rules,storage`.
- **Netlify أو غيره:** ارفع المجلد كما هو.

## اختبار بعد التشغيل
- [ ] تسجيل الدخول بحساب Google
- [ ] رفع عمل ثابت السعر ومشاهدته من حساب آخر
- [ ] مزايدة من حساب ثانٍ على عمل بمزاد
- [ ] إنشاء طلب شراء وتأكيده من البائع ثم تنزيل الملف الأصلي من حساب المشتري
- [ ] التأكد أن غير المشتري لا يستطيع فتح الملف الأصلي

## الإعدادات القابلة للتعديل
- **العمولة الافتراضية** والحد الأدنى بالدولار: في `publishItem` داخل `firebase-bridge.js` (`commissionPercent` و`minFeeUsd`).
- **اللغات:** في `index.html` ابحث عن `Ozean i18n` وعدّل `LN` و`D`.
- **الشعار والألوان:** متغيرات CSS في أعلى `index.html`.

## حدود حالية
- الدفع **يدوي** (تحويل ثم إيصال يؤكده الفنان)، ولا توجد بوابة دفع إلكتروني.
- زر "ربط المحفظة" واجهة تجريبية لا تتصل بمحفظة حقيقية.
- رفع **الفيديو والموسيقى** معطّل حاليًا في `publishItem`؛ المدعوم رفع الصور مع ملف أصلي أو رابط Google Drive.
- صور المعاينة تُخزَّن مضغوطة داخل Firestore (حد الوثيقة 1 ميغابايت).
- بيانات استلام الأموال تُقرأ من أي مستخدم مسجّل لأن المشتري يحتاجها عند الدفع.
- المزاد ينتهي بإغلاق يدوي من البائع.
- جرّب القواعد في **Rules Playground** قبل الإطلاق العلني.
