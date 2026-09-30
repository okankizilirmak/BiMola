// Soru seti şeması, doğrulama ve AI promptu. Saf modül: hem sunucu hem tarayıcı kullanır.
// DOM veya Node bağımlılığı yoktur; içerik her zaman düz metin olarak ele alınır.
export const SCHEMA_VERSION = 1;
export const LIMITS = Object.freeze({
  bytes: 64 * 1024, minQuestions: 3, maxQuestions: 80, title: 60, category: 40, language: 12,
  text: 220, option: 90, explanation: 260, id: 40, chunkBytes: 2600, maxChunks: 40,
});

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const key = value => text(value).toLocaleLowerCase('tr');

// AI çıktısı bazen ```json çiti veya önsöz içerir; ilk { ile son } arası denenir.
export function extractJson(raw) {
  const source = String(raw ?? '').trim();
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  return start >= 0 && end > start ? source.slice(start, end + 1) : source;
}

export function parseSet(raw) {
  const source = extractJson(raw);
  if (!source) return {errors: ['JSON alanı boş. AI çıktısını buraya yapıştır.']};
  if (new TextEncoder().encode(source).length > LIMITS.bytes) return {errors: [`Set çok büyük. En fazla ${LIMITS.bytes / 1024} KB olabilir.`]};
  let data;
  try { data = JSON.parse(source); } catch (error) { return {errors: [`Geçerli JSON değil: ${error.message}`]}; }
  return validateSet(data);
}

export function validateSet(data) {
  const errors = [], add = message => { if (errors.length < 15) errors.push(message); };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {errors: ['En dışta { ... } şeklinde bir nesne olmalı.']};
  if (data.schemaVersion !== SCHEMA_VERSION) add(`"schemaVersion" değeri ${SCHEMA_VERSION} olmalı.`);
  const title = text(data.title), category = text(data.category), language = text(data.language) || 'tr';
  if (!title) add('"title" (set başlığı) boş olamaz.'); else if (title.length > LIMITS.title) add(`Başlık en fazla ${LIMITS.title} karakter olabilir.`);
  if (!category) add('"category" boş olamaz.'); else if (category.length > LIMITS.category) add(`Kategori en fazla ${LIMITS.category} karakter olabilir.`);
  if (language.length > LIMITS.language) add('"language" çok uzun (ör. "tr").');
  const list = data.questions;
  if (!Array.isArray(list)) return {errors: [...errors, '"questions" bir dizi olmalı.']};
  if (list.length < LIMITS.minQuestions || list.length > LIMITS.maxQuestions) add(`Sette ${LIMITS.minQuestions}–${LIMITS.maxQuestions} soru olmalı; şu an ${list.length} soru var.`);
  const ids = new Set(), texts = new Set(), questions = [];
  list.slice(0, LIMITS.maxQuestions).forEach((q, index) => {
    const n = `${index + 1}. soruda`;
    if (!q || typeof q !== 'object' || Array.isArray(q)) { add(`${index + 1}. soru bir nesne olmalı.`); return; }
    const id = text(String(q.id ?? '')), body = text(q.text), explanation = text(q.explanation);
    const difficulty = q.difficulty === undefined ? 1 : q.difficulty;
    if (!id) add(`${n} "id" eksik.`); else if (id.length > LIMITS.id) add(`${n} "id" çok uzun.`); else if (ids.has(id)) add(`${n} "id" (${id}) başka bir soruyla aynı.`);
    ids.add(id);
    if (!body) add(`${n} soru metni boş.`); else if (body.length > LIMITS.text) add(`${n} soru metni ${LIMITS.text} karakteri aşıyor.`); else if (texts.has(key(body))) add(`${n} aynı soru metni tekrar ediyor.`);
    texts.add(key(body));
    if (![1, 2, 3].includes(difficulty)) add(`${n} "difficulty" 1, 2 veya 3 olmalı.`);
    if (explanation.length > LIMITS.explanation) add(`${n} açıklama ${LIMITS.explanation} karakteri aşıyor.`);
    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length < 2 || options.length > 4) add(`${n} 2–4 seçenek olmalı; ${options.length} seçenek var.`);
    const optionIds = new Set(), optionTexts = new Set(), clean = [];
    options.slice(0, 4).forEach((option, i) => {
      const oid = text(String(option?.id ?? '')), label = text(option?.text);
      if (!oid) add(`${n} ${i + 1}. seçeneğin "id" alanı eksik.`); else if (oid.length > LIMITS.id) add(`${n} ${i + 1}. seçeneğin "id" alanı çok uzun.`); else if (optionIds.has(oid)) add(`${n} seçenek kimliği "${oid}" tekrar ediyor.`);
      if (!label) add(`${n} ${i + 1}. seçeneğin metni boş.`); else if (label.length > LIMITS.option) add(`${n} ${i + 1}. seçenek ${LIMITS.option} karakteri aşıyor.`); else if (optionTexts.has(key(label))) add(`${n} "${label}" seçeneği iki kez yazılmış.`);
      optionIds.add(oid); optionTexts.add(key(label)); clean.push({id: oid, text: label});
    });
    const correct = text(String(q.correctOptionId ?? ''));
    if (!correct) add(`${n} "correctOptionId" eksik.`); else if (!optionIds.has(correct)) add(`${n} doğru cevap kimliği ("${correct}") seçeneklerde bulunamadı.`);
    questions.push({id, difficulty, text: body, options: clean, correctOptionId: correct, explanation});
  });
  if (errors.length) return {errors};
  return {set: {schemaVersion: SCHEMA_VERSION, title, category, language, questions}};
}

export function summarizeSet(set) {
  const counts = {2: 0, 3: 0, 4: 0};
  for (const q of set.questions) counts[q.options.length]++;
  return {title: set.title, category: set.category, language: set.language, count: set.questions.length, counts};
}

export function buildPrompt({title = 'Genel Kültür', category = 'Genel Kültür', language = 'tr', count = 10, theme = ''} = {}) {
  const n = Math.max(LIMITS.minQuestions, Math.min(LIMITS.maxQuestions, Math.round(Number(count)) || 10));
  const clean = value => text(value).replace(/"/g, "'");
  const example = {
    schemaVersion: SCHEMA_VERSION, title: clean(title) || 'Genel Kültür', category: clean(category) || 'Genel Kültür', language: clean(language) || 'tr',
    questions: [{id: 'q001', difficulty: 1, text: "Türkiye'nin başkenti hangisidir?", options: [{id: 'ankara', text: 'Ankara'}, {id: 'izmir', text: 'İzmir'}], correctOptionId: 'ankara', explanation: "Türkiye'nin başkenti Ankara'dır."}],
  };
  return [
    `Bir bilgi yarışması oyunu için ${n} soruluk bir soru seti hazırla.`,
    `Başlık: "${example.title}". Kategori: "${example.category}". Dil: "${example.language}".`,
    theme ? `Tema notu: ${clean(theme)}` : '',
    '',
    'KURALLAR:',
    '1. Yalnızca geçerli JSON döndür. Markdown kod çiti (```), önsöz, açıklama veya sondaki virgül ekleme.',
    `2. Üst alanlar tam olarak şunlar olsun: "schemaVersion" (${SCHEMA_VERSION}), "title", "category", "language", "questions". Başlık, kategori ve dili yukarıdaki değerlerden al.`,
    `3. "questions" dizisinde tam ${n} soru olsun. Her soru: benzersiz "id", "difficulty" (1 kolay, 2 orta, 3 zor), "text" (en fazla ${LIMITS.text} karakter), 2–4 adet {"id","text"} seçenek içeren "options", "correctOptionId" ve kısa bir "explanation" (en fazla ${LIMITS.explanation} karakter).`,
    '4. Doğru cevap mutlaka seçeneklerden biri olsun ve "correctOptionId" o seçeneğin "id" değerine eşit olsun. Seçenek kimlikleri doğru cevabı ele vermesin (ör. "dogru" gibi kimlik kullanma).',
    '5. Aynı soru veya aynı seçenek metni tekrar etmesin. Cevaplar açık, tek anlamlı, doğrulanabilir ve kategoriye uygun olsun.',
    '6. 2, 3 ve 4 seçenekli soruları karıştır; genel olarak kolaydan zora giden bir dağılım kur. Seçenekleri oyuncu başına oyun sunucusu karıştıracak, sen karıştırmak zorunda değilsin.',
    '',
    'ŞEMA ÖRNEĞİ (tek soruyla):',
    JSON.stringify(example, null, 2),
  ].filter(line => line !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

// Socket.IO paket sınırı (4 KiB) küçük olduğu için set, JSON kaçışlı UTF-8 bayt sınırına göre parçalanır.
export function chunkText(source, maxBytes = LIMITS.chunkBytes) {
  const encoder = new TextEncoder(), chunks = [];
  let current = '', size = 0;
  for (const char of source) {
    // Kaçış karakterleri (\" gibi) paket içinde yer kapladığı için JSON hâliyle ölçülür.
    const bytes = encoder.encode(JSON.stringify(char).slice(1, -1)).length;
    if (size + bytes > maxBytes) { chunks.push(current); current = ''; size = 0; }
    current += char; size += bytes;
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}
