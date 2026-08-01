import {
  elementDefine,
  onConnectedBodyShadow,
  addEventListener,
  onInitialize
} from "@dooboostore/simple-web-component";
import { LottoService } from "../../services/lotto/LottoService";
import type { LottoService as LottoServiceType, LottoItem } from "../../services/lotto/LottoService";
import { inject } from "@dooboostore/simple-boot";

const tagName = 'center-lotto-page';

export default (w: Window) => {
  const existing = w.customElements.get(tagName);
  if (existing) return tagName;

  @elementDefine(tagName, { window: w })
  class LottoPage extends w.HTMLElement {
    private lottoService!: LottoServiceType;
    
    private latestRound: number = 0;
    private selectedRound: number = 0;
    private currentLotto: LottoItem | null = null;
    private activeTab: 'round' | 'stats' = 'round';
    private statsRounds: number = 1;
    private numberStats: Map<number, number> = new Map();
    private recommendedSets: number[][] = [];
    private overlapAllowance: number = 0; 
    private setRequestCount: number = 1;
    private excludeLatestRound: boolean = false;
    private latestRoundNumbers: number[] = [];
    private latestBonusNumber: number = 0;

    @onInitialize
    async onInitialized(
      @inject(LottoService.SYMBOL) lottoService: LottoServiceType
    ): Promise<void> {
      this.lottoService = lottoService;
      this.latestRound = await this.lottoService.getLatestRoundNumber();
      this.selectedRound = this.latestRound;
      await this.loadRoundData(this.selectedRound);
    }

    private triggerRender() {
      if (this.shadowRoot) {
        this.shadowRoot.innerHTML = this.render();
      }
    }

    private async loadRoundData(round: number) {
      this.currentLotto = (await this.lottoService.getLottoRound(round)) || null;
      this.triggerRender();
    }

    private async loadStatsData(count: number) {
      // 최신 회차는 항상 미리 가져와 저장 (제외 여부와 무관)
      const fetchCount = this.excludeLatestRound ? count + 1 : count;
      const list = await this.lottoService.getLottoList(this.latestRound, fetchCount);
      const stats = new Map<number, number>();
      for (let i = 1; i <= 45; i++) stats.set(i, 0);

      // 최신 회차 번호 저장 (보너스 포함) - 항상 list[0]
      if (list.length > 0) {
        const latest = list[0];
        this.latestRoundNumbers = [
          latest.tm1WnNo, latest.tm2WnNo, latest.tm3WnNo,
          latest.tm4WnNo, latest.tm5WnNo, latest.tm6WnNo,
        ];
        this.latestBonusNumber = latest.bnsWnNo;
      }

      // 제외 체크 시 최신 회차(list[0])를 건너뛰고 집계
      const targetList = this.excludeLatestRound ? list.slice(1, count + 1) : list.slice(0, count);

      targetList.forEach(item => {
        [
          item.tm1WnNo,
          item.tm2WnNo,
          item.tm3WnNo,
          item.tm4WnNo,
          item.tm5WnNo,
          item.tm6WnNo,
          item.bnsWnNo,
        ].forEach((num) => {
          stats.set(num, (stats.get(num) || 0) + 1);
        });
      });
      this.numberStats = stats;
      this.triggerRender();
    }

    private generateRecommendation() {
      const limit = Math.floor(this.statsRounds * (this.overlapAllowance / 100));
      let basePool: number[] = [];

      // 1. 조건에 맞는 고유 번호 풀 생성
      for (let i = 1; i <= 45; i++) {
        if ((this.numberStats.get(i) || 0) <= limit) {
          basePool.push(i);
        }
      }

      // 2. 후보가 부족할 경우 전체 번호 중 빈도 낮은 순으로 보충
      if (basePool.length < 6) {
        const sorted = Array.from({ length: 45 }, (_, i) => i + 1)
          .sort((a, b) => (this.numberStats.get(a) || 0) - (this.numberStats.get(b) || 0));
        basePool = Array.from(new Set([...basePool, ...sorted.slice(0, 6)]));
      }

      const sets: number[][] = [];

      for (let s = 0; s < this.setRequestCount; s++) {
        const shuffled = [...basePool].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, 6).sort((a, b) => a - b);
        sets.push(picked);
      }

      this.recommendedSets = sets;
      this.triggerRender();
    }

    @onConnectedBodyShadow
    render() {
      const roundNumbers = this.currentLotto ? 
        [this.currentLotto.tm1WnNo, this.currentLotto.tm2WnNo, this.currentLotto.tm3WnNo, this.currentLotto.tm4WnNo, this.currentLotto.tm5WnNo, this.currentLotto.tm6WnNo] 
        : [];
      const bonusNumber = this.currentLotto?.bnsWnNo || 0;

      const roundOptions = Array.from({ length: this.latestRound }, (_, i) => this.latestRound - i)
        .map(r => `<option value="${r}" ${r === this.selectedRound ? 'selected' : ''}>${r}회</option>`)
        .join('');

      const gridHtml = Array.from({ length: 45 }, (_, i) => i + 1).map(num => {
        const isSelected = roundNumbers.includes(num);
        const isBonus = bonusNumber === num;
        
        if (this.activeTab === 'round') {
          return `<div class="number-cell ${isSelected ? 'marked' : ''} ${isBonus ? 'bonus' : ''}">${num}</div>`;
        } else {
          const count = this.numberStats.get(num) || 0;
          const percentage = (count / this.statsRounds) * 100;
          return `
            <div class="number-cell stats">
              <span class="num">${num}</span>
              <div class="bar-container">
                <div class="bar" style="height: ${Math.min(percentage, 100)}%"></div>
              </div>
              <span class="count">${count}</span>
            </div>
          `;
        }
      }).join('');

      return `
        <style>
          :host { display: block; padding: 20px; font-family: sans-serif; background: #f0f2f5; min-height: 100vh; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .tabs { display: flex; background: #eee; border-bottom: 1px solid #ddd; }
          .tab { flex: 1; padding: 15px; text-align: center; cursor: pointer; font-weight: bold; color: #666; transition: 0.2s; }
          .tab.active { background: white; color: #1976d2; border-bottom: 2px solid #1976d2; }
          .content { padding: 20px; }
          .controls { margin-bottom: 20px; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; }
          select, button, input[type="number"] { padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd; font-size: 14px; outline: none; }
          input[type="number"] { width: 60px; text-align: center; }
          button { background: #1976d2; color: white; border: none; cursor: pointer; font-weight: bold; }
          button:hover { background: #1565c0; }
          .lotto-paper {
            background: #fffbe6; border: 2px solid #d4c4a8; padding: 15px; border-radius: 4px; position: relative;
            background-image: radial-gradient(#d4c4a8 1px, transparent 1px); background-size: 20px 20px; margin-bottom: 20px;
          }
          .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
          .number-cell {
            aspect-ratio: 1; border: 1px solid #d4c4a8; display: flex; align-items: center;
            justify-content: center; font-size: 14px; background: white; position: relative; font-weight: bold; color: #444;
          }
          .number-cell.marked::after {
            content: ''; position: absolute; width: 80%; height: 80%; background: rgba(255, 0, 0, 0.7);
            clip-path: polygon(20% 0%, 0% 20%, 30% 50%, 0% 80%, 20% 100%, 50% 70%, 80% 100%, 100% 80%, 70% 50%, 100% 20%, 80% 0%, 50% 30%);
          }
          .number-cell.bonus::after {
            content: ''; position: absolute; width: 80%; height: 80%; background: rgba(0, 0, 255, 0.5); border-radius: 50%;
          }
          .number-cell.stats { flex-direction: column; font-size: 10px; gap: 2px; }
          .bar-container { width: 100%; height: 20px; background: #eee; position: relative; overflow: hidden; }
          .bar { position: absolute; bottom: 0; left: 0; width: 100%; background: #ff9800; transition: height 0.3s; }
          .recommendation-area { border-top: 2px dashed #ddd; padding-top: 20px; text-align: center; }
          .rec-title { font-weight: bold; margin-bottom: 15px; color: #333; }
          .set-row { margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 8px; }
          .ball-container { display: flex; gap: 8px; justify-content: center; }
          .ball {
            width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            color: white; font-weight: bold; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            box-shadow: inset -2px -2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1);
          }
          .ball-0 { background: #fbc02d; }
          .ball-1 { background: #1976d2; }
          .ball-2 { background: #d32f2f; }
          .ball-3 { background: #7b1fa2; }
          .ball-4 { background: #388e3c; }
          .round-info { text-align: center; margin-bottom: 15px; }
          .round-title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
          .round-date { font-size: 14px; color: #888; }
          .exclude-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #555; cursor: pointer; user-select: none; }
          .exclude-label input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: #1976d2; }
          .ball.ball-latest-win { outline: 3px solid #ff3d00; outline-offset: 2px; position: relative; }
          .ball.ball-latest-bonus { outline: 3px solid #aa00ff; outline-offset: 2px; position: relative; }
          .latest-dot { position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; border-radius: 50%; border: 1px solid white; }
          .dot-win { background: #ff3d00; }
          .dot-bonus { background: #aa00ff; }

          /* Mobile Responsive */
          @media (max-width: 480px) {
            :host { padding: 10px; }
            .container { border-radius: 0; box-shadow: none; }
            .content { padding: 10px; }
            .lotto-paper { padding: 8px; border-width: 1px; }
            .grid { gap: 4px; }
            .number-cell { font-size: 11px; }
            .number-cell.stats { font-size: 8px; gap: 1px; }
            .bar-container { height: 14px; }
            .count { font-size: 7px; }
            .ball { width: 30px; height: 30px; font-size: 11px; }
            .controls { gap: 5px; }
            select, button, input[type="number"] { padding: 6px 8px; font-size: 12px; }
            .exclude-label { font-size: 12px; }
          }
        </style>

        <div class="container">
          <div class="tabs">
            <div class="tab ${this.activeTab === 'round' ? 'active' : ''}" data-tab="round">회차별 번호</div>
            <div class="tab ${this.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">번호별 통계</div>
          </div>

          <div class="content">
            ${this.activeTab === 'round' ? `
              <div class="controls">
                <select id="round-select">
                  ${roundOptions}
                </select>
              </div>
              <div class="round-info">
                <div class="round-title">${this.currentLotto?.ltEpsd || ''}회 당첨 결과</div>
                <div class="round-date">${this.currentLotto?.ltRflYmd || ''} 추첨</div>
              </div>
            ` : `
              <div class="controls">
                <span>최근</span>
                <select id="stats-select">
                  ${[1, 10, 20, 30, 40].map(v => `<option value="${v}" ${this.statsRounds === v ? 'selected' : ''}>${v}회</option>`).join('')}
                </select>
                <span>분석</span>
              </div>
              <div class="controls" style="justify-content: center; margin-top: -8px;">
                <label class="exclude-label">
                  <input type="checkbox" id="exclude-latest-checkbox" ${this.excludeLatestRound ? 'checked' : ''}>
                  최신 회차(${this.latestRound}회) 제외
                </label>
              </div>
            `}

            <div class="lotto-paper">
              <div class="grid">${gridHtml}</div>
            </div>

            ${this.activeTab === 'stats' ? `
              <div class="recommendation-area">
                <div class="rec-title">분석 기반 번호 추천</div>
                <div class="controls">
                  <select id="allowance-select">
                    ${[0, 10, 20, 30, 40, 50].map(v => `<option value="${v}" ${this.overlapAllowance === v ? 'selected' : ''}>${v}% 중복 허용</option>`).join('')}
                  </select>
                  <input type="number" id="set-count-input" value="${this.setRequestCount}" min="1" max="100">
                  <span>게임</span>
                  <button id="recommend-btn">추출</button>
                </div>
                ${this.recommendedSets.length > 0 ? `
                  <div class="results-list">
                    ${this.recommendedSets.map((set, idx) => `
                      <div class="set-row">
                        <div style="font-size: 11px; color: #888; margin-bottom: 5px;">Set ${idx + 1}</div>
                        <div class="ball-container">
                          ${set.map(n => {
                            const isLatest = this.latestRoundNumbers.includes(n);
                            const isBonus = this.latestBonusNumber === n;
                            if (isLatest) {
                              return `<div class="ball ball-${Math.floor((n - 1) / 10)} ball-latest-win" title="${this.latestRound}회 당첨번호">${n}<span class="latest-dot dot-win"></span></div>`;
                            } else if (isBonus) {
                              return `<div class="ball ball-${Math.floor((n - 1) / 10)} ball-latest-bonus" title="${this.latestRound}회 보너스번호">${n}<span class="latest-dot dot-bonus"></span></div>`;
                            } else {
                              return `<div class="ball ball-${Math.floor((n - 1) / 10)}">${n}</div>`;
                            }
                          }).join('')}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    @addEventListener('.tab', 'click', { delegate: true })
    async onTabClick(e: Event) {
      const tab = (e.target as HTMLElement).dataset.tab as 'round' | 'stats';
      if (this.activeTab === tab) return;
      this.activeTab = tab;
      if (tab === 'stats') {
        await this.loadStatsData(this.statsRounds);
      } else {
        this.triggerRender();
      }
    }

    @addEventListener('#round-select', 'change', { delegate: true })
    async onRoundChange(e: Event) {
      const select = e.target as HTMLSelectElement;
      this.selectedRound = Number(select.value);
      await this.loadRoundData(this.selectedRound);
    }

    @addEventListener('#stats-select', 'change', { delegate: true })
    async onStatsChange(e: Event) {
      const select = e.target as HTMLSelectElement;
      this.statsRounds = Number(select.value);
      await this.loadStatsData(this.statsRounds);
    }

    @addEventListener('#allowance-select', 'change', { delegate: true })
    onAllowanceChange(e: Event) {
      const select = e.target as HTMLSelectElement;
      this.overlapAllowance = Number(select.value);
      this.triggerRender();
    }

    @addEventListener('#set-count-input', 'input', { delegate: true })
    onSetCountInput(e: Event) {
      const input = e.target as HTMLInputElement;
      let val = Number(input.value);
      if (val < 1) val = 1;
      if (val > 100) val = 100;
      this.setRequestCount = val;
    }

    @addEventListener('#recommend-btn', 'click', { delegate: true })
    onRecommendClick() {
      this.generateRecommendation();
    }

    @addEventListener('#exclude-latest-checkbox', 'change', { delegate: true })
    async onExcludeLatestChange(e: Event) {
      const checkbox = e.target as HTMLInputElement;
      this.excludeLatestRound = checkbox.checked;
      await this.loadStatsData(this.statsRounds);
    }
  }

  return tagName;
};
