(function () {
    "use strict";

    const API_URL = 'https://eidos-api.onrender.com';

    // --- Fonctions utilitaires ---

    function getAuthToken() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'auth.html';
            return null;
        }
        return token;
    }

    function getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
        };
    }

    function handleAuthError(response) {
        if (response.status === 401) {
            localStorage.removeItem('authToken');
            window.location.href = 'auth.html';
            return true;
        }
        return false;
    }

    // --- Modales ---
    let confirmCallback = null;

    function showDeleteConfirmation(message, callback) {
        const m = document.getElementById('custom-confirm-modal');
        const b = document.getElementById('custom-confirm-box');
        document.getElementById('custom-confirm-title').textContent = 'Confirmation requise';
        document.getElementById('custom-confirm-message').textContent = message;
        
        const okBtn = document.getElementById('custom-confirm-ok');
        okBtn.className = "px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors";
        okBtn.textContent = 'Confirmer';
        
        document.getElementById('custom-confirm-cancel').classList.remove('hidden');

        confirmCallback = callback;
        m.classList.remove('hidden');
        setTimeout(() => b.classList.remove('scale-95', 'opacity-0'), 10);
    }

    function showCustomAlert(title, message) {
        const m = document.getElementById('custom-confirm-modal');
        const b = document.getElementById('custom-confirm-box');
        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;
        
        const okBtn = document.getElementById('custom-confirm-ok');
        okBtn.className = "px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors";
        okBtn.textContent = 'Fermer';
        
        document.getElementById('custom-confirm-cancel').classList.add('hidden');
        confirmCallback = null;
        
        m.classList.remove('hidden');
        setTimeout(() => b.classList.remove('scale-95', 'opacity-0'), 10);
    }

    function hideConfirmation() {
        const m = document.getElementById('custom-confirm-modal');
        const b = document.getElementById('custom-confirm-box');
        b.classList.add('scale-95', 'opacity-0');
        setTimeout(() => m.classList.add('hidden'), 200);
    }

    // --- Logique Page ---

    let tabButtons = {}, tabContents = {}, currentPlan = 'free', studentCount = 0;
    let adminData = { users: [], organisations: [], scenarios: [] };
    
    // État de la navigation Admin
    let adminSelectedCentre = null; 
    let adminSelectedTrainer = null;

    function switchTab(tabId) {
        Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
        Object.values(tabContents).forEach(content => content.classList.remove('active'));

        if (tabButtons[tabId] && tabContents[tabId]) {
            tabButtons[tabId].classList.add('active');
            tabContents[tabId].classList.add('active');
            
            if (tabId === 'admin') {
                loadAdminDashboard();
            }
        }
    }

    async function loadAccountDetails() {
        // Masquer les onglets conditionnels par défaut
        ['tab-invitations', 'tab-centre', 'tab-admin'].forEach(id => document.getElementById(id).style.display = 'none');

        try {
            // Appel à la route spécifique qui renvoie les détails (étudiants, formateurs, organisation)
            const accountData = await window.apiService.fetchAccountDetails();
            if (!accountData) return;

            // Gestion affichage Admin
            if (accountData.email === 'lucas.seraudie@gmail.com') {
                document.getElementById('tab-admin').style.display = 'flex';
            }

            document.getElementById('contact-email').textContent = "lucas.seraudie@gmail.com";

            const pName = document.getElementById('current-plan-name');
            const pDesc = document.getElementById('plan-description');
            
            let displayPlan = accountData.plan;

            // Logique d'affichage selon le rôle
            if (accountData.role === 'formateur' && accountData.organisation) {
                // Cas Formateur rattaché à un centre
                pName.textContent = `Plan ${displayPlan} (via ${accountData.organisation.name})`;
                pDesc.textContent = `Formateur rattaché.`;
                document.getElementById('tab-invitations').style.display = 'flex';
                renderStudentTable(accountData.students || []);

            } else if (accountData.is_owner && accountData.organisation) {
                // Cas Propriétaire de centre
                pName.textContent = `Plan ${displayPlan} (Propriétaire)`;
                pDesc.textContent = `Gestionnaire de "${accountData.organisation.name}".`;
                document.getElementById('tab-invitations').style.display = 'flex';
                document.getElementById('tab-centre').style.display = 'flex';
                renderStudentTable(accountData.students || []);
                renderCentreDetails(accountData.organisation);

            } else {
                // Cas Indépendant / Promo / Free
                studentCount = accountData.students ? accountData.students.length : 0;
                pName.textContent = displayPlan.charAt(0).toUpperCase() + displayPlan.slice(1);
                
                if (displayPlan === 'promo') {
                    pDesc.textContent = `Vous pouvez inviter jusqu'à 40 étudiants (${studentCount} / 40).`;
                    document.getElementById('tab-invitations').style.display = 'flex';
                } else if (displayPlan === 'independant') {
                    pDesc.textContent = `Sauvegardes illimitées, et jusqu'à 5 étudiants (${studentCount} / 5).`;
                    document.getElementById('tab-invitations').style.display = 'flex';
                } else {
                    pDesc.textContent = "Fonctionnalités de base.";
                }

                if (displayPlan !== 'free') {
                    renderStudentTable(accountData.students || []);
                }
            }
            
            currentPlan = displayPlan;
            updateSubscriptionButtons(displayPlan, accountData.organisation?.quote_url, accountData.organisation?.quote_price);

        } catch (err) {
            console.error(err);
            showCustomAlert("Erreur de chargement", "Impossible de récupérer les détails du compte.");
        }
    }

    // --- LOGIQUE ADMIN (SUPER ADMIN) ---

    async function loadAdminDashboard() {
        try {
            // 1. Stats
            const stats = await window.apiService.fetchAdminStats();
            if (stats) {
                document.getElementById('admin-stat-users').textContent = stats.userCount;
                document.getElementById('admin-stat-patients').textContent = stats.patientCount;
                document.getElementById('admin-stat-orgs').textContent = stats.orgCount;
                document.getElementById('admin-stat-students').textContent = stats.studentCount;
            }
            // 2. Données complètes
            const data = await window.apiService.fetchAdminData();
            if (data) {
                adminData = data;
                // Reset selections pour la vue 3 colonnes
                adminSelectedCentre = null;
                adminSelectedTrainer = null;
                
                renderAdminHierarchy();
                renderAdminScenariosList();
            }
        } catch (err) {
            showCustomAlert("Erreur Admin", err.message);
        }
    }

    function renderAdminHierarchy() {
        const colCentres = document.getElementById('admin-col-centres');
        const colFormateurs = document.getElementById('admin-col-formateurs');
        const colStudents = document.getElementById('admin-col-students');

        // --- COLONNE 1 : CENTRES ---
        let htmlCentres = '';
        
        // Option "Indépendants"
        const isIndepSelected = adminSelectedCentre === 'independent';
        htmlCentres += `
            <div class="admin-col-item p-3 border-b border-gray-100 ${isIndepSelected ? 'selected' : ''}" onclick="selectAdminCentre('independent')">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-bold text-gray-700">Indépendants / Sans Centre</p>
                        <p class="text-xs text-gray-500">Formateurs autonomes</p>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                </div>
            </div>
        `;

        adminData.organisations.forEach(org => {
            const isSelected = adminSelectedCentre === org._id;
            htmlCentres += `
                <div class="admin-col-item p-3 border-b border-gray-100 ${isSelected ? 'selected' : ''}" onclick="selectAdminCentre('${org._id}')">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-bold text-gray-800">${org.name}</p>
                            <p class="text-xs text-gray-500 truncate w-40">${org.owner?.email || 'No owner'}</p>
                        </div>
                        <button class="text-gray-400 hover:text-red-500 p-1" onclick="event.stopPropagation(); handleAdminDeleteUser('${org.owner?._id}')" title="Supprimer le centre"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </div>
            `;
        });
        colCentres.innerHTML = htmlCentres;

        // --- COLONNE 2 : FORMATEURS ---
        let htmlFormateurs = '';
        let filteredTrainers = [];

        if (adminSelectedCentre === 'independent') {
            // Filtre : Users (sauf étudiants) sans organisation et qui ne sont pas owner
            filteredTrainers = adminData.users.filter(u => 
                u.role !== 'etudiant' && 
                !u.organisation && 
                !u.is_owner 
            );
        } else if (adminSelectedCentre) {
            // Filtre : Formateurs de l'organisation + le Owner
            filteredTrainers = adminData.users.filter(u => 
                (u.organisation && u.organisation._id === adminSelectedCentre && u.role === 'formateur') ||
                (u.organisation && u.organisation._id === adminSelectedCentre && u.is_owner) 
            );
        }

        if (!adminSelectedCentre) {
            htmlFormateurs = '<div class="p-4 text-center text-gray-400 text-sm italic">Sélectionnez un centre ou "Indépendants"</div>';
        } else if (filteredTrainers.length === 0) {
            htmlFormateurs = '<div class="p-4 text-center text-gray-400 text-sm">Aucun formateur trouvé.</div>';
        } else {
            filteredTrainers.forEach(trainer => {
                const isSelected = adminSelectedTrainer === trainer._id;
                const studentCount = adminData.users.filter(u => u.createdBy && u.createdBy._id === trainer._id).length;
                const badge = trainer.is_owner ? '<span class="bg-indigo-100 text-indigo-800 text-[10px] px-1 rounded ml-1">Proprio</span>' : '';

                htmlFormateurs += `
                    <div class="admin-col-item p-3 border-b border-gray-100 ${isSelected ? 'selected' : ''}" onclick="selectAdminTrainer('${trainer._id}')">
                        <div class="flex justify-between items-center">
                            <div class="overflow-hidden">
                                <p class="font-medium text-gray-800 text-sm truncate" title="${trainer.email}">${trainer.email} ${badge}</p>
                                <p class="text-xs text-gray-500">Étudiants : ${studentCount}</p>
                            </div>
                            <button class="text-gray-400 hover:text-red-500 p-1 ml-2" onclick="event.stopPropagation(); handleAdminDeleteUser('${trainer._id}')"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    </div>
                `;
            });
        }
        colFormateurs.innerHTML = htmlFormateurs;

        // --- COLONNE 3 : ÉTUDIANTS ---
        let htmlStudents = '';
        let filteredStudents = [];

        if (adminSelectedTrainer) {
            filteredStudents = adminData.users.filter(u => u.role === 'etudiant' && u.createdBy && u.createdBy._id === adminSelectedTrainer);
        } else if (adminSelectedCentre) {
            // Si on clique sur le centre mais pas encore de formateur, on peut afficher TOUS les étudiants du centre
            // Ou laisser vide pour forcer la sélection du formateur.
            // Option choisie : afficher tous les étudiants du centre (agrégation)
            const trainerIds = filteredTrainers.map(t => t._id);
            filteredStudents = adminData.users.filter(u => u.role === 'etudiant' && u.createdBy && trainerIds.includes(u.createdBy._id));
        }

        if (!adminSelectedCentre) {
            htmlStudents = '<div class="p-4 text-center text-gray-400 text-sm italic">Sélectionnez une source</div>';
        } else if (filteredStudents.length === 0) {
            htmlStudents = '<div class="p-4 text-center text-gray-400 text-sm">Aucun étudiant.</div>';
        } else {
            filteredStudents.forEach(stu => {
                const creator = stu.createdBy ? (stu.createdBy.email || 'Inconnu') : 'Inconnu';
                htmlStudents += `
                    <div class="p-3 border-b border-gray-100 hover:bg-gray-50 flex justify-between items-center">
                        <div class="overflow-hidden">
                            <p class="font-mono font-bold text-gray-700 text-sm">${stu.login}</p>
                            <p class="text-xs text-gray-500 truncate w-40" title="Rattaché à ${creator}">Ref : ${creator}</p>
                        </div>
                        <button class="text-red-400 hover:text-red-600 p-1" onclick="handleAdminDeleteUser('${stu._id}')"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                `;
            });
        }
        colStudents.innerHTML = htmlStudents;
    }

    // Helpers globaux pour les onclick inline HTML
    window.selectAdminCentre = function(centreId) {
        adminSelectedCentre = centreId;
        adminSelectedTrainer = null;
        renderAdminHierarchy();
    };

    window.selectAdminTrainer = function(trainerId) {
        adminSelectedTrainer = trainerId;
        renderAdminHierarchy();
    };

    function renderAdminScenariosList() {
        const container = document.getElementById('admin-scenarios-grid');
        const searchTerm = document.getElementById('admin-search-scenarios').value.toLowerCase();
        const filter = document.getElementById('admin-filter-scenarios').value;
        
        container.innerHTML = '';

        const filteredScenarios = adminData.scenarios.filter(s => {
            const matchSearch = s.sidebar_patient_name.toLowerCase().includes(searchTerm);
            const matchFilter = filter === 'all' 
                ? true 
                : (filter === 'public' ? s.is_public : !s.is_public);
            return matchSearch && matchFilter;
        });

        filteredScenarios.forEach(s => {
            const creator = s.user ? s.user.email : 'Inconnu';
            const isPublic = s.is_public;
            
            const card = document.createElement('div');
            card.className = `bg-white rounded-lg shadow border ${isPublic ? 'border-green-400' : 'border-gray-200'} p-4 flex flex-col justify-between h-full admin-card`;
            
            card.innerHTML = `
                <div class="mb-4">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-lg text-gray-800 truncate" title="${s.sidebar_patient_name}">${s.sidebar_patient_name}</h4>
                        ${isPublic ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Public</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-500 mt-1">Par : ${creator}</p>
                    <p class="text-xs text-gray-400 font-mono mt-1">${s.patientId}</p>
                </div>
                <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                    <button class="text-sm font-medium ${isPublic ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'} px-3 py-1 rounded transition-colors admin-toggle-public-btn" data-id="${s.patientId}">
                        <i class="fas ${isPublic ? 'fa-lock' : 'fa-globe'} mr-1"></i>
                        ${isPublic ? 'Privé' : 'Public'}
                    </button>
                    <button class="text-gray-400 hover:text-red-500 admin-delete-scenario-btn" data-id="${s.patientId}" title="Supprimer ce scénario">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('.admin-toggle-public-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleAdminTogglePublic(e.currentTarget.dataset.id));
        });
        container.querySelectorAll('.admin-delete-scenario-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleAdminDeleteScenario(e.currentTarget.dataset.id));
        });
    }

    // --- ACTIONS ADMIN ---

    window.handleAdminDeleteUser = function(userId) {
        if (!userId) return;
        showDeleteConfirmation("ATTENTION : Supprimer cet utilisateur effacera TOUTES ses données (y compris étudiants et scénarios). Cette action est irréversible.", async () => {
            try {
                const res = await window.apiService.adminDeleteUser(userId);
                showCustomAlert("Succès", res.message);
                loadAdminDashboard();
            } catch (err) { showCustomAlert("Erreur", err.message); }
        });
    };

    async function handleAdminDeleteScenario(patientId) {
        showDeleteConfirmation("Supprimer ce scénario définitivement ?", async () => {
            try {
                const res = await window.apiService.adminDeleteScenario(patientId);
                showCustomAlert("Succès", res.message);
                loadAdminDashboard(); 
            } catch (err) { showCustomAlert("Erreur", err.message); }
        });
    }

    async function handleAdminTogglePublic(patientId) {
        try {
            const res = await window.apiService.toggleScenarioPublic(patientId);
            const scenario = adminData.scenarios.find(s => s.patientId === patientId);
            if (scenario) scenario.is_public = res.is_public;
            renderAdminScenariosList();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }

    // --- ACTIONS STANDARD (Formateurs/Centres) ---

    function renderCentreDetails(organisation) {
        document.getElementById('centre-plan-name').textContent = `Plan ${organisation.plan} ("${organisation.name}")`;
        document.getElementById('centre-plan-details').textContent = `Licences formateur utilisées : ${organisation.licences_utilisees} / ${organisation.licences_max || 'Illimitées'}`;
        
        const listContainer = document.getElementById('formateurs-list-container');
        // Supprimer le spinner s'il est là
        const spinner = document.getElementById('formateurs-loading');
        if (spinner) spinner.remove();

        let html = '';
        if (!organisation.formateurs || organisation.formateurs.length === 0) {
            html = '<p class="text-sm text-gray-500">Aucun formateur invité.</p>';
        } else {
            html = organisation.formateurs.map(f => `
                <div class="flex items-center justify-between p-2 bg-gray-50 rounded-md border">
                    <span class="text-sm font-medium text-gray-700">${f.email}</span>
                    <button type="button" class="remove-formateur-btn text-xs text-red-500 hover:text-red-700" data-email="${f.email}">
                        <i class="fas fa-trash"></i> Retirer
                    </button>
                </div>
            `).join('');
        }
        listContainer.innerHTML = html;
    }

    async function handleInviteFormateur(e) {
        e.preventDefault();
        const email = document.getElementById('invite-email').value;
        const button = document.getElementById('invite-formateur-btn');
        
        if (!email) return showCustomAlert("Erreur", "Email requis.");

        button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(`${API_URL}/api/organisation/invite`, {
                method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email })
            });
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error((await res.json()).error);
            
            showCustomAlert("Succès", `Invitation envoyée à ${email}`);
            e.target.reset();
            loadAccountDetails();
        } catch (err) { 
            showCustomAlert("Erreur", err.message); 
        } finally {
            button.disabled = false; button.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Envoyer l\'invitation';
        }
    }

    function renderStudentTable(students) {
        const tbody = document.getElementById('permissions-tbody');
        document.getElementById('student-list-title').textContent = `Gestion des étudiants (${students.length})`;
        
        // Gestion limite
        const createBtn = document.getElementById('create-student-submit-btn');
        let limitReached = false;
        if (currentPlan === 'independant' && students.length >= 5) limitReached = true;
        if (currentPlan === 'promo' && students.length >= 40) limitReached = true;
        
        if (limitReached) {
            createBtn.disabled = true;
            createBtn.className = "inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed";
        } else {
            createBtn.disabled = false;
            createBtn.className = "inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700";
        }

        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="15" class="p-4 text-center text-gray-500">Vous n'avez pas encore créé de compte étudiant.</td></tr>`;
            return;
        }

        const permissionsList = ['header', 'admin', 'vie', 'observations', 'comptesRendus', 'prescriptions_add', 'prescriptions_delete', 'prescriptions_validate', 'transmissions', 'pancarte', 'diagramme', 'biologie'];
        
        let html = '';
        students.forEach(student => {
            html += `<tr><td class="p-2 font-medium align-middle">${student.login}</td>`;
            permissionsList.forEach(perm => {
                const isChecked = student.permissions && student.permissions[perm];
                html += `<td class="p-2 text-center align-middle">
                           <label class="relative inline-flex items-center cursor-pointer">
                             <input type="checkbox" class="sr-only peer" data-login="${student.login}" data-permission="${perm}" ${isChecked ? 'checked' : ''}>
                             <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                           </label>
                         </td>`;
            });
            const roomCount = (student.allowedRooms || []).length;
            html += `<td class="p-2 text-center align-middle">
                       <button type="button" class="manage-rooms-btn text-sm text-indigo-600 hover:text-indigo-800 hover:underline" data-login="${student.login}" data-name="${student.login}" data-rooms='${JSON.stringify(student.allowedRooms || [])}'>Gérer (${roomCount}/10)</button>
                     </td>
                     <td class="p-2 text-center align-middle">
                       <button class="delete-student-btn text-red-500 hover:text-red-700" data-login="${student.login}"><i class="fas fa-trash"></i></button>
                     </td></tr>`;
        });
        tbody.innerHTML = html;
    }

    function updateSubscriptionButtons(activePlan, quoteUrl, quotePrice) {
        const planButtons = {
            'free': document.getElementById('sub-btn-free'),
            'independant': document.getElementById('sub-btn-independant'),
            'promo': document.getElementById('sub-btn-promo'),
            'centre': document.getElementById('sub-btn-centre')
        };
        
        Object.values(planButtons).forEach(btn => {
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = "Choisir ce plan";
                btn.className = "mt-8 w-full py-3 px-4 rounded-lg font-semibold sub-plan-btn transition-all";
                if(btn.id.includes('free')) btn.classList.add('text-yellow-700', 'bg-yellow-50', 'hover:bg-yellow-100');
                if(btn.id.includes('independant')) btn.classList.add('text-white', 'bg-teal-600', 'hover:bg-teal-700');
                if(btn.id.includes('promo')) btn.classList.add('text-white', 'bg-blue-600', 'hover:bg-blue-700');
                if(btn.id.includes('centre')) {
                    btn.classList.add('text-gray-700', 'bg-gray-200');
                    btn.innerHTML = "Nous contacter";
                    btn.onclick = () => switchTab('contact');
                }
            }
        });

        if (planButtons[activePlan]) {
            const btn = planButtons[activePlan];
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i> Plan actuel';
            btn.classList.add('cursor-not-allowed', 'opacity-75');
        }
        
        if (activePlan === 'centre' && quoteUrl) {
            const btn = planButtons['centre'];
            btn.innerHTML = `Activer devis (${quotePrice})`;
            btn.classList.remove('bg-gray-200', 'text-gray-700');
            btn.classList.add('bg-green-600', 'text-white', 'hover:bg-green-700');
            btn.disabled = false;
            btn.onclick = () => window.location.href = quoteUrl;
        }
    }

    // --- Initialisation et Listeners ---

    function init() {
        if (!getAuthToken()) return;

        // Onglets principaux
        tabButtons = {
            security: document.getElementById('tab-security'),
            subscription: document.getElementById('tab-subscription'),
            centre: document.getElementById('tab-centre'),
            invitations: document.getElementById('tab-invitations'),
            admin: document.getElementById('tab-admin'),
            contact: document.getElementById('tab-contact')
        };
        tabContents = {
            security: document.getElementById('content-security'),
            subscription: document.getElementById('content-subscription'),
            centre: document.getElementById('content-centre'),
            invitations: document.getElementById('content-invitations'),
            admin: document.getElementById('content-admin'),
            contact: document.getElementById('content-contact')
        };

        Object.keys(tabButtons).forEach(key => {
            if(tabButtons[key]) {
                tabButtons[key].addEventListener('click', () => switchTab(key));
            }
        });

        // Onglets Admin (Sous-navigation)
        const btnAdminUsers = document.getElementById('admin-view-users-btn');
        const btnAdminScenarios = document.getElementById('admin-view-scenarios-btn');
        
        btnAdminUsers?.addEventListener('click', () => {
            document.getElementById('admin-view-users').classList.remove('hidden');
            document.getElementById('admin-view-scenarios').classList.add('hidden');
            btnAdminUsers.classList.add('text-teal-600', 'border-b-2', 'border-teal-600');
            btnAdminScenarios.classList.remove('text-teal-600', 'border-b-2', 'border-teal-600');
        });
        
        btnAdminScenarios?.addEventListener('click', () => {
            document.getElementById('admin-view-scenarios').classList.remove('hidden');
            document.getElementById('admin-view-users').classList.add('hidden');
            btnAdminScenarios.classList.add('text-teal-600', 'border-b-2', 'border-teal-600');
            btnAdminUsers.classList.remove('text-teal-600', 'border-b-2', 'border-teal-600');
        });

        // Filtres Admin
        document.getElementById('admin-search-scenarios')?.addEventListener('input', renderAdminScenariosList);
        document.getElementById('admin-filter-scenarios')?.addEventListener('change', renderAdminScenariosList);

        // Modale de confirmation
        document.getElementById('custom-confirm-ok').addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            hideConfirmation();
        });
        document.getElementById('custom-confirm-cancel').addEventListener('click', hideConfirmation);

        setupExistingListeners(); 
        loadAccountDetails();
        switchTab('security');
    }

    function setupExistingListeners() {
        // Room Modal
        const roomModal = document.getElementById('room-modal');
        const roomModalBox = document.getElementById('room-modal-box');
        
        window.hideRoomModal = function() {
            roomModalBox.classList.add('scale-95', 'opacity-0');
            setTimeout(() => roomModal.classList.add('hidden'), 200);
        };
        
        document.getElementById('room-modal-cancel').addEventListener('click', window.hideRoomModal);
        
        // Event Listeners pour tous les formulaires
        document.getElementById('invite-formateur-form')?.addEventListener('submit', handleInviteFormateur);
        document.getElementById('create-student-form')?.addEventListener('submit', handleCreateStudent);
        
        document.getElementById('generate-credentials-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('student-login').value = `etu${Math.floor(1000 + Math.random() * 9000)}`;
            document.getElementById('student-password').value = Math.random().toString(36).slice(-8);
        });

        document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
        document.getElementById('change-email-form')?.addEventListener('submit', handleChangeEmail);
        document.getElementById('delete-account-btn')?.addEventListener('click', handleDeleteAccount);
        
        ['free', 'independant', 'promo'].forEach(p => {
            document.getElementById(`sub-btn-${p}`)?.addEventListener('click', () => handleChangeSubscription(p));
        });
        
        document.getElementById('sub-btn-centre')?.addEventListener('click', () => switchTab('contact'));
        document.getElementById('copy-email-btn')?.addEventListener('click', handleCopyEmail);
        
        // Délégation d'événements pour les listes dynamiques
        document.getElementById('formateurs-list-container')?.addEventListener('click', async (e) => {
            if(e.target.closest('.remove-formateur-btn')) {
                const btn = e.target.closest('.remove-formateur-btn');
                const email = btn.dataset.email;
                showDeleteConfirmation(`Retirer le formateur ${email} ?`, async () => {
                    try {
                        const res = await fetch(`${API_URL}/api/organisation/remove`, {
                            method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email })
                        });
                        if(res.ok) { showCustomAlert("Succès", "Formateur retiré."); loadAccountDetails(); }
                    } catch(err) { showCustomAlert("Erreur", "Impossible de retirer."); }
                });
            }
        });
        
        const ptbody = document.getElementById('permissions-tbody');
        ptbody?.addEventListener('change', async (e) => {
            if(e.target.matches('input[type="checkbox"]')) {
                const cb = e.target;
                try {
                    await fetch(`${API_URL}/api/account/permissions`, {
                        method: 'PUT', headers: getAuthHeaders(),
                        body: JSON.stringify({ login: cb.dataset.login, permission: cb.dataset.permission, value: cb.checked })
                    });
                } catch(err) { cb.checked = !cb.checked; showCustomAlert("Erreur", "Mise à jour impossible"); }
            }
        });

        ptbody?.addEventListener('click', (e) => {
            // Suppression étudiant
            if(e.target.closest('.delete-student-btn')) {
                const btn = e.target.closest('.delete-student-btn');
                showDeleteConfirmation(`Supprimer l'étudiant ${btn.dataset.login} ?`, async () => {
                    await fetch(`${API_URL}/api/account/student`, {
                        method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ login: btn.dataset.login })
                    });
                    loadAccountDetails();
                });
            }
            // Ouverture modale chambres
            if(e.target.closest('.manage-rooms-btn')) {
                const btn = e.target.closest('.manage-rooms-btn');
                const rooms = JSON.parse(btn.dataset.rooms);
                document.getElementById('room-modal-login').value = btn.dataset.login;
                document.getElementById('room-modal-list').innerHTML = Array.from({length:10},(_,i)=>`chambre_${101+i}`).map(rid => 
                    `<label class="flex items-center space-x-2 p-2 border rounded bg-gray-50 hover:bg-gray-100 cursor-pointer">
                        <input type="checkbox" name="room" value="${rid}" ${rooms.includes(rid)?'checked':''} class="rounded text-indigo-600">
                        <span>${rid.split('_')[1]}</span>
                    </label>`
                ).join('');
                document.getElementById('room-modal').classList.remove('hidden');
                setTimeout(()=>document.getElementById('room-modal-box').classList.remove('scale-95','opacity-0'),10);
            }
        });

        // Sauvegarde modale chambres
        document.getElementById('room-modal-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const login = document.getElementById('room-modal-login').value;
            const rooms = Array.from(e.target.querySelectorAll('input[name="room"]:checked')).map(c=>c.value);
            await fetch(`${API_URL}/api/account/student/rooms`, {
                method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login, rooms })
            });
            window.hideRoomModal();
            loadAccountDetails();
        });
    }

    // --- Handlers formulaires ---

    async function handleCreateStudent(e) {
        e.preventDefault();
        if (currentPlan === 'independant' && studentCount >= 5) return showCustomAlert("Limite", "Limite de 5 étudiants atteinte.");
        if (currentPlan === 'promo' && studentCount >= 40) return showCustomAlert("Limite", "Limite de 40 étudiants atteinte.");

        const login = document.getElementById('student-login').value;
        const password = document.getElementById('student-password').value;
        
        if (!login || !password) return showCustomAlert("Erreur", "Tous les champs sont requis.");

        try {
            const res = await fetch(`${API_URL}/api/account/invite`, {
                method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ login, password })
            });
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error((await res.json()).error || "Erreur");
            
            showCustomAlert("Succès", `Compte étudiant "${login}" créé.`);
            e.target.reset();
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }

    async function handleChangePassword(e) {
        e.preventDefault();
        const cp = document.getElementById('current-password').value;
        const np = document.getElementById('new-password').value;
        if (np !== document.getElementById('confirm-password').value) return showCustomAlert("Erreur", "Les nouveaux mots de passe ne correspondent pas.");
        try {
            const res = await fetch(`${API_URL}/api/account/change-password`, {
                method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword: cp, newPassword: np })
            });
            if(!res.ok) throw new Error('Erreur');
            showCustomAlert("Succès", "Mot de passe mis à jour.");
            e.target.reset();
        } catch (err) { showCustomAlert("Erreur", "Impossible de changer le mot de passe."); }
    }

    async function handleChangeEmail(e) {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/account/request-change-email`, {
                method: 'POST', headers: getAuthHeaders(),
                body: JSON.stringify({ 
                    newEmail: document.getElementById('new-email').value,
                    password: document.getElementById('current-password-for-email').value
                })
            });
            if(!res.ok) throw new Error('Erreur');
            showCustomAlert("Succès", "Email de vérification envoyé.");
            e.target.reset();
        } catch (err) { showCustomAlert("Erreur", "Échec de la demande."); }
    }

    function handleDeleteAccount() {
        showDeleteConfirmation("Êtes-vous sûr ? Cette action est irréversible.", async () => {
            try {
                await fetch(`${API_URL}/api/account/delete`, { method: 'DELETE', headers: getAuthHeaders() });
                localStorage.clear();
                window.location.href = 'auth.html';
            } catch (err) { showCustomAlert("Erreur", err.message); }
        });
    }

    async function handleChangeSubscription(np) {
        if(np === 'centre') return switchTab('contact');
        try {
            const res = await fetch(`${API_URL}/api/account/change-subscription`, {
                method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ newPlan: np })
            });
            if(res.ok) { showCustomAlert("Succès", "Abonnement mis à jour."); loadAccountDetails(); }
        } catch (err) { showCustomAlert("Erreur", "Mise à jour impossible."); }
    }

    function handleCopyEmail() {
        navigator.clipboard.writeText(document.getElementById('contact-email').textContent)
            .then(() => showCustomAlert("Info", "Email copié dans le presse-papier."));
    }

    document.addEventListener('DOMContentLoaded', init);

})();