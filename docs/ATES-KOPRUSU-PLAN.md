# Ateş Köprüsü — yeni BiMola oyunu için ürün ve uygulama planı

> **Durum (30 Eylül 2026, 2. sürüm):** Oynanabilir; `ates-koprusu` kimliğiyle katalogda. Kalıcı misafir kimliği ve tüm zamanlar kaydı henüz yok; oda puanları oda kapanınca silinir.
>
> **Oyun akışı (bu belgedeki "sonsuz akış" fikrinin yerini aldı):** Lobide herkes "Hazırım" der; herkes hazır olunca 3 sn geri sayım başlar. Oyuncuların yüklediği setler (3–80 soru) tek bir havuzda birleşir ve karışık oynanır; havuz boşsa "Dünden Bugüne" (30 soru) kullanılır. Havuz bitince oyun biter, podyum ve ödüller (en uzun ateş, en hızlı parmak, joker ustası, kütük mıknatısı) gösterilir, oda tekrar hazır lobisine döner. Set, oyun sürerken eklenirse sonraki oyunun havuzuna girer (en fazla 8 set / 200 soru).
>
> **Puan:** seri puanı (100→200) + hız bonusu (0–50, cevap hızına göre, 5'in katları). Yanlış/boş: seri 0, bir adım geri. **Altın soru:** birkaç soruda bir ve her zaman son soru; puan x2. **Jokerler** (oyun başına birer hak, soru sürerken): x2 Çifte Ateş, 50/50 (3+ şıklı sorularda, yalnız kullananın ekranında), Kalkan (yanlışta geri düşme ve seri kaybı yok), Dondur (seçilen rakibin şıkları 4 sn görünmez ve seçilemez). Joker kullanımı odadaki herkese duyurulur.
>
> Diğer kararlar: 12 sn seçim + 4 sn sonuç + 2 sn geçiş; herkes cevaplarsa 1,5 sn son çağrı. Oda 1–12 kişi. Set, Socket.IO'nun 4 KiB paket sınırı nedeniyle parçalar hâlinde gönderilir. Seçenek kimlikleri her soruda yeni rastgele belirteçlerle gider. Son 3 saniyede katılan oyuncu o soruda boş sayılmaz.

## 1. Oyun fikri

Oyuncular aynı düz köprüde buluşur. Ekrana aynı bilgi sorusu gelir. Her sorunun 2, 3 veya 4 cevap seçeneği olabilir. Seçeneklerin sırası **her oyuncuda ayrı karıştırılır**. Oyuncu kendi ekranında doğru cevabın bulunduğu tarafa karar verir. Süre dolunca herkesin seçimi aynı anda açığa çıkar: doğru bilen ilerler, yanlış bilen karşıdan gelen bir kütük veya o soruya uygun başka bir engelle çarpışır. Yanlış yapan oyuncu kalıcı olarak elenmez; bir sonraki soruda oynamaya devam eder.

Oyunun bitiş çizgisi yoktur. Köprü üzerinde yeni sorular geldikçe oyun sürer; oyuncular istedikleri zaman katılır ve ayrılır. Canlı yarış, biriken puan, ateş serisi ve tüm zamanların kayıtları oyuna tekrar dönme sebebidir.

## 2. Üzerinde anlaşılan ürün kararları

| Konu | Karar |
|---|---|
| Oyun yeri | Herkes aynı köprüyü ve aynı anda aynı soruyu görür. |
| Seçenekler | Bir soru 2, 3 veya 4 seçenek içerir. Zorluk arttıkça seçenek sayısı artabilir; soru başına sayı set içinde tanımlıdır. |
| Kopyalamayı önleme | Seçenek sırası oyuncuya özeldir; seçimler cevap süresi bitene kadar diğer oyunculara açıklanmaz. |
| Doğruluk | Doğru olan yön/şerit değil, cevabın değişmez kimliğidir. Sunucu oyuncunun seçimini bu kimlikle karşılaştırır. |
| Yanlış cevap | Kütük benzeri bir engel animasyonu ve ilerleme kaybı; oyuncu yarıştan çıkmaz. Kesin mesafe cezası aşağıda açık karardır. |
| Puan | Sorular boyunca oyuncunun puanı birikir. Yanlış cevap toplamı silmez, ateş serisini sıfırlar. |
| Kalıcı kayıt | Oyuncunun tüm zamanlar toplamı ve rekorları sonraki ziyaretlerinde korunmalıdır. |
| Kullanıcı setleri | Herhangi bir oyuncu AI ile oluşturduğu veya kendi hazırladığı geçerli soru setini yükleyebilir. |
| Puan eşitliği | Kullanıcı setleri dahil bütün geçerli setlerden kazanılan puanlar aynı genel tüm zamanlar kaydına yazılır. “Onaylı soru” ayrımı veya zorluk denetimi yoktur. |
| Sonsuz akış | Varsayılan set bitince sorular yeniden karılır veya sıradaki yüklenmiş sete geçilir. Oyun ve oyuncu puanı sıfırlanmaz. |
| AI kullanımı | Uygulama bir prompt üretip kopyalatır; oyuncu AI çıktısı JSON'u yapıştırır. İlk sürümde uygulamanın doğrudan AI servisine bağlanması gerekmez. |

## 3. Bir soru döngüsü

**Önerilen başlangıç süreleri:** soruyu okuyup cevaplamak için 12 saniye, sonuç/engel animasyonu için 4 saniye, bir sonraki soruya geçiş için 2 saniye. Bu süreler oda ayarına dönüştürülebilir; ilk sürümde tek net ritimle başlamak daha kolaydır.

1. **Hazırlık:** Aynı soru metni ve geri sayım herkesin ekranında görünür. Sunucu her oyuncu için seçenek kimliklerinin sırasını ayrı üretir. Seçenek metinleri bu sırayla ekranda ve köprü üstündeki kendi seçim işaretlerinde gösterilir.
2. **Seçim:** Oyuncu fare, dokunmatik veya klavyeyle bir seçeneği seçer. Seçimini süre dolmadan değiştirebilir; son onaylanan seçim sayılır. Oyuncu seçimini kendi ekranında görür. Diğerleri henüz hangi cevap/yönü seçtiğini öğrenmez.
3. **Kilitleme:** Sunucunun belirlediği süre dolunca seçimler kilitlenir. Cevap vermeyen oyuncu yanlış sayılır. Geç ulaşan veya yinelenen mesaj tur sonucunu değiştirmez.
4. **Açığa çıkma:** Oyuncular aynı anda kendi seçtikleri tarafa hareket eder. Sunucu doğru cevabı ve oyuncu sonuçlarını yayınlar. Doğru bilenlerin ilerleme, yanlış bilenlerin çarpışma animasyonu birlikte oynar.
5. **Geri bildirim:** Doğru cevap, kısa açıklama (varsa), o sorudan kazanılan puan, yeni toplam ve ateş serisi görünür. Köprüde herkes sonraki soruya hazır konuma döner.

**Önemli sahne kuralı:** İki oyuncu fiziksel olarak aynı tarafa yönelip farklı cevap seçmiş olabilir; çünkü seçenek sıraları farklıdır. Bu durumda engel “sol şeride çarpan tek bir genel kütük” olamaz. Kütük yanlış yapan **oyuncuyu** hedeflemeli veya sahnede oyuncuya özel bir çarpma geçişi gösterilmelidir. Doğru oyuncunun aynı yerde haksız yere çarpılmış gibi görünmemesi animasyon tasarımının kabul ölçütüdür.

Seçimden önce avatarın yönünü veya gideceği şeridi diğer oyunculara göstererek cevabı sızdırmayacağız. Sonuçlar yayınlandıktan sonra hareket hep birlikte başlar. Kullanıcı tarafından yüklenen sorunun doğru cevabını seti hazırlayan kişinin bilebileceği gerçeği kabul edilir; rastgele sıralama esas olarak ekrandan/karakter hareketinden birbirini takip etmeyi engeller.

## 4. Köprü ve animasyon

- Tek ortak köprü sahnesi ve aynı anda görülebilen diğer oyuncu avatarları. Kamera, avatarları ve yaklaşan engeli okuyabilecek yükseklikte olmalı.
- Soru ve seçenekler sahnenin üstünde okunaklı bir arayüz katmanı olarak gösterilmeli. Cevap etiketleri oyuncuya özel olduğundan başka oyuncuların ekranındaki etiketlerin dünya içinde ortak nesne gibi görünmesine güvenilmemeli.
- Doğru cevapta kısa ilerleme ve ateş serisine bağlı görsel güçlenme; yanlışta kütüğün gelişini görebileceği kadar belirgin uyarı, çarpma, kısa savrulma ve güvenli dönüş.
- Ekranda aynı anda çok oyuncu olduğunda çarpışmalar avatar başına açıklanabilir olmalı; gereksiz parçacık ve fizik hesabı azaltılmalı.
- Sonsuz köprü, sonsuz geometri üretmek anlamına gelmez. Görsel köprü parçaları yeniden kullanılır; sahnede yalnız yakın bölümler bulunur. Biriken ilerleme sayısal durumdur.
- Animasyonlar sonucu **belirlemez**. Sunucu sonucu belirler, tarayıcı ona uygun animasyonu oynatır. Düşük kaliteli cihaz ayarında gölgeler/parçacıklar azalabilir; soru ve sonuç her zaman okunur kalır.
- Sonuç animasyonunu kaçıran veya sekmesini arka plana alan oyuncu, döndüğünde sunucunun güncel puanını ve soru fazını alır; eski animasyonların tümünü oynatmak zorunda kalmaz.

## 5. Puan ve ateş serisi

**Önerilen ilk puan eğrisi:**

| Art arda doğru cevap | O sorudan alınan puan | Görsel durum |
|---|---:|---|
| 1 | 100 | Normal |
| 2 | 125 | Hafif ısınma |
| 3 | 150 | Ateş başlar |
| 4 | 175 | Ateş büyür |
| 5 ve sonrası | 200 | Güçlü ateş; puan artışı burada durur |

Yanlış veya boş cevap: **0 puan**; mevcut seri **0** olur. Toplam puandan ceza kesilmez. Bir sonraki doğru cevabın değeri yeniden 100'dür. Puan formülü ve ateş eşikleri oda içinde herkes için aynıdır; istemci puan hesaplayıp sunucuya göndermez.

Oyuncu için tutulacak ayrı değerler:

- **Oda puanı:** bu odada kazanılan toplam; oda kapanınca yeni odada sıfırdan başlar.
- **Mevcut ateş serisi:** art arda doğru sayısı; yanlışta sıfırlanır.
- **Odadaki en iyi seri** ve **son 10 sorudaki performans:** sonradan katılanların da canlı rekabette görünmesini sağlar.
- **Tüm zamanlar toplam puanı, en iyi ateş serisi ve en iyi 30 soruluk performans:** kalıcı kayıt. Sonsuz bir oyunda yalnız toplam puana göre sıralama, en uzun süre oynayanı öne çıkarır; bu yüzden rekorlar ayrı gösterilir. Kullanıcı setleri de bu kayıtların hepsine aynı kuralla dahil edilir.

Her soru turu için oyuncuya puan **yalnızca bir kez** yazılmalıdır. Ağdan aynı seçim/sonuç olayı iki kez gelirse, sekme yenilenirse veya bağlantı yeniden kurulursa toplam artmamalıdır. Sunucu soru turunun kimliğini ve sonuç kaydını kullanarak tekrarları yok sayar.

## 6. Kalıcı oyuncu kaydı

Tüm zamanlar kaydını tarayıcıdaki puan sayacına bırakmak yeterli değildir; sunucuda kalıcı olarak saklanmalıdır. İlk sürümde hesap açmayı zorunlu kılmadan bir **misafir oyuncu kimliği** oluşturulabilir. Tarayıcı bu kimliğe ait güvenli oturum belirtecini saklar; sunucu puanı kimliğe bağlar. Böylece sayfa yenileme ve kısa ağ kopmalarında oyuncu mevcut odasına/puanına dönebilir.

Bu yöntem aynı tarayıcıda süreklilik sağlar. Çerez veya tarayıcı verisi silinirse ya da başka cihazdan girilirse eski misafir kaydının kime ait olduğunu güvenilir biçimde kanıtlamak mümkün değildir. Cihazlar arası kesin devamlılık istenirse sonradan hesap bağlama gerekir; bu, kalıcı puan veri modelini değiştirmeden eklenebilecek şekilde düşünülmelidir. Aynı görünen oyuncu adları farklı kimlikler olabilir.

Oda ve aktif soru durumu şu anki BiMola altyapısında bellektedir; tüm zamanlar puanı için ayrıca kalıcı depolama, yedekleme ve şema güncelleme yolu gerekir. Bir oda kapanması, süreç yeniden başlaması veya sunucu güncellemesi kalıcı rekorları silmemelidir. Kalıcı yazma yalnız sunucunun kesinleştirdiği soru sonuçlarından yapılır.

**Kısa kopma önerisi:** oyuncunun odadaki yeri ve puanı 1–2 dakika korunur. Bu sırada cevap veremediği sorular boş sayılır; geri geldiğinde o anki soruya katılır. Bu sürenin sonunda oda yeri boşaltılabilir, fakat tüm zamanlar kaydı kalır.

## 7. Soru setleri ve config

Oyunda geliştirici tarafından sağlanan, örneğin **30 soruluk** bir başlangıç JSON dosyası bulunur. Aynı şema, kullanıcıların yapıştırdığı yeni setler için de geçerlidir. Başlangıç dosyası tek içerik kaynağı değildir; oda içinde yeni setler sıraya alınabilir.

Önerilen şema (`schemaVersion` ile ileride değiştirilebilir):

```json
{
  "schemaVersion": 1,
  "title": "Genel Kültür Gecesi",
  "category": "Genel Kültür",
  "language": "tr",
  "questions": [
    {
      "id": "q001",
      "difficulty": 1,
      "text": "Türkiye'nin başkenti hangisidir?",
      "options": [
        { "id": "ankara", "text": "Ankara" },
        { "id": "izmir", "text": "İzmir" }
      ],
      "correctOptionId": "ankara",
      "explanation": "Türkiye'nin başkenti Ankara'dır."
    }
  ]
}
```

Örnekte şema anlaşılır olsun diye tek soru gösterildi; gerçek başlangıç seti 30 soruluk olacaktır. `difficulty` 1–3 olabilir ve seçenek sayısı 2–4 arasında bağımsız doğrulanır. **Doğru cevap bir konum numarasıyla (`0`, `1`, `2`) tutulmaz.** `correctOptionId`, seçenekler oyuncuya göre karıştırıldıktan sonra da aynı cevabı işaret eder.

Yükleme kontrolü en az şunları kapsar: geçerli JSON ve şema sürümü; başlık/kategori uzunluğu; makul toplam soru sayısı ve dosya boyutu; soru ve seçenek metinlerinin boş olmaması; her soruda 2–4 seçenek; sorular ve seçenekler içinde tekrar eden kimlik bulunmaması; `correctOptionId` değerinin mevcut bir seçeneğe işaret etmesi. Hatalar “12. soruda doğru cevap kimliği bulunamadı” gibi düzeltilebilir biçimde gösterilir. Soruların gerçekten doğru, tarafsız veya zor olup olmadığını otomatik onaylama şartı yoktur.

Seti **herhangi bir oyuncu** yükleyebilir. Devam eden soru yarıda değişmez: yeni set doğrulanıp sıraya alınır, sonraki set sınırında devreye girer. Yüklenen set yoksa mevcut set bittiğinde yeni bir karışık sırayla tekrar başlar; aynı sorunun arka arkaya gelmesi önlenir. Yeni set açıldığında oda puanları ve tüm zamanlar puanı sıfırlanmaz. Sıraya alınan setlerin sayısı ve toplam içerik boyutu sınırlanmalıdır; sonsuz oyun, sınırsız bellek kullanımı demek değildir.

Kullanıcı içeriği güvenilmeyen metin olarak ekrana basılır. Soru metnindeki HTML/komut çalıştırılmaz; içerik düz metin olarak gösterilir. Yükleme yetkisi bir setin bütün oyuncuların tarayıcısında kod çalıştırma yetkisi anlamına gelmez.

## 8. “AI için promptu kopyala → JSON yapıştır → başla” akışı

Oda ekranında set yükleme paneli bulunur. Oyuncu **başlık**, **kategori**, **dil**, **soru sayısı** (varsayılan 30) ve isterse kısa tema notu girer. “AI promptunu kopyala” düğmesi bu alanlarla doldurulmuş, beklenen JSON şemasını ve örneği anlatan metni panoya koyar. Oyuncu tercih ettiği AI aracında promptu çalıştırır, dönen JSON'u uygulamadaki alana yapıştırır. Uygulama doğrular, ilk birkaç soruyu ve seçenek sayılarını önizletir, sonra seti odaya sıraya ekler. İsterse aynı alana AI kullanmadan kendi hazırladığı JSON'u da yapıştırabilir.

Promptta açıkça istenecekler:

1. Yalnızca **geçerli JSON** döndür; Markdown çiti, açıklayıcı önsöz veya sondaki virgül ekleme.
2. Üst alanlar `schemaVersion`, `title`, `category`, `language`, `questions` olsun. Başlık, kategori, dil ve soru sayısını panelde girilen değerlerden al.
3. Her soru benzersiz `id`, `difficulty`, `text`, 2–4 adet `{id,text}` seçeneği, `correctOptionId` ve kısa `explanation` içersin.
4. Doğru cevap mutlaka seçeneklerden biri olsun. Aynı soru veya aynı seçenek metni tekrar etmesin. Cevaplar açık, tek anlamlı ve seçilen kategoriye uygun olsun.
5. 2, 3 ve 4 seçenekli soruları karıştır; genel olarak kolaydan zora giden bir dağılım kur. **Seçenekleri oyuncu bazında AI değil sunucu karıştıracak.**

Uygulama, panoya kopyalanan promptun güncel şemayla aynı kaynaktan üretilmesini sağlamalı. Şema değiştiğinde eski bir promptun geçersiz JSON üretmesi önlenir. JSON kopyalandıktan sonra başlık/kategori alanlarında yapılan değişiklik, yapıştırılan setin kendi başlığını otomatik veya sessizce değiştirmez; önizlemede setin gerçek bilgisi gösterilir.

## 9. BiMola'ya entegrasyon

Bu oyun, mevcut Nesne Avı koduna eklenen bir mod değil, BiMola kataloğunda **ayrı bir oyun** olacak. Uygulama adımları:

1. `public/games/<oyun-id>/` altında bağımsız oyun ekranı, soru arayüzü, köprü sahnesi, animasyonlar ve varlıklar.
2. `server/games/<oyun-id>/` altında sunucu otoriteli soru sırası, oyuncuya özel seçenek karıştırma, seçim kilitleme, puan/seri hesabı ve sonuçların gizli/açık görünümleri.
3. Mevcut oyun adaptörü sözleşmesi üzerinden oda yaratma, katılma, ayrılma, komutlar, kişiye özel durum ve gerekli olduğunda saat ilerletme.
4. `server/games/registry.js` içine isim, açıklama, kapak, oyuncu sınırı, giriş yolu ve tembel yükleyici kaydı. Lobi oyun kartını ve katılınabilir odaları kendiliğinden gösterir; 3D saklanma oyununun sahnesi bu oyunda yüklenmez.
5. Kalıcı oyuncu/puan depolaması, geçici oda durumundan ayrı bir katman. Mevcut oyunlar bundan etkilenmemeli.

Soru sayacı ve kilitleme zamanı **sunucuda** belirlenir. İstemciler yalnız kalan süreyi gösterir. Her oyuncuya gönderilen cevap sırası farklıdır; tur bitmeden başka oyuncuların sırası, seçimi veya doğru cevap istemci paketine sızmaz. Sonuçtan sonra cevap ve açıklama herkes için açılır.

Bu oyun bilgi yarışması ağırlıklı olduğu için her karede sunucu fiziği çalıştırma zorunluluğu yoktur. Faz değişimi ve seçimler olaylarla iletilir; köprüdeki koşma/kütük animasyonu ağırlıklı olarak tarayıcıda oynar. Görsel kalite ayarı ve yeniden kullanılan köprü parçaları düşük güçlü tarayıcıları korur. Gerçek oyuncu kapasitesi hedef cihazlarla ölçülerek seçilmelidir.

## 10. Ekranlar ve kullanıcı akışı

1. **BiMola oyun kartı:** oyun adı, kısa açıklama, görsel, oyuncu sayısı, “Oyuna gir”.
2. **Oyun girişi:** oda kur, açık odaya katıl veya oda koduyla gir. Ortak BiMola oyuncu adı taşınır.
3. **Köprü lobisi:** oyuncu listesi, oda kodu, mevcut ve sıradaki soru seti; herhangi bir oyuncu set yükleyebilir. Oda sahibi oyun ritmini başlatır (ilk sürüm önerisi).
4. **Set oluşturma/yükleme:** kategori ve başlık alanları, promptu kopyala, JSON yapıştır, anlaşılır hata listesi ve önizleme, sete ekle.
5. **Oyun ekranı:** ortak köprü, soru, oyuncuya özel 2–4 cevap, geri sayım, mevcut toplam, ateş serisi, diğer oyuncuların görünür avatarları.
6. **Sonuç anı:** eşzamanlı hareket, hedefli engel, doğru cevap/açıklama, kazanılan puan ve seri değişimi.
7. **Sıralama:** oda puanı, son 10 soruluk performans, tüm zamanlar toplamı ve rekorları; oyundan çıkış ve BiMola'ya dönüş.

Klavye/fare ve dokunmatik kontrol ilk sürümün parçası olmalı. Cevap kartları yalnız renkle ayırt edilmemeli; metin, konum ve açık seçili durum bulunmalı. Kütük çarpması ses kapalıyken de anlaşılmalı. Hareket azaltma tercihi olan oyuncularda kamera sarsıntısı ve ateş parçacıkları azaltılmalı.

## 11. Uygulama sırası ve kabul ölçütleri

### Aşama A — Kurallar ve veri

- Soru şeması, başlangıç seti, JSON doğrulama ve AI prompt üretimi.
- Oyuncu başına seçenek sırası; doğru cevap kimliğiyle değerlendirme.
- Soru fazları, sunucu saati, süre sonunda kilitleme ve sessiz/boş cevap davranışı.
- Oda puanı, ateş serisi, son 10 soru ve sonuçların bir kez yazılması.

**Kabul:** Aynı soru iki oyuncuda farklı seçenek sırasıyla görünür; ikisi de kendi ekranlarında farklı tarafa giderek aynı doğru cevabı seçebilir. Süre bitmeden diğerinin seçimi sızmaz. Yanlış veya boş cevap toplamı silmez, seriyi sıfırlar.

### Aşama B — Oynanabilir köprü

- Ortak köprü ve avatarlar, cevap işaretleri, eşzamanlı doğru/yanlış hareketleri, hedefli kütük çarpması.
- Masaüstü ve dokunmatik kontroller; düşük kalite ve hareket azaltma seçenekleri.
- Sonsuz köprü parçalarının ve efektlerin yeniden kullanılması.

**Kabul:** Aynı fiziksel tarafta biri doğru biri yanlış cevap vermişse yalnız yanlış oyuncu çarpılır. Sorular ve puanlar yavaş cihazda da okunur; 30+ soru sonra sahnedeki nesne ve bellek sayısı durmadan artmaz.

### Aşama C — İçerik ve kalıcılık

- Her oyuncunun set ekleyebildiği prompt/JSON/önizleme akışı ve set sırası.
- Kalıcı misafir kimliği, tüm zamanlar puanı ve rekor depolaması; kısa kopmada odaya dönüş.
- Oda ve genel sıralama görünümü; kullanıcı setlerinden gelen puanlar için aynı kayıt kuralları.

**Kabul:** Geçersiz JSON başlamaz ve nedenini gösterir. Geçerli set mevcut soruyu kesmez. Sayfa yenileme ve sunucu yeniden başlatma tüm zamanlar kaydını silmez. Çift gelen sonuç puanı iki kez artırmaz.

### Aşama D — Platform ve kalite

- BiMola katalog kaydı, açık oda listesi, davet linki ve oyunlar arası geçiş.
- Gerçek bağlantıyla çok oyunculu senaryolar; aynı anda cevap, geç katılma, ayrılma, bağlantı kopması, set değiştirme, iki ayrı oda.
- Hedef masaüstü/mobil tarayıcı ve belirlenen oda kapasitesinde performans ölçümü.

**Kabul:** Lobi yeni oyun motorunu açılmadan yüklemez; Nesne Avı bu oyunun varlığından etkilenmez. Farklı odaların soruları, puanları ve oyuncuları karışmaz. Odadan/lobiden çıkınca çizim, ses ve bağlantı temizlenir.

## 12. Uygulamadan önce netleştirilecek küçük kararlar

Bu noktalar konuşmada kesinleşmediği için burada öneri olarak bırakıldı; kodlanırken sessizce varsayılmamalı:

1. **Yanlış cevabın köprü cezası:** öneri bir bölüm geri düşmek. Alternatif aynı yerde birkaç saniye sersemlemek.
2. **İlk oda kapasitesi:** öneri 2–12 oyuncu; görsel çakışma ve cihaz performansına göre ölçülmeli.
3. **Soru süreleri:** öneri 12 saniye seçim + 4 saniye sonuç + 2 saniye geçiş.
4. **Yüklenen setin devreye girişi:** öneri herkes ekleyebilir, mevcut soru kesilmez, doğrulanan set sıradaki set sınırında açılır.
5. **Kalıcı kimlik:** ilk sürümde aynı tarayıcıda korunan misafir kimliği önerildi. Farklı cihazlarda aynı kayda erişim daha sonra hesap bağlama gerektirir.

Bu kararlar oyunun ana fikrini değiştirmez. Ürünü yapmaya başlamadan görsel örnekler ve kısa bir oynanabilir prototip ile özellikle köprü animasyonunu doğrulamak yararlı olacaktır.
