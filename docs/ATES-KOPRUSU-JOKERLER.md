# Ateş Köprüsü: arayüz, jokerler ve ateş defteri

## Oyuncu deneyimi

- Mobilde hazır düğmesi oda ekranının altında sabit kalır.
- Canlı sıralama düğmesi sıranı, oyuncu sayısını ve lidere puan farkını gösterir; tam liste açılabilir.
- Soru süresi sayıyla ve çubukla görünür; son üç saniye vurgulanır. Azaltılmış hareket tercihinde nabız animasyonu yoktur.
- Beş basamaklı ateş göstergesi seriyi ve sonraki doğrunun temel puanını gösterir. Hız bonusu, altın soru ve Çifte Ateş sonuçta ayrıca açıklanır.
- Jokerler destek/çakallık olarak iki sekmede, isimleriyle gösterilir. `?` düğmesi bütün kuralları açıklar.
- Set yükleme üç adımdır: prompt, JSON, önizleme. Hazır JSON doğrudan ikinci adıma yapıştırılabilir. Geçersiz JSON havuza girmez; geçerli setten üç soru önizlenir.
- Havuzdaki bütün sorular bittiğinde maç sona erer. Oyun sırasında eklenen set sonraki maça kalır; bütün setler toplam sıralamada aynı şekilde puan kazandırır.

## Jokerler

Her joker maçta bir kez kullanılabilir. Bir oyuncu bir soruda en fazla bir saldırı yapabilir; bir hedef de bir soruda en fazla bir saldırı alabilir. Son iki saniyede saldırı yapılamaz. Geçersiz hedef, kalkan veya zaman sınırı nedeniyle reddedilen kullanım hakkı tüketmez.

| Joker | Davranış |
| --- | --- |
| Çifte Ateş | Bu sorunun puanını ikiye katlar. Altın soruyla birlikte x4 olabilir. |
| 50/50 | Üç şıkta bir, dört şıkta iki yanlış cevabı kaldırır. Doğru cevap korunur. |
| Kalkan | Bu soruda yanlış cevabın geri itmesini ve seri kaybını engeller. Saldırılardan korur; mevcut buz, sis ve hız kesme etkisini temizler. Karışmış şıklar geri dönmez. |
| Dondur | Hedefin şıklarını ve cevap girişini en fazla dört saniye kapatır. Sonunda en az bir saniye cevap süresi bırakır. Mevcut cevap korunur. |
| Karıştır | Hedefin şık sırasını değiştirir. Seçtiği cevap kimliği ve hız için kullanılan seçim zamanı korunur. Şık kartları yeni sıraya göre kurulur. |
| Sis | Hedefin soru metnini en fazla 2,5 saniye örter. Şıklar ve cevap verme açık kalır. Sonunda en az bir saniye bırakır. |
| Hız Kes | Hedefin bu sorudaki hız bonusunu sıfırlar; doğru cevabı, seri puanını, çarpanları ve ilerlemesini değiştirmez. |

Sunucu joker hakkını, hedefi, süresini ve puanı belirler. İstemci yalnızca gösterir; yanlış cevap veya başka birinin gizli seçimi istemciye gönderilmez.

## Kalıcı puanlar

- Her sonuç sunucudan puan defterine girer. Maç yarıda bırakılırsa oynanmış soruların puanları korunur.
- Toplam puan, en yüksek maç puanı, en uzun seri, doğru/oynanan soru ve tamamlanan maç sayısı saklanır.
- Kimlik HttpOnly, SameSite=Lax çerezle belirlenir. Ham kimlik belirteçleri dosyada saklanmaz; oyuncu adı kimlik değildir. Bir kimlik aynı köprüye ikinci bir sekmeden katılamaz.
- İstemciden puan kabul eden bir uç nokta yoktur. Sonuçlar maç/soru kimliğiyle tekrar işlenmeye karşı korunur.
- Tüm zamanlar listesi toplam puana göre ilk 20 oyuncuyu ve kişinin kendi sırasını gösterir. BiMola/özel set ayrımı yoktur.
- `GET /api/player` oyuncu kimliğini oluşturur veya tanır. `GET /api/games/ates-koprusu/scores` sıralama ve kişisel toplamları döndürür.
- Günlük yazımı sıraya alınır; her 500 kayıtta atomik özet oluşturulur. Sunucu kapanırken yazma kuyruğu tamamlanır. Disk hatası API'de hata olarak gösterilir.

## Yayınlama

Normal çalıştırmada kayıt dizini `data/`, Docker'da `/app/data` olur. `BIMOLA_DATA_DIR` ile değiştirilebilir. Klasör Git'e ve Docker build context'e dahil değildir.

Compose, `bimola-scores` named volume kullanır. Diğer platformlarda `/app/data` için kalıcı volume bağlanmalı ve Node kullanıcısının yazma izni olmalıdır. Bu klasör sunucu yeniden yaratıldığında korunmalıdır. `docker compose down -v` kayıt volume'unu siler.

Bu dosya deposu tek sunucu sürecine yöneliktir. Birden fazla replica gerekiyorsa ortak veritabanına geçilmelidir. Tarayıcı çerezini silmek veya başka cihaz kullanmak yeni kimlik oluşturur; hesapla cihazlar arası eşleme bu sürümde yoktur.

## Doğrulama

Jokerler için seçim/zaman korunması, sis gizliliği, hız bonusu, kalkan, tek saldırı sınırı ve son saniye reddi test edilir. Puan defteri için yeniden başlatma, günlük özeti, yarım son kayıt, tekrar puanlamama ve HTTP kimliğiyle Socket.IO sonuçlarının eşleşmesi test edilir. Mevcut Nesne Avı ve platform testleri de çalıştırılır.
