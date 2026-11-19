/**
 * 新界面地图页字框内容：把老地图面板（GameMapPanel.vue）三种弹窗（地点／势力／大陆）里的字和按钮，
 * 拆成「名签／正文／小字／能做的事」。显示条件、文字、按钮及其禁用条件逐条照老弹窗模板，不加不减。
 */

export type MapActionKey = 'cancel' | 'travel' | 'region';
export type MapAction = { key: MapActionKey; label: string; disabled: boolean };
/** head＝老弹窗正文上面那一两行（类型、刚前往的结果或限制语），放在正文前面，免得被长说明挤到看不见 */
export type MapDetail = { name: string; head: string[]; body: string; lines: string[]; actions: MapAction[] };

/** 老面板实例上读到的那几样（同名） */
export type MapPanelState = {
  selectedLocation: any | null;
  selectedContinent: any | null;
  travelPlayback: unknown;
  isFactionLocation: (location: any) => boolean;
  getLocationTypeName: (type: string) => string;
  mapTravelNotice: string;
  selectedTravelRestriction?: string;
  selectedTravelPreview?: { description?: string; label?: string; arrival?: string } | null;
  travelConfirmation: string | null;
  mapTravelBusy: boolean;
  isAIProcessing: boolean;
  isLoadingRegion: boolean;
};

const joinList = (v: any) => (Array.isArray(v) ? v.join('、') : v);

/** 老面板此刻会弹哪个弹窗就返回哪个的内容；一个都不弹返回 null。 */
export function mapDetail(s: MapPanelState): MapDetail | null {
  const loc = s.selectedLocation;
  // 地点弹窗：v-if="selectedLocation && !isFactionLocation(selectedLocation) && !travelPlayback"
  if (loc && !s.isFactionLocation(loc)) {
    if (s.travelPlayback) return null;
    const head: string[] = [s.getLocationTypeName(loc.type)];
    if (s.mapTravelNotice) head.push(s.mapTravelNotice);
    else if (s.selectedTravelRestriction) head.push(s.selectedTravelRestriction);
    const lines: string[] = [];
    if (loc.danger_level) lines.push(`安全等级：${loc.danger_level}`);
    if (loc.suitable_for) lines.push(`适合境界：${loc.suitable_for}`);
    if (loc.controlled_by) lines.push(`控制势力：${loc.controlled_by}`);
    if (s.selectedTravelPreview) lines.push(String(s.selectedTravelPreview.label ?? ''));
    if (s.selectedTravelPreview?.arrival) lines.push(s.selectedTravelPreview.arrival);
    if (s.travelConfirmation) lines.push('确认前往此地？');
    const actions: MapAction[] = [];
    if (s.travelConfirmation) actions.push({ key: 'cancel', label: '取消', disabled: false });
    actions.push({
      key: 'travel',
      label: s.travelConfirmation ? '确认前往' : '前往此地',
      disabled: !!s.selectedTravelRestriction || s.mapTravelBusy || s.isAIProcessing,
    });
    actions.push({ key: 'region', label: s.isLoadingRegion ? '⏳ 生成中...' : '🗺️ 进入区域地图', disabled: s.isLoadingRegion });
    return {
      name: String(loc.name ?? ''),
      head,
      body: String(s.selectedTravelPreview?.description || loc.description || loc.描述 || ''),
      lines,
      actions,
    };
  }
  // 势力弹窗：v-if="selectedLocation && isFactionLocation(selectedLocation)"（回放时也弹）
  if (loc) {
    const head = [String(loc.类型 || loc.type || '势力')];
    const lines: string[] = [];
    if (loc.等级) lines.push(`势力等级：${loc.等级}`);
    if (loc.leadership || loc.领导层) {
      const realm = loc.leadership?.宗主修为 || loc.领导层?.宗主修为;
      lines.push(`掌门：${loc.leadership?.宗主 || loc.领导层?.宗主 || ''}${realm ? `（${realm}）` : ''}`);
    }
    if (loc.memberCount || loc.成员数量) lines.push(`成员数量：${loc.memberCount?.total || loc.成员数量?.总数 || loc.成员数量?.total}人`);
    if (loc.特色 && loc.特色.length > 0) lines.push(`势力特色：${joinList(loc.特色)}`);
    if (loc.与玩家关系) lines.push(`关系：${loc.与玩家关系}`);
    return { name: String(loc.name || loc.名称 || ''), head, body: String(loc.description || loc.描述 || ''), lines, actions: [] };
  }
  // 大陆弹窗：v-if="selectedContinent"
  const c = s.selectedContinent;
  if (c) {
    const lines: string[] = [];
    if (c.气候) lines.push(`气候：${c.气候}`);
    if (c.地理特征 && c.地理特征.length > 0) lines.push(`地理特征：${c.地理特征.join('、')}`);
    if (c.天然屏障 && c.天然屏障.length > 0) lines.push(`天然屏障：${c.天然屏障.join('、')}`);
    if (c.特点) lines.push(`大陆特点：${c.特点}`);
    if (c.主要势力 && c.主要势力.length > 0) lines.push(`主要势力：${joinList(c.主要势力)}`);
    return { name: String(c.name ?? ''), head: ['大陆'], body: String(c.description || '广袤的修仙大陆，蕴含无尽机缘与危险。'), lines, actions: [] };
  }
  return null;
}
