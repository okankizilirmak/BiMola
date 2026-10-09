# BiMola Güncelleyici

Portainer CE ve Docker Standalone üzerinde çalışan `bimola` konteynerini GitHub `main` sürümünden günceller. Docker socket kullanmaz; Portainer API üzerinden imaj derler, aday konteyneri sağlık kontrolünden geçirir ve hata halinde eski konteynere döner.

## Portainer yetkileri

1. Admin hesabıyla **Environment-related → Environments → Manage access** ekranından `deployer` kullanıcısına hedef environment erişimi verin.
2. **Containers → bimola → Access control → Change ownership** altında **Restricted** seçip `deployer` kullanıcısını ekleyin.
3. `deployer` hesabının **My account → Access tokens** bölümünde oluşturduğu anahtarı saklayın.
4. Anahtarı aşağıdaki konteynerde `PORTAINER_API_KEY` olarak tanımlayın. Kaynak dosyaya yazmayın.

## İmajı oluşturma ve yükleme

```sh
docker build --platform linux/amd64 -t bimola-updater:1.0.5 updater
docker save -o bimola-updater-linux-amd64-1.0.5.tar bimola-updater:1.0.5
# Sunucuda: docker load -i bimola-updater-linux-amd64-1.0.5.tar
```

Portainer'da **Containers → Add container** ile:

- Name: `bimola-updater`
- Image: `bimola-updater:1.0.5`
- Port mapping: host `3100`, container `8080`
- Restart policy: `Unless stopped`
- Env: `PORTAINER_URL=<Portainer HTTPS adresiniz>`
- Env: `PORTAINER_TLS_VERIFY=false`
- Env: `PORTAINER_API_KEY=<deployer access token>`
- Env: `UPDATER_PASSWORD=<en az 16 karakterlik ayrı parola>`
- Env: `TARGET_CONTAINER=bimola`

Advanced container settings altında `/tmp` için 256 MiB tmpfs ekleyin. Uygulama imaj kaynaklarını ve geçici Git checkout'unu burada tutar. Uygulamayı `http://SUNUCU_IP:3100` adresinden açın; tarayıcının Basic Auth penceresinde herhangi bir kullanıcı adı ve `UPDATER_PASSWORD` değerini girin.

Portainer API anahtarı `X-API-Key` başlığıyla yalnızca sabit Portainer adresine gönderilir. Güncelleme ekranı kullanıcıdan URL, komut, image veya container adı kabul etmez.

## Sürüm 1.0.5

Portainer adresi kaynak koddan çıkarıldı ve `PORTAINER_URL` zorunlu ortam değişkeni yapıldı. Compose örneği bu değeri dağıtım ortamından alır.

## Sürüm 1.0.4

Güncel oyunun Docker bağlamı testi için gerekli `Dockerfile` ve `.dockerignore` test aşamasına eklenir. Puan veri dizini yeni imajda hazırlanır; mevcut anonim puan volume'ü yeni konteynere aktarılır ve aday konteynerden ayrı tutulur.

## Sürüm 1.0.3

Başarısız Docker derlemelerinde test çıktısının son 30 satırı işlem günlüğünde gösterilir; böylece hangi testin neden düştüğü görülebilir.

## Sürüm 1.0.2

Yeni BiMola platformunun `server/` modülleri imaja dahil edilir. Updater'a özel Docker ignore kuralları sayesinde derleme sırasında oyun testleri çalıştırılır.

## Sürüm 1.0.1

Portainer CE standart kullanıcılarında görülen `Forbidden to use container capabilities` hatası düzeltildi. Docker inspect çıktısındaki boş `CapAdd` ve `CapDrop` alanları artık yeni konteyner oluşturma isteğine kopyalanmaz. Portainer'ın **Disable container capabilities for non-administrators** güvenlik ayarını kapatmanız gerekmez.
