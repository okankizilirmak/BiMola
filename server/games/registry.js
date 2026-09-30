// This catalog must not import an engine: listing games stays cheap.
export const games = [{
  manifest: {
    id: 'prop-hunt', name: 'Nesne Avı', tagline: 'Gözünün önündeyim.',
    description: 'Bir nesneye dönüş, odaya karış. Arkadaşların seni bulmadan süreyi bitir.',
    category: 'Saklambaç', minPlayers: 2, maxPlayers: 24, duration: '3 dk',
    bots: true, input: 'Klavye + fare', status: 'available',
    entry: '/games/prop-hunt/', cover: '/games/prop-hunt/maps/references/loft.jpeg',
    namespace: '/games/prop-hunt', protocolVersion: 1,
  },
  load: () => import('./prop-hunt/adapter.js').then(module => module.adapter),
}, {
  manifest: {
    id: 'ates-koprusu', name: 'Ateş Köprüsü', tagline: 'Doğru tarafa koş.',
    description: 'Herkes aynı soruyu görür, şıklar herkeste başka yerde. Doğru bilen ilerler, yanlış bilene kütük çarpar.',
    category: 'Bilgi yarışması', minPlayers: 1, maxPlayers: 12, duration: 'Sonsuz akış',
    bots: false, input: 'Klavye, fare veya dokunmatik', status: 'available',
    entry: '/games/ates-koprusu/', cover: '/games/ates-koprusu/cover.svg',
    namespace: '/games/ates-koprusu', protocolVersion: 1,
  },
  load: () => import('./ates-koprusu/adapter.js').then(module => module.adapter),
}];
