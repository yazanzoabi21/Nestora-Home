create table if not exists public.customer_content_pages (
  id uuid primary key default gen_random_uuid(),
  slug varchar(120) not null unique,
  page_type varchar(50) not null default 'content',
  title_en varchar(255) not null,
  title_ar varchar(255) not null,
  subtitle_en text null,
  subtitle_ar text null,
  content_en jsonb not null default '[]'::jsonb,
  content_ar jsonb not null default '[]'::jsonb,
  meta_title_en varchar(255) null,
  meta_title_ar varchar(255) null,
  meta_description_en text null,
  meta_description_ar text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_content_pages_slug_not_blank check (btrim(slug) <> ''),
  constraint customer_content_pages_page_type_not_blank check (btrim(page_type) <> ''),
  constraint customer_content_pages_title_en_not_blank check (btrim(title_en) <> ''),
  constraint customer_content_pages_title_ar_not_blank check (btrim(title_ar) <> ''),
  constraint customer_content_pages_sort_order_nonnegative check (sort_order >= 0),
  constraint customer_content_pages_content_en_array check (jsonb_typeof(content_en) = 'array'),
  constraint customer_content_pages_content_ar_array check (jsonb_typeof(content_ar) = 'array')
);

create index if not exists customer_content_pages_public_idx
  on public.customer_content_pages (slug, sort_order)
  where is_active = true and is_published = true;

create table if not exists public.customer_faqs (
  id uuid primary key default gen_random_uuid(),
  question_en text not null,
  question_ar text not null,
  answer_en text not null,
  answer_ar text not null,
  category varchar(100) null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_faqs_question_en_not_blank check (btrim(question_en) <> ''),
  constraint customer_faqs_question_ar_not_blank check (btrim(question_ar) <> ''),
  constraint customer_faqs_answer_en_not_blank check (btrim(answer_en) <> ''),
  constraint customer_faqs_answer_ar_not_blank check (btrim(answer_ar) <> ''),
  constraint customer_faqs_sort_order_nonnegative check (sort_order >= 0)
);

create index if not exists customer_faqs_active_sort_idx
  on public.customer_faqs (sort_order, created_at)
  where is_active = true;
create index if not exists customer_faqs_category_idx
  on public.customer_faqs (category)
  where category is not null;

create table if not exists public.customer_contact_messages (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid null references public.profiles(id) on delete set null,
  full_name varchar(255) not null,
  email varchar(255) not null,
  phone varchar(50) null,
  subject varchar(255) not null,
  message text not null,
  status varchar(30) not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contact_messages_full_name_not_blank check (btrim(full_name) <> ''),
  constraint customer_contact_messages_email_not_blank check (btrim(email) <> ''),
  constraint customer_contact_messages_email_shape check (position('@' in email) > 1),
  constraint customer_contact_messages_subject_not_blank check (btrim(subject) <> ''),
  constraint customer_contact_messages_message_not_blank check (btrim(message) <> ''),
  constraint customer_contact_messages_message_length check (char_length(message) <= 5000),
  constraint customer_contact_messages_status_check
    check (status in ('new', 'in_progress', 'resolved', 'closed'))
);

create index if not exists customer_contact_messages_status_created_idx
  on public.customer_contact_messages (status, created_at desc);
create index if not exists customer_contact_messages_customer_idx
  on public.customer_contact_messages (customer_user_id, created_at desc)
  where customer_user_id is not null;

create or replace function public.set_customer_help_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_customer_help_updated_at() from public, anon, authenticated;

drop trigger if exists set_customer_content_pages_updated_at on public.customer_content_pages;
create trigger set_customer_content_pages_updated_at
before update on public.customer_content_pages
for each row execute function public.set_customer_help_updated_at();

drop trigger if exists set_customer_faqs_updated_at on public.customer_faqs;
create trigger set_customer_faqs_updated_at
before update on public.customer_faqs
for each row execute function public.set_customer_help_updated_at();

drop trigger if exists set_customer_contact_messages_updated_at on public.customer_contact_messages;
create trigger set_customer_contact_messages_updated_at
before update on public.customer_contact_messages
for each row execute function public.set_customer_help_updated_at();

alter table public.customer_content_pages enable row level security;
alter table public.customer_faqs enable row level security;
alter table public.customer_contact_messages enable row level security;

revoke all on table public.customer_content_pages from anon, authenticated;
revoke all on table public.customer_faqs from anon, authenticated;
revoke all on table public.customer_contact_messages from anon, authenticated;

grant select on table public.customer_content_pages to anon, authenticated;
grant insert, update, delete on table public.customer_content_pages to authenticated;
grant select on table public.customer_faqs to anon, authenticated;
grant insert, update, delete on table public.customer_faqs to authenticated;
grant insert on table public.customer_contact_messages to anon, authenticated;
grant select, update, delete on table public.customer_contact_messages to authenticated;

drop policy if exists "Public can read published customer content" on public.customer_content_pages;
create policy "Public can read published customer content"
  on public.customer_content_pages for select to anon, authenticated
  using (is_active = true and is_published = true);

drop policy if exists "Admins can manage customer content" on public.customer_content_pages;
create policy "Admins can manage customer content"
  on public.customer_content_pages for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  );

drop policy if exists "Public can read active customer FAQs" on public.customer_faqs;
create policy "Public can read active customer FAQs"
  on public.customer_faqs for select to anon, authenticated
  using (is_active = true);

drop policy if exists "Admins can manage customer FAQs" on public.customer_faqs;
create policy "Admins can manage customer FAQs"
  on public.customer_faqs for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  );

drop policy if exists "Anonymous visitors can submit contact messages" on public.customer_contact_messages;
create policy "Anonymous visitors can submit contact messages"
  on public.customer_contact_messages for insert to anon
  with check (customer_user_id is null and status = 'new');

drop policy if exists "Customers can submit contact messages" on public.customer_contact_messages;
create policy "Customers can submit contact messages"
  on public.customer_contact_messages for insert to authenticated
  with check ((customer_user_id is null or customer_user_id = auth.uid()) and status = 'new');

drop policy if exists "Admins can manage customer contact messages" on public.customer_contact_messages;
create policy "Admins can manage customer contact messages"
  on public.customer_contact_messages for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  );

insert into public.customer_content_pages (
  slug, page_type, title_en, title_ar, subtitle_en, subtitle_ar,
  content_en, content_ar, meta_title_en, meta_title_ar,
  meta_description_en, meta_description_ar, sort_order
)
values
  (
    'about-us', 'content', 'About Nestora Home', 'من نحن في Nestora Home',
    'Thoughtful products for a more comfortable, practical home.',
    'منتجات مختارة بعناية لمنزل أكثر راحة وعملية.',
    '[{"type":"text","title":"Our Story","body":"Nestora Home brings together useful, well-considered products for kitchens and everyday living. We focus on making it easier to discover practical pieces that complement the way you use your home."},{"type":"text","title":"Our Mission","body":"Our mission is to make everyday home shopping clear, convenient, and dependable through thoughtful selection and helpful customer support."},{"type":"list","title":"What We Offer","items":["Kitchen tools and cookware for everyday use","Home accessories and practical organization solutions","Smart, useful products selected for modern homes"]},{"type":"notice","title":"Why Shop With Us","body":"We aim to provide clear product information, straightforward ordering, and responsive support before and after your purchase."}]'::jsonb,
    '[{"type":"text","title":"قصتنا","body":"تجمع Nestora Home منتجات عملية ومدروسة للمطبخ والحياة اليومية. نركّز على تسهيل اكتشاف قطع مفيدة تتناسب مع طريقة استخدامكم للمنزل."},{"type":"text","title":"مهمتنا","body":"مهمتنا هي جعل التسوق للمنزل واضحاً ومريحاً وموثوقاً من خلال اختيار مدروس ودعم مفيد للعملاء."},{"type":"list","title":"ما نقدمه","items":["أدوات مطبخ وأواني طهي للاستخدام اليومي","إكسسوارات منزلية وحلول تنظيم عملية","منتجات ذكية ومفيدة مختارة للمنازل العصرية"]},{"type":"notice","title":"لماذا تتسوقون معنا","body":"نسعى إلى تقديم معلومات واضحة عن المنتجات وطلب سهل ودعم متجاوب قبل الشراء وبعده."}]'::jsonb,
    'About Nestora Home', 'من نحن | Nestora Home',
    'Learn about Nestora Home and our approach to practical products for everyday living.',
    'تعرّفوا إلى Nestora Home ونهجنا في اختيار المنتجات العملية للحياة اليومية.', 10
  ),
  (
    'shipping-policy', 'policy', 'Shipping Policy', 'سياسة الشحن',
    'Helpful information about order processing and delivery.',
    'معلومات مفيدة حول تجهيز الطلبات والتوصيل.',
    '[{"type":"text","title":"Shipping Information","body":"Available delivery options and any applicable charges are presented during checkout based on the order and delivery address."},{"type":"text","title":"Order Processing","body":"Orders are reviewed and prepared after they are placed. Processing may vary depending on product availability and order details."},{"type":"text","title":"Delivery","body":"Delivery timing depends on the destination, selected delivery option, and order circumstances. We will use the contact details supplied with the order when coordination is needed."},{"type":"list","title":"Delivery Address","items":["Please provide a complete and accurate address","Include a reachable phone number","Review delivery details before confirming your order"]},{"type":"notice","title":"Delivery Issues","body":"If a delivery is delayed, incomplete, or arrives with an issue, contact us with your order details so our team can assist."}]'::jsonb,
    '[{"type":"text","title":"معلومات الشحن","body":"تظهر خيارات التوصيل المتاحة وأي رسوم مطبقة أثناء إتمام الطلب وفقاً لمحتوى الطلب وعنوان التوصيل."},{"type":"text","title":"تجهيز الطلب","body":"تتم مراجعة الطلبات وتجهيزها بعد تأكيدها، وقد تختلف مدة التجهيز بحسب توفر المنتجات وتفاصيل الطلب."},{"type":"text","title":"التوصيل","body":"يعتمد توقيت التوصيل على الوجهة والخيار المحدد وظروف الطلب. سنستخدم بيانات التواصل المرفقة بالطلب عند الحاجة إلى التنسيق."},{"type":"list","title":"عنوان التوصيل","items":["يرجى إدخال عنوان كامل ودقيق","إضافة رقم هاتف يمكن التواصل من خلاله","مراجعة تفاصيل التوصيل قبل تأكيد الطلب"]},{"type":"notice","title":"مشكلات التوصيل","body":"إذا تأخر التوصيل أو كان الطلب غير مكتمل أو وصل مع مشكلة، تواصلوا معنا وأرسلوا تفاصيل الطلب لنتمكن من المساعدة."}]'::jsonb,
    'Shipping Policy | Nestora Home', 'سياسة الشحن | Nestora Home',
    'Read general information about Nestora Home order processing and delivery.',
    'اطّلعوا على المعلومات العامة حول تجهيز الطلبات والتوصيل لدى Nestora Home.', 20
  ),
  (
    'return-policy', 'policy', 'Return Policy', 'سياسة الإرجاع',
    'General guidance for return requests and product issues.',
    'إرشادات عامة لطلبات الإرجاع والمشكلات المتعلقة بالمنتجات.',
    '[{"type":"text","title":"Returns","body":"If you would like to request a return, contact us promptly with your order information and the reason for the request. Eligibility is reviewed according to the product and order circumstances."},{"type":"list","title":"Return Eligibility","items":["Keep the product and its included accessories in their received condition","Provide the order details and a clear reason for the request","Do not continue using a product after discovering a fault"]},{"type":"notice","title":"Damaged or Incorrect Products","body":"If an item arrives damaged or differs from what you ordered, contact us with the order details and clear supporting photos when possible."},{"type":"text","title":"Non-returnable Items","body":"Some items may not be eligible for return for hygiene, safety, customization, or condition reasons. Any applicable restriction will be assessed and communicated for the specific request."},{"type":"text","title":"Refund Processing","body":"When a return and refund are approved, the available refund method and processing information will be confirmed with you."},{"type":"text","title":"Contact Us","body":"Use the Contact Us page if you need help with a return or an order issue."}]'::jsonb,
    '[{"type":"text","title":"الإرجاع","body":"لطلب إرجاع منتج، تواصلوا معنا في أقرب وقت مع معلومات الطلب وسبب الطلب. تتم مراجعة الأهلية وفقاً للمنتج وظروف الطلب."},{"type":"list","title":"أهلية الإرجاع","items":["الحفاظ على المنتج وملحقاته بالحالة التي تم استلامها بها","تزويدنا بتفاصيل الطلب وسبب واضح للطلب","التوقف عن استخدام المنتج بعد اكتشاف أي عطل"]},{"type":"notice","title":"المنتجات التالفة أو غير الصحيحة","body":"إذا وصل المنتج تالفاً أو مختلفاً عن الطلب، تواصلوا معنا مع تفاصيل الطلب وصور واضحة عند الإمكان."},{"type":"text","title":"المنتجات غير القابلة للإرجاع","body":"قد لا تكون بعض المنتجات مؤهلة للإرجاع لأسباب تتعلق بالنظافة أو السلامة أو التخصيص أو حالة المنتج. تتم مراجعة أي قيود وشرحها بحسب الطلب المحدد."},{"type":"text","title":"معالجة المبلغ المسترد","body":"عند الموافقة على الإرجاع والاسترداد، سنؤكد معكم طريقة الاسترداد المتاحة ومعلومات المعالجة."},{"type":"text","title":"تواصلوا معنا","body":"استخدموا صفحة التواصل معنا إذا كنتم بحاجة إلى مساعدة بخصوص إرجاع أو مشكلة في طلب."}]'::jsonb,
    'Return Policy | Nestora Home', 'سياسة الإرجاع | Nestora Home',
    'Review general guidance for return requests, damaged items, and refunds.',
    'راجعوا الإرشادات العامة لطلبات الإرجاع والمنتجات التالفة والمبالغ المستردة.', 30
  ),
  (
    'privacy-policy', 'policy', 'Privacy Policy', 'سياسة الخصوصية',
    'A clear overview of how information may be used when you visit or shop with us.',
    'نظرة واضحة على كيفية استخدام المعلومات عند زيارة الموقع أو التسوق معنا.',
    '[{"type":"text","title":"Information We Collect","body":"We may collect information you provide when creating an account, placing an order, saving delivery details, contacting us, or interacting with website features. This can include contact, order, delivery, and account information."},{"type":"list","title":"How We Use Information","items":["Provide and manage requested services","Process and support orders","Maintain account and shopping features","Respond to questions and improve the customer experience"]},{"type":"text","title":"Orders and Payments","body":"Order information is used to process purchases, arrange delivery, provide support, and maintain transaction records. Payment handling may involve the payment option selected during checkout."},{"type":"text","title":"Cookies and Local Storage","body":"The website may use browser storage and similar technologies to remember language, session, cart, and preference information and to support essential functionality."},{"type":"notice","title":"Data Security","body":"We use reasonable technical and organizational measures intended to protect information. No online system can guarantee absolute security."},{"type":"text","title":"Third-Party Services","body":"Some functions may rely on service providers such as hosting, authentication, delivery, communication, analytics, or payment services. Their handling of information is governed by their own terms and policies."},{"type":"text","title":"Your Choices","body":"You may update available account information and contact us with privacy-related questions or requests. Some records may need to be retained for legitimate operational or legal purposes."},{"type":"text","title":"Contact Us","body":"Use the Contact Us page if you have a question about this policy or your information."}]'::jsonb,
    '[{"type":"text","title":"المعلومات التي نجمعها","body":"قد نجمع المعلومات التي تقدمونها عند إنشاء حساب أو تقديم طلب أو حفظ تفاصيل التوصيل أو التواصل معنا أو استخدام ميزات الموقع، ومنها معلومات الاتصال والطلب والتوصيل والحساب."},{"type":"list","title":"كيف نستخدم المعلومات","items":["تقديم الخدمات المطلوبة وإدارتها","معالجة الطلبات ودعمها","تشغيل ميزات الحساب والتسوق","الرد على الاستفسارات وتحسين تجربة العملاء"]},{"type":"text","title":"الطلبات والمدفوعات","body":"تُستخدم معلومات الطلب لمعالجة المشتريات وترتيب التوصيل وتقديم الدعم والاحتفاظ بسجلات المعاملات. وقد تتضمن معالجة الدفع الجهة المرتبطة بالخيار المحدد أثناء إتمام الطلب."},{"type":"text","title":"ملفات تعريف الارتباط والتخزين المحلي","body":"قد يستخدم الموقع تخزين المتصفح وتقنيات مشابهة لتذكر اللغة والجلسة والسلة والتفضيلات ودعم الوظائف الأساسية."},{"type":"notice","title":"أمن البيانات","body":"نستخدم تدابير تقنية وتنظيمية معقولة تهدف إلى حماية المعلومات، لكن لا يمكن لأي نظام عبر الإنترنت ضمان الأمان المطلق."},{"type":"text","title":"خدمات الجهات الخارجية","body":"قد تعتمد بعض الوظائف على مزودي خدمات مثل الاستضافة والمصادقة والتوصيل والتواصل والتحليلات أو الدفع، وتخضع طريقة تعاملهم مع المعلومات لشروطهم وسياساتهم."},{"type":"text","title":"خياراتكم","body":"يمكنكم تحديث معلومات الحساب المتاحة والتواصل معنا بشأن الأسئلة أو الطلبات المتعلقة بالخصوصية. وقد يلزم الاحتفاظ ببعض السجلات لأغراض تشغيلية أو قانونية مشروعة."},{"type":"text","title":"تواصلوا معنا","body":"استخدموا صفحة التواصل معنا لأي سؤال حول هذه السياسة أو معلوماتكم."}]'::jsonb,
    'Privacy Policy | Nestora Home', 'سياسة الخصوصية | Nestora Home',
    'Learn how Nestora Home may use information needed for accounts, orders, support, and site functionality.',
    'تعرّفوا إلى كيفية استخدام Nestora Home للمعلومات اللازمة للحسابات والطلبات والدعم ووظائف الموقع.', 40
  )
on conflict (slug) do nothing;

insert into public.customer_faqs (
  id, question_en, question_ar, answer_en, answer_ar, category, sort_order
)
values
  ('10000000-0000-4000-8000-000000000001', 'How can I place an order?', 'كيف يمكنني تقديم طلب؟', 'Browse the catalogue, add the products you want to your cart, and follow the checkout steps. You can review your order details before confirming.', 'تصفحوا المنتجات وأضيفوا ما ترغبون به إلى السلة ثم اتبعوا خطوات إتمام الطلب. يمكنكم مراجعة التفاصيل قبل التأكيد.', 'orders', 10),
  ('10000000-0000-4000-8000-000000000002', 'Do I need an account to shop?', 'هل أحتاج إلى حساب للتسوق؟', 'Available checkout options are shown during the order process. Creating an account also helps you access supported account features and order information.', 'تظهر خيارات إتمام الطلب المتاحة أثناء عملية الشراء. كما يساعدكم إنشاء حساب على استخدام ميزات الحساب ومعلومات الطلبات المتوفرة.', 'orders', 20),
  ('10000000-0000-4000-8000-000000000003', 'How is delivery arranged?', 'كيف يتم ترتيب التوصيل؟', 'Delivery details and available options are confirmed according to your order and address. Please provide accurate contact and address information.', 'يتم تأكيد تفاصيل وخيارات التوصيل وفقاً للطلب والعنوان. يرجى إدخال معلومات اتصال وعنوان دقيقة.', 'delivery', 30),
  ('10000000-0000-4000-8000-000000000004', 'What should I do if an item arrives damaged?', 'ماذا أفعل إذا وصل منتج تالف؟', 'Contact us with your order details and clear photos when possible. Our team will review the issue and explain the available next steps.', 'تواصلوا معنا مع تفاصيل الطلب وصور واضحة عند الإمكان. سيقوم فريقنا بمراجعة المشكلة وشرح الخطوات المتاحة.', 'returns', 40),
  ('10000000-0000-4000-8000-000000000005', 'How can I request a return?', 'كيف يمكنني طلب إرجاع؟', 'Use the Contact Us page and include your order information, the relevant product, and the reason for your request. Eligibility is reviewed for each request.', 'استخدموا صفحة التواصل معنا وأضيفوا معلومات الطلب والمنتج المعني وسبب الطلب. تتم مراجعة أهلية كل طلب على حدة.', 'returns', 50),
  ('10000000-0000-4000-8000-000000000006', 'How can I contact Nestora Home?', 'كيف يمكنني التواصل مع Nestora Home؟', 'Use the Contact Us form or one of the official social channels shown on that page and in the website footer.', 'استخدموا نموذج التواصل معنا أو إحدى قنوات التواصل الرسمية الظاهرة في الصفحة وتذييل الموقع.', 'support', 60)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
