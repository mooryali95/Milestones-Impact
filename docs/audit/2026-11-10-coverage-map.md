# Coverage map for the UI audit of the production apps

Source: the repo at `/home/user/milestones-impact` (read-only, 2026-11-10). Production hosts come from `supabase/functions/_shared/sites.js`:

| App | Host | Source |
|---|---|---|
| Participant app plus the expert, org, rater and sponsor portals | https://leaders.sunkvalue.com | `leaders-app/src` |
| Admin console | https://admin.sunkvalue.com | `admin-app/src` |
| Public site | https://mi.sunkvalue.com | `home/` |
| Impact matrix | https://matrix.sunkvalue.com | `src/` |

All app back ends are Supabase edge functions at `/functions/v1/<fn>`:
- `leaders-api` takes POST `{action, token, ...}`. The participant, expert, coordinator and admin sessions each send their own token.
- `admin-api` handles admin login, admin users and the matrix registrations.
- `user-api` handles the matrix app.
- `send-otp` handles **only the public contact form** (`action:'contact'`). It is **not** used for login.

Safety classes:
- **SAFE**: navigation, reading, opening a dialog, cancelling.
- **TEST-WRITE**: writes only the logged-in user's own records.
- **UNSAFE**: real payment, deleting, bulk email or broadcast, issuing or approving certificates, system settings or permissions, anything that touches another person's data or sends mail to a third party.

A mail-to-third-party action, such as inviting a rater or asking an expert or peer, is marked UNSAFE (3P-MAIL) even when it starts from the user's own record. Use it only with test addresses you control.

The e2e specs (`e2e/*.spec.js`) mock `leaders-api` through `page.route`, so their selectors are reliable. Common locators: `getByRole('button',{name:'...'})`, `getByLabel('البريد الإلكتروني')`, `getByLabel('رمز التحقق')`, `getByRole('radio',{name:/غالبًا/})`, `getByRole('heading',{name:/نتيجتك قيد المراجعة/})`.

---

# 1. leaders-app (leaders.sunkvalue.com)

## 1.1 Routing (`App.jsx`)
There is no router library. `App()` branches on `location.pathname`, and each standalone page is wrapped in a `Shell` with its own tag text.

| Path | Screen | Shell tag | Auth |
|---|---|---|---|
| `/v`, `/v/<serial>` | Verify (public certificate check) | التحقق من الشهادات | none |
| `/rate?t=<token>` | Rater (manager or peer rating, pre or post) | تقدير الأثر | token in URL, no login, no back link |
| `/sponsor?t=<token>` | Sponsor (endorse the initiative) | تأييد المبادرة | token in URL |
| `/outcome?t=<token>` | Outcome (sponsor confirms impact numbers) | تأكيد أثر المبادرة | token in URL |
| `/expert` | ExpertApply (public application to the expert network) | شبكة الخبراء | none |
| `/offer?t=<token>` | ExpertOffer (expert accepts or declines a service request) | طلب خدمة | token in URL |
| `/x` (also `/x#invite=<email>.<code>`) | ExpertPortal | لوحة الخبير | separate expert session (`mi_leaders_expert_session`) |
| `/legal`, `/legal/privacy`, `/legal/terms`, `/legal/refund`, `/legal/changes` | Legal | الخصوصية والشروط | none |
| `/org`, `/org/verify?e=&t=` | OrgPortal (org coordinator) | لوحة الجهة | separate coordinator session (`mi_leaders_coord_session`) |
| anything else (`/`) | `Participant()` state machine | رحلة القادة | participant session (`mi_leaders_session`) |

Query and hash entry points on `/`:
- `/verify?e=<email>&t=<link>` is the magic link from the sign-in email. It calls `auth.verify` with the link.
- `/?tab=profile|handbook|capstone|hall|impact|lab` opens that section (`deeplink.js`).
- `/?checkin=<token>` is a workshop QR check-in. It renders `CheckIn` and calls `workshop.checkin`, which writes the user's own attendance (TEST-WRITE).
- `/#demo=<session>` is the live-tour demo link from admin. It shows the `LiveTour` overlay.
- `/?paid=assessment|program` is the return from Creem. The Paywall polls `me` until the entitlement appears.

## 1.2 How the role is determined
- **There is no single role field.** Each role has its own door (path), its own session key and its own login action set:
  - participant: `/` with `auth.*`
  - expert: `/x` with `xp.auth-*`
  - org coordinator: `/org` with `coord.auth-*`
- Role membership is computed server-side by `rolesOf(email)` in `leaders-api/doors.ts`:
  - `participants` (not suspended, not demo) gives `participant`.
  - `experts` (status not rejected or suspended) gives `expert`.
  - `org_coordinators` (any not suspended) gives `org`.
- If a role is returned in `switch_to`, the header shows **AccountSwitch** (`مشارك ⇄`, `خبير ⇄` or `منسق جهة ⇄`). Its menu offers `بدّل إلى` → `رحلتي مشاركًا`, `لوحة الخبير` and `لوحة الجهة`. Choosing one calls `me.switch`, `xp.switch` or `coord.switch`, stores the new token under that portal's key and redirects to `/`, `/x` or `/org`.
- **Raters, sponsors and outcome confirmers are not accounts.** They act through single-use emailed token links (`/rate?t=`, `/sponsor?t=`, `/outcome?t=`). Experts receive service offers at `/offer?t=`.
- **RoleChoice**: a new email (`email_challenges.purpose='register'`) that already belongs to an expert or coordinator gets `{choose_role:true, roles}` from `auth.verify`, or `confirm_new` from `auth.google`. The user then sees:
  - heading `بريدك مسجل في دور آخر`
  - link buttons `لوحة الخبير` → `/x` and `لوحة الجهة` → `/org`
  - button `سأشارك في البرنامج: أنشئ حساب مشارك`, which re-calls `auth.verify` with `confirm_new:true`
- **Participant sub-state** is derived from `me`, not from the URL. The order in `Participant()` is:
  1. booting
  2. RoleChoice
  3. boot error
  4. SignIn
  5. Consent (first or renew)
  6. CheckIn
  7. OnboardingWelcome
  8. Profile (until the profile gate is done)
  9. SponsorshipPending (seat hold)
  10. Paywall(assessment) (if no access to assessment)
  11. Assessment
  12. Paywall(program) if approved, otherwise AwaitingApproval
  13. Lab, Handbook, Hall, Capstone or Impact (by view, approved only)
  14. Journey

  `hasAccess(me,item)` is `!me.access || me.access[item]`, so when payments are switched off the paywalls never appear.
- **Org coordinator**: a row in `org_coordinators` created by admin (CoordinatorPanel `إضافة وإرسال الدعوة`). The coordinator logs in at `/org`.
- **Expert**: applies at `/expert` (row with status `applied`), is approved by admin, or is invited by admin (`admin.expert-invite` sends `/x#invite=` mail).
- **Admin**: separate app. See section 2.

## 1.3 Participant login flow (`screens/SignIn.jsx`), exactly
1. **Email step.** The heading is `ابدأ رحلتك القيادية`. The screen has:
   - a `GoogleButton` labelled `المتابعة بحساب Google`. This is the official GIS button overlaid transparently and opens a popup. It calls `auth.google`.
   - an email field labelled `البريد الإلكتروني`
   - the button `متابعة`, which calls `auth.start`
   - the button `الدخول بمفتاح المرور` (only if WebAuthn is supported), which calls `passkey.auth-options` then `passkey.auth-verify`
   - the footer `لست في المكان الصحيح؟ دخول المشارك · لوحة الخبير · لوحة الجهة` (`Doors.jsx`)
   - an `IntroVideo` player
2. **Turnstile.** `auth.start` calls `humanGate` and `requireHuman` on the server:
   - Cloudflare Turnstile is **mandatory and fails closed**.
   - If the request has no or a bad `captcha`, the server returns `code:'captcha'` with `site_key`. The UI shows `تحقّق سريع قبل إرسال الرمز.` and the `Captcha.jsx` widget, loaded from `challenges.cloudflare.com/turnstile/v0/api.js`. When solved, the widget re-calls `auth.start` with `captcha`.
   - If the Turnstile secrets are missing, the server returns 503 `captcha_unconfigured`: `الدخول برمز البريد متوقف مؤقتًا…`.
   - Google and passkey sign-in skip Turnstile.
   - Rate limits: 5 challenges per email per hour, plus a network guard.

   **For automation, Turnstile blocks the email-code path unless a test site key or bypass is used. Google and passkey avoid it.**
3. **Existing email.** `auth.start` stores an `email_challenges` row and sends **one email containing both a 6-digit code and a magic link** (`/verify?e=&t=`). The email is sent by leaders-api through Resend (`sendOrDiscard`), not by `send-otp`. The UI moves to the code step.
4. **New email.** `auth.start` returns `needs_name` plus a `pass`, which carries the human check so Turnstile is not asked again. The name step shows:
   - heading `أهلًا بك في البرنامج`
   - `الاسم الكامل` (required, at least 3 characters)
   - `رقم الجوال` (optional)
   - optional `رمز الجهة الراعية` (placeholder `ABC-2026`)
   - a note about the expert and org doors
   - the consent note `بضغطك «أرسل الرمز» توافق على سياسة الخصوصية و شروط برنامج القادة`
   - the button `أرسل الرمز`, which calls `auth.start` with the name
   - the link `تغيير البريد`
5. **Code step.** The heading is `أرسلنا لك رابطًا ورمزًا`. The code input (`aria-label="رمز التحقق"`) auto-submits at 6 digits through `auth.verify`, which allows 5 attempts. The step also has `بريد آخر` and, after 45 seconds, `أعد إرسال الرمز`.
6. **Account creation.** `auth.verify` creates the participant with `email_verified_at`, records consent (`recordConsent`), pins the sponsor if an org is linked and issues a session token. This happens only for `purpose=register` with a pending profile.
7. **Google, new account.** `auth.google` returns `confirm_new`. The screen shows `أهلًا <name>`, the `رمز الجهة الراعية` field and the button `أنشئ حسابي مشاركًا`, which calls `auth.google` with `confirm_new`. It also has `رجوع`.
8. A full-screen `نجهّز رحلتك…` transition is shown while signing in.

**First login for a new email:**
1. The consent screen usually does **not** appear, because consent is recorded at registration. It appears only if recording failed (`consent.needed==='first'`, heading `خصوصيتك وشروط البرنامج`, button `أوافق وأتابع`, which calls `consent.accept`) or after a material policy change (`renew`, heading `حدّثنا سياسة الخصوصية وشروط البرنامج`, buttons `أوافق وأتابع` and `لاحقًا`).
2. **OnboardingWelcome** (step 1 of 4; the rail reads `الخطوة 1 من 4`). Heading `أهلًا <first>، لنبدأ`, intro video, button `لنبدأ`, which sets `localStorage mi_leaders_welcome_seen`.
3. **Profile** (step 2, `عرّفنا بك`).
4. **Paywall(assessment)** if payment is on and the user is not sponsored (rail title `رسوم القياس`).
5. **Assessment** (step 3, `نقطة انطلاقك`).
6. Journey with the **OnboardingNextCard** (step 4, `ما بعد ذلك`, button `فهمت`) until approval. While the user is unpaid and unapproved, **AwaitingApproval** (`مسارك قيد الاعتماد`) shows instead of Journey.

## 1.4 Participant shell (header and nav)
The nav appears only once the profile and assessment are done and the program is paid. It shows as top tabs on desktop and a bottom `tabbar` on mobile, with `aria-label="أقسام المنصة"`. A locked item is `disabled` and its aria-label is `<label>: <reason>`.

| Element | Label | Action | Class |
|---|---|---|---|
| nav | `رحلتي` | view home (Journey) | SAFE |
| nav | `كتيبي` | Handbook (locked `يُفتح بعد اعتماد مسارك`) | SAFE |
| nav | `مبادرتي` | Capstone (locked until approved) | SAFE |
| nav | `القاعة` | Hall (locked until approved) | SAFE |
| nav | `المختبر` | Lab (only if `lab.list` returns items) | SAFE |
| nav | `أثري` | Impact (locked `يُفتح مع القياس البعدي في طور الأثر`) | SAFE |
| nav | `ملفي` | Profile and MyData | SAFE |
| nav | `كاتون` | hidden (`KATON_ENABLED` false) | n/a |
| header button | `ملفي: <name>` (aria-label; shows the avatar and name) | go to profile | SAFE |
| header | AccountSwitch `مشارك ⇄` | `me.switch` | SAFE (session swap) |
| header | `خروج` | `logout` | SAFE |
| header | `ثبّت التطبيق` | PWA install prompt | SAFE |
| banner | `راجع ووافق` / `إخفاء` (PolicyBanner) | reopen consent / hide the notice locally | SAFE |
| footer | `الخصوصية والشروط` | `/legal` | SAFE |
| skip link | `تخطَّ إلى المحتوى` | anchor | SAFE |
| boot error | ErrorBox retry, `ادخل بحساب آخر` | re-boot / clear session | SAFE |

## 1.5 SignIn — see 1.3
Element classes:
- `متابعة` (`auth.start`): sends a code email to your own address. TEST-WRITE.
- `أرسل الرمز` on a new email: creates a challenge. Account creation happens at verify. TEST-WRITE.
- `أنشئ حسابي مشاركًا`: creates an account. TEST-WRITE.
- Passkey and Google buttons: SAFE.

## 1.6 Consent (`Consent.jsx`)
| Label | Action | Class |
|---|---|---|
| links `سياسة الخصوصية`, `الشروط`, `الاسترداد`, `سجل التغييرات` (new tab) | /legal/* | SAFE |
| `أوافق وأتابع` | `consent.accept` | TEST-WRITE |
| `لاحقًا` (renew only) | local defer | SAFE |

## 1.7 Onboarding (`Onboarding.jsx`)
| Label | Action | Class |
|---|---|---|
| `لنبدأ` | local flag, then go home | SAFE |
| intro video player | play | SAFE |
| `فهمت` (next card in Journey) | local flag | SAFE |
| `أعد مشاهدة الفيديو التعريفي` | open video | SAFE |

## 1.8 Profile, the `ملفي` view (`screens/Profile.jsx`) plus MyData
The heading is `أهلًا <first>، عرّفنا بك` during onboarding and `ملفي الشخصي` otherwise. The form has `data-tour="profile-form"`.

| Element | Label | Action | Class |
|---|---|---|---|
| fields | `الاسم الكامل` (locked after approval), `رقم الجوال`, `المسمى الوظيفي`, `جهة العمل`, `سنوات الخبرة`, select `نطاق ما تقوده الآن`, `الاسم بالإنجليزية`, `القطاع`, `رابط LinkedIn`, `نبذة مختصرة` | form state | — |
| upload | CV `label.btn` (file input) | `upload.url` then `cv.attach` | TEST-WRITE |
| submit | `حفظ والانتقال لتحديد المستوى` (onboarding) / `حفظ` | `profile.save` | TEST-WRITE |
| button | `رجوع` | back home | SAFE |
| SponsorCode form `الجهة الراعية` | `اربط` | `me.sponsor-code` (links you to an org and uses a seat) | UNSAFE-ish (consumes an org seat; use only a test code) |
| `الدخول بالبصمة` | `فعّله الآن` | `passkey.register-options` / `-verify` | TEST-WRITE |
| PreManager (in settings) | form plus `أرسل الدعوة` | `rater.invite` phase=pre, which emails the manager | UNSAFE (3P-MAIL) |
| `ماذا ترى جهتك` | checkbox (share levels with org) | `org.share-consent` | TEST-WRITE |
| `أجهزتك` | `اخرج من الأجهزة الأخرى` / per-row `إنهاء` | `sessions.revoke` | TEST-WRITE (own sessions; may kill other test tabs) |
| MyData `بياناتي` | `نزّل النسخة` | `me.export` (limited per day) | TEST-WRITE |
| MyData | `اطلب الحذف` → form (`سبب الطلب`, type your email) → `أرسل طلب الحذف` / `تراجع` | `me.erase-request` | **UNSAFE** (account erasure request; do not run on a real account) |
| MyData | `اسحب الطلب وأبقِ حسابي` | `me.erase-request {cancel}` | TEST-WRITE |

## 1.9 Paywall (`screens/Paywall.jsx`)
There are two variants:
- `item=assessment`: title `القياس المبدئي`, CTA `ادفع وابدأ القياس`.
- `item=program`: eyebrow `نتيجتك جاهزة`, title `أكمل رحلتك في البرنامج`, CTA `ادفع وأكمل البرنامج`.

The price and VAT note are visible on the screen. These are good audit points.

| Label | Action | Class |
|---|---|---|
| `ادفع وابدأ القياس` / `ادفع وأكمل البرنامج` | `pay.checkout`, then redirect to a **Creem** hosted checkout (`location.href=r.url`) | **UNSAFE (real payment). Stop before clicking, or click only to inspect the redirect URL and never pay.** Note: `pay.checkout` may create a pending payment row. |
| form `رشّحتك جهة؟ رمزها يعفيك من الرسوم`, input `رمز الجهة الراعية`, `تحقق` | `me.sponsor-code` | UNSAFE-ish (seat) |
| `رشّحتني جهة ولا أملك رمزًا` | opens the claim form | SAFE |
| claim form `اسم الجهة الراعية`, `بريد منسق الجهة`, `أرسل طلب التحقق` | `sponsor.request` (admin queue, possibly emails the coordinator) | UNSAFE (3P) |
| `إلغاء` | close the claim form | SAFE |
| `ألغِ الطلب` | `sponsor.cancel` | TEST-WRITE |
| legal links in the price note | /legal | SAFE |

Related states:
- **AwaitingApproval**: `مسارك قيد الاعتماد`, read-only.
- **SponsorshipPending**: `رعايتك بانتظار الاعتماد`, read-only.
- **Confirming**: `نؤكد دفعتك…`, which polls `me`.

## 1.10 Assessment, `قياس` (`screens/Assessment.jsx`)
The intro heading is `لنحدد نقطة انطلاقك` (baseline), `لنرَ ما تغيّر فعلًا` (post) or `نكمل من حيث توقفت` (resumed).

| Label | Action | Class |
|---|---|---|
| `ابدأ` / `تابع (n من N)` | start | SAFE |
| `لاحقًا` / `→ رحلتي` (post only) | back | SAFE |
| option buttons `role="radio"` (likert labels such as `نادرًا جدًا`, `نادرًا`, `أحيانًا`, `غالبًا`, `دائمًا`; the retro "before" row in post) | `assessment.answer` (autosave) | TEST-WRITE |
| `السابق` / `التالي` | navigate | SAFE |
| `واصل إلى <section>` | section interstitial | SAFE |
| `أكمل الناقص` | jump to the first missing question | SAFE |
| `راجع إجاباتي` | review | SAFE |
| `أرسل واعرض نتيجتي` / `أرسل واعرض ما تغيّر` | `assessment.submit` (irreversible baseline; puts the user in the admin approval queue) | TEST-WRITE (own record, irreversible without admin `إعادة القياس`) |
| `أعد المحاولة` | retry a failed save | TEST-WRITE |

## 1.11 Journey, `رحلة` (home view, `screens/Journey.jsx`)
The heading is `<first>، رحلتك مفتوحة` when approved and `شكرًا <first>، نتيجتك قيد المراجعة` otherwise. It also shows the phase rail `أطوار الرحلة`, the side panel `ما تفعله الآن`, folds (`معالمك`, `تقدمك في التقييم المستمر`, `مسارك` / `نتيجتك`) and `مراحل الرحلة`.

| Element | Label | Action | Class |
|---|---|---|---|
| PasskeyBanner | `فعّله الآن` / `لاحقًا` | `passkey.register-*` / `passkey.dismiss` | TEST-WRITE |
| Welcome card | `فهمت` | local | SAFE |
| side panel | `اذهب إليها`, `أكمل من حيث توقفت`, `افتح كتيبي`, `افتح المختبر` | navigate | SAFE |
| NextSession | `ادخل القاعة`, `أضفها إلى تقويمك` (.ics download) | navigate / local | SAFE |
| stage header `button.stage-top` (aria-expanded) | expand or collapse | SAFE |
| requirement | `افتح ملفي`, `اكتب بطاقة مبادرتك`, `ابدأ القياس البعدي` / `اعرض ما تغيّر`, `ادعُ مديرك من صفحة القياس البعدي` | navigate | SAFE |
| requirement | `أنجزته` / `أنجزته، أرسله للمراجعة` | `requirement.update` | TEST-WRITE |
| requirement | `تراجع` | `requirement.update {undo}` | TEST-WRITE |
| requirement upload | `ارفع الملف` (file input) | `upload.url`, then `requirement.update` | TEST-WRITE |
| survey requirement | stars `n من 5`, textarea, `أرسل إجاباتك`, `عدّل إجاباتك` | `requirement.update {answers}` | TEST-WRITE |
| Activity: video | `شاهد` / `تابع المشاهدة` / `أغلق` | `video.ping` | TEST-WRITE |
| Activity: workshop | `انضم الآن` | `workshop.join` | TEST-WRITE |
| Activity: workshop | `أضف إلى تقويمي` | .ics | SAFE |
| Activity: coaching | `احجز موعدًا` / `أنهيت الحجز` (embedded external booking iframe) | external booking | UNSAFE (books a real coach slot) |
| Activity: coaching | `الموجّه متاح الآن، اتصل فورًا` | `coaching.instant` (notifies the coach) | UNSAFE (3P) |
| Activity: coaching | `انضم الآن` (join_url) | external meeting | SAFE-ish |
| Activity: content | `شاهد` / `تابع` / `شاهد مرة أخرى`, `افتح` / `افتح الملف` | `content.open` / `content.ping` | TEST-WRITE |
| Activity | `افتح الكتيب`, `افتح وثيقة مبادرتك`, `افتح النموذج` | navigate | SAFE |
| CertificateCard (`شهادة الإتمام`) | `اعرض الشهادة` (opens a window) / `أضفها إلى LinkedIn` | `certificate` (read) | SAFE |
| PreManager | form plus `أرسل الدعوة`, `إخفاء · تجدها في «ملفي»` | `rater.invite` pre | UNSAFE (3P-MAIL) / SAFE |
| PeerRequests (`طلبات التوجيه`) | `اطلب توجيهًا` → textarea → `أرسل الطلب` / `إلغاء` | `peer.ask` (notifies team or expert) | UNSAFE (3P) |
| PeerRequests | `أجب` | `peer.answer` (writes on another user's request) | UNSAFE (3P) |
| PeerRequests | `أغلق الطلب` | `peer.close` (own request) | TEST-WRITE |
| ChooseExpert (`اطلب استشارة`) | `اطلب الآن` → selects plus note → `اختره` | `experts.suggest` (read) / `experts.choose` (creates a service request and emails the expert an offer) | UNSAFE (3P) |
| ChooseExpert | `إغلاق` | close | SAFE |
| RateExpert | stars `★` (`n من 5`), comment, `أرسل التقييم` | `ratings.submit` (rates an expert) | UNSAFE (affects an expert's rating) |
| SusCard | SUS survey | (own) | TEST-WRITE |
| HowEvaluated | read-only | — | SAFE |
| mail link | `mailto:` contact | — | SAFE |

## 1.12 Handbook, `كتيبي` (`screens/Handbook.jsx`)
The heading is `كتيب القائد` (`TERMS.handbook`). The tabs (`role="tab"`) are `الكتيب`, `النماذج التعليمية · x/y` and `إنجازاتي`. A FirstOpen card shows with `فهمت`.

| Label | Action | Class |
|---|---|---|
| tabs | switch | SAFE |
| `⤓ نسخة PDF شخصية` | `handbook.export` (3 per day) | TEST-WRITE |
| `→ رحلتي` | back | SAFE |
| TOC: cover button, chapter buttons (`toc-ch`) | `handbook.chapter` | SAFE (reading triggers `handbook.ping`) |
| `الغلاف` / `الباب السابق` / `ابدأ القراءة` / `الباب التالي` | navigate | SAFE |
| chapter quiz option buttons, reflection textarea, submit (gold block) | `handbook.complete` | TEST-WRITE |
| `حاول مرة أخرى` | retry | SAFE |
| Models tab: filters, `mcard` cards → ModelView | `models.list` / `models.get` | SAFE |
| ModelView: `→ مكتبة النماذج`, `حفظ`, `تسليم للمستشار · N نقطة` / `تحديث التسليم`, `+ صف`, `حذف الصف`, `⇣ استورد …` | `models.save` (submit goes to the admin review queue) | TEST-WRITE |
| Wins tab `سلّم الألقاب`, `سجل نقاطك` | `achievements` | SAFE |
| ChapterLab (embedded) | see Lab | TEST-WRITE |

## 1.13 Capstone, `مبادرتي` (`screens/Capstone.jsx`)
| Label | Action | Class |
|---|---|---|
| `حدد نطاق عملك` | go to profile | SAFE |
| section buttons `cp-sec` → ModelView (save / submit as in 1.12) | `models.save` | TEST-WRITE |
| summary textarea plus `حفظ الملخص` | `capstone.summary` (draft) | TEST-WRITE |
| `اعرض الوثيقة الاحترافية` | `capstone.doc` (opens a window) | SAFE |
| `سلّم الوثيقة للمستشار` | `capstone.submit` (goes to the admin review; later the sponsor email flow) | TEST-WRITE (own; starts the review workflow) |
| Tracking `متابعة التنفيذ والأثر`: open button, milestone status selects, textareas `ما يعيقك` and `ما تحتاجه من جهتك أو مستشارك`, `احفظ التحديث` / `إلغاء` | `tracking.save` | TEST-WRITE |
| Tracking `أرسل المراجعة للراعي` (checkpoint) | `tracking.save {checkpoint}`, which emails the sponsor | UNSAFE (3P-MAIL) |
| ChooseExpert (context capstone) | as above | UNSAFE |
| `→ رحلتي` | back | SAFE |

## 1.14 Hall, `القاعة` (`screens/Hall.jsx`)
The heading is `القاعة`. When closed it shows the preview `هكذا تبدو القاعة حين تُفتح` and the button `رحلتي`. It polls `hall.state`.

| Label | Action | Class |
|---|---|---|
| `ادخل القاعة` | `hall.join` | TEST-WRITE |
| `✋ ارفع يدك` / `أنزل يدك` | `hall.hand` (visible to the expert live) | TEST-WRITE |
| `اكتبه طلب توجيه` → PeerRequests | `peer.ask` | UNSAFE (3P) |
| team buttons (`TEAM_AR`) | `hall.pick` | TEST-WRITE |
| KatonAnswer sentence answers | `katon.answer` | TEST-WRITE |
| `رحلتي` | back | SAFE |

## 1.15 Lab, `المختبر` (`screens/Lab.jsx`)
The home heading is `مختبر القائد`. It shows item cards (`mcard lab-item`) and apply items, plus `→ رحلتي`.

| Label | Action | Class |
|---|---|---|
| item card | `lab.start` | TEST-WRITE (starts an attempt) |
| `ابدأ` | phase | SAFE |
| step widgets: order `▲`/`▼`, options, radio, link selects `من`/`نوع الاعتمادية`/`إلى` plus `أضف`/`×`, tokens, cell selects | local | — |
| `أرسل الإجابة` | `lab.answer` | TEST-WRITE |
| `التالي` / `النتيجة` | next | SAFE |
| `محاولة جديدة` | `lab.start {fresh}` | TEST-WRITE |
| `→ المختبر` | exit | SAFE |

## 1.16 Impact, `أثري` (`screens/Impact.jsx`)
The heading is `بين بداية الرحلة ونهايتها`. It embeds Assessment kind=post.

| Label | Action | Class |
|---|---|---|
| `→ رحلتي` | back | SAFE |
| `ادعُ مديرك ليقدّر التغير`: form (name, email, select relation) plus `أرسل الدعوة` | `rater.invite` post, which emails the rater | UNSAFE (3P-MAIL) |
| `إلغاء` (on an invited rater) | `rater.revoke` | TEST-WRITE |
| post-assessment buttons | as 1.10 | TEST-WRITE |

## 1.17 Katon (hidden; `KATON_ENABLED=false`)
The screen exists but there is no nav item. It shows `دقة التحليل والمعايرة`, buttons `كل المواضيع` / `رحلتي`, topic cards and `katon.answer`.

## 1.18 LiveTour (demo only, `/#demo=`)
| Label | Action | Class |
|---|---|---|
| `الجولة الحيّة · i من N` (pill) | restore | SAFE |
| step buttons: `ادخل بحساب العرض`, `املأ الملف وأكمل`, `أجب وأرسل القياس`, `اطرح سؤالًا تجريبيًا` … | `demo.fill-profile`, `demo.fill-assessment`, `peer.ask` on the demo account | TEST-WRITE (demo account) |
| `التالي` / `السابق` / `من البداية` / `نص عادي` / `وضع المقدِّم` / `إخفاء` / audio | navigate | SAFE |

## 1.19 Standalone token pages
| Screen | Elements (exact labels) | API | Class |
|---|---|---|---|
| **Rater** `/rate?t=` | heading `كيف يمارس <p> عمله اليوم؟` (pre) / `كيف تغيّرت ممارسة <p>؟` (post); option radios; comment textarea; `أرسل التقدير` / `بقي N`; done `شكرًا لك` | `rater.get`, `rater.submit` | UNSAFE (writes into another participant's impact data; use only a test token) |
| **Sponsor** `/sponsor?t=` | `هل تؤيد مبادرة «…»؟`, `اقرأ الوثيقة كاملة`, note, `أؤيد المبادرة`, `أطلب تعديلًا` | `sponsor.get`, `sponsor.submit` | read SAFE; submit UNSAFE |
| **Outcome** `/outcome?t=` | `هل تعكس هذه الأرقام…`, `الدليل` link, note, `أؤكد الأرقام`, `لا تطابق ما أراه` | `outcome.get`, `outcome.submit` | submit UNSAFE |
| **ExpertOffer** `/offer?t=` | `أهلًا <expert>`, `أقبل الطلب`, `أعتذر هذه المرة`; error `العرض غير متاح` | `offer.get`, `offer.respond` | respond UNSAFE |
| **ExpertApply** `/expert` | heading `انضم إلى شبكة خبراء برنامج القادة`; checkboxes; bio textarea (at least 80 characters); `أرسل طلب الانضمام`; done `وصل طلبك` | `expert.apply` (creates an application in the admin queue and notifies admin) | TEST-WRITE (applying as expert; use a test email) |
| **Verify** `/v/<serial>` | search form plus `تحقّق`; `اعرض الشهادة`; `اعرض الإصدار الأحدث` | `cert.verify` | SAFE |
| **Legal** `/legal/*` | tab links `الخصوصية`, `الشروط`, `الاسترداد`, `سجل التغييرات`; `mailto` | none | SAFE |

## 1.20 ExpertPortal `/x` (`screens/ExpertPortal.jsx`, `ExpertFile.jsx`)
**Login.** The heading is `لوحة الخبير` (eyebrow `EXPERT PORTAL`). It has `البريد الإلكتروني`, then `أرسل الرمز` (`xp.auth-start`, with Turnstile when requested), then `رمز التحقق` and `دخول` (`xp.auth-verify`), plus `غيّر البريد`. Alternatives are `GoogleButton` (`xp.auth-google`) and the link `قدّم طلب الانضمام` → `/expert`. An invite link `/x#invite=<email>.<code>` logs in automatically. A wrong door shows `DoorButtons`.

**Consent.** The first time, PortalConsent shows `بيانات المشاركين أمانة` with `أوافق وأتابع` (`xp.consent`, TEST-WRITE).

**Onboarding (not yet active).** It shows `ملفك بانتظار الاعتماد` and `عدّل ملفك`, which opens ExpertApply in expert mode with `احفظ الملف وأرسله للمراجعة` (`xp.profile-save`, TEST-WRITE).

**Dashboard.** The heading is `أهلًا <name>`.

| Label | Action | Class |
|---|---|---|
| `شهادة ساعات الخبرة` | opens a document | SAFE |
| AccountSwitch `خبير ⇄` | `xp.switch` | SAFE |
| `خروج` | `xp.logout` | SAFE |
| `طلبات بانتظار ردك`: `أقبل` / `أعتذر` | `xp.respond` | UNSAFE (participant service) |
| `جلساتك القادمة`: `رابط الجلسة` | external | SAFE |
| `قيّم مشاركيك`: `قيّم` → stars, comment, `احفظ التقييم` | `xp.rate` | UNSAFE (participant record) |
| `بانتظار تقييمك` (model reviews): `قيّم` → rating, feedback, `اعتمد` / `أعده بملاحظة` / `إلغاء` | `xp.review` | UNSAFE |
| `مشاركوك`: search (`ابحث في مشاركيك`), `بانتظارك N` toggle, `افتح الملف`, `اعرض الكل (N)` | `xp.participants` | SAFE |
| `مقيّمون بانتظار تأكيدك`: `أكّد وأرسل الدعوة` / `لا أعتمده` → reason → `لا أعتمده` / `إلغاء` | `xp.rater-confirm` (emails the rater) | UNSAFE |
| `طلبات الأقران`: `أكّد` / `صحّح` / `أخفِ`; `أجب`; `أغلق` | `xp.peer-review`, `xp.peer-answer`, `xp.peer-close` | UNSAFE |
| `القاعة الحية`: select `الدفعة` plus hall controls | `xp.hall`, `xp.hall-open`, `xp.hall-step`, `xp.hall-split`, `xp.hall-assign`, `xp.hall-close` | UNSAFE (live cohort) |
| ExpertFile `ملف المشارك`: `→ مشاركوك`, `اعتمد الإنجاز` / `قيّم بالمعيار` / `عدّل التقييم` → selects, `ملاحظة للسجل`, `احفظ التقييم` / `اعتمد الإنجاز` / `إلغاء` | `xp.milestone` | UNSAFE |
| ExpertFile final evaluation: `حفظ مسودة`, `ارفع للاعتماد`, `اعتمد`, `أعِد للمراجعة` | `xp.final-eval-save`, `xp.final-eval-vote` (approval leads to **certificate issuance**) | **UNSAFE** |

## 1.21 OrgPortal `/org` (`screens/OrgPortal.jsx`)
**Login.** The heading is `دخول منسق الجهة`. It has `البريد الإلكتروني` (placeholder `name@org.sa`), then `أرسل الرمز` (`coord.auth-start`, with Turnstile when requested), then the code step `أدخل رمز الدخول` (`رمز التحقق`, `coord.auth-verify`) and `تغيير البريد`. The email link is `/org/verify?e=&t=`. There is no Google button.

**Consent.** PortalConsent `بيانات المشاركين أمانة` with `أوافق وأتابع` (`coord.consent`).

**Dashboard.** The heading is the org name.

| Label | Action | Class |
|---|---|---|
| `تصدير Excel` / `تقرير الجهة` (if the export permission is granted) | local export / print | SAFE |
| AccountSwitch `منسق جهة ⇄` | `coord.switch` | SAFE |
| `خروج` | `coord.logout` | SAFE |
| `مقيّمون بانتظار تأكيدك` (RatersAwaiting) | `coord.rater-confirm` | UNSAFE |
| filters: selects `المرحلة`, `المسار`, `الترتيب`; search | local | SAFE |
| `الوثيقة` (approved capstone) | `coord.capstone` | SAFE |
| `تقرير الأثر PDF` | local | SAFE |
| `حاول مرة أخرى` | reload | SAFE |

---

# 2. admin-app (admin.sunkvalue.com)

## 2.1 Login and authorization (`screens/Login.jsx`, `supabase/functions/admin-api/index.ts`)
1. The user enters `البريد الإلكتروني` (`#loginEmail`, placeholder `your@email.com`) and clicks `متابعة`. This calls `admin-api` `login-send`.
   - A code is emailed **only** if the email exists in `admin_users`, is active, has no TOTP and is not passkey-only.
   - The response is identical either way (anti-enumeration), and there is a 60-second cooldown.
2. The user enters `الرمز المكوّن من 6 أرقام` (`#loginCode`) and clicks `تأكيد الدخول`. This calls `login-verify`.
   - If the user has TOTP enabled, **the 6-digit code must be the TOTP code, not an email code.**
   - Five failed attempts in 15 minutes lock the email.
3. Other buttons on the login screen:
   - `الدخول بمفتاح المرور` (`passkey-login-options` / `-verify`)
   - resend (`send-code-btn`)
   - `← تغيير البريد الإلكتروني`
   - a recovery button (`recovery-request`, which emails the owner)
4. Authorization:
   - The session lives in `api_sessions`. `leaders-api` admin actions (`L('admin.*')`) re-validate the same token through `adminFromToken` against `api_sessions` and `admin_users`.
   - Roles from `admin_users.role_id` are `super_admin` (`مدير عام`), `admin` (`مدير نظام`) and `viewer` (`مراقب`). A viewer gets `canWrite=false` and the chip `عرض فقط`.
   - The Users section of Settings shows only for `super_admin`. The `is_owner` account is protected.
   - There is no Turnstile on admin login.

## 2.2 Shell and nav (`App.jsx`, `route.js`)
Routes are hash-based:
- `#/contacts`
- `#/leaders/<tab>[/<id>]`
- `#/matrix/<tab>[/<id>]`
- `#/visits`

Filters go after `?`.

| Element | Label | Action | Class |
|---|---|---|---|
| header | `بحث Ctrl K` (or Ctrl+K) | Palette global search | SAFE |
| header | `⚙` (`aria-label="الإعدادات"`) | Settings modal | SAFE (open) |
| header | `خروج` | `logout` | SAFE |
| context bar | `طلبات التواصل`, `تطبيق القادة`, `مصفوفة التأثير`, `زيارات الموقع` (pending badges) | navigate | SAFE |

## 2.3 Leaders context (`screens/Leaders.jsx`) — grouped side nav
The group buttons (`مجموعة <g>`) fold and unfold their group. The tabs, `#/leaders/<key>`, are grouped as follows:
- **اليومي**: `نظرة عامة`(overview), `المشاركون`(participants, default), `القاعة الحية`(hall), `مشاريع التخرج`(capstones), `الحضور والجلسات`(activities), `الخبراء`(experts)
- **المحتوى**: `الرحلة والمتطلبات`(journey), `كتيب القائد`(handbook), `بنك كاتون`(katon), `مختبر القائد`(lab), `أسئلة القياس`(assessment), `بنك المحتوى`(content)
- **البرامج**: `البرامج والدفعات`(programs), `الجهات`(orgs), `المسارات الـ27`(tracks), `المستويات والتسكين`(levels)
- **النتائج**: `المدفوعات`(payments), `قياس الأثر`(impact), `الشهادات`(certs), `قوالب البريد`(mail)

Clicking any tab or row link is SAFE. The tables below cover writes. **Default rule: every admin write is UNSAFE** because it touches system configuration or other users. The exceptions are read-only views, exports and `أرسل نسخة لي`.

| Screen (route) | Buttons and labels | API | Class |
|---|---|---|---|
| Overview `#/leaders/overview` | `اضبطه`, name links, `متطلبات مرسلة للمراجعة`, `نماذج تعليمية مُرسلة`, track links, `فتح كتيب القائد`, org links, status pills | `admin.overview`, `admin.health`, `admin.reviews`, `admin.impact` | SAFE |
| Overview | `افتح حساب العرض` | `admin.demo-open` (demo link) | SAFE-ish (demo account) |
| Overview | `أعِده إلى البداية` | `admin.demo-reset` | UNSAFE (resets the demo account) |
| Participants list `#/leaders/participants` | filters / FilterBar, `تصدير Excel`, `+ مشارك`, `استيراد`, row open | `admin.participants` | SAFE (export, open) |
| Participants list | `+ مشارك` → form | `admin.create-participant` | UNSAFE |
| Participants list | `استيراد` → `تحقق من المسجلين` (dry) / `أضف N مشاركًا` | `admin.participants-import` | dry run SAFE; add UNSAFE |
| Participants list | bulk select → `نقل` / `إلغاء التحديد` | `admin.assign-org` | UNSAFE / SAFE |
| Participant detail `#/leaders/participants/<id>` | `→ كل المشاركين`, `فتح (رابط مؤقت، يُسجَّل الفتح)`, `الملف` | `admin.participant`, `admin.evidence-url` (audited) | SAFE (audited read) |
| Participant detail | `سجّله` | `admin.cohort-enroll` | UNSAFE |
| Participant detail | `تغيير الحالة` | `admin.status` | UNSAFE |
| Participant detail | `إعادة القياس` | `admin.reset-assessment` | UNSAFE |
| Participant detail | `تعديل البيانات` | `admin.participant-save` | UNSAFE |
| Participant detail | `اعتماد المسار وفتح البرنامج` / `تحديث الاعتماد` | `admin.approve` (emails the participant) | UNSAFE |
| Participant detail | requirement `اعتماد` / `إعادة مع ملاحظة` / `إلغاء` | `admin.review` | UNSAFE |
| Participant detail | stage override `إلغاء التدخل` / `افتحها له` / `اعتمد اكتمالها` / `أعفه منها` | `admin.stage-override` | UNSAFE |
| Participant detail | `حذف المشارك…` → type email → `حذف نهائي` | `admin.participant-delete` | **UNSAFE (delete)** |
| Participant detail | Milestones panel: `+ معلم`, `تحرير`, `مدّد له`, `قيّم بالمعيار` / `اعتمد الإنجاز`, `إلغاء الاعتماد`, `وزّع على مدة الدفعة`, `حفظ الجدول`, `معلم لنهاية كل مرحلة` | `admin.milestone-*`, `admin.participant-milestone`, `admin.cohort-save` | UNSAFE |
| Participant detail | FinalEval: `حفظ مسودة`, `ارفع للاعتماد`, `اعتمد`, `أعِد للمراجعة`, `إعادة فتح`, `حفظ` | `admin.final-eval-*` (approval triggers **certificate issuance**) | **UNSAFE** |
| ReqQueue (in overview / participants) | `الدليل`, name | `admin.evidence-url` | SAFE |
| ReqQueue | `اعتماد المحدد (N)` | `admin.review` bulk | UNSAFE |
| Orgs `#/leaders/orgs[/<id>]` | filter pills `نشطة`…, `لوحة الجهة`, `→ كل الجهات`, `تصدير Excel`, `تقرير الجهة`, track pills, `عرض القائمة` | `admin.orgs`, `admin.org` | SAFE |
| Orgs | `نسخ رابط الدعوة`, `نسخ رابط الحملة` | clipboard | SAFE |
| Orgs | `ربط` (typed org name) / `نقل` | `admin.assign-org` | UNSAFE |
| Orgs | `+ جهة جديدة` / `تحرير` → OrgForm | OrgForm | open SAFE |
| OrgForm (modal) | logo `إزالة`, `بألوانه` / `أحادي اللون`, colors, seats `−`/`+`, domains `×`, `+ ملاحظات داخلية`, `حفظ التعديلات` / `إنشاء الجهة`, `إلغاء`, `✕` | `admin.save` | UNSAFE (save); SAFE (cancel) |
| OrgForm | `إعادة إصدار شهادات الجهة…` | `admin.certificate-reissue-org` | **UNSAFE (certificates)** |
| OrgForm | `إيقاف الجهة` | | UNSAFE |
| OrgForm | `حذف الجهة…` → type name → `حذف نهائي` | `admin.delete` | **UNSAFE** |
| CoordinatorPanel (in org) | `+ مطّلع` → `إضافة وإرسال الدعوة` | `admin.coordinator-save`, then invite email | UNSAFE |
| CoordinatorPanel | `شاهد كما يراها` | `admin.coordinator-preview` | SAFE |
| CoordinatorPanel | `تعديل البيانات`, delete (confirm `حذف`), `إعادة إرسال الدعوة`, end sessions, `إعادة التفعيل`, suspend | `admin.coordinator-*` | UNSAFE |
| OrgFinance | `كشف حساب CSV`, names | `admin.org-finance` | SAFE |
| Tracks `#/leaders/tracks[/<key>]` | track cards, chapter anchors, `→ كل المسارات`, person links | `admin.track` | SAFE |
| Tracks | `تحرير هوية المسار`, `تعديل الباب` | `admin.save` | UNSAFE |
| Programs `#/leaders/programs` | `+ برنامج جديد`, `تكرار`, `برنامج جديد منها`, `أرشفة` / `إعادة`, `احفظ نسخة`, `النسخ (N)`, `قارن بالحالي` (SAFE), `استرجع`, `الشهادة` (cert settings), `التقييم الختامي`, `حرّر الرحلة` (nav), `+ دفعة جديدة`, `تحرير`, `اربطه بجهة أو دفعة`, `المجموعات ونمط العمل`, `الجدول`, `رقِّ إلى vN`, `حفظ` | `admin.program-*`, `admin.cohort-*`, `admin.cert-settings`, `admin.final-eval-config` | UNSAFE (except compare and views) |
| Groups (modal) | `+ مجموعة`, `تسمية`, `حذف`, `توزيع متقارب المستوى` / `توزيع متنوع المستويات`, `حفظ نمط العمل`, `إغلاق` | `admin.cohort-group*` | UNSAFE |
| Hall `#/leaders/hall` | cohort buttons | `admin.programs`, `admin.peer` (read) | SAFE (live controls are in the expert portal) |
| Capstones `#/leaders/capstones[/<id>]` | status filters, `→ كل المشاريع`, `ملف المشارك`, `اقرأ الوثيقة` | `admin.capstones`, `admin.capstone` | SAFE |
| Capstones | `قبول وطلب تأييد الراعي` / `قبول واعتماد` | `admin.capstone-review` (emails the sponsor) | UNSAFE |
| Capstones | `إعادة للتحسين` | `admin.capstone-review` | UNSAFE |
| Capstones | `أعد إرسال الدعوة` | `admin.capstone-sponsor` | UNSAFE |
| Capstones | `اعتماد دون تأييد` | waive | UNSAFE |
| Activities `#/leaders/activities` | sub tabs `الجلسات الجماعية` / `الجلسات الفردية`, `قرأ n من m` | `admin.activities` | SAFE |
| Activities | `+ موعد`, edit / delete | `admin.workshop-save` / `-delete` | UNSAFE |
| Activities | `أرسل الدعوة` | `admin.workshop-invite` (**bulk email**) | UNSAFE |
| Activities | `اعرض رمز الحضور` | `admin.workshop-qr` | SAFE |
| Activities | `N حاضر` → `تسجيل حضور` / `إلغاء` | `admin.workshop-mark` | UNSAFE |
| Activities | coaching `+ جلسة يدوية`, `حضر`, `لم يحضر`, `أُلغيت`, `تراجع` | `admin.coaching-*` | UNSAFE |
| Activities | `أنا متاح لاتصال فوري (ساعة)` / `● متاح الآن، أغلق` | `admin.coach-available` | UNSAFE |
| Experts `#/leaders/experts[/<id>]` | list, filters, `→ كل الخبراء`, `رجوع` | `admin.experts`, `admin.expert` | SAFE |
| Experts | `+ خبير` → `إضافة وإرسال الدعوة` / `حفظ الملف` | `admin.expert-save` | UNSAFE |
| Experts | status moves (`اعتماد`, `عدم القبول`, `إلغاء الدعوة`, `إيقاف مؤقت`, `إيقاف`, `إعادة التفعيل`) | `admin.expert-set-status` | UNSAFE |
| Experts | resend invite | `admin.expert-invite` | UNSAFE |
| ExpertMatch (in experts) | list tabs, `اعرض الترشيح` | `admin.expert-requests`, `admin.expert-match` | SAFE |
| ExpertMatch | `أسند`, `أسند للأنسب`, `إلغاء`, `اكتملت الخدمة`, `أعد المحاولة` | `admin.expert-assign`, `admin.expert-request-*` | UNSAFE |
| Journey / Assessment / Levels (Methodology) `#/leaders/journey`, `assessment`, `levels` | `▲`/`▼`, stage / requirement / instrument / grid-cell edit modals with save, `جودة الأسئلة` (ItemQuality read, SAFE), `احسب`, `حفظ المعيار`, dim tabs | `admin.save`, `admin.reorder`, `admin.delete`, `admin.stage-create`, `admin.item-analysis` | UNSAFE (system content) |
| Content bank `#/leaders/content` | `+ مادة`, `تحرير`, `▲`/`▼` | `admin.save`, `admin.reorder`, `admin.delete` | UNSAFE |
| Handbook `#/leaders/handbook` | scope / view tabs, `الكتاب متصلًا` / `باب باب`, chapter / model selects (SAFE) | `admin.book-preview` | SAFE |
| Handbook | `تحرير الباب واختباره`, `حفظ الباب`, `+ نموذج جديد`, `تحرير النموذج`, `حفظ النموذج`, `حذف`, field `▲`/`▼`/`×` | `admin.save` / `admin.delete` | UNSAFE |
| Handbook | `قيّم N` → `اعتماد التقييم` / `إعادة للتطوير مع الملاحظات` | `admin.review-submission` | UNSAFE |
| Katon `#/leaders/katon` | `الجمل` / `إخفاء الجمل` | read | SAFE |
| Katon | `+ موضوع`, `تحرير`, `+ جملة`, `نشر` / `إيقاف`, `تعديل النقاط` | `admin.katon-*` | UNSAFE |
| Lab `#/leaders/lab` | items | `admin.lab` | SAFE |
| Lab | `+ افتح لجهة أو لمشارك` / `إغلاق` | `admin.lab-grant` / `admin.lab-revoke` | UNSAFE |
| Impact `#/leaders/impact` | Outcomes list, `تقرير الأثر PDF` | `admin.impact`, `admin.outcomes` | SAFE |
| Impact | `حفظ` | `admin.save` | UNSAFE |
| Payments `#/leaders/payments` | tabs `العمليات`, `طلبات الرعاية`, `الاستحقاقات`, `رعاية الجهات`, `الإعداد`; `تصدير CSV`; name links | `admin.payments`, `admin.sponsor-requests` | SAFE |
| Payments | `تحقق من Creem` | `admin.payment-reconcile` | UNSAFE-ish (may grant an entitlement) |
| Payments | `امنح` / `اسحب` | `admin.payment-grant` | UNSAFE |
| Payments | sponsor `ارفض` / `دفع فردي` / `أضف مقعدًا وأعفِ` / `اعتمد بعد تعديل العقد` | `admin.sponsor-decide` | UNSAFE |
| Payments | `فعّل الدفع` / `أوقف الدفع (يمر الجميع مجانًا)` / `احفظ` | `admin.payment-settings` | **UNSAFE (system)** |
| Certificates `#/leaders/certs` | `عرض`, `رابط التحقق`, name links | `admin.certificates`, `admin.certificate` | SAFE |
| Certificates | `إعادة إصدار` → `إعادة الإصدار` | `admin.certificate-reissue` | **UNSAFE** |
| Certificates | `إلغاء` (revoke) | `admin.certificate-revoke` | **UNSAFE** |
| Certificates | `حفظ الإعدادات` | `admin.cert-settings-save` | UNSAFE |
| Mail templates `#/leaders/mail` | template list buttons | `admin.mail-gallery` | SAFE |
| Mail templates | `أرسل نسخة لي` | `admin.mail-send-test` (to the admin themself) | TEST-WRITE |

## 2.4 Other contexts
| Screen | Elements | API | Class |
|---|---|---|---|
| Contacts `#/contacts` | stat cards, filters, pagination `‹`/`›`/numbers, `↻ تحديث`, `حاول مرة أخرى`, copy, `✕` | `list-contacts` | SAFE |
| Contacts | status buttons (`STATUS_AR`), `✉ إرسال رد بالبريد` (opens mailto and marks replied) | `update-contact` | UNSAFE (changes a lead's status) |
| Matrix `#/matrix/<tab>` | tabs `نظرة عامة`, `التسجيلات`, `التقارير`, `المحتوى`, `الإحصاءات`; `افتح`, `كل التسجيلات`, `التقارير`, `→ كل التسجيلات`; sub-tabs `المواعيد` / `التحليل` / `الشبكة` | `list-regs` | SAFE |
| Matrix | `احفظ المواعيد`, approve-complete (confirm), `افتح للتعديل` / `اقبل إعادة الفتح`, `ارفض الطلب` | `update-reg`, `unlock-reg` | UNSAFE |
| Matrix | content `العمليات` / `نصوص الموقع`: `احفظ العملية`, `احفظ` | `save-process`, `save-content` | UNSAFE |
| Matrix | `تراجع` | local | SAFE |
| Visits `#/visits` | site filter `كل المواقع` / `الموقع الرئيسي` / `مصفوفة التأثير` / `صفحة القادة` | `admin.visits`, `admin.trends` | SAFE |
| Settings modal (`⚙`) | profile rows, `✕` | | SAFE |
| Settings | `+ إضافة مفتاح` (passkey), `حذف` | `passkey-register-*` / `passkey-delete` | TEST-WRITE (own) / UNSAFE (lockout risk) |
| Settings | passkey-only `تفعيل` / `تعطيل` | `passkey-only` | UNSAFE (can lock the account out of email login) |
| Settings | TOTP setup / `تأكيد الإعداد` / `تعطيل TOTP` | `setup-totp`, `confirm-totp`, `disable-totp` | UNSAFE (own auth factor) |
| Settings | `إنهاء الجلسات الأخرى` | `sessions-revoke-others` | TEST-WRITE |
| Settings | Users (super_admin): `+ إضافة` → `حفظ` / `إلغاء`, role select, active toggle, reset-2FA | `add-user`, `update-user` | **UNSAFE (permissions)** |

---

# 3. Public site and matrix app

## 3.1 home/ → mi.sunkvalue.com (static HTML)
| Page | Main links and controls (exact text) | Forms / API | Class |
|---|---|---|---|
| `/` index (`Milestone Impact \| من النية... إلى الأثر`) | anchors `المفهوم`, `المنظومة`, `النموذج`, `المسارات`, `الحوكمة`; links `/leaders/` (`للقادة`), `/leaders/#enter` (`دخول البرنامج`), `/projects/` (`المشروعات التنموية`), `/assessment/` (`مقياس الأثر`), `/governance/`, `https://matrix.sunkvalue.com` (`مصفوفة التأثير`), external `manzoma.sa`, `sunkvalue.com`; `نزّل الفيلم`; burger `فتح القائمة` / `إغلاق القائمة` | — | SAFE |
| all pages | `تواصل معنا` / `طلب موعد` open the contact "typeform" modal (`#tfModal`, aria `إغلاق النموذج`). Steps: interest radios (`data-value` general/leaders/matrix/partnership on index; A/B/C elsewhere), `#qName` `الاسم الكامل`, `#qOrg` `اسم الجهة`, `#qEmail`, `#qPhone`, `#qContext`; nav `#tfNext` (`موافق` → last `إرسال الرسالة`), `#tfPrev` | POST `send-otp` `{action:'contact'}` (Turnstile when required); inserts `contact_requests` and emails the admin and the sender | open / close SAFE; **submit UNSAFE** (real lead plus emails) |
| `/leaders/` | anchors `التحدي`, `المنهجية`, `المسارات`, `خارطة التفعيل`, `الدخول`; tabs `مسار الأفراد` / `مسار المؤسسات` (role=tab); door links to `https://leaders.sunkvalue.com/`, `/org`, `/x`; `المنظومة ↗`, `المصفوفة ↗` | contact modal (`openTypeform('C')` partnership) | SAFE / submit UNSAFE |
| `/assessment/` (`مقياس جاهزية الأثر`) | `ابدأ المقياس` (#asStart), answer options, `السابق` (#asPrev), gate form `#asGate` (name, organization, email, phone, honeypot `website`) → `#asGateBtn` (`اعرض التقرير…`), `طباعة أو حفظ PDF` (#asPrint), `إعادة المقياس` (#asRestart); link `تعرّف على البرنامج`, `سياسة الخصوصية` | gate POSTs directly to Supabase REST `contact_requests` (`assessment.js`) | quiz SAFE; **gate submit UNSAFE** (creates a lead) |
| `/governance/` | anchors `المبادئ`, `الهيكل`, `المنظومة القيادية`, councils `مجلس الأمناء`, `المجلس التأسيسي`, `المجلس التنفيذي`, `المجلس التشغيلي` | contact modal | SAFE |
| `/projects/` | anchors `التحدي`, `نطاق الخدمة`, `رحلة العمل`; `طلب تقييم مبدئي` (modal B) | contact modal | SAFE / submit UNSAFE |
| `/pricing.html` | `ابدأ الاشتراك` (mailto), `سياسة الاسترداد`, `شروط الخدمة`, `الخصوصية` | — | SAFE |
| `/privacy.html`, `/terms.html`, `/refund.html`, `/404.html` | static | — | SAFE |

## 3.2 src/ → matrix.sunkvalue.com (React, `src/App.jsx`)
Screens are held in state: `splash` (Landing), `register`, `resume`, `main`, and `admin-login` (redirects to `admin.sunkvalue.com/#/matrix`). Main tabs are hash-synced (`useTabHash`): `#/matrix`, `#/schedule`, `#/report` (after 3 dated cells), `#/summary`, `#/output` (after submission).

| Screen | Elements (exact) | API (`user-api`) | Class |
|---|---|---|---|
| Landing | `بدء الرحلة` / `بدء الرحلة ←`, `استئناف الجلسة`, `⌘ دخول الإدارة` | — | SAFE |
| Register | heading `بدء الرحلة`; `الاسم الكامل`, `رقم الجوال` (05XXXXXXXX), `البريد الإلكتروني`; `إرسال رمز التحقق ✉`; `لديك حساب؟` switch; `→ العودة للرئيسية` | `register-send` (Turnstile through `withHuman` when the server asks) | TEST-WRITE |
| OTP step | heading `رمز التحقق`; input `#reg-otp` / `#resume-otp`; `تحقق ✓`; resend (60-second cooldown); change details | `verify` | TEST-WRITE |
| Resume | phone, submit, `🔑 …` passkey login, `مسجّل جديد؟` | `resume-send`, `passkey-login-*` | SAFE / TEST-WRITE |
| Main nav | tabs `المصفوفة`, `الجدول`, `التقرير`, `المخرجات`, `النهائي` (also in the mobile bottom bar); `خروج`; save pill `جارٍ الحفظ…` / `تم الحفظ ✓` | — | SAFE |
| Matrix tab / ProcessModal | cell click opens the modal `تحديد تاريخ البدء`, date, `حفظ`, clear, confirm toggle, `إغلاق` | `save` | TEST-WRITE |
| Summary / Output | `✓ موافقة نهائية` (submit plan), `🔓 طلب إعادة فتح`, `طباعة أو حفظ PDF`, `🖨 طباعة` | `save {submitted}` / `reopenRequested` | TEST-WRITE (submit locks the plan; reopen needs admin) |
| Demographics | `← رجوع`, `✕ حذف` rows | local / `save` | TEST-WRITE |
| Post-login passkey prompt | register passkey | `passkey-register-*` | TEST-WRITE |

---

# 4. Key journeys (participant, leaders.sunkvalue.com)

**A. Register → assessment → payment → journey → certificate**
1. **SignIn** `/`:
   - Use `المتابعة بحساب Google`, or type `البريد الإلكتروني` and click `متابعة`.
   - Solve Turnstile if shown.
   - For a new email, the **name step** follows: `الاسم الكامل`, then `أرسل الرمز`.
   - On the **code step**, type 6 digits into `رمز التحقق`, or open the `/verify?e=&t=` email link.
   - The account is created and consent is recorded.
2. (Consent `أوافق وأتابع` appears only if needed.)
3. **OnboardingWelcome**: `أهلًا <name>، لنبدأ`, then `لنبدأ`.
4. **Profile**: `عرّفنا بك`. Fill the fields, then `حفظ والانتقال لتحديد المستوى` (`profile.save`).
5. **Paywall(assessment)**: `القياس المبدئي`, `ادفع وابدأ القياس`. Present only if payment is on and the user is not sponsored. **Stop here and do not click pay**, or use a test sponsor code with `تحقق`.
6. **Assessment (قياس)**: `لنحدد نقطة انطلاقك`, then `ابدأ`. Pick a radio option per question, then `التالي`, …, `أرسل واعرض نتيجتي` (`assessment.submit`).
7. **AwaitingApproval** `مسارك قيد الاعتماد` (or Journey `نتيجتك قيد المراجعة` with the `ما بعد ذلك` card when payment is off). The admin then clicks `اعتماد المسار وفتح البرنامج` (`admin.approve`), which is UNSAFE and admin-only.
8. **Paywall(program)**: `أكمل رحلتك في البرنامج`, `ادفع وأكمل البرنامج`. This sends the user to a **real Creem checkout. STOP.** The return URL is `/?paid=program`, which shows `نؤكد دفعتك…`.
9. **Journey (رحلة)**: nav `رحلتي`. The heading is `<name>، رحلتك مفتوحة`, with stages under `مراحل الرحلة`. From here:
   - mark requirements with `أنجزته`
   - `كتيبي` → chapters, quiz and models `تسليم للمستشار`
   - `مبادرتي` → `سلّم الوثيقة للمستشار`
   - `القاعة` → `ادخل القاعة`
   - `أثري` → the post assessment `ابدأ القياس البعدي` and `ادعُ مديرك…`
10. **Final evaluation and certificate**: the expert (`ارفع للاعتماد` / `اعتمد`) and admin FinalEval approve with decision pass. The certificate is issued automatically. It then appears in the Journey **CertificateCard**, which changes from `شهادتك قيد الإصدار` to `مبارك، صدرت شهادتك`, with `اعرض الشهادة` and `أضفها إلى LinkedIn`. It can be verified publicly at `/v/<serial>`.

**B. Other roles**
- **Expert**: `/expert` (`أرسل طلب الانضمام`), then admin `اعتماد`. The expert logs in at `/x` (`أرسل الرمز`, `دخول`, or Google), then `أوافق وأتابع`, then the dashboard.
- **Org coordinator**: admin `+ مطّلع`, then the invite email. The coordinator logs in at `/org` (`أرسل الرمز`, code), then `أوافق وأتابع`, then the org dashboard.
- **Rater**: the participant invites a rater (`أرسل الدعوة`). The rater gets an email linking to `/rate?t=` and clicks `أرسل التقدير`.
- **Sponsor**: admin `قبول وطلب تأييد الراعي` emails `/sponsor?t=`, where the sponsor clicks `أؤيد المبادرة`. Later, `/outcome?t=` offers `أؤكد الأرقام`.
