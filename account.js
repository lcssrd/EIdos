(function () {
    "use strict";

    const API_URL = 'https://eidos-api.onrender.com';
    const ADMIN_EMAIL = "lucas.seraudie@gmail.com"; // L'email du Super Admin

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
        selectedOrgId: null, // ou 'independants'
        selectedUserId: null,
        selectedUserEmail: null
    };

    function initAdminInterface() {
        const adminTabBtn = document.getElementById('tab-admin');
        const adminContent = document.getElementById('content-admin');
        
        // Dévoiler l'onglet
        adminTabBtn.style.display = 'flex';
        
        // Enregistrer les références
        tabButtons.admin = adminTabBtn;
        tabContents.admin = adminContent;

        // Écouteur sur le bouton
        adminTabBtn.addEventListener('click', () => {
            switchTab('admin');
            loadAdminStructure(); // Charger les données quand on clique
        });

        // Écouteurs Sous-onglets Admin
        document.querySelectorAll('#admin-tabs-nav button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Reset styles
                document.querySelectorAll('#admin-tabs-nav button').forEach(b => {
                    b.className = "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300";
                });
                document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

                // Activate current
                e.target.className = "inline-block p-4 border-b-2 rounded-t-lg hover:text-gray-600 hover:border-gray-300 active text-red-600 border-red-600";
                const targetId = e.target.dataset.target;
                document.getElementById(targetId).classList.remove('hidden');

                if (targetId === 'admin-patients') {
                    loadAdminPatients();
                }
            });
        });

        // Écouteur Suppression Utilisateur
        document.getElementById('admin-delete-user-btn').addEventListener('click', handleAdminDeleteUser);
        
        // Écouteur Rafraîchissement Patients
        document.getElementById('admin-refresh-patients').addEventListener('click', loadAdminPatients);
    }

    // --- COLONNES DE MILLER (ADMIN) ---

    async function loadAdminStructure() {
        try {
            const response = await fetch(`${API_URL}/api/admin/structure`, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error("Erreur chargement structure");
            const data = await response.json();
            
            adminState.organisations = data.organisations;
            adminState.independants = data.independants;
            
            renderAdminCol1();
            // Reset des autres colonnes
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

        // Groupe Indépendants
        html += `
            <div class="miller-item font-medium" onclick="handleAdminSelectOrg('independants', this)">
                <span><i class="fas fa-user-tie mr-2 text-teal-600"></i> Indépendants</span>
                <span class="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600">${adminState.independants.length}</span>
            </div>
        `;

        // Organisations
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
        // Highlight UI
        document.querySelectorAll('#admin-list-orgs .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');

        adminState.selectedOrgId = idOrType;
        const trainersContainer = document.getElementById('admin-list-trainers');
        trainersContainer.innerHTML = '<p class="p-4 text-sm text-gray-500">Chargement...</p>';
        document.getElementById('admin-list-students').innerHTML = ''; // Clear col 3
        document.getElementById('admin-user-actions').style.display = 'none';

        let usersToDisplay = [];

        if (idOrType === 'independants') {
            usersToDisplay = adminState.independants;
        } else {
            // Fetch formateurs du centre
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
        // Highlight UI
        document.querySelectorAll('#admin-list-trainers .miller-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');

        adminState.selectedUserId = userId;
        adminState.selectedUserEmail = userEmail;

        // Show Actions
        const actionPanel = document.getElementById('admin-user-actions');
        document.getElementById('admin-selected-user-email').textContent = userEmail;
        actionPanel.style.display = 'flex';

        // Load Students (Col 3)
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
                    loadAdminStructure(); // Reload full tree
                } catch (err) {
                    showCustomAlert("Erreur", err.message);
                }
            }
        );
    }

    // --- GESTION DOSSIERS PATIENTS (ADMIN) ---

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
        const originalState = !checkbox.checked; // Revert state if error
        try {
            const response = await fetch(`${API_URL}/api/admin/patients/${patientId}/public`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error("Erreur update");
            // Succès visuel (optionnel)
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
                    loadAdminPatients(); // Refresh
                } catch (err) {
                    showCustomAlert("Erreur", err.message);
                }
            }
        );
    };


    // --- CHARGEMENT DONNÉES COMPTE (CLASSIQUE) ---

    async function loadAccountDetails() {
        // Cacher les onglets conditionnels par défaut
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

            // --- LOGIQUE SUPER ADMIN ACTIVATION ---
            if (currentUserEmail === ADMIN_EMAIL) {
                initAdminInterface();
            }
            // --------------------------------------

            const planNameEl = document.getElementById('current-plan-name');
            const planDescEl = document.getElementById('plan-description');
            let displayPlan = data.plan;

            // Affichage classique
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

    // --- FONCTIONS UTILITAIRES UI (CORRIGÉ POUR LES BADGES) ---

    function updateSubscriptionButtons(activePlan, quoteUrl, quotePrice) {
        const buttons = {
            'free': document.getElementById('sub-btn-free'),
            'independant': document.getElementById('sub-btn-independant'),
            'promo': document.getElementById('sub-btn-promo'),
            'centre': document.getElementById('sub-btn-centre')
        };

        // Définition des styles pour les badges
        const styles = {
            'free': { badge: ['bg-yellow-300', 'text-yellow-800'], border: 'border-yellow-300' },
            'independant': { badge: ['bg-teal-600', 'text-white'], border: 'border-teal-600' },
            'promo': { badge: ['bg-blue-600', 'text-white'], border: 'border-blue-600' },
            'centre': { badge: ['bg-indigo-600', 'text-white'], border: 'border-indigo-600' }
        };
        
        // Reset all
        Object.keys(buttons).forEach(plan => {
            const btn = buttons[plan];
            if(!btn) return;
            const card = btn.closest('.card');
            const badge = card.querySelector('.js-active-plan-badge');

            // Reset card styles
            card.classList.remove('shadow-xl', 'border-2', styles[plan].border);
            card.classList.add('hover:scale-[1.02]', 'hover:shadow-xl');
            
            // Reset badge
            badge.classList.add('hidden');
            badge.classList.remove(...styles[plan].badge);

            // Reset button
            btn.disabled = false;
            btn.innerHTML = 'Choisir ce plan';
            btn.className = btn.className.replace(/cursor-not-allowed|bg-.*-100|text-.*-800|opacity-75/g, ''); 
            
            // Reset specific button styles (simple restoration)
            if (plan === 'centre') {
                 btn.classList.add('bg-gray-200', 'text-gray-700');
                 btn.classList.remove('bg-indigo-600', 'text-white');
            } else {
                 btn.classList.remove('cursor-not-allowed');
            }
        });

        // Active specific
        if (buttons[activePlan]) {
            const btn = buttons[activePlan];
            const card = btn.closest('.card');
            const badge = card.querySelector('.js-active-plan-badge');
            const planStyle = styles[activePlan];
            
            // Active card
            card.classList.add('shadow-xl', 'border-2', planStyle.border);
            card.classList.remove('hover:scale-[1.02]', 'hover:shadow-xl');
            
            // Active badge (CORRECTION APPLIQUÉE)
            badge.classList.remove('hidden');
            badge.classList.add(...planStyle.badge);
            
            // Active button
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i> Plan actuel';
            btn.classList.add('cursor-not-allowed', 'opacity-75');
        }
        
        // Centre Logic
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

    function renderCentreDetails(organisation) {
        document.getElementById('centre-plan-name').textContent = `Plan ${organisation.plan} ("${organisation.name}")`;
        document.getElementById('centre-plan-details').textContent = `Licences formateur utilisées : ${organisation.licences_utilisees} / ${organisation.licences_max || 'Illimitées'}`;
        
        const listContainer = document.getElementById('formateurs-list-container');
        document.getElementById('formateurs-loading').style.display = 'none';

        let html = '';
        if (!organisation.formateurs || organisation.formateurs.length === 0) {
            html = '<p class="text-sm text-gray-500">Vous n\'avez pas encore invité de formateur.</p>';
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

    // --- HANDLERS (IDENTIQUES + Modifications mineures) ---

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

    // --- INIT ---

    function init() {
        if (!getAuthToken()) return;

        // Tabs listeners
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

        // Forms listeners
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

        // Event delegation for dynamic tables
        document.getElementById('formateurs-list-container').addEventListener('click', async (e) => {
            if(e.target.closest('.remove-formateur-btn')) {
                const email = e.target.closest('.remove-formateur-btn').dataset.email;
                showDeleteConfirmation(`Retirer ${email} ?`, async () => {
                    await fetch(`${API_URL}/api/organisation/remove`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ email }) });
                    loadAccountDetails();
                });
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
            if(e.target.closest('.delete-student-btn')) {
                const login = e.target.closest('.delete-student-btn').dataset.login;
                showDeleteConfirmation(`Supprimer étudiant ${login} ?`, async () => {
                    await fetch(`${API_URL}/api/account/student`, { method: 'DELETE', headers: getAuthHeaders(), body: JSON.stringify({ login }) });
                    loadAccountDetails();
                });
            }
        });

        loadAccountDetails();
        switchTab('security');
    }

    document.addEventListener('DOMContentLoaded', init);

})();