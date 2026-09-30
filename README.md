# BiMola

Arkadaşlarınla tarayıcıda buluşup çok oyunculu oyunlar oynayabileceğin bir oyun lobisi. İlk oyun **Nesne Avı**: mevcut 3D saklanma oyunu, sekiz haritası ve botlarıyla korunuyor.

```sh
npm ci
npm start
```

[Lobi](http://localhost:3000) · [Nesne Avı](http://localhost:3000/games/prop-hunt/)

Node.js 24 (Docker ile aynı sürüm) önerilir. Geliştirme: `npm run dev`. Doğrulama: `npm test`. Ek derleme adımı yok; ES modülleri kullanılır.

## Yapı

- `public/platform/`: oyun kataloğu, oda listesi, oda koduyla katılma, ortak oyuncu adı.
- `server/platform/`: oyun bağımsız oda yaşam döngüsü, bağlantı yönlendirme, yayın ve simülasyon zamanlayıcısı.
- `server/games/registry.js`: oyunların tanımları ve gerektiğinde yüklenen sunucu modülleri.
- `server/games/prop-hunt/`: Nesne Avı sunucu kuralları ve platform adaptörü.
- `public/games/prop-hunt/`: yalnızca bu oyunun ekranları, Three.js sahnesi, fizik yardımcıları ve varlıkları.

**Yeni oyun eklemek, lobiyi veya diğer oyunları değiştirmeyi gerektirmez.** Kendi istemci klasörünü ve sunucu adaptörünü ekleyip kataloğa kaydet. Çalışan iki farklı oyunla izolasyonu gösteren örnek test `test/platform.test.js` içindedir; test oyunu kullanıcı kataloğuna eklenmez.

[Kararlar, sözleşmeler ve yeni oyun ekleme rehberi](docs/ARCHITECTURE.md) · [Nesne Avı oynanış notları](docs/NESNE-AVI.md)

## Performans yaklaşımı

Lobi 3D motor, oyun simülasyonu veya Socket.IO istemcisi yüklemez. Oyun seçildiğinde ilgili sayfa açılır. Oyun değişimi belge düzeyinde olduğundan sahne, olay dinleyicileri ve oyun belleği eski sayfayla birlikte bırakılır. Nesne Avı ayrıca sayfadan çıkışta bağlantıyı, çizimi, ses bağlamını ve WebGL bağlamını kapatır.

Lobi oda listesini görünürken 15 saniyede bir yeniler; istekler üst üste binmez. Saklanma oyunu sunucuda 40 Hz simülasyon, en fazla 20 Hz düzenli durum yayını kullanır. Bekleme lobilerinde simülasyon/yayın döngüsü yoktur; değişiklikler hemen yayınlanır. Oylama yalnızca açıkken 4 Hz kontrol edilir. Sıra tabanlı oyunlar döngü açmadan sadece komutlarla çalışabilir.

İstemci girdileri ve düzenli durum paketleri bağlantıda birikmez; eski paketler atılabilir. Katılma, ayar değişikliği ve sonuç gibi kontrol mesajları normal güvenilir iletimi kullanır. Gizli bilgi filtrelemesi oyun adaptörüne aittir.

Lobi HTML + CSS + JS için **40 KiB sıkıştırılmamış kaynak bütçesi** testle korunur (görseller hariç). Bu bir FPS ya da eşzamanlı kullanıcı garantisi değildir. Gerçek cihaz ve dağıtım yük testleri ayrıca yapılmalıdır.

## Çalıştırma

```sh
# İsteğe bağlı kaynak sınırı; performans garantisi değildir.
MAX_ROOMS=64 PORT=3000 npm start

docker compose up --build -d
```

Sağlık: `/health`. Katalog: `/api/games`. Katılınabilir odalar: `/api/rooms?gameId=prop-hunt`. Kod çözümleme: `/api/rooms/1234`. Eski `/?room=1234` davetleri de doğru oyuna yönlendirilir. Antrenman ve dolu odalar listelenmez.

Oda durumu şu anda bellekte ve tek sunucu sürecindedir; yeniden başlatmada kaybolur. Kalıcı hesap, oda geri yükleme ve otomatik oturum kurtarma henüz yoktur. İnternet yayını HTTPS ve WebSocket destekli ters vekil gerektirir. Docker sunucusunda ekran kartı gerekmez; oyun görüntüsü oyuncunun tarayıcısında çizilir.
