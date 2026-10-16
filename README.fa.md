<div dir="rtl">

# DevLens

**[English](README.md) | [فارسی](README.fa.md)**

یک جعبه‌ابزار برنامه‌نویسی با اولویت حریم‌خصوصی، برای بررسی JWT، JSON، درخواست‌های HTTP و داده‌های کدگذاری‌شده، مستقیماً داخل مرورگرتان.

DevLens یک افزونه‌ی کروم (Manifest V3) است که کنار صفحه‌تان (Side panel کروم) و داخل DevTools می‌نشیند. همه‌ی ابزارها به‌جز **Sender** کاملاً محلی اجرا می‌شوند: بدون بک‌اند، بدون آنالیتیکس، بدون دسترسی شبکه. Sender یک ابزار صریح و اختیاری برای تست APIهایی است که مالکشان هستید یا مجاز به تست آن‌ها هستید؛ به بخش [حریم خصوصی](#حریم-خصوصی) نگاه کنید.

## امکانات

| بخش | چیکار می‌کند |
| --- | --- |
| **JWT** | رمزگشایی هدر/payload (ورودی `Bearer …`، `Authorization: …` یا داخل گیومه هم قبول می‌شود)، توضیح claimها، وضعیت `exp`/`nbf`/`iat` به وقت محلی. **Verify** امضاهای HS/RS/PS/ES به‌صورت محلی با رمز، کلید عمومی PEM یا JWK. **بررسی امنیتی** (الگوریتم `none`، `jku`/`x5u`/`jwk`، نبود یا خیلی طولانی بودن `exp`، …). **ساخت** توکن آزمایشی با امضای HMAC. کلیدها می‌توانند PEM، JWK یا یک **JWKS** کامل (انتخاب با `kid`) باشند. |
| **JSON** | فرمت، minify، نمای درختی، جست‌وجو، **JSONPath**، **تعمیر** یک‌کلیکی JSON خراب. **تبدیل** به TypeScript، Zod، رکورد C#، Python (Pydantic)، رکورد Java، struct گو، YAML، CSV، XML؛ و XML ← JSON. |
| **Diff** | مقایسه‌ی ساختاری. آرایه‌هایی از آبجکت با یک فیلد یکتای `id`/`_id`/`key`/`uuid` بر اساس هویت مقایسه می‌شوند (`items[id=2]`). **قوانین نادیده‌گیری** (`updatedAt`، `items[*].id`، `**.ts`)، نمای لیستی یا **کنار-هم**، کپی به‌صورت Markdown/JSON. |
| **HTTP** | بدنه‌ی raw، form، **multipart** و **GraphQL**. تولید **cURL**، **C#** (ساده یا **مدل‌های تایپ‌شده + کلاینت + نمونه استفاده** از روی یک پاسخ نمونه)، **JavaScript fetch**، **Python requests**، و فایل **.http**. **ایمپورت** از cURL، HTTP خام یا یک سند **OpenAPI**. درخواست‌های ذخیره‌شده‌ی اختیاری (پیش‌فرض خاموش؛ اطلاعات حساس حذف می‌شوند). |
| **Tools** | Base64، رمزگذاری/رمزگشایی URL، پارسر و سازنده‌ی query string، Unix timestamp، بازرس UUID، **تولیدکننده‌ی UUID v4/v7 / ULID / رشته‌ی تصادفی**، **هش SHA و HMAC**، **تست‌کننده‌ی regex**، **مرجع کدهای وضعیت HTTP**. |
| **DevTools** | یک تب «DevLens» داخل Chrome DevTools با کل جعبه‌ابزار به‌علاوه‌ی یک **بازرس شبکه**: رمزگشایی توکن‌های Bearer، کپی هر درخواست به‌صورت cURL / C# / fetch / Python (با امکان پنهان‌سازی اطلاعات حساس)، تولید **مدل‌های تایپ‌شده و کلاینت C# از روی پاسخ واقعی**، و باز کردن یک **Journey** برای هر درخواست: وضعیت نهایی با تشخیص ساده‌فهم، اتصال (IP، پروتکل، TLS)، نمودار زمان‌بندی، زنجیره‌ی ریدایرکت، CORS preflight، و هاپ‌های CDN/پروکسی _که از روی هدرها حدس زده می‌شود_ (DevLens نمی‌تواند پکت خام یا هاپ‌های روتر را ببیند). |
| **کلیک‌راست** | انتخاب متن روی هر صفحه ← «Inspect with DevLens» ابزار مناسب را باز می‌کند (JWT، JSON، UUID، timestamp، query string، URL-encoded، Base64). |
| **Sender** | برای APIها/سامانه‌هایی که مالکشان هستید یا مجاز به تست آن‌ها هستید (پشت یک اعلان تأیید یک‌باره): **Send** یک درخواست واقعی و دیدن پاسخ؛ **Fuzz** یک جای‌خالی `{{FUZZ}}` با یک wordlist، رنج عددی یا یک **preset حمله‌ی** آماده (SQL injection، XSS، path traversal، command injection، SSRF، NoSQL injection) — پاسخ‌ها برای نشانه‌های شناخته‌شده‌ی آسیب‌پذیری اسکن و پرچم‌گذاری می‌شوند؛ **Rate limit** یک موج درخواست برای پیدا کردن نقطه‌ی محدودیت (نه یک ابزار DDoS — بدون قابلیت flood)؛ ممیزی **Security headers** (CSP، HSTS، کوکی، CORS، …)؛ **Discover** لینک‌های هم‌دامنه از یک URL (لینک‌های صفحه، sitemap.xml، robots.txt) برای بازبینی پیش از تست؛ **Collections** — ذخیره‌ی درخواست‌ها با assertion (status/header/body/JSON-path/max-time)، پر کردن مقادیر `{{var}}` از یک **environment** نام‌گذاری‌شده، و اجرای کل مجموعه برای یک چک سریع رگرسیون. «Copy report» روی Fuzz، Security headers و اجرای Collection یک خلاصه‌ی Markdown می‌سازد. تنها ابزاری که ترافیک واقعی شبکه می‌فرستد. |

همچنین: تم روشن/تاریک/سیستم، Ctrl/Cmd + Enter برای اجرای عملیات فعلی، **Ctrl+Shift+L** برای باز کردن side panel، دکمه‌ی کپی همه‌جا، تب‌های قابل‌پیمایش با کیبورد، و نمایش وضعیت با متن و آیکون (نه فقط رنگ).

### راهنمای داخل برنامه

هر بخش از DevLens یک جعبه‌ی «راهنما» دوزبانه (انگلیسی/فارسی) دارد که بالای همان بخش باز می‌شود: توضیح می‌دهد آن ابزار چیکار می‌کند، چطور ازش استفاده کنید، یک مثال واقعی، و اینکه چه زمانی به کارتان می‌آید — نیازی نیست این مستندات را حفظ کنید، همان‌جا کنار ابزار در دسترس است.

## اسکرین‌شات‌ها

هر دو تم تاریک و روشن پشتیبانی می‌شوند (نسخه‌های `*-light.png` داخل `docs/screenshots/` هستند).

| JWT                              | JSON                               | Diff                               | HTTP                               |
| -------------------------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- |
| ![JWT](docs/screenshots/jwt.png) | ![JSON](docs/screenshots/json.png) | ![Diff](docs/screenshots/diff.png) | ![HTTP](docs/screenshots/http.png) |

## نصب

</div>

```bash
git clone <repository>
cd devlens
npm install
npm run build
```

<div dir="rtl">

سپس در کروم: **Extensions ← Developer mode ← Load unpacked ← پوشه‌ی `dist/` را انتخاب کنید**.

## توسعه

</div>

```bash
npm run dev          # سرور Vite (رابط کاربری را در یک تب معمولی نمایش می‌دهد)
npm run build        # type-check و ساخت dist/ (افزونه‌ی unpacked)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest (یک اجرا)
npm run test:watch   # Vitest در حالت watch
```

<div dir="rtl">

APIهای مخصوص کروم (storage، context menu، DevTools) زیر `npm run dev` در دسترس نیستند؛ رابط کاربری برای این حالت محافظت شده. افزونه‌ی واقعی را با بارگذاری `dist/` به‌صورت unpacked تست کنید.

## معماری

</div>

```
src/
├── app/            پوسته‌ی اصلی اپ (تم، تب‌ها) و routes.ts (لیست ابزارها)
├── components/     رابط کاربری مشترک: Button, Input, TextArea, Tabs, JsonTree, StatusBadge, CopyButton, ErrorMessage, Guide
├── features/       یک پوشه به‌ازای هر ابزار؛ هرکدام مستقل
│   ├── jwt/        components/ types/ utils/token.ts
│   ├── json/       components/
│   ├── diff/       components/ utils/diff.ts
│   ├── http/       components/ generators/{curl,csharp,httpFile}.ts types/
│   ├── sender/     components/ (Send, Fuzz, Rate limit, Security headers, Discover, Collections) utils/
│   └── encoding/   components/ utils/{url,timestamp,uuid}.ts
├── hooks/          useCtrlEnter, useTheme
├── lib/            منطق مشترک خالص: json.ts, base64.ts, clipboard.ts, storage.ts
└── types/          Result<T> / AppError
public/             manifest.json (MV3) و آیکون‌ها، عیناً به dist/ کپی می‌شوند
tests/              تست‌های واحد و کامپوننت با Vitest
```

<div dir="rtl">

اصول:

- **منطق خالص و جدا از React است.** پارسرها، diff و تولیدکننده‌ها توابع کوچکی هستند که `Result<T>` برمی‌گردانند (`{ ok: true, value } | { ok: false, error }`)، پس خطاها همیشه قابل‌خواندن برای انسان‌اند و هیچ‌وقت به داخل UI throw نمی‌شوند.
- **اضافه کردن یک ابزار جدید** یعنی ساختن یک پوشه زیر `features/` و اضافه کردن یک ورودی به `src/app/routes.ts`.
- محتوای کاربر فقط از طریق React رندر می‌شود (بدون `dangerouslySetInnerHTML`، `eval` یا `new Function`؛ ESLint دوتای آخر را ممنوع کرده).

## حریم خصوصی

- همه‌ی پردازش‌ها داخل صفحات افزونه (side panel / DevTools) انجام می‌شود؛ هیچ بک‌اند و هیچ API خارجی‌ای وجود ندارد.
- CSP افزونه `connect-src 'none'` تنظیم شده، پس صفحات آن نمی‌توانند درخواست شبکه بفرستند. مجوزها فقط `storage`، `contextMenus` و `sidePanel` هستند، بدون دسترسی به هیچ host (یک تست این را تضمین می‌کند). به [PRIVACY.md](PRIVACY.md) نگاه کنید.
- فقط ترجیحات رابط کاربری (تم، آخرین تب، زبان خروجی پیش‌فرض) در `chrome.storage.local` نوشته می‌شوند. توکن‌ها، JSON، هدرها، بدنه‌ها، کلیدها و اطلاعات حساس فقط در state داخلی React نگه‌داری می‌شوند و با بسته شدن side panel یا پنجره‌ی DevTools از بین می‌روند.
- درخواست‌های ذخیره‌شده‌ی اختیاری **پیش‌فرض خاموش** هستند؛ هدرهای حساس و پارامترهای توکن در query همیشه پیش از ذخیره حذف می‌شوند.
- متن انتخاب‌شده از طریق منوی کلیک‌راست، به‌صورت درون‌حافظه‌ای از `chrome.storage.session` عبور می‌کند و به‌محض خوانده‌شدن توسط side panel حذف می‌شود.
- **Sender** تنها استثناست: یک ابزار اختیاری و صریح برای تست APIها/سامانه‌هایی که مالکشان هستید یا مجاز به تست آن‌ها هستید، پشت یک اعلان تأیید یک‌باره در هر session (فقط در `sessionStorage`، هیچ‌وقت در `chrome.storage`). جزئیات کامل در [PRIVACY.md](PRIVACY.md).

## انتشار در فروشگاه کروم

</div>

```bash
npm run package        # می‌سازد و release/devlens-<version>.zip را تولید می‌کند
npm run store:assets   # اسکرین‌شات (۱۲۸۰×۸۰۰) و تایل‌های تبلیغاتی در docs/store/
```

<div dir="rtl">

متن لیستینگ، توجیه مجوزها و چک‌لیست ثبت در
[docs/STORE_LISTING.md](docs/STORE_LISTING.md) است؛ سیاست حریم خصوصی [PRIVACY.md](PRIVACY.md) است.
پوش کردن یک تگ `v*` ورک‌فلوی ریلیز را اجرا می‌کند که فایل zip را به یک GitHub release ضمیمه می‌کند.

## تست

</div>

```bash
npm test
```

<div dir="rtl">

تست‌های واحد رمزگشایی JWT و وضعیت زمان، parse/format/minify/search JSON، diff ساختاری، Base64/URL/timestamp/UUID، تولیدکننده‌های cURL/C#، و منطق Sender (fuzz، rate-limit، assertion، environment، collection) را پوشش می‌دهند. چند تست کامپوننت هم پنل‌های JWT و JSON، دکمه‌ی کپی و گارد تأیید DELETE را بررسی می‌کنند.

## نقشه‌راه

- **۰.۲** یکپارچگی با DevTools، تاریخچه/replay درخواست، ایمپورت/اکسپورت، سفارشی‌سازی شورتکات
- **۰.۳** بازرس شبکه، نمایشگر OpenAPI، بازرس GraphQL، نمایشگر HAR
- **۰.۴** افزونه‌ی VS Code، پلاگین JetBrains
- **۰.۵** ابزار خط‌فرمان `devlens`
- **۱.۰** جعبه‌ابزار یکپارچه روی همه‌ی موارد بالا

## مشارکت

به [CONTRIBUTING.md](CONTRIBUTING.md) نگاه کنید. آسیب‌پذیری‌ها را طبق [SECURITY.md](SECURITY.md) گزارش دهید.

## توسعه‌دهنده

طراحی و توسعه توسط **محسن بحرزاده** — [Mohsen.Bahrzadeh@Gmail.com](mailto:Mohsen.Bahrzadeh@Gmail.com).

## لایسنس

[MIT](LICENSE)

</div>
