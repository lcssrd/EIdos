(function () {
    "use strict";

    // --- CONFIGURATION API ---
    // Architecture Monolithe : On utilise le domaine courant
    const API_URL = '';

    // --- AUTHENTIFICATION ---

    function getAuthToken() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (!isLoggedIn) {
            window.location.href = 'auth.html';
            return null;
        }
        return true;
    }

    function getAuthHeaders() {
        return { 'Content-Type': 'application/json' };
    }

    function handleAuthError(response) {
        if (response.status === 401) {
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'auth.html';
            return true;
        }
        return false;
    }

    // --- SYSTÈME DE MODALE & ALERTES ---

    let confirmCallback = null;

    function showDeleteConfirmation(message, callback) {
        const modal = document.getElementById('custom-confirm-modal');
        const modalBox = document.getElementById('custom-confirm-box');
        const cancelBtn = document.getElementById('custom-confirm-cancel');
        const okBtn = document.getElementById('custom-confirm-ok');

        document.getElementById('custom-confirm-title').textContent = 'Confirmation requise';
        document.getElementById('custom-confirm-message').textContent = message;

        cancelBtn.classList.remove('hidden');
        okBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        okBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        okBtn.textContent = 'Confirmer';

        confirmCallback = callback;
        modal.classList.remove('hidden');
        setTimeout(() => modalBox.classList.remove('scale-95', 'opacity-0'), 10);
    }

    // Fonction générique pour confirmer une action (Plan ou Suppression)
    function showActionModal(title, message, actionType, callback) {
        const modal = document.getElementById('custom-confirm-modal');
        const modalBox = document.getElementById('custom-confirm-box');
        const cancelBtn = document.getElementById('custom-confirm-cancel');
        const okBtn = document.getElementById('custom-confirm-ok');
        const titleEl = document.getElementById('custom-confirm-title');

        titleEl.textContent = title;
        document.getElementById('custom-confirm-message').innerHTML = message; // innerHTML pour permettre le gras

        cancelBtn.classList.remove('hidden');
        
        // Reset classes
        okBtn.className = "px-4 py-2 text-sm font-medium text-white border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";
        
        if (actionType === 'danger') {
            okBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'focus:ring-red-500');
            okBtn.textContent = 'Confirmer la perte des droits';
        } else if (actionType === 'payment') {
            okBtn.classList.add('bg-teal-600', 'hover:bg-teal-700', 'focus:ring-teal-500');
            okBtn.textContent = 'Procéder au paiement';
        } else {
            okBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'focus:ring-blue-500');
            okBtn.textContent = 'Confirmer';
        }

        confirmCallback = callback;
        modal.classList.remove('hidden');
        setTimeout(() => modalBox.classList.remove('scale-95', 'opacity-0'), 10);
    }

    function showCustomAlert(title, message) {
        const modal = document.getElementById('custom-confirm-modal');
        const modalBox = document.getElementById('custom-confirm-box');
        const cancelBtn = document.getElementById('custom-confirm-cancel');
        const okBtn = document.getElementById('custom-confirm-ok');

        cancelBtn.classList.add('hidden');
        okBtn.className = "px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors";
        okBtn.textContent = 'Fermer';

        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').innerHTML = message;

        confirmCallback = null;
        modal.classList.remove('hidden');
        setTimeout(() => modalBox.classList.remove('scale-95', 'opacity-0'), 10);
    }

    function hideConfirmation() {
        const modal = document.getElementById('custom-confirm-modal');
        const modalBox = document.getElementById('custom-confirm-box');
        modalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            confirmCallback = null;
        }, 200);
    }

    function setupModalListeners() {
        document.getElementById('custom-confirm-ok').addEventListener('click', () => {
            if (typeof confirmCallback === 'function') confirmCallback();
            hideConfirmation();
        });
        document.getElementById('custom-confirm-cancel').addEventListener('click', hideConfirmation);
        
        // Listeners pour la nouvelle modale d'édition Admin
        const closeEditBtn = document.getElementById('admin-user-edit-close');
        if(closeEditBtn) closeEditBtn.addEventListener('click', hideAdminEditModal);
        
        const cancelEditBtn = document.getElementById('admin-user-edit-cancel');
        if(cancelEditBtn) cancelEditBtn.addEventListener('click', hideAdminEditModal);
        
        const formEditUser = document.getElementById('admin-user-edit-form');
        if(formEditUser) formEditUser.addEventListener('submit', handleSaveAdminEditUser);
    }

    // --- VARIABLES GLOBALES ---

    let tabButtons = {};
    let tabContents = {};
    let currentPlan = 'free';
    
    // [MODIFICATION] Liste des chambres disponibles pour le formateur
    let availableRooms = []; 
    
    // Variables pour la modale des chambres (Formateurs)
    let roomModal, roomModalBox, roomModalForm, roomModalList, roomModalTitle, roomModalLoginInput;

    // État Admin
    let adminState = {
        organisations: [],
        independants: [],
        selectedOrgId: null,
        selectedUserId: null,
        selectedUserEmail: null,
        chartInstance: null,
        patientsPage: 1,
        patientsTotalPages: 1
    };

    function switchTab(tabId) {
        Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
        Object.values(tabContents).forEach(content => content.classList.remove('active'));

        if (tabButtons[tabId] && tabContents[tabId]) {
            tabButtons[tabId].classList.add('active');
            tabContents[tabId].classList.add('active');
        }
    }

    // --- LOGIQUE SUPER ADMIN ---

    function initAdminInterface() {
        const adminTabBtn = document.getElementById('tab-admin');
        const adminContent = document.getElementById('content-admin');
        
        if(adminTabBtn) {
            adminTabBtn.style.display = 'flex';
            tabButtons.admin = adminTabBtn;
            tabContents.admin = adminContent;

            adminTabBtn.addEventListener('click', () => {
                switchTab('admin');
                loadAdminDashboard();
            });
        }

        // Sous-navigation Admin
        document.querySelectorAll('#admin-tabs-nav button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#admin-tabs-nav button').forEach(b => {
                    b.className = "inline-block p-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300";
                });
                document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

                const targetBtn = e.target.closest('button');
                targetBtn.className = "inline-block p-4 border-b-2 rounded-t-lg text-red-600 border-red-600 active";
                const targetId = targetBtn.dataset.target;
                document.getElementById(targetId).classList.remove('hidden');

                if (targetId === 'admin-dashboard') loadAdminDashboard();
                if (targetId === 'admin-users') loadAdminStructure();
                if (targetId === 'admin-patients') loadAdminPatients(1);
                if (targetId === 'admin-tech') loadAdminLogs();
            });
        });

        // Listeners Admin
        document.getElementById('admin-user-search').addEventListener('input', debounce(handleAdminSearch, 500));
        document.getElementById('admin-impersonate-btn').addEventListener('click', handleAdminImpersonate);
        document.getElementById('admin-edit-user-btn').addEventListener('click', openAdminEditModal);
        document.getElementById('admin-delete-user-btn').addEventListener('click', handleAdminDeleteUser);
        
        document.getElementById('admin-prev-page').addEventListener('click', () => {
            if(adminState.patientsPage > 1) loadAdminPatients(adminState.patientsPage - 1);
        });
        document.getElementById('admin-next-page').addEventListener('click', () => {
            if(adminState.patientsPage < adminState.patientsTotalPages) loadAdminPatients(adminState.patientsPage + 1);
        });
        document.getElementById('admin-refresh-patients').addEventListener('click', () => loadAdminPatients(adminState.patientsPage));

        document.getElementById('admin-broadcast-btn').addEventListener('click', handleAdminBroadcast);
        document.getElementById('admin-send-email-btn').addEventListener('click', handleAdminSendEmail);
        document.getElementById('admin-send-quote-btn').addEventListener('click', handleAdminSendQuote);

        document.getElementById('admin-maintenance-toggle').addEventListener('change', handleAdminMaintenanceToggle);
        document.getElementById('admin-refresh-logs').addEventListener('click', loadAdminLogs);
    }

    // 1. Dashboard Admin
    async function loadAdminDashboard() {
        try {
            const res = await fetch(`${API_URL}/api/admin/stats`, { headers: getAuthHeaders(), credentials: 'include' });
            if(!res.ok) throw new Error();
            const data = await res.json();

            document.getElementById('kpi-total-users').textContent = data.kpis.totalUsers;
            document.getElementById('kpi-formateurs').textContent = data.kpis.totalFormateurs;
            document.getElementById('kpi-patients').textContent = data.kpis.savedPatients;
            const uptimeHours = Math.floor(data.system.uptime / 3600);
            document.getElementById('kpi-uptime').textContent = `${uptimeHours}h`;

            const recentContainer = document.getElementById('admin-recent-users');
            recentContainer.innerHTML = data.recentActivity.lastUsers.map(u => `
                <div class="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                    <div>
                        <span class="font-medium text-gray-700">${u.email}</span>
                        <span class="text-xs text-gray-500 block">${u.role} - ${new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span class="px-2 py-1 rounded bg-gray-100 text-xs">${u.subscription}</span>
                </div>
            `).join('');

            if(document.getElementById('adminPlanChart')) {
                const ctx = document.getElementById('adminPlanChart').getContext('2d');
                if(adminState.chartInstance) adminState.chartInstance.destroy();
                adminState.chartInstance = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Etudiants', 'Formateurs', 'Admin'],
                        datasets: [{
                            data: [data.kpis.totalStudents, data.kpis.totalFormateurs, 1],
                            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b']
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        } catch(e) { console.error("Err Dashboard", e); }
    }

    // 2. Recherche Admin
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    async function handleAdminSearch(e) {
        const query = e.target.value.trim();
        const resultsContainer = document.getElementById('admin-search-results');
        if (query.length < 3) {
            resultsContainer.classList.add('hidden');
            return;
        }
        try {
            const res = await fetch(`${API_URL}/api/admin/search?q=${encodeURIComponent(query)}`, { headers: getAuthHeaders(), credentials: 'include' });
            const users = await res.json();
            if(users.length === 0) {
                resultsContainer.innerHTML = '<div class="p-3 text-sm text-gray-500">Aucun résultat.</div>';
            } else {
                resultsContainer.innerHTML = users.map(u => `
                    <div class="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between items-center" 
                         onclick="selectSearchedUser('${u._id}', '${u.email || u.login}', '${u.role}', '${u.subscription}')">
                        <div>
                            <div class="font-medium text-gray-800">${u.email || u.login}</div>
                            <div class="text-xs text-gray-500">${u.role} • ${u.subscription} ${u.isSuspended ? '<span class="text-red-500 font-bold">(SUSPENDU)</span>' : ''}</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-400"></i>
                    </div>
                `).join('');
            }
            resultsContainer.classList.remove('hidden');
        } catch(err) { console.error(err); }
    }

    window.selectSearchedUser = function(id, email, role, sub) {
        document.getElementById('admin-search-results').classList.add('hidden');
        document.getElementById('admin-user-search').value = email;
        adminState.selectedUserId = id;
        adminState.selectedUserEmail = email;
        document.getElementById('admin-selected-user-email').textContent = email;
        document.getElementById('admin-selected-user-id').textContent = `ID: ${id} | ${role.toUpperCase()}`;
        document.getElementById('admin-user-actions').classList.remove('hidden');
        document.getElementById('admin-user-actions').style.display = 'flex';
    };

    // 3. Navigation Admin (Miller Columns)
    async function loadAdminStructure() {
        try {
            const res = await fetch(`${API_URL}/api/admin/structure`, { headers: getAuthHeaders(), credentials: 'include' });
            const data = await res.json();
            adminState.organisations = data.organisations;
            adminState.independants = data.independants;
            renderAdminCol1();
        } catch (err) { showCustomAlert("Erreur Admin", err.message); }
    }

    function renderAdminCol1() {
        const container = document.getElementById('admin-list-orgs');
        let html = `
            <div class="miller-item font-medium" onclick="handleAdminSelectOrg('independants', this)">
                <span><i class="fas fa-user-tie mr-2 text-teal-600"></i> Indépendants</span>
                <span class="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600">${adminState.independants.length}</span>
            </div>
        `;
        adminState.organisations.forEach(org => {
            html += `
                <div class="miller-item" onclick="handleAdminSelectOrg('${org._id}', this)">
                    <div>
                        <div class="font-medium text-gray-800">${org.name}</div>
                        <div class="text-xs text-gray-500">Plan: ${org.plan} (${org.licences_utilisees}/${org.licences_max})</div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>`;
        });
        container.innerHTML = html;
    }

    window.handleAdminSelectOrg = async function(idOrType, el) {
        document.querySelectorAll('#admin-list-orgs .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        adminState.selectedOrgId = idOrType;
        
        const trainersContainer = document.getElementById('admin-list-trainers');
        trainersContainer.innerHTML = '<p class="p-4 text-sm text-gray-500">Chargement...</p>';
        document.getElementById('admin-list-students').innerHTML = '';
        
        let users = [];
        if (idOrType === 'independants') {
            users = adminState.independants;
        } else {
            const res = await fetch(`${API_URL}/api/admin/centre/${idOrType}/formateurs`, { headers: getAuthHeaders(), credentials: 'include' });
            users = await res.json();
        }
        
        let html = '';
        users.forEach(u => {
            html += `<div class="miller-item" onclick="handleAdminSelectTrainer('${u._id}', '${u.email}', this)">
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate text-gray-800">${u.email}</div>
                    <div class="text-xs text-gray-500">${u.role} ${u.isSuspended ? '(SUSPENDU)' : ''}</div>
                </div>
                <i class="fas fa-chevron-right text-gray-400 ml-2"></i>
            </div>`;
        });
        trainersContainer.innerHTML = html || '<p class="p-4 text-sm italic">Aucun utilisateur.</p>';
    };

    window.handleAdminSelectTrainer = async function(userId, userEmail, el) {
        document.querySelectorAll('#admin-list-trainers .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        adminState.selectedUserId = userId;
        adminState.selectedUserEmail = userEmail;
        
        document.getElementById('admin-selected-user-email').textContent = userEmail;
        document.getElementById('admin-selected-user-id').textContent = `ID: ${userId}`;
        document.getElementById('admin-user-actions').classList.remove('hidden');
        document.getElementById('admin-user-actions').style.display = 'flex';

        const studentsContainer = document.getElementById('admin-list-students');
        studentsContainer.innerHTML = '<p class="p-4 text-sm text-gray-500">Chargement...</p>';
        const res = await fetch(`${API_URL}/api/admin/creator/${userId}/students`, { headers: getAuthHeaders(), credentials: 'include' });
        const students = await res.json();
        
        let html = '';
        students.forEach(s => {
            html += `<div class="miller-item" onclick="handleAdminSelectStudent('${s._id}', '${s.login}', this)">
                <div class="font-medium text-sm"><i class="fas fa-user-graduate mr-2 text-gray-400"></i>${s.login}</div>
            </div>`;
        });
        studentsContainer.innerHTML = html || '<p class="p-4 text-sm italic">Aucun étudiant.</p>';
    };

    window.handleAdminSelectStudent = function(userId, login, el) {
        document.querySelectorAll('#admin-list-students .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        adminState.selectedUserId = userId;
        adminState.selectedUserEmail = `Étudiant: ${login}`;
        document.getElementById('admin-selected-user-email').textContent = adminState.selectedUserEmail;
        document.getElementById('admin-selected-user-id').textContent = `ID: ${userId}`;
    };

    // 4. Actions Admin
    async function handleAdminImpersonate() {
        if(!adminState.selectedUserId) return;
        if(!confirm(`Se connecter en tant que ${adminState.selectedUserEmail} ?`)) return;
        try {
            const res = await fetch(`${API_URL}/api/admin/impersonate/${adminState.selectedUserId}`, { method: 'POST', headers: getAuthHeaders(), credentials: 'include' });
            if(!res.ok) throw new Error((await res.json()).error);
            window.location.href = 'simul.html';
        } catch(err) { showCustomAlert("Erreur", err.message); }
    }

    async function handleAdminDeleteUser() {
        if (!adminState.selectedUserId) return;
        showDeleteConfirmation(`ADMIN: Supprimer ${adminState.selectedUserEmail} ?`, async () => {
            try {
                await fetch(`${API_URL}/api/admin/user/${adminState.selectedUserId}`, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
                showCustomAlert("Succès", "Utilisateur supprimé.");
                loadAdminStructure();
                document.getElementById('admin-user-actions').style.display = 'none';
            } catch(err) { showCustomAlert("Erreur", err.message); }
        });
    }

    function openAdminEditModal() {
        if (!adminState.selectedUserId) return;
        document.getElementById('admin-edit-user-id').value = adminState.selectedUserId;
        document.getElementById('admin-edit-email').value = adminState.selectedUserEmail.includes('Étudiant') ? '' : adminState.selectedUserEmail;
        const modal = document.getElementById('admin-user-edit-modal');
        const box = document.getElementById('admin-user-edit-box');
        modal.classList.remove('hidden');
        setTimeout(() => box.classList.remove('scale-95', 'opacity-0'), 10);
    }

    function hideAdminEditModal() {
        const modal = document.getElementById('admin-user-edit-modal');
        const box = document.getElementById('admin-user-edit-box');
        box.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    async function handleSaveAdminEditUser(e) {
        e.preventDefault();
        const userId = document.getElementById('admin-edit-user-id').value;
        const email = document.getElementById('admin-edit-email').value;
        const plan = document.getElementById('admin-edit-plan').value;
        const isSuspended = document.getElementById('admin-edit-suspended').checked;
        const payload = { isSuspended };
        if(email) payload.email = email;
        if(plan) payload.plan = plan;

        try {
            const res = await fetch(`${API_URL}/api/admin/user/${userId}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload), credentials: 'include' });
            if(!res.ok) throw new Error();
            showCustomAlert("Succès", "Utilisateur modifié.");
            hideAdminEditModal();
            loadAdminStructure();
        } catch(err) { showCustomAlert("Erreur", "Modification échouée."); }
    }

    // 5. Patients (Gestion double colonne)
    async function loadAdminPatients(page = 1) {
        const privateList = document.getElementById('admin-private-cases-list');
        const publicList = document.getElementById('admin-public-cases-list');
        
        privateList.innerHTML = '<p class="text-center text-gray-500 p-4">Chargement...</p>';
        publicList.innerHTML = '<p class="text-center text-gray-500 p-4">Chargement...</p>';

        try {
            const res = await fetch(`${API_URL}/api/admin/patients?page=${page}&limit=50`, { headers: getAuthHeaders(), credentials: 'include' });
            const data = await res.json();
            
            adminState.patientsPage = data.page;
            adminState.patientsTotalPages = data.totalPages;
            document.getElementById('admin-patient-page').textContent = data.page;
            document.getElementById('admin-patient-total-pages').textContent = data.totalPages;
            
            // Pagination UI
            const prevBtn = document.getElementById('admin-prev-page');
            const nextBtn = document.getElementById('admin-next-page');
            prevBtn.disabled = data.page <= 1;
            prevBtn.classList.toggle('opacity-50', data.page <= 1);
            nextBtn.disabled = data.page >= data.totalPages;
            nextBtn.classList.toggle('opacity-50', data.page >= data.totalPages);

            // Séparation des listes
            const privatePatients = data.patients.filter(p => !p.isPublic);
            const publicPatients = data.patients.filter(p => p.isPublic);

            document.getElementById('count-private-cases').textContent = privatePatients.length;
            document.getElementById('count-public-cases').textContent = publicPatients.length;

            renderPatientList(privateList, privatePatients, 'private');
            renderPatientList(publicList, publicPatients, 'public');

        } catch(err) { 
            privateList.innerHTML = `<p class="text-red-500 p-4">${err.message}</p>`; 
            publicList.innerHTML = '';
        }
    }

    function renderPatientList(container, patients, type) {
        if (patients.length === 0) {
            container.innerHTML = '<p class="text-sm italic text-gray-400 text-center p-4">Aucun dossier.</p>';
            return;
        }

        container.innerHTML = patients.map(p => {
            const owner = p.user ? (p.user.email || p.user.login) : 'Utilisateur supprimé';
            const date = new Date(p.updatedAt).toLocaleDateString();
            
            // Bouton d'action principal (Publier ou Privatiser)
            const actionBtn = type === 'private'
                ? `<button onclick="handleAdminTogglePublic('${p.patientId}', true)" class="text-teal-600 hover:bg-teal-50 p-2 rounded transition-colors" title="Publier dans la bibliothèque"><i class="fas fa-globe"></i></button>`
                : `<button onclick="handleAdminTogglePublic('${p.patientId}', false)" class="text-orange-600 hover:bg-orange-50 p-2 rounded transition-colors" title="Retirer de la bibliothèque"><i class="fas fa-folder"></i></button>`;

            return `
                <div class="admin-patient-card bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center group">
                    <div class="overflow-hidden">
                        <div class="font-bold text-gray-800 truncate" title="${p.sidebar_patient_name}">${p.sidebar_patient_name}</div>
                        <div class="text-xs text-gray-500 truncate"><i class="fas fa-user mr-1"></i>${owner}</div>
                        <div class="text-xs text-gray-400 mt-1"><i class="far fa-clock mr-1"></i>${date}</div>
                    </div>
                    <div class="flex space-x-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        ${actionBtn}
                        <button onclick="handleAdminDeletePatient('${p.patientId}', '${p.sidebar_patient_name}')" class="text-red-500 hover:bg-red-50 p-2 rounded transition-colors" title="Supprimer définitivement"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.handleAdminTogglePublic = async function(patientId, makePublic) {
        // Optimistic UI update could be added here, but simple reload is safer
        try { 
            await fetch(`${API_URL}/api/admin/patients/${patientId}/public`, { method: 'PUT', headers: getAuthHeaders(), credentials: 'include' }); 
            loadAdminPatients(adminState.patientsPage);
        } catch(err) { showCustomAlert("Erreur", "Changement de statut échoué"); }
    };

    window.handleAdminDeletePatient = function(id, name) {
        showDeleteConfirmation(`Supprimer dossier "${name}" ?`, async () => {
            await fetch(`${API_URL}/api/admin/patients/${id}`, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
            loadAdminPatients(adminState.patientsPage);
        });
    };

    // 6. Communication
    async function handleAdminBroadcast() {
        const msg = document.getElementById('admin-broadcast-msg').value;
        if(!msg || !confirm("Diffuser ?")) return;
        try {
            await fetch(`${API_URL}/api/admin/broadcast`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ message: msg }), credentials: 'include' });
            showCustomAlert("Envoyé", "Message diffusé.");
            document.getElementById('admin-broadcast-msg').value = '';
        } catch(e) { showCustomAlert("Erreur", e.message); }
    }

    async function handleAdminSendEmail() {
        const target = document.getElementById('admin-email-target').value;
        const specific = document.getElementById('admin-email-specific').value;
        const subject = document.getElementById('admin-email-subject').value;
        const body = document.getElementById('admin-email-body').value;
        if(!subject || !body) return alert("Sujet et message requis.");
        const to = (target === 'specific') ? specific : target;
        
        try {
            await fetch(`${API_URL}/api/admin/email`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ to, subject, html: body }), credentials: 'include' });
            showCustomAlert("Succès", "Email envoyé.");
        } catch(e) { showCustomAlert("Erreur", e.message); }
    }

    document.getElementById('admin-email-target').addEventListener('change', (e) => {
        const el = document.getElementById('admin-email-specific');
        if(e.target.value === 'specific') el.classList.remove('hidden'); else el.classList.add('hidden');
    });

    async function handleAdminSendQuote() {
        const email = document.getElementById('quote-client-email').value;
        const amount = document.getElementById('quote-amount').value;
        const details = document.getElementById('quote-details').value;
        if(!email || !amount) return;
        try {
            await fetch(`${API_URL}/api/admin/quotes`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ clientEmail: email, amount, details }), credentials: 'include' });
            showCustomAlert("Succès", "Devis envoyé.");
        } catch(e) { showCustomAlert("Erreur", e.message); }
    }

    // 7. Tech & Logs
    async function loadAdminLogs() {
        const container = document.getElementById('admin-logs-container');
        container.innerHTML = '<p class="text-gray-500">Chargement...</p>';
        try {
            const res = await fetch(`${API_URL}/api/admin/logs`, { headers: getAuthHeaders(), credentials: 'include' });
            const data = await res.json();
            document.getElementById('admin-maintenance-toggle').checked = data.maintenanceMode;
            if(data.logs.length === 0) container.innerHTML = '<p class="text-gray-500">Aucun log récent.</p>';
            else {
                container.innerHTML = data.logs.map(l => {
                    const color = l.level === 'error' ? 'log-error' : (l.level === 'warn' ? 'log-warn' : 'log-info');
                    return `<div class="log-line"><span class="text-gray-500">[${new Date(l.timestamp).toLocaleTimeString()}]</span> <span class="${color} font-bold uppercase">${l.level}</span>: ${l.message}</div>`;
                }).join('');
            }
        } catch(e) { container.innerHTML = "Erreur logs."; }
    }

    async function handleAdminMaintenanceToggle(e) {
        const active = e.target.checked;
        if(!confirm(`Mode maintenance : ${active ? 'ON' : 'OFF'} ?`)) { e.target.checked = !active; return; }
        try {
            await fetch(`${API_URL}/api/admin/maintenance`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ active }), credentials: 'include' });
            const badge = document.getElementById('maintenance-badge');
            if(active) badge.classList.remove('hidden'); else badge.classList.add('hidden');
        } catch(err) { e.target.checked = !active; showCustomAlert("Erreur", "Echec."); }
    }

    // --- FONCTIONS CLASSIQUES (Gestion Compte) ---

    async function loadAccountDetails() {
        try {
            const response = await fetch(`${API_URL}/api/account/details`, { headers: getAuthHeaders(), credentials: 'include' });
            if (handleAuthError(response)) return;
            const data = await response.json();

            // Super Admin
            if (data.is_super_admin) {
                initAdminInterface();
                // Check maintenance
                fetch(`${API_URL}/api/admin/logs`, { headers: getAuthHeaders(), credentials: 'include' }).then(r => r.json()).then(d => {
                    if(d.maintenanceMode) document.getElementById('maintenance-badge').classList.remove('hidden');
                });
            }

            // Assignation immédiate du plan
            currentPlan = data.plan;
            
            // [MODIFICATION] Gestion dynamique des chambres
            // Récupère les chambres du serveur ou fallback sur 101-110 si vide
            availableRooms = data.rooms || [];
            if (availableRooms.length === 0) {
                for (let i = 101; i <= 110; i++) availableRooms.push(String(i));
            }

            // UI Standard
            const planNameEl = document.getElementById('current-plan-name');
            const planDescEl = document.getElementById('plan-description');
            
            if (data.role === 'formateur' || data.role === 'owner') {
                if (data.organisation) {
                    if(data.role === 'owner') {
                        planNameEl.textContent = `Plan ${data.organisation.plan} (Propriétaire)`;
                        document.getElementById('tab-centre').style.display = 'flex';
                        renderCentreDetails(data.organisation);
                    } else {
                        planNameEl.textContent = `Plan ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}`;
                        planDescEl.innerHTML = `Votre compte dépend de <strong>${data.organisation.name}</strong>`;
                    }
                } else {
                    planNameEl.textContent = data.plan.charAt(0).toUpperCase() + data.plan.slice(1);
                }
                document.getElementById('tab-invitations').style.display = 'flex';
                renderStudentTable(data.students || []);
            } else {
                planNameEl.textContent = "Free";
                planDescEl.textContent = "Compte découverte.";
            }
            
            updateSubscriptionButtons(data.plan, data.organisation?.quote_url, data.organisation?.quote_price);

        } catch (err) { console.error(err); }
    }

    function renderStudentTable(students) {
        const tbody = document.getElementById('permissions-tbody');
        
        const limits = { 'free': 0, 'independant': 5, 'promo': 40, 'centre': Infinity };
        const limit = limits[currentPlan] || 0;
        const count = students.length;
        const limitText = (limit === Infinity) ? "Illimité" : limit;
        
        let badgeColor = "bg-indigo-100 text-indigo-800";
        if (limit !== Infinity && count >= limit) {
            badgeColor = "bg-red-100 text-red-800";
        } else if (limit !== Infinity && count >= limit * 0.8) {
            badgeColor = "bg-yellow-100 text-yellow-800";
        }

        const titleEl = document.getElementById('student-list-title');
        if (titleEl) {
            titleEl.innerHTML = `
                Gestion des étudiants 
                <span class="ml-3 text-sm font-bold ${badgeColor} px-3 py-1 rounded-full border border-opacity-20 shadow-sm" style="font-family: 'Inter', sans-serif;">
                    ${count} / ${limitText}
                </span>
            `;
        }
        
        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="15" class="p-4 text-center text-gray-500">Aucun étudiant.</td></tr>`;
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
            html += `<td class="p-2 text-center align-middle"><button type="button" class="manage-rooms-btn text-sm text-indigo-600 hover:underline" data-login="${student.login}" data-name="${student.login}" data-rooms='${JSON.stringify(student.allowedRooms || [])}'>Gérer (${roomCount})</button></td>`;
            html += `<td class="p-2 text-center align-middle"><button data-login="${student.login}" class="delete-student-btn text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button></td></tr>`;
        });
        tbody.innerHTML = html;
    }

    function renderCentreDetails(organisation) {
        document.getElementById('centre-plan-name').textContent = `Plan ${organisation.plan} ("${organisation.name}")`;
        document.getElementById('centre-plan-details').textContent = `Licences: ${organisation.licences_utilisees} / ${organisation.licences_max || 'Infini'}`;
        
        const listContainer = document.getElementById('formateurs-list-container');
        
        const loadingEl = document.getElementById('formateurs-loading');
        if (loadingEl) loadingEl.style.display = 'none';

        let html = '';
        if (organisation.invitations && organisation.invitations.length > 0) {
            html += `<div class="mb-4"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Invitations</h4><div class="space-y-2">`;
            html += organisation.invitations.map(inv => `
                <div class="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <span class="text-sm font-medium">${inv.email}</span>
                    <button type="button" class="delete-invitation-btn text-xs text-red-500" data-id="${inv._id}" data-email="${inv.email}">Annuler</button>
                </div>`).join('');
            html += `</div></div>`;
        }
        
        html += `<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Actifs</h4>`;
        if (!organisation.formateurs || organisation.formateurs.length === 0) {
            html += '<p class="text-sm text-gray-500 italic">Aucun.</p>';
        } else {
            html += `<div class="space-y-2">` + organisation.formateurs.map(f => `
                <div class="flex items-center justify-between p-2 bg-gray-50 rounded-md border">
                    <span class="text-sm font-medium">${f.email}</span>
                    <button type="button" class="remove-formateur-btn text-xs text-red-500" data-email="${f.email}">Retirer</button>
                </div>`).join('') + `</div>`;
        }
        listContainer.innerHTML = html;
    }

    function updateSubscriptionButtons(activePlan, quoteUrl, quotePrice) {
        const styles = {
            'free': { badge: ['bg-yellow-300', 'text-yellow-800'], border: 'border-yellow-300' },
            'independant': { badge: ['bg-teal-600', 'text-white'], border: 'border-teal-600' },
            'promo': { badge: ['bg-blue-600', 'text-white'], border: 'border-blue-600' },
            'centre': { badge: ['bg-indigo-600', 'text-white'], border: 'border-indigo-600' }
        };
        
        ['free', 'independant', 'promo', 'centre'].forEach(plan => {
            const btn = document.getElementById(`sub-btn-${plan}`);
            if(!btn) return;
            const card = btn.closest('.card');
            const badge = card.querySelector('.js-active-plan-badge');

            // Reset visuel
            card.classList.remove('shadow-xl', 'border-2', styles[plan].border);
            card.classList.add('hover:scale-[1.02]', 'hover:shadow-xl');
            badge.classList.add('hidden');
            badge.classList.remove(...styles[plan].badge);
            btn.disabled = false;
            
            // Gestion du texte et des classes par défaut
            if (plan === 'free') btn.innerHTML = 'Passer au Gratuit';
            else btn.innerHTML = 'Choisir ce plan';
            
            btn.className = btn.className.replace(/cursor-not-allowed|opacity-75/g, ''); 

            // Si c'est le plan actuel
            if (plan === activePlan) {
                card.classList.add('shadow-xl', 'border-2', styles[plan].border);
                card.classList.remove('hover:scale-[1.02]', 'hover:shadow-xl');
                badge.classList.remove('hidden');
                badge.classList.add(...styles[plan].badge);
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-check mr-2"></i> Plan Actuel';
                btn.classList.add('cursor-not-allowed', 'opacity-75');
            } else {
                // Si ce n'est pas le plan actuel, on attache le click handler
                // On clone le nœud pour retirer les anciens event listeners (méthode rapide)
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', () => handlePlanSelection(plan));
            }
        });
        
        // Gestion spécifique bouton Centre (Devis)
        const centerBtn = document.getElementById('sub-btn-centre');
        if(activePlan === 'centre' && quoteUrl) {
             centerBtn.innerHTML = `Activer devis (${quotePrice})`;
             centerBtn.onclick = () => window.location.href = quoteUrl;
             centerBtn.disabled = false;
             centerBtn.classList.remove('cursor-not-allowed', 'opacity-75');
        } else if (activePlan !== 'centre') {
             centerBtn.onclick = () => switchTab('contact');
        }
    }

    // --- HANDLERS CLASSIQUES ---

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    function handlePlanSelection(targetPlan) {
        if (targetPlan === 'free') {
            // Cas du Downgrade vers Free
            showActionModal(
                "Passer au plan Gratuit ?", 
                "Attention : <br><br>• Vous perdrez vos droits de formateur.<br>• Vos sauvegardes en ligne seront gelées ou supprimées.<br>• L'accès étudiant sera désactivé.<br>• Votre abonnement payant sera résilié immédiatement.", 
                "danger", 
                async () => {
                    try {
                        const response = await fetch(`${API_URL}/api/account/downgrade`, { 
                            method: 'POST', 
                            headers: getAuthHeaders(), 
                            credentials: 'include' 
                        });
                        
                        if (!response.ok) throw new Error("Erreur serveur");
                        
                        showCustomAlert("Abonnement modifié", "Vous êtes repassé au plan Gratuit.");
                        loadAccountDetails(); // Recharger la page pour mettre à jour l'UI
                    } catch (err) {
                        showCustomAlert("Erreur", "Impossible de changer le plan pour le moment.");
                    }
                }
            );
        } else if (targetPlan === 'independant' || targetPlan === 'promo') {
            // Cas de l'Upgrade (Paywall)
            const planNames = { 'independant': 'Indépendant', 'promo': 'Promo' };
            const prettyName = planNames[targetPlan];
            
            showActionModal(
                `Souscrire au plan ${prettyName}`,
                `Vous avez choisi le plan <strong>${prettyName}</strong>.<br><br>En confirmant, vous serez redirigé vers notre plateforme de paiement sécurisée (Stripe) pour finaliser votre abonnement.`,
                "payment",
                () => {
                    // Simulation du Paywall (Placeholder)
                    // Plus tard: window.location.href = data.stripeSessionUrl;
                    showCustomAlert("Redirection Paiement", `(Simulation) Redirection vers Stripe pour le plan ${prettyName}...<br><br>Cette fonctionnalité sera activée prochainement.`);
                }
            );
        }
    }

    async function handleInviteFormateur(e) {
        e.preventDefault();
        const email = document.getElementById('invite-email').value;
        try {
            const response = await fetch(`${API_URL}/api/organisation/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }), credentials: 'include' });
            if (!response.ok) throw new Error();
            showCustomAlert("Succès", "Invitation envoyée.");
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", "Echec envoi."); }
    }

    async function handleCreateStudent(e) {
        e.preventDefault();
        const login = document.getElementById('student-login').value;
        const password = document.getElementById('student-password').value;
        try {
            const response = await fetch(`${API_URL}/api/account/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ login, password }), credentials: 'include' });
            if (!response.ok) throw new Error();
            showCustomAlert("Succès", `Étudiant ${login} créé.`);
            document.getElementById('create-student-form').reset();
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", "Création échouée."); }
    }

    async function handleDeleteAccount() {
        showDeleteConfirmation("Supprimer définitivement votre compte ?", async () => {
            try {
                const response = await fetch(`${API_URL}/api/account/delete`, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
                if (!response.ok) throw new Error();
                localStorage.clear();
                window.location.href = 'auth.html';
            } catch (err) { showCustomAlert("Erreur", "Echec suppression."); }
        });
    }

    function hideRoomModal() {
        roomModalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => { roomModal.classList.add('hidden'); }, 200);
    }

    function handleOpenRoomModal(button) {
        const login = button.dataset.login;
        const name = button.dataset.name;
        const assignedRooms = JSON.parse(button.dataset.rooms || '[]'); // Chambres déjà assignées à l'étudiant

        roomModalTitle.textContent = `Gérer les chambres pour ${name}`;
        roomModalLoginInput.value = login;

        let roomCheckboxesHTML = '';
        
        // [MODIFICATION] Utilisation de la liste dynamique availableRooms
        // On trie les chambres numériquement
        availableRooms.sort((a, b) => parseInt(a) - parseInt(b));

        availableRooms.forEach(roomNb => {
            const roomId = `chambre_${roomNb}`;
            const isChecked = assignedRooms.includes(roomId);
            roomCheckboxesHTML += `
                <label class="flex items-center space-x-2 p-2 border rounded-md ${isChecked ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50' } cursor-pointer hover:bg-gray-100">
                    <input type="checkbox" name="room" value="${roomId}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
                    <span class="font-medium text-sm">${roomNb}</span>
                </label>`;
        });

        roomModalList.innerHTML = roomCheckboxesHTML;
        roomModal.classList.remove('hidden');
        setTimeout(() => roomModalBox.classList.remove('scale-95', 'opacity-0'), 10);
    }

    async function handleSaveStudentRooms(e) {
        e.preventDefault();
        const login = roomModalLoginInput.value;
        const selectedRooms = Array.from(roomModalForm.querySelectorAll('input[name="room"]:checked')).map(cb => cb.value);
        try {
            const response = await fetch(`${API_URL}/api/account/student/rooms`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login: login, rooms: selectedRooms }), credentials: 'include' });
            if (!response.ok) throw new Error();
            hideRoomModal();
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", "Sauvegarde échouée."); }
    }

    // --- INIT ---

    function init() {
        if (!getAuthToken()) return;

        ['security', 'subscription', 'centre', 'invitations', 'contact'].forEach(tab => {
            const btn = document.getElementById(`tab-${tab}`);
            const content = document.getElementById(`content-${tab}`);
            if(btn && content) {
                tabButtons[tab] = btn;
                tabContents[tab] = content;
                btn.addEventListener('click', () => switchTab(tab));
            }
        });

        setupModalListeners();

        // Refs modale chambres
        roomModal = document.getElementById('room-modal');
        roomModalBox = document.getElementById('room-modal-box');
        roomModalForm = document.getElementById('room-modal-form');
        roomModalList = document.getElementById('room-modal-list');
        roomModalTitle = document.getElementById('room-modal-title');
        roomModalLoginInput = document.getElementById('room-modal-login');

        document.getElementById('room-modal-cancel').addEventListener('click', hideRoomModal);
        roomModalForm.addEventListener('submit', handleSaveStudentRooms);

        document.getElementById('change-password-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const cur = document.getElementById('current-password').value;
            const neu = document.getElementById('new-password').value;
            const conf = document.getElementById('confirm-password').value;
            if(neu !== conf) return showCustomAlert("Erreur", "Mots de passe différents");
            try {
                const res = await fetch(`${API_URL}/api/account/change-password`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword: cur, newPassword: neu }), credentials: 'include' });
                if(!res.ok) throw new Error();
                showCustomAlert("Succès", "Mot de passe changé.");
                e.target.reset();
            } catch(err) { showCustomAlert("Erreur", "Erreur changement mot de passe"); }
        });

        document.getElementById('delete-account-btn').addEventListener('click', handleDeleteAccount);
        document.getElementById('invite-formateur-form').addEventListener('submit', handleInviteFormateur);
        document.getElementById('create-student-form').addEventListener('submit', handleCreateStudent);
        document.getElementById('generate-credentials-btn').addEventListener('click', () => {
            document.getElementById('student-login').value = `etu${Math.floor(Math.random()*9000)+1000}`;
            document.getElementById('student-password').value = generateRandomString(8);
        });

        document.getElementById('formateurs-list-container').addEventListener('click', async (e) => {
            const removeBtn = e.target.closest('.remove-formateur-btn');
            if (removeBtn) {
                const email = removeBtn.dataset.email;
                showDeleteConfirmation(`Retirer le formateur ${email} ?`, async () => {
                    try {
                        await fetch(`${API_URL}/api/organisation/remove`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }), credentials: 'include' });
                        loadAccountDetails();
                        showCustomAlert("Succès", "Formateur retiré.");
                    } catch (err) { showCustomAlert("Erreur", "Impossible de retirer."); }
                });
                return;
            }
            const deleteInviteBtn = e.target.closest('.delete-invitation-btn');
            if (deleteInviteBtn) {
                if(!confirm(`Annuler l'invitation ?`)) return;
                try {
                    await fetch(`${API_URL}/api/organisation/invite/${deleteInviteBtn.dataset.id}`, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
                    loadAccountDetails();
                } catch (err) { showCustomAlert("Erreur", "Impossible d'annuler."); }
            }
        });

        document.getElementById('permissions-tbody').addEventListener('change', async (e) => {
            if(e.target.type === 'checkbox') {
                const { login, permission } = e.target.dataset;
                try {
                    await fetch(`${API_URL}/api/account/permissions`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login, permission, value: e.target.checked }), credentials: 'include' });
                } catch(err) { e.target.checked = !e.target.checked; }
            }
        });

        document.getElementById('permissions-tbody').addEventListener('click', async (e) => {
            if(e.target.closest('.delete-student-btn')) {
                const login = e.target.closest('.delete-student-btn').dataset.login;
                showDeleteConfirmation(`Supprimer étudiant ${login} ?`, async () => {
                    await fetch(`${API_URL}/api/account/student`, { method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ login }), credentials: 'include' });
                    loadAccountDetails();
                });
                return;
            }
            const manageRoomsBtn = e.target.closest('.manage-rooms-btn');
            if (manageRoomsBtn) handleOpenRoomModal(manageRoomsBtn);
        });

        loadAccountDetails();
        switchTab('security');
    }

    document.addEventListener('DOMContentLoaded', init);

})();