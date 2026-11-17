// 馬・騎手・レース・物語のデータ。元: mobile/turfrush の Data.swift・Characters.swift・Story.swift (名前と台本はすべてオリジナル)

export const STYLE = {
  nige:   { name: '逃げ', spurtFrom: 380, gutsFactor: 0.6, startBonus: 1.4, preferredRank: 0.0, pace: 0.09 },
  senko:  { name: '先行', spurtFrom: 430, gutsFactor: 0.85, startBonus: 0.8, preferredRank: 0.25, pace: 0.03 },
  sashi:  { name: '差し', spurtFrom: 500, gutsFactor: 1.1, startBonus: 0.2, preferredRank: 0.55, pace: -0.05 },
  oikomi: { name: '追込', spurtFrom: 560, gutsFactor: 1.4, startBonus: -0.3, preferredRank: 0.85, pace: -0.09 },
};

// 走法: ピッチ = 出足・ムチの反応が鋭い / ストライド = 最高速が高い
export const GAIT = {
  normal: { stride: 1.1, topDelta: 0, whipK: 1, startDelta: 0 },
  pitch:  { stride: 0.8, topDelta: -0.15, whipK: 1.08, startDelta: 0.6 },
  stride: { stride: 1.45, topDelta: 0.2, whipK: 0.92, startDelta: -0.3 },
};

export const COAT = { chestnut: 0xC0602E, bay: 0x8A4B26, darkBay: 0x4E2E1C, black: 0x2E2724, gray: 0xC8CACC, white: 0xF4F2EC };

// 帽子の色 (1〜8 枠)
export const FRAME_COLORS = [0xF8F8F8, 0x222222, 0xE02828, 0x2850E0, 0xF0D020, 0x20A040, 0xF08020, 0xF070B0];

const P = (o) => Object.assign({ title: '', start: ['いくぞ！'], final: ['ここからだ！'], hyper: ['いっけええ！'], win: '勝ったぞー！', lose: 'くやしい…！', taunt: '勝負だ！' }, o);

export const PERSONA = {
  hayate: P({ title: '北のちびっこ快速', start: ['いっくぞ〜っ！', 'ハナはゆずらねえ！'], final: ['ここで負けたら男がすたるっ！', 'ちっちゃくても負けねえ！'], hyper: ['見さらせ〜っ！！'], win: '見たか！ ちっちゃくたって速いんだ！', lose: 'く、くやし〜っ…！ 次は勝つ！', taunt: 'オイラの背中、見えるかな？' }),
  raiden: P({ title: '漆黒の稲妻', start: ['ついてこられるかな？'], final: ['稲妻は止まらない！'], hyper: ['光になれ！'], win: '当然の結果だ。', lose: '…次はない。', taunt: '俺の影すら踏ませない。' }),
  benikabuto: P({ title: '赤い重戦車', start: ['ドカンといくぜ！'], final: ['ここからが本番じゃああ！'], hyper: ['ぶちかませえええ！'], win: 'ガハハハ！ 力こそパワーよ！', lose: 'おうおう、やるじゃねえか…', taunt: 'まとめてぶっちぎってやらあ！' }),
  star: P({ title: '夜空の流れ星', start: ['今日も星がきれいだ…'], final: ['願いは自分の脚でかなえる！'], hyper: ['流れ星になれ！！'], win: '願いがかなったよ…', lose: '雲に隠れちゃったな…', taunt: '星の速さ、見せてあげる。' }),
  mirror: P({ title: 'ターフの踊り子', start: ['さあ、踊りましょ♪'], final: ['フィナーレよ！'], hyper: ['ミラーボール・フィーバー！'], win: '拍手をちょうだい♪', lose: '今日のステージはここまでね…', taunt: '主役はアタシよ♪' }),
  shizuka: P({ title: '沈黙の職人', start: ['……'], final: ['…行く。'], hyper: ['…ここだ。'], win: '…仕事は終わった。', lose: '…修行が足りん。', taunt: '……。' }),
  hokuto: P({ title: '北斗の白い巨星', start: ['のんびりいくべ〜'], final: ['そろそろ本気、出すべか'], hyper: ['北斗の光、見せるべ！'], win: 'みんな、ありがとさん〜', lose: 'まあ、こんな日もあるべ', taunt: 'おら、長い距離なら負けねえべ' }),
  harukaze: P({ title: 'がんばり屋の春一番', start: ['がんばります！'], final: ['ここまでの練習を信じて！'], hyper: ['春一番、吹きあれろーっ！'], win: 'やった…！ 努力は裏切らない！', lose: 'もっと練習します…！', taunt: '精いっぱい、走ります！' }),
  kotsubu: P({ title: '雪原の雑草魂', start: ['いくぞ！'], final: ['ここからだ！'], hyper: ['いけええ！'], win: 'やったぞ！', lose: '次こそ…！', taunt: '小さくても負けない' }),
  noir: P({ title: '漆黒の天才', start: ['……行く'], final: ['ここで決める'], hyper: ['これが俺の走りだ'], win: '当然の結果だ', lose: '……覚えておけ', taunt: 'ついてこられるか' }),
  goldrush: P({ title: '名門の御曹司', start: ['庶民の馬とは格が違うのさ！'], final: ['パパが見てるんだ、負けられない！'], hyper: ['ゴールデン・ラッシュ！'], win: '見たかい？ これが血統の力さ！', lose: 'パ、パパに言いつけてやる〜！', taunt: 'キミ、どこの牧場の馬だい？' }),
  phantom: P({ title: '幻の馬', start: ['……。'], final: ['…………。'], hyper: ['――ッ！'], win: '……（影は、ゴールの先で消えた）', lose: '……（影は、こちらを一度だけ振り返った）', taunt: '……。' }),
  kaiser: P({ title: '無敗の皇帝', start: ['我が前に道はない。我の後ろに道ができる。'], final: ['見せてやろう、皇帝の走りを。'], hyper: ['跪け！'], win: '王座は揺るがぬ。', lose: '…貴様、名を何という。', taunt: '我に挑むか。面白い。' }),
  miyabi: P({ title: '古都の月夜姫', start: ['ほな、お先に失礼しますえ。'], final: ['そろそろ本気、見せたげまひょか。'], hyper: ['月の舞、とくとご覧あれ！'], win: '三千メートルは、うちの庭どす。', lose: '…あんさん、ええ脚してはるわ。', taunt: '長い道のり、最後まで付いてきはりますか？' }),
  ruby: P({ title: '紅の快速娘', start: ['いっちばーん！ ついてこれる？'], final: ['マイルはあたしの距離なんだから！'], hyper: ['紅い閃光、いっけぇーっ！'], win: 'ほらね、マイルなら負けないんだから！', lose: 'うそ…あたしより速い子がいるなんて！', taunt: 'あたしのお尻、見えなくなっちゃうよ？' }),
  doronko: P({ title: '雨の日の怪物', start: ['…ぬかるみは、好きだ。'], final: ['泥の中なら、誰にも負けん。'], hyper: ['泥を、喰らえぇっ！'], win: '雨は、わしの味方だ。', lose: '…泥まみれで、いい顔をしておる。', taunt: '雨の日に、わしの前を走れるか。' }),
};
export const pick = list => list[Math.floor(Math.random() * list.length)] || '';

const H = (id, name, female, speed, stamina, guts, style, coat, mane, silk, silk2, blurb, extra = {}) =>
  Object.assign({ id, name, female, speed, stamina, guts, style, coat, mane, silk, silk2, cap: silk2, blurb, gait: 'normal', tail: 'normal', persona: PERSONA[id] || P({}) }, extra);

// 自分が選べる馬 (0〜7 は最初から、8・9 は全クリで、10 は幻影に勝つと)
export const ROSTER = [
  H('hayate', 'ハヤテマル', false, 4, 5, 3, 'nige', COAT.chestnut, 0xE8B070, 0x1E5BD8, 0xFFFFFF, 'ゲートが速い逃げ馬。バテにくい'),
  H('raiden', 'ライデンゼロ', false, 6, 3, 3, 'nige', COAT.black, 0x111111, 0xE0D020, 0x111111, '最速の逃げ馬。スタミナに不安'),
  H('benikabuto', 'ベニカブト', false, 5, 3, 4, 'oikomi', COAT.bay, 0x1A1A1A, 0xC81E2E, 0xF0C020, '最後の直線で一気に飛んでくる'),
  H('star', 'シューティングスター', false, 4, 3, 5, 'oikomi', COAT.gray, 0x9A9A9A, 0x7A3AC8, 0xFFFFFF, '根性で差し切る芦毛の追込'),
  H('mirror', 'ミラーボール', true, 5, 3, 4, 'senko', COAT.chestnut, 0xF0D0A0, 0xF070B0, 0x30C0E0, '器用な先行牝馬'),
  H('shizuka', 'シズカナヨル', false, 5, 4, 4, 'senko', COAT.darkBay, 0x111111, 0x1A2A60, 0xF0F0F0, 'バランスのいい先行馬'),
  H('hokuto', 'ホクトノヒカリ', false, 5, 6, 5, 'sashi', COAT.white, 0xDADADA, 0x20A050, 0xF0F0F0, '長い距離ならこの馬。上級者向けの差し'),
  H('harukaze', 'ハルカゼ', true, 4, 3, 5, 'sashi', COAT.bay, 0x1A1A1A, 0xF08A20, 0x2050C0, '粘り強い差し牝馬'),
  H('kotsubu', 'コツブノユキ', false, 4, 5, 6, 'senko', COAT.white, 0xE8E8EC, 0x2AA050, 0xF0D020, '小さな白い雑草馬。ピッチ走法で食らいつく', { gait: 'pitch', tail: 'fluffy' }),
  H('noir', 'ノワールクラウン', false, 6, 5, 4, 'sashi', 0x1C1A20, 0x101014, 0x3A1A6A, 0xC8D0E0, '漆黒の天才。ストライド走法で一気に突き放す', { gait: 'stride' }),
];
export const PHANTOM = H('phantom', 'ファントムナイト', false, 9, 9, 9, 'oikomi', 0x17151F, 0x0E0C14, 0x1A1024, 0xE0B830, '出走表にない、幻の馬', { gait: 'stride', tail: 'phantom', cap: 0x101018 });
ROSTER.push(PHANTOM);
export const SPECIAL = [8, 9];
export const PHANTOM_INDEX = 10;

export const RIVAL_SPEC = {
  goldrush: H('goldrush', 'ゴールドラッシュ', false, 5, 4, 4, 'senko', COAT.chestnut, 0xF0D060, 0xE0B020, 0x8A1A1A, '名門牧場の御曹司'),
  miyabi: H('miyabi', 'ミヤビノツキ', true, 5, 8, 5, 'senko', 0xE0B868, 0xF4ECD8, 0x8A5AB8, 0xF0E8D0, '古都の月夜姫'),
  ruby: H('ruby', 'ルビーフラッシュ', true, 6, 3, 4, 'nige', COAT.chestnut, 0xE8A060, 0xE03040, 0xF8F8F8, '紅の快速娘'),
  doronko: H('doronko', 'ドロンコオー', false, 4, 6, 7, 'senko', COAT.darkBay, 0x1A1A1A, 0x5A4A2A, 0x2A7A3A, '雨の日の怪物'),
  kaiser: H('kaiser', 'カイザーノヴァ', false, 7, 7, 6, 'sashi', COAT.darkBay, 0xD8D8E0, 0x4A1A7A, 0xF0C020, '無敗の皇帝'),
  phantom: PHANTOM,
};

export const RIVAL_NAMES = ['マッハタロウ', 'カゼノオウジ', 'ブラックサンダー', 'サクラフブキ', 'テンクウ', 'アイアンハート', 'ミスターダッシュ', 'シルバーアロー',
  'ドトウノキセキ', 'ツキミソウ', 'ハナビ', 'グランドホープ', 'モーニングスター', 'トップガン', 'ヨゾラ', 'ダイヤモンドダスト', 'ウミカゼ', 'イナズマキック',
  'カチドキ', 'ムサシボウ', 'ハッピーデイズ', 'タイフーン', 'ミカヅキ', 'ロードオブキング', 'スーパーノヴァ', 'コハルビヨリ', 'ガンバレタロー', 'レッドバロン', 'ノーブルワン'];
export const RIVAL_COATS = [COAT.chestnut, COAT.bay, COAT.darkBay, COAT.black, COAT.gray, COAT.bay, COAT.chestnut];
export const RIVAL_SILKS = [0x2E8B57, 0x8B1A1A, 0x1C3F94, 0xD4A017, 0x6A0DAD, 0xFF6F00, 0x00838F, 0xC2185B, 0x33691E, 0x37474F, 0x5D4037, 0x0277BD];

export const JOCKEY = {
  player: 'キミ',
  pool: ['風間リョウ', '鷹野ジン', '白石ミナ', '黒岩ゴウ', '早瀬カイト', '大河ゲン', '星野ルナ', '牧田ハジメ', '雷堂ケン', '小松ヒカル'],
  goldrush: '金城マサル', miyabi: '京極サヤ', phantom: '？？？', kaiser: 'C・シュバルツ', ruby: '赤星アカネ', doronko: '泥谷ゲンジ',
};

const R = (name, grade, distance, surface, rain, prize, level, venue, english) => ({ name, grade, distance, surface, rain, prize, level, venue, english });
export const RACES = [
  R('新馬戦', '新馬', 1000, 'turf', false, 700, 0.0, '北嶺', 'MAIDENS'),
  R('ジュニアステークス', 'G3', 1200, 'turf', false, 3000, 0.6, '北嶺', 'JUNIOR STAKES'),
  R('若駒フューチュリティ', 'G1', 1600, 'turf', false, 7000, 1.2, '東湾', 'YOUNG COLT FUTURITY'),
  R('春風賞', 'G1', 2000, 'turf', true, 10000, 1.8, '東湾', 'SPRING BREEZE CUP'),
  R('グランドダービー', 'G1', 2400, 'turf', false, 20000, 2.4, '府中台', 'THE GRAND DERBY'),
  R('長月賞', 'G1', 3000, 'turf', false, 12000, 2.9, '古都', 'AUTUMN CLASSIC'),
  R('ダートチャンピオンC', 'G1', 2000, 'dirt', false, 10000, 3.3, '大井沢', 'DIRT CHAMPION CUP'),
  R('冬のグランプリ', 'G1', 2500, 'turf', false, 30000, 3.8, '東湾', 'WINTER GRAND PRIX'),
  R('ワールドチャンピオンS', 'G1', 2400, 'turf', true, 50000, 4.5, 'パリジャン', 'WORLD CHAMPION STAKES'),
  R('幻影賞', 'EX', 2400, 'turf', false, 10000, 4.5, '府中台', 'PHANTOM NIGHT'),
];
export const MAIN_COUNT = 9;
export const EXTRA_INDEX = 9;
export const TRAINING_AFTER = [1, 3, 5];   // 2・4・6 戦目のあとだけ調教できる

// 物語のライバルと出るレース
export const STORY_RIVALS = [
  { key: 'goldrush', races: ['新馬戦', 'ジュニアステークス', 'グランドダービー', '冬のグランプリ'] },
  { key: 'ruby', races: ['若駒フューチュリティ', '冬のグランプリ'] },
  { key: 'doronko', races: ['春風賞', '冬のグランプリ'] },
  { key: 'miyabi', races: ['長月賞', '冬のグランプリ'] },
  { key: 'kaiser', races: ['ダートチャンピオンC', '冬のグランプリ', 'ワールドチャンピオンS'] },
  { key: 'phantom', races: ['幻影賞'] },
];
// そのレースに出るライバル (先頭が主役。後から出てきたライバルほど格上)
export const rivalsFor = race => STORY_RIVALS.filter(r => r.races.includes(race)).reverse().map(r => ({ spec: RIVAL_SPEC[r.key], jockey: JOCKEY[r.key] }));
export const STORY_NAMES = new Set(Object.values(RIVAL_SPEC).map(s => s.name));

// 厩舎の買い物 (次のレースだけ効く)
export const SHOP = [
  { name: '特製ニンジン', price: 500, text: '体力の減りが 15% 少なくなる', apply: b => { b.staminaK *= 0.85; } },
  { name: 'やわらかハミ', price: 1000, text: 'ムチを入れても嫌がりにくい', apply: b => { b.pressureK *= 0.65; } },
  { name: '勝負蹄鉄', price: 2000, text: 'いちばん速いときの速さが上がる', apply: b => { b.topBonus += 0.5; } },
];

export function formatYen(man) {
  if (man >= 10000) { const oku = Math.floor(man / 10000), rest = man % 10000; return rest === 0 ? `${oku}億円` : `${oku}億${rest}万円`; }
  return `${man}万円`;
}

export const TRAINER = '森川トク';
export const TITLES = ['はじまりの朝', '名門の壁', 'はじめてのGⅠ', '雨の向こう側', '夢のダービー', '古都の月夜姫', '砂の洗礼', '集結', '世界の頂へ', 'ファントム'];
export const TAGLINES = ['小さな厩舎の、最初の一歩', '名門の御曹司が待つ初めての重賞', '若駒たちの頂上決戦', '冷たい雨の重馬場', '一生に一度の夢の舞台',
  '古都の女王と三千メートル', '砂の上に、無敗の皇帝', 'ファン投票の夢の舞台に、ライバル集結', '海の向こう、最後の決着', '出走表にない、幻の馬'];

// 出走前の会話。who: narration / trainer / me / horse / rival / rivalJockey / guest:<key>
export function storyLines(c) {
  const h = c.horse.persona, rv = c.rival ? c.rival.spec.persona : P({});
  const rk = c.rival ? c.rival.spec.id : '';
  const out = [];
  const n = t => out.push({ who: 'narration', text: t });
  const t = s => out.push({ who: 'trainer', text: s });
  const me = s => out.push({ who: 'me', text: s });
  const hs = s => out.push({ who: 'horse', text: s });
  const rs = s => out.push({ who: 'rival', text: s });
  const js = s => out.push({ who: 'rivalJockey', text: s });
  const gs = (key, s) => { if (c.guests.some(g => g.spec.id === key)) out.push({ who: 'guest:' + key, text: s }); };
  const duel = key => c.duels[key] || { won: 0, lost: 0 };
  const d = duel(rk);
  const lookBack = () => {
    if (c.lastPlace === 1) t('前走は見事だった。だが勝って兜の緒を締めよ、だ');
    else if (c.lastPlace === 2 || c.lastPlace === 3) t(`前走は${c.lastPlace}着。悪くない。あと少しだったな`);
    else if (c.lastPlace > 3) t('前は悔しい思いをしたな。その悔しさを脚に変えろ');
  };
  switch (c.raceIndex) {
    case 0:
      n('北嶺の小さな厩舎。夜明け前、白い息がのぼる。');
      t(`いよいよデビューだな。${c.horse.name}の脚は本物だ。わしが保証する`);
      me('目標は…世界の大レース、ワールドチャンピオンSです！');
      t('ハハ、大きく出たな。だが夢は口に出してこそだ');
      if (rk === 'goldrush') { js('おやおや、田舎の厩舎がデビューかい？'); rs(rv.taunt); }
      hs(pick(h.start));
      t('ゲートを出たら、あとはこの子を信じろ。行ってこい！');
      break;
    case 1:
      n('初めての重賞。スタンドのざわめきが近い。');
      lookBack();
      if (rk === 'goldrush') { js(d.won > 0 ? '前のはマグレさ！ ボクのゴールドラッシュが負けるもんか！' : '重賞は庶民の来る場所じゃないよ。帰ったらどうだい？'); rs(pick(rv.start)); }
      t('名門だろうが何だろうが、ゴールは一つだ');
      hs(pick(h.final));
      break;
    case 2:
      n('GⅠのファンファーレが鳴る。若駒たちの頂上決戦。');
      lookBack();
      t('東湾はゴール前に急坂がある。最後まで脚を残しておけ');
      if (rk === 'ruby') {
        n('ゲート裏で、赤い勝負服の少女が手を振っている。');
        js('ねえねえ、北嶺から来たんでしょ？ マイルはあたしたちの庭だよ！');
        rs(rv.taunt);
        t('あの赤い牝馬は逃げ足が速い。最初から飛ばしてくるぞ');
      }
      me('はじめてのGⅠ…手が震える');
      t('震えるのは本気の証拠だ。行ってこい');
      hs(pick(h.start));
      break;
    case 3:
      n('朝から冷たい雨。馬場は重く、足もとがぬかるむ。');
      lookBack();
      t('重馬場は根性の勝負だ。内の荒れたところは避けて通れ');
      if (rk === 'doronko') {
        n('泥をはね上げて、大きな黒鹿毛が返し馬をしている。');
        js('ほう、若いの。雨の日は年寄りの出番よ');
        rs(rv.taunt);
        t('泥谷のじいさんか…。雨の春風賞では負け知らずだ');
      }
      me('泥だらけになっても、前へ！');
      hs(pick(h.final));
      break;
    case 4:
      n('一生に一度の舞台、グランドダービー。十万人の歓声がうねる。');
      t('わしも昔、ここを目指した。…届かなかったがな');
      t('今度は、お前たちが連れていってくれ');
      if (rk === 'goldrush') { js(d.won > d.lost ? 'ここまで来たら認めてあげるよ。でも、ダービーだけは渡さない！' : '最後に勝つのは血統さ。それを教えてあげるよ'); rs(pick(rv.hyper)); }
      me('トクさんの夢も、乗せていきます！');
      hs(h.taunt);
      break;
    case 5:
      n('秋の古都。三千メートルの長い旅がはじまる。');
      lookBack();
      if (rk === 'miyabi') {
        t('ダービーのあと金城の坊っちゃんが言っとった。『長月賞の月毛には気をつけろ』とな');
        js('ダービーの噂、聞いとります。けど、ここは古都どすえ');
        rs(rv.taunt);
      }
      t('3コーナーの坂で慌てたら終わりだ。じっと我慢しろ');
      me('長い距離…この子と呼吸を合わせる');
      hs(pick(h.start));
      break;
    case 6:
      n('初めてのダート。蹴り上げた砂が顔に当たる。');
      lookBack();
      t('芝とはまるで違う。力で押し切るレースだ');
      if (rk === 'kaiser') {
        n('パドックに、黒く大きな影。海の向こうから来た無敗の馬。');
        js('…キミたちが、この国の希望か。期待外れでないといいが');
        rs(rv.taunt);
        t('…あれがカイザーノヴァ。デビュー以来、一度も負けていない');
      }
      hs(pick(h.final));
      break;
    case 7:
      n('年末の大一番、冬のグランプリ。ファン投票で選ばれた馬だけが走れる夢の舞台。');
      if (c.guests.length) {
        n('ゲート裏に、見覚えのある勝負服がひとつ、またひとつと集まってくる。');
        const g = duel('goldrush');
        gs('goldrush', g.won >= g.lost ? 'やあ。ファン投票、今年はキミたちに負けたよ。…レースまでは負けないけどね' : 'やあ。ファン投票はボクの方が上だったね。当然さ');
        gs('ruby', 'あたしも来ちゃった！ 2500mは長いけど、逃げ切っちゃうもんね！');
        gs('doronko', '年寄りまで呼ばれたわい。晴れの日でも、ただでは負けんぞ');
        gs('miyabi', duel('miyabi').won > 0 ? '長月賞の借り、ここで返させてもらいますえ' : 'また一緒に走れて、うれしおす。手加減はしまへんえ');
        t('…まるで同窓会だな。だが、どの顔も本気だ');
        n('そして最後に、ファン投票1位。黒く大きな影が、ゆっくりとゲートへ向かう。');
      } else n('ファン投票1位は、皇帝。');
      if (rk === 'kaiser') {
        if (d.won > 0) { t('皇帝に土をつけたのは、世界でお前たちだけだ'); js('…あの日のことは忘れていない'); }
        else { t('砂では皇帝に届かなかった。だが芝ならどうだ'); js('何度来ても同じことだ'); }
        rs(pick(rv.start));
      } else lookBack();
      me(c.guests.length ? '今まで戦ってきた全員に、ここで勝つ！' : '勝てない相手なんていない。そうだろ？');
      hs(pick(h.final));
      break;
    case 8:
      n('海を越えて、パリジャン競馬場。世界中の名馬が集まった。');
      t('北嶺の小さな厩舎から、よくここまで来たな');
      t('デビューの朝の約束、覚えてるか');
      me('はい。…世界の大レースを、勝ちます！');
      if (rk === 'kaiser') { js('ここは我々の庭だ。最後の決着をつけよう'); rs(pick(rv.final)); }
      hs(h.taunt);
      t('行ってこい。お前たちはもう、世界一の相棒だ');
      break;
    default:
      if (c.trial) {   // 体験版: 物語を飛ばして、まだ育っていない馬で挑む
        n('北嶺の小さな厩舎。デビュー前の馬のもとに、妙な噂が届いた。');
        t('府中台の夜のレースに、出走表にない馬がまぎれこむそうだ');
        t('漆黒の影が後ろから現れて、先頭を抜き去り…ゴールの先で消える、とな');
        me('まだデビュー前だけど…見てみたい。走らせてください！');
        t('無茶を言う。だが、いまの力を知るのも悪くない');
        t('手綱で脚をためて、最後の直線でムチだ。アイテムは右の端に出る印を見て寄せろ');
        hs(pick(h.start));
        break;
      }
      n('世界の頂に立った、その年の暮れ。北嶺に妙な噂が流れてきた。');
      t('府中台の夜のレースに、出走表にない馬がまぎれこむそうだ');
      t('漆黒の影が後ろから現れて、先頭を抜き去り…ゴールの先で消える、とな');
      me('出走表にない馬…？ そんなの、走れるはずが');
      t('幻だと笑う者もおる。だがな、ターフには蹄の跡が残っとった。実体のある、何かだ');
      n('その夜。ゲートに入る直前、背筋を冷たい風がなでていった。');
      hs(pick(h.start));
      t('何が来ても、最後はお前たちの脚だ。…行ってこい');
  }
  return out;
}

// レース後のライバルの騎手のひとこと
export function rivalWord(key, rivalWon) {
  const W = {
    goldrush: ['これが名門と庶民の差さ。わかったかい？', 'つ、次は負けないからな！ 覚えてろよ！'],
    ruby: ['えへへ、いっちばーん！ また走ろうね！', 'くやしーっ！ 次は絶対あたしが前だからね！'],
    doronko: ['雨の日の年寄りをなめちゃいかん', '…いい脚だ。晴れでも雨でも、強い馬は強い'],
    miyabi: ['おおきに。ええ勝負どした', '負けましたわ…あんさんら、ほんまに強おす'],
  }[key] || ['…まだ足りない。出直してこい', '…面白い。次は、本気で行く'];
  return rivalWon ? W[0] : W[1];
}

// エンディングのあとの後日談
export function epilogue(c, horse) {
  const duel = k => c.duels[k] || { won: 0, lost: 0 };
  const g = duel('goldrush'), m = duel('miyabi'), k = duel('kaiser');
  return [
    { name: `調教師 ${TRAINER}`, lines: ['あれから一年。北嶺の小さな厩舎には、入門を願う若駒が列をなしている。', '「わしの夢は、お前たちがかなえてくれた。次は、この子らの番だ」'] },
    { name: 'ゴールドラッシュと金城マサル', lines: [g.won >= g.lost ? '金城マサルは父の決めた馬ではなく、自分の目で選んだ馬に乗るようになった。' : 'ゴールドラッシュは翌年、名門の意地を見せて重賞を三連勝した。', '「次こそボクが勝つ。…キミたちのおかげで、本気になれたよ」'] },
    { name: 'ルビーフラッシュとドロンコオー', lines: ['ルビーフラッシュはマイルの女王に。赤星アカネは「次はダービーにも出る！」と息まいている。', '泥谷ゲンジは引退を決めた。最後の雨の日、ドロンコオーと泥まみれで笑っていた。'] },
    { name: 'ミヤビノツキと京極サヤ', lines: [m.won > 0 ? '長月賞で初めて土がついたミヤビノツキは、翌年から古都大賞典を三連覇した。' : 'ミヤビノツキは古都大賞典を三連覇。古都の月夜姫と呼ばれ続けている。', '「あの子らと走って、もう一回強うなりたい思いましたえ」'] },
    { name: 'カイザーノヴァとC・シュバルツ', lines: [k.won > 1 ? '二度の敗北を知った皇帝は、海の向こうで、また一から走り直している。' : '初めての敗北を知った皇帝は、海の向こうで再び無敗の道を歩みはじめた。', '「次は我々の国で待っている。…今度は、負けない」'] },
    { name: horse.name, lines: [`${horse.name}は今日も、北嶺の朝の空気の中を走っている。`, `通算 ${c.starts}戦${c.wins}勝。いつか、またあの大舞台へ。`] },
  ];
}
