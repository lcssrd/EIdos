(function () {
    "use strict";

    const API_URL = 'https://eidos-api.onrender.com';
    // MODIFIÉ : Suppression de la constante ADMIN_EMAIL

    // --- AUTHENTIFICATION ---

    function getAuthToken() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.error("Aucun token trouvé, redirection vers login.");
            window.location.href = 'auth.html';
            return null;
        }
        return token;
    }

    function getAuthHeaders() {
        const token = getAuthToken();
        if (!token) throw new Error("Token non trouvé.");
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
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

    // --- SYSTÈME DE MODALE (Confirmation & Alertes) ---
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

    function showCustomAlert(title, message) {
        const modal = document.getElementById('custom-confirm-modal');
        const modalBox = document.getElementById('custom-confirm-box');
        const cancelBtn = document.getElementById('custom-confirm-cancel');
        const okBtn = document.getElementById('custom-confirm-ok');

        cancelBtn.classList.add('hidden');
        okBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        okBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        okBtn.textContent = 'Fermer';

        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;

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
    }

    // --- GESTION GÉNÉRALE DE L'INTERFACE ---

    let tabButtons = {};
    let tabContents = {};
    let currentPlan = 'free';
    let studentCount = 0;
    let currentUserEmail = '';

    // Variables pour la modale des chambres (Restaurées)
    let roomModal, roomModalBox, roomModalForm, roomModalList, roomModalTitle, roomModalLoginInput;

    function switchTab(tabId) {
        Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
        Object.values(tabContents).forEach(content => content.classList.remove('active'));

        if (tabButtons[tabId] && tabContents[tabId]) {
            tabButtons[tabId].classList.add('active');
            tabContents[tabId].classList.add('active');
        }
    }

    // --- LOGIQUE SUPER ADMIN ---

    let adminState = {
        organisations: [],
        independants: [],
        selectedOrgId: null, 
        selectedUserId: null,
        selectedUserEmail: null
    };

    function initAdminInterface() {
        const adminTabBtn = document.getElementById('tab-admin');
        const adminContent = document.getElementById('content-admin');
        
        adminTabBtn.style.display = 'flex';
        
        tabButtons.admin = adminTabBtn;
        tabContents.admin = adminContent;

        adminTabBtn.addEventListener('click', () => {
            switchTab('admin');
            loadAdminStructure();
        });

        document.querySelectorAll('#admin-tabs-nav button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#admin-tabs-nav button').forEach(b => {
                    b.className = "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300";
                });
                document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

                e.target.className = "inline-block p-4 border-b-2 rounded-t-lg hover:text-gray-600 hover:border-gray-300 active text-red-600 border-red-600";
                const targetId = e.target.dataset.target;
                document.getElementById(targetId).classList.remove('hidden');

                if (targetId === 'admin-patients') {
                    loadAdminPatients();
                }
            });
        });

        document.getElementById('admin-delete-user-btn').addEventListener('click', handleAdminDeleteUser);
        document.getElementById('admin-refresh-patients').addEventListener('click', loadAdminPatients);
    }

    async function loadAdminStructure() {
        try {
            const response = await fetch(`${API_URL}/api/admin/structure`, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error("Erreur chargement structure");
            const data = await response.json();
            
            adminState.organisations = data.organisations;
            adminState.independants = data.independants;
            
            renderAdminCol1();
            document.getElementById('admin-list-trainers').innerHTML = '<p class="p-4 text-sm text-gray-400 italic">Sélectionnez un centre...</p>';
            document.getElementById('admin-list-students').innerHTML = '<p class="p-4 text-sm text-gray-400 italic">Sélectionnez un formateur...</p>';
            document.getElementById('admin-user-actions').style.display = 'none';
            
        } catch (err) {
            showCustomAlert("Erreur Admin", err.message);
        }
    }

    function renderAdminCol1() {
        const container = document.getElementById('admin-list-orgs');
        let html = '';

        html += `
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
                </div>
            `;
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
        document.getElementById('admin-user-actions').style.display = 'none';

        let usersToDisplay = [];

        if (idOrType === 'independants') {
            usersToDisplay = adminState.independants;
        } else {
            try {
                const response = await fetch(`${API_URL}/api/admin/centre/${idOrType}/formateurs`, { headers: getAuthHeaders() });
                if (!response.ok) throw new Error("Erreur chargement formateurs");
                usersToDisplay = await response.json();
            } catch (err) {
                trainersContainer.innerHTML = `<p class="text-red-500 p-4">${err.message}</p>`;
                return;
            }
        }

        renderAdminCol2(usersToDisplay);
    };

    function renderAdminCol2(users) {
        const container = document.getElementById('admin-list-trainers');
        if (users.length === 0) {
            container.innerHTML = '<p class="p-4 text-sm text-gray-400 italic">Aucun utilisateur trouvé.</p>';
            return;
        }

        let html = '';
        users.forEach(u => {
            const isOwner = u.is_owner;
            const icon = isOwner ? '<i class="fas fa-crown text-yellow-500 mr-2" title="Propriétaire"></i>' : '<i class="fas fa-user mr-2 text-gray-400"></i>';
            const roleLabel = isOwner ? 'Propriétaire' : (u.role === 'formateur' ? 'Formateur' : 'Utilisateur');
            
            html += `
                <div class="miller-item" onclick="handleAdminSelectTrainer('${u._id}', '${u.email}', this)">
                    <div>
                        <div class="font-medium text-sm truncate w-40" title="${u.email}">${icon}${u.email}</div>
                        <div class="text-xs text-gray-500">${roleLabel}</div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    window.handleAdminSelectTrainer = async function(userId, userEmail, el) {
        document.querySelectorAll('#admin-list-trainers .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');

        adminState.selectedUserId = userId;
        adminState.selectedUserEmail = userEmail;

        const actionPanel = document.getElementById('admin-user-actions');
        document.getElementById('admin-selected-user-email').textContent = userEmail;
        actionPanel.style.display = 'flex';

        const studentsContainer = document.getElementById('admin-list-students');
        studentsContainer.innerHTML = '<p class="p-4 text-sm text-gray-500">Chargement...</p>';

        try {
            const response = await fetch(`${API_URL}/api/admin/creator/${userId}/students`, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error("Erreur chargement étudiants");
            const students = await response.json();
            renderAdminCol3(students);
        } catch (err) {
            studentsContainer.innerHTML = `<p class="text-red-500 p-4">${err.message}</p>`;
        }
    };

    function renderAdminCol3(students) {
        const container = document.getElementById('admin-list-students');
        if (students.length === 0) {
            container.innerHTML = '<p class="p-4 text-sm text-gray-400 italic">Aucun étudiant.</p>';
            return;
        }

        let html = '';
        students.forEach(s => {
            html += `
                <div class="miller-item" onclick="handleAdminSelectStudent('${s._id}', '${s.login}', this)">
                    <div>
                        <div class="font-medium text-sm"><i class="fas fa-graduation-cap mr-2 text-gray-400"></i>${s.login}</div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    window.handleAdminSelectStudent = function(userId, login, el) {
        document.querySelectorAll('#admin-list-students .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        
        adminState.selectedUserId = userId;
        adminState.selectedUserEmail = `Étudiant: ${login}`;
        
        document.getElementById('admin-selected-user-email').textContent = adminState.selectedUserEmail;
        document.getElementById('admin-user-actions').style.display = 'flex';
    };

    async function handleAdminDeleteUser() {
        if (!adminState.selectedUserId) return;

        showDeleteConfirmation(
            `ADMIN: Êtes-vous sûr de vouloir supprimer l'utilisateur ${adminState.selectedUserEmail} et TOUTES ses données associées ?`,
            async () => {
                try {
                    const response = await fetch(`${API_URL}/api/admin/user/${adminState.selectedUserId}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    if (!response.ok) throw new Error("Erreur lors de la suppression");
                    
                    showCustomAlert("Succès", "Utilisateur supprimé.");
                    loadAdminStructure(); 
                } catch (err) {
                    showCustomAlert("Erreur", err.message);
                }
            }
        );
    }

    async function loadAdminPatients() {
        const tbody = document.getElementById('admin-patients-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Chargement...</td></tr>';

        try {
            const response = await fetch(`${API_URL}/api/admin/patients`, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error("Impossible de charger les patients");
            const patients = await response.json();

            if (patients.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Aucun dossier trouvé.</td></tr>';
                return;
            }

            let html = '';
            patients.forEach(p => {
                const creator = p.user ? (p.user.email || p.user.login || 'Inconnu') : 'Supprimé';
                const isPublic = p.isPublic;
                
                html += `
                    <tr class="bg-white border-b hover:bg-gray-50">
                        <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                            ${isPublic ? '<i class="fas fa-globe text-yellow-500 mr-2" title="Public"></i>' : ''}
                            ${p.sidebar_patient_name}
                        </td>
                        <td class="px-6 py-4">${creator}</td>
                        <td class="px-6 py-4 text-center">
                            <label class="inline-flex relative items-center cursor-pointer">
                                <input type="checkbox" class="sr-only peer toggle-checkbox" 
                                       onchange="handleAdminTogglePublic('${p.patientId}', this)" 
                                       ${isPublic ? 'checked' : ''}>
                                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 toggle-label"></div>
                            </label>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <button class="font-medium text-red-600 hover:underline" onclick="handleAdminDeletePatient('${p.patientId}', '${p.sidebar_patient_name}')">
                                <i class="fas fa-trash"></i> Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">${err.message}</td></tr>`;
        }
    }

    window.handleAdminTogglePublic = async function(patientId, checkbox) {
        const originalState = !checkbox.checked; 
        try {
            const response = await fetch(`${API_URL}/api/admin/patients/${patientId}/public`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error("Erreur update");
        } catch (err) {
            checkbox.checked = originalState;
            showCustomAlert("Erreur", "Impossible de changer le statut public.");
        }
    };

    window.handleAdminDeletePatient = function(patientId, name) {
        showDeleteConfirmation(
            `ADMIN: Supprimer définitivement le dossier "${name}" ?`,
            async () => {
                try {
                    const response = await fetch(`${API_URL}/api/admin/patients/${patientId}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    if (!response.ok) throw new Error("Erreur suppression");
                    loadAdminPatients(); 
                } catch (err) {
                    showCustomAlert("Erreur", err.message);
                }
            }
        );
    };


    // --- CHARGEMENT DONNÉES COMPTE (CLASSIQUE) ---

    async function loadAccountDetails() {
        document.getElementById('tab-invitations').style.display = 'none';
        document.getElementById('tab-centre').style.display = 'none';

        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];

            const response = await fetch(`${API_URL}/api/account/details`, { headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Impossible de charger les détails.");

            const data = await response.json();
            currentUserEmail = data.email;

            // MODIFIÉ : Vérification basée sur le flag is_super_admin
            if (data.is_super_admin) {
                initAdminInterface();
            }

            const planNameEl = document.getElementById('current-plan-name');
            const planDescEl = document.getElementById('plan-description');
            let displayPlan = data.plan;

            if (data.role === 'formateur' && data.organisation) {
                displayPlan = data.organisation.plan;
                planNameEl.textContent = `Plan ${displayPlan} (via ${data.organisation.name})`;
                planDescEl.textContent = `Vous êtes rattaché en tant que formateur.`;
                document.getElementById('tab-invitations').style.display = 'flex';
                renderStudentTable(data.students || []);

            } else if (data.role === 'owner' && data.organisation) {
                displayPlan = data.organisation.plan;
                planNameEl.textContent = `Plan ${displayPlan} (Propriétaire)`;
                planDescEl.textContent = `Vous gérez l'abonnement pour "${data.organisation.name}".`;
                document.getElementById('tab-invitations').style.display = 'flex';
                document.getElementById('tab-centre').style.display = 'flex';
                renderStudentTable(data.students || []);
                renderCentreDetails(data.organisation);

            } else {
                displayPlan = data.plan;
                studentCount = data.students ? data.students.length : 0;
                if (displayPlan === 'promo') {
                    planNameEl.textContent = "Promo (Formateur)";
                    planDescEl.textContent = `Vous pouvez inviter jusqu'à 40 étudiants (${studentCount} / 40).`;
                    document.getElementById('tab-invitations').style.display = 'flex';
                } else if (displayPlan === 'independant') {
                    planNameEl.textContent = "Indépendant";
                    planDescEl.textContent = `Sauvegardes illimitées, et jusqu'à 5 étudiants (${studentCount} / 5).`;
                    document.getElementById('tab-invitations').style.display = 'flex';
                } else {
                    planNameEl.textContent = "Free";
                    planDescEl.textContent = "Fonctionnalités de base, aucune sauvegarde de données.";
                }
                if (displayPlan !== 'free') renderStudentTable(data.students || []);
            }

            currentPlan = displayPlan;
            updateSubscriptionButtons(displayPlan, data.organisation?.quote_url, data.organisation?.quote_price);

        } catch (err) {
            console.error(err);
            showCustomAlert("Erreur", "Impossible de joindre le serveur. " + err.message);
        }
    }

    function updateSubscriptionButtons(activePlan, quoteUrl, quotePrice) {
        const buttons = {
            'free': document.getElementById('sub-btn-free'),
            'independant': document.getElementById('sub-btn-independant'),
            'promo': document.getElementById('sub-btn-promo'),
            'centre': document.getElementById('sub-btn-centre')
        };

        const styles = {
            'free': { badge: ['bg-yellow-300', 'text-yellow-800'], border: 'border-yellow-300' },
            'independant': { badge: ['bg-teal-600', 'text-white'], border: 'border-teal-600' },
            'promo': { badge: ['bg-blue-600', 'text-white'], border: 'border-blue-600' },
            'centre': { badge: ['bg-indigo-600', 'text-white'], border: 'border-indigo-600' }
        };
        
        Object.keys(buttons).forEach(plan => {
            const btn = buttons[plan];
            if(!btn) return;
            const card = btn.closest('.card');
            const badge = card.querySelector('.js-active-plan-badge');

            card.classList.remove('shadow-xl', 'border-2', styles[plan].border);
            card.classList.add('hover:scale-[1.02]', 'hover:shadow-xl');
            
            badge.classList.add('hidden');
            badge.classList.remove(...styles[plan].badge);

            btn.disabled = false;
            btn.innerHTML = 'Choisir ce plan';
            btn.className = btn.className.replace(/cursor-not-allowed|bg-.*-100|text-.*-800|opacity-75/g, ''); 
            
            if (plan === 'centre') {
                 btn.classList.add('bg-gray-200', 'text-gray-700');
                 btn.classList.remove('bg-indigo-600', 'text-white');
            } else {
                 btn.classList.remove('cursor-not-allowed');
            }
        });

        if (buttons[activePlan]) {
            const btn = buttons[activePlan];
            const card = btn.closest('.card');
            const badge = card.querySelector('.js-active-plan-badge');
            const planStyle = styles[activePlan];
            
            card.classList.add('shadow-xl', 'border-2', planStyle.border);
            card.classList.remove('hover:scale-[1.02]', 'hover:shadow-xl');
            
            badge.classList.remove('hidden');
            badge.classList.add(...planStyle.badge);
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i> Plan actuel';
            btn.classList.add('cursor-not-allowed', 'opacity-75');
        }
        
        const centerBtn = buttons['centre'];
        if(activePlan === 'centre' && quoteUrl) {
             centerBtn.innerHTML = `Activer devis (${quotePrice})`;
             centerBtn.onclick = () => window.location.href = quoteUrl;
             centerBtn.disabled = false;
             centerBtn.classList.remove('cursor-not-allowed', 'opacity-75');
        } else if (activePlan !== 'centre') {
             centerBtn.onclick = () => switchTab('contact');
        }
    }

    // MODIFIÉ : Fonction mise à jour pour gérer l'affichage des invitations ET la sécurité du loading
    function renderCentreDetails(organisation) {
        document.getElementById('centre-plan-name').textContent = `Plan ${organisation.plan} ("${organisation.name}")`;
        document.getElementById('centre-plan-details').textContent = `Licences formateur utilisées : ${organisation.licences_utilisees} / ${organisation.licences_max || 'Illimitées'}`;
        
        const listContainer = document.getElementById('formateurs-list-container');
        
        // Protection contre l'erreur "Cannot read properties of null (reading 'style')"
        const loadingEl = document.getElementById('formateurs-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }

        let html = '';

        // 1. Affichage des invitations en attente
        if (organisation.invitations && organisation.invitations.length > 0) {
            html += `<div class="mb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Invitations en attente</h4>
                <div class="space-y-2">`;
            
            html += organisation.invitations.map(inv => `
                <div class="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div class="flex items-center">
                        <i class="fas fa-clock text-yellow-500 mr-2"></i>
                        <div>
                            <span class="text-sm font-medium text-gray-700 block">${inv.email}</span>
                            <span class="text-xs text-gray-500">Envoyée le ${new Date(inv.expires_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <button type="button" class="delete-invitation-btn text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors" data-id="${inv._id}" data-email="${inv.email}">
                        <i class="fas fa-times mr-1"></i> Annuler
                    </button>
                </div>
            `).join('');
            
            html += `</div></div>`;
        }

        // 2. Affichage des formateurs actifs
        html += `<h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Formateurs actifs</h4>`;
        
        if (!organisation.formateurs || organisation.formateurs.length === 0) {
            html += '<p class="text-sm text-gray-500 italic">Aucun formateur actif.</p>';
        } else {
            html += `<div class="space-y-2">` + organisation.formateurs.map(f => `
                <div class="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-200">
                    <div class="flex items-center">
                        <i class="fas fa-user-check text-teal-600 mr-2"></i>
                        <span class="text-sm font-medium text-gray-700">${f.email}</span>
                    </div>
                    <button type="button" class="remove-formateur-btn text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors" data-email="${f.email}">
                        <i class="fas fa-trash mr-1"></i> Retirer
                    </button>
                </div>
            `).join('') + `</div>`;
        }
        
        listContainer.innerHTML = html;
    }

    function renderStudentTable(students) {
        const tbody = document.getElementById('permissions-tbody');
        document.getElementById('student-list-title').textContent = `Gestion des étudiants (${students.length})`;
        
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

    // --- HANDLERS ---

    function generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    async function handleInviteFormateur(e) {
        e.preventDefault();
        const email = document.getElementById('invite-email').value;
        try {
            const response = await fetch(`${API_URL}/api/organisation/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }) });
            if (!response.ok) throw new Error((await response.json()).error);
            showCustomAlert("Succès", "Invitation envoyée.");
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }

    async function handleCreateStudent(e) {
        e.preventDefault();
        const login = document.getElementById('student-login').value;
        const password = document.getElementById('student-password').value;
        if(currentPlan === 'independant' && studentCount >= 5) return showCustomAlert("Limite", "5 étudiants max.");
        if(currentPlan === 'promo' && studentCount >= 40) return showCustomAlert("Limite", "40 étudiants max.");

        try {
            const response = await fetch(`${API_URL}/api/account/invite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ login, password }) });
            if (!response.ok) throw new Error((await response.json()).error);
            showCustomAlert("Succès", `Étudiant ${login} créé.`);
            document.getElementById('create-student-form').reset();
            loadAccountDetails();
        } catch (err) { showCustomAlert("Erreur", err.message); }
    }

    async function handleDeleteAccount() {
        showDeleteConfirmation("Supprimer définitivement votre compte ?", async () => {
            try {
                const response = await fetch(`${API_URL}/api/account/delete`, { method: 'DELETE', headers: getAuthHeaders() });
                if (!response.ok) throw new Error("Erreur");
                localStorage.clear();
                window.location.href = 'auth.html';
            } catch (err) { showCustomAlert("Erreur", err.message); }
        });
    }

    // --- GESTION MODALE CHAMBRES (RESTAURÉE) ---

    function hideRoomModal() {
        roomModalBox.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            roomModal.classList.add('hidden');
        }, 200);
    }

    function handleOpenRoomModal(button) {
        const login = button.dataset.login;
        const name = button.dataset.name;
        const rooms = JSON.parse(button.dataset.rooms || '[]');

        roomModalTitle.textContent = `Gérer les chambres pour ${name}`;
        roomModalLoginInput.value = login;

        let roomCheckboxesHTML = '';
        for (let i = 101; i <= 110; i++) {
            const roomId = `chambre_${i}`;
            const isChecked = rooms.includes(roomId);
            roomCheckboxesHTML += `
                <label class="flex items-center space-x-2 p-2 border rounded-md ${isChecked ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50'
                } cursor-pointer hover:bg-gray-100 transition-colors">
                    <input type="checkbox" name="room" value="${roomId}" ${isChecked ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4">
                    <span class="font-medium text-sm">${i}</span>
                </label>
            `;
        }
        roomModalList.innerHTML = roomCheckboxesHTML;

        roomModal.classList.remove('hidden');
        setTimeout(() => {
            roomModalBox.classList.remove('scale-95', 'opacity-0');
        }, 10);
    }

    async function handleSaveStudentRooms(e) {
        e.preventDefault();

        const login = roomModalLoginInput.value;
        const selectedRooms = Array.from(roomModalForm.querySelectorAll('input[name="room"]:checked'))
            .map(cb => cb.value);

        try {
            const headers = getAuthHeaders();
            const response = await fetch(`${API_URL}/api/account/student/rooms`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({ login: login, rooms: selectedRooms })
            });

            if (handleAuthError(response)) return;
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Erreur lors de la mise à jour");
            }

            // Mettre à jour le bouton dans le tableau
            const button = document.querySelector(`.manage-rooms-btn[data-login="${login}"]`);
            if (button) {
                button.textContent = `Gérer (${selectedRooms.length}/10)`;
                button.dataset.rooms = JSON.stringify(selectedRooms);
            }

            hideRoomModal();

        } catch (err) {
            showCustomAlert("Erreur", err.message);
        }
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

        // Initialisation références modale chambres
        roomModal = document.getElementById('room-modal');
        roomModalBox = document.getElementById('room-modal-box');
        roomModalForm = document.getElementById('room-modal-form');
        roomModalList = document.getElementById('room-modal-list');
        roomModalTitle = document.getElementById('room-modal-title');
        roomModalLoginInput = document.getElementById('room-modal-login');

        // Écouteurs modale chambres
        document.getElementById('room-modal-cancel').addEventListener('click', hideRoomModal);
        roomModalForm.addEventListener('submit', handleSaveStudentRooms);

        // Autres écouteurs
        document.getElementById('change-password-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const cur = document.getElementById('current-password').value;
            const neu = document.getElementById('new-password').value;
            const conf = document.getElementById('confirm-password').value;
            if(neu !== conf) return showCustomAlert("Erreur", "Mots de passe différents");
            try {
                const res = await fetch(`${API_URL}/api/account/change-password`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ currentPassword: cur, newPassword: neu }) });
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

        // MODIFIÉ : Écouteurs Tableaux (Délégation) avec gestion de la suppression des invitations
        document.getElementById('formateurs-list-container').addEventListener('click', async (e) => {
            // Cas 1 : Retirer un formateur actif
            const removeBtn = e.target.closest('.remove-formateur-btn');
            if (removeBtn) {
                const email = removeBtn.dataset.email;
                showDeleteConfirmation(`Retirer le formateur ${email} du centre ?\nIl repassera en compte "Free" indépendant.`, async () => {
                    try {
                        await fetch(`${API_URL}/api/organisation/remove`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }) });
                        loadAccountDetails();
                        showCustomAlert("Succès", "Formateur retiré.");
                    } catch (err) { showCustomAlert("Erreur", "Impossible de retirer le formateur."); }
                });
                return;
            }

            // Cas 2 : Annuler une invitation (NOUVEAU)
            const deleteInviteBtn = e.target.closest('.delete-invitation-btn');
            if (deleteInviteBtn) {
                const id = deleteInviteBtn.dataset.id;
                const email = deleteInviteBtn.dataset.email;
                
                if(!confirm(`Annuler l'invitation pour ${email} ?`)) return;

                try {
                    const res = await fetch(`${API_URL}/api/organisation/invite/${id}`, { 
                        method: 'DELETE', 
                        headers: getAuthHeaders() 
                    });
                    
                    if (!res.ok) throw new Error();
                    
                    // Recharger pour mettre à jour la liste
                    loadAccountDetails();
                } catch (err) {
                    showCustomAlert("Erreur", "Impossible d'annuler l'invitation.");
                }
            }
        });

        document.getElementById('permissions-tbody').addEventListener('change', async (e) => {
            if(e.target.type === 'checkbox') {
                const { login, permission } = e.target.dataset;
                try {
                    await fetch(`${API_URL}/api/account/permissions`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ login, permission, value: e.target.checked }) });
                } catch(err) { e.target.checked = !e.target.checked; }
            }
        });

        document.getElementById('permissions-tbody').addEventListener('click', async (e) => {
            // Supprimer étudiant
            if(e.target.closest('.delete-student-btn')) {
                const login = e.target.closest('.delete-student-btn').dataset.login;
                showDeleteConfirmation(`Supprimer étudiant ${login} ?`, async () => {
                    await fetch(`${API_URL}/api/account/student`, { method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ login }) });
                    loadAccountDetails();
                });
                return;
            }
            
            // Gérer les chambres (Bouton restauré)
            const manageRoomsBtn = e.target.closest('.manage-rooms-btn');
            if (manageRoomsBtn) {
                handleOpenRoomModal(manageRoomsBtn);
            }
        });

        loadAccountDetails();
        switchTab('security');
    }

    document.addEventListener('DOMContentLoaded', init);

})();