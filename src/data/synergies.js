/**
 * Named item synergies.
 *
 * Most combinations already work by themselves: item `flags` stack and the shot
 * pipeline applies all of them, so homing + splitting + explosive needs no
 * special code. This file is for the combinations that deserve a *distinct*
 * result — a new projectile behaviour, a rename, its own colour and sound.
 *
 * A synergy matches when every id in `requires` is owned, or when every tag in
 * `tags` is present at least `tags.length` times across owned items.
 * `apply(ctx)` runs on the freshly created shots for a volley.
 */

export const SYNERGIES = [
  {
    id: 'napalm',
    name: 'Напалм',
    desc: 'Огонь + взрыв: взрывы оставляют лужи пламени.',
    requires: ['emberCore', 'bombHeart'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.explosive = Math.max(1, s.explosive);
        s.napalm = true;
        s.color = '#ff7a2f';
      }
    },
  },
  {
    id: 'shatterFrost',
    name: 'Раскол льда',
    desc: 'Лёд + раскол: замороженные враги взрываются осколками.',
    requires: ['frostLens', 'splitStone'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.freeze = Math.max(s.freeze, 0.7);
        s.shatter = true;
        s.color = '#9fe6ff';
      }
    },
  },
  {
    id: 'stormChain',
    name: 'Цепь бури',
    desc: 'Гроза + наведение: молнии сами находят цели и бьют дальше.',
    requires: ['stormCoil', 'seekerEye'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.chain += 2;
        s.homing = Math.max(s.homing, 1.2);
        s.color = '#ffe066';
        s.style = 'bolt';
      }
    },
  },
  {
    id: 'plagueBloom',
    name: 'Чумной цвет',
    desc: 'Яд + споры: отравленные враги при смерти оставляют облако.',
    requires: ['venomSac', 'sporeCloak'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.poison = Math.max(s.poison, 0.9);
        s.plague = true;
        s.color = '#8ede4a';
      }
    },
  },
  {
    id: 'ghostArtillery',
    name: 'Призрачная артиллерия',
    desc: 'Призрачность + взрыв: снаряды проходят стены и рвутся за ними.',
    requires: ['ghostVeil', 'bombHeart'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.spectral = 1;
        s.explosive = Math.max(1, s.explosive);
        s.color = '#cfe8ff';
      }
    },
  },
  {
    id: 'ricochetStorm',
    name: 'Рикошетный шторм',
    desc: 'Отскок + пробитие: снаряды не гаснут почти никогда.',
    requires: ['rubberSkull', 'hollowPoint'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.bounce += 3;
        s.pierce += 1;
        s.life += 0.5;
        s.style = 'ricochet';
      }
    },
  },
  {
    id: 'starLance',
    name: 'Звёздное копьё',
    desc: 'Копьё + звёздный свет: копьё вызывает падающую звезду.',
    requires: ['moltenLance', 'starlightVial'],
    apply(ctx) {
      for (const s of ctx.shots) {
        if (s.style === 'lance') s.starfall = true;
      }
    },
  },
  {
    id: 'blackHole',
    name: 'Чёрная дыра',
    desc: 'Гравитация + взрыв: взрывы сначала стягивают врагов.',
    requires: ['gravityWell', 'bombHeart'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.gravity = 1;
        s.explosive = Math.max(1, s.explosive);
        s.blackhole = true;
        s.color = '#b06bff';
      }
    },
  },
  {
    id: 'prismBeam',
    name: 'Призматический луч',
    desc: 'Корона + сера: луч расщепляется на три цвета.',
    requires: ['prismCrown', 'brimstoneSigil'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.prismBeam = true;
      }
    },
  },
  {
    id: 'twinFury',
    name: 'Ярость близнецов',
    desc: 'Два спутника + эхо: спутники тоже стреляют дважды.',
    requires: ['packLeader', 'twinSpirit', 'echoStone'],
    apply(ctx) {
      ctx.player.flags.familiarEcho = 1;
    },
  },
  {
    id: 'crossHurricane',
    name: 'Крестовой ураган',
    desc: 'Крест + бумеранг: снаряды кружат вокруг тебя.',
    requires: ['crossFire', 'boomerangFang'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.orbitReturn = true;
        s.pierce += 2;
      }
    },
  },
  {
    id: 'bloodStorm',
    name: 'Кровавая буря',
    desc: 'Договор + берсерк: на низком здоровье выстрелы удваиваются.',
    requires: ['bloodPact', 'berserkerMask'],
    apply(ctx) {
      if (ctx.player.hp <= 2) {
        for (const s of ctx.shots.slice()) {
          const c = ctx.game.cloneShot(s);
          c.angle += 0.14;
          c.damage *= 0.7;
        }
      }
    },
  },
  {
    id: 'goldRush',
    name: 'Золотая лихорадка',
    desc: 'Мидас + жадность: монеты дают ещё больше урона и лечат.',
    requires: ['midasChip', 'greedRing'],
    apply(ctx) {
      ctx.player.flags.goldRush = 1;
    },
  },
  {
    id: 'permafrost',
    name: 'Вечная мерзлота',
    desc: 'Лёд + ледяное ядро: замороженные враги взрываются сами.',
    requires: ['frostLens', 'frozenCore'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.freeze = Math.max(s.freeze, 0.85);
        s.frostbomb = true;
      }
    },
  },
  {
    id: 'wildfire',
    name: 'Лесной пожар',
    desc: 'Огонь + цепь: горение перекидывается между врагами.',
    requires: ['emberCore', 'stormCoil'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.spreadBurn = true;
        s.burn = Math.max(s.burn, 0.7);
      }
    },
  },
  {
    id: 'phaseStrike',
    name: 'Фазовый удар',
    desc: 'Фазовый рывок + вихрь: рывок наносит двойной урон.',
    requires: ['phaseDash', 'windSpurs'],
    apply(ctx) {
      ctx.player.flags.dashDamage = 2;
    },
  },
  {
    id: 'dragonBreath',
    name: 'Драконье дыхание',
    desc: 'Чешуя + огонь: выстрелы становятся конусом пламени.',
    requires: ['dragonScale', 'emberCore'],
    apply(ctx) {
      for (const s of ctx.shots) {
        s.burn = 1;
        s.breath = true;
        s.color = '#ff8b3d';
        s.radius += 1.5;
      }
    },
  },
  {
    id: 'mirrorCross',
    name: 'Зеркальный крест',
    desc: 'Зеркало + крест: восемь направлений одновременно.',
    requires: ['mirrorShard', 'crossFire'],
    apply(ctx) {
      ctx.player.flags.octoShot = 1;
    },
  },
  {
    id: 'timeDilation',
    name: 'Растяжение времени',
    desc: 'Песок + заряд: заряд копится вдвое быстрее.',
    requires: ['timeSand', 'chargeCoil'],
    apply(ctx) {
      ctx.player.flags.fastCharge = 1;
    },
  },
  {
    id: 'undying',
    name: 'Неугасимый',
    desc: 'Свеча + оберег: спасение от смерти восстанавливается на новом этаже.',
    requires: ['lastCandle', 'guardianCharm'],
    apply(ctx) {
      ctx.player.flags.reviveRefresh = 1;
    },
  },
];

/** Index for fast lookup at pickup time. */
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
