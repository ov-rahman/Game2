/**
 * Difficulty levels.
 *
 * Three honest dials rather than one "enemy health x2": how hard the dungeon
 * hits, how much it can take, and how much slack the player starts with. The
 * id is stored in the settings and shown on the results screen, so two runs
 * can be compared.
 */

export const DIFFICULTIES = [
  {
    id: 'calm',
    name: 'спокойный',
    desc: 'для знакомства с подземельем',
    incoming: 0.6,
    enemyHp: 0.85,
    bonusHp: 3,
  },
  {
    id: 'normal',
    name: 'обычный',
    desc: 'как задумано',
    incoming: 1,
    enemyHp: 1,
    bonusHp: 0,
  },
  {
    id: 'deep',
    name: 'глубокий',
    desc: 'подземелье бьёт в ответ',
    incoming: 1.4,
    enemyHp: 1.25,
    bonusHp: -2,
  },
];

export function getDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}
