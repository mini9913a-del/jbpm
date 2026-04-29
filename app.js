const state = {
    advertiser: null,
    currentReport: null, // { id, data, aiData, timestamp, period, mediaList }
    reports: [],
    charts: { trend: null, campaign: null },
    apiKey: localStorage.getItem('gemini_api_key') || '',
};

// --- Cloud Database Layer (Supabase) ---
const SUPABASE_URL = 'https://bzesxbnfwoptpbormmza.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZXN4Ym5md29wdHBib3JtbXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcxOTYsImV4cCI6MjA5Mjg5MzE5Nn0.qeZ9ap8SYyvnbxb8FNLfQA0a5OZ6oDtXSu2U5oEsSzc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const server = {
    async getAllReports() {
        try {
            const { data, error } = await sb
                .from('reports')
                .select('id, advertiser, timestamp, period, media_list, total_spend, avg_roas, analysis_mode')
                .order('timestamp', { ascending: false });
            
            if (error) {
                if (error.code === 'PGRST205') throw new Error("데이터베이스에 'reports' 테이블이 없습니다. 관리자 설정을 완료해 주세요.");
                throw error;
            }
            // Map snake_case to camelCase
            return data.map(r => ({
                id: r.id,
                advertiser: r.advertiser,
                timestamp: Number(r.timestamp),
                period: r.period,
                mediaList: r.media_list,
                totalSpend: r.total_spend,
                avgRoas: r.avg_roas,
                analysisMode: r.analysis_mode
            }));
        } catch (e) {
            console.error('불러오기 실패:', e);
            throw new Error('데이터 목록을 가져오지 못했습니다: ' + (e.message || '네트워크 오류'));
        }
    },

    async getReport(id) {
        try {
            const { data, error } = await sb
                .from('reports')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            return {
                id: data.id,
                advertiser: data.advertiser,
                timestamp: Number(data.timestamp),
                period: data.period,
                mediaList: data.media_list,
                totalSpend: data.total_spend,
                avgRoas: data.avg_roas,
                data: data.data,
                aiData: data.ai_data,
                analysisMode: data.analysis_mode
            };
        } catch (e) {
            console.error('상세 로드 실패:', e);
            throw new Error('리포트 상세 데이터를 가져오지 못했습니다.');
        }
    },

    async saveReport(report) {
        try {
            const dbData = {
                id: report.id,
                advertiser: report.advertiser,
                timestamp: report.timestamp,
                period: report.period,
                media_list: report.mediaList,
                total_spend: report.totalSpend,
                avg_roas: report.avgRoas,
                data: report.data,
                ai_data: report.aiData,
                analysis_mode: report.analysisMode
            };

            const { error } = await sb
                .from('reports')
                .upsert(dbData);
            
            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('저장 실패:', e);
            if (e.code === 'PGRST205') {
                throw new Error("저장 실패: 'reports' 테이블이 없습니다. SQL 에디터에서 테이블 생성 코드를 실행해 주세요.");
            }
            throw new Error('데이터 저장 중 오류가 발생했습니다: ' + e.message);
        }
    },

    async deleteReport(id) {
        try {
            const { error } = await sb
                .from('reports')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('삭제 실패:', e);
            throw new Error('데이터 삭제 중 오류가 발생했습니다.');
        }
    }
};

const isOverallSheet = (name) => {
    const l = name.toLowerCase();
    return l.includes('overall') || l.includes('total') || l.includes('전체') || l.includes('요약') || l.includes('합계');
};

// --- View & Modal Management ---
const app = {
    async init() {
        lucide.createIcons();
        
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.showView('advertiser-view');
        });

        this.setupFileUploader();
        await this.loadHistory();
        
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
        Chart.defaults.font.family = "'Inter', sans-serif";
    },

    showView(viewId) {
        const targetView = document.getElementById(viewId);
        if (!targetView) {
            console.error(`View not found: ${viewId}`);
            return;
        }

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        targetView.classList.add('active');
        
        // Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(item => {
            if(item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Hide sidebar on Login View
        const sidebar = document.getElementById('app-sidebar');
        if (viewId === 'login-view') {
            sidebar.style.display = 'none';
        } else {
            sidebar.style.display = 'flex';
        }

        if (viewId === 'history-view') {
            this.renderHistory();
        }

        lucide.createIcons();
    },

    openSettings() {
        document.getElementById('api-key-input').value = state.apiKey;
        document.getElementById('settings-modal').classList.add('active');
    },

    closeSettings() {
        document.getElementById('settings-modal').classList.remove('active');
    },

    saveSettings() {
        const key = document.getElementById('api-key-input').value.trim();
        state.apiKey = key;
        if(key) {
            localStorage.setItem('gemini_api_key', key);
            alert('API 키가 저장되었습니다. 이제 매체별 AI 자동 인사이트 분석을 사용할 수 있습니다!');
        } else {
            localStorage.removeItem('gemini_api_key');
        }
        this.closeSettings();
    },

    selectAdvertiser(name) {
        state.advertiser = name;
        document.getElementById('current-advertiser-name').textContent = name;
        document.getElementById('dash-advertiser-name').textContent = name;
        this.showView('upload-view');
        
        if(!state.apiKey) {
            setTimeout(() => {
                const wantAI = confirm("매체별 AI 자동 인사이트 분석 기능을 사용하시려면 우측 상단 '설정'에서 무료 Gemini API 키를 입력해주세요. 입력하시겠습니까?");
                if(wantAI) this.openSettings();
            }, 500);
        }
    },

    logout() {
        state.advertiser = null;
        state.currentReport = null;
        document.getElementById('nav-dashboard').disabled = true;
        this.showView('login-view');
    },

    async loadHistory() {
        try {
            state.reports = await server.getAllReports();
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    },

    renderHistory() {
        const listEl = document.getElementById('history-list');
        listEl.innerHTML = '';

        if (state.reports.length === 0) {
            listEl.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">저장된 데이터가 없습니다. 리포트를 업로드해 주세요.</td></tr>`;
            return;
        }

        // Sort by timestamp desc
        const sorted = [...state.reports].sort((a, b) => b.timestamp - a.timestamp);

        sorted.forEach(report => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(report.timestamp).toLocaleString('ko-KR')}</td>
                <td><strong>${report.advertiser}</strong></td>
                <td>${report.period}</td>
                <td><div style="display:flex; gap:4px;">${report.mediaList.map(m => `<span class="badge" style="background: rgba(255,255,255,0.1); margin:0;">${m}</span>`).join('')}</div></td>
                <td>₩${this.formatCurrency(report.totalSpend)}</td>
                <td>${report.avgRoas.toFixed(1)}%</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-primary btn-sm" onclick="app.loadReport('${report.id}')">보기</button>
                        <button class="btn-secondary btn-sm btn-outline-danger" onclick="app.deleteReport('${report.id}')"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>
                </td>
            `;
            listEl.appendChild(tr);
        });
        lucide.createIcons();
    },

    async loadReport(id) {
        try {
            const report = await server.getReport(id);
            if (!report) return;

            state.currentReport = report;
            state.advertiser = report.advertiser;
            
            document.getElementById('dash-advertiser-name').textContent = report.advertiser;
            document.getElementById('nav-dashboard').disabled = false;
            
            // Sync Mode UI
            this.updateModeUI(report.analysisMode || 'performance');
            
            this.renderDashboard(report.data);
            
            // AI insights if exists
            const insightEl = document.getElementById('ai-insight-text');
            const mediaGrid = document.getElementById('media-insights-grid');
            const propEl = document.getElementById('ai-future-proposal');

            if (report.aiData) {
                this.renderAIContent(report.aiData);
                document.getElementById('btn-export-ppt').disabled = false;
            } else {
                insightEl.innerHTML = '<span class="pulse-text">AI 분석 데이터가 없습니다.</span>';
                mediaGrid.innerHTML = '';
                propEl.innerHTML = '';
                document.getElementById('btn-export-ppt').disabled = true;
            }

            this.showView('dashboard-view');
        } catch (e) {
            alert('리포트 로드 실패: ' + e.message);
        }
    },

    async deleteReport(id) {
        if (!confirm('이 리포트를 삭제하시겠습니까?')) return;
        try {
            await server.deleteReport(id);
            await this.loadHistory();
            this.renderHistory();
            if (state.currentReport && state.currentReport.id === id) {
                state.currentReport = null;
                document.getElementById('nav-dashboard').disabled = true;
            }
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    },

    async setAnalysisMode(mode) {
        if (!state.currentReport) return;
        
        state.currentReport.analysisMode = mode;
        this.updateModeUI(mode);
        this.renderDashboard(state.currentReport.data);
        
        // Trigger AI re-analysis if user confirms or if no AI data exists
        if (!state.currentReport.aiData || confirm('분석 모드가 변경되었습니다. 새로운 기준(AI)으로 다시 분석하시겠습니까?')) {
            await this.generateAIInsights();
        }
        
        await server.saveReport(state.currentReport);
    },

    // --- Connection Management ---
    saveConnection() {
        const adId = document.getElementById('meta-ad-id').value.trim();
        const token = document.getElementById('meta-token').value.trim();
        const advertiser = document.getElementById('meta-advertiser').value.trim();

        if (!adId || !token || !advertiser) {
            alert('모든 정보를 입력해주세요.');
            return;
        }

        const config = { adId, token, advertiser };
        localStorage.setItem('meta_config', JSON.stringify(config));
        alert('메타 연동 정보가 저장되었습니다.');
        this.updateConnectionUI();
    },

    loadConnection() {
        const configRaw = localStorage.getItem('meta_config');
        if (configRaw) {
            const config = JSON.parse(configRaw);
            document.getElementById('meta-ad-id').value = config.adId || '';
            document.getElementById('meta-token').value = config.token || '';
            document.getElementById('meta-advertiser').value = config.advertiser || '';
            this.updateConnectionUI();
        }
    },

    updateConnectionUI() {
        const configRaw = localStorage.getItem('meta_config');
        const badge = document.getElementById('meta-status-badge');
        const btn = document.getElementById('btn-meta-sync');
        
        if (configRaw && badge && btn) {
            badge.textContent = '연동 완료';
            badge.style.background = 'rgba(16, 185, 129, 0.1)';
            badge.style.color = 'var(--success)';
            btn.disabled = false;
        }
    },

    async syncMeta() {
        const configRaw = localStorage.getItem('meta_config');
        if (!configRaw) {
            alert('연동 정보를 먼저 저장해주세요.');
            return;
        }

        const config = JSON.parse(configRaw);
        const btn = document.getElementById('btn-meta-sync');
        const originalHtml = btn.innerHTML;
        
        btn.innerHTML = '<i class="spin">⏳</i> 데이터 가져오는 중...';
        btn.disabled = true;

        try {
            const allMapped = await metaApi.fetchInsights(config.adId, config.token);
            
            if (allMapped.length === 0) {
                throw new Error('최근 30일간 수집된 성과 데이터가 없습니다.');
            }

            // UI Advertiser name update
            state.advertiser = config.advertiser;
            
            // Re-use logic from handleFile to save report
            await this.processRawData(allMapped);
            
            alert('메타 데이터 수집 및 리포트 생성이 완료되었습니다!');
        } catch (e) {
            console.error(e);
            alert('메타 데이터 수집 실패: ' + e.message);
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    },

    // Helper to process data common to Excel and API
    async processRawData(allMapped) {
        // Calculate Summary for Storage
        let totalSpend = 0, totalRev = 0;
        const mediaSet = new Set();
        const dates = [];

        allMapped.forEach(r => {
            totalSpend += r.spend;
            totalRev += r.revenue;
            mediaSet.add(r.media);
            if (r.date !== 'N/A') dates.push(r.date);
        });

        const sortedDates = dates.sort();
        const period = sortedDates.length > 0 ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}` : 'N/A';
        
        const reportId = 'report_' + Date.now();
        const newReport = {
            id: reportId,
            advertiser: state.advertiser,
            timestamp: Date.now(),
            period: period,
            mediaList: Array.from(mediaSet),
            totalSpend: totalSpend,
            avgRoas: totalSpend > 0 ? (totalRev / totalSpend) * 100 : 0,
            data: allMapped,
            aiData: null,
            analysisMode: 'performance' 
        };

        await server.saveReport(newReport);
        await this.loadHistory();
        
        state.currentReport = newReport;
        document.getElementById('nav-dashboard').disabled = false;
        
        this.renderDashboard(allMapped);
        this.showView('dashboard-view');
        
        if(state.apiKey) {
            this.generateAIInsights();
        }
    },

    updateModeUI(mode) {
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        const trafficBtn = document.getElementById('mode-traffic');
        const perfBtn = document.getElementById('mode-perf');
        
        if (mode === 'traffic' && trafficBtn) {
            trafficBtn.classList.add('active');
        } else if (perfBtn) {
            perfBtn.classList.add('active');
        }
    },

    // --- File Handling (Multi-Sheet) ---
    setupFileUploader() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) this.handleFile(e.target.files[0]);
        });
    },

    handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            alert('.xlsx 형식의 엑셀 파일만 업로드 가능합니다.');
            return;
        }

        const loaderText = document.getElementById('loading-text');
        loaderText.textContent = "모든 탭(시트)의 데이터를 인덱스 기반으로 병합 중입니다...";
        document.getElementById('loading-spinner').style.display = 'block';

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                let allMapped = [];

                // 각 탭(매체)별로 루프 실행
                for (let sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                    if (rawRows.length === 0) continue;

                    let headerRowIndex = 0;
                    let maxScore = -1;
                    const keywordsToLookFor = ['cost', 'spend', '지출', '비용', '광고비', '금액', '캠페인', 'campaign', '클릭', 'click', '노출', 'impression', '날짜', 'date', '일자'];

                    // 헤더 줄 찾기
                    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
                        const row = rawRows[i];
                        if (!row || !Array.isArray(row)) continue;
                        let score = 0;
                        row.forEach(cell => {
                            if (typeof cell === 'string') {
                                const lowerCell = cell.toLowerCase().trim();
                                if (keywordsToLookFor.some(kw => lowerCell.includes(kw))) score++;
                            }
                        });
                        if (score > maxScore) { maxScore = score; headerRowIndex = i; }
                    }

                    if (maxScore === 0) continue; // 이 시트에는 데이터가 없다고 판단

                    const excelHeaders = rawRows[headerRowIndex].map(h => h ? String(h).trim() : '');
                    const mapConfig = this.getRuleBasedMappingConfig(excelHeaders);

                    if (mapConfig.spend === null) {
                        // 공격적 백폴
                        const aggressiveSpendIdx = excelHeaders.findIndex(h => h.toLowerCase().includes('cost') || h.toLowerCase().includes('금액') || h.toLowerCase().includes('비용') || h.toLowerCase().includes('지출'));
                        if (aggressiveSpendIdx !== -1) mapConfig.spend = aggressiveSpendIdx;
                    }

                    if (mapConfig.date === null) {
                        // 날짜 공격적 백폴 (실제 데이터 형태를 보고 역추적)
                        for (let i = headerRowIndex + 1; i < Math.min(rawRows.length, headerRowIndex + 20); i++) {
                            const rowData = rawRows[i];
                            let foundIndex = -1;
                            for (let j = 0; j < rowData.length; j++) {
                                const cell = rowData[j];
                                if (typeof cell === 'number' && cell > 40000 && cell < 60000) { foundIndex = j; break; }
                                if (typeof cell === 'string') {
                                    if (cell.match(/^\d{4}[./-]\d{1,2}[./-]\d{1,2}/) || cell.match(/^\d{4}\s*년/) || cell.match(/^\d{1,2}\s*월\s*\d{1,2}\s*일/)) { foundIndex = j; break; }
                                }
                            }
                            if (foundIndex !== -1) {
                                mapConfig.date = foundIndex;
                                break;
                            }
                        }
                    }

                    if (mapConfig.spend === null) {
                        console.warn(`[${sheetName}] 시트에서 광고비 항목을 찾을 수 없어 건너뜁니다.`);
                        continue;
                    }

                    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                        const rowData = rawRows[i];
                        if (!rowData || rowData.every(cell => cell === '')) continue;

                        // TOTAL, 합계, 평균 행 무시 (수치 뻥튀기 방지)
                        const c0 = String(rowData[0] || '').toLowerCase().replace(/\s/g, '');
                        const c1 = String(rowData[1] || '').toLowerCase().replace(/\s/g, '');
                        if (c0.includes('합계') || c0.includes('총계') || c0.includes('total') || c0.includes('평균')) continue;
                        if (c1.includes('합계') || c1.includes('총계') || c1.includes('total') || c1.includes('평균')) continue;

                        const parsedRow = this.parseRow(rowData, mapConfig, sheetName);
                        if (parsedRow.spend > 0 || parsedRow.impressions > 0 || parsedRow.clicks > 0) {
                            allMapped.push(parsedRow);
                        }
                    }
                }

                if (allMapped.length === 0) {
                    throw new Error('표준 양식에 맞는 데이터를 찾을 수 없거나 모든 데이터가 0입니다.');
                }

                // Calculate Summary for Storage
                let totalSpend = 0, totalRev = 0, totalConv = 0;
                const mediaSet = new Set();
                const dates = [];

                allMapped.forEach(r => {
                    totalSpend += r.spend;
                    totalRev += r.revenue;
                    totalConv += r.conversions;
                    mediaSet.add(r.media);
                    if (r.date !== 'N/A') dates.push(r.date);
                });

                const sortedDates = dates.sort();
                const period = sortedDates.length > 0 ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]}` : 'N/A';
                
                const reportId = 'report_' + Date.now();
                const newReport = {
                    id: reportId,
                    advertiser: state.advertiser,
                    timestamp: Date.now(),
                    period: period,
                    mediaList: Array.from(mediaSet),
                    totalSpend: totalSpend,
                    avgRoas: totalSpend > 0 ? (totalRev / totalSpend) * 100 : 0,
                    data: allMapped,
                    aiData: null,
                    analysisMode: totalConv === 0 ? 'traffic' : 'performance' // Auto-detect
                };

                await server.saveReport(newReport);
                await this.loadHistory();
                
                state.currentReport = newReport;
                document.getElementById('nav-dashboard').disabled = false;
                document.getElementById('loading-spinner').style.display = 'none';
                
                this.renderDashboard(allMapped);
                this.showView('dashboard-view');
                
                if(state.apiKey) {
                    this.generateAIInsights();
                } else {
                    document.getElementById('ai-insight-text').innerHTML = `<span style="color: var(--text-secondary)"><i data-lucide="info" style="display:inline; width:16px; margin-bottom:-3px;"></i> 설정에서 Gemini API 키를 입력하시면 매체별 맞춤 인사이트가 생성됩니다.</span>`;
                    document.getElementById('media-insights-grid').innerHTML = `<p style="color: var(--text-muted); grid-column: 1 / -1;">API 키가 설정되지 않았습니다.</p>`;
                    lucide.createIcons();
                }

            } catch (error) {
                console.error(error);
                alert(error.message || '파일을 읽는 중 오류가 발생했습니다. 표준 양식을 확인해주세요.');
                document.getElementById('loading-spinner').style.display = 'none';
            }
        };
        reader.readAsArrayBuffer(file);
    },

    getRuleBasedMappingConfig(headers) {
        const lowerHeaders = headers.map(h => h ? String(h).toLowerCase().trim() : '');
        const findColumnIndex = (keywords) => {
            let index = lowerHeaders.findIndex(h => keywords.some(kw => h === kw));
            if (index !== -1) return index;
            index = lowerHeaders.findIndex(h => {
                if (h.includes('per') || h.includes('단가') || h.includes('cpc') || h.includes('cpa') || h.includes('roas') || h.includes('당') || h.includes('비율')) return false;
                return keywords.some(kw => h.includes(kw));
            });
            return index !== -1 ? index : null;
        };

        return {
            date: findColumnIndex(['날짜', '일자', 'date', 'day', '기간', '시간', 'period', 'time', '집행일', '기준일', '일시']),
            campaign: findColumnIndex(['캠페인', '이름', '광고', 'campaign', 'name']),
            spend: findColumnIndex(['지출', '비용', '금액', '광고비', '소진', 'spend', 'cost']),
            impressions: findColumnIndex(['노출', 'impression', 'views']),
            clicks: findColumnIndex(['클릭', 'click']),
            conversions: findColumnIndex(['전환', '결과', '구매', 'conversion', 'result', 'purchase']),
            revenue: findColumnIndex(['매출', '수익', '가치', 'revenue', 'value', '전환가치', '구매가치']),
            ctr: findColumnIndex(['ctr', '클릭률', '클릭율'])
        };
    },

    parseRow(rowData, mapConfig, sheetName) {
        const parseNum = (val, isPercentage = false) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') {
                if (isPercentage && val < 1) return val * 100;
                return val;
            }
            let cleanStr = String(val).replace(/,/g, '');
            if (isPercentage && cleanStr.includes('%')) {
                cleanStr = cleanStr.replace(/[^0-9.-]/g, '');
                return parseFloat(cleanStr) || 0;
            }
            cleanStr = cleanStr.replace(/[^0-9.-]/g, '');
            return parseFloat(cleanStr) || 0;
        };

        const parseDate = (val) => {
            if (val === undefined || val === null || val === '') return 'N/A';
            if (typeof val === 'number') {
                const date = new Date((val - 25569) * 86400 * 1000);
                const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
                const yyyy = utcDate.getFullYear();
                const mm = String(utcDate.getMonth() + 1).padStart(2, '0');
                const dd = String(utcDate.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
            let s = String(val).trim();
            
            // YYYY년 MM월 DD일 형식 처리
            const kDateMatch = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
            if (kDateMatch) return `${kDateMatch[1]}-${kDateMatch[2].padStart(2, '0')}-${kDateMatch[3].padStart(2, '0')}`;
            
            // MM월 DD일 형식 처리 (연도 누락 시 올해로 간주)
            const shortKDate = s.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
            if (shortKDate) return `${new Date().getFullYear()}-${shortKDate[1].padStart(2, '0')}-${shortKDate[2].padStart(2, '0')}`;

            s = s.replace(/(\d{4})[./\s-]+(\d{1,2})[./\s-]+(\d{1,2})\b.*/, (match, y, m, d) => {
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            });
            return s;
        };

        const getVal = (idx) => idx !== null && idx < rowData.length ? rowData[idx] : undefined;

        const spend = parseNum(getVal(mapConfig.spend));
        const revenue = parseNum(getVal(mapConfig.revenue));
        const conversions = parseNum(getVal(mapConfig.conversions));
        const clicks = parseNum(getVal(mapConfig.clicks));
        const impressions = parseNum(getVal(mapConfig.impressions));
        
        let ctr = 0;
        const ctrVal = getVal(mapConfig.ctr);
        if (ctrVal !== undefined && ctrVal !== '') {
            ctr = parseNum(ctrVal, true);
        } else if (impressions > 0) {
            ctr = (clicks / impressions) * 100;
        }

        const roas = spend > 0 ? (revenue / spend) * 100 : 0;
        const cpa = conversions > 0 ? (spend / conversions) : 0;
        const cpc = clicks > 0 ? (spend / clicks) : 0;

        return {
            media: sheetName,
            date: mapConfig.date !== null ? parseDate(getVal(mapConfig.date)) : 'N/A',
            campaign: mapConfig.campaign !== null ? (getVal(mapConfig.campaign) || 'N/A') : 'N/A',
            impressions, clicks, spend, conversions, revenue, roas, cpa, ctr, cpc
        };
    },

    // --- AI Media Insights ---
    async generateAIInsights() {
        if (!state.currentReport) return;
        
        const insightEl = document.getElementById('ai-insight-text');
        const mediaGrid = document.getElementById('media-insights-grid');
        
        insightEl.innerHTML = '<span class="pulse-text">AI가 다중 매체 데이터를 종합 분석하고 있습니다...</span>';
        mediaGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;"><span class="pulse-text">매체별 인사이트 생성 중...</span></p>';

        const kpiData = state.currentReport.data.filter(r => !isOverallSheet(r.media));
        
        let tSpend = 0, tRev = 0, tConv = 0, tImpr = 0, tClicks = 0;
        const mediaMap = {};
        
        kpiData.forEach(r => {
            tSpend += r.spend; tRev += r.revenue; tConv += r.conversions;
            tImpr += r.impressions; tClicks += r.clicks;
            
            if(!mediaMap[r.media]) mediaMap[r.media] = { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
            mediaMap[r.media].spend += r.spend;
            mediaMap[r.media].revenue += r.revenue;
            mediaMap[r.media].conversions += r.conversions;
            mediaMap[r.media].clicks += r.clicks;
            mediaMap[r.media].impressions += r.impressions;
        });

        const overallRoas = tSpend > 0 ? (tRev / tSpend) * 100 : 0;
        const overallCpa = tConv > 0 ? (tSpend / tConv) : 0;
        
        const mode = state.currentReport.analysisMode || 'performance';
        const isTrafficMode = mode === 'traffic';

        const mediaSummary = Object.keys(mediaMap).map(k => {
            const m = mediaMap[k];
            return {
                name: k,
                spend: m.spend,
                conversions: m.conversions,
                clicks: m.clicks,
                roas: m.spend > 0 ? (m.revenue / m.spend) * 100 : 0,
                cpa: m.conversions > 0 ? (m.spend / m.conversions) : 0,
                cpc: m.clicks > 0 ? (m.spend / m.clicks) : 0,
                ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0
            };
        });

        if(mediaSummary.length === 0) {
            insightEl.innerHTML = '분석할 유효 매체 데이터가 없습니다.';
            mediaGrid.innerHTML = '';
            return;
        }

        const modeInstruction = isTrafficMode
            ? "⚠️ [전략적 분석 모드: 트래픽 확보]: 이 캠페인은 '트래픽(클릭/노출) 극대화'가 주 목적입니다. 전환수가 적거나 0이어도 절대로 비판하지 마세요. 대신 클릭당 단가(CPC)의 효율성, 클릭률(CTR) 개선, 유효 트래픽 확보 규모에 집중해서 칭찬하고, 더 저렴하게 더 많은 유입을 만드는 전략을 제안하세요."
            : "⚠️ [전략적 분석 모드: 성과/전환]: 이 캠페인은 '전환 및 매출(ROAS)' 확보가 주 목적입니다. ROAS, CPA, 구매 전환수 위주로 효율을 분석하고, 효율이 높은 매체로 예산을 증액하는 전략을 제안하세요.";

        const prompt = `
너는 실력이 뛰어난 퍼포먼스 마케팅 디렉터야. 현재 분석 모드는 [${isTrafficMode ? '트래픽 중심' : '성과 중심'}]이야.
${modeInstruction}

다음은 이번 달 모든 매체의 광고 운영 결과 요약 데이터야.

[전체 통합 요약]
- 총 집행액: ${tSpend}원
- 총 전환수: ${tConv}
- 총 매출액: ${tRev}원
- 평균 ROAS: ${overallRoas.toFixed(1)}%
- 평균 CPA: ${overallCpa.toFixed(0)}원

[매체별 세부 성과]
${JSON.stringify(mediaSummary)}

이 데이터를 보고 다음 형식의 JSON으로만 응답해줘. 절대로 다른 텍스트나 마크다운(예: \`\`\`json)을 덧붙이지 말고 오직 순수 JSON 객체만 출력해.
주의: media_insights의 media_name 값은 반드시 위 [매체별 세부 성과]에 있는 "name" 값과 토씨 하나 틀리지 않고 똑같이 작성해야 해. (번역하거나 수정 절대 금지)

{
  "overall_insight": "전체 통합 성과에 대한 핵심 브리핑 (3~4문장, 해요체/하십시오체, 굵은 글씨 등 마크다운 지원)",
  "media_insights": [
    {
      "media_name": "[매체별 세부 성과]에 있는 name과 정확히 동일한 값",
      "comment": "해당 매체의 성과 평가 및 예산 조정 제안 (2~3문장)"
    }
  ],
  "future_proposal": "향후 운영 제안 및 예산 분배 전략 (3~4문장)"
}
`;

        try {
            const requestGemini = async (modelName, useJsonMode) => {
                const body = useJsonMode 
                    ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }
                    : { contents: [{ parts: [{ text: prompt }] }] };
                    
                return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${state.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            };

            const modelsToTry = [
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-flash-latest',
                'gemini-pro-latest'
            ];

            let response;
            let lastErrData = null;
            let lastStatus = null;

            for (let modelName of modelsToTry) {
                try {
                    response = await requestGemini(modelName, true);
                    if (response.ok) break;
                    
                    lastStatus = response.status;
                    lastErrData = await response.clone().json().catch(() => ({}));
                    console.warn(`[${modelName}] API Error (${lastStatus}):`, lastErrData);
                    
                    // 대기 후 다음 모델 시도 (서버 과부하 503 대응)
                    await new Promise(resolve => setTimeout(resolve, 800));
                } catch (e) {
                    console.warn(`[${modelName}] Network Error:`, e);
                }
            }

            if (!response || !response.ok) {
                throw new Error(lastErrData?.error?.message || `모든 AI 모델 서버가 혼잡하거나 응답할 수 없습니다. (마지막 에러: ${lastStatus})`);
            }
            const result = await response.json();
            
            let text = result.candidates[0].content.parts[0].text.trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) text = jsonMatch[0];
            
            const aiData = JSON.parse(text);
            
            // Save to server
            if (state.currentReport) {
                state.currentReport.aiData = aiData;
                await server.saveReport(state.currentReport);
                await this.loadHistory();
            }

            this.renderAIContent(aiData);
            
        } catch (error) {
            console.error(error);
            insightEl.innerHTML = `<span style="color: var(--danger)"><strong>AI 분석 통신 실패:</strong> ${error.message}</span><br/><span style="font-size: 0.85rem; color: var(--text-secondary); display:inline-block; margin-top:10px;">💡 <strong>해결 방법:</strong><br/>1. API 키 복사 시 앞뒤에 띄어쓰기가 들어가지 않았는지 확인하세요.<br/>2. 구글 AI Studio에서 정상적으로 발급된 활성 키인지 확인해 주세요.</span>`;
            mediaGrid.innerHTML = '';
        }
    },

    renderAIContent(aiData) {
        const insightEl = document.getElementById('ai-insight-text');
        const mediaGrid = document.getElementById('media-insights-grid');
        const propEl = document.getElementById('ai-future-proposal');

        // PPT 내보내기 버튼 활성화
        const pptBtn = document.getElementById('btn-export-ppt');
        if (pptBtn) pptBtn.disabled = false;
        
        // 1. 전체 인사이트 렌더링
        let overallHtml = aiData.overall_insight.replace(/\*\*(.*?)\*\*/g, '<strong style="color:white">$1</strong>').replace(/\n/g, '<br/>');
        insightEl.innerHTML = overallHtml;
        
        // 2. 향후 운영 제안 렌더링
        if (aiData.future_proposal && propEl) {
            propEl.innerHTML = aiData.future_proposal.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent-primary)">$1</strong>').replace(/\n/g, '<br/>');
        }

        // 3. 매체별 인사이트 렌더링
        mediaGrid.innerHTML = '';
        
        // Need summary for metrics
        const kpiData = state.currentReport.data.filter(r => !isOverallSheet(r.media));
        const mediaMap = {};
        kpiData.forEach(r => {
            if(!mediaMap[r.media]) mediaMap[r.media] = { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
            mediaMap[r.media].spend += r.spend;
            mediaMap[r.media].revenue += r.revenue;
            mediaMap[r.media].conversions += r.conversions;
        });

        if (aiData.media_insights && Array.isArray(aiData.media_insights)) {
            aiData.media_insights.forEach(mi => {
                const mediaData = mediaMap[mi.media_name] || 
                                  mediaMap[Object.keys(mediaMap).find(k => k.toLowerCase() === mi.media_name.toLowerCase())];
                                  
                let badgeClass = 'default';
                const nameToUse = mi.media_name;
                const lowerName = nameToUse.toLowerCase();
                if(lowerName.includes('naver') || lowerName.includes('네이버')) badgeClass = 'naver';
                else if(lowerName.includes('google') || lowerName.includes('구글')) badgeClass = 'google';
                else if(lowerName.includes('meta') || lowerName.includes('메타') || lowerName.includes('페이스북') || lowerName.includes('인스타')) badgeClass = 'meta';
                else if(lowerName.includes('kakao') || lowerName.includes('카카오')) badgeClass = 'kakao';

                const roas = mediaData && mediaData.spend > 0 ? (mediaData.revenue / mediaData.spend) * 100 : 0;
                const cpa = mediaData && mediaData.conversions > 0 ? (mediaData.spend / mediaData.conversions) : 0;

                const cardHtml = `
                    <div class="media-insight-card">
                        <div class="media-card-header">
                            <span class="media-badge ${badgeClass}">${nameToUse}</span>
                            ${mediaData ? `<span style="font-size: 0.8rem; color: var(--text-secondary);">ROAS ${roas.toFixed(0)}%</span>` : ''}
                        </div>
                        ${mediaData ? `
                        <div class="media-metrics">
                            <div class="metric-item">광고비 <strong>₩${this.formatCurrency(mediaData.spend)}</strong></div>
                            <div class="metric-item">CPA <strong>₩${this.formatCurrency(cpa)}</strong></div>
                            <div class="metric-item">전환수 <strong>${this.formatCurrency(mediaData.conversions)}</strong></div>
                        </div>
                        ` : ''}
                        <div class="media-card-body">
                            ${(mi.comment || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
                        </div>
                    </div>
                `;
                mediaGrid.innerHTML += cardHtml;
            });
        }
        lucide.createIcons();
    },

    // --- Dashboard Rendering ---
    formatCurrency(num) {
        return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(num);
    },
    
    renderDashboard(allData) {
        if (!allData) return;
        const kpiData = allData.filter(r => !isOverallSheet(r.media)); // 전체 요약 제외
        
        let tSpend = 0, tRev = 0, tConv = 0, tImpr = 0, tClicks = 0;
        kpiData.forEach(r => { tSpend += r.spend; tRev += r.revenue; tConv += r.conversions; tImpr += r.impressions; tClicks += r.clicks; });

        const avgRoas = tSpend > 0 ? (tRev / tSpend) * 100 : 0;
        const avgCpa = tConv > 0 ? (tSpend / tConv) : 0;
        const avgCtr = tImpr > 0 ? (tClicks / tImpr) * 100 : 0;
        const avgCpc = tClicks > 0 ? (tSpend / tClicks) : 0;

        // KPI Card Elements
        const kpiElements = {
            spend: { label: '총 광고비', value: '₩' + this.formatCurrency(tSpend), icon: 'dollar-sign', class: '' },
            conv: { label: '총 전환수', value: this.formatCurrency(tConv), icon: 'target', class: 'highlight' },
            rev: { label: '총 매출액', value: '₩' + this.formatCurrency(tRev), icon: 'shopping-cart', class: '' },
            roas: { label: '평균 ROAS', value: avgRoas.toFixed(1) + '%', icon: 'trending-up', class: 'accent' },
            cpa: { label: '평균 CPA', value: '₩' + this.formatCurrency(avgCpa), icon: 'crosshair', class: '' },
            ctr: { label: '평균 CTR', value: avgCtr.toFixed(2) + '%', icon: 'mouse-pointer-click', class: 'accent' },
            clicks: { label: '총 클릭수', value: this.formatCurrency(tClicks), icon: 'mouse-pointer-2', class: 'highlight' },
            cpc: { label: '평균 CPC', value: '₩' + this.formatCurrency(avgCpc), icon: 'credit-card', class: '' }
        };

        const mode = state.currentReport.analysisMode || 'performance';
        const kpiGrid = document.querySelector('.kpi-grid');
        kpiGrid.innerHTML = '';

        // Order based on mode
        let order = mode === 'traffic' 
            ? ['clicks', 'ctr', 'cpc', 'spend', 'conv', 'roas'] 
            : ['spend', 'conv', 'rev', 'roas', 'cpa', 'ctr'];

        order.forEach(key => {
            const item = kpiElements[key];
            if (!item) return;
            const card = document.createElement('div');
            card.className = 'kpi-card';
            if (key === 'ctr' && mode === 'traffic') card.style.border = '1px solid var(--accent-primary)';
            
            card.innerHTML = `
                <div class="kpi-icon ${item.class}"><i data-lucide="${item.icon}"></i></div>
                <div class="kpi-info">
                    <span class="kpi-label">${item.label}</span>
                    <h3 class="kpi-value">${item.value}</h3>
                </div>
            `;
            kpiGrid.appendChild(card);
        });

        this.renderCharts(kpiData);

        // 테이블 동적 렌더링 (매체별 분리)
        const container = document.getElementById('media-tables-container');
        container.innerHTML = '<h3 style="margin-bottom: 20px;">상세 분석 데이터</h3>';

        // 매체별로 데이터 그룹화
        const grouped = {};
        allData.forEach(r => {
            if(!grouped[r.media]) grouped[r.media] = [];
            grouped[r.media].push(r);
        });

        Object.keys(grouped).forEach(mediaName => {
            const dataSlice = grouped[mediaName].slice(0, 100); 
            
            let badgeClass = 'default';
            const lowerName = mediaName.toLowerCase();
            if(lowerName.includes('naver') || lowerName.includes('네이버')) badgeClass = 'naver';
            else if(lowerName.includes('google') || lowerName.includes('구글')) badgeClass = 'google';
            else if(lowerName.includes('meta') || lowerName.includes('메타') || lowerName.includes('페이스북') || lowerName.includes('인스타')) badgeClass = 'meta';
            else if(lowerName.includes('kakao') || lowerName.includes('카카오')) badgeClass = 'kakao';
            else if(isOverallSheet(mediaName)) badgeClass = 'overall';

            const section = document.createElement('div');
            section.style.marginBottom = '30px';
            section.style.background = 'rgba(255, 255, 255, 0.02)';
            section.style.border = '1px solid var(--border-color)';
            section.style.padding = '20px';
            section.style.borderRadius = 'var(--radius-sm)';

            const headerHTML = `<h4 style="margin-bottom: 15px;"><span class="media-badge ${badgeClass}" style="font-size: 0.9rem;">${mediaName}</span></h4>`;
            
            let rowsHTML = '';
            dataSlice.forEach(r => {
                rowsHTML += `
                    <tr>
                        <td>${r.date}</td>
                        <td>₩${this.formatCurrency(r.spend)}</td>
                        <td>${this.formatCurrency(r.impressions)}</td>
                        <td>${this.formatCurrency(r.clicks)}</td>
                        <td style="color: var(--accent-primary); font-weight: bold;">${r.ctr.toFixed(2)}%</td>
                        <td style="color: var(--success); font-weight: bold;">₩${this.formatCurrency(r.cpc)}</td>
                        <td>${this.formatCurrency(r.conversions)}</td>
                        <td style="color: #f59e0b;">₩${this.formatCurrency(r.cpa)}</td>
                        <td>₩${this.formatCurrency(r.revenue)}</td>
                        <td>${r.roas.toFixed(1)}%</td>
                    </tr>
                `;
            });

            const tableHTML = `
                <div class="table-container">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th>일자</th>
                                <th>광고비</th>
                                <th>노출수</th>
                                <th>클릭수</th>
                                <th>CTR</th>
                                <th>CPC</th>
                                <th>전환수</th>
                                <th>CPA</th>
                                <th>매출액</th>
                                <th>ROAS</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
            `;
            section.innerHTML = headerHTML + tableHTML;
            container.appendChild(section);
        });
    },

    renderCharts(data) {
        const dateMap = {};
        data.forEach(r => {
            if(!dateMap[r.date]) dateMap[r.date] = { clicks: 0, impressions: 0 };
            dateMap[r.date].clicks += r.clicks;
            dateMap[r.date].impressions += r.impressions;
        });
        const sortedDates = Object.keys(dateMap).sort();
        const trendLabels = sortedDates;
        const trendClicks = sortedDates.map(d => dateMap[d].clicks);
        const trendCtr = sortedDates.map(d => {
            const item = dateMap[d];
            return item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
        });

        const mediaMap = {};
        let totalConversions = 0;
        data.forEach(r => {
            if(!mediaMap[r.media]) mediaMap[r.media] = { conversions: 0, spend: 0, clicks: 0, impressions: 0 };
            mediaMap[r.media].conversions += r.conversions;
            mediaMap[r.media].spend += r.spend;
            mediaMap[r.media].clicks += r.clicks;
            mediaMap[r.media].impressions += r.impressions;
            totalConversions += r.conversions;
        });
        const mode = state.currentReport.analysisMode || 'performance';
        const isTrafficMode = mode === 'traffic';

        const topMedias = Object.keys(mediaMap)
            .map(k => ({ 
                name: k, 
                conv: mediaMap[k].conversions,
                cpa: mediaMap[k].conversions > 0 ? (mediaMap[k].spend / mediaMap[k].conversions) : 0,
                clicks: mediaMap[k].clicks,
                cpc: mediaMap[k].clicks > 0 ? (mediaMap[k].spend / mediaMap[k].clicks) : 0
            }))
            .sort((a,b) => isTrafficMode ? b.clicks - a.clicks : b.conv - a.conv); 

        if(state.charts.trend) state.charts.trend.destroy();
        if(state.charts.campaign) state.charts.campaign.destroy();

        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        state.charts.trend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [
                    { label: 'CTR (%)', data: trendCtr, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', yAxisID: 'y1', fill: true, tension: 0.4 },
                    { label: '클릭수', data: trendClicks, borderColor: '#94a3b8', borderDash: [5, 5], yAxisID: 'y', tension: 0.4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: { y: { type: 'linear', display: true, position: 'left', min: 0, max: 3000 }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } } }
            }
        });

        const ctxCamp = document.getElementById('campaignChart').getContext('2d');
        const titleEl = document.getElementById('campaign-chart-title');
        if (titleEl) {
            titleEl.textContent = isTrafficMode ? '매체별 성과 (클릭수 & CPC)' : '매체별 성과 (전환수 & CPA)';
        }

        state.charts.campaign = new Chart(ctxCamp, {
            type: 'bar',
            data: {
                labels: topMedias.map(c => c.name),
                datasets: isTrafficMode ? [
                    { type: 'bar', label: '클릭수', data: topMedias.map(c => c.clicks), backgroundColor: '#3b82f6', borderRadius: 4, yAxisID: 'y' },
                    { type: 'line', label: 'CPC (₩)', data: topMedias.map(c => c.cpc), borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', yAxisID: 'y1', tension: 0.3 }
                ] : [
                    { type: 'bar', label: '전환수', data: topMedias.map(c => c.conv), backgroundColor: '#10b981', borderRadius: 4, yAxisID: 'y' },
                    { type: 'line', label: 'CPA (₩)', data: topMedias.map(c => c.cpa), borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1', tension: 0.3 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    y: { beginAtZero: true, type: 'linear', position: 'left' },
                    y1: { beginAtZero: true, type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
                } 
            }
        });
    },

    // --- PPT Export ---
    async exportToPPT() {
        if (!state.currentReport || !state.currentReport.aiData) {
            alert('PPT를 생성할 데이터나 인사이트가 없습니다.');
            return;
        }

        const aiData = state.currentReport.aiData;
        const allData = state.currentReport.data;
        const btn = document.getElementById('btn-export-ppt');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="spin">⏳</i> 생성 중...';
        btn.disabled = true;

        try {
            let pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_16x9';

            // --- Slide 1: Cover ---
            let slideCover = pptx.addSlide();
            slideCover.background = { color: '1e293b' };
            slideCover.addText('Monthly Advertising Performance Report', {
                x: 1, y: 2.2, w: '80%', h: 1.5,
                fontSize: 40, color: 'ffffff', bold: true, align: 'left'
            });
            slideCover.addText(state.advertiser || 'Brand Report', {
                x: 1, y: 3.8, w: '80%', h: 1,
                fontSize: 24, color: 'f59e0b', bold: true, align: 'left'
            });
            const today = new Date();
            slideCover.addText(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`, {
                x: 1, y: 4.8, w: '80%', h: 1,
                fontSize: 14, color: '94a3b8', align: 'left'
            });

            const stripMd = (str) => str ? str.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1') : '';

            // --- Slide 2: Overall ---
            let slideOverall = pptx.addSlide();
            slideOverall.addText('Overall Performance & Insights', { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: '1e293b' });
            
            const kpiData = allData.filter(r => !isOverallSheet(r.media));
            const dateMap = {};
            let overallConversions = 0;
            kpiData.forEach(r => {
                if(!dateMap[r.date]) dateMap[r.date] = { conversions: 0, clicks: 0 };
                dateMap[r.date].conversions += r.conversions;
                dateMap[r.date].clicks += r.clicks;
                overallConversions += r.conversions;
            });
            const isOverallTraffic = overallConversions === 0;
            const sortedDates = Object.keys(dateMap).sort();
            const arrDates = sortedDates.map(d => d.substring(5)); // MM-DD
            const arrMetric = sortedDates.map(d => isOverallTraffic ? dateMap[d].clicks : dateMap[d].conversions);

            if (arrDates.length > 0) {
                let chartData = [{ name: isOverallTraffic ? 'Clicks' : 'Conversions', labels: arrDates, values: arrMetric }];
                slideOverall.addChart(pptx.ChartType.bar, chartData, {
                    x: 0.5, y: 1.2, w: 5.5, h: 3.8,
                    barDir: 'col', chartColors: [isOverallTraffic ? '3b82f6' : '10b981'], showLegend: false,
                    title: isOverallTraffic ? 'Total Clicks by Date' : 'Total Conversions by Date', showTitle: true
                });
            }

            slideOverall.addText(stripMd(aiData.overall_insight), {
                x: 6.2, y: 1.2, w: 3.3, h: 3.8,
                fontSize: 14, color: '333333', align: 'left', valign: 'top'
            });

            // --- Slide 3~N: Media ---
            const mediaMap = {};
            kpiData.forEach(r => {
                if(!mediaMap[r.media]) mediaMap[r.media] = { totalConv: 0, dates: {} };
                if(!mediaMap[r.media].dates[r.date]) mediaMap[r.media].dates[r.date] = { conversions: 0, clicks: 0 };
                mediaMap[r.media].dates[r.date].conversions += r.conversions;
                mediaMap[r.media].dates[r.date].clicks += r.clicks;
                mediaMap[r.media].totalConv += r.conversions;
            });

            if (aiData.media_insights) {
                aiData.media_insights.forEach(mi => {
                    const mediaName = mi.media_name;
                    let slideMedia = pptx.addSlide();
                    slideMedia.addText(`${mediaName} Performance & Insights`, { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: '1e293b' });
                    
                    let mData = mediaMap[mediaName] || mediaMap[Object.keys(mediaMap).find(k => k.toLowerCase() === mediaName.toLowerCase())];
                    if (mData) {
                        const mIsTraffic = mData.totalConv === 0;
                        const mDates = Object.keys(mData.dates).sort();
                        const mVals = mDates.map(d => mIsTraffic ? mData.dates[d].clicks : mData.dates[d].conversions);
                        let chartData = [{ name: mIsTraffic ? 'Clicks' : 'Conversions', labels: mDates.map(d => d.substring(5)), values: mVals }];
                        slideMedia.addChart(pptx.ChartType.line, chartData, {
                            x: 0.5, y: 1.2, w: 5.5, h: 3.8,
                            chartColors: [mIsTraffic ? '3b82f6' : '10b981'], showLegend: false,
                            title: `${mediaName} ${mIsTraffic ? 'Clicks' : 'Conversions'}`, showTitle: true
                        });
                    }

                    slideMedia.addText(stripMd(mi.comment), {
                        x: 6.2, y: 1.2, w: 3.3, h: 3.8,
                        fontSize: 14, color: '333333', align: 'left', valign: 'top'
                    });
                });
            }

            // --- Slide Final: Future Proposal ---
            if (aiData.future_proposal) {
                let slideProp = pptx.addSlide();
                slideProp.background = { color: 'f8fafc' };
                slideProp.addText('Future Operation Proposals', { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: 'f59e0b' });
                slideProp.addText(stripMd(aiData.future_proposal), {
                    x: 0.5, y: 1.5, w: '90%', h: 3.5,
                    fontSize: 16, color: '333333', align: 'left', valign: 'top'
                });
            }

            await pptx.writeFile({ fileName: `Monthly_Ad_Performance_Report_${state.advertiser || 'Brand'}.pptx` });

        } catch (e) {
            console.error(e);
            alert('PPT 생성 중 오류가 발생했습니다.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
