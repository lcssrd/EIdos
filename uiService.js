(function () {
    "use strict";

    // --- Variables d'état de l'UI ---
    let pancarteChartInstance;

    // Références pour les modales
    let loadPatientModal, loadPatientBox, loadPatientListContainer;
    let confirmModal, confirmModalBox, confirmTitle, confirmMessage, confirmCancelBtn, confirmOkBtn;
    let crModal, crModalBox, crModalTitle, crModalTextarea, crModalSaveBtn, crModalCloseBtn, crModalActiveIdInput;

    // Références pour le bouton de statut
    let saveStatusButton, saveStatusIcon, saveStatusText;

    // NOUVEAU : Références pour le Toast
    let toastElement, toastIcon, toastText;
    let toastTimeout = null;

    let confirmCallback = null; // Pour la modale de confirmation

    // Références pour le tutoriel
    let tutorialOverlay, tutorialStepBox, tutorialText, tutorialSkipBtn, tutorialNextBtn;
    let currentStepIndex = 0;
    let highlightedElement = null;

    // État pour l'interaction avec les barres IV
    let ivInteraction = {
        active: false, mode: null, targetBar: null, targetCell: null,
        startX: 0, startLeft: 0, startWidth: 0,
        startLeftPx: 0,
    };

    // --- Données Statiques pour les Tableaux (UI) ---
    // Modale de chargement de patient
    loadPatientModal = document.getElementById('load-patient-modal');
    loadPatientBox = document.getElementById('load-patient-box');
    loadPatientListContainer = document.getElementById('load-patient-list-container');

    // Modale des comptes rendus (CR)
    crModal = document.getElementById('cr-modal');
    crModalBox = document.getElementById('cr-modal-box');
    crModalTitle = document.getElementById('cr-modal-title');
    crModalTextarea = document.getElementById('cr-modal-textarea');
    crModalSaveBtn = document.getElementById('cr-modal-save-btn');
    crModalCloseBtn = document.getElementById('cr-modal-close-btn');
    crModalActiveIdInput = document.getElementById('cr-modal-active-id');

    // Tutoriel
    tutorialOverlay = document.getElementById('tutorial-overlay');
    tutorialStepBox = document.getElementById('tutorial-step-box');
    tutorialText = document.getElementById('tutorial-text');
    tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
    tutorialNextBtn = document.getElementById('tutorial-next-btn');
    // Bouton de statut de sauvegarde
    saveStatusButton = document.getElementById('save-status-button');
    saveStatusIcon = document.getElementById('save-status-icon');
    saveStatusText = document.getElementById('save-status-text');

    // NOUVEAU : Toast
    toastElement = document.getElementById('toast-notification');
    toastIcon = document.getElementById('toast-icon');
    toastText = document.getElementById('toast-text');

    // NOUVEAU : Écouteur pour le champ allergie (mise en valeur en temps réel)
    const allergyInput = document.getElementById('atcd-allergies');
    if (allergyInput) {
        allergyInput.addEventListener('input', checkAllergyStatus);
    }

    /**
     * NOUVEAU : Vérifie si le champ allergie est rempli et applique le style d'alerte
     */
    function checkAllergyStatus() {
        const input = document.getElementById('atcd-allergies');
        if (!input) return;
        const container = input.closest('.info-item');
        if (!container) return;

        if (input.value && input.value.trim() !== '') {
            container.classList.add('allergy-active');
        } else {
            container.classList.remove('allergy-active');
        }
    }

    /**
     * Construit les lignes de la table de biologie.
     */
    function generateBioRows(title, data) {
        let html = `<tr class="font-bold bg-purple-50 text-left"><td class="p-2" colspan="8">${title}</td></tr>`;
        for (const [key, value] of Object.entries(data)) {
            html += `<tr><td class="p-2 text-left font-semibold">${key}</td><td class="p-2 text-left text-xs">${value}</td>`;
            for (let i = 0; i < 6; i++) {
                html += '<td class="p-0"><input type="text"></td>';
            }
            html += '</tr>';
        }
        return html;
    }

    /**
     * Construit la structure vide (tbody) du diagramme de soins.
     */
    function getDefaultForCareDiagramTbody() {
        return ``; // Par défaut, il est vide
    }

    /**
     * Construit les en-têtes et les lignes vides pour toutes les tables dynamiques.
     */
    function initializeDynamicTables() {
        let html = '';

        // --- PRESCRIPTIONS ---
        const prescriptionThead = document.getElementById('prescription-thead');
        if (prescriptionThead) {
            html = '<tr><th class="p-2 text-left align-bottom min-w-[220px]" rowspan="2">Médicament / Soin</th><th class="p-2 text-left align-bottom min-w-[144px]" rowspan="2">Posologie</th><th class="p-2 text-left align-bottom min-w-[96px]" rowspan="2">Voie</th><th class="p-2 text-left align-bottom" rowspan="2" style="min-width: 100px;">Date de début</th>';
            for (let i = 0; i < 11; i++) { html += `<th class="p-2 text-center" colspan="8">Jour ${i}</th>`; }
            html += '</tr><tr>';
            const hours = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h'];
            for (let i = 0; i < 11; i++) {
                for (const hour of hours) {
                    html += `<th class="p-1 text-center small-col">${hour}</th>`;
                }
            }
            html += '</tr>';
            prescriptionThead.innerHTML = html;
        }

        // --- BIOLOGIE ---
        const bioThead = document.getElementById('bio-thead');
        if (bioThead) {
            html = '<tr><th class="p-2 text-left w-1/4">Analyse</th><th class="p-2 text-left w-1/4">Valeurs de référence</th>';
            for (let i = 0; i < 6; i++) {
                html += `<th class="p-1"><input type="date" placeholder="JJ/MM/AA" class="font-semibold text-center w-24 bg-transparent"></th>`;
            }
            html += '</tr>';
            bioThead.innerHTML = html;
        }
        const bioTbody = document.getElementById('bio-tbody');
        if (bioTbody) {
            html = '';
            html += generateBioRows('Numération Formule Sanguine (NFS)', nfsData);
            html += generateBioRows('Bilan Électrolytique', ionoData);
            html += generateBioRows('Bilan Hépatique', hepatiqueData);
            html += generateBioRows('Bilan Lipidique', lipidiqueData);
            html += generateBioRows('Gaz du Sang (artériel)', gdsData);
            html += generateBioRows('Marqueurs Inflammation', inflammationData);
            bioTbody.innerHTML = html;
        }

        // --- PANCARTE ---
        const pancarteThead = document.getElementById('pancarte-thead');
        if (pancarteThead) {
            html = '<tr><th class="p-2 text-left sticky-col" rowspan="2">Paramètres</th>';
            for (let i = 0; i < 11; i++) { html += `<th class="p-2 text-center" colspan="3">Jour ${i}</th>`; }
            html += '</tr><tr>';
            for (let i = 0; i < 11; i++) {
                html += `<th class="p-1" style="min-width: 70px;">Matin</th>`;
                html += `<th class="p-1" style="min-width: 70px;">Soir</th>`;
                html += `<th class="p-1" style="min-width: 70px;">Nuit</th>`;
            }
            html += '</tr>';
            pancarteThead.innerHTML = html;
        }
        const pancarteTbody = document.getElementById('pancarte-tbody');
        if (pancarteTbody) {
            html = '';
            for (const param in pancarteData) {
                html += `<tr><td class="p-2 text-left font-semibold sticky-col">${param}</td>`;
                let inputHtml = '<input type="text" value="">';
                if (param === 'Température (°C)' || param === 'Poids (kg)' || param === 'Diurèse (L)') {
                    inputHtml = '<input type="number" step="0.1" value="">';
                }

                if (param === 'Poids (kg)' || param === 'Diurèse (L)') {
                    for (let i = 0; i < 11; i++) {
                        html += `<td class="p-0" style="min-width: 70px;">${inputHtml}</td>`;
                        html += `<td class="p-0 bg-gray-100" colspan="2"></td>`;
                    }
                } else {
                    for (let i = 0; i < 33; i++) {
                        html += `<td class="p-0" style="min-width: 70px;">${inputHtml}</td>`;
                    }
                }
                html += `</tr>`;
            }
            pancarteTbody.innerHTML = html;
        }

        // --- GLYCEMIE ---
        const glycemieThead = document.getElementById('glycemie-thead');
        if (glycemieThead) {
            html = '<tr><th class="p-2 text-left sticky-col" rowspan="2">Paramètres</th>';
            for (let i = 0; i < 11; i++) { html += `<th class="p-2 text-center" colspan="3">Jour ${i}</th>`; }
            html += '</tr><tr>';
            for (let i = 0; i < 11; i++) {
                html += `<th class="p-1" style="min-width: 70px;">Matin</th>`;
                html += `<th class="p-1" style="min-width: 70px;">Midi</th>`;
                html += `<th class="p-1" style="min-width: 70px;">Soir</th>`;
            }
            html += '</tr>';
            glycemieThead.innerHTML = html;
        }
        const glycemieTbody = document.getElementById('glycemie-tbody');
        if (glycemieTbody) {
            html = '';
            for (const param in glycemieData) {
                html += `<tr><td class="p-2 text-left font-semibold sticky-col">${param}</td>`;
                let inputHtml = '<input type="number" step="0.1" value="">';
                for (let i = 0; i < 33; i++) {
                    html += `<td class="p-0" style="min-width: 70px;">${inputHtml}</td>`;
                }
                html += `</tr>`;
            }
            glycemieTbody.innerHTML = html;
        }

        // --- DIAGRAMME DE SOINS ---
        const careDiagramThead = document.getElementById('care-diagram-thead');
        if (careDiagramThead) {
            html = '<tr><th class="p-2 text-left min-w-[220px]">Soin / Surveillance</th>';
            for (let i = 0; i < 11; i++) { html += `<th colspan="3" class="border-l">Jour ${i}</th>`; }
            html += '</tr><tr><th class="min-w-[220px]"></th>';
            const msn = ['Matin', 'Soir', 'Nuit'];
            for (let i = 0; i < 11; i++) {
                for (let j = 0; j < msn.length; j++) {
                    const borderClass = (j === 0) ? 'border-l' : '';
                    html += `<th class="${borderClass} p-1 text-center" style="min-width: 70px;">${msn[j]}</th>`;
                }
            }
            html += '</tr>';
            careDiagramThead.innerHTML = html;
        }
    }

    /**
     * Initialise les écouteurs pour les modales.
     */
    function setupModalListeners() {
        // Modale de confirmation
        confirmOkBtn.addEventListener('click', () => {
            if (typeof confirmCallback === 'function') {
                confirmCallback();
            }
            hideConfirmation();
        });
        confirmCancelBtn.addEventListener('click', hideConfirmation);

        // Modale de chargement de patient
        document.getElementById('load-patient-close-btn').addEventListener('click', hideLoadPatientModal);
        document.getElementById('load-patient-cancel-btn').addEventListener('click', hideLoadPatientModal);

        const inputs = container.querySelectorAll('.info-value, input[type=text], input[type=date]');
        inputs.forEach(input => {
            if (input.id !== 'vie-imc') {
                input.disabled = true;
            }
        });
    }

    function applyPermissions(userPermissions) {

        if (userPermissions.subscription === 'free' && !userPermissions.isStudent) {
            const saveBtn = document.getElementById('save-patient-btn');
            if (saveBtn) saveBtn.style.display = 'none';
            if (saveStatusButton) saveStatusButton.style.display = 'none';
        }

        if (!userPermissions.isStudent) {
            crModalSaveBtn.style.display = 'inline-flex';
            return;
        }

        // --- Ce qui suit ne s'applique QU'AUX ÉTUDIANTS ---

        // ***** MODIFICATION : LIGNE SUPPRIMÉE *****
        // if (saveStatusButton) saveStatusButton.style.display = 'none';

        const studentForbiddenButtons = [
            '#save-patient-btn', '#load-patient-btn', '#import-json-btn',
            '#export-json-btn', '#clear-current-patient-btn', '#clear-all-data-btn',
            '#account-management-btn'
        ];
        const author = document.getElementById('new-observation-author').value.trim();
        const text = document.getElementById('new-observation-text').value.trim();
        const dateValue = document.getElementById('new-observation-date').value;
        const entryDateStr = document.getElementById('patient-entry-date').value;

        if (!text || !author || !dateValue || !entryDateStr) {
            if (!entryDateStr) showCustomAlert("Action impossible", "Veuillez d'abord définir une date d'entrée pour le patient.");
            return null;
        }

        const eventDate = new Date(dateValue + 'T00:00:00');
        const formattedDate = utils.formatDate(eventDate);
        const dateOffset = utils.calculateDaysOffset(entryDateStr, dateValue);

        document.getElementById('new-observation-form').reset();

        return { author, text, formattedDate, dateOffset };
    }

    function addObservation(data, fromLoad = false) {
        const { author, text, formattedDate, dateOffset } = data;

        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.dataset.author = author;
        item.dataset.text = text;
        item.dataset.dateOffset = dateOffset;

        item.innerHTML = `
            <div class="timeline-dot dot-rose"></div>
            <div class="flex justify-between items-start">
                <h3 class="font-semibold text-gray-800">${formattedDate} - ${author.toUpperCase()}</h3>
                <button type="button" class="ml-2 text-red-500 hover:text-red-700 transition-colors" title="Supprimer l'observation">
                    <i class="fas fa-times-circle"></i>
                </button>
            </div>
            <p class="text-gray-600 preserve-whitespace"></p>
        `;
        item.querySelector('p').textContent = text;

        const list = document.getElementById('observations-list');
        if (fromLoad) {
            list.appendChild(item);
        } else {
            const sortOrder = document.getElementById('sort-observations-btn')?.dataset.sortOrder || 'desc';
            if (sortOrder === 'desc') list.prepend(item);
            else list.appendChild(item);
        }
    }

    function readTransmissionForm() {
        const author = document.getElementById('new-transmission-author-2').value.trim();
        const text = document.getElementById('new-transmission-text-2').value.trim();
        const dateValue = document.getElementById('new-transmission-date').value;
        const entryDateStr = document.getElementById('patient-entry-date').value;

        if (!text || !author || !dateValue || !entryDateStr) {
            if (!entryDateStr) showCustomAlert("Action impossible", "Veuillez d'abord définir une date d'entrée pour le patient.");
            return null;
        }

        const eventDate = new Date(dateValue + 'T00:00:00');
        const formattedDate = utils.formatDate(eventDate);
        const dateOffset = utils.calculateDaysOffset(entryDateStr, dateValue);

        document.getElementById('new-transmission-form-2').reset();

        return { author, text, formattedDate, dateOffset };
    }

    function addTransmission(data, fromLoad = false) {
        const { author, text, formattedDate, dateOffset } = data;

        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.dataset.author = author;
        item.dataset.text = text;
        item.dataset.dateOffset = dateOffset;

        item.innerHTML = `
            <div class="timeline-dot dot-green"></div>
            <div class="flex justify-between items-start">
                <h3 class="font-semibold text-gray-800">${formattedDate} - ${author.toUpperCase()}</h3>
                <button type="button" class="ml-2 text-red-500 hover:text-red-700 transition-colors" title="Supprimer la transmission">
                    <i class="fas fa-times-circle"></i>
                </button>
            </div>
            <p class="text-gray-600 preserve-whitespace"></p>
        `;

        const safeTextNode = document.createTextNode(text);
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(safeTextNode);
        const formattedText = tempDiv.innerHTML
            .replace(/Cible :/g, '<strong class="text-gray-900">Cible :</strong>')
            .replace(/Données :/g, '<br><strong class="text-gray-900">Données :</strong>')
            .replace(/Actions :/g, '<br><strong class="text-gray-900">Actions :</strong>')
            .replace(/Résultat :/g, '<br><strong class="text-gray-900">Résultat :</strong>');
        item.querySelector('p').innerHTML = formattedText;

        const list = document.getElementById('transmissions-list-ide');
        if (fromLoad) {
            list.appendChild(item);
        } else {
            const sortOrder = document.getElementById('sort-transmissions-btn')?.dataset.sortOrder || 'desc';
            if (sortOrder === 'desc') list.prepend(item);
            else list.appendChild(item);
        }
    }

    function readPrescriptionForm() {
        const name = document.getElementById('med-name').value.trim();
        const posologie = document.getElementById('med-posologie').value.trim();
        const voie = document.getElementById('med-voie').value;
        const startDateValue = document.getElementById('med-start-date').value;
        const entryDateStr = document.getElementById('patient-entry-date').value;

        if (!name || !startDateValue || !entryDateStr) {
            if (!entryDateStr) showCustomAlert("Action impossible", "Veuillez d'abord définir une date d'entrée pour le patient.");
            return null;
        }

        const dateOffset = utils.calculateDaysOffset(entryDateStr, startDateValue);
        const type = voie;

        document.getElementById('new-prescription-form').reset();

        return { name, posologie, voie, type, bars: [], dateOffset };
    }

    function addPrescription(data, fromLoad = false) {
        let { name, posologie, voie, type, bars, dateOffset } = data;
        const entryDateStr = document.getElementById('patient-entry-date').value;

        if (isNaN(parseInt(dateOffset, 10))) dateOffset = 0;

        const targetDate = utils.calculateDateFromOffset(entryDateStr, dateOffset);
        const formattedStartDate = utils.formatDate(targetDate).slice(0, 8);

        const tbody = document.getElementById("prescription-tbody");
        const newRow = tbody.insertRow();
        newRow.dataset.type = type;
        newRow.dataset.dateOffset = dateOffset;

        newRow.innerHTML = `
            <td class="p-2 text-left align-top min-w-[220px]">
                <div class="flex items-start justify-between">
                    <span>${name}</span>
                    <button type="button" class="ml-2 text-red-500 hover:text-red-700 transition-colors" title="Supprimer la prescription">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
            </td>
            <td class="p-2 text-left align-top min-w-[144px]">${posologie}</td>
            <td class="p-2 text-left align-top min-w-[96px]">${voie}</td>
            <td class="p-2 text-left align-top" style="min-width: 100px;">${formattedStartDate}</td>
        `;

        const timelineCell = newRow.insertCell();
        timelineCell.colSpan = 88;
        timelineCell.className = 'iv-bar-container';

        if (type === 'Per Os') {
            timelineCell.classList.add('marker-container');
        }

        const barsToCreate = (fromLoad && bars && Array.isArray(bars)) ? bars : [];

        barsToCreate.forEach(barData => {
            if (barData && barData.left && (barData.width || barData.width === 0)) {
                const bar = document.createElement('div');
                bar.className = 'iv-bar';

                if (type === 'Per Os') {
                    bar.classList.add('marker-bar');
                } else if (type === 'Respiratoire') {
                    bar.classList.add('iv-bar-respi');
                }

                bar.style.left = barData.left;
                bar.style.width = barData.width;
                bar.title = barData.title || '';
                bar.dataset.barId = `bar-${Date.now() + Math.random()}`;

                bar.addEventListener('dblclick', handleIVDblClick);
                const handle = document.createElement('div');
                handle.className = 'resize-handle';
                bar.appendChild(handle);
                timelineCell.appendChild(bar);
                setTimeout(() => updateIVBarDetails(bar, timelineCell), 0);
            }
        });
    }

    function readCareDiagramForm() {
        const name = document.getElementById('care-name').value.trim();
        if (!name) return null;

        document.getElementById('new-care-form').reset();
        return { name };
    }

    function addCareDiagramRow(data) {
        const { name } = data;
        const newRow = document.getElementById('care-diagram-tbody').insertRow();

        let cellsHTML = `
            <td class="p-2 text-left align-top">
                <div class="flex items-start justify-between">
                    <span>${name}</span>
                    <button type="button" class="ml-2 text-red-500 hover:text-red-700 transition-colors" title="Supprimer ce soin">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
            </td>
        `;

        for (let i = 0; i < 11; i++) {
            for (let j = 0; j < 3; j++) {
                const borderClass = (j === 0) ? 'border-l' : '';
                cellsHTML += `<td class="${borderClass} p-0" style="min-width: 70px;">
                                <input type="checkbox" class="block mx-auto">
                            </td>`;
            }
        }
        newRow.innerHTML = cellsHTML;
    }

    function deleteEntry(button) {
        const entry = button.closest('.timeline-item');
        if (entry) {
            entry.remove();
            return true;
        }
        return false;
    }
    function deletePrescription(button) {
        const row = button.closest('tr');
        if (row) {
            row.remove();
            return true;
        }
        return false;
    }
    function deleteCareDiagramRow(button) {
        const row = button.closest('tr');
        if (row) {
            row.remove();
            return true;
        }
        return false;
    }

    function fillCareDiagramFromState(state) {
        const tbody = document.getElementById('care-diagram-tbody');
        if (!tbody) return;

        if (state['care-diagram-tbody_html']) {
            tbody.innerHTML = state['care-diagram-tbody_html'];
        } else {
            tbody.innerHTML = getDefaultForCareDiagramTbody();
        }

        if (state.careDiagramCheckboxes && Array.isArray(state.careDiagramCheckboxes)) {
            const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
            state.careDiagramCheckboxes.forEach((checked, index) => {
                if (checkboxes[index]) checkboxes[index].checked = checked;
            });
        }
    }

    function fillPrescriptionsFromState(state, entryDateStr) {
        const tbody = document.getElementById('prescription-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (state.prescriptions && Array.isArray(state.prescriptions)) {
            state.prescriptions.forEach(pres => {
                addPrescription(pres, true);
            });
        }
    }

    function fillBioFromState(state, entryDateStr) {
        if (!state.biologie) return;

        const bioData = state.biologie;
        const dateInputs = document.querySelectorAll('#bio-table thead input[type="date"]');

        if (bioData.dateOffsets && Array.isArray(bioData.dateOffsets)) {
            bioData.dateOffsets.forEach((offset, index) => {
                if (dateInputs[index]) {
                    const date = utils.calculateDateFromOffset(entryDateStr, offset);
                    dateInputs[index].value = utils.formatDateForInput(date);
                    dateInputs[index].dataset.dateOffset = offset;
                }
            });
        }

        if (bioData.analyses) {
            document.querySelectorAll('#bio-table tbody tr').forEach(row => {
                if (row.cells.length > 1 && row.cells[0].classList.contains('font-semibold')) {
                    const analyseName = row.cells[0].textContent.trim();
                    if (bioData.analyses[analyseName]) {
                        const inputs = row.querySelectorAll('input[type="text"]');
                        bioData.analyses[analyseName].forEach((val, idx) => {
                            if (inputs[idx]) inputs[idx].value = val;
                        });
                    }
                }
            });
        }
    }

    function fillPancarteFromState(state) {
        if (state.pancarte) {
            document.querySelectorAll('#pancarte-table tbody tr').forEach(row => {
                const paramName = row.cells[0].textContent.trim();
                if (state.pancarte[paramName]) {
                    const inputs = row.querySelectorAll('input');
                    state.pancarte[paramName].forEach((val, idx) => {
                        if (inputs[idx]) inputs[idx].value = val;
                    });
                }
            });
        }

        if (state.glycemie) {
            document.querySelectorAll('#glycemie-table tbody tr').forEach(row => {
                const paramName = row.cells[0].textContent.trim();
                if (state.glycemie[paramName]) {
                    const inputs = row.querySelectorAll('input');
                    state.glycemie[paramName].forEach((val, idx) => {
                        if (inputs[idx]) inputs[idx].value = val;
                    });
                }
            });
        }
    }

    function fillCrCardsFromState(comptesRendus) {
        if (!comptesRendus) return;
        for (const [crId, text] of Object.entries(comptesRendus)) {
            updateCrCardCheckmark(crId, text && text.trim() !== '');
        }
    }

    // --- Mises à jour UI ---

    function updateAgeDisplay() {
        const birthDateVal = document.getElementById('vie-date-naissance').value;
        const ageDisplay = document.getElementById('vie-age-display');
        if (!ageDisplay) return;

        if (birthDateVal) {
            const birthDate = new Date(birthDateVal);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            ageDisplay.textContent = `${age} ans`;
        } else {
            ageDisplay.textContent = '--';
        }
    }

    function updateJourHosp() {
        const entryDateVal = document.getElementById('patient-entry-date').value;
        const jourHospDisplay = document.getElementById('header-jour-hosp');
        if (!jourHospDisplay) return;

        if (entryDateVal) {
            const entryDate = new Date(entryDateVal);
            const today = new Date();
            const diffTime = Math.abs(today - entryDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            jourHospDisplay.textContent = `J${diffDays}`;
        } else {
            jourHospDisplay.textContent = 'J-';
        }
    }

    function calculateAndDisplayIMC() {
        const weight = parseFloat(document.getElementById('vie-poids').value);
        const height = parseFloat(document.getElementById('vie-taille').value);
        const imcDisplay = document.getElementById('vie-imc-display');

        if (weight > 0 && height > 0) {
            const heightInMeters = height / 100;
            const imc = weight / (heightInMeters * heightInMeters);
            imcDisplay.textContent = imc.toFixed(1);
        } else {
            imcDisplay.textContent = '--';
        }
    }

    function setupSync() {
        const birthDateInput = document.getElementById('vie-date-naissance');
        if (birthDateInput) birthDateInput.addEventListener('change', updateAgeDisplay);

        const entryDateInput = document.getElementById('patient-entry-date');
        if (entryDateInput) {
            entryDateInput.addEventListener('change', () => {
                updateJourHosp();
                updateDynamicDates(new Date(entryDateInput.value));
            });
        }

        const poidsInput = document.getElementById('vie-poids');
        if (poidsInput) poidsInput.addEventListener('input', calculateAndDisplayIMC);

        const tailleInput = document.getElementById('vie-taille');
        if (tailleInput) tailleInput.addEventListener('input', calculateAndDisplayIMC);
    }

    function updateDynamicDates(entryDate) {
        if (!entryDate || isNaN(entryDate.getTime())) return;

        const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

        const presHeaders = document.querySelectorAll('#prescription-thead th[colspan="8"]');
        presHeaders.forEach((th, index) => {
            const date = new Date(entryDate);
            date.setDate(entryDate.getDate() + index);
            th.textContent = `J${index} - ${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
        });

        const pancarteHeaders = document.querySelectorAll('#pancarte-thead th[colspan="3"], #glycemie-thead th[colspan="3"]');
        pancarteHeaders.forEach((th, index) => {
            const dayIndex = index % 11;
            const date = new Date(entryDate);
            date.setDate(entryDate.getDate() + dayIndex);
            th.textContent = `J${dayIndex} - ${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
        });

        const careHeaders = document.querySelectorAll('#care-diagram-thead th[colspan="3"]');
        careHeaders.forEach((th, index) => {
            const date = new Date(entryDate);
            date.setDate(entryDate.getDate() + index);
            th.textContent = `J${index} - ${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
        });

        refreshAllRelativeDates();
    }

    function refreshAllRelativeDates() {
        const entryDateStr = document.getElementById('patient-entry-date').value;
        if (!entryDateStr) return;

        document.querySelectorAll('.timeline-item').forEach(item => {
            const offset = parseInt(item.dataset.dateOffset, 10);
            if (!isNaN(offset)) {
                const date = utils.calculateDateFromOffset(entryDateStr, offset);
                const dateStr = utils.formatDate(date);
                const title = item.querySelector('h3');
                if (title) {
                    const author = item.dataset.author || '';
                    title.textContent = `${dateStr} - ${author.toUpperCase()}`;
                }
            }
        });

        document.querySelectorAll('#prescription-tbody tr').forEach(row => {
            const offset = parseInt(row.dataset.dateOffset, 10);
            if (!isNaN(offset)) {
                const date = utils.calculateDateFromOffset(entryDateStr, offset);
                const dateStr = utils.formatDate(date).slice(0, 8);
                row.cells[3].textContent = dateStr;
            }
        });

        document.querySelectorAll('#bio-table thead input[type="date"]').forEach(input => {
            const offset = parseInt(input.dataset.dateOffset, 10);
            if (!isNaN(offset)) {
                const date = utils.calculateDateFromOffset(entryDateStr, offset);
                input.value = utils.formatDateForInput(date);
            }
        });
    }

    function updateSaveStatus(status) {
        if (!saveStatusButton) return;

        saveStatusButton.classList.remove('bg-green-100', 'text-green-700', 'bg-yellow-100', 'text-yellow-700', 'bg-blue-100', 'text-blue-700');
        saveStatusIcon.classList.remove('fa-check-circle', 'fa-exclamation-circle', 'fa-spinner', 'fa-spin');

        if (status === 'saved') {
            saveStatusButton.classList.add('bg-green-100', 'text-green-700');
            saveStatusIcon.classList.add('fa-check-circle');
            saveStatusText.textContent = 'Enregistré';
        } else if (status === 'dirty') {
            saveStatusButton.classList.add('bg-yellow-100', 'text-yellow-700');
            saveStatusIcon.classList.add('fa-exclamation-circle');
            saveStatusText.textContent = 'Non enregistré';
        } else if (status === 'saving') {
            saveStatusButton.classList.add('bg-blue-100', 'text-blue-700');
            saveStatusIcon.classList.add('fa-spinner', 'fa-spin');
            saveStatusText.textContent = 'Enregistrement...';
        }
    }

    // --- Utilitaires UI ---

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    function showToast(message, type = 'success') {
        if (!toastElement) return;

        toastText.textContent = message;
        toastElement.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800');
        toastIcon.className = 'fas mr-2';

        if (type === 'success') {
            toastElement.classList.add('bg-green-100', 'text-green-800');
            toastIcon.classList.add('fa-check-circle');
        } else if (type === 'error') {
            toastElement.classList.add('bg-red-100', 'text-red-800');
            toastIcon.classList.add('fa-exclamation-circle');
        } else {
            toastElement.classList.add('bg-blue-100', 'text-blue-800');
            toastIcon.classList.add('fa-info-circle');
        }

        toastElement.classList.remove('translate-y-full', 'opacity-0');

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastElement.classList.add('translate-y-full', 'opacity-0');
            setTimeout(() => {
                toastElement.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    // --- Fonctions de tri ---

    function applySort(type) {
        const btnId = `sort-${type}-btn`;
        const listIdMap = {
            'observations': 'observations-list',
            'transmissions': 'transmissions-list-ide'
        };
        const listId = listIdMap[type];
        if (!listId) return;

        const button = document.getElementById(btnId);
        const list = document.getElementById(listId);

        if (!button || !list) return;

        const sortOrder = button.dataset.sortOrder;
        const items = Array.from(list.querySelectorAll('.timeline-item'));

        items.sort((a, b) => {
            const offsetA = parseInt(a.dataset.dateOffset, 10);
            const offsetB = parseInt(b.dataset.dateOffset, 10);
            return (sortOrder === 'desc') ? (offsetB - offsetA) : (offsetA - offsetB);
        });

        items.forEach(item => list.appendChild(item));
    }

    function toggleSort(type) {
        const btnId = `sort-${type}-btn`;
        const button = document.getElementById(btnId);
        const icon = button.querySelector('i');
        if (!button || !icon) return;

        const currentOrder = button.dataset.sortOrder;
        const newOrder = (currentOrder === 'desc') ? 'asc' : 'desc';

        button.dataset.sortOrder = newOrder;
        if (newOrder === 'desc') {
            button.title = "Trier (Plus récent en haut)";
            icon.classList.remove('fa-sort-amount-up');
            icon.classList.add('fa-sort-amount-down');
        } else {
            button.title = "Trier (Plus ancien en haut)";
            icon.classList.remove('fa-sort-amount-down');
            icon.classList.add('fa-sort-amount-up');
        }
        applySort(type);
    }

    // --- Navigation & Modales ---

    function changeTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('text-blue-600', 'border-blue-600');
            btn.classList.add('text-gray-500', 'border-transparent');
        });

        document.getElementById(tabId).classList.remove('hidden');
        const activeBtn = document.querySelector(`.tab-btn[onclick="uiService.changeTab('${tabId}')"]`);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-500', 'border-transparent');
            activeBtn.classList.add('text-blue-600', 'border-blue-600');
        }
    }

    function openLoadPatientModal(patients, userPermissions) {
        loadPatientListContainer.innerHTML = '';

        if (patients.length === 0) {
            loadPatientListContainer.innerHTML = '<p class="text-gray-500 text-center py-4">Aucune sauvegarde trouvée.</p>';
        } else {
            patients.forEach(p => {
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-gray-100 mb-2';

                // Style distinctif pour les dossiers publics
                if (p.is_public) {
                    div.classList.add('bg-blue-50', 'border-blue-200');
                }

                let nameDisplay = p.sidebar_patient_name || p.patientId;
                let badgeHtml = '';

                if (p.is_public) {
                    badgeHtml = '<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full"><i class="fas fa-globe mr-1"></i>Public</span>';
                }

                // Logique du bouton supprimer
                let deleteButtonHtml = '';
                // On affiche le bouton supprimer sauf si c'est un dossier public ET que l'utilisateur n'est pas admin
                const isAdmin = userPermissions && userPermissions.email === 'lucas.seraudie@gmail.com';
                const canDelete = !p.is_public || isAdmin;

                if (canDelete) {
                    deleteButtonHtml = `
                        <button class="text-red-500 hover:text-red-700 p-2 transition-colors" onclick="patientService.deletePatient('${p.patientId}')" title="Supprimer">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;
                } else {
                    deleteButtonHtml = `
                        <button class="text-gray-300 cursor-not-allowed p-2" title="Suppression réservée à l'administrateur">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;
                }

                div.innerHTML = `
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full ${p.is_public ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'} flex items-center justify-center mr-3">
                            <i class="fas ${p.is_public ? 'fa-globe' : 'fa-user'}"></i>
                        </div>
                        <div>
                            <div class="font-medium text-gray-900 flex items-center">
                                ${nameDisplay}
                                ${badgeHtml}
                            </div>
                            <div class="text-xs text-gray-500">ID: ${p.patientId}</div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors" onclick="patientService.loadPatient('${p.patientId}')">
                            Charger
                        </button>
                        ${deleteButtonHtml}
                    </div>
                `;
                loadPatientListContainer.appendChild(div);
            });
        }

        loadPatientModal.classList.remove('hidden');
        setTimeout(() => {
            loadPatientBox.classList.remove('scale-95', 'opacity-0');
        }, 10);
    }

    function hideLoadPatientModal() {
        loadPatientBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            loadPatientModal.classList.add('hidden');
        }, 200);
    }

    function showConfirmation(title, message, onConfirm) {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        confirmModal.classList.remove('hidden');
        setTimeout(() => {
            confirmModalBox.classList.remove('scale-95', 'opacity-0');
        }, 10);
    }

    // Alias pour compatibilité
    function showDeleteConfirmation(message, onConfirm) {
        showConfirmation("Confirmation de suppression", message, onConfirm);
    }

    function hideConfirmation() {
        confirmModalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        }, 200);
    }

    function showCustomAlert(title, message) {
        // Réutilise la modale de confirmation mais sans action de confirmation (juste OK pour fermer)
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmCallback = null;

        // On cache temporairement le bouton annuler pour en faire une simple alerte
        const originalCancelDisplay = confirmCancelBtn.style.display;
        confirmCancelBtn.style.display = 'none';

        // On change le texte du bouton OK
        const originalOkText = confirmOkBtn.textContent;
        confirmOkBtn.textContent = "Compris";

        // On restaure l'état après fermeture
        const restoreState = () => {
            confirmCancelBtn.style.display = originalCancelDisplay;
            confirmOkBtn.textContent = originalOkText;
            confirmOkBtn.removeEventListener('click', restoreState);
        };
        confirmOkBtn.addEventListener('click', restoreState);

        confirmModal.classList.remove('hidden');
        setTimeout(() => {
            confirmModalBox.classList.remove('scale-95', 'opacity-0');
        }, 10);
    }

    // --- Fonctions UI : Logique des Comptes Rendus (NOUVEAU) ---

    function openCrModal(crId, crTitle, crText) {
        crModalTitle.textContent = crTitle;
        crModalActiveIdInput.value = crId;
        crModalTextarea.value = crText || '';

        crModal.classList.remove('hidden');
        setTimeout(() => {
            crModalBox.classList.remove('scale-95', 'opacity-0');
            crModalTextarea.focus();
        }, 10);
    }

    function closeCrModal() {
        crModalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            crModal.classList.add('hidden');
            crModalActiveIdInput.value = '';
            crModalTextarea.value = '';
        }, 200);
    }

    function updateCrCardCheckmark(crId, hasData) {
        const card = document.querySelector(`.cr-card[data-cr-id="${crId}"]`);
        if (!card) return;

        const icon = card.querySelector('.cr-check-icon');
        if (icon) {
            if (hasData) {
                icon.classList.remove('hidden');
            } else {
                icon.classList.add('hidden');
            }
        }
    }


    // --- Fonctions UI : Logique IV (Barres de prescription) ---

    function handleIVDblClick(e) {
        const bar = e.currentTarget;
        showDeleteConfirmation("Effacer cette administration ?", () => {
            const cell = bar.parentElement;
            if (cell) {
                const barId = bar.dataset.barId;
                if (barId) {
                    cell.querySelectorAll(`.iv-time-label[data-bar-id="${barId}"]`).forEach(label => label.remove());
                }
            }
            bar.remove();
            document.dispatchEvent(new CustomEvent('uiNeedsSave'));
        });
    }

    function handleIVMouseDown(e) {
        if (e.target.classList.contains('iv-bar-container')) {
            ivInteraction.mode = 'draw';
            const cell = e.target;
            const rect = cell.getBoundingClientRect();

            const totalIntervals = 11 * 24 * 4;
            const intervalWidthPx = rect.width / totalIntervals;
            const rawStartXPx = e.clientX - rect.left;

            const snappedInterval = Math.round(rawStartXPx / intervalWidthPx);
            const startX = snappedInterval * intervalWidthPx;

            const newBar = document.createElement('div');
            newBar.className = 'iv-bar';

            const rowType = cell.closest('tr').dataset.type;
            if (rowType === 'Per Os') {
                newBar.classList.add('marker-bar');
            } else if (rowType === 'Respiratoire') {
                newBar.classList.add('iv-bar-respi');
            }

            newBar.style.left = `${(startX / rect.width) * 100}%`;
            newBar.style.width = '0px';
            newBar.dataset.barId = `bar-${Date.now()}`;

            newBar.addEventListener('dblclick', handleIVDblClick);
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            newBar.appendChild(handle);
            cell.appendChild(newBar);

            ivInteraction = {
                ...ivInteraction,
                active: true,
                targetBar: newBar,
                targetCell: cell,
                startX: e.clientX,
                startLeftPx: startX,
            };
            document.body.classList.add('is-drawing-iv');

        } else if (e.target.classList.contains('resize-handle')) {
            const bar = e.target.parentElement;
            if (bar.classList.contains('marker-bar')) {
                return;
            }
            ivInteraction.mode = 'resize';
            const cell = bar.parentElement;
            ivInteraction = {
                ...ivInteraction,
                active: true,
                targetBar: bar,
                targetCell: cell,
                startX: e.clientX,
                startWidth: bar.offsetWidth,
            };
            document.body.classList.add('is-resizing-iv');
        } else if (e.target.classList.contains('iv-bar')) {
            ivInteraction.mode = 'move';
            const bar = e.target;
            const cell = bar.parentElement;
            ivInteraction = {
                ...ivInteraction,
                active: true,
                targetBar: bar,
                targetCell: cell,
                startX: e.clientX,
                startLeft: bar.offsetLeft,
            };
            document.body.classList.add('is-moving-iv');
        }
    }

    function handleIVMouseMove(e) {
        if (!ivInteraction.active) return;
        e.preventDefault();
        const { mode, targetBar, targetCell, startX, startWidth, startLeft, startLeftPx } = ivInteraction;
        const cellRect = targetCell.getBoundingClientRect();
        const dx = e.clientX - startX;

        const totalIntervals = 11 * 24 * 4;
        const intervalWidthPx = cellRect.width / totalIntervals;

        if (mode === 'draw' || mode === 'resize') {
            if (mode === 'draw' && targetCell.classList.contains('marker-container')) {
                let rawLeftPx = startLeftPx + dx;
                const snappedInterval = Math.round(rawLeftPx / intervalWidthPx);
                let newLeft = snappedInterval * intervalWidthPx;

                newLeft = Math.max(0, newLeft);
                newLeft = Math.min(newLeft, cellRect.width - targetBar.offsetWidth);
                targetBar.style.left = `${(newLeft / cellRect.width) * 100}%`;
            } else {
                let rawWidthPx = startWidth + dx;
                const snappedIntervals = Math.max(1, Math.round(rawWidthPx / intervalWidthPx));
                let newWidth = snappedIntervals * intervalWidthPx;
                newWidth = Math.min(newWidth, cellRect.width - targetBar.offsetLeft);
                targetBar.style.width = `${(newWidth / cellRect.width) * 100}%`;
            }
        } else if (mode === 'move') {
            let rawLeftPx = startLeft + dx;
            const snappedInterval = Math.round(rawLeftPx / intervalWidthPx);
            let newLeft = snappedInterval * intervalWidthPx;
            newLeft = Math.max(0, newLeft);
            newLeft = Math.min(newLeft, cellRect.width - targetBar.offsetWidth);
            targetBar.style.left = `${(newLeft / cellRect.width) * 100}%`;
        }
        updateIVBarDetails(targetBar, targetCell);
    }

    function handleIVMouseUp(e) {
        if (!ivInteraction.active) return;
        const { targetBar, targetCell } = ivInteraction;
        if (targetBar && targetCell) {
            const cellRect = targetCell.getBoundingClientRect();
            const totalIntervals = 11 * 24 * 4;
            const intervalWidthPx = cellRect.width / totalIntervals;

            const rawLeftPx = targetBar.offsetLeft;
            const snappedLeftInterval = Math.round(rawLeftPx / intervalWidthPx);
            let finalLeftPx = snappedLeftInterval * intervalWidthPx;

            let finalWidthPx;

            if (targetCell.classList.contains('marker-container')) {
                finalWidthPx = 0;
            } else {
                const rawWidthPx = targetBar.offsetWidth;
                const snappedWidthIntervals = Math.max(1, Math.round(rawWidthPx / intervalWidthPx));
                finalWidthPx = snappedWidthIntervals * intervalWidthPx;
            }

            finalLeftPx = Math.max(0, finalLeftPx);
            finalLeftPx = Math.min(finalLeftPx, cellRect.width - finalWidthPx);

            targetBar.style.left = `${(finalLeftPx / cellRect.width) * 100}%`;
            targetBar.style.width = `${(finalWidthPx / cellRect.width) * 100}%`;

            updateIVBarDetails(targetBar, targetCell);
        }
        document.body.className = document.body.className.replace(/is-(drawing|resizing|moving)-iv/g, '').trim().trim();
        ivInteraction = { active: false, mode: null, targetBar: null, targetCell: null, startX: 0, startLeft: 0, startWidth: 0, startLeftPx: 0 };
        document.dispatchEvent(new CustomEvent('uiNeedsSave'));
    }

    function updateIVBarDetails(bar, cell) {
        if (!bar || !cell) return;
        const tableStartDateStr = document.getElementById('patient-entry-date').value;
        if (!tableStartDateStr) return;

        const barId = bar.dataset.barId;
        if (!barId) return;

        const tableStartDate = new Date(tableStartDateStr + 'T00:00:00');
        const totalTimelineMinutes = 11 * 24 * 60;
        const startPercent = parseFloat(bar.style.left);
        const widthPercent = parseFloat(bar.style.width);
        const startOffsetMinutes = (startPercent / 100) * totalTimelineMinutes;
        const durationMinutes = (widthPercent / 100) * totalTimelineMinutes;

        const rawStartDateTime = new Date(tableStartDate.getTime());
        rawStartDateTime.setMinutes(rawStartDateTime.getMinutes() + startOffsetMinutes);
        const rawEndDateTime = new Date(rawStartDateTime.getTime());
        rawEndDateTime.setMinutes(rawEndDateTime.getMinutes() + durationMinutes);

        const startDateTime = utils.roundDateTo15Min(rawStartDateTime);
        const endDateTime = utils.roundDateTo15Min(rawEndDateTime);

        const formatTime = (date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

        if (cell.classList.contains('marker-container')) {
            bar.title = `Prise: ${startDateTime.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
        } else {
            bar.title = `Début: ${startDateTime.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}\nFin: ${endDateTime.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
        }

        let startLabel = cell.querySelector(`.iv-time-label.start[data-bar-id="${barId}"]`);
        if (!startLabel) {
            startLabel = document.createElement('span');
            startLabel.className = 'iv-time-label start';
            startLabel.dataset.barId = barId;
            cell.appendChild(startLabel);
        }
        let endLabel = cell.querySelector(`.iv-time-label.end[data-bar-id="${barId}"]`);
        if (!endLabel) {
            endLabel = document.createElement('span');
            endLabel.className = 'iv-time-label end';
            endLabel.dataset.barId = barId;
            cell.appendChild(endLabel);
        }

        startLabel.textContent = formatTime(startDateTime);
        endLabel.textContent = formatTime(endDateTime);

        startLabel.style.left = `${startPercent}%`;
        endLabel.style.left = `${startPercent + widthPercent}%`;
    }

    // --- Fonctions UI : Graphique Pancarte ---

    function updatePancarteChart() {
        const table = document.getElementById('pancarte-table');
        const entryDateVal = document.getElementById('patient-entry-date').value;
        const startDate = entryDateVal ? new Date(entryDateVal) : new Date();

        const labels = Array.from({ length: 33 }).map((_, i) => {
            const dayOffset = Math.floor(i / 3);
            const timeOfDay = ['Matin', 'Soir', 'Nuit'][i % 3];
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + dayOffset);
            return `${currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${timeOfDay}`;
        });

        const dataSetsConfig = {
            'Pouls (/min)': { yAxisID: 'y1', borderColor: '#ef4444' },
            'Tension (mmHg)': { type: 'bar', yAxisID: 'y', backgroundColor: '#f9731640' },
            'Température (°C)': { yAxisID: 'y3', borderColor: '#3b82f6' },
            'SpO2 (%)': { yAxisID: 'y4', borderColor: '#10b981' },
            'Douleur (EVA /10)': { yAxisID: 'y2', borderColor: '#8b5cf6' },
        };

        const datasets = Array.from(table.querySelectorAll('tbody tr')).map(row => {
            const paramName = row.cells[0].textContent.trim();
            if (!dataSetsConfig[paramName]) return null;

            const inputs = Array.from(row.querySelectorAll('input'));
            let data;

            if (paramName === 'Diurèse (L)') {
                data = [];
                inputs.forEach(input => {
                    const value = parseFloat(input.value.replace(',', '.'));
                    data.push(isNaN(value) ? null : value);
                    data.push(null); data.push(null);
                });
            } else {
                data = inputs.map(input => {
                    if (paramName === 'Tension (mmHg)' && input.value.includes('/')) {
                        const parts = input.value.split('/');
                        return [parseFloat(parts[1]), parseFloat(parts[0])]; // [min, max]
                    }
                    const value = parseFloat(input.value.replace(',', '.'));
                    return isNaN(value) ? null : value;
                });
            }

            return {
                label: paramName,
                data,
                type: 'line',
                tension: 0.2,
                borderWidth: 2,
                spanGaps: true,
                pointBackgroundColor: dataSetsConfig[paramName].borderColor || '#000',
                ...dataSetsConfig[paramName]
            };
        }).filter(ds => ds !== null);

        const ctx = document.getElementById('pancarteChart').getContext('2d');
        if (pancarteChartInstance) pancarteChartInstance.destroy();

        pancarteChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { position: 'left', title: { display: true, text: 'Tension (mmHg)' }, min: 0, max: 200 },
                    y1: { position: 'right', title: { display: true, text: 'Pouls' }, grid: { drawOnChartArea: false }, min: 0, max: 200 },
                    y2: { position: 'right', title: { display: true, text: 'Douleur' }, grid: { drawOnChartArea: false }, max: 10, min: 0 },
                    y3: { position: 'right', title: { display: true, text: 'Température' }, grid: { drawOnChartArea: false }, min: 36, max: 41, ticks: { stepSize: 0.5 } },
                    y4: { position: 'right', title: { display: true, text: 'SpO2' }, grid: { drawOnChartArea: false }, min: 50, max: 100 }
                },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Tension (mmHg)' && ctx.raw?.length === 2 ? `${ctx.dataset.label}: ${ctx.raw[1]}/${ctx.raw[0]}` : `${ctx.dataset.label}: ${ctx.formattedValue}` } }
                }
            }
        });
    }

    // --- Fonctions UI : Tutoriel ---

    // MODIFICATION : Mise à jour du texte du tutoriel
    const tutorialSteps = [
        { element: '#patient-list li:first-child button', text: "Bienvenue ! Voici la liste des patients. Cliquez sur un patient pour ouvrir son dossier.", position: 'right' },
        { element: '#patient-header-form', text: "Cet en-tête contient les informations principales. La 'Date d'entrée' est cruciale : toutes les autres dates du dossier seront recalculées à partir de celle-ci.", position: 'bottom' },
        { element: '#tabs-nav-container', text: "Utilisez ces onglets pour naviguer entre les différentes sections du dossier.", position: 'bottom' },
        { element: '#save-status-button', text: "Cet indicateur vous montre l'état de vos données. Vert = 'Enregistré', Orange = 'Modifications non sauvegardées'. Cliquez dessus à tout moment pour forcer une sauvegarde et synchroniser vos données.", position: 'bottom' },
        { element: '#save-patient-btn', text: "Ce bouton crée une 'Sauvegarde' du dossier actuel que vous pouvez recharger plus tard.", position: 'bottom-left' },
        { element: '#load-patient-btn', text: "Utilisez ce bouton pour charger une sauvegarde dans la chambre actuelle.", position: 'bottom-left' },
        { element: '#import-json-btn', text: "Ce bouton vous permet d'importer un fichier JSON.", position: 'bottom-left' },
        { element: '#export-json-btn', text: "Et celui-ci vous permet d'exporter le dossier actuel en fichier .json.", position: 'bottom-left' },
        { element: '#clear-current-patient-btn', text: "Ce bouton efface les données de la chambre actuelle.", position: 'bottom-left' },
        { element: '#account-management-btn', text: "C'est ici que le formateur gère son compte, peut créer des comptes étudiants et définir leurs permissions.", position: 'top' },
        { element: 'button[id="clear-all-data-btn"]', text: "ATTENTION : Ce bouton réinitialise les 10 chambres du service.", position: 'top' },
        { element: 'button[id="start-tutorial-btn"]', text: "Vous avez terminé ! Vous pouvez relancer ce tutoriel à tout moment.", position: 'top' }
    ];
    // FIN MODIFICATION

    function startTutorial() {
        currentStepIndex = 0;

        const firstPatientButton = document.querySelector('#patient-list li:first-child button');
        if (!firstPatientButton) {
            tutorialSteps[0].element = '#sidebar';
            tutorialSteps[0].text = "Bienvenue ! Voici la barre latérale où les patients apparaîtront.";
        } else {
            tutorialSteps[0].element = '#patient-list li:first-child button';
            tutorialSteps[0].text = "Bienvenue ! Voici la liste des patients. Cliquez sur un patient pour ouvrir son dossier.";
        }

        tutorialOverlay.classList.remove('hidden');
        showTutorialStep(currentStepIndex);
    }

    function endTutorial(setFlag = false) {
        tutorialOverlay.classList.add('hidden');
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlight');
            if (highlightedElement.closest('#header-buttons') || highlightedElement.id === 'save-status-button') {
                highlightedElement.style = '';
            }
            highlightedElement = null;
        }
        if (setFlag) {
            localStorage.setItem('tutorialCompleted', 'true');
        }
    }

    function showTutorialStep(index) {
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlight');
            if (highlightedElement.closest('#header-buttons') || highlightedElement.id === 'save-status-button') {
                highlightedElement.style = '';
            }
        }

        if (index >= tutorialSteps.length) {
            endTutorial(true);
            return;
        }

        const step = tutorialSteps[index];
        const element = document.querySelector(step.element);

        if (!element) {
            currentStepIndex++;
            showTutorialStep(currentStepIndex);
            return;
        }

        tutorialText.textContent = step.text;
        tutorialNextBtn.textContent = (index === tutorialSteps.length - 1) ? "Terminer" : "Suivant";

        element.classList.add('tutorial-highlight');
        highlightedElement = element;

        if (element.closest('#header-buttons') || element.id === 'save-status-button') {
            element.style.setProperty('z-index', '9997', 'important');
            element.style.setProperty('position', 'relative', 'important');
        }

        const rect = element.getBoundingClientRect();
        const boxRect = tutorialStepBox.getBoundingClientRect();
        const margin = 15;
        let top, left;

        switch (step.position) {
            case 'right':
                top = rect.top + (rect.height / 2) - (boxRect.height / 2);
                left = rect.right + margin;
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (boxRect.height / 2);
                left = rect.left - boxRect.width - margin;
                break;
            case 'top':
                top = rect.top - boxRect.height - margin;
                left = rect.left + (rect.width / 2) - (boxRect.width / 2);
                break;
            case 'bottom-left':
                top = rect.bottom + margin;
                left = rect.right - boxRect.width;
                break;
            default: // bottom
                top = rect.bottom + margin;
                left = rect.left + (rect.width / 2) - (boxRect.width / 2);
        }

        if (top < margin) top = margin;
        if (left < margin) left = margin;
        if (top + boxRect.height > window.innerHeight - margin) top = window.innerHeight - boxRect.height - margin;
        if (left + boxRect.width > window.innerWidth - margin) left = window.innerWidth - boxRect.width - margin;

        tutorialStepBox.style.top = `${top}px`;
        tutorialStepBox.style.left = `${left}px`;
    }


    // --- Exposition du service ---

    window.uiService = {
        // Initialisation
        initUIComponents,
        initializeDynamicTables,
        setupModalListeners,

        // Permissions
        applyPermissions,

        // Sidebar
        initSidebar,
        updateSidebarActiveState,
        updateSidebarEntryName,

        // Remplissage de formulaire
        resetForm,
        fillFormFromState,
        fillListsFromState,
        fillCareDiagramFromState,
        fillPrescriptionsFromState,
        fillBioFromState,
        fillPancarteFromState,
        fillCrCardsFromState,

        // Mises à jour UI
        updateAgeDisplay,
        updateJourHosp,
        calculateAndDisplayIMC,
        setupSync,
        updateDynamicDates,
        refreshAllRelativeDates,
        updateSaveStatus,

        // Navigation & Modales
        changeTab,
        autoResize,
        toggleFullscreen,
        showToast, // NOUVEAU : Exposer le toast
        showDeleteConfirmation,
        showCustomAlert, // Gardé pour les alertes bloquantes
        hideConfirmation,
        openLoadPatientModal,
        hideLoadPatientModal,

        // Tri
        toggleSort,

        // Fonctions d'ajout/lecture de formulaire
        readObservationForm,
        addObservation,
        readTransmissionForm,
        addTransmission,
        readPrescriptionForm,
        addPrescription,
        readCareDiagramForm,
        addCareDiagramRow,

        // Suppression d'entrées
        deleteEntry,
        deletePrescription,
        deleteCareDiagramRow,

        // Logique Comptes Rendus (CR)
        openCrModal,
        closeCrModal,
        updateCrCardCheckmark,

        // Logique IV
        handleIVMouseDown,
        handleIVMouseMove,
        handleIVMouseUp,

        // Graphique
        updatePancarteChart,

        // Tutoriel
        startTutorial,
        endTutorial,
        showTutorialStep,
        incrementTutorialStep: () => { currentStepIndex++; showTutorialStep(currentStepIndex); }
    };

})();