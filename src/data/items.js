/**
 * Item catalogue — the build engine.
 *
 * Three orthogonal ways to change the game:
 *   stats  additive deltas            { damage: +1.2, fireRate: +0.4 }
 *   mult   multiplicative scaling     { damageMult: 1.3 }
 *   flags  shot-pipeline modifiers    { homing: 0.6, pierce: 1 }
 *
 * `flags` are why items combine: they stack additively and the shot pipeline
 * applies all of them at once, so "homing + splitting + explosive" works without
 * anyone writing that combination down. Combinations that deserve *bespoke*
 * behaviour are named in synergies.js.
 *
 * Hooks receive a context object and must not touch the DOM — simulation only.
 */

export const BASE_STATS = {
  maxHp: 6,
  damage: 4.2,
  damageMult: 1,
  fireRate: 3.4,          // shots per second
  shotSpeed: 34,          // world units per second
  range: 0.85,            // projectile lifetime, seconds
  moveSpeed: 1,           // multiplier on PLAYER.walk
  spread: 0.02,           // radians
  armor: 0,
  critChance: 0.05,
  critMult: 2.2,
  heatPerShot: 0.055,     // overheat replaces ammo entirely
  heatCooling: 0.55,
  torchDrain: 0.011,      // battery per second while lit
  torchRange: 17,
  pickupRange: 2.2,
  luck: 0,
};

export const ITEMS = {
  // ------------------------------------------------------------- offence
  hardLight: {
    name: 'Твёрдый свет',
    desc: 'Урон +1.6.',
    quality: 1,
    pools: ['treasure', 'shop', 'boss'],
    art: { glow: [1, 1, 0.7] },
    stats: { damage: 1.6 },
  },
  overclock: {
    name: 'Разгон',
    desc: 'Темп стрельбы +1.1, но нагрев быстрее.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.5, 0.9, 1] },
    stats: { fireRate: 1.1, heatPerShot: 0.016 },
  },
  heavyCore: {
    name: 'Тяжёлое ядро',
    desc: 'Урон x1.5, темп стрельбы ниже.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.6, 0.3] },
    mult: { damageMult: 1.5 },
    stats: { fireRate: -1.0, knockback: 3 },
  },
  splitter: {
    name: 'Расщепитель',
    desc: 'При попадании выстрел делится надвое.',
    quality: 3,
    pools: ['treasure'],
    art: { glow: [0.8, 0.7, 1] },
    flags: { splitOnHit: 2 },
    mult: { damageMult: 0.88 },
  },
  piercer: {
    name: 'Пробойник',
    desc: 'Выстрелы проходят сквозь одного врага.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.9, 0.5] },
    flags: { pierce: 1 },
  },
  ricochet: {
    name: 'Рикошет',
    desc: 'Выстрелы отскакивают от стен дважды.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.9, 0.95, 1] },
    flags: { bounce: 2 },
    stats: { range: 0.25 },
  },
  seekerChip: {
    name: 'Чип наведения',
    desc: 'Выстрелы доводятся до цели.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.4, 0.6] },
    flags: { homing: 0.8 },
    mult: { damageMult: 0.92 },
  },
  tripleTap: {
    name: 'Тройной ствол',
    desc: '+2 выстрела веером, урон каждого ниже.',
    quality: 3,
    pools: ['treasure', 'shop'],
    art: { glow: [0.7, 0.8, 0.9] },
    flags: { multishot: 2 },
    stats: { spread: 0.08 },
    mult: { damageMult: 0.7 },
  },
  emberCore: {
    name: 'Ядро углей',
    desc: 'Выстрелы поджигают.',
    quality: 2,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.5, 0.15] },
    flags: { burn: 0.6 },
    stats: { damage: 0.4 },
  },
  cryoLens: {
    name: 'Криолинза',
    desc: 'Шанс заморозить врага.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.6, 0.9, 1] },
    flags: { freeze: 0.32 },
    stats: { shotSpeed: 3 },
  },
  venomTank: {
    name: 'Бак с ядом',
    desc: 'Выстрелы отравляют.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.6, 1, 0.3] },
    flags: { poison: 0.65 },
  },
  arcCoil: {
    name: 'Дуговая катушка',
    desc: 'Попадания перескакивают на соседа.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.95, 0.4] },
    flags: { chain: 1, shock: 0.4 },
  },
  detonator: {
    name: 'Детонатор',
    desc: 'Выстрелы взрываются.',
    quality: 4,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.55, 0.2] },
    flags: { explosive: 1 },
    mult: { damageMult: 0.85 },
    stats: { fireRate: -0.4 },
  },
  railKit: {
    name: 'Рельсовый набор',
    desc: 'Выстрелы летят вдвое быстрее и дальше.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.8, 0.9, 1] },
    stats: { shotSpeed: 26, range: 0.3 },
    flags: { accurate: 1 },
  },
  scattergun: {
    name: 'Дробовой модуль',
    desc: 'Пять выстрелов конусом. Ближний бой.',
    quality: 3,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.8, 0.4] },
    flags: { multishot: 4 },
    stats: { spread: 0.2, range: -0.35, fireRate: -1.2 },
    mult: { damageMult: 0.62 },
  },
  criticalEye: {
    name: 'Критический глаз',
    desc: 'Крит +20%, множитель крита выше.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.3, 0.5] },
    stats: { critChance: 0.2, critMult: 0.8, luck: 1 },
  },

  // ------------------------------------------------------------ survival
  plating: {
    name: 'Броневые пластины',
    desc: 'Броня +2, скорость чуть ниже.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.7, 0.75, 0.8] },
    stats: { armor: 2, moveSpeed: -0.06 },
  },
  bigHeart: {
    name: 'Большое сердце',
    desc: 'Максимум здоровья +4, полное исцеление.',
    quality: 1,
    pools: ['treasure', 'shop', 'boss'],
    art: { glow: [1, 0.3, 0.35] },
    stats: { maxHp: 4 },
    hooks: {
      onPickup(ctx) {
        ctx.player.hp = ctx.player.stats.maxHp;
      },
    },
  },
  wardCell: {
    name: 'Защитная ячейка',
    desc: 'Раз в комнату поглощает один удар.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.9, 0.4] },
    flags: { wardPerRoom: 1 },
  },
  lastLight: {
    name: 'Последний свет',
    desc: 'Один раз за спуск спасает от смерти.',
    quality: 4,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 1, 0.8] },
    flags: { revive: 1 },
  },
  bloodPact: {
    name: 'Кровавый договор',
    desc: 'Урон x1.6, максимум здоровья -2.',
    quality: 3,
    pools: ['treasure', 'challenge'],
    art: { glow: [1, 0.15, 0.2] },
    mult: { damageMult: 1.6 },
    stats: { maxHp: -2 },
  },
  leech: {
    name: 'Пиявка',
    desc: 'Каждое 10-е убийство лечит.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.9, 0.3, 0.6] },
    hooks: {
      onKill(ctx) {
        ctx.player.counters.leech = (ctx.player.counters.leech || 0) + 1;
        if (ctx.player.counters.leech % 10 === 0) ctx.game.healPlayer(1);
      },
    },
  },
  adrenaline: {
    name: 'Адреналин',
    desc: 'После удара — скорость и темп стрельбы на 4 сек.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.4, 0.3] },
    hooks: {
      onHurt(ctx) {
        ctx.player.timers.adrenaline = 4;
        ctx.player.statsDirty = true;
      },
      onStats(ctx) {
        if (ctx.player.timers.adrenaline > 0) {
          ctx.stats.fireRate *= 1.7;
          ctx.stats.moveSpeed += 0.22;
        }
      },
    },
  },
  berserkPlate: {
    name: 'Пластина ярости',
    desc: 'Чем меньше здоровья, тем больше урон.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.2, 0.15] },
    hooks: {
      onStats(ctx) {
        const frac = ctx.player.hp / Math.max(1, ctx.stats.maxHp);
        ctx.stats.damageMult *= 1 + (1 - frac) * 0.9;
      },
    },
  },
  glassCore: {
    name: 'Стеклянное ядро',
    desc: 'Урон x2.3. Любой удар почти смертелен.',
    quality: 4,
    pools: ['treasure', 'challenge'],
    art: { glow: [0.8, 1, 1] },
    mult: { damageMult: 2.3 },
    flags: { glass: 1 },
  },

  // ------------------------------------------------------------- utility
  longBeam: {
    name: 'Длинный луч',
    desc: 'Фонарь светит дальше и шире.',
    quality: 1,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.95, 0.7] },
    stats: { torchRange: 9 },
    flags: { wideTorch: 1 },
  },
  efficientCell: {
    name: 'Экономная батарея',
    desc: 'Фонарь садится вдвое медленнее.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.7, 1, 0.8] },
    stats: { torchDrain: -0.006 },
  },
  nightEyes: {
    name: 'Ночные глаза',
    desc: 'Ты видишь и без фонаря.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [0.5, 1, 0.7] },
    flags: { nightVision: 1 },
  },
  magnetCoil: {
    name: 'Магнитная катушка',
    desc: 'Подбираешь всё издалека.',
    quality: 1,
    pools: ['treasure', 'shop'],
    art: { glow: [0.9, 0.6, 1] },
    stats: { pickupRange: 4 },
  },
  cartograph: {
    name: 'Картограф',
    desc: 'Вся карта этажа открыта сразу.',
    quality: 1,
    pools: ['treasure', 'shop'],
    art: { glow: [0.6, 0.9, 1] },
    flags: { fullMap: 1 },
  },
  sprintLungs: {
    name: 'Лёгкие бегуна',
    desc: 'Выносливость не кончается так быстро.',
    quality: 1,
    pools: ['treasure', 'shop'],
    art: { glow: [0.8, 1, 0.9] },
    flags: { stamina: 1 },
    stats: { moveSpeed: 0.08 },
  },
  coolant: {
    name: 'Хладагент',
    desc: 'Оружие остывает вдвое быстрее.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.5, 0.9, 1] },
    stats: { heatCooling: 0.55 },
  },
  scavenger: {
    name: 'Мусорщик',
    desc: 'Враги чаще роняют осколки.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.85, 0.4] },
    stats: { luck: 1 },
    hooks: {
      onKill(ctx) {
        if (ctx.game.rng.chance(0.22)) ctx.game.dropPickup(ctx.enemy.x, ctx.enemy.z, 'shard');
      },
    },
  },

  // -------------------------------------------------------------- exotic
  orbitShard: {
    name: 'Осколок-спутник',
    desc: 'Вокруг тебя кружит осколок и режет врагов.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [0.4, 0.9, 1] },
    flags: { orbitals: 1 },
  },
  twinShard: {
    name: 'Второй осколок',
    desc: 'Ещё один спутник.',
    quality: 3,
    pools: ['treasure'],
    art: { glow: [0.5, 1, 0.9] },
    flags: { orbitals: 1 },
  },
  echoChamber: {
    name: 'Эхо-камера',
    desc: 'Шанс выстрелить дважды.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [0.7, 0.9, 1] },
    flags: { echo: 0.32 },
  },
  gravityWell: {
    name: 'Гравитационный колодец',
    desc: 'Попадания стягивают врагов к точке удара.',
    quality: 3,
    pools: ['treasure'],
    art: { glow: [0.6, 0.4, 1] },
    flags: { gravity: 1 },
  },
  prismCrown: {
    name: 'Призматическая корона',
    desc: 'Каждый выстрел случайной стихии.',
    quality: 4,
    pools: ['treasure', 'boss'],
    art: { glow: [1, 0.4, 0.8] },
    hooks: {
      onShoot(ctx) {
        for (const s of ctx.shots) {
          const roll = ctx.game.rng.int(0, 3);
          if (roll === 0) { s.burn = 1; s.r = 1; s.g = 0.5; s.b = 0.15; }
          else if (roll === 1) { s.freeze = 1; s.r = 0.6; s.g = 0.9; s.b = 1; }
          else if (roll === 2) { s.poison = 1; s.r = 0.6; s.g = 1; s.b = 0.3; }
          else { s.shock = 1; s.r = 1; s.g = 0.95; s.b = 0.4; }
          s.damage *= 1.12;
        }
      },
    },
  },
  soulHarvest: {
    name: 'Жатва душ',
    desc: 'Убийства временно повышают урон. Стакается.',
    quality: 3,
    pools: ['treasure', 'boss'],
    art: { glow: [0.8, 0.5, 1] },
    hooks: {
      onKill(ctx) {
        const p = ctx.player;
        p.timers.harvest = 6;
        p.counters.harvest = Math.min(12, (p.counters.harvest || 0) + 1);
        p.statsDirty = true;
      },
      onStats(ctx) {
        ctx.stats.damage += (ctx.player.counters.harvest || 0) * 0.4;
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
  thornMail: {
    name: 'Шипастый доспех',
    desc: 'Враги ранятся, касаясь тебя.',
    quality: 2,
    pools: ['treasure', 'shop'],
    art: { glow: [0.8, 0.85, 0.9] },
    stats: { armor: 1 },
    hooks: {
      onContact(ctx) {
        ctx.game.damageEnemy(ctx.enemy, 7 + ctx.player.stats.damage, { source: 'thorns', trueDamage: true });
      },
    },
  },
  deadMansSwitch: {
    name: 'Мертвецкий выключатель',
    desc: 'Убитые враги взрываются.',
    quality: 3,
    pools: ['treasure'],
    art: { glow: [1, 0.6, 0.25] },
    hooks: {
      onKill(ctx) {
        ctx.game.explode(ctx.enemy.x, ctx.enemy.y + 0.6, ctx.enemy.z, 3.2, 6 + ctx.player.stats.damage * 0.6, 0);
      },
    },
  },
  frostBloom: {
    name: 'Морозный цвет',
    desc: 'Убитые враги рассыпают ледяные иглы.',
    quality: 3,
    pools: ['treasure'],
    art: { glow: [0.7, 0.95, 1] },
    hooks: {
      onKill(ctx) {
        ctx.game.spawnBurst(ctx.enemy.x, ctx.enemy.y + 0.7, ctx.enemy.z, 7, {
          speed: 20,
          damage: 4 + ctx.player.stats.damage * 0.35,
          team: 0,
          freeze: 0.5,
          r: 0.7, g: 0.95, b: 1,
        });
      },
    },
  },
  huntersMark: {
    name: 'Метка охотника',
    desc: 'Первый выстрел по цели бьёт вдвое.',
    quality: 3,
    pools: ['treasure', 'shop'],
    art: { glow: [1, 0.5, 0.4] },
    flags: { mark: 1 },
  },
  chaosDie: {
    name: 'Кость хаоса',
    desc: 'В каждой новой комнате — случайный бонус.',
    quality: 3,
    pools: ['treasure', 'challenge'],
    art: { glow: [1, 0.4, 0.9] },
    hooks: {
      onRoomEnter(ctx) {
        ctx.player.counters.chaos = ctx.game.rng.int(0, 4);
        ctx.player.timers.chaos = 45;
        ctx.player.statsDirty = true;
      },
      onStats(ctx) {
        if (ctx.player.timers.chaos <= 0) return;
        switch (ctx.player.counters.chaos) {
          case 0: ctx.stats.damageMult *= 1.45; break;
          case 1: ctx.stats.fireRate *= 1.5; break;
          case 2: ctx.stats.moveSpeed += 0.25; break;
          case 3: ctx.stats.shotSpeed += 16; break;
          default: ctx.stats.critChance += 0.28;
        }
      },
    },
  },
};

/** Active items: press Q. Charged by clearing encounters. */
export const ACTIVES = {
  pulseBomb: {
    name: 'Импульсная бомба',
    desc: 'Сносит всё вокруг и глушит врагов.',
    charge: 3,
    use(ctx) {
      const p = ctx.player;
      ctx.game.explode(p.x, p.y + 0.8, p.z, 7.5, 26 + p.stats.damage * 2, 0, { stun: 1.4 });
      return true;
    },
  },
  battery: {
    name: 'Запасная батарея',
    desc: 'Полностью заряжает фонарь.',
    charge: 2,
    use(ctx) {
      if (ctx.game.torch.charge > 0.95) return false;
      ctx.game.torch.charge = 1;
      ctx.game.sfx('reloadTorch');
      return true;
    },
  },
  medkit: {
    name: 'Аптечка',
    desc: 'Восстанавливает здоровье.',
    charge: 3,
    use(ctx) {
      return ctx.game.healPlayer(4) > 0;
    },
  },
  timeDilation: {
    name: 'Растяжение времени',
    desc: 'Замедляет всё вокруг на 6 секунд.',
    charge: 4,
    use(ctx) {
      ctx.game.timeScaleTimer = 6;
      ctx.game.timeScaleTarget = 0.42;
      return true;
    },
  },
  blink: {
    name: 'Скачок',
    desc: 'Переносит на несколько метров вперёд.',
    charge: 2,
    use(ctx) {
      return ctx.game.blinkPlayer(6.5);
    },
  },
  decoy: {
    name: 'Приманка',
    desc: 'Ставит шумную приманку, враги идут к ней.',
    charge: 3,
    use(ctx) {
      ctx.game.spawnDecoy(12);
      return true;
    },
  },
  overload: {
    name: 'Перегрузка',
    desc: 'Оружие не греется 8 секунд.',
    charge: 3,
    use(ctx) {
      ctx.player.timers.overload = 8;
      ctx.player.heat = 0;
      ctx.player.overheated = false;
      return true;
    },
  },
  beacon: {
    name: 'Маяк',
    desc: 'Показывает лестницу и все комнаты.',
    charge: 2,
    use(ctx) {
      ctx.game.revealMap();
      return true;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const ACTIVE_IDS = Object.keys(ACTIVES);

export function getItem(id) {
  return ITEMS[id] || null;
}
