/**
 * Item catalogue — the Isaac-style build engine.
 *
 * An item is pure data plus optional hook functions. Three orthogonal ways to
 * change the game:
 *
 *   stats  additive stat deltas          e.g. { damage: +1, fireRate: +0.25 }
 *   mult   multiplicative stat scaling   e.g. { damageMult: 1.3 }
 *   flags  shot-pipeline modifiers       e.g. { homing: 0.6, pierce: 1 }
 *
 * `flags` are what make items combine: they stack additively and the shot
 * pipeline applies all of them at once, so "homing + split + explosive" works
 * without anyone writing that combination down. Named combinations that deserve
 * bespoke behaviour live in synergies.js.
 *
 * Hooks receive a context object and must stay side-effect-free with respect to
 * the DOM — they only touch the simulation.
 *
 * `art` drives the procedural item sprite painter:
 *   shape  orb|blade|ring|book|heart|skull|wing|gem|flask|star|bomb|crown|eye|
 *          rune|horn|claw|mask|clover|gear|feather|mushroom|candle|shard|egg
 *   colors [main, accent, glow]
 */

/** Base player statistics before any item is applied. */
export const BASE_STATS = {
  maxHp: 6, // in half-hearts
  damage: 3.2,
  damageMult: 1,
  fireRate: 2.7, // shots per second
  shotSpeed: 275,
  range: 0.78, // projectile lifetime in seconds
  moveSpeed: 122,
  shotSize: 4.4,
  knockback: 62,
  luck: 0,
  armor: 0,
  critChance: 0.04,
  critMult: 2.0,
  dashCooldown: 1.15,
  dashPower: 340,
  contactIFrames: 0.85,
};

export const ITEMS = {
  // ---------------------------------------------------------------- offence
  ironFang: {
    name: 'Железный клык',
    desc: 'Урон +1.2. Выстрелы отбрасывают сильнее.',
    quality: 1,
    pools: ['treasure', 'shop', 'boss'],
    tags: ['damage'],
    art: { shape: 'blade', colors: ['#c9d4e0', '#7f8b99', '#ffffff'] },
    stats: { damage: 1.2, knockback: 26 },
  },
  emberCore: {
    name: 'Ядро углей',
    desc: 'Выстрелы поджигают врагов.',
    quality: 2,
    pools: ['treasure', 'boss'],
    tags: ['fire'],
    art: { shape: 'orb', colors: ['#ff7a2f', '#ffd166', '#fff3b0'] },
    flags: { burn: 0.55 },
    stats: { damage: 0.4 },
  },
  frostLens: {
    name: 'Морозная линза',
    desc: 'Шанс заморозить врага на месте.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['ice'],
    art: { shape: 'gem', colors: ['#9fe6ff', '#3fb8ff', '#ffffff'] },
    flags: { freeze: 0.3 },
    stats: { shotSpeed: 20 },
  },
  venomSac: {
    name: 'Ядовитый мешок',
    desc: 'Выстрелы отравляют. Яд тикает со временем.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['poison'],
    art: { shape: 'flask', colors: ['#8ede4a', '#4a8f2a', '#d9ff9c'] },
    flags: { poison: 0.6 },
  },
  stormCoil: {
    name: 'Грозовая катушка',
    desc: 'Попадания перескакивают на ближайшего врага.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['shock'],
    art: { shape: 'gear', colors: ['#ffe066', '#7cc7ff', '#ffffff'] },
    flags: { chain: 1, shock: 0.35 },
  },
  splitStone: {
    name: 'Камень раскола',
    desc: 'При попадании выстрел раскалывается на два осколка.',
    quality: 3,
    pools: ['treasure'],
    tags: ['split'],
    art: { shape: 'shard', colors: ['#d8c7ff', '#8f6ff0', '#ffffff'] },
    flags: { splitOnHit: 2 },
    mult: { damageMult: 0.88 },
  },
  hollowPoint: {
    name: 'Полая пуля',
    desc: 'Выстрелы пробивают одного врага насквозь.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['pierce'],
    art: { shape: 'ring', colors: ['#ffd166', '#b07a20', '#fff3b0'] },
    flags: { pierce: 1 },
  },
  rubberSkull: {
    name: 'Резиновый череп',
    desc: 'Выстрелы отскакивают от стен дважды.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['bounce'],
    art: { shape: 'skull', colors: ['#f2e9d8', '#9c8f78', '#ffffff'] },
    flags: { bounce: 2 },
    stats: { range: 0.2 },
  },
  ghostVeil: {
    name: 'Призрачная вуаль',
    desc: 'Выстрелы проходят сквозь камни и стены.',
    quality: 3,
    pools: ['treasure'],
    tags: ['spectral'],
    art: { shape: 'mask', colors: ['#cfe8ff', '#7f9bb5', '#ffffff'] },
    flags: { spectral: 1 },
  },
  seekerEye: {
    name: 'Глаз-ищейка',
    desc: 'Выстрелы наводятся на врагов.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['homing'],
    art: { shape: 'eye', colors: ['#ff6b9d', '#ffffff', '#ffd1e6'] },
    flags: { homing: 0.75 },
    mult: { damageMult: 0.92 },
  },
  tripleBarrel: {
    name: 'Тройной ствол',
    desc: '+2 выстрела веером, но урон каждого меньше.',
    quality: 3,
    pools: ['treasure', 'shop'],
    tags: ['multishot'],
    art: { shape: 'horn', colors: ['#b5b5c9', '#5f5f78', '#e8e8f5'] },
    flags: { multishot: 2, spread: 0.3 },
    mult: { damageMult: 0.72 },
  },
  rapidGear: {
    name: 'Скорострельная шестерня',
    desc: 'Скорострельность +0.9.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['firerate'],
    art: { shape: 'gear', colors: ['#c0d6e4', '#6d8494', '#ffffff'] },
    stats: { fireRate: 0.9 },
    mult: { damageMult: 0.9 },
  },
  heavySlug: {
    name: 'Тяжёлая пуля',
    desc: 'Урон x1.45, скорострельность ниже.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['damage'],
    art: { shape: 'orb', colors: ['#8a8f99', '#4a4f57', '#d0d6de'] },
    mult: { damageMult: 1.45 },
    stats: { fireRate: -0.75, shotSize: 2.2, knockback: 40 },
  },
  witchsEye: {
    name: 'Ведьмин глаз',
    desc: 'Критический шанс +18%, крит x2.6.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['crit'],
    art: { shape: 'eye', colors: ['#b06bff', '#2a1050', '#ffd6ff'] },
    stats: { critChance: 0.18, critMult: 0.6, luck: 1 },
  },
  moltenLance: {
    name: 'Расплавленное копьё',
    desc: 'Каждый пятый выстрел — прошивающее огненное копьё.',
    quality: 3,
    pools: ['treasure'],
    tags: ['fire', 'pierce'],
    art: { shape: 'blade', colors: ['#ff5722', '#ffc93c', '#fff0c0'] },
    hooks: {
      onShoot(ctx) {
        ctx.player.counters.lance = (ctx.player.counters.lance || 0) + 1;
        if (ctx.player.counters.lance % 5 === 0) {
          for (const s of ctx.shots) {
            s.damage *= 2.1;
            s.pierce += 4;
            s.radius += 3;
            s.burn = Math.max(s.burn, 0.9);
            s.style = 'lance';
          }
        }
      },
    },
  },
  orbitShard: {
    name: 'Осколок-спутник',
    desc: 'Вокруг тебя вращается осколок, наносящий урон.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['orbital'],
    art: { shape: 'shard', colors: ['#4fe1ff', '#1a6ea0', '#e6fbff'] },
    flags: { orbitals: 1 },
  },
  thornMail: {
    name: 'Шипастая кольчуга',
    desc: 'Враги, коснувшиеся тебя, получают урон.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['defence'],
    art: { shape: 'ring', colors: ['#9fb2c4', '#4c5f70', '#e4f0ff'] },
    stats: { armor: 1 },
    hooks: {
      onContact(ctx) {
        ctx.game.damageEnemy(ctx.enemy, 6 + ctx.player.stats.damage, { source: 'thorns', kind: 'true' });
      },
    },
  },

  // --------------------------------------------------------------- mobility
  swiftBoots: {
    name: 'Быстрые сапоги',
    desc: 'Скорость передвижения +18.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['speed'],
    art: { shape: 'wing', colors: ['#7ee081', '#2f7a3c', '#dfffe0'] },
    stats: { moveSpeed: 18 },
  },
  phaseDash: {
    name: 'Фазовый рывок',
    desc: 'Рывок проходит сквозь врагов и снаряды.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['dash'],
    art: { shape: 'feather', colors: ['#c8b6ff', '#6247aa', '#ffffff'] },
    stats: { dashCooldown: -0.25 },
    flags: { phaseDash: 1 },
  },
  windSpurs: {
    name: 'Ветряные шпоры',
    desc: 'Рывок оставляет режущий вихрь.',
    quality: 2,
    pools: ['treasure'],
    tags: ['dash'],
    art: { shape: 'feather', colors: ['#a8e6ff', '#3f8fb5', '#ffffff'] },
    stats: { dashCooldown: -0.15, moveSpeed: 6 },
    hooks: {
      onDash(ctx) {
        ctx.game.spawnShockwave(ctx.player.x, ctx.player.y, {
          radius: 46,
          damage: 4 + ctx.player.stats.damage * 0.5,
          team: 0,
          color: '#a8e6ff',
        });
      },
    },
  },
  featherWeight: {
    name: 'Пёрышко',
    desc: 'Скорость +10, но здоровья на пол-сердца меньше.',
    quality: 1,
    pools: ['treasure', 'shop', 'challenge'],
    tags: ['speed'],
    art: { shape: 'feather', colors: ['#ffffff', '#c9c9d8', '#ffffff'] },
    stats: { moveSpeed: 10, maxHp: -1 },
  },

  // --------------------------------------------------------------- survival
  oakHeart: {
    name: 'Дубовое сердце',
    desc: 'Максимум здоровья +1 сердце, полное исцеление.',
    quality: 1,
    pools: ['treasure', 'shop', 'boss'],
    tags: ['health'],
    art: { shape: 'heart', colors: ['#e05252', '#7a1f1f', '#ffb3b3'] },
    stats: { maxHp: 2 },
    hooks: {
      onPickup(ctx) {
        ctx.player.hp = ctx.player.stats.maxHp;
      },
    },
  },
  stoneSkin: {
    name: 'Каменная кожа',
    desc: 'Броня +2. Скорость чуть ниже.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['defence'],
    art: { shape: 'gem', colors: ['#9aa4ae', '#525a63', '#d8e0e8'] },
    stats: { armor: 2, moveSpeed: -7 },
  },
  guardianCharm: {
    name: 'Оберег стража',
    desc: 'Раз в комнату поглощает один удар.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['defence'],
    art: { shape: 'rune', colors: ['#ffe066', '#a8791a', '#fff6c9'] },
    flags: { wardPerRoom: 1 },
  },
  bloodPact: {
    name: 'Кровавый договор',
    desc: 'Урон x1.6, но максимум здоровья -1 сердце.',
    quality: 3,
    pools: ['treasure', 'challenge'],
    tags: ['damage', 'risk'],
    art: { shape: 'rune', colors: ['#ff2e63', '#5a0d22', '#ffb3c8'] },
    mult: { damageMult: 1.6 },
    stats: { maxHp: -2 },
  },
  lastCandle: {
    name: 'Последняя свеча',
    desc: 'Один раз за забег спасает от смерти с 1 сердцем.',
    quality: 4,
    pools: ['treasure', 'boss'],
    tags: ['defence'],
    art: { shape: 'candle', colors: ['#fff3b0', '#ff9d3c', '#ffffff'] },
    flags: { revive: 1 },
  },
  leech: {
    name: 'Пиявка',
    desc: 'Каждое 12-е убийство даёт пол-сердца.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['health'],
    art: { shape: 'mushroom', colors: ['#c0397b', '#5f1338', '#ffb3e0'] },
    hooks: {
      onKill(ctx) {
        ctx.player.counters.leech = (ctx.player.counters.leech || 0) + 1;
        if (ctx.player.counters.leech % 12 === 0) ctx.game.healPlayer(1);
      },
    },
  },

  // ---------------------------------------------------------------- economy
  luckyClover: {
    name: 'Счастливый клевер',
    desc: 'Удача +2. Больше хороших выпадений.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['luck'],
    art: { shape: 'clover', colors: ['#7ee081', '#2f7a3c', '#e6ffe6'] },
    stats: { luck: 2 },
  },
  midasChip: {
    name: 'Жетон Мидаса',
    desc: 'Враги иногда роняют монеты. Монеты дают немного урона.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['economy'],
    art: { shape: 'star', colors: ['#ffd93d', '#9c6b0a', '#fff3b0'] },
    hooks: {
      onKill(ctx) {
        if (ctx.game.rng.chance(0.22 + ctx.player.stats.luck * 0.02)) {
          ctx.game.dropPickup(ctx.enemy.x, ctx.enemy.y, 'coin');
        }
      },
      onStats(ctx) {
        ctx.stats.damage += Math.min(4, ctx.player.coins * 0.06);
      },
    },
  },
  skeletonKey: {
    name: 'Скелетный ключ',
    desc: 'Двери и сундуки открываются без ключей.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['utility'],
    art: { shape: 'rune', colors: ['#e0d5b0', '#8a7a4a', '#fff6d0'] },
    flags: { freeUnlock: 1 },
  },
  hagglersTongue: {
    name: 'Язык торгаша',
    desc: 'Товары в лавке дешевле на треть.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['economy'],
    art: { shape: 'mask', colors: ['#ff9d3c', '#8a4a10', '#ffe0b0'] },
    flags: { discount: 0.34 },
  },

  // ------------------------------------------------------- exotic / builds
  prismCrown: {
    name: 'Призматическая корона',
    desc: 'Каждый выстрел случайной стихии и бьёт по-разному.',
    quality: 4,
    pools: ['treasure', 'boss'],
    tags: ['fire', 'ice', 'poison', 'shock'],
    art: { shape: 'crown', colors: ['#ff4fa3', '#4fe1ff', '#ffe14f'] },
    hooks: {
      onShoot(ctx) {
        for (const s of ctx.shots) {
          const roll = ctx.game.rng.int(0, 3);
          if (roll === 0) {
            s.burn = 1;
            s.color = '#ff7a2f';
          } else if (roll === 1) {
            s.freeze = 1;
            s.color = '#7fe6ff';
          } else if (roll === 2) {
            s.poison = 1;
            s.color = '#8ede4a';
          } else {
            s.shock = 1;
            s.color = '#ffe066';
          }
          s.damage *= 1.1;
        }
      },
    },
  },
  gravityWell: {
    name: 'Гравитационный колодец',
    desc: 'Выстрелы притягивают врагов к точке попадания.',
    quality: 3,
    pools: ['treasure'],
    tags: ['control'],
    art: { shape: 'orb', colors: ['#6247aa', '#150c2e', '#c8b6ff'] },
    flags: { gravity: 1 },
  },
  mirrorShard: {
    name: 'Зеркальный осколок',
    desc: 'Стреляешь ещё и назад.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['multishot'],
    art: { shape: 'shard', colors: ['#dff3ff', '#7f9bb5', '#ffffff'] },
    flags: { backShot: 1 },
  },
  crossFire: {
    name: 'Перекрестье',
    desc: 'Стреляешь во все четыре стороны.',
    quality: 3,
    pools: ['treasure'],
    tags: ['multishot'],
    art: { shape: 'star', colors: ['#7cc7ff', '#2a5f8a', '#ffffff'] },
    flags: { crossShot: 1 },
    mult: { damageMult: 0.8 },
  },
  boomerangFang: {
    name: 'Клык-бумеранг',
    desc: 'Выстрелы возвращаются к тебе.',
    quality: 3,
    pools: ['treasure'],
    tags: ['boomerang'],
    art: { shape: 'claw', colors: ['#ffd166', '#8a5a10', '#fff3c0'] },
    flags: { boomerang: 1, pierce: 2 },
    stats: { range: 0.15 },
  },
  chargeCoil: {
    name: 'Заряжающая катушка',
    desc: 'Задержи выстрел — получишь мощный заряд.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['charge'],
    art: { shape: 'gear', colors: ['#66fcf1', '#1a6e6a', '#e0fffd'] },
    flags: { charged: 1 },
  },
  bombHeart: {
    name: 'Бомбовое сердце',
    desc: 'Выстрелы взрываются. Бомб +2.',
    quality: 4,
    pools: ['treasure', 'boss'],
    tags: ['explosive'],
    art: { shape: 'bomb', colors: ['#3a3a4a', '#ff5722', '#ffd166'] },
    flags: { explosive: 1 },
    mult: { damageMult: 0.85 },
    stats: { fireRate: -0.3 },
    hooks: {
      onPickup(ctx) {
        ctx.player.bombs += 2;
      },
    },
  },
  scatterSeed: {
    name: 'Разлётное семя',
    desc: 'Убитые враги выпускают шипы во все стороны.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['onkill'],
    art: { shape: 'mushroom', colors: ['#7ee081', '#2f7a3c', '#d8ffcf'] },
    hooks: {
      onKill(ctx) {
        ctx.game.spawnBurst(ctx.enemy.x, ctx.enemy.y, {
          count: 5,
          speed: 190,
          damage: 3 + ctx.player.stats.damage * 0.4,
          team: 0,
          color: '#7ee081',
          life: 0.5,
        });
      },
    },
  },
  soulHarvest: {
    name: 'Жатва душ',
    desc: 'Каждое убийство ненадолго повышает урон. Стакается.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['scaling'],
    art: { shape: 'skull', colors: ['#c8b6ff', '#3b2a6e', '#ffffff'] },
    hooks: {
      onKill(ctx) {
        const p = ctx.player;
        p.timers.harvest = 5;
        p.counters.harvest = Math.min(12, (p.counters.harvest || 0) + 1);
        p.statsDirty = true;
      },
      onStats(ctx) {
        ctx.stats.damage += (ctx.player.counters.harvest || 0) * 0.35;
      },
      onUpdate(ctx) {
        const p = ctx.player;
        if (p.counters.harvest && p.timers.harvest <= 0) {
          p.counters.harvest = 0;
          p.statsDirty = true;
        }
      },
    },
  },
  glassCannon: {
    name: 'Стеклянная пушка',
    desc: 'Урон x2.2. Ты умираешь с одного попадания.',
    quality: 4,
    pools: ['treasure', 'challenge'],
    tags: ['damage', 'risk'],
    art: { shape: 'flask', colors: ['#a8e6ff', '#2a6e8a', '#ffffff'] },
    mult: { damageMult: 2.2 },
    flags: { glass: 1 },
  },
  berserkerMask: {
    name: 'Маска берсерка',
    desc: 'Чем меньше здоровья, тем больше урон.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['scaling'],
    art: { shape: 'mask', colors: ['#ff2e63', '#5a0d22', '#ffd1dd'] },
    hooks: {
      onStats(ctx) {
        const frac = ctx.player.hp / Math.max(1, ctx.stats.maxHp);
        ctx.stats.damageMult *= 1 + (1 - frac) * 0.85;
      },
    },
  },
  packLeader: {
    name: 'Вожак стаи',
    desc: 'С тобой сражается дружественный дух.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['familiar'],
    art: { shape: 'claw', colors: ['#7cff6b', '#1f6e2a', '#e6ffe0'] },
    flags: { familiars: 1 },
  },
  twinSpirit: {
    name: 'Дух-близнец',
    desc: 'Ещё один спутник, стреляет вместе с тобой.',
    quality: 3,
    pools: ['treasure'],
    tags: ['familiar'],
    art: { shape: 'egg', colors: ['#c8b6ff', '#4a3a80', '#ffffff'] },
    flags: { familiars: 1 },
  },
  hexBook: {
    name: 'Книга проклятий',
    desc: 'Каждый пятый выстрел — самонаводящийся череп.',
    quality: 3,
    pools: ['treasure', 'shop'],
    tags: ['homing'],
    art: { shape: 'book', colors: ['#6247aa', '#241640', '#c8b6ff'] },
    hooks: {
      onShoot(ctx) {
        const p = ctx.player;
        p.counters.hex = (p.counters.hex || 0) + 1;
        if (p.counters.hex % 5 === 0) {
          for (const s of ctx.shots) {
            s.homing = Math.max(s.homing, 1.4);
            s.damage *= 1.5;
            s.style = 'hex';
            s.color = '#c8b6ff';
            s.life += 0.6;
          }
        }
      },
    },
  },
  echoStone: {
    name: 'Камень эха',
    desc: 'Шанс выстрелить дважды за один раз.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['multishot'],
    art: { shape: 'gem', colors: ['#4fe1ff', '#12506e', '#eafcff'] },
    flags: { echo: 0.3 },
  },
  brimstoneSigil: {
    name: 'Печать серы',
    desc: 'Заряженный выстрел превращается в сплошной луч.',
    quality: 4,
    pools: ['treasure', 'boss'],
    tags: ['laser', 'charge'],
    art: { shape: 'rune', colors: ['#ff2e63', '#3a0512', '#ffb3c8'] },
    flags: { charged: 1, laser: 1 },
    stats: { fireRate: -0.5 },
    mult: { damageMult: 1.2 },
  },
  vampireFang: {
    name: 'Клык вампира',
    desc: 'Криты восстанавливают здоровье.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['crit', 'health'],
    art: { shape: 'claw', colors: ['#ff6b9d', '#4a0a20', '#ffd1e6'] },
    stats: { critChance: 0.08 },
    hooks: {
      onCrit(ctx) {
        if (ctx.game.rng.chance(0.2)) ctx.game.healPlayer(1);
      },
    },
  },
  timeSand: {
    name: 'Песок времени',
    desc: 'Вражеские снаряды летят медленнее.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['control'],
    art: { shape: 'flask', colors: ['#ffe066', '#8a6a10', '#fff8d0'] },
    flags: { slowEnemyShots: 0.28 },
  },
  magnetHeart: {
    name: 'Магнитное сердце',
    desc: 'Подбираешь предметы издалека.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['utility'],
    art: { shape: 'heart', colors: ['#ff4fa3', '#5a0d3a', '#ffd1ec'] },
    flags: { magnet: 110 },
  },
  cartographersEye: {
    name: 'Глаз картографа',
    desc: 'Вся карта этажа открыта сразу.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['utility'],
    art: { shape: 'eye', colors: ['#7cc7ff', '#20405e', '#ffffff'] },
    flags: { fullMap: 1 },
  },
  moonPhase: {
    name: 'Фаза луны',
    desc: 'В новой комнате первые 2 секунды ты неуязвим.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['defence'],
    art: { shape: 'orb', colors: ['#dfe9ff', '#6b7aa0', '#ffffff'] },
    hooks: {
      onRoomEnter(ctx) {
        ctx.player.invuln = Math.max(ctx.player.invuln, 2);
      },
    },
  },
  furyPlate: {
    name: 'Пластина ярости',
    desc: 'После получения урона: скорострельность x2 на 4 секунды.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['scaling'],
    art: { shape: 'gem', colors: ['#ff5722', '#5a1a08', '#ffd1b3'] },
    hooks: {
      onHurt(ctx) {
        ctx.player.timers.fury = 4;
        ctx.player.statsDirty = true;
      },
      onStats(ctx) {
        if (ctx.player.timers.fury > 0) ctx.stats.fireRate *= 2;
      },
    },
  },
  greedRing: {
    name: 'Кольцо жадности',
    desc: 'Урон растёт с числом монет, но враги крепче.',
    quality: 3,
    pools: ['treasure', 'challenge'],
    tags: ['economy', 'risk'],
    art: { shape: 'ring', colors: ['#ffd93d', '#7a5a08', '#fff3b0'] },
    flags: { enemyHpMult: 0.15 },
    hooks: {
      onStats(ctx) {
        ctx.stats.damage += ctx.player.coins * 0.14;
      },
    },
  },
  wispLantern: {
    name: 'Фонарь-светляк',
    desc: 'Освещает комнату и слепит врагов рядом.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['utility'],
    art: { shape: 'candle', colors: ['#ffe066', '#8a6a10', '#fffbe0'] },
    flags: { light: 1, dazzle: 1 },
  },
  quakeStep: {
    name: 'Поступь землетрясения',
    desc: 'Каждый 4-й рывок вызывает ударную волну.',
    quality: 2,
    pools: ['treasure'],
    tags: ['dash'],
    art: { shape: 'gem', colors: ['#9c5330', '#3a1a12', '#ffb37a'] },
    hooks: {
      onDash(ctx) {
        const p = ctx.player;
        p.counters.quake = (p.counters.quake || 0) + 1;
        if (p.counters.quake % 4 === 0) {
          ctx.game.spawnShockwave(p.x, p.y, {
            radius: 96,
            damage: 8 + p.stats.damage,
            team: 0,
            color: '#ffb37a',
            stun: 0.7,
          });
        }
      },
    },
  },
  cursedCoin: {
    name: 'Проклятая монета',
    desc: 'Урон +2, но каждая комната стоит пол-сердца... если ты жаден.',
    quality: 3,
    pools: ['challenge', 'treasure'],
    tags: ['risk'],
    art: { shape: 'star', colors: ['#b06bff', '#2a1050', '#ffd6ff'] },
    stats: { damage: 2 },
    hooks: {
      onRoomClear(ctx) {
        if (ctx.player.coins >= 20 && ctx.game.rng.chance(0.35)) {
          ctx.game.damagePlayer(1, { source: 'curse', ignoreArmor: true });
        }
      },
    },
  },
  ironLung: {
    name: 'Железные лёгкие',
    desc: 'Дальность выстрела +45%.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['range'],
    art: { shape: 'orb', colors: ['#b5c6d4', '#54646f', '#eaf4ff'] },
    mult: { rangeMult: 1.45 },
  },
  sharpFocus: {
    name: 'Острый фокус',
    desc: 'Выстрелы летят быстрее и точнее.',
    quality: 1,
    pools: ['treasure', 'shop'],
    tags: ['accuracy'],
    art: { shape: 'gem', colors: ['#7cc7ff', '#1f4f70', '#ffffff'] },
    stats: { shotSpeed: 70 },
    flags: { accuracy: 1 },
  },
  dragonScale: {
    name: 'Драконья чешуя',
    desc: 'Иммунитет к лаве и огню, броня +1.',
    quality: 3,
    pools: ['treasure', 'boss'],
    tags: ['defence', 'fire'],
    art: { shape: 'shard', colors: ['#ff8b3d', '#6e2a10', '#ffd6a8'] },
    stats: { armor: 1 },
    flags: { fireImmune: 1 },
  },
  chaosDie: {
    name: 'Кость хаоса',
    desc: 'В каждой новой комнате случайный бонус на время.',
    quality: 3,
    pools: ['treasure', 'challenge'],
    tags: ['chaos'],
    art: { shape: 'gem', colors: ['#ff4fa3', '#4fe1ff', '#ffe14f'] },
    hooks: {
      onRoomEnter(ctx) {
        const p = ctx.player;
        p.counters.chaos = ctx.game.rng.int(0, 4);
        p.timers.chaos = 30;
        p.statsDirty = true;
      },
      onStats(ctx) {
        if (ctx.player.timers.chaos <= 0) return;
        switch (ctx.player.counters.chaos) {
          case 0:
            ctx.stats.damageMult *= 1.4;
            break;
          case 1:
            ctx.stats.fireRate *= 1.5;
            break;
          case 2:
            ctx.stats.moveSpeed += 30;
            break;
          case 3:
            ctx.stats.shotSpeed += 90;
            break;
          default:
            ctx.stats.critChance += 0.25;
        }
      },
    },
  },
  sporeCloak: {
    name: 'Споровый плащ',
    desc: 'При получении урона выпускаешь ядовитое облако.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['poison', 'defence'],
    art: { shape: 'mushroom', colors: ['#8ede4a', '#2f5a1a', '#e0ffb0'] },
    hooks: {
      onHurt(ctx) {
        ctx.game.spawnCloud(ctx.player.x, ctx.player.y, {
          radius: 56,
          time: 4,
          damage: 2 + ctx.player.stats.damage * 0.3,
          team: 0,
          color: '#8ede4a',
          kind: 'poison',
        });
      },
    },
  },
  frozenCore: {
    name: 'Ледяное ядро',
    desc: 'Убитые враги взрываются ледяными иглами.',
    quality: 3,
    pools: ['treasure'],
    tags: ['ice', 'onkill'],
    art: { shape: 'shard', colors: ['#9fe6ff', '#2a7ba0', '#ffffff'] },
    hooks: {
      onKill(ctx) {
        ctx.game.spawnBurst(ctx.enemy.x, ctx.enemy.y, {
          count: 6,
          speed: 220,
          damage: 3 + ctx.player.stats.damage * 0.35,
          team: 0,
          color: '#9fe6ff',
          life: 0.45,
          freeze: 0.5,
        });
      },
    },
  },
  bloodMoney: {
    name: 'Кровавые деньги',
    desc: 'Можно платить здоровьем вместо монет.',
    quality: 2,
    pools: ['shop', 'treasure'],
    tags: ['economy'],
    art: { shape: 'heart', colors: ['#ffd93d', '#7a1f1f', '#ff9b9b'] },
    flags: { bloodPayment: 1 },
  },
  deepRoots: {
    name: 'Глубокие корни',
    desc: 'Стоя на месте, ты быстро восстанавливаешь щит.',
    quality: 2,
    pools: ['treasure', 'shop'],
    tags: ['defence'],
    art: { shape: 'clover', colors: ['#4a8f2a', '#25491a', '#c0ff9c'] },
    flags: { rootShield: 1 },
  },
  starlightVial: {
    name: 'Флакон звёздного света',
    desc: 'Раз в комнату первый выстрел призывает звёздный дождь.',
    quality: 4,
    pools: ['treasure', 'boss'],
    tags: ['exotic'],
    art: { shape: 'flask', colors: ['#ffe14f', '#4fe1ff', '#ffffff'] },
    hooks: {
      onShoot(ctx) {
        const p = ctx.player;
        if (p.counters.starRoom === ctx.game.roomVisitId) return;
        p.counters.starRoom = ctx.game.roomVisitId;
        ctx.game.spawnStarfall(10, 6 + p.stats.damage * 0.8);
      },
    },
  },
};

/** Active items: press Q. Charged by clearing rooms. */
export const ACTIVES = {
  bloodDonation: {
    name: 'Кровопускание',
    desc: 'Меняет пол-сердца на монеты и урон до конца комнаты.',
    charge: 2,
    art: { shape: 'flask', colors: ['#ff2e63', '#4a0a1a', '#ffb3c8'] },
    use(ctx) {
      if (ctx.player.hp <= 1) return false;
      ctx.game.damagePlayer(1, { source: 'self', ignoreArmor: true, ignoreInvuln: true });
      ctx.player.coins += ctx.game.rng.int(3, 7);
      ctx.player.timers.donation = 40;
      ctx.player.statsDirty = true;
      return true;
    },
    onStats(ctx) {
      if (ctx.player.timers.donation > 0) ctx.stats.damageMult *= 1.35;
    },
  },
  panicButton: {
    name: 'Кнопка паники',
    desc: 'Уничтожает все вражеские снаряды и отбрасывает врагов.',
    charge: 3,
    art: { shape: 'bomb', colors: ['#ff5722', '#2a0a04', '#ffd166'] },
    use(ctx) {
      ctx.game.clearEnemyShots(true);
      ctx.game.spawnShockwave(ctx.player.x, ctx.player.y, {
        radius: 190,
        damage: 6 + ctx.player.stats.damage,
        team: 0,
        color: '#ffd166',
        stun: 1.2,
      });
      return true;
    },
  },
  hourglass: {
    name: 'Песочные часы',
    desc: 'Замедляет время на 5 секунд.',
    charge: 4,
    art: { shape: 'flask', colors: ['#ffe066', '#6a5210', '#fff8d0'] },
    use(ctx) {
      ctx.game.timeScaleTimer = 5;
      ctx.game.timeScaleTarget = 0.45;
      return true;
    },
  },
  summonCircle: {
    name: 'Круг призыва',
    desc: 'Призывает трёх союзных духов на 20 секунд.',
    charge: 4,
    art: { shape: 'rune', colors: ['#7cff6b', '#1a4a12', '#e0ffd0'] },
    use(ctx) {
      for (let i = 0; i < 3; i++) ctx.game.spawnAlly(20);
      return true;
    },
  },
  teleporter: {
    name: 'Телепорт',
    desc: 'Переносит в случайную непосещённую комнату.',
    charge: 3,
    art: { shape: 'orb', colors: ['#b06bff', '#2a1050', '#e6d0ff'] },
    use(ctx) {
      return ctx.game.teleportRandomRoom();
    },
  },
  forgeHammer: {
    name: 'Молот кузнеца',
    desc: 'Разбивает все камни и наносит урон всем врагам.',
    charge: 3,
    art: { shape: 'blade', colors: ['#9c5330', '#3a1a12', '#ffd166'] },
    use(ctx) {
      ctx.game.smashAllRocks();
      ctx.game.damageAllEnemies(10 + ctx.player.stats.damage * 1.5);
      ctx.game.shake(9, 0.4);
      return true;
    },
  },
  healingSpring: {
    name: 'Живой источник',
    desc: 'Восстанавливает одно сердце.',
    charge: 3,
    art: { shape: 'heart', colors: ['#7ee081', '#1f5a2a', '#d8ffd0'] },
    use(ctx) {
      return ctx.game.healPlayer(2) > 0;
    },
  },
  dice: {
    name: 'Кость судьбы',
    desc: 'Перебрасывает все предметы на полу этой комнаты.',
    charge: 4,
    art: { shape: 'gem', colors: ['#ffffff', '#7f8b99', '#ffe14f'] },
    use(ctx) {
      return ctx.game.rerollRoomItems();
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const ACTIVE_IDS = Object.keys(ACTIVES);

export function getItem(id) {
  return ITEMS[id] || null;
}
