# Snake Showdown 3D — PR #6 incelemesi

PR: https://github.com/vyslbysl/BiMola/pull/6
İncelenen commit: `83709c6f2a9325701c6a4b548028a0f93d3083d6`
Yerel inceleme dalı: `codex/snake-pr-6`
Tarih: 1 Ekim 2026

PR ayrı bir çalışma kopyasına çekildi; mevcut ana çalışma klasöründeki Köprü ve Çengel değişiklikleri korunuyor. İlk inceleme sırasında PR ana dala birleştirilmemişti. Kullanıcı onayıyla daha sonra birleştirildi; aşağıdaki bulgular bu birleşimde düzeltilmedi.

## Doğrulama

- PR'ın kendi çalışma kopyasında `npm test`: 175/175 geçti. PR açıklamasında 185 yazmasına rağmen bu committe çalışan sayı 175.
- Tarayıcıda oda açıldı ve 3B arena görüntülendi; konsolda hata/uyarı görülmedi.
- Oda izolasyonu, oda sahibi yetkileri, botun insan oyuncuyla değiştirilmesi ve yön komutları testler kapsamında geçiyor.
- Aşağıdaki iki hata, oyun motorunu doğrudan çalıştıran ek senaryolarla tekrarlandı.

## Düzeltilmesi gereken bulgular

### P2 — Hızlanma maliyeti aç/kapat ile atlatılabiliyor

`server/games/snake/game.js:388` her aktivasyonda `manualBoostChargedAt` değerini baştan kuruyor; kapatmak ise sıfırlıyor. Maliyet hesabı kesintisiz bir saniyeyi esas aldığı için her hareket adımından önce hızlanmayı kapatıp açan oyuncu aynı hızla ilerlerken gövde maliyetini ödemiyor. Sunucudaki 50 ms komut aralığı bu senaryoyu engellemiyor.

Tekrarlama: 20 parçalı iki eşdeğer yılan 3,2 saniye hızlandı. Sürekli açık tutanın uzunluğu 17'ye indi; 160 ms aralıklarla aç/kapat yapanın uzunluğu 20 kaldı. İkisi de aynı son baş koordinatına ulaştı.

Öneri: kullanılan hızlanma süresini aç/kapat boyunca biriktir; durdurmada geçen süreyi hesaba kat ve yalnız gerçekten tüketilmiş maliyeti düş.

### P2 — Dondurulmak aktif hayalet ve mıknatıs bonusunu siliyor

`server/games/snake/game.js:604` içindeki donmuş oyuncu hareket niyeti, `ghostUntil` ve `magnetUntil` değerlerini taşımıyor. Daha sonra 742–743. satırlarda oyuncunun mevcut değerleri bu eksik alanlarla üzerine yazılıyor.

Tekrarlama: `ghostUntil=8000`, `magnetUntil=10000`, `frozenUntil=3000` olan oyuncunun 160. milisaniyedeki ilk güncellemesinden sonra hayalet ve mıknatıs süreleri `undefined` oluyor. Üç saniyelik dondurma, süreleri henüz dolmamış iki bonusu da tamamen kaldırıyor.

Öneri: donmuş oyuncunun hareket dışındaki aktif durumlarını koru; hayalet/mıknatıs sürelerini normal hareket niyetiyle aynı şekilde geçir.

## Performans değerlendirmesi

Oyuncu/bot sayısı ve arena boyutu sınırlı; sahne oyun açılınca yükleniyor, düşük cihazlar için kalite profili var, yiyecek ve engeller toplu çiziliyor. Bunlar olumlu.

Ancak `public/games/snake/src/scene3d.js:314` her yılan gövdesi için ayrı sahne nesneleri oluşturuyor. Yılan büyüdükçe çizim sayısı artıyor; ölüm/kısalma sonrası ayrılmış parça havuzu küçültülmüyor. Uzun maçlar ve 12 oyunculu senaryo için gövdeyi toplu çizime geçirmek, parça havuzunu sınırlamak ve cihaz üzerinde yük ölçümü yapmak uygun olur. Bu incelemede düşük güçlü gerçek telefon üzerinde FPS ölçümü yapılmadı.

## Birleştirme sonucu

PR #6, kullanıcı talebiyle `d745586b66eb28f65b63db6bc9374dc2542a2818` commitinde GitHub ana dalına birleştirildi. Yerel ana dal aynı commite getirildi; yereldeki Köprü ve Çengel çalışmaları korunarak katalog ve README çakışmaları çözüldü. Birleşik çalışma kopyasında 198/198 test geçti. Köprü ve Çengel geliştirmeleri Snake PR’ından ayrı bir committe yayımlanır.
