/**
 * EvaluationSection.tsx — Mục 2 "Đánh giá hiện trạng"
 *
 * 9 sub-tab dọc bên trái + nội dung bên phải.
 *
 * Mỗi tab tự gọi setMode() để 3D scene cập nhật visualization tương ứng.
 */

import { useState } from 'react';
import {
  Cloud, Eye, Mountain, Triangle, Square, Droplets, Map as MapIcon, Route, BarChart3,
} from 'lucide-react';
import { SubTabsVertical, type VTabDef } from '../SubTabsVertical';

import { NaturalCondTab }      from './tabs/NaturalCondTab';
import { ViewTab }             from './tabs/ViewTab';
import { TerrainTab }          from './tabs/TerrainTab';
import { SlopeTab }            from './tabs/SlopeTab';
import { LandSuitabilityTab }  from './tabs/LandSuitabilityTab';
import { HydroTab }            from './tabs/HydroTab';
import { LanduseTab }          from './tabs/LanduseTab';
import { RoadsTab }            from './tabs/RoadsTab';
import { SwotTab }             from './tabs/SwotTab';

type TabId =
  | 'nature' | 'view' | 'terrain' | 'slope' | 'land'
  | 'hydro' | 'landuse' | 'roads' | 'swot';

const TABS: VTabDef[] = [
  { id: 'nature',  label: 'Điều kiện tự nhiên', icon: <Cloud size={15}/> },
  { id: 'view',    label: 'View',               icon: <Eye size={15}/> },
  { id: 'terrain', label: 'Địa hình',           icon: <Mountain size={15}/> },
  { id: 'slope',   label: 'Độ dốc',             icon: <Triangle size={15}/> },
  { id: 'land',    label: 'Quỹ đất XD',         icon: <Square size={15}/> },
  { id: 'hydro',   label: 'Thủy văn',           icon: <Droplets size={15}/> },
  { id: 'landuse', label: 'HT sử dụng đất',     icon: <MapIcon size={15}/> },
  { id: 'roads',   label: 'Giao thông',         icon: <Route size={15}/> },
  { id: 'swot',    label: 'Tổng hợp HT',        icon: <BarChart3 size={15}/> },
];

export function EvaluationSection() {
  const [active, setActive] = useState<TabId>('nature');

  return (
    <SubTabsVertical
      tabs={TABS}
      activeId={active}
      onChange={(id) => setActive(id as TabId)}
    >
      {active === 'nature'  && <NaturalCondTab />}
      {active === 'view'    && <ViewTab />}
      {active === 'terrain' && <TerrainTab />}
      {active === 'slope'   && <SlopeTab />}
      {active === 'land'    && <LandSuitabilityTab />}
      {active === 'hydro'   && <HydroTab />}
      {active === 'landuse' && <LanduseTab />}
      {active === 'roads'   && <RoadsTab />}
      {active === 'swot'    && <SwotTab />}
    </SubTabsVertical>
  );
}
