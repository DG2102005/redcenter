// 牌型 ↔ 图片文件名 映射表
// 资源目录: public/tiles/
// 文件来源: D:\美术素材\麻将3 (34个规范中文名命名的美术文件)
//
// 命名规则:
//   万子: 一万.png ~ 九万.png (m1-m9)
//   筒子: 一筒.png ~ 九筒.png (p1-p9)
//   条子: 一条.png ~ 九条.png (s1-s9)
//   字牌: 东.png 南.png 西风.png 北.png 中.png 发.png 白板.png (z1-z7)
//   其中 z5(中) = 红中(百搭)

import type { TileCode } from './types';

// 牌型代码 → 图片文件名
export const TILE_FILE_MAP: Record<TileCode, string> = {
  // 万子 m1-m9
  m1: '一万.png',
  m2: '二万.png',
  m3: '三万.png',
  m4: '四万.png',
  m5: '五万.png',
  m6: '六万.png',
  m7: '七万.png',
  m8: '八万.png',
  m9: '九万.png',

  // 筒子 p1-p9
  p1: '一筒.png',
  p2: '二筒.png',
  p3: '三筒.png',
  p4: '四筒.png',
  p5: '五筒.png',
  p6: '六筒.png',
  p7: '七筒.png',
  p8: '八筒.png',
  p9: '九筒.png',

  // 条子 s1-s9
  s1: '一条.png',
  s2: '二条.png',
  s3: '三条.png',
  s4: '四条.png',
  s5: '五条.png',
  s6: '六条.png',
  s7: '七条.png',
  s8: '八条.png',
  s9: '九条.png',

  // 字牌 z1-z7 (z5=红中=百搭)
  z1: '东.png',
  z2: '南.png',
  z3: '西风.png',
  z4: '北.png',
  z5: '中.png',
  z6: '发.png',
  z7: '白板.png',
};

// 根据牌型代码获取图片URL(已编码)
export function getTileUrl(code: TileCode): string {
  const file = TILE_FILE_MAP[code];
  if (!file) return '';
  return '/tiles/' + encodeURI(file);
}
