(function() {
    "use strict";

    /**
     * Point d'entrée principal de l'application.
     * S'exécute lorsque le DOM est chargé.
     */
    async function initApp() {
        // [AJOUT] Sécurité : Si on n'est pas sur la page du simulateur (pas de sidebar), on ne fait rien.
        if (!document.getElementById('sidebar')) {
            return; 
        }

        // 1. Initialiser les composants UI (références DOM pour les modales, etc.)
        uiService.initUIComponents();
        uiService.setupModalListeners(); // Configure les boutons "OK/Annuler" des modales

        // 2. Initialiser le service patient (permissions, liste des patients, patient actif)
        // Note : initialize() utilise maintenant fetchWithCredentials (via apiService) pour s'authentifier via Cookie
        const initialized = await patientService.initialize();
        
        // 3. Si l'initialisation échoue (ex: étudiant sans chambre ou non connecté), arrêter ici.
        if (!initialized) {
            console.warn("Initialisation du patientService arrêtée ou session invalide.");
            // Les écouteurs de base (logout, etc.) sont quand même attachés pour permettre de quitter proprement
            setupBaseEventListeners();
            return;
        }

        // 4. Configurer tous les écouteurs d'événements principaux
        setupEventListeners();

        // 5. Charger le premier onglet (lu depuis localStorage ou défaut)
        const activeTabId = localStorage.getItem('activeTab') || 'administratif';
        uiService.changeTab(activeTabId);
        
        // 6. Démarrer le tutoriel si c'est la première visite (flag localStorage)
        if (!localStorage.getItem('tutorialCompleted')) {
            setTimeout(() => uiService.startTutorial(), 1000);
        }
    }

    /**
     * Configure les écouteurs de base (toujours actifs, même si l'init échoue).
     * Permet notamment la déconnexion même en cas de bug de chargement.
     */
    function setupBaseEventListeners() {
        // Gestion de la déconnexion
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // 1. Nettoyage des préférences UI locales
                localStorage.removeItem('activePatientId');
                localStorage.removeItem('activeTab');
                // Note: On ne touche pas manuellement à 'isLoggedIn' ici, 
                // c'est apiService.logout() qui s'en charge après l'appel serveur.
                
                // 2. Appel au service pour déconnexion serveur (Suppression du Cookie) et redirection
                await apiService.logout(); 
            });
        }

        // Gestion du bouton "Mon Compte" (désactivé pour les étudiants)
        const accountBtn = document.getElementById('account-management-btn');
        if (accountBtn) {
            accountBtn.addEventListener('click', (e) => {
                // On vérifie d'abord si patientService est initialisé avant d'accéder aux permissions
                if (window.patientService && patientService.getUserPermissions && patientService.getUserPermissions().isStudent) {
                    e.preventDefault();
                }
            });
        }

        // Gestion du plein écran
        const fullscreenBtn = document.getElementById('toggle-fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', uiService.toggleFullscreen);
        }
    }

    /**
     * Configure tous les écouteurs d'événements pour l'application principale.
     * N'est appelé que si l'utilisateur est correctement authentifié et initialisé.
     */
    function setupEventListeners() {
        
        // --- Écouteurs de base (redondance de sécurité) ---
        setupBaseEventListeners();
        
        // --- Header (Sauvegarde, Chargement, etc.) ---
        
        document.getElementById('start-tutorial-btn').addEventListener('click', () => uiService.startTutorial());
        
        document.getElementById('clear-all-data-btn').addEventListener('click', patientService.clearAllPatients);
        document.getElementById('save-patient-btn').addEventListener('click', patientService.saveCurrentPatientAsCase);
        document.getElementById('load-patient-btn').addEventListener('click', patientService.openLoadPatientModal);
        document.getElementById('export-json-btn').addEventListener('click', patientService.exportPatientData);
        document.getElementById('clear-current-patient-btn').addEventListener('click', patientService.clearCurrentPatient);

        // Bouton de statut/sauvegarde (Force la synchro)
        document.getElementById('save-status-button').addEventListener('click', patientService.forceSaveAndRefresh);

        // --- Importation de fichier (Restriction Super Admin) ---
        document.getElementById('import-json-btn').addEventListener('click', () => {
            if (patientService.getUserPermissions().isSuperAdmin) {
                document.getElementById('import-file').click();
            } else {
                uiService.showToast("Réservé au Super Admin", "error");
            }
        });
        
        document.getElementById('import-file').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    patientService.importPatientData(jsonData);
                } catch (error) {
                    uiService.showCustomAlert("Erreur de Fichier", `Le fichier n'est pas un JSON valide: ${error.message}`);
                }
            };
            reader.readAsText(file);
            event.target.value = ''; // Reset pour permettre de réimporter le même fichier
        });
        
        // --- Navigation (Onglets & Patients) ---
        document.getElementById('tabs-nav').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-tab-id]');
            if (button) {
                uiService.changeTab(button.dataset.tabId);
            }
        });
        
        document.getElementById('patient-list').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-patient-id]');
            if (button) {
                patientService.switchPatient(button.dataset.patientId);
            }
        });
        
        // --- Sauvegarde automatique (Debounce sur input/change) ---
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.addEventListener('input', patientService.debouncedSave);
            mainContent.addEventListener('change', patientService.debouncedSave);
        }

        const headerForm = document.getElementById('patient-header-form');
        if (headerForm) {
            headerForm.addEventListener('input', patientService.debouncedSave);
            headerForm.addEventListener('change', patientService.debouncedSave);
        }

        // --- Mises à jour auto de l'UI (Dates, IMC, Sync champs) ---
        const entryDateInput = document.getElementById('patient-entry-date');
        if (entryDateInput) {
            entryDateInput.addEventListener('input', () => {
                uiService.updateJourHosp();
                uiService.refreshAllRelativeDates();
            });
        }
        
        const dobInput = document.getElementById('patient-dob');
        if (dobInput) dobInput.addEventListener('input', uiService.updateAgeDisplay);
        
        const adminDobInput = document.getElementById('admin-dob');
        if (adminDobInput) adminDobInput.addEventListener('input', uiService.updateAgeDisplay);

        uiService.setupSync(); // Synchro Nom/Prénom/DDN entre Header et Admin
        
        const poidsInput = document.getElementById('vie-poids');
        if (poidsInput) poidsInput.addEventListener('input', uiService.calculateAndDisplayIMC);
        
        const tailleInput = document.getElementById('vie-taille');
        if (tailleInput) tailleInput.addEventListener('input', uiService.calculateAndDisplayIMC);

        // --- Boutons d'Ajout d'entrées (Observations, Trans, Prescr...) ---
        const addObsBtn = document.getElementById('add-observation-btn');
        if (addObsBtn) {
            addObsBtn.addEventListener('click', () => {
                const data = uiService.readObservationForm();
                if (data) {
                    uiService.addObservation(data, false);
                    patientService.debouncedSave();
                }
            });
        }

        const addTransBtn = document.getElementById('add-transmission-btn');
        if (addTransBtn) {
            addTransBtn.addEventListener('click', () => {
                const data = uiService.readTransmissionForm();
                if (data) {
                    uiService.addTransmission(data, false);
                    patientService.debouncedSave();
                }
            });
        }

        const addPrescBtn = document.getElementById('add-prescription-btn');
        if (addPrescBtn) {
            addPrescBtn.addEventListener('click', () => {
                const data = uiService.readPrescriptionForm();
                if (data) {
                    uiService.addPrescription(data, false);
                    patientService.debouncedSave();
                }
            });
        }

        const addCareBtn = document.getElementById('add-care-diagram-btn');
        if (addCareBtn) {
            addCareBtn.addEventListener('click', () => {
                const data = uiService.readCareDiagramForm();
                if (data) {
                    uiService.addCareDiagramRow(data);
                    patientService.debouncedSave();
                }
            });
        }
        
        // --- Boutons de tri ---
        const sortObsBtn = document.getElementById('sort-observations-btn');
        if (sortObsBtn) sortObsBtn.addEventListener('click', () => uiService.toggleSort('observations'));
        
        const sortTransBtn = document.getElementById('sort-transmissions-btn');
        if (sortTransBtn) sortTransBtn.addEventListener('click', () => uiService.toggleSort('transmissions'));

        // --- Suppression d'entrées (Délégation d'événements) ---
        const obsList = document.getElementById('observations-list');
        if (obsList) {
            obsList.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('button[title*="Supprimer"]');
                if (deleteBtn && !patientService.getUserPermissions().isStudent) {
                    uiService.showDeleteConfirmation("Êtes-vous sûr de vouloir supprimer cette entrée ?", () => {
                        if (uiService.deleteEntry(deleteBtn)) patientService.debouncedSave();
                    });
                }
            });
        }

        const transList = document.getElementById('transmissions-list-ide');
        if (transList) {
            transList.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('button[title*="Supprimer"]');
                if (deleteBtn && !patientService.getUserPermissions().isStudent) {
                    uiService.showDeleteConfirmation("Êtes-vous sûr de vouloir supprimer cette entrée ?", () => {
                        if (uiService.deleteEntry(deleteBtn)) patientService.debouncedSave();
                    });
                }
            });
        }

        const prescBody = document.getElementById('prescription-tbody');
        if (prescBody) {
            prescBody.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('button[title*="Supprimer"]');
                if (deleteBtn && !patientService.getUserPermissions().isStudent) {
                    uiService.showDeleteConfirmation("Êtes-vous sûr de vouloir supprimer cette prescription ?", () => {
                        if (uiService.deletePrescription(deleteBtn)) patientService.debouncedSave();
                    });
                }
            });
        }

        const careBody = document.getElementById('care-diagram-tbody');
        if (careBody) {
            careBody.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('button[title*="Supprimer"]');
                if (deleteBtn && !patientService.getUserPermissions().isStudent) {
                    uiService.showDeleteConfirmation("Êtes-vous sûr de vouloir supprimer ce soin ?", () => {
                        if (uiService.deleteCareDiagramRow(deleteBtn)) patientService.debouncedSave();
                    });
                }
            });
        }
        
        // --- Graphique Pancarte ---
        const pancarteBody = document.getElementById('pancarte-tbody');
        if (pancarteBody) {
            pancarteBody.addEventListener('change', (e) => {
                if (e.target.tagName === 'INPUT') uiService.updatePancarteChart();
            });
        }
        
        // --- Logique Comptes Rendus (Modale) ---
        const crGrid = document.getElementById('cr-card-grid');
        if (crGrid) {
            crGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.cr-card');
                if (!card) return;
                const crId = card.dataset.crId;
                const crTitle = card.dataset.crTitle;
                const crText = patientService.getCrText(crId);
                uiService.openCrModal(crId, crTitle, crText);
            });
        }
        
        const crSaveBtn = document.getElementById('cr-modal-save-btn');
        if (crSaveBtn) {
            crSaveBtn.addEventListener('click', () => {
                const crId = document.getElementById('cr-modal-active-id').value;
                const crText = document.getElementById('cr-modal-content').innerHTML;
                patientService.handleCrModalSave(crId, crText);
            });
        }

        // --- Logique Barres IV (Interactions Souris) ---
        document.addEventListener('mousedown', uiService.handleIVMouseDown);
        document.addEventListener('mousemove', uiService.handleIVMouseMove);
        document.addEventListener('mouseup', uiService.handleIVMouseUp);
        // Événement personnalisé déclenché par uiService après une interaction IV
        document.addEventListener('uiNeedsSave', patientService.debouncedSave);

        // --- Tutoriel ---
        const tutorialOverlay = document.getElementById('tutorial-overlay');
        if (tutorialOverlay) tutorialOverlay.addEventListener('click', () => uiService.endTutorial(true));
        
        const tutorialBox = document.getElementById('tutorial-step-box');
        if (tutorialBox) tutorialBox.addEventListener('click', (e) => e.stopPropagation());
        
        const tutorialSkip = document.getElementById('tutorial-skip-btn');
        if (tutorialSkip) tutorialSkip.addEventListener('click', () => uiService.endTutorial(true));
        
        const tutorialNext = document.getElementById('tutorial-next-btn');
        if (tutorialNext) tutorialNext.addEventListener('click', uiService.incrementTutorialStep);

        // --- Modale "Charger Patient" ---
        const loadList = document.getElementById('load-patient-list-container');
        if (loadList) {
            loadList.addEventListener('click', async (e) => {
                const loadBtn = e.target.closest('.load-btn');
                const deleteBtn = e.target.closest('.delete-btn');

                if (loadBtn) {
                    const id = loadBtn.dataset.patientId;
                    const name = loadBtn.closest('.flex').querySelector('.font-medium').textContent;
                    patientService.loadCaseIntoCurrentPatient(id, name);
                }
                if (deleteBtn) {
                    const id = deleteBtn.dataset.patientId;
                    const name = deleteBtn.dataset.patientName;
                    patientService.deleteCase(id, name);
                }
            });
        }
    }

    // Lancer l'application
    document.addEventListener('DOMContentLoaded', initApp);

})();