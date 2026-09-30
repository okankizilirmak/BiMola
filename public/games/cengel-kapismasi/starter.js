// Dense arrowword board: every cell is either a clue or a letter; only the corner is neutral.
export const starter = {
  version: 2, title: 'Her kutuda bir keşif', category: 'Genel kültür', rows: 9, cols: 7,
  blankCells: [{row: 0, col: 0}],
  entries: [
    {clue: '🍪 Küçük tatlı', answer: 'KURABİYE', row: 0, col: 1, direction: 'down'},
    {clue: 'Namaz vaktine dair', answer: 'EZANİ', row: 0, col: 2, direction: 'down'},
    {clue: 'Bitki gövdesi', answer: 'SAP', row: 0, col: 3, direction: 'down'},
    {clue: 'Elektrik yüklü atom', answer: 'İYON', row: 0, col: 4, direction: 'down'},
    {clue: 'Romen rakamlarında yüz', answer: 'C', row: 0, col: 5, direction: 'down'},
    {clue: '🧵 Bağlama lifi', answer: 'İP', row: 0, col: 6, direction: 'down'},
    {clue: 'Parçalara ayıran', answer: 'KESİCİ', row: 1, col: 0, direction: 'across'},
    {clue: 'Gezegenlerin bulunduğu alan', answer: 'UZAY', row: 2, col: 0, direction: 'across'},
    {clue: 'Tek bacaklı harf', answer: 'P', row: 2, col: 5, direction: 'across'},
    {clue: 'Şerbetli irmik tatlısı', answer: 'REVANİ', row: 2, col: 5, direction: 'down'},
    {clue: 'Yazanak', answer: 'RAPOR', row: 3, col: 0, direction: 'across'},
    {clue: 'Japon para birimi', answer: 'YEN', row: 3, col: 6, direction: 'down'},
    {clue: 'Kısa zaman dilimi', answer: 'AN', row: 4, col: 0, direction: 'across'},
    {clue: 'Üflemeli kamış çalgı', answer: 'NEY', row: 4, col: 3, direction: 'across'},
    {clue: 'Kaygı, keder', answer: 'TASA', row: 4, col: 3, direction: 'down'},
    {clue: 'Asalak böcek', answer: 'BİT', row: 5, col: 0, direction: 'across'},
    {clue: 'İki kelimeyi bağlar', answer: 'VE', row: 5, col: 4, direction: 'across'},
    {clue: 'Tahıl ölçeği', answer: 'MUT', row: 5, col: 4, direction: 'down'},
    {clue: 'Dar düz ünlü', answer: 'İ', row: 6, col: 0, direction: 'across'},
    {clue: 'Medet nidası', answer: 'AMAN', row: 6, col: 2, direction: 'across'},
    {clue: 'Osmiyumun simgesi', answer: 'OS', row: 6, col: 2, direction: 'down'},
    {clue: 'Suda yaşayan bitki', answer: 'YOSUN', row: 7, col: 0, direction: 'across'},
    {clue: 'Fizikte direnç simgesi', answer: 'R', row: 7, col: 6, direction: 'down'},
    {clue: 'Mitoloji bütünü', answer: 'ESATİR', row: 8, col: 0, direction: 'across'}
  ]
};
