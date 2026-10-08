/* Vested Property Database System - Application Logic
   Author: Google Antigravity Assistant
*/

(function () {
    'use strict';

    // State Variables
    let allRecords = window.VESTED_DATA || [];
    let filteredRecords = [];
    let currentPage = 1;
    let pageSize = 25;
    let activeDagType = 'both'; // 'sa', 'rs', 'both'
    let currentSortField = 'id';
    let currentSortDir = 'asc';

    // Digit Converters
    const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    function toBengali(numStr) {
        if (numStr === null || numStr === undefined) return '';
        let str = String(numStr);
        return str.replace(/[0-9]/g, w => banglaDigits[parseInt(w, 10)]);
    }

    function toEnglish(numStr) {
        if (numStr === null || numStr === undefined) return '';
        let str = String(numStr);
        return str.replace(/[০-৯]/g, w => englishDigits[banglaDigits.indexOf(w)]);
    }

    function normalizeText(text) {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
            .replace(/\s+/g, ' ')
            .trim();
    }

    // DOM Elements
    const elements = {
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        statUnions: document.getElementById('statUnions'),
        statMouzas: document.getElementById('statMouzas'),
        statRecords: document.getElementById('statRecords'),
        statArea: document.getElementById('statArea'),
        
        filterUnion: document.getElementById('filterUnion'),
        filterMouza: document.getElementById('filterMouza'),
        searchDag: document.getElementById('searchDag'),
        searchGlobal: document.getElementById('searchGlobal'),
        filterCaseNo: document.getElementById('filterCaseNo'),
        filterLandType: document.getElementById('filterLandType'),
        filterYear: document.getElementById('filterYear'),
        
        dagToggleSA: document.getElementById('dagToggleSA'),
        dagToggleRS: document.getElementById('dagToggleRS'),
        dagToggleBoth: document.getElementById('dagToggleBoth'),
        
        sortField: document.getElementById('sortField'),
        sortDirBtn: document.getElementById('sortDirBtn'),
        btnReset: document.getElementById('btnReset'),
        
        resultsCount: document.getElementById('resultsCount'),
        pageSizeSelect: document.getElementById('pageSizeSelect'),
        tableBody: document.getElementById('tableBody'),
        paginationControls: document.getElementById('paginationControls'),
        paginationInfo: document.getElementById('paginationInfo'),
        
        modalOverlay: document.getElementById('modalOverlay'),
        modalCloseBtn: document.getElementById('modalCloseBtn'),
        modalContent: document.getElementById('modalContent'),
        modalCopyBtn: document.getElementById('modalCopyBtn'),
        modalPrintBtn: document.getElementById('modalPrintBtn'),
        toast: document.getElementById('toast')
    };

    // Initialize System
    function init() {
        populateInitialDropdowns();
        calculateDashboardKPIs();
        setupEventListeners();
        applyFilters();
    }

    // Populate Dropdowns
    function populateInitialDropdowns() {
        // Union Dropdown
        const unions = Array.from(new Set(allRecords.map(r => r.union))).sort();
        elements.filterUnion.innerHTML = '<option value="">সকল ইউনিয়ন (All Unions)</option>';
        unions.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u;
            opt.textContent = u;
            elements.filterUnion.appendChild(opt);
        });

        updateMouzaDropdown('');

        // Land Type Dropdown
        const landTypesSet = new Set();
        allRecords.forEach(r => {
            if (r.landType) {
                r.landType.split('\n').forEach(t => {
                    const cleanT = t.trim();
                    if (cleanT && cleanT !== 'মোট') landTypesSet.add(cleanT);
                });
            }
        });
        const landTypes = Array.from(landTypesSet).sort();
        elements.filterLandType.innerHTML = '<option value="">সকল শ্রেণী (All Types)</option>';
        landTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            elements.filterLandType.appendChild(opt);
        });

        // Payment Year Dropdown
        const yearsSet = new Set();
        allRecords.forEach(r => {
            if (r.lastPaymentYear) {
                const yr = r.lastPaymentYear.trim();
                if (/^[০-৯0-9]+$/.test(yr)) yearsSet.add(yr);
            }
        });
        const years = Array.from(yearsSet).sort().reverse();
        elements.filterYear.innerHTML = '<option value="">সকল সন (All Years)</option>';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            elements.filterYear.appendChild(opt);
        });
    }

    // Update Mouza Dropdown based on Selected Union
    function updateMouzaDropdown(selectedUnion) {
        let mouzas = [];
        if (selectedUnion) {
            mouzas = Array.from(new Set(allRecords.filter(r => r.union === selectedUnion && r.mouza).map(r => r.mouza))).sort();
        } else {
            mouzas = Array.from(new Set(allRecords.map(r => r.mouza).filter(Boolean))).sort();
        }

        elements.filterMouza.innerHTML = '<option value="">সকল মৌজা (All Mouzas)</option>';
        mouzas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            elements.filterMouza.appendChild(opt);
        });
    }

    // Calculate Dashboard KPIs
    function calculateDashboardKPIs() {
        const totalUnions = new Set(allRecords.map(r => r.union)).size;
        const totalMouzas = new Set(allRecords.map(r => r.mouza).filter(Boolean)).size;
        const totalRecords = allRecords.length;

        let totalAcres = 0;
        allRecords.forEach(r => {
            if (r.landArea) {
                const match = r.landArea.match(/([০-৯0-9\.]+)/);
                if (match) {
                    const engVal = parseFloat(toEnglish(match[1]));
                    if (!isNaN(engVal) && engVal < 500) {
                        totalAcres += engVal;
                    }
                }
            }
        });

        elements.statUnions.textContent = toBengali(totalUnions);
        elements.statMouzas.textContent = toBengali(totalMouzas);
        elements.statRecords.textContent = toBengali(totalRecords.toLocaleString('bn-BD'));
        elements.statArea.textContent = toBengali(totalAcres.toFixed(2)) + ' একর';
    }

    function matchCaseNo(recCase, query) {
        if (!recCase || !query) return false;
        const qClean = query.trim().replace(/\s*\/\s*/g, '/');
        if (!qClean) return false;

        const qEng = toEnglish(qClean).toLowerCase();
        const qBng = toBengali(qClean).toLowerCase();

        const cClean = recCase.trim().replace(/\s*\/\s*/g, '/');
        const cEng = toEnglish(cClean).toLowerCase();
        const cBng = toBengali(cClean).toLowerCase();

        if (qEng.includes('/')) {
            // Full or partial case number with slash (e.g. 2/85 or 285/76)
            return cEng === qEng || cBng === qBng || cEng.startsWith(qEng) || cBng.startsWith(qBng);
        } else {
            // Case number segment without slash (e.g. 96 or 85)
            const partsEng = cEng.split('/');
            const partsBng = cBng.split('/');
            return partsEng.includes(qEng) || partsBng.includes(qBng) || cEng === qEng || cBng === qBng;
        }
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Theme Toggle
        elements.themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            elements.themeToggleBtn.innerHTML = newTheme === 'light' ? '<i class="ri-sun-line"></i>' : '<i class="ri-moon-line"></i>';
        });

        // Cascading Union Select
        elements.filterUnion.addEventListener('change', (e) => {
            updateMouzaDropdown(e.target.value);
            applyFilters();
        });

        // Form Inputs Change
        elements.filterMouza.addEventListener('change', applyFilters);
        elements.searchDag.addEventListener('input', applyFilters);
        elements.searchGlobal.addEventListener('input', applyFilters);
        elements.filterCaseNo.addEventListener('input', applyFilters);
        elements.filterLandType.addEventListener('change', applyFilters);
        elements.filterYear.addEventListener('change', applyFilters);

        // Dag Type Toggle Buttons
        elements.dagToggleSA.addEventListener('click', () => setDagType('sa'));
        elements.dagToggleRS.addEventListener('click', () => setDagType('rs'));
        elements.dagToggleBoth.addEventListener('click', () => setDagType('both'));

        // Sorting
        elements.sortField.addEventListener('change', (e) => {
            currentSortField = e.target.value;
            sortAndRender();
        });
        elements.sortDirBtn.addEventListener('click', () => {
            currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
            elements.sortDirBtn.innerHTML = currentSortDir === 'asc' ? '<i class="ri-sort-asc"></i>' : '<i class="ri-sort-desc"></i>';
            sortAndRender();
        });

        // Reset
        elements.btnReset.addEventListener('click', resetFilters);

        // Page Size Select
        elements.pageSizeSelect.addEventListener('change', (e) => {
            pageSize = e.target.value === 'all' ? filteredRecords.length : parseInt(e.target.value, 10);
            currentPage = 1;
            renderTable();
        });

        // Modal Handlers
        elements.modalCloseBtn.addEventListener('click', closeModal);
        elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.modalOverlay) closeModal();
        });

        elements.modalCopyBtn.addEventListener('click', copyModalText);
        elements.modalPrintBtn.addEventListener('click', () => window.print());

        // Privacy & Anti-copy Protection (Disable Right Click outside modal/auth)
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.modal-card') && !e.target.closest('.auth-modal-card')) {
                e.preventDefault();
            }
        });

        // Privacy Protection (Disable Keyboard Copy Shortcuts outside modal/auth)
        document.addEventListener('keydown', (e) => {
            if (e.target.closest('.modal-card') || e.target.closest('.auth-modal-card')) return;
            if (
                (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S' || e.key === 'a' || e.key === 'A')) ||
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c'))
            ) {
                e.preventDefault();
            }
        });
    }

    function setDagType(type) {
        activeDagType = type;
        elements.dagToggleSA.classList.toggle('active', type === 'sa');
        elements.dagToggleRS.classList.toggle('active', type === 'rs');
        elements.dagToggleBoth.classList.toggle('active', type === 'both');
        applyFilters();
    }

    function resetFilters() {
        elements.filterUnion.value = '';
        updateMouzaDropdown('');
        elements.filterMouza.value = '';
        elements.searchDag.value = '';
        elements.searchGlobal.value = '';
        elements.filterCaseNo.value = '';
        elements.filterLandType.value = '';
        elements.filterYear.value = '';
        setDagType('both');
        currentSortField = 'id';
        currentSortDir = 'asc';
        elements.sortField.value = 'id';
        elements.sortDirBtn.innerHTML = '<i class="ri-sort-asc"></i>';
        applyFilters();
        showToast('সকল ফিল্টার রিসেট করা হয়েছে');
    }

    // Apply Filter Logic
    function applyFilters() {
        const selUnion = elements.filterUnion.value;
        const selMouza = elements.filterMouza.value;
        const queryDag = normalizeText(elements.searchDag.value);
        const queryDagEng = toEnglish(queryDag);
        const queryDagBng = toBengali(queryDag);

        const queryGlobal = normalizeText(elements.searchGlobal.value);
        const queryGlobalEng = toEnglish(queryGlobal);
        const queryGlobalBng = toBengali(queryGlobal);
        
        const queryCase = normalizeText(elements.filterCaseNo.value);
        const selLandType = elements.filterLandType.value;
        const selYear = elements.filterYear.value;

        filteredRecords = allRecords.filter(r => {
            // Union Filter
            if (selUnion && r.union !== selUnion) return false;

            // Mouza Filter
            if (selMouza && r.mouza !== selMouza) return false;

            // Dag Filter
            if (queryDag) {
                let matchDag = false;
                const matchSA = r.saDag && (normalizeText(r.saDag).includes(queryDag) || r.saDag.includes(queryDagEng) || r.saDag.includes(queryDagBng));
                const matchRS = r.rsDag && (normalizeText(r.rsDag).includes(queryDag) || r.rsDag.includes(queryDagEng) || r.rsDag.includes(queryDagBng));

                if (activeDagType === 'sa') matchDag = matchSA;
                else if (activeDagType === 'rs') matchDag = matchRS;
                else matchDag = matchSA || matchRS;

                if (!matchDag) return false;
            }

            // Case No Filter
            if (queryCase) {
                if (!matchCaseNo(r.caseNo, queryCase)) return false;
            }

            // Land Type Filter
            if (selLandType && (!r.landType || !r.landType.includes(selLandType))) return false;

            // Payment Year Filter
            if (selYear && r.lastPaymentYear !== selYear) return false;

            // Global Free Text Filter
            if (queryGlobal) {
                const combined = normalizeText([
                    r.lesseeInfo,
                    r.recordedOwner,
                    r.remarks,
                    r.saKhatian,
                    r.rsKhatian
                ].join(' '));

                const matchCaseInGlobal = matchCaseNo(r.caseNo, queryGlobal);

                if (!matchCaseInGlobal && !combined.includes(queryGlobal) && !combined.includes(queryGlobalEng) && !combined.includes(queryGlobalBng)) return false;
            }

            return true;
        });

        currentPage = 1;
        sortAndRender();
    }

    // Sort & Render
    function sortAndRender() {
        filteredRecords.sort((a, b) => {
            let valA = a[currentSortField] || '';
            let valB = b[currentSortField] || '';

            if (currentSortField === 'landArea') {
                const numA = parseFloat(toEnglish((valA.match(/([০-৯0-9\.]+)/) || [0, 0])[1])) || 0;
                const numB = parseFloat(toEnglish((valB.match(/([০-৯0-9\.]+)/) || [0, 0])[1])) || 0;
                return currentSortDir === 'asc' ? numA - numB : numB - numA;
            }

            if (currentSortField === 'id') {
                return currentSortDir === 'asc' ? a.id - b.id : b.id - a.id;
            }

            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();

            if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
            return 0;
        });

        renderTable();
    }

    // Render Table & Pagination
    function renderTable() {
        const total = filteredRecords.length;
        elements.resultsCount.textContent = toBengali(total.toLocaleString('bn-BD'));

        if (total === 0) {
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align:center; padding: 40px; color: var(--text-muted);">
                        <i class="ri-search-line" style="font-size: 32px; display: block; margin-bottom: 10px;">
                        কোন রেকর্ড পাওয়া যায়নি। অন্য তথ্য দিয়ে অনুসন্ধান করুন।
                    </td>
                </tr>
            `;
            elements.paginationControls.innerHTML = '';
            elements.paginationInfo.textContent = '';
            return;
        }

        const effectivePageSize = pageSize === 'all' ? total : pageSize;
        const totalPages = Math.ceil(total / effectivePageSize);
        if (currentPage > totalPages) currentPage = totalPages;

        const startIdx = (currentPage - 1) * effectivePageSize;
        const endIdx = Math.min(startIdx + effectivePageSize, total);
        const pageItems = filteredRecords.slice(startIdx, endIdx);

        // Render Table Rows
        let html = '';
        pageItems.forEach(r => {
            const highlightDag = elements.searchDag.value.trim();

            html += `
                <tr onclick="window.VestedApp.openModal(${r.id})">
                    <td style="font-weight: 700;">${toBengali(r.id)}</td>
                    <td><span class="badge badge-union">${r.union}</span></td>
                    <td><span class="badge badge-mouza">${r.mouza || '-'}</span></td>
                    <td><span class="badge badge-case">${r.caseNo || '-'}</span></td>
                    <td style="max-width: 280px; white-space: normal;">
                        ${formatCellText(r.lesseeInfo)}
                    </td>
                    <td>${r.saKhatian ? 'খতিয়ান: ' + r.saKhatian + '<br>' : ''}${r.saDag ? '<span class="badge badge-dag">দাগ: ' + formatHighlight(r.saDag, highlightDag) + '</span>' : '-'}</td>
                    <td>${r.rsKhatian ? 'খতিয়ান: ' + r.rsKhatian + '<br>' : ''}${r.rsDag ? '<span class="badge badge-dag">দাগ: ' + formatHighlight(r.rsDag, highlightDag) + '</span>' : '-'}</td>
                    <td>${r.landType || '-'}</td>
                    <td style="font-weight: 600; color: var(--primary);">${r.landArea || '-'}</td>
                    <td>
                        <span class="badge ${isRecentYear(r.lastPaymentYear) ? 'badge-year-ok' : 'badge-year-old'}">
                            ${r.lastPaymentYear || 'অনুল্লিখিত'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="event.stopPropagation(); window.VestedApp.openModal(${r.id})">
                            <i class="ri-eye-line"></i> দেখুন
                        </button>
                    </td>
                </tr>
            `;
        });

        elements.tableBody.innerHTML = html;

        // Render Pagination Info & Controls
        elements.paginationInfo.textContent = `রেকর্ড ${toBengali(startIdx + 1)} - ${toBengali(endIdx)} (সর্বমোট ${toBengali(total)})`;

        renderPaginationButtons(totalPages);
    }

    function isRecentYear(yr) {
        if (!yr) return false;
        const engYr = parseInt(toEnglish(yr), 10);
        return engYr >= 1420;
    }

    function formatCellText(text) {
        if (!text) return '-';
        return text.replace(/\n/g, '<br>');
    }

    function formatHighlight(text, query) {
        if (!text) return '-';
        if (!query) return text;
        const qEng = toEnglish(query);
        const qBng = toBengali(query);
        const regex = new RegExp(`(${query}|${qEng}|${qBng})`, 'gi');
        return text.replace(regex, '<mark class="highlight-match">$1</mark>');
    }

    function renderPaginationButtons(totalPages) {
        if (totalPages <= 1) {
            elements.paginationControls.innerHTML = '';
            return;
        }

        let btns = [];
        btns.push(`<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.VestedApp.goToPage(${currentPage - 1})"><i class="ri-arrow-left-s-line"></i></button>`);

        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                btns.push(`<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="window.VestedApp.goToPage(${p})">${toBengali(p)}</button>`);
            } else if (p === currentPage - 3 || p === currentPage + 3) {
                btns.push(`<span style="padding: 0 4px; color: var(--text-muted);">...</span>`);
            }
        }

        btns.push(`<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.VestedApp.goToPage(${currentPage + 1})"><i class="ri-arrow-right-s-line"></i></button>`);
        elements.paginationControls.innerHTML = btns.join('');
    }

    function goToPage(p) {
        currentPage = p;
        renderTable();
        elements.tableBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Modal Display Logic
    function openModal(id) {
        const rec = allRecords.find(r => r.id === id);
        if (!rec) return;

        const html = `
            <div class="record-header-banner">
                <div>
                    <div class="banner-title">ইউনিয়ন: ${rec.union} | মৌজা: ${rec.mouza || 'অনুল্লিখিত'}</div>
                    <div class="banner-sub">ভিপি কেস নম্বর: ${rec.caseNo || 'অনুল্লিখিত'}</div>
                </div>
                <span class="badge badge-union" style="font-size: 0.95rem; padding: 6px 14px;">রেকর্ড নং: ${toBengali(rec.id)}</span>
            </div>

            <div class="record-grid-2col">
                <div class="section-box">
                    <div class="section-title"><i class="ri-user-shared-line"></i> কেস ও ইজারা গ্রহীতার তথ্য</div>
                    <div class="info-list">
                        <div class="info-item">
                            <span class="info-label">ভিপি কেস নম্বর</span>
                            <span class="info-value">${rec.caseNo || '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">লীজি / ইজারা গ্রহীতার নাম ও ঠিকানা</span>
                            <span class="info-value">${rec.lesseeInfo || '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">রেকর্ডীয় মালিকের নাম</span>
                            <span class="info-value">${rec.recordedOwner || 'তথ্য নেই'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">সর্বশেষ নবায়ন / পরিশোধের সন</span>
                            <span class="info-value" style="color: ${isRecentYear(rec.lastPaymentYear) ? 'var(--primary)' : 'var(--danger)'};">
                                ${rec.lastPaymentYear || 'অনুল্লিখিত'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="section-box">
                    <div class="section-title"><i class="ri-map-pin-2-line"></i> জমির তফসিল ও দাগ খতিয়ান</div>
                    <div class="info-list">
                        <div class="info-item">
                            <span class="info-label">ইউনিয়ন ও মৌজা</span>
                            <span class="info-value">${rec.union} (${rec.mouza || '-'})</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">এস.এ খতিয়ান ও দাগ</span>
                            <span class="info-value">খতিয়ান: ${rec.saKhatian || '-'} | দাগ: ${rec.saDag || '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">আর.এস খতিয়ান ও দাগ</span>
                            <span class="info-value">খতিয়ান: ${rec.rsKhatian || '-'} | দাগ: ${rec.rsDag || '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">জমির রকম / শ্রেণী</span>
                            <span class="info-value">${rec.landType || '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">জমির পরিমাণ</span>
                            <span class="info-value" style="color: var(--primary); font-size: 1.1rem;">${rec.landArea || '-'}</span>
                        </div>
                        ${rec.structureArea ? `
                        <div class="info-item">
                            <span class="info-label">স্থাপনার পরিমাণ</span>
                            <span class="info-value">${rec.structureArea}</span>
                        </div>` : ''}
                        ${rec.remarks ? `
                        <div class="info-item">
                            <span class="info-label">মন্তব্য</span>
                            <span class="info-value">${rec.remarks}</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        `;

        elements.modalContent.innerHTML = html;
        elements.modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        elements.modalOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    function copyModalText() {
        const text = elements.modalContent.innerText;
        navigator.clipboard.writeText(text).then(() => {
            showToast('রেকর্ড কপি করা হয়েছে!');
        });
    }

    function showToast(msg) {
        elements.toast.textContent = msg;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), 3000);
    }

    // Export CSV
    function exportToCSV() {
        if (filteredRecords.length === 0) {
            showToast('এক্সপোর্ট করার জন্য কোন তথ্য পাওয়া যায়নি');
            return;
        }

        const headers = ['ID', 'Union', 'Mouza', 'CaseNo', 'LesseeInfo', 'SA_Khatian', 'SA_Dag', 'RS_Khatian', 'RS_Dag', 'LandType', 'LandArea', 'LastPaymentYear', 'Remarks'];
        const rows = filteredRecords.map(r => [
            r.id,
            `"${(r.union || '').replace(/"/g, '""')}"`,
            `"${(r.mouza || '').replace(/"/g, '""')}"`,
            `"${(r.caseNo || '').replace(/"/g, '""')}"`,
            `"${(r.lesseeInfo || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.saKhatian || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.saDag || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.rsKhatian || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.rsDag || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.landType || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.landArea || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
            `"${(r.lastPaymentYear || '').replace(/"/g, '""')}"`,
            `"${(r.remarks || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Vested_Property_Records_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('CSV ফাইল সফলভাবে ডাইনলোড হয়েছে');
    }

    // Expose Global Namespace for Inline Handlers
    window.VestedApp = {
        openModal,
        goToPage
    };

    // Run on DOM Ready
    document.addEventListener('DOMContentLoaded', init);

})();
