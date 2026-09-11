// 单张麻将牌组件
// 交互态(可点击)渲染为 <button> 以支持键盘操作; 展示态渲染为 <span> 避免多余 tab 停靠点
import { memo } from 'react';
import type { Tile as TileType } from '../game/types';
import { tileCode, tileName, isHongZhong } from '../game/types';
import { getTileUrl } from '../game/tileAssets';

interface Props {
  tile: TileType;
  size?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  showLabel?: boolean;  // 牌型校验模式: 显示牌名
  highlight?: boolean;  // 高亮(最新打出)
  danger?: number;      // 危险度 0=安全 1=注意 2=危险
  recommended?: boolean; // 引擎推荐打出的牌(绿色引导)
  index?: number;       // 手牌序号(用于快捷键提示)
}

const DANGER_TEXT = ['', '注意', '危险'];

function TileBase({
  tile, size = 44, selected, disabled, onClick, onDoubleClick, showLabel, highlight,
  danger = 0, recommended, index,
}: Props) {
  const url = getTileUrl(tileCode(tile));
  const hz = isHongZhong(tile);
  const w = size;
  const h = Math.round(size * 1.4);

  const name = tileName(tile);
  const label = [
    name,
    hz ? '红中百搭' : '',
    danger >= 2 ? '危险牌' : danger === 1 ? '需注意' : '',
    recommended ? '推荐打出' : '',
    index != null ? `第${index + 1}张` : '',
  ].filter(Boolean).join('，');

  const cls = [
    'tile',
    selected ? 'tile-selected' : '',
    disabled ? 'tile-disabled' : '',
    highlight ? 'tile-highlight' : '',
    hz ? 'tile-hongzhong' : '',
    danger >= 2 ? 'tile-danger' : danger === 1 ? 'tile-warn' : '',
    recommended ? 'tile-recommend' : '',
  ].filter(Boolean).join(' ');

  const style = { width: w, height: h };

  const inner = (
    <>
      <img src={url} alt="" draggable={false} />
      {showLabel && <span className="tile-label">{tileCode(tile)}</span>}
      {highlight && <div className="tile-glow" />}
      {hz && <span className="tile-hz-mark" aria-hidden="true">中</span>}
      {danger > 0 && (
        <span className={`tile-danger-mark d${danger}`} aria-hidden="true">
          {danger >= 2 ? '⚠' : '!'}
        </span>
      )}
      {recommended && <span className="tile-recommend-mark" aria-hidden="true">推</span>}
    </>
  );

  // 可点击 → button(键盘可达)
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected ? true : undefined}
      >
        {inner}
      </button>
    );
  }

  // 纯展示 → span(语义中性, 不占 tab 序列)
  return (
    <span className={cls} style={style} role="img" aria-label={label}>
      {inner}
    </span>
  );
}

export const Tile = memo(TileBase);

// 牌背(CSS实现，绿色麻将背面)
export function TileBack({ size = 44 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * 1.4);
  return (
    <span className="tile tile-back" style={{ width: w, height: h }} role="img" aria-label="牌背">
      <span className="tile-back-pattern" />
    </span>
  );
}
