/**
 * LanduseTab.tsx — Sub-tab 7 "Hiện trạng sử dụng đất"
 */

import { useEffect } from 'react';
import { useSiteStore } from '../../../../store/useSiteStore';
import { LandusePanel } from '../../LandusePanel';
import { ModeCommentsBlock } from '../ModeCommentsBlock';

export function LanduseTab() {
  const setMode = useSiteStore(s => s.setMode);
  useEffect(() => { setMode('landuse'); }, [setMode]);

  return (
    <div className="space-y-2.5">
      <LandusePanel />
      <ModeCommentsBlock mode="landuse" />
    </div>
  );
}
