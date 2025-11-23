(function () {
    "use strict";

    const API_URL = 'https://eidos-api.onrender.com';

    function getAuthToken() {
        const token = localStorage.getItem('authToken');
        if (!token) { window.location.href = 'auth.html'; return null; }
        return token;
    }
    function getAuthHeaders() {
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` };
    }
    function handleAuthError(response) {
        if (response.status === 401) { localStorage.removeItem('authToken'); window.location.href = 'auth.html'; return true; }
        return false;
    }

    // --- Modales ---
    let confirmCallback = null;
    function showDeleteConfirmation(message, callback) {
        const m = document.getElementById('custom-confirm-modal'), b = document.getElementById('custom-confirm-box');
        document.getElementById('custom-confirm-title').textContent = 'Confirmation';
        document.getElementById('custom-confirm-message').textContent = message;
        const ok = document.getElementById('custom-confirm-ok');
        ok.className = "px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700";
        ok.textContent = 'Confirmer';
        document.getElementById('custom-confirm-cancel').classList.remove('hidden');
        confirmCallback = callback;
        m.classList.remove('hidden'); setTimeout(() => b.classList.remove('scale-95', 'opacity-0'), 10);
    }
    function showCustomAlert(title, message) {
        const m = document.getElementById('custom-confirm-modal'), b = document.getElementById('custom-confirm-box');
        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;
        const ok = document.getElementById('custom-confirm-ok');
        ok.className = "px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700";
        ok.textContent = 'Fermer';
        document.getElementById('custom-confirm-cancel').classList.add('hidden');
        confirmCallback = null;
        m.classList.remove('hidden'); setTimeout(() => b.classList.remove('scale-95', 'opacity-0'), 10);
    }
    function hideConfirmation() {
        const m = document.getElementById('custom-confirm-modal'), b = document.getElementById('custom-confirm-box');
        b.classList.add('scale-95', 'opacity-0'); setTimeout(() => m.classList.add('hidden'), 200);
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
            if (tabId === 'admin') loadAdminDashboard();
        }
    }

    async function loadAccountDetails() {
        ['tab-invitations', 'tab-centre', 'tab-admin'].forEach(id => document.getElementById(id).style.display = 'none');
        try {
            // --- CORRECTION MAJEURE : Appel à fetchAccountDetails au lieu de fetchUserPermissions ---
            // fetchUserPermissions ne renvoie QUE l'user (sans étudiants/formateurs).
            // fetchAccountDetails appelle la route qui peuple ces listes.
            const accountData = await window.apiService.fetchAccountDetails();
            if (!accountData) return;

            // Gestion affichage Admin
            if (accountData.email === 'lucas.seraudie@gmail.com') document.getElementById('tab-admin').style.display = 'flex';

            document.getElementById('contact-email').textContent = "lucas.seraudie@gmail.com";

            const pName = document.getElementById('current-plan-name'), pDesc = document.getElementById('plan-description');
            
            // On utilise 'plan' qui est renvoyé directement par /api/account/details (déjà calculé coté serveur ou mapping)
            // La route renvoie: email, plan, role, is_owner, students, organisation
            let displayPlan = accountData.plan;

            if (accountData.role === 'formateur' && accountData.organisation) {
                pName.textContent = `Plan ${displayPlan} (via ${accountData.organisation.name})`;
                pDesc.textContent = `Formateur rattaché.`;
                document.getElementById('tab-invitations').style.display = 'flex';
                // Passage des étudiants récupérés
                renderStudentTable(accountData.students || []);
            } else if (accountData.is_owner && accountData.organisation) {
                pName.textContent = `Plan ${displayPlan} (Propriétaire)`;
                pDesc.textContent = `Gestionnaire de "${accountData.organisation.name}".`;
                document.getElementById('tab-invitations').style.display = 'flex';
                document.getElementById('tab-centre').style.display = 'flex';
                // Passage des données récupérées
                renderStudentTable(accountData.students || []);
                renderCentreDetails(accountData.organisation);
            } else {
                studentCount = accountData.students ? accountData.students.length : 0;
                pName.textContent = displayPlan.charAt(0).toUpperCase() + displayPlan.slice(1);
                if (displayPlan !== 'free') {
                    document.getElementById('tab-invitations').style.display = 'flex';
                    renderStudentTable(accountData.students || []);
                }
            }
            currentPlan = displayPlan;
            updateSubscriptionButtons(displayPlan, accountData.organisation?.quote_url, accountData.organisation?.quote_price);
        } catch (err) { console.error(err); }
    }

    // --- ADMIN LOGIC ---

    async function loadAdminDashboard() {
        try {
            const stats = await window.apiService.fetchAdminStats();
            if (stats) {
                document.getElementById('admin-stat-users').textContent = stats.userCount;
                document.getElementById('admin-stat-patients').textContent = stats.patientCount;
                document.getElementById('admin-stat-orgs').textContent = stats.orgCount;
                document.getElementById('admin-stat-students').textContent = stats.studentCount;
            }
            const data = await window.apiService.fetchAdminData();
            if (data) {
                adminData = data;
                // Reset selections
                adminSelectedCentre = null;
                adminSelectedTrainer = null;
                renderAdminHierarchy();
                renderAdminScenariosList();
            }
        } catch (err) { showCustomAlert("Erreur Admin", err.message); }
    }

    function renderAdminHierarchy() {
        const colCentres = document.getElementById('admin-col-centres');
        const colFormateurs = document.getElementById('admin-col-formateurs');
        const colStudents = document.getElementById('admin-col-students');

        // 1. Rendu Colonne CENTRES
        let htmlCentres = '';
        
        // Item spécial "Indépendants"
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

        // 2. Rendu Colonne FORMATEURS (Dépend de adminSelectedCentre)
        let htmlFormateurs = '';
        let filteredTrainers = [];

        if (adminSelectedCentre === 'independent') {
            filteredTrainers = adminData.users.filter(u => 
                u.role !== 'etudiant' && 
                !u.organisation && 
                !u.is_owner 
            );
        } else if (adminSelectedCentre) {
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

        // 3. Rendu Colonne ÉTUDIANTS (Dépend de adminSelectedTrainer ou adminSelectedCentre)
        let htmlStudents = '';
        let filteredStudents = [];

        if (adminSelectedTrainer) {
            filteredStudents = adminData.users.filter(u => u.role === 'etudiant' && u.createdBy && u.createdBy._id === adminSelectedTrainer);
        } else if (adminSelectedCentre) {
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
                    <div class="p-3 border-b border-gray-100 hover:bg-gray-50">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-mono font-bold text-gray-700 text-sm">${stu.login}</p>
                                <p class="text-xs text-gray-500 truncate w-40" title="Rattaché à ${creator}">Ref : ${creator}</p>
                            </div>
                            <button class="text-red-400 hover:text-red-600 p-1" onclick="handleAdminDeleteUser('${stu._id}')"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    </div>
                `;
            });
        }
        colStudents.innerHTML = htmlStudents;
    }

    // Helpers globaux pour les onclick HTML
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
            const matchFilter = filter === 'all' ? true : (filter === 'public' ? s.is_public : !s.is_public);
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

    window.handleAdminDeleteUser = function(userId) {
        if (!userId) return;
        showDeleteConfirmation("ATTENTION : Supprimer cet utilisateur effacera TOUTES ses données. Irréversible.", async () => {
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

    // --- STANDARD LOGIC ---

    function renderCentreDetails(organisation) {
        document.getElementById('centre-plan-name').textContent = `Plan ${organisation.plan} ("${organisation.name}")`;
        document.getElementById('centre-plan-details').textContent = `Licences : ${organisation.licences_utilisees} / ${organisation.licences_max || 'Inf'}`;
        const list = document.getElementById('formateurs-list-container');
        list.innerHTML = (organisation.formateurs || []).map(f => `
            <div class="flex justify-between p-2 bg-gray-50 rounded border">
                <span class="text-sm text-gray-700">${f.email}</span>
                <button class="remove-formateur-btn text-xs text-red-500" data-email="${f.email}">Retirer</button>
            </div>
        `).join('') || '<p class="text-sm text-gray-500">Aucun formateur.</p>';
    }

    async function handleInviteFormateur(e) {
        e.preventDefault();
        const email = document.getElementById('invite-email').value;
        try {
            const res = await fetch(`${API_URL}/api/organisation/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }) });
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error((await res.json()).error);
            showCustomAlert("Envoyé", `Invitation envoyée à ${email}`);
            e.target.reset(); loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }

    function renderStudentTable(students) {
        const tbody = document.getElementById('permissions-tbody');
        document.getElementById('student-list-title').textContent = `Gestion des étudiants (${students.length})`;
        const btn = document.getElementById('create-student-submit-btn');
        const limit = currentPlan === 'independant' ? 5 : (currentPlan === 'promo' ? 40 : 999);
        btn.disabled = students.length >= limit;
        btn.className = btn.disabled ? "btn bg-gray-400 cursor-not-allowed px-4 py-2 rounded text-white" : "btn bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded text-white";

        if (students.length === 0) { tbody.innerHTML = `<tr><td colspan="15" class="p-4 text-center text-gray-500">Aucun compte.</td></tr>`; return; }

        const perms = ['header', 'admin', 'vie', 'observations', 'comptesRendus', 'prescriptions_add', 'prescriptions_delete', 'prescriptions_validate', 'transmissions', 'pancarte', 'diagramme', 'biologie'];
        tbody.innerHTML = students.map(s => `
            <tr><td class="p-2 font-medium">${s.login}</td>
            ${perms.map(p => `<td class="p-2 text-center"><input type="checkbox" data-login="${s.login}" data-permission="${p}" ${s.permissions && s.permissions[p] ? 'checked' : ''}></td>`).join('')}
            <td class="p-2 text-center"><button class="manage-rooms-btn text-indigo-600 text-sm" data-login="${s.login}" data-name="${s.login}" data-rooms='${JSON.stringify(s.allowedRooms || [])}'>Gérer (${(s.allowedRooms || []).length})</button></td>
            <td class="p-2 text-center"><button class="delete-student-btn text-red-500" data-login="${s.login}"><i class="fas fa-trash"></i></button></td></tr>
        `).join('');
    }

    function updateSubscriptionButtons(plan, quoteUrl, quotePrice) {
        const btns = { free: 'sub-btn-free', independant: 'sub-btn-independant', promo: 'sub-btn-promo', centre: 'sub-btn-centre' };
        Object.entries(btns).forEach(([p, id]) => {
            const b = document.getElementById(id); if(!b) return;
            b.disabled = false; b.innerHTML = "Choisir"; b.classList.remove('opacity-50', 'cursor-not-allowed');
            if (p === plan) { b.disabled = true; b.innerHTML = "Actuel"; b.classList.add('opacity-50', 'cursor-not-allowed'); }
            if (p === 'centre' && plan === 'centre' && quoteUrl) { b.disabled = false; b.innerHTML = `Payer (${quotePrice})`; b.onclick = () => window.location.href = quoteUrl; }
        });
    }

    function init() {
        if (!getAuthToken()) return;
        Object.keys(tabButtons = { security: document.getElementById('tab-security'), subscription: document.getElementById('tab-subscription'), centre: document.getElementById('tab-centre'), invitations: document.getElementById('tab-invitations'), admin: document.getElementById('tab-admin'), contact: document.getElementById('tab-contact') }).forEach(k => tabButtons[k]?.addEventListener('click', () => switchTab(k)));
        tabContents = { security: document.getElementById('content-security'), subscription: document.getElementById('content-subscription'), centre: document.getElementById('content-centre'), invitations: document.getElementById('content-invitations'), admin: document.getElementById('content-admin'), contact: document.getElementById('content-contact') };

        const btnAdminUsers = document.getElementById('admin-view-users-btn'), btnAdminScenarios = document.getElementById('admin-view-scenarios-btn');
        btnAdminUsers?.addEventListener('click', () => { document.getElementById('admin-view-users').classList.remove('hidden'); document.getElementById('admin-view-scenarios').classList.add('hidden'); btnAdminUsers.classList.add('text-teal-600', 'border-b-2', 'border-teal-600'); btnAdminScenarios.classList.remove('text-teal-600', 'border-b-2', 'border-teal-600'); });
        btnAdminScenarios?.addEventListener('click', () => { document.getElementById('admin-view-scenarios').classList.remove('hidden'); document.getElementById('admin-view-users').classList.add('hidden'); btnAdminScenarios.classList.add('text-teal-600', 'border-b-2', 'border-teal-600'); btnAdminUsers.classList.remove('text-teal-600', 'border-b-2', 'border-teal-600'); });

        document.getElementById('admin-search-scenarios')?.addEventListener('input', renderAdminScenariosList);
        document.getElementById('admin-filter-scenarios')?.addEventListener('change', renderAdminScenariosList);
        document.getElementById('custom-confirm-ok').addEventListener('click', () => { if (confirmCallback) confirmCallback(); hideConfirmation(); });
        document.getElementById('custom-confirm-cancel').addEventListener('click', hideConfirmation);
        
        setupExistingListeners();
        loadAccountDetails();
        switchTab('security');
    }

    function setupExistingListeners() {
        const roomModal = document.getElementById('room-modal'), roomModalBox = document.getElementById('room-modal-box');
        window.hideRoomModal = () => { roomModalBox.classList.add('scale-95', 'opacity-0'); setTimeout(() => roomModal.classList.add('hidden'), 200); };
        document.getElementById('room-modal-cancel').addEventListener('click', window.hideRoomModal);
        document.getElementById('invite-formateur-form')?.addEventListener('submit', handleInviteFormateur);
        document.getElementById('create-student-form')?.addEventListener('submit', handleCreateStudent);
        
        document.getElementById('generate-credentials-btn')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('student-login').value = `etu${Math.floor(1000+Math.random()*9000)}`; document.getElementById('student-password').value = Math.random().toString(36).slice(-8); });
        document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
        document.getElementById('change-email-form')?.addEventListener('submit', handleChangeEmail);
        document.getElementById('delete-account-btn')?.addEventListener('click', handleDeleteAccount);
        
        ['free', 'independant', 'promo'].forEach(p => document.getElementById(`sub-btn-${p}`)?.addEventListener('click', () => handleChangeSubscription(p)));
        document.getElementById('sub-btn-centre')?.addEventListener('click', () => switchTab('contact'));
        document.getElementById('copy-email-btn')?.addEventListener('click', () => { navigator.clipboard.writeText(document.getElementById('contact-email').textContent); showCustomAlert("Succès", "Copié"); });
        
        document.getElementById('formateurs-list-container')?.addEventListener('click', async (e) => { if(e.target.classList.contains('remove-formateur-btn')) { const email = e.target.dataset.email; showDeleteConfirmation(`Retirer ${email} ?`, async () => { await fetch(`${API_URL}/api/organisation/remove`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }) }); loadAccountDetails(); }); } });
        
        const ptbody = document.getElementById('permissions-tbody');
        ptbody?.addEventListener('change', async (e) => { if(e.target.matches('input[type="checkbox"]')) await fetch(`${API_URL}/api/account/permissions`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login: e.target.dataset.login, permission: e.target.dataset.permission, value: e.target.checked }) }); });
        ptbody?.addEventListener('click', (e) => {
            if(e.target.closest('.delete-student-btn')) { const l = e.target.closest('.delete-student-btn').dataset.login; showDeleteConfirmation(`Supprimer ${l}?`, async () => { await fetch(`${API_URL}/api/account/student`, { method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ login: l }) }); loadAccountDetails(); }); }
            if(e.target.closest('.manage-rooms-btn')) {
                const btn = e.target.closest('.manage-rooms-btn'), l = btn.dataset.login, r = JSON.parse(btn.dataset.rooms);
                document.getElementById('room-modal-login').value = l;
                document.getElementById('room-modal-list').innerHTML = Array.from({length:10},(_,i)=>`chambre_${101+i}`).map(rid=>`<label class="flex items-center space-x-2 p-2 border rounded bg-gray-50"><input type="checkbox" name="room" value="${rid}" ${r.includes(rid)?'checked':''}><span>${rid.split('_')[1]}</span></label>`).join('');
                roomModal.classList.remove('hidden'); setTimeout(()=>roomModalBox.classList.remove('scale-95','opacity-0'),10);
            }
        });
        document.getElementById('room-modal-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await fetch(`${API_URL}/api/account/student/rooms`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login: document.getElementById('room-modal-login').value, rooms: Array.from(e.target.querySelectorAll('input:checked')).map(c=>c.value) }) }); window.hideRoomModal(); loadAccountDetails(); });
    }

    async function handleCreateStudent(e) {
        e.preventDefault();
        const login = document.getElementById('student-login').value, password = document.getElementById('student-password').value;
        try {
            const res = await fetch(`${API_URL}/api/account/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ login, password }) });
            if (handleAuthError(res)) return; if (!res.ok) throw new Error((await res.json()).error);
            showCustomAlert("Succès", "Compte créé."); e.target.reset(); loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }
    async function handleChangePassword(e) {
        e.preventDefault(); const cp = document.getElementById('current-password').value, np = document.getElementById('new-password').value;
        if (np !== document.getElementById('confirm-password').value) return showCustomAlert("Erreur", "Mots de passe différents");
        try { await fetch(`${API_URL}/api/account/change-password`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword: cp, newPassword: np }) }); showCustomAlert("Succès", "Mot de passe changé."); e.target.reset(); } catch (err) { showCustomAlert("Erreur", "Échec."); }
    }
    async function handleChangeEmail(e) { e.preventDefault(); try { await fetch(`${API_URL}/api/account/request-change-email`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ newEmail: document.getElementById('new-email').value, password: document.getElementById('current-password-for-email').value }) }); showCustomAlert("Succès", "Email envoyé."); e.target.reset(); } catch (err) { showCustomAlert("Erreur", "Échec."); } }
    function handleDeleteAccount() { showDeleteConfirmation("Supprimer ?", async () => { try { await fetch(`${API_URL}/api/account/delete`, { method: 'DELETE', headers: getAuthHeaders() }); localStorage.clear(); window.location.href = 'auth.html'; } catch (err) {} }); }
    async function handleChangeSubscription(np) { try { await fetch(`${API_URL}/api/account/change-subscription`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ newPlan: np }) }); showCustomAlert("Succès", "Plan changé."); loadAccountDetails(); } catch (err) {} }

    document.addEventListener('DOMContentLoaded', init);
})();