(function() {
    "use strict";

    // --- État de l'application ---
    let userPermissions = {}; 
    let patientList = []; 
    let activePatientId = null;
    let currentPatientState = {};
    let isLoadingData = false;
    let saveTimeout;
    let socket = null;

    /**
     * Lit TOUS les champs de l'interface utilisateur et les assemble
     * en un seul objet 'dossierData'.
     */
    function collectPatientStateFromUI() {
        const state = {};
        const entryDateStr = document.getElementById('patient-entry-date').value;

        // 1. Inputs simples
        document.querySelectorAll('input[id], textarea[id]').forEach(el => {
            if (el.id.startsWith('new-') || el.id.startsWith('cr-modal-') || el.type === 'file') {
                return;
            }
            const id = el.id;
            if (el.type === 'checkbox' || el.type === 'radio') { state[id] = el.checked; } 
            else { state[id] = el.value; }
        });

        // 2. Observations
        state.observations = [];
        document.querySelectorAll('#observations-list .timeline-item').forEach(item => {
            state.observations.push({
                author: item.dataset.author || '',
                text: item.dataset.text || '',
                dateOffset: parseInt(item.dataset.dateOffset, 10) || 0
            });
        });

        // 3. Transmissions
        state.transmissions = [];
        document.querySelectorAll('#transmissions-list-ide .timeline-item').forEach(item => {
            state.transmissions.push({
                author: item.dataset.author || '',
                text: item.dataset.text || '',
                dateOffset: parseInt(item.dataset.dateOffset, 10) || 0
            });
        });
        
        // 4. Comptes Rendus
        state.comptesRendus = currentPatientState.comptesRendus || {};

        // 5. Diagramme de Soins
        state.careDiagramRows = [];
        document.querySelectorAll('#care-diagram-tbody tr').forEach(row => {
            const nameSpan = row.querySelector('td:first-child span');
            if (nameSpan) {
                state.careDiagramRows.push({ name: nameSpan.textContent.trim() });
            }
        });
        state.careDiagramCheckboxes = Array.from(document.querySelectorAll('#care-diagram-tbody input[type="checkbox"]')).map(cb => cb.checked);

        // 6. Biologie
        const bioData = { dateOffsets: [], analyses: {} };
        document.querySelectorAll('#bio-table thead input[type="date"]').forEach(input => {
            const offset = utils.calculateDaysOffset(entryDateStr, input.value);
            bioData.dateOffsets.push(offset);
            input.dataset.dateOffset = offset;
        });
        document.querySelectorAll('#bio-table tbody tr').forEach(row => {
            if (row.cells.length > 1 && row.cells[0].classList.contains('font-semibold')) { 
                const analyseName = row.cells[0].textContent.trim();
                if (analyseName) {
                    bioData.analyses[analyseName] = [];
                    row.querySelectorAll('input[type="text"]').forEach(input => bioData.analyses[analyseName].push(input.value));
                }
            }
        });
        state.biologie = bioData;
        
        // 7. Pancarte & Glycémie
        const pancarteTableData = {};
        document.querySelectorAll('#pancarte-table tbody tr').forEach(row => {
            const paramName = row.cells[0].textContent.trim();
            if (paramName) {
                pancarteTableData[paramName] = [];
                row.querySelectorAll('input').forEach(input => pancarteTableData[paramName].push(input.value));
            }
        });
        state.pancarte = pancarteTableData;
        
        const glycemieTableData = {};
        document.querySelectorAll('#glycemie-table tbody tr').forEach(row => {
            const paramName = row.cells[0].textContent.trim();
             if (paramName) {
                glycemieTableData[paramName] = [];
                row.querySelectorAll('input').forEach(input => glycemieTableData[paramName].push(input.value));
            }
        });
        state.glycemie = glycemieTableData;

        // 8. Prescriptions
        state.prescriptions = [];
        document.querySelectorAll('#prescription-tbody tr').forEach(row => {
            state.prescriptions.push({
                name: row.cells[0].querySelector('span').textContent,
                posologie: row.cells[1].textContent,
                voie: row.cells[2].textContent,
                dateOffset: parseInt(row.dataset.dateOffset, 10) || 0,
                type: row.dataset.type,
                bars: Array.from(row.querySelectorAll('.iv-bar')).map(bar => ({ 
                    left: bar.style.left, 
                    width: bar.style.width, 
                    title: bar.title 
                }))
            });
        });
        
        // 9. Nom
        const nomUsage = document.getElementById('patient-nom-usage').value.trim();
        const prenom = document.getElementById('patient-prenom').value.trim();
        state['sidebar_patient_name'] = `${nomUsage} ${prenom}`.trim();

        return state;
    }
    
    function loadPatientDataIntoUI(state) {
        const entryDateStr = state['patient-entry-date'] || '';
        
        uiService.fillFormFromState(state);
        uiService.fillListsFromState(state, entryDateStr);
        uiService.fillCareDiagramFromState(state);
        uiService.fillPrescriptionsFromState(state, entryDateStr);
        uiService.fillBioFromState(state, entryDateStr);
        uiService.fillPancarteFromState(state);
        uiService.fillCrCardsFromState(state.comptesRendus); 
        
        uiService.updateAgeDisplay();
        uiService.updateJourHosp(); 
        uiService.calculateAndDisplayIMC();
        uiService.updatePancarteChart();
        
        if (entryDateStr) {
            uiService.updateDynamicDates(new Date(entryDateStr));
        }
    }

    // --- Fonctions de Service ---

    function initializeSocket() {
        socket = apiService.connectSocket();
        if (!socket) {
            console.error("Échec de la connexion au socket, le temps réel est désactivé.");
            return;
        }

        socket.on('patient_updated', (data) => {
            console.log("Événement 'patient_updated' reçu :", data);
            if (data.patientId !== activePatientId) {
                if (data.dossierData.sidebar_patient_name) {
                     uiService.updateSidebarEntryName(data.patientId, data.dossierData.sidebar_patient_name);
                }
                return;
            }
            if (data.sender === socket.id) return;

            currentPatientState = data.dossierData;
            isLoadingData = true;
            loadPatientDataIntoUI(currentPatientState);
            uiService.updateSidebarEntryName(activePatientId, currentPatientState.sidebar_patient_name);
            uiService.updateSaveStatus('saved');
            uiService.showToast("Dossier mis à jour en temps réel.", 'success');
            
            setTimeout(() => { isLoadingData = false; }, 500);
        });

        // NOUVEAU : Écouteur pour la liste des étudiants
        socket.on('room_users_update', (students) => {
            // Sécurité côté client : on n'affiche le widget que pour les formateurs/owners
            if (userPermissions.role === 'formateur' || userPermissions.role === 'owner' || userPermissions.isSuperAdmin) {
                // Initialiser le widget s'il n'est pas déjà prêt
                const widget = document.getElementById('connected-students-widget');
                if (widget && !widget.dataset.initialized) {
                    uiService.initStudentWidget();
                    widget.dataset.initialized = "true";
                }
                uiService.updateConnectedStudentsList(students);
            }
        });
    }

    async function initialize() {
        try {
            const userData = await apiService.fetchUserPermissions();
            
            // Abonnement et Rôle viennent du serveur
            userPermissions.subscription = userData.effectivePlan || userData.subscription || 'free';
            userPermissions.allowedRooms = userData.allowedRooms || []; 
            userPermissions.isSuperAdmin = userData.is_super_admin || false;

            // --- CORRECTION CRITIQUE ---
            // On vérifie UNIQUEMENT le rôle. 
            // Même si permissions est vide (cas d'un nouvel étudiant), on force le statut étudiant.
            if (userData.role === 'etudiant') {
                const perms = userData.permissions || {};
                userPermissions = { ...userPermissions, ...perms, isStudent: true, role: 'etudiant' };
                userPermissions.isSuperAdmin = false;

                patientList = userPermissions.allowedRooms
                    .map(roomId => ({ id: roomId, room: roomId.split('_')[1] }))
                    .sort((a, b) => a.room.localeCompare(b.room));
            } else {
                // Pour les autres (user, formateur, owner)
                let role = userData.role || 'user';
                
                userPermissions = { 
                    ...userPermissions, 
                    isStudent: false, role: role, 
                    header: true, admin: true, vie: true, observations: true, 
                    prescriptions_add: true, prescriptions_delete: true, prescriptions_validate: true,
                    transmissions: true, pancarte: true, diagramme: true, biologie: true,
                    comptesRendus: true
                };
                patientList = Array.from({ length: 10 }, (_, i) => ({
                    id: `chambre_${101 + i}`,
                    room: `${101 + i}`
                }));
            }
        } catch (error) {
            console.error("Échec critique.", error);
            uiService.showCustomAlert("Erreur critique", "Impossible de charger les permissions.");
            return;
        }

        // Socket activé pour tout le monde sauf le strict 'user' (free)
        if (userPermissions.role !== 'user') {
            initializeSocket();
        }

        uiService.applyPermissions(userPermissions);

        if (userPermissions.isStudent && patientList.length === 0) {
            document.getElementById('patient-list').innerHTML = '<li class="p-2 text-sm text-gray-500">Aucune chambre ne vous a été assignée.</li>';
            document.getElementById('main-content-wrapper').innerHTML = '<div class="p-8 text-center text-gray-600">Aucune chambre ne vous a été assignée.</div>';
            return false;
        }

        const storedPatientId = localStorage.getItem('activePatientId');
        if (storedPatientId && patientList.find(p => p.id === storedPatientId)) {
            activePatientId = storedPatientId;
        } else {
            activePatientId = patientList[0].id;
        }

        await loadPatientList();
        await switchPatient(activePatientId, true); 
        return true; 
    }
    
    async function loadPatientList() {
        let patientMap = new Map();
        // Charge les noms pour ceux qui ne sont pas 'user' (car 'user' ne sauvegarde pas, donc pas de noms persistants)
        if (userPermissions.role !== 'user') {
            try {
                const allPatients = await apiService.fetchPatientList();
                allPatients.forEach(p => {
                    if (p.patientId.startsWith('chambre_')) {
                        patientMap.set(p.patientId, p.sidebar_patient_name);
                    }
                });
            } catch (error) { console.error(error); }
        }
        uiService.initSidebar(patientList, patientMap);
    }
    
    async function switchPatient(newPatientId, skipSave = false) {
        if (!skipSave && activePatientId) {
            await saveCurrentPatientData();
        }
        
        isLoadingData = true;
        activePatientId = newPatientId;
        localStorage.setItem('activePatientId', newPatientId); 
        
        uiService.resetForm(); 
        
        try {
            currentPatientState = await apiService.fetchPatientData(newPatientId);
        } catch (error) {
            currentPatientState = {}; 
        }
        
        loadPatientDataIntoUI(currentPatientState);
        uiService.updateSidebarActiveState(newPatientId);
        document.getElementById('main-content-wrapper').scrollTo({ top: 0, behavior: 'smooth' });
        uiService.applyPermissions(userPermissions);
        isLoadingData = false;
        uiService.updateSaveStatus('saved');
    }
    
    async function saveCurrentPatientData() {
        if (isLoadingData || !activePatientId) return;
        
        // --- LOGIQUE SIMPLIFIÉE ---
        // Seul le rôle 'user' (Free) est bloqué.
        if (userPermissions.role === 'user') return;

        uiService.updateSaveStatus('saving');
        const state = collectPatientStateFromUI();
        currentPatientState = state; 
        
        try {
            await apiService.saveChamberData(activePatientId, state, state.sidebar_patient_name);
            uiService.updateSidebarEntryName(activePatientId, state.sidebar_patient_name);
            uiService.updateSaveStatus('saved');
        } catch (error) {
            uiService.updateSaveStatus('dirty');
            uiService.showToast("Erreur de sauvegarde.", 'error');
        }
    }
    
    function debouncedSave() {
        if (!isLoadingData) uiService.updateSaveStatus('dirty');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => { saveCurrentPatientData(); }, 500); 
    }
    
    async function forceSaveAndRefresh() {
        if (!activePatientId) return;
        isLoadingData = false; 
        clearTimeout(saveTimeout); 
        await saveCurrentPatientData();
        uiService.updateSaveStatus('saving'); 
        setTimeout(async () => {
            await switchPatient(activePatientId, true); 
            uiService.showToast("Dossier synchronisé.");
        }, 250);
    }

    async function saveCurrentPatientAsCase() {
        // Sauvegarde archive : Interdit aux 'user' (free) et 'etudiant'
        if (userPermissions.role === 'user' || userPermissions.role === 'etudiant') return;
        
        const state = collectPatientStateFromUI();
        const patientName = state.sidebar_patient_name;
        if (!patientName || patientName.startsWith('Chambre ')) {
            uiService.showCustomAlert("Sauvegarde impossible", "Veuillez d'abord donner un Nom et un Prénom au patient.");
            return;
        }
        try {
            await apiService.saveCaseData(state, patientName);
            uiService.showToast(`Dossier "${patientName}" sauvegardé.`);
        } catch (error) { 
            // [MODIFICATION] Gestion du dossier public protégé
            if (error.message.includes("Dossier public protégé")) {
                uiService.showCustomAlert("Sauvegarde Impossible", "Ce nom correspond à un dossier public protégé.\n\nVeuillez modifier le nom du patient (Nom d'usage/Prénom) pour l'enregistrer comme une nouvelle copie personnelle.");
            } else {
                uiService.showToast(error.message, 'error'); 
            }
        }
    }
    
    async function openLoadPatientModal() {
        if (userPermissions.role === 'user' || userPermissions.role === 'etudiant') return;
        
        let savedPatients = [];
        try {
            const allPatients = await apiService.fetchPatientList();
            // [MODIFICATION] On ne montre que les dossiers PRIVES (ceux de l'utilisateur)
            savedPatients = allPatients.filter(p => p.patientId.startsWith('save_') && !p.isPublic);
        } catch (error) { uiService.showCustomAlert("Erreur", "Impossible de charger les dossiers."); }
        uiService.openLoadPatientModal(savedPatients);
    }

    // [NOUVEAU] Fonction pour ouvrir la bibliothèque publique
    async function openPublicLibrary() {
        if (userPermissions.role === 'etudiant') return;
        
        try {
            const allPatients = await apiService.fetchPatientList();
            // Filtrer uniquement les dossiers publics
            const publicPatients = allPatients.filter(p => p.isPublic === true);
            uiService.showPublicLibraryModal(publicPatients);
        } catch (error) {
            uiService.showToast("Erreur chargement bibliothèque.", 'error');
        }
    }
    
    async function loadCaseIntoCurrentPatient(patientIdToLoadFrom, patientName) {
        const roomToLoadInto = activePatientId.split('_')[1];
        uiService.showDeleteConfirmation(`Écraser la chambre ${roomToLoadInto} avec "${patientName}" ?`, async () => {
            try {
                const dossierToLoad = await apiService.fetchPatientData(patientIdToLoadFrom);
                const patientName = dossierToLoad.sidebar_patient_name;
                await apiService.saveChamberData(activePatientId, dossierToLoad, patientName);
                uiService.hideLoadPatientModal();
                await switchPatient(activePatientId, true); 
                await loadPatientList(); 
                uiService.showToast(`Dossier "${patientName}" chargé.`);
            } catch (err) { uiService.showToast(err.message, 'error'); }
        });
    }

    // [NOUVEAU] Chargement d'un cas public
    async function loadPublicCaseIntoCurrentPatient(patientIdToLoadFrom, patientName) {
        const roomToLoadInto = activePatientId.split('_')[1];
        uiService.showDeleteConfirmation(`Importer le cas public "${patientName}" dans la chambre ${roomToLoadInto} ?\n(Cela écrasera les données actuelles)`, async () => {
            try {
                const dossierToLoad = await apiService.fetchPatientData(patientIdToLoadFrom);
                // On utilise le nom du patient inclus dans le dossier
                const finalName = dossierToLoad.sidebar_patient_name || patientName;
                await apiService.saveChamberData(activePatientId, dossierToLoad, finalName);
                uiService.hidePublicLibraryModal();
                await switchPatient(activePatientId, true); 
                await loadPatientList(); 
                uiService.showToast(`Cas public "${finalName}" chargé.`);
            } catch (err) { 
                uiService.showToast("Erreur lors du chargement.", 'error');
                console.error(err);
            }
        });
    }

    async function deleteCase(patientIdToDelete, patientName) {
        uiService.showDeleteConfirmation(`Supprimer définitivement "${patientName}" ?`, async () => {
            try {
                await apiService.deleteSavedCase(patientIdToDelete);
                await openLoadPatientModal(); 
            } catch (err) { uiService.showToast(err.message, 'error'); }
        });
    }

    async function importPatientData(jsonData) {
        if (userPermissions.role === 'user' || userPermissions.role === 'etudiant') return;
        
        try {
            const patientName = jsonData.sidebar_patient_name || `Chambre ${activePatientId.split('_')[1]}`;
            await apiService.saveChamberData(activePatientId, jsonData, patientName);
            await switchPatient(activePatientId, true); 
            await loadPatientList();
            uiService.showToast(`Import réussi.`);
        } catch (error) { uiService.showToast(error.message, 'error'); }
    }
    
    function exportPatientData() {
        if (!userPermissions.isSuperAdmin) {
            uiService.showToast("Réservé au Super Admin.", 'error');
            return;
        }

        const state = collectPatientStateFromUI();
        const patientName = state.sidebar_patient_name;
        let fileName = "dossier.json";
        if (patientName) {
            const nomUsage = document.getElementById('patient-nom-usage').value.trim();
            const prenom = document.getElementById('patient-prenom').value.trim();
            fileName = `${nomUsage}_${prenom}.json`.replace(/[^a-z0-9_.]/gi, '_');
        }
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }
    
    function clearCurrentPatient() {
        if (userPermissions.role === 'etudiant') return;
        
        uiService.showDeleteConfirmation(`Effacer la chambre ${activePatientId.split('_')[1]} ?`, async () => {
            currentPatientState = {}; 
            uiService.resetForm();

            // Bloqué pour 'user'
            if (userPermissions.role === 'user') return;

            try {
                uiService.updateSaveStatus('saving');
                await apiService.saveChamberData(activePatientId, {}, `Chambre ${activePatientId.split('_')[1]}`);
                uiService.updateSidebarEntryName(activePatientId, `Chambre ${activePatientId.split('_')[1]}`);
                uiService.updateSaveStatus('saved');
            } catch (err) {
                uiService.showToast("Erreur réinitialisation.", 'error');
                uiService.updateSaveStatus('dirty'); 
            }
        });
    }

    function clearAllPatients() {
        if (userPermissions.role === 'etudiant') return;
        
        uiService.showDeleteConfirmation("Réinitialiser les 10 chambres ?", async () => {
            currentPatientState = {};
            uiService.resetForm();

            // Bloqué pour 'user'
            if (userPermissions.role === 'user') return;

            try {
                uiService.updateSaveStatus('saving');
                const allChamberIds = patientList.map(p => p.id);
                await apiService.clearAllChamberData(allChamberIds);
                await loadPatientList(); 
                uiService.showToast("Service réinitialisé.");
                uiService.updateSaveStatus('saved');
            } catch (err) {
                 uiService.showToast("Erreur.", 'error');
                 uiService.updateSaveStatus('dirty');
            }
        });
    }

    function getCrText(crId) {
        return (currentPatientState.comptesRendus && currentPatientState.comptesRendus[crId]) || '';
    }

    function handleCrModalSave(crId, crText) {
        if (!currentPatientState.comptesRendus) currentPatientState.comptesRendus = {};
        currentPatientState.comptesRendus[crId] = crText;
        uiService.updateCrCardCheckmark(crId, crText && crText.trim() !== '');
        uiService.closeCrModal();
        debouncedSave(); 
    }
    
    window.patientService = {
        initialize, switchPatient, getActivePatientId: () => activePatientId,
        getPatientList: () => patientList, getUserPermissions: () => userPermissions,
        debouncedSave, forceSaveAndRefresh, saveCurrentPatientAsCase, openLoadPatientModal,
        loadCaseIntoCurrentPatient, deleteCase, importPatientData, exportPatientData,
        clearCurrentPatient, clearAllPatients, getCrText, handleCrModalSave,
        // [NOUVEAU] Exports pour la Bibliothèque Publique
        openPublicLibrary, loadPublicCaseIntoCurrentPatient
    };
})();