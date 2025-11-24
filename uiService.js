(function() {
    "use strict";

    // --- Variables d'état de l'UI ---
    let pancarteChartInstance;
    
    // Références pour les modales
    let loadPatientModal, loadPatientBox, loadPatientListContainer;
    let confirmModal, confirmModalBox, confirmTitle, confirmMessage, confirmCancelBtn, confirmOkBtn;
    let crModal, crModalBox, crModalTitle, crModalTextarea, crModalSaveBtn, crModalCloseBtn, crModalActiveIdInput;

    // Références pour le bouton de statut
    let saveStatusButton, saveStatusIcon, saveStatusText;

    // Références pour le Toast
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
    const nfsData = { "Hématies (T/L)": "4.5-5.5", "Hémoglobine (g/dL)": "13-17", "Hématocrite (%)": "40-52", "VGM (fL)": "80-100", "Leucocytes (G/L)": "4-10", "Plaquettes (G/L)": "150-400" };
    const ionoData = { "Sodium (mmol/L)": "136-145", "Potassium (mmol/L)": "3.5-5.1", "Chlore (mmol/L)": "98-107", "Bicarbonates (mmol/L)": "22-29", "Urée (mmol/L)": "2.8-7.2", "Créatinine (µmol/L)": "62-106" };
    const hepatiqueData = { "ASAT (UI/L)": "< 40", "ALAT (UI/L)": "< 41", "Gamma-GT (UI/L)": "11-50", "PAL (UI/L)": "40-129", "Bilirubine totale (µmol/L)": "5-21" };
    const lipidiqueData = { "Cholestérol total (g/L)": "< 2.0", "Triglycérides (g/L)": "< 1.5", "HDL Cholestérol (g/L)": "> 0.4", "LDL Cholestérol (g/L)": "< 1.6" };
    const gdsData = { "pH": "7.35-7.45", "PaCO2 (mmHg)": "35-45", "PaO2 (mmHg)": "80-100", "HCO3- (mmol/L)": "22-26", "SaO2 (%)": "> 95" };
    const inflammationData = { "CRP (mg/L)": "< 5" };
    const pancarteData = {
        'Pouls (/min)': [], 
        'Tension (mmHg)': [], 
        'Température (°C)': [], 
        'SpO2 (%)': [], 
        'Douleur (EVA /10)': [],
        'Poids (kg)': [],
        'Diurèse (L)': []
    };
    const glycemieData = {
        'Glycémie (g/L)': []
    };
    
    // --- Fonctions d'initialisation de l'UI ---

    function initUIComponents() {
        // Modale de confirmation
        confirmModal = document.getElementById('custom-confirm-modal');
        confirmModalBox = document.getElementById('custom-confirm-box');
        confirmTitle = document.getElementById('custom-confirm-title');
        confirmMessage = document.getElementById('custom-confirm-message');
        confirmCancelBtn = document.getElementById('custom-confirm-cancel');
        confirmOkBtn = document.getElementById('custom-confirm-ok');
        
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

        // Toast
        toastElement = document.getElementById('toast-notification');
        toastIcon = document.getElementById('toast-icon');
        toastText = document.getElementById('toast-text');

        // Écouteur pour le champ allergie
        const allergyInput = document.getElementById('atcd-allergies');
        if (allergyInput) {
            allergyInput.addEventListener('input', checkAllergyStatus);
        }
    }

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

    function getDefaultForCareDiagramTbody() {
        return ``; 
    }

    function initializeDynamicTables() {
        let html = '';

        // --- PRESCRIPTIONS ---
        const prescriptionThead = document.getElementById('prescription-thead');
        if (prescriptionThead) {
            html = '<tr><th class="p-2 text-left align-bottom min-w-[220px]" rowspan="2">Médicament / Soin</th><th class="p-2 text-left align-bottom min-w-[144px]" rowspan="2">Posologie</th><th class="p-2 text-left align-bottom min-w-[96px]" rowspan="2">Voie</th><th class="p-2 text-left align-bottom" rowspan="2" style="min-width: 100px;">Date de début</th>';
            for(let i=0; i<11; i++) { html += `<th class="p-2 text-center" colspan="8">Jour ${i}</th>`;}
            html += '</tr><tr>';
            const hours = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h'];
            for(let i=0; i<11; i++) { 
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
            for(let i=0; i<6; i++) {
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
            for(let i=0; i<11; i++) { html += `<th class="p-2 text-center" colspan="3">Jour ${i}</th>`;}
            html += '</tr><tr>';
            for(let i=0; i<11; i++) { 
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
                    for(let i=0; i<11; i++) {
                        html += `<td class="p-0" style="min-width: 70px;">${inputHtml}</td>`;
                        html += `<td class="p-0 bg-gray-100" colspan="2"></td>`;
                    }
                } else {
                    for(let i=0; i<33; i++) {
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
            for(let i=0; i<11; i++) { html += `<th class="p-2 text-center" colspan="3">Jour ${i}</th>`;}
            html += '</tr><tr>';
            for(let i=0; i<11; i++) { 
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
                for(let i=0; i<33; i++) {
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
            for(let i=0; i<11; i++) { html += `<th colspan="3" class="border-l">Jour ${i}</th>`;}
            html += '</tr><tr><th class="min-w-[220px]"></th>';
            const msn = ['Matin', 'Soir', 'Nuit'];
            for(let i=0; i<11; i++) { 
                for (let j = 0; j < msn.length; j++) { 
                    const borderClass = (j === 0) ? 'border-l' : '';
                    html += `<th class="${borderClass} p-1 text-center" style="min-width: 70px;">${msn[j]}</th>`;
                }
            }
            html += '</tr>';
            careDiagramThead.innerHTML = html;
        }
    }

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
        
        // Modale des comptes rendus
        crModalCloseBtn.addEventListener('click', closeCrModal);
    }


    // --- Fonctions de Gestion de l'UI (Permissions) ---

    function disableSectionInputs(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
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

        const studentForbiddenButtons = [
            '#save-patient-btn', '#load-patient-btn', '#import-json-btn',
            '#export-json-btn', '#clear-current-patient-btn', '#clear-all-data-btn',
            '#account-management-btn'
        ];
        studentForbiddenButtons.forEach(selector => {
            const btn = document.querySelector(selector);
            if (btn) btn.style.display = 'none';
        });

        if (!userPermissions.header) disableSectionInputs('patient-header-form');
        if (!userPermissions.admin) disableSectionInputs('administratif');
        if (!userPermissions.vie) disableSectionInputs('mode-de-vie');
        
        if (!userPermissions.observations) {
            const form = document.getElementById('new-observation-form');
            if (form) form.style.display = 'none';
        }
        if (!userPermissions.transmissions) {
            const form = document.getElementById('new-transmission-form-2');
            if (form) form.style.display = 'none';
        }
        if (!userPermissions.comptesRendus) {
            crModalSaveBtn.style.display = 'none';
        }
        if (!userPermissions.prescriptions_add) {
            const form = document.getElementById('new-prescription-form');
            if (form) form.style.display = 'none';
        }
        if (!userPermissions.diagramme) {
            const form = document.getElementById('new-care-form');
            if (form) form.style.display = 'none';
        }
        if (!userPermissions.pancarte) {
            document.querySelectorAll('#pancarte-table input, #glycemie-table input').forEach(el => el.disabled = true);
        }
        if (!userPermissions.biologie) {
            document.querySelectorAll('#bio-table input').forEach(el => el.disabled = true);
        }
    }

    // --- Fonctions de Gestion de l'UI (Sidebar) ---

    function initSidebar(patients, patientMap) {
        const list = document.getElementById('patient-list');
        let listHTML = '';
        
        patients.forEach(patient => {
            const patientName = patientMap.get(patient.id) || `Chambre ${patient.room}`;
            listHTML += `
                <li class="mb-1">
                    <button type="button" data-patient-id="${patient.id}">
                        <span class="patient-icon"><i class="fas fa-bed"></i></span>
                        <span class="patient-name">${patientName}</span>
                        <span class="patient-room">${patient.room}</span>
                    </button>
                </li>`;
        });
        list.innerHTML = listHTML;
    }

    function updateSidebarActiveState(patientId) {
        document.querySelectorAll('#patient-list button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.patientId === patientId) {
                btn.classList.add('active');
            }
        });
    }

    function updateSidebarEntryName(patientId, patientName) {
        const sidebarEntry = document.querySelector(`#patient-list button[data-patient-id="${patientId}"] .patient-name`);
        if (sidebarEntry) {
            sidebarEntry.textContent = patientName || `Chambre ${patientId.split('_')[1]}`;
        }
    }

    // --- Fonctions de Gestion de l'UI (Formulaires & Données) ---

    function resetForm() {
        document.querySelectorAll('#patient-header-form input, #patient-header-form textarea, main input, main textarea, main select').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
            else if (el.tagName.toLowerCase() === 'select') el.selectedIndex = 0; 
            else if (el.type !== 'file') el.value = '';
        });
        ['observations-list', 'transmissions-list-ide', 'prescription-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        
        document.querySelectorAll('#cr-card-grid .cr-check-icon').forEach(icon => {
            icon.classList.add('hidden');
        });

        const careDiagramTbody = document.getElementById('care-diagram-tbody');
        if (careDiagramTbody) {
            careDiagramTbody.innerHTML = getDefaultForCareDiagramTbody();
        }
        document.querySelectorAll('#bio-table thead input[type="date"]').forEach(input => {
            input.value = '';
            delete input.dataset.dateOffset;
        });
        
        document.getElementById('glycemie-tbody').innerHTML = '';
        document.getElementById('pancarte-tbody').innerHTML = '';
        
        checkAllergyStatus();

        initializeDynamicTables();

        calculateAndDisplayIMC();
        if (pancarteChartInstance) pancarteChartInstance.destroy();
        updateSaveStatus('saved');
    }

    function fillFormFromState(state) {
        Object.keys(state).forEach(id => {
            if (['observations', 'transmissions', 'comptesRendus', 'biologie', 'pancarte', 'glycemie', 'prescriptions', 'lockButtonStates', 'careDiagramCheckboxes'].includes(id) || id.endsWith('_html')) {
                return;
            }
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox' || el.type === 'radio') { el.checked = state[id]; } 
                else { el.value = state[id]; }
            }
        });
        setTimeout(() => {
            document.querySelectorAll('textarea.info-value').forEach(autoResize);
            checkAllergyStatus();
        }, 0);
    }

    function fillListsFromState(state, entryDateStr) {
        const obsList = document.getElementById('observations-list');
        obsList.innerHTML = ''; 
        if (state.observations) {
            state.observations.forEach(obsData => {
                let dateOffset = obsData.dateOffset;
                let formattedDate;

                if (dateOffset === undefined && obsData.date) {
                    dateOffset = utils.calculateDaysOffset(entryDateStr, obsData.date);
                    formattedDate = utils.formatDate(new Date(obsData.date + 'T00:00:00'));
                } else {
                    const targetDate = utils.calculateDateFromOffset(entryDateStr, dateOffset);
                    formattedDate = utils.formatDate(targetDate);
                }
                
                addObservation({ ...obsData, dateOffset: dateOffset, formattedDate: formattedDate }, true);
            });
            applySort('observations');
        }

        const transList = document.getElementById('transmissions-list-ide');
        transList.innerHTML = ''; 
        if (state.transmissions) {
            state.transmissions.forEach(transData => {
                let dateOffset = transData.dateOffset;
                let formattedDate;

                if (dateOffset === undefined && transData.date) {
                    dateOffset = utils.calculateDaysOffset(entryDateStr, transData.date);
                    formattedDate = utils.formatDate(new Date(transData.date + 'T00:00:00'));
                } else {
                    const targetDate = utils.calculateDateFromOffset(entryDateStr, dateOffset);
                    formattedDate = utils.formatDate(targetDate);
                }
                
                addTransmission({ ...transData, dateOffset: dateOffset, formattedDate: formattedDate }, true);
            });
            applySort('transmissions');
        }
    }

    function fillCareDiagramFromState(state) {
        const careDiagramTbody = document.getElementById('care-diagram-tbody');
        if (careDiagramTbody && state['care-diagram-tbody_html']) {
            // Sécurisation des noms potentiels dans le HTML sauvegardé
            careDiagramTbody.innerHTML = DOMPurify.sanitize(state['care-diagram-tbody_html'], { 
                ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked', 'class', 'style'] 
            });
        } else if (careDiagramTbody) {
            careDiagramTbody.innerHTML = getDefaultForCareDiagramTbody();
        }
        if (state.careDiagramCheckboxes) {
            document.querySelectorAll('#care-diagram-tbody input[type="checkbox"]').forEach((cb, index) => {
                if (state.careDiagramCheckboxes[index] !== undefined) {
                    cb.checked = state.careDiagramCheckboxes[index];
                }
            });
        }
    }

    function fillPrescriptionsFromState(state, entryDateStr) {
        const prescrTbody = document.getElementById('prescription-tbody');
        prescrTbody.innerHTML = ''; 
        if (state.prescriptions) {
            state.prescriptions.forEach(pData => {
                let dateOffset = pData.dateOffset;

                if (dateOffset === undefined && pData.startDate) { 
                     let oldStartDate = pData.startDate;
                     if (oldStartDate.includes('/')) {
                         const parts = oldStartDate.split('/');
                         if (parts.length === 3) {
                             oldStartDate = `20${parts[2]}-${parts[1]}-${parts[0]}`;
                         }
                     }
                    dateOffset = utils.calculateDaysOffset(entryDateStr, oldStartDate);
                }
                
                if (pData.type === 'iv') pData.voie = 'IV';
                if (pData.type === 'checkbox') pData.voie = 'Per Os';
                
                addPrescription({ ...pData, dateOffset: dateOffset, type: pData.voie }, true); 
            });
        }
    }

    function fillBioFromState(state, entryDateStr) {
        if (state.biologie) {
            document.querySelectorAll('#bio-table thead input[type="date"]').forEach((input, index) => {
                let offset = undefined;
                
                if (state.biologie.dateOffsets && state.biologie
