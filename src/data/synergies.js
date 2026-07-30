/**
 * Named item synergies.
 *
 * Most combinations already work on their own — item `flags` stack and the shot
 * pipeline applies all of them. This file is for combinations that deserve a
 * *distinct* result: new behaviour, its own colour, its own name on the pause
 * screen.
 *
 * A synergy is active when every id in `requires` is owned. It may define:
 *   apply(ctx)    runs on the shots of each volley — ctx.shots
 *   passive(ctx)  runs during stat recomputation — ctx.stats, ctx.flags
 *
 * Anything that grants a standing ability belongs in `passive`: `flags` is
 * rebuilt from scratch on every recompute, so a flag written from `apply` only
 * survives until the next time a timer expires or the player takes a hit.
 */

export const SYNERGIES = [
  {
    id: 'napalm',
    name: 'Напалм',
    desc: 'Огонь + взрыв: взрывы оставляют горящие лужи.',
    requires: ['emberCore', 'detonator'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.explosive = Math.max(1, s.explosive);
        s.napalm = true;
        s.r = 1; s.g = 0.5; s.b = 0.15;
      }
    },
  },
  {
    id: 'shatterFrost',
    name: 'Раскол льда',
    desc: 'Лёд + расщепление: замороженные враги лопаются осколками.',
    requires: ['cryoLens', 'splitter'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.freeze = Math.max(s.freeze, 0.7);
        s.shatter = true;
        s.r = 0.7; s.g = 0.95; s.b = 1;
      }
    },
  },
  {
    id: 'stormChain',
    name: 'Цепь бури',
    desc: 'Дуга + наведение: молнии сами находят цели и бьют дальше.',
    requires: ['arcCoil', 'seekerChip'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.chain += 2;
        s.homing = Math.max(s.homing, 1.3);
        s.r = 1; s.g = 0.95; s.b = 0.4;
      }
    },
  },
  {
    id: 'railgun',
    name: 'Рельсотрон',
    desc: 'Рельсы + пробойник: выстрел прошивает всё насквозь.',
    requires: ['railKit', 'piercer'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.pierce += 6;
        s.damage *= 1.35;
        s.size *= 1.4;
        s.r = 0.8; s.g = 0.95; s.b = 1;
      }
    },
  },
  {
    id: 'plague',
    name: 'Чума',
    desc: 'Яд + цепь: отрава расползается между врагами.',
    requires: ['venomTank', 'arcCoil'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.plague = true;
        s.poison = Math.max(s.poison, 0.85);
        s.r = 0.6; s.g = 1; s.b = 0.3;
      }
    },
  },
  {
    id: 'wildfire',
    name: 'Пожар',
    desc: 'Огонь + расщепление: горение перекидывается на соседей.',
    requires: ['emberCore', 'splitter'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.spreadBurn = true;
        s.burn = Math.max(s.burn, 0.75);
      }
    },
  },
  {
    id: 'blackHole',
    name: 'Чёрная дыра',
    desc: 'Гравитация + взрыв: взрыв сначала стягивает всех в точку.',
    requires: ['gravityWell', 'detonator'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.gravityPull = 1;
        s.explosive = Math.max(1, s.explosive);
        s.blackhole = true;
        s.r = 0.6; s.g = 0.4; s.b = 1;
      }
    },
  },
  {
    id: 'buckshotStorm',
    name: 'Картечный шторм',
    desc: 'Дробовик + рикошет: комната наполняется отскоками.',
    requires: ['scattergun', 'ricochet'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.bounce += 3;
        s.life *= 1.6;
      }
    },
  },
  {
    id: 'twinOrbit',
    name: 'Двойная орбита',
    desc: 'Два спутника + эхо: спутники бьют вдвое чаще.',
    requires: ['orbitShard', 'twinShard', 'echoChamber'],
    passive(ctx) {
      ctx.flags.fastOrbit = 1;
    },
  },
  {
    id: 'executioner',
    name: 'Палач',
    desc: 'Метка + крит: помеченная цель всегда получает крит.',
    requires: ['huntersMark', 'criticalEye'],
    passive(ctx) {
      ctx.flags.markCrit = 1;
    },
  },
  {
    id: 'coldFusion',
    name: 'Холодный синтез',
    desc: 'Хладагент + разгон: оружие почти не греется.',
    requires: ['coolant', 'overclock'],
    passive(ctx) {
      ctx.flags.noHeat = 1;
    },
  },
  {
    id: 'floodlight',
    name: 'Прожектор',
    desc: 'Длинный луч + ночные глаза: фонарь слепит и жжёт врагов.',
    requires: ['longBeam', 'nightEyes'],
    passive(ctx) {
      ctx.flags.torchBurns = 1;
    },
  },
  {
    id: 'undying',
    name: 'Неугасимый',
    desc: 'Свет + ячейка: спасение от смерти восстанавливается на новом этаже.',
    requires: ['lastLight', 'wardCell'],
    passive(ctx) {
      ctx.flags.reviveRefresh = 1;
    },
  },
  {
    id: 'bloodStorm',
    name: 'Кровавая буря',
    desc: 'Договор + ярость: на низком здоровье выстрелы удваиваются.',
    requires: ['bloodPact', 'berserkPlate'],
    apply(ctx) {
      if (ctx.player.hp <= ctx.player.stats.maxHp * 0.35) {
        for (const s of ctx.shots.slice()) {
          const c = ctx.game.cloneShot(s);
          if (!c) break;
          c.damage *= 0.7;
        }
      }
    },
  },
  {
    id: 'prismLance',
    name: 'Призматическое копьё',
    desc: 'Корона + рельсы: луч всех стихий насквозь.',
    requires: ['prismCrown', 'railKit'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.pierce += 4;
        s.size *= 1.5;
        s.damage *= 1.25;
      }
    },
  },
];

export const SYNERGY_BY_ITEM = (() => {
  const map = new Map();
  for (const syn of SYNERGIES) {
    for (const id of syn.requires) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(syn);
    }
  }
  return map;
})();
